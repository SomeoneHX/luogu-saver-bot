import { z } from 'zod';

export const SaverSchema = z.object({
    token: z.string().default(''),
    newApiBaseUrl: z.string().url().default('https://ai.luogu.me'),
    newApiAccessToken: z.string().default(''),
    newApiUserId: z.number().int().nonnegative().default(0),
    newApiUserAgent: z
        .string()
        .trim()
        .min(1)
        .regex(/^[\x20-\x7e]+$/)
        .default('luogu-saver-bot/1.0.0'),
    rechargeAllowedGroupIds: z.array(z.number().int().positive()).default([1017248143]),
    selfRechargeDailyLimitUsd: z.number().positive().default(5),
    dailyLimitTimezone: z.string().default('Asia/Shanghai')
});
