import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '@/db/schema';
import { groupMessageEmbeddingMeans, messageEmbeddingPreferences, userMessageEmbeddingProfiles } from '@/db/schema';

export type MessageEmbeddingDatabase = BetterSQLite3Database<typeof schema>;

export type StreamingMeanUpdate = {
    mean: Float32Array;
    residual: Float32Array;
    sampleCount: number;
};

export type DecayedAverageUpdate = {
    vector: Float32Array;
    effectiveWeight: number;
    updatedAt: number;
};

export type MessageEmbeddingRecord = {
    groupId: number;
    userId: number;
    preferenceRevision: number;
    embedding: readonly number[];
    spaceKey: string;
    timestamp: number;
    decayHalfLifeMs: number;
};

export type MessageEmbeddingPreference = {
    optedOut: boolean;
    revision: number;
    updatedAt: number | null;
};

export type GroupMessageEmbeddingSummary = {
    groupId: number;
    model: string;
    dimensions: number;
    sampleCount: number;
    updatedAt: number;
    componentMean: number;
    minimum: number;
    maximum: number;
    l2Norm: number;
    preview: number[];
};

function assertFiniteVector(vector: ArrayLike<number>, label: string): void {
    if (!Number.isSafeInteger(vector.length) || vector.length <= 0) {
        throw new Error(`${label} must contain at least one dimension.`);
    }
    for (let index = 0; index < vector.length; index += 1) {
        if (!Number.isFinite(vector[index])) throw new Error(`${label} contains a non-finite value.`);
    }
}

export function calculateStreamingMean(
    previousMean: ArrayLike<number> | null,
    previousCount: number,
    sample: ArrayLike<number>
): StreamingMeanUpdate {
    assertFiniteVector(sample, 'Sample vector');
    if (previousMean === null) {
        if (previousCount !== 0) throw new Error('A missing mean must have a zero sample count.');
        return {
            mean: Float32Array.from(sample),
            residual: new Float32Array(sample.length),
            sampleCount: 1
        };
    }

    assertFiniteVector(previousMean, 'Previous mean');
    if (previousMean.length !== sample.length) throw new Error('Embedding dimensions do not match the group mean.');
    if (!Number.isSafeInteger(previousCount) || previousCount <= 0 || previousCount >= Number.MAX_SAFE_INTEGER) {
        throw new Error('Previous sample count is invalid.');
    }

    const sampleCount = previousCount + 1;
    const mean = new Float32Array(sample.length);
    const residual = new Float32Array(sample.length);
    for (let index = 0; index < sample.length; index += 1) {
        mean[index] = previousMean[index] + (sample[index] - previousMean[index]) / sampleCount;
        residual[index] = sample[index] - mean[index];
    }
    return { mean, residual, sampleCount };
}

export function calculateDecayedAverage(
    previousVector: ArrayLike<number> | null,
    previousWeight: number,
    previousTimestamp: number,
    sample: ArrayLike<number>,
    timestamp: number,
    halfLifeMs: number
): DecayedAverageUpdate {
    assertFiniteVector(sample, 'Residual vector');
    if (!Number.isFinite(timestamp) || timestamp < 0) throw new Error('Update timestamp is invalid.');
    if (!Number.isFinite(halfLifeMs) || halfLifeMs <= 0) throw new Error('Decay half-life must be positive.');

    if (previousVector === null) {
        return {
            vector: Float32Array.from(sample),
            effectiveWeight: 1,
            updatedAt: timestamp
        };
    }

    assertFiniteVector(previousVector, 'Previous feature vector');
    if (previousVector.length !== sample.length) throw new Error('Embedding dimensions do not match the user profile.');
    if (!Number.isFinite(previousWeight) || previousWeight <= 0)
        throw new Error('Previous effective weight is invalid.');
    if (!Number.isFinite(previousTimestamp) || previousTimestamp < 0) {
        throw new Error('Previous update timestamp is invalid.');
    }

    const updatedAt = Math.max(timestamp, previousTimestamp);
    const decayedWeight = previousWeight * Math.pow(0.5, (updatedAt - previousTimestamp) / halfLifeMs);
    const effectiveWeight = decayedWeight + 1;
    const vector = new Float32Array(sample.length);
    for (let index = 0; index < sample.length; index += 1) {
        vector[index] = (previousVector[index] * decayedWeight + sample[index]) / effectiveWeight;
    }
    return { vector, effectiveWeight, updatedAt };
}

