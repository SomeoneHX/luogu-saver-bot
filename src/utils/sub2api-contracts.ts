import { z } from 'zod';

const apiEnvelopeSchema = z.object({
    code: z.number(),
    message: z.string().default(''),
    reason: z.string().optional(),
    metadata: z.record(z.string(), z.string()).optional(),
    data: z.unknown().optional()
});

export const sub2ApiUserSchema = z.object({
    id: z.number().int().positive(),
    email: z.string().default(''),
    username: z.string().default(''),
    role: z.string().default('user'),
    balance: z.number().default(0),
    frozen_balance: z.number().default(0),
    concurrency: z.number().int().default(0),
    current_concurrency: z.number().int().optional().default(0),
    rpm_limit: z.number().int().optional().default(0),
    status: z.string().default(''),
    allowed_groups: z.array(z.number().int()).nullable().optional().default(null),
    total_recharged: z.number().optional().default(0)
});

export const sub2ApiGroupSchema = z.object({
    id: z.number().int().nonnegative(),
    name: z.string().default(''),
    description: z.string().default(''),
    platform: z.string().default(''),
    rate_multiplier: z.number().default(1),
    is_exclusive: z.boolean().optional().default(false),
    status: z.string().default(''),
    subscription_type: z.string().optional().default(''),
    daily_limit_usd: z.number().nullable().optional().default(null),
    weekly_limit_usd: z.number().nullable().optional().default(null),
    monthly_limit_usd: z.number().nullable().optional().default(null)
});

export const sub2ApiBalancePackagePlanSchema = z.object({
    id: z.number().int().positive(),
    name: z.string().default(''),
    description: z.string().default(''),
    price: z.number().default(0),
    original_price: z.number().nullable().optional().default(null),
    currency: z.string().optional().default(''),
    balance_amount: z.number().default(0),
    validity_days: z.number().int().default(0),
    validity_unit: z.string().default('day'),
    daily_limit_usd: z.number().nullable().optional().default(null),
    weekly_limit_usd: z.number().nullable().optional().default(null),
    monthly_limit_usd: z.number().nullable().optional().default(null),
    product_name: z.string().optional().default(''),
    for_sale: z.boolean().default(false),
    sort_order: z.number().int().optional().default(0)
});

export const sub2ApiUserBalancePackageSchema = z.object({
    id: z.number().int().positive(),
    user_id: z.number().int().positive(),
    user_email: z.string().optional(),
    user_username: z.string().optional(),
    plan_id: z.number().int().positive().nullable().optional().default(null),
    name: z.string().default(''),
    status: z.string().default(''),
    total_amount: z.number().default(0),
    remaining_amount: z.number().default(0),
    effective_available: z.number().default(0),
    daily_limit_usd: z.number().nullable().optional().default(null),
    weekly_limit_usd: z.number().nullable().optional().default(null),
    monthly_limit_usd: z.number().nullable().optional().default(null),
    daily_usage_usd: z.number().default(0),
    weekly_usage_usd: z.number().default(0),
    monthly_usage_usd: z.number().default(0),
    starts_at: z.string().default(''),
    expires_at: z.string().default(''),
    created_at: z.string().optional().default(''),
    updated_at: z.string().optional().default('')
});

export const sub2ApiRedeemCodeSchema = z.object({
    id: z.number().int().positive(),
    code: z.string().min(1),
    type: z.string().default(''),
    value: z.number().default(0),
    status: z.string().default(''),
    group_id: z.number().int().positive().nullable().optional().default(null),
    validity_days: z.number().int().optional().default(0)
});

export const paginatedSub2ApiUsersSchema = z.object({
    items: z.array(sub2ApiUserSchema),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    page_size: z.number().int().positive(),
    pages: z.number().int().positive()
});

export const sub2ApiGroupModelsSchema = z.object({
    models: z.array(z.string())
});

export type Sub2ApiUser = z.infer<typeof sub2ApiUserSchema>;
export type Sub2ApiGroup = z.infer<typeof sub2ApiGroupSchema>;
export type Sub2ApiBalancePackagePlan = z.infer<typeof sub2ApiBalancePackagePlanSchema>;
export type Sub2ApiUserBalancePackage = z.infer<typeof sub2ApiUserBalancePackageSchema>;
export type Sub2ApiRedeemCode = z.infer<typeof sub2ApiRedeemCodeSchema>;

function apiErrorMessage(status: number, responseData: unknown): string {
    const parsed = apiEnvelopeSchema.safeParse(responseData);
    const message = parsed.success ? parsed.data.message.trim() : '';
    const reason = parsed.success ? parsed.data.reason?.trim() : '';

    if (status === 401 || reason === 'INVALID_ADMIN_KEY') {
        return 'Sub2API 管理员 API Key 无效或已失效。';
    }
    if (status === 403) {
        return 'Sub2API 拒绝了当前管理员操作。';
    }

    const detail = message || reason || `HTTP ${status}`;
    return `Sub2API 请求失败：${detail}`;
}

export function parseSub2ApiResponse<T>(responseData: unknown, status: number, schema: z.ZodType<T>): T {
    const envelope = apiEnvelopeSchema.safeParse(responseData);
    if (!envelope.success) {
        throw new Error(
            status >= 200 && status < 300 ? 'Sub2API 返回了无法识别的响应。' : apiErrorMessage(status, responseData)
        );
    }

    if (status < 200 || status >= 300 || envelope.data.code !== 0) {
        throw new Error(apiErrorMessage(status, responseData));
    }

    const payload = schema.safeParse(envelope.data.data);
    if (!payload.success) {
        throw new Error('Sub2API 响应数据格式与当前接入版本不兼容。');
    }
    return payload.data;
}
