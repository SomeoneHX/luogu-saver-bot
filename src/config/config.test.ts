import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ConfigLoader } from '@/config/loader';
import { GroupSchema } from '@/config/schemas/group';
import { isGroupEnabled } from '@/utils/group-policy';
import { resolveQqLevel } from '@/utils/qq-profile';
import { listChangedConfigPaths, preserveRestartRequiredConfig } from '@/config/reload';
import { evaluateGroupReview } from '@/utils/group-review';

test('group config defaults preserve existing behavior', () => {
    const group = GroupSchema.parse({});

    assert.equal(group.autoReviewEnabled, true);
    assert.deepEqual(group.autoApproveKeywords, []);
    assert.equal(group.autoApproveMinQqLevel, 0);
    assert.equal(group.enabledGroupIds, null);
});

test('configured group IDs act as a strict allowlist', () => {
    assert.equal(isGroupEnabled(100, null), true);
    assert.equal(isGroupEnabled(100, []), false);
    assert.equal(isGroupEnabled(100, [100, 200]), true);
    assert.equal(isGroupEnabled(300, [100, 200]), false);
});

test('QQ level parser accepts NapCat response variants', () => {
    assert.equal(resolveQqLevel({ qqLevel: 42 }), 42);
    assert.equal(resolveQqLevel({ qq_level: '31' }), 31);
    assert.equal(resolveQqLevel({ level: 'LV. 20' }), 20);
    assert.equal(resolveQqLevel({ level: 'unknown' }), null);
});

test('automatic group review requires both a keyword and the configured QQ level', () => {
    assert.equal(evaluateGroupReview('wrong answer', ['invite-code'], 20, 30), 'keyword-mismatch');
    assert.equal(evaluateGroupReview('invite-code', ['invite-code'], 20, null), 'qq-level-unavailable');
    assert.equal(evaluateGroupReview('invite-code', ['invite-code'], 20, 19), 'qq-level-too-low');
    assert.equal(evaluateGroupReview('invite-code', ['invite-code'], 20, 20), 'approve');
    assert.equal(evaluateGroupReview('invite-code', ['invite-code'], 0, null), 'approve');
});

test('config reload retains values that require a restart', () => {
    const previous = {
        napcat: { url: 'ws://old', token: 'old-token' },
        webhook: { host: '127.0.0.1', port: 3000 },
        command: { prefix: '/' }
    };
    const candidate = {
        napcat: { url: 'ws://new', token: 'new-token' },
        webhook: { host: '0.0.0.0', port: 4000 },
        command: { prefix: '!' }
    };

    assert.deepEqual(preserveRestartRequiredConfig(previous, candidate), [
        'napcat.url',
        'napcat.token',
        'webhook.host',
        'webhook.port'
    ]);
    assert.deepEqual(candidate.napcat, previous.napcat);
    assert.deepEqual(candidate.webhook, previous.webhook);
    assert.deepEqual(listChangedConfigPaths(previous, candidate), ['command.prefix']);
});

test('ConfigLoader reloads valid files and keeps its last snapshot after a validation error', t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'saverbot-config-'));
    const configPath = path.join(directory, 'config.json');
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

    const baseConfig = {
        napcat: {},
        command: { prefix: '/' },
        email: {},
        saver: {},
        aliyun: { accessKeyId: 'test-id', accessKeySecret: 'test-secret' },
        antiSpam: {},
        qa: {},
        webhook: {}
    };
    fs.writeFileSync(configPath, JSON.stringify(baseConfig));

    const loader = new ConfigLoader(configPath);
    assert.equal(loader.load().command.prefix, '/');

    fs.writeFileSync(configPath, JSON.stringify({ ...baseConfig, command: { prefix: '!' } }));
    assert.equal(loader.reload().command.prefix, '!');

    fs.writeFileSync(configPath, JSON.stringify({ ...baseConfig, command: { prefix: 123 } }));
    assert.throws(() => loader.reload());
    assert.equal(loader.load().command.prefix, '!');
});

test('reloadConfig atomically applies dynamic fields and retains restart-only fields', async t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'saverbot-live-config-'));
    const configPath = path.join(directory, 'config.json');
    const previousConfigPath = process.env.CONFIG_PATH;
    t.after(() => {
        if (previousConfigPath === undefined) delete process.env.CONFIG_PATH;
        else process.env.CONFIG_PATH = previousConfigPath;
        fs.rmSync(directory, { recursive: true, force: true });
    });

    const baseConfig = {
        napcat: { url: 'ws://old' },
        command: { prefix: '/' },
        email: {},
        saver: {},
        aliyun: { accessKeyId: 'test-id', accessKeySecret: 'test-secret' },
        antiSpam: {},
        qa: {},
        webhook: {}
    };
    fs.writeFileSync(configPath, JSON.stringify(baseConfig));
    process.env.CONFIG_PATH = configPath;

    const configModule = await import('@/config/index');
    let listenerChangedPaths: string[] = [];
    const unsubscribe = configModule.onConfigReload(event => {
        listenerChangedPaths = event.changedPaths;
    });
    t.after(unsubscribe);

    fs.writeFileSync(
        configPath,
        JSON.stringify({ ...baseConfig, napcat: { url: 'ws://new' }, command: { prefix: '!' } })
    );
    const result = configModule.reloadConfig();
    assert.ok(result);
    assert.equal(configModule.config.command.prefix, '!');
    assert.equal(configModule.config.napcat.url, 'ws://old');
    assert.deepEqual(listenerChangedPaths, ['command.prefix']);

    fs.writeFileSync(configPath, JSON.stringify({ ...baseConfig, command: { prefix: 123 } }));
    assert.equal(configModule.reloadConfig(), null);
    assert.equal(configModule.config.command.prefix, '!');
});
