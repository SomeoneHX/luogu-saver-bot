import { z } from 'zod';

export const SaverSchema = z.object({
    token: z.string().default(''),
    sub2ApiBaseUrl: z.string().url().default('https://sub2api.luogu.me'),
    sub2ApiAdminApiKey: z.string().default(''),
    sub2ApiRedeemUrl: z.string().url().default('https://sub2api.luogu.me/redeem'),
    sub2ApiRequestTimeoutMs: z.number().int().positive().default(10000),
    rechargeAllowedGroupIds: z.array(z.number().int().positive()).default([1017248143]),
    selfRechargeDailyLimitUsd: z.number().positive().default(5),
    dailyLimitTimezone: z.string().default('Asia/Shanghai')
});