function encodeVector(vector: ArrayLike<number>): Buffer {
    const buffer = Buffer.allocUnsafe(vector.length * Float32Array.BYTES_PER_ELEMENT);
    for (let index = 0; index < vector.length; index += 1) {
        buffer.writeFloatLE(vector[index], index * Float32Array.BYTES_PER_ELEMENT);
    }
    return buffer;
}

function decodeVector(buffer: Buffer, dimensions: number): Float32Array {
    if (!Number.isSafeInteger(dimensions) || dimensions <= 0)
        throw new Error('Stored embedding dimensions are invalid.');
    if (buffer.byteLength !== dimensions * Float32Array.BYTES_PER_ELEMENT) {
        throw new Error('Stored embedding vector length does not match its dimensions.');
    }
    const vector = new Float32Array(dimensions);
    for (let index = 0; index < dimensions; index += 1) {
        vector[index] = buffer.readFloatLE(index * Float32Array.BYTES_PER_ELEMENT);
    }
    return vector;
}

export function getMessageEmbeddingPreference(
    database: MessageEmbeddingDatabase,
    userId: number
): MessageEmbeddingPreference {
    const row = database
        .select()
        .from(messageEmbeddingPreferences)
        .where(eq(messageEmbeddingPreferences.userId, userId))
        .get();
    return row
        ? { optedOut: row.optedOut, revision: row.revision, updatedAt: row.updatedAt }
        : { optedOut: false, revision: 0, updatedAt: null };
}

export function isMessageEmbeddingOptedOut(database: MessageEmbeddingDatabase, userId: number): boolean {
    return getMessageEmbeddingPreference(database, userId).optedOut;
}

export function optOutMessageEmbedding(
    database: MessageEmbeddingDatabase,
    userId: number,
    updatedAt: number
): { alreadyOptedOut: boolean; deletedProfile: boolean; revision: number } {
    return database.transaction(transaction => {
        const existing = transaction
            .select()
            .from(messageEmbeddingPreferences)
            .where(eq(messageEmbeddingPreferences.userId, userId))
            .get();
        const revision = (existing?.revision ?? 0) + 1;
        const deletedProfile =
            transaction
                .delete(userMessageEmbeddingProfiles)
                .where(eq(userMessageEmbeddingProfiles.userId, userId))
                .run().changes > 0;
        transaction
            .insert(messageEmbeddingPreferences)
            .values({ userId, optedOut: true, revision, updatedAt })
            .onConflictDoUpdate({
                target: messageEmbeddingPreferences.userId,
                set: { optedOut: true, revision, updatedAt }
            })
            .run();
        return { alreadyOptedOut: existing?.optedOut === true, deletedProfile, revision };
    });
}

export function optInMessageEmbedding(
    database: MessageEmbeddingDatabase,
    userId: number,
    updatedAt: number
): { alreadyOptedIn: boolean; revision: number } {
    return database.transaction(transaction => {
        const existing = transaction
            .select()
            .from(messageEmbeddingPreferences)
            .where(eq(messageEmbeddingPreferences.userId, userId))
            .get();
        if (!existing || !existing.optedOut) {
            return { alreadyOptedIn: true, revision: existing?.revision ?? 0 };
        }

        const revision = existing.revision + 1;
        transaction
            .update(messageEmbeddingPreferences)
            .set({ optedOut: false, revision, updatedAt })
            .where(eq(messageEmbeddingPreferences.userId, userId))
            .run();
        return { alreadyOptedIn: false, revision };
    });
}

