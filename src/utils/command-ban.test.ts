import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '@/db/schema';
import { commandBans } from '@/db/schema';
import { checkCommandBan, isCommandBanAllowed } from '@/utils/command-ban';

test('alwaysAvailable commands ignore global bans in both groups and private chats', async t => {
    const configDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'saverbot-command-ban-'));
    const configPath = path.join(configDirectory, 'config.json');
    const previousConfigPath = process.env.CONFIG_PATH;
    fs.writeFileSync(
        configPath,
        JSON.stringify({
            napcat: {},
            command: { prefix: '/' },
            email: {},
            saver: {},
            aliyun: { accessKeyId: 'test-id', accessKeySecret: 'test-secret' },
            antiSpam: {},
            qa: {},
            webhook: {}
        })
    );
    process.env.CONFIG_PATH = configPath;
    t.after(() => {
        if (previousConfigPath === undefined) delete process.env.CONFIG_PATH;
        else process.env.CONFIG_PATH = previousConfigPath;
        fs.rmSync(configDirectory, { recursive: true, force: true });
    });
    const { EmbeddingCommand } = await import('@/commands/embedding');

    const sqlite = new Database(':memory:');
    t.after(() => sqlite.close());
    sqlite.exec(`
        CREATE TABLE command_bans (
            id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
            user_id INTEGER NOT NULL,
            command_name TEXT NOT NULL,
            scope_type TEXT NOT NULL,
            scope_id INTEGER,
            banned_by INTEGER NOT NULL,
            banned_at INTEGER NOT NULL,
            reason TEXT
        );
        CREATE UNIQUE INDEX command_bans_user_command_scope_unique
            ON command_bans (user_id, command_name, scope_type, scope_id);
    `);
    const database = drizzle(sqlite, { schema });
    await database.insert(commandBans).values({
        userId: 7,
        commandName: 'embedding',
        scopeType: 'global',
        scopeId: null,
        bannedBy: 1,
        bannedAt: 1_000,
        reason: 'legacy global ban'
    });

    const command = new EmbeddingCommand();
    assert.equal(command.alwaysAvailable, true);
    assert.equal(isCommandBanAllowed(command), false);
    assert.deepEqual(await checkCommandBan({ userId: 7, groupId: 100, superUser: false }, command, database), {
        banned: false
    });
    assert.deepEqual(await checkCommandBan({ userId: 7, groupId: null, superUser: false }, command, database), {
        banned: false
    });
});

test('ordinary commands remain subject to the same global ban in groups and private chats', async t => {
    const sqlite = new Database(':memory:');
    t.after(() => sqlite.close());
    sqlite.exec(`
        CREATE TABLE command_bans (
            id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
            user_id INTEGER NOT NULL,
            command_name TEXT NOT NULL,
            scope_type TEXT NOT NULL,
            scope_id INTEGER,
            banned_by INTEGER NOT NULL,
            banned_at INTEGER NOT NULL,
            reason TEXT
        );
    `);
    const database = drizzle(sqlite, { schema });
    await database.insert(commandBans).values({
        userId: 7,
        commandName: 'qa',
        scopeType: 'global',
        scopeId: null,
        bannedBy: 1,
        bannedAt: 1_000,
        reason: 'blocked'
    });
    const command = { name: 'qa' };

    assert.deepEqual(await checkCommandBan({ userId: 7, groupId: 100, superUser: false }, command, database), {
        banned: true,
        reason: 'blocked'
    });
    assert.deepEqual(await checkCommandBan({ userId: 7, groupId: null, superUser: false }, command, database), {
        banned: true,
        reason: 'blocked'
    });
});
