import { z } from 'zod';

const apiEnvelopeSchema = z.object({
    code: z.number(),
    message: z.string().default(''),
    reason: z.string().optional(),
    metadata: z.record(z.string(), z.string()).optional(),
    data: z.unknown().optional()
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
