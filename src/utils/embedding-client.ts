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

export function parseEmbeddingResponse(data: unknown): number[] {
    const parsed = EmbeddingResponseSchema.parse(data);
    const item = parsed.data.find(candidate => candidate.index === 0) ?? parsed.data[0];
    if (item.embedding.length === 0 || item.embedding.some(value => !Number.isFinite(value))) {
        throw new Error('Embedding API returned an empty or non-finite vector.');
    }
    return item.embedding;
}

export async function createEmbedding(input: string, settings: EmbeddingRequestSettings): Promise<number[]> {
    const headers: Record<string, string> = {
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
            timeout: settings.requestTimeoutMs
        }
    );
    return parseEmbeddingResponse(response.data);
}
