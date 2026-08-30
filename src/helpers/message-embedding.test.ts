import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import * as schema from '@/db/schema';
import {
    calculateDecayedAverage,
    calculateStreamingMean,
    getGroupMessageEmbeddingSummary,
    getUserMessageEmbeddingSummary,
    getMessageEmbeddingPreference,
    isMessageEmbeddingOptedOut,
    optInMessageEmbedding,
    optOutMessageEmbedding,
    recordMessageEmbedding
} from '@/helpers/message-embedding';
import { groupMessageEmbeddingMeans, userMessageEmbeddingProfiles } from '@/db/schema';
import { EmbeddingSchema } from '@/config/schemas/embedding';
import { parseEmbeddingResponse } from '@/utils/embedding-client';
import { canViewMessageEmbeddingProfile } from '@/utils/embedding-profile-access';

function decodeVector(buffer: Buffer): number[] {
    const values: number[] = [];
    for (let offset = 0; offset < buffer.byteLength; offset += Float32Array.BYTES_PER_ELEMENT) {
        values.push(buffer.readFloatLE(offset));
    }
    return values;
}

test('embedding config defaults to an unconfigured API and a 30-day half-life', () => {
    const embedding = EmbeddingSchema.parse({});
    assert.equal(embedding.endpoint, '');
    assert.equal(embedding.model, 'text-embedding-3-small');
    assert.equal(embedding.decayHalfLifeMs, 30 * 24 * 60 * 60 * 1000);
});

test('embedding response parser accepts OpenRouter JSON and event-stream text without exposing bodies', () => {
    const response = { data: [{ index: 0, embedding: [1, 2, 3] }] };
    assert.deepEqual(parseEmbeddingResponse(response), [1, 2, 3]);
    assert.deepEqual(parseEmbeddingResponse(JSON.stringify(response)), [1, 2, 3]);
    assert.deepEqual(parseEmbeddingResponse(JSON.stringify(JSON.stringify(response))), [1, 2, 3]);
    assert.deepEqual(parseEmbeddingResponse(`\uFEFF${JSON.stringify(response)}`), [1, 2, 3]);
    assert.deepEqual(parseEmbeddingResponse(`data: ${JSON.stringify(response)}\n\ndata: [DONE]\n\n`), [1, 2, 3]);
    assert.throws(
        () => parseEmbeddingResponse('<html>private upstream body</html>', { status: 200, contentType: 'text/html' }),
        error =>
            error instanceof Error &&
            /kind=html, length=34, status=200, contentType=text\/html/.test(error.message) &&
            !error.message.includes('private upstream body')
    );
    assert.throws(() => parseEmbeddingResponse({ data: [{ embedding: [] }] }));
    assert.throws(() => parseEmbeddingResponse({ data: [{ embedding: [Number.NaN] }] }));
});

test('streaming group mean and time-decayed user average follow the configured formulas', () => {
    const meanUpdate = calculateStreamingMean([1, 3], 1, [3, 7]);
    assert.deepEqual(Array.from(meanUpdate.mean), [2, 5]);
    assert.deepEqual(Array.from(meanUpdate.residual), [1, 2]);
    assert.equal(meanUpdate.sampleCount, 2);

    const averageUpdate = calculateDecayedAverage([2, 4], 3, 1_000, [5, 1], 2_000, 1_000);
    assert.ok(Math.abs(averageUpdate.effectiveWeight - 2.5) < 1e-9);
    assert.ok(Math.abs(averageUpdate.vector[0] - 3.2) < 1e-6);
    assert.ok(Math.abs(averageUpdate.vector[1] - 2.8) < 1e-6);
});

test('profile access allows self-service and administrator lookups only', () => {
    assert.equal(canViewMessageEmbeddingProfile(7, 7, false, false), true);
    assert.equal(canViewMessageEmbeddingProfile(7, 8, false, false), false);
    assert.equal(canViewMessageEmbeddingProfile(7, 8, true, false), true);
    assert.equal(canViewMessageEmbeddingProfile(7, 8, false, true), true);
});

