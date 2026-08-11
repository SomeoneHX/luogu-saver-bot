import { z } from 'zod';

export const GroupSchema = z
    .object({
        autoReviewEnabled: z.boolean().default(true),
        autoApproveKeywords: z.array(z.string()).default([]),
        autoApproveMinQqLevel: z.number().int().nonnegative().default(0),
        // null disables filtering; an array is always treated as a strict allowlist.
        enabledGroupIds: z.array(z.number().int().positive()).nullable().default(null)
    })
    .default({
        autoReviewEnabled: true,
        autoApproveKeywords: [],
        autoApproveMinQqLevel: 0,
        enabledGroupIds: null
    });