export function recordMessageEmbedding(database: MessageEmbeddingDatabase, record: MessageEmbeddingRecord): boolean {
    return database.transaction(transaction => {
        const preference = transaction
            .select({ optedOut: messageEmbeddingPreferences.optedOut, revision: messageEmbeddingPreferences.revision })
            .from(messageEmbeddingPreferences)
            .where(eq(messageEmbeddingPreferences.userId, record.userId))
            .get();
        if (preference?.optedOut || (preference?.revision ?? 0) !== record.preferenceRevision) return false;

        const dimensions = record.embedding.length;
        const groupRecord = transaction
            .select()
            .from(groupMessageEmbeddingMeans)
            .where(eq(groupMessageEmbeddingMeans.groupId, record.groupId))
            .get();
        const compatibleGroupRecord =
            groupRecord?.spaceKey === record.spaceKey &&
            groupRecord.dimensions === dimensions &&
            groupRecord.sampleCount > 0;
        const meanUpdate = calculateStreamingMean(
            compatibleGroupRecord ? decodeVector(groupRecord.meanVector, dimensions) : null,
            compatibleGroupRecord ? groupRecord.sampleCount : 0,
            record.embedding
        );

        const userRecord = transaction
            .select()
            .from(userMessageEmbeddingProfiles)
            .where(eq(userMessageEmbeddingProfiles.userId, record.userId))
            .get();
        const compatibleUserRecord =
            userRecord?.spaceKey === record.spaceKey &&
            userRecord.dimensions === dimensions &&
            Number.isFinite(userRecord.effectiveWeight) &&
            userRecord.effectiveWeight > 0;
        const averageUpdate = calculateDecayedAverage(
            compatibleUserRecord ? decodeVector(userRecord.featureVector, dimensions) : null,
            compatibleUserRecord ? userRecord.effectiveWeight : 0,
            compatibleUserRecord ? userRecord.updatedAt : record.timestamp,
            meanUpdate.residual,
            record.timestamp,
            record.decayHalfLifeMs
        );
        const meanVector = encodeVector(meanUpdate.mean);
        const featureVector = encodeVector(averageUpdate.vector);
        const groupUpdatedAt = compatibleGroupRecord
            ? Math.max(record.timestamp, groupRecord.updatedAt)
            : record.timestamp;

        transaction
            .insert(groupMessageEmbeddingMeans)
            .values({
                groupId: record.groupId,
                spaceKey: record.spaceKey,
                dimensions,
                meanVector,
                sampleCount: meanUpdate.sampleCount,
                updatedAt: groupUpdatedAt
            })
            .onConflictDoUpdate({
                target: groupMessageEmbeddingMeans.groupId,
                set: {
                    spaceKey: record.spaceKey,
                    dimensions,
                    meanVector,
                    sampleCount: meanUpdate.sampleCount,
                    updatedAt: groupUpdatedAt
                }
            })
            .run();
        transaction
            .insert(userMessageEmbeddingProfiles)
            .values({
                userId: record.userId,
                spaceKey: record.spaceKey,
                dimensions,
                featureVector,
                effectiveWeight: averageUpdate.effectiveWeight,
                updatedAt: averageUpdate.updatedAt
            })
            .onConflictDoUpdate({
                target: userMessageEmbeddingProfiles.userId,
                set: {
                    spaceKey: record.spaceKey,
                    dimensions,
                    featureVector,
                    effectiveWeight: averageUpdate.effectiveWeight,
                    updatedAt: averageUpdate.updatedAt
                }
            })
            .run();
        return true;
    });
}

export function getGroupMessageEmbeddingSummary(
    database: MessageEmbeddingDatabase,
    groupId: number
): GroupMessageEmbeddingSummary | null {
    const record = database
        .select()
        .from(groupMessageEmbeddingMeans)
        .where(eq(groupMessageEmbeddingMeans.groupId, groupId))
        .get();
    if (!record) return null;

    const vector = decodeVector(record.meanVector, record.dimensions);
    let sum = 0;
    let sumSquares = 0;
    let minimum = Number.POSITIVE_INFINITY;
    let maximum = Number.NEGATIVE_INFINITY;
    const preview: number[] = [];
    for (let index = 0; index < vector.length; index += 1) {
        const value = vector[index];
        sum += value;
        sumSquares += value * value;
        minimum = Math.min(minimum, value);
        maximum = Math.max(maximum, value);
        if (index < 8) preview.push(value);
    }

    const separatorIndex = record.spaceKey.lastIndexOf('\u0000');
    return {
        groupId,
        model: separatorIndex >= 0 ? record.spaceKey.slice(separatorIndex + 1) : record.spaceKey,
        dimensions: record.dimensions,
        sampleCount: record.sampleCount,
        updatedAt: record.updatedAt,
        componentMean: sum / vector.length,
        minimum,
        maximum,
        l2Norm: Math.sqrt(sumSquares),
        preview
    };
}