test('profiles cross groups, opt-out is reversible, and group summaries describe the current mean', t => {
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
    const halfLifeMs = 1_000;

    assert.equal(
        recordMessageEmbedding(database, {
            groupId: 100,
            userId: 7,
            preferenceRevision: 0,
            embedding: [2, 4],
            spaceKey: 'https://embedding.example/v1\u0000test-model',
            timestamp: 1_000,
            decayHalfLifeMs: halfLifeMs
        }),
        true
    );
    assert.equal(
        recordMessageEmbedding(database, {
            groupId: 100,
            userId: 7,
            preferenceRevision: 0,
            embedding: [4, 8],
            spaceKey: 'https://embedding.example/v1\u0000test-model',
            timestamp: 2_000,
            decayHalfLifeMs: halfLifeMs
        }),
        true
    );
    assert.equal(
        recordMessageEmbedding(database, {
            groupId: 200,
            userId: 7,
            preferenceRevision: 0,
            embedding: [10, 10],
            spaceKey: 'https://embedding.example/v1\u0000test-model',
            timestamp: 2_000,
            decayHalfLifeMs: halfLifeMs
        }),
        true
    );

    const group100 = database
        .select()
        .from(groupMessageEmbeddingMeans)
        .where(eq(groupMessageEmbeddingMeans.groupId, 100))
        .get();
    const groupRows = database.select().from(groupMessageEmbeddingMeans).all();
    const profileRows = database.select().from(userMessageEmbeddingProfiles).all();
    assert.equal(groupRows.length, 2);
    assert.equal(profileRows.length, 1);
    assert.ok(group100);
    assert.equal(group100.sampleCount, 2);
    assert.deepEqual(decodeVector(group100.meanVector), [3, 6]);

    const optOut = optOutMessageEmbedding(database, 7, 3_000);
    assert.equal(optOut.alreadyOptedOut, false);
    assert.equal(optOut.deletedProfile, true);
    assert.equal(optOut.revision, 1);
    assert.equal(isMessageEmbeddingOptedOut(database, 7), true);
    assert.deepEqual(getMessageEmbeddingPreference(database, 7), {
        optedOut: true,
        revision: 1,
        updatedAt: 3_000
    });
    assert.equal(database.select().from(userMessageEmbeddingProfiles).all().length, 0);
    assert.equal(
        recordMessageEmbedding(database, {
            groupId: 100,
            userId: 7,
            preferenceRevision: 1,
            embedding: [100, 100],
            spaceKey: 'https://embedding.example/v1\u0000test-model',
            timestamp: 3_500,
            decayHalfLifeMs: halfLifeMs
        }),
        false
    );

    const optIn = optInMessageEmbedding(database, 7, 4_000);
    assert.equal(optIn.alreadyOptedIn, false);
    assert.equal(optIn.revision, 2);
    assert.deepEqual(getMessageEmbeddingPreference(database, 7), {
        optedOut: false,
        revision: 2,
        updatedAt: 4_000
    });
    assert.equal(
        recordMessageEmbedding(database, {
            groupId: 100,
            userId: 7,
            preferenceRevision: 0,
            embedding: [100, 100],
            spaceKey: 'https://embedding.example/v1\u0000test-model',
            timestamp: 4_500,
            decayHalfLifeMs: halfLifeMs
        }),
        false
    );
    assert.equal(
        recordMessageEmbedding(database, {
            groupId: 100,
            userId: 7,
            preferenceRevision: 2,
            embedding: [6, 12],
            spaceKey: 'https://embedding.example/v1\u0000test-model',
            timestamp: 5_000,
            decayHalfLifeMs: halfLifeMs
        }),
        true
    );

    const resumedProfile = database
        .select()
        .from(userMessageEmbeddingProfiles)
        .where(eq(userMessageEmbeddingProfiles.userId, 7))
        .get();
    assert.ok(resumedProfile);
    assert.deepEqual(decodeVector(resumedProfile.featureVector), [2, 4]);

    const userSummary = getUserMessageEmbeddingSummary(database, 7);
    assert.ok(userSummary);
    assert.equal(userSummary.model, 'test-model');
    assert.equal(userSummary.dimensions, 2);
    assert.equal(userSummary.effectiveWeight, 1);
    assert.equal(userSummary.updatedAt, 5_000);
    assert.deepEqual(userSummary.preview, [2, 4]);
    assert.equal(userSummary.componentMean, 3);
    assert.equal(userSummary.minimum, 2);
    assert.equal(userSummary.maximum, 4);
    assert.ok(Math.abs(userSummary.l2Norm - Math.sqrt(20)) < 1e-9);

    const summary = getGroupMessageEmbeddingSummary(database, 100);
    assert.ok(summary);
    assert.equal(summary.model, 'test-model');
    assert.equal(summary.sampleCount, 3);
    assert.equal(summary.dimensions, 2);
    assert.equal(summary.updatedAt, 5_000);
    assert.deepEqual(summary.preview, [4, 8]);
    assert.equal(summary.componentMean, 6);
    assert.equal(summary.minimum, 4);
    assert.equal(summary.maximum, 8);
    assert.ok(Math.abs(summary.l2Norm - Math.sqrt(80)) < 1e-9);
});
