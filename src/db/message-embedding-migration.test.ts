import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { z } from 'zod';
import Database from 'better-sqlite3';

function readMigration(name: string): string {
    return fs.readFileSync(`drizzle/${name}.sql`, 'utf8').replaceAll('--> statement-breakpoint', '');
}

test('embedding preference migration preserves opt-outs and enables reversible state', t => {
    const sqlite = new Database(':memory:');
    t.after(() => sqlite.close());
    sqlite.exec(readMigration('0007_message_embedding_profiles'));
    sqlite.prepare('INSERT INTO message_embedding_opt_outs (user_id, opted_out_at) VALUES (?, ?)').run(7, 3_000);

    sqlite.exec(readMigration('0008_embedding_preferences'));
    const tableRows = sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all();
    const tables = tableRows.map(row => {
        if (typeof row !== 'object' || row === null || !('name' in row) || typeof row.name !== 'string') {
            throw new Error('SQLite returned an invalid table row.');
        }
        return row.name;
    });
    assert.deepEqual(tables, [
        'group_message_embedding_means',
        'message_embedding_preferences',
        'user_message_embedding_profiles'
    ]);
    assert.deepEqual(
        sqlite
            .prepare(
                'SELECT user_id, opted_out, revision, updated_at FROM message_embedding_preferences WHERE user_id = ?'
            )
            .get(7),
        { user_id: 7, opted_out: 1, revision: 1, updated_at: 3_000 }
    );
});

test('migration journal references only committed embedding migrations', () => {
    const JournalSchema = z.object({
        entries: z.array(z.object({ tag: z.string() }))
    });
    const journal = JournalSchema.parse(JSON.parse(fs.readFileSync('drizzle/meta/_journal.json', 'utf8')));
    assert.deepEqual(
        journal.entries.map(entry => entry.tag),
        ['0007_message_embedding_profiles', '0008_embedding_preferences']
    );
    for (const entry of journal.entries) {
        assert.equal(fs.existsSync(`drizzle/${entry.tag}.sql`), true);
    }
});
