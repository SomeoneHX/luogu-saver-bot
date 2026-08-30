import axios from 'axios';
import { z } from 'zod';

const EmbeddingResponseSchema = z.object({
    data: z
        .array(
            z.object({
                embedding: z.array(z.number()),
                index: z.number().int().optional()
            })
        )
        .min(1)
});

export type EmbeddingRequestSettings = {
    endpoint: string;
    apiKey: string;
    model: string;
    requestTimeoutMs: number;
};

type EmbeddingResponseMetadata = {
    status?: number;
    contentType?: string;
};

function createTextResponseError(
    kind: 'empty' | 'html' | 'event-stream' | 'text',
    text: string,
    metadata: EmbeddingResponseMetadata
): Error {
    const details = [`kind=${kind}`, `length=${Buffer.byteLength(text)}`];
    if (typeof metadata.status === 'number') details.push(`status=${metadata.status}`);
    const mediaType = metadata.contentType?.split(';', 1)[0].trim().toLowerCase();
    if (mediaType && /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(mediaType)) {
        details.push(`contentType=${mediaType}`);
    }
    return new Error(`Embedding API returned a non-JSON string response (${details.join(', ')}).`);
}

function parseStringResponse(text: string, metadata: EmbeddingResponseMetadata): unknown {
    const normalized = text.replace(/^\uFEFF/, '').trim();
    if (!normalized) throw createTextResponseError('empty', text, metadata);

    if (/^data:/m.test(normalized)) {
        let lastParsed: unknown;
        for (const event of normalized.split(/\r?\n\r?\n/)) {
            const eventData = event
                .split(/\r?\n/)
                .filter(line => line.startsWith('data:'))
                .map(line => line.slice(5).trimStart())
                .join('\n')
                .trim();
            if (!eventData || eventData === '[DONE]') continue;
            try {
                lastParsed = JSON.parse(eventData);
            } catch {
                continue;
            }
            if (EmbeddingResponseSchema.safeParse(lastParsed).success) return lastParsed;
        }
        if (lastParsed !== undefined) return lastParsed;
        throw createTextResponseError('event-stream', text, metadata);
    }

    try {
        return JSON.parse(normalized);
    } catch {
        const kind = /^\s*(?:<!doctype\s+html|<html)/i.test(normalized) ? 'html' : 'text';
        throw createTextResponseError(kind, text, metadata);
    }
}

export function parseEmbeddingResponse(data: unknown, metadata: EmbeddingResponseMetadata = {}): number[] {
    let payload = data;
    for (let depth = 0; depth < 2 && typeof payload === 'string'; depth += 1) {
        payload = parseStringResponse(payload, metadata);
    }
    if (typeof payload === 'string') {
        throw new Error('Embedding API returned a repeatedly encoded string response.');
    }

    const parsed = EmbeddingResponseSchema.parse(payload);
    const item = parsed.data.find(candidate => candidate.index === 0) ?? parsed.data[0];
    if (item.embedding.length === 0 || item.embedding.some(value => !Number.isFinite(value))) {
        throw new Error('Embedding API returned an empty or non-finite vector.');
    }
    return item.embedding;
}

export async function createEmbedding(input: string, settings: EmbeddingRequestSettings): Promise<number[]> {
    const headers: Record<string, string> = {
        Accept: 'application/json',
        'Content-Type': 'application/json'
    };
    if (settings.apiKey) headers.Authorization = `Bearer ${settings.apiKey}`;

    const response = await axios.post<unknown>(
        settings.endpoint,
        {
            model: settings.model,
            input,
            encoding_format: 'float'
        },
        {
            headers,
            timeout: settings.requestTimeoutMs,
            responseType: 'json'
        }
    );
    return parseEmbeddingResponse(response.data, {
        status: response.status,
        contentType: response.headers['content-type']
    });
}
