import path from 'path';
import fs from 'fs';
import { ConfigLoader } from './loader';
import { logger } from '../utils/logger';
import { listChangedConfigPaths, preserveRestartRequiredConfig } from '@/config/reload';
import type { AppConfig } from './schemas';

const CONFIG_RELOAD_DEBOUNCE_MS = 300;
const CONFIG_WATCH_RETRY_INITIAL_MS = 1_000;
const CONFIG_WATCH_RETRY_MAX_MS = 30_000;
const CONFIG_WATCH_STABLE_MS = 30_000;

function findConfigPath(): string {
    if (process.env.CONFIG_PATH) {
        return path.resolve(process.env.CONFIG_PATH);
    }

    const candidates: string[] = [];

    candidates.push(path.resolve(process.cwd(), 'config.yml'));
    candidates.push(path.resolve(process.cwd(), 'config', 'config.yml'));

    if (process.argv && process.argv[1]) {
        const execDir = path.dirname(process.argv[1]);
        candidates.push(path.resolve(execDir, 'config.yml'));
        candidates.push(path.resolve(execDir, '../config.yml'));
        candidates.push(path.resolve(execDir, '../../config.yml'));
    }

    let dir = process.cwd();
    while (true) {
        candidates.push(path.join(dir, 'config.yml'));
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
    }

    const seen = new Set<string>();
    for (const c of candidates) {
        const p = path.normalize(c);
        if (seen.has(p)) continue;
        seen.add(p);
        try {
            if (fs.existsSync(p) && fs.statSync(p).isFile()) {
                logger.info(`Found config file at: ${p}`);
                return p;
            }
        } catch (err) {}
    }

    throw new Error('Oh my baby god, where is the config file? Searched at: \n' + Array.from(seen).join('\n'));
}

const CONFIG_PATH = findConfigPath();

const loader = new ConfigLoader(CONFIG_PATH);
export let config = loader.load();

export type ConfigReloadEvent = {
    previous: AppConfig;
    current: AppConfig;
    changedPaths: string[];
};

type ConfigReloadListener = (event: ConfigReloadEvent) => void;

const configReloadListeners = new Set<ConfigReloadListener>();
let configWatcher: fs.FSWatcher | null = null;
let reloadTimer: NodeJS.Timeout | null = null;
let watcherRetryTimer: NodeJS.Timeout | null = null;
let watcherStabilityTimer: NodeJS.Timeout | null = null;
let watcherRetryDelayMs = CONFIG_WATCH_RETRY_INITIAL_MS;

export function onConfigReload(listener: ConfigReloadListener): () => void {
    configReloadListeners.add(listener);
    return () => configReloadListeners.delete(listener);
}

export function reloadConfig(): ConfigReloadEvent | null {
    const previous = config;
    try {
        const candidate = loader.reload();
        const restartRequiredPaths = preserveRestartRequiredConfig(previous, candidate);
        const changedPaths = listChangedConfigPaths(previous, candidate);

        if (restartRequiredPaths.length > 0) {
            logger.warn(
                `Configuration changes require a restart and were not applied: ${restartRequiredPaths.join(', ')}`
            );
        }
        if (changedPaths.length === 0) {
            return { previous, current: previous, changedPaths };
        }

        config = candidate;
        const event = { previous, current: candidate, changedPaths };
        for (const listener of configReloadListeners) {
            try {
                listener(event);
            } catch (error) {
                logger.error('A configuration reload listener failed.', error);
            }
        }
        logger.info(`Configuration reloaded; applied fields: ${changedPaths.join(', ')}`);
        return event;
    } catch {
        logger.error('Configuration reload failed; keeping the previous valid configuration.');
        return null;
    }
}

export function startConfigReloadWatcher(): void {
    if (configWatcher) return;

    const configDirectory = path.dirname(CONFIG_PATH);
    const configFileName = path.basename(CONFIG_PATH).toLowerCase();
    try {
        const watcher = fs.watch(configDirectory, (_eventType, fileName) => {
            if (fileName && path.basename(fileName.toString()).toLowerCase() !== configFileName) return;
            if (reloadTimer) clearTimeout(reloadTimer);
            reloadTimer = setTimeout(() => {
                reloadTimer = null;
                reloadConfig();
            }, CONFIG_RELOAD_DEBOUNCE_MS);
        });
        configWatcher = watcher;
        watcher.on('error', error => handleConfigWatcherFailure(watcher, error));
        watcher.on('close', () => {
            if (configWatcher !== watcher) return;
            configWatcher = null;
            clearWatcherStabilityTimer();
            scheduleConfigWatcherRestart();
        });
        clearWatcherStabilityTimer();
        watcherStabilityTimer = setTimeout(() => {
            watcherStabilityTimer = null;
            if (configWatcher === watcher) watcherRetryDelayMs = CONFIG_WATCH_RETRY_INITIAL_MS;
        }, CONFIG_WATCH_STABLE_MS);
        watcherStabilityTimer.unref();
    } catch (error) {
        logger.error('Failed to start the configuration file watcher.', error);
        scheduleConfigWatcherRestart();
        return;
    }
    logger.info(`Watching configuration file for changes: ${CONFIG_PATH}`);
}

function handleConfigWatcherFailure(watcher: fs.FSWatcher, error: Error): void {
    logger.error('Configuration file watcher failed.', error);
    if (configWatcher !== watcher) return;

    configWatcher = null;
    clearWatcherStabilityTimer();
    try {
        watcher.close();
    } catch {}
    scheduleConfigWatcherRestart();
}

function scheduleConfigWatcherRestart(): void {
    if (watcherRetryTimer) return;

    const delay = watcherRetryDelayMs;
    watcherRetryDelayMs = Math.min(watcherRetryDelayMs * 2, CONFIG_WATCH_RETRY_MAX_MS);
    logger.warn(`Restarting configuration file watcher in ${delay}ms.`);
    watcherRetryTimer = setTimeout(() => {
        watcherRetryTimer = null;
        startConfigReloadWatcher();
    }, delay);
}

function clearWatcherStabilityTimer(): void {
    if (!watcherStabilityTimer) return;
    clearTimeout(watcherStabilityTimer);
    watcherStabilityTimer = null;
}

export type { AppConfig } from './schemas';
