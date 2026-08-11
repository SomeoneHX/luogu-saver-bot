import { isDeepStrictEqual } from 'node:util';

export const RESTART_REQUIRED_CONFIG_PATHS = ['napcat.url', 'napcat.token', 'webhook.host', 'webhook.port'] as const;

type ConfigRecord = Record<string, unknown>;

function isRecord(value: unknown): value is ConfigRecord {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function readPath(root: ConfigRecord, configPath: string): unknown {
    return configPath.split('.').reduce<unknown>((current, segment) => {
        return isRecord(current) ? current[segment] : undefined;
    }, root);
}

function writePath(root: ConfigRecord, configPath: string, value: unknown): void {
    const segments = configPath.split('.');
    const leaf = segments.pop();
    if (!leaf) return;

    let current = root;
    for (const segment of segments) {
        const next = current[segment];
        if (!isRecord(next)) return;
        current = next;
    }
    current[leaf] = value;
}

function collectChangedPaths(previous: unknown, candidate: unknown, prefix: string, result: string[]): void {
    if (isDeepStrictEqual(previous, candidate)) return;
    if (!isRecord(previous) || !isRecord(candidate)) {
        if (prefix) result.push(prefix);
        return;
    }

    const keys = new Set([...Object.keys(previous), ...Object.keys(candidate)]);
    for (const key of keys) {
        collectChangedPaths(previous[key], candidate[key], prefix ? `${prefix}.${key}` : key, result);
    }
}

export function listChangedConfigPaths(previous: object, candidate: object): string[] {
    const result: string[] = [];
    collectChangedPaths(previous, candidate, '', result);
    return result.sort();
}

export function preserveRestartRequiredConfig(previous: object, candidate: object): string[] {
    const previousRecord = previous as ConfigRecord;
    const candidateRecord = candidate as ConfigRecord;
    const changedPaths = RESTART_REQUIRED_CONFIG_PATHS.filter(
        configPath => !isDeepStrictEqual(readPath(previousRecord, configPath), readPath(candidateRecord, configPath))
    );
    for (const configPath of changedPaths) {
        writePath(candidateRecord, configPath, readPath(previousRecord, configPath));
    }
    return [...changedPaths];
}
