import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '@/db/schema';
import { userMessageEmbeddingProfiles } from '@/db/schema';
import { MessageEmbeddingCommitQueue } from '@/helpers/message-embedding-queue';
import { recordMessageEmbedding } from '@/helpers/message-embedding';

type Deferred<T> = {
    promise: Promise<T>;
    resolve: (value: T) => void;
    reject: (reason?: unknown) => void;
};

function createDeferred<T>(): Deferred<T> {
    let resolveValue!: (value: T) => void;
    let rejectValue!: (reason?: unknown) => void;
    const promise = new Promise<T>((resolve, reject) => {
        resolveValue = resolve;
        rejectValue = reject;
    });
    return { promise, resolve: resolveValue, reject: rejectValue };
}

function decodeVector(buffer: Buffer): number[] {
    const values: number[] = [];
    for (let offset = 0; offset < buffer.byteLength; offset += Float32Array.BYTES_PER_ELEMENT) {
        values.push(buffer.readFloatLE(offset));
    }
    return values;
}

test('out-of-order embedding responses commit in arrival order for both group and user', async t => {
    const sqlite = new Database(':memory:');
    t.after(() => sqlite.close());
    sqlite.exec(`
        CREATE TABLE group_message_embedding_means (
            group_id INTEGER PRIMARY KEY NOT NULL,
            space_key TEXT NOT NULL,
            dimensions INTEGER NOT NULL,
            mean_vector BLOB NOT NULL,
            sample_count INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );
        CREATE TABLE user_message_embedding_profiles (
            user_id INTEGER PRIMARY KEY NOT NULL,
            space_key TEXT NOT NULL,
            dimensions INTEGER NOT NULL,
            feature_vector BLOB NOT NULL,
            effective_weight REAL NOT NULL,
            updated_at INTEGER NOT NULL
        );
        CREATE TABLE message_embedding_preferences (
            user_id INTEGER PRIMARY KEY NOT NULL,
            opted_out INTEGER NOT NULL,
            revision INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );
    `);
    const database = drizzle(sqlite, { schema });
    const queue = new MessageEmbeddingCommitQueue();
    const firstResponse = createDeferred<number[]>();
    const secondResponse = createDeferred<number[]>();
    const thirdResponse = createDeferred<number[]>();
    const started: string[] = [];
    const committed: string[] = [];
    const halfLifeMs = 1_000;

    const firstTask = queue.enqueue(
        100,
        1,
        () => {
            started.push('first');
            return firstResponse.promise;
        },
        embedding => {
            committed.push('first');
            recordMessageEmbedding(database, {
                groupId: 100,
                userId: 1,
                preferenceRevision: 0,
                embedding,
                spaceKey: 'test-space',
                timestamp: 1_000,
                decayHalfLifeMs: halfLifeMs
            });
        }
    );
    const secondTask = queue.enqueue(
        100,
        2,
        () => {
            started.push('second');
            return secondResponse.promise;
        },
        embedding => {
            committed.push('second');
            recordMessageEmbedding(database, {
                groupId: 100,
                userId: 2,
                preferenceRevision: 0,
                embedding,
                spaceKey: 'test-space',
                timestamp: 2_000,
                decayHalfLifeMs: halfLifeMs
            });
        }
    );
    const thirdTask = queue.enqueue(
        200,
        2,
        () => {
            started.push('third');
            return thirdResponse.promise;
        },
        embedding => {
            committed.push('third');
            recordMessageEmbedding(database, {
                groupId: 200,
                userId: 2,
                preferenceRevision: 0,
                embedding,
                spaceKey: 'test-space',
                timestamp: 3_000,
                decayHalfLifeMs: halfLifeMs
            });
        }
    );

    assert.deepEqual(started, ['first', 'second', 'third']);
    thirdResponse.resolve([10]);
    secondResponse.resolve([2]);
    await Promise.resolve();
    assert.deepEqual(committed, []);

    firstResponse.resolve([0]);
    await Promise.all([firstTask, secondTask, thirdTask]);
    assert.deepEqual(committed, ['first', 'second', 'third']);

    const userTwo = database
        .select()
        .from(userMessageEmbeddingProfiles)
        .where(eq(userMessageEmbeddingProfiles.userId, 2))
        .get();
    assert.ok(userTwo);
    assert.ok(Math.abs(decodeVector(userTwo.featureVector)[0] - 1 / 3) < 1e-6);
});

test('a fast failed response cannot release later commits before a slow predecessor', async () => {
    const queue = new MessageEmbeddingCommitQueue();
    const firstResponse = createDeferred<string>();
    const failure = new Error('second embedding failed');
    const started: string[] = [];
    const committed: string[] = [];

    const firstTask = queue.enqueue(
        100,
        1,
        () => {
            started.push('first');
            return firstResponse.promise;
        },
        value => {
            committed.push(value);
        }
    );
    const secondTask = queue.enqueue(
        100,
        2,
        () => {
            started.push('second');
            return Promise.reject(failure);
        },
        value => {
            committed.push(value);
        }
    );
    const thirdTask = queue.enqueue(
        100,
        3,
        () => {
            started.push('third');
            return Promise.resolve('third');
        },
        value => {
            committed.push(value);
        }
    );
    let secondSettled = false;
    const observedSecondTask = secondTask.then(
        () => 'resolved' as const,
        error => {
            assert.equal(error, failure);
            secondSettled = true;
            return 'rejected' as const;
        }
    );

    await new Promise<void>(resolve => setImmediate(resolve));
    assert.deepEqual(started, ['first', 'second', 'third']);
    assert.deepEqual(committed, []);
    assert.equal(secondSettled, false);

    firstResponse.resolve('first');
    const [, secondOutcome] = await Promise.all([firstTask, observedSecondTask, thirdTask]);
    assert.equal(secondOutcome, 'rejected');
    assert.deepEqual(committed, ['first', 'third']);
});
