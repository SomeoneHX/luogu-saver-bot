import axios, { type Method } from 'axios';
import { z } from 'zod';
import { config } from '@/config';
import { parseSub2ApiResponse, sub2ApiRedeemCodeSchema, type Sub2ApiRedeemCode } from '@/utils/sub2api-contracts';

type AdminRequestOptions = {
    data?: unknown;
    idempotencyKey?: string;
};

function resolveAdminApiUrl(path: string): string {
    const configuredBase = config.saver.sub2ApiBaseUrl.replace(/\/+$/, '');
    const apiBase = configuredBase.endsWith('/api/v1') ? configuredBase : `${configuredBase}/api/v1`;
    return `${apiBase}${path.startsWith('/') ? path : `/${path}`}`;
}

function resolveAdminApiKey(): string {
    const apiKey = config.saver.sub2ApiAdminApiKey.trim();
    if (!apiKey) {
        throw new Error('未配置 Sub2API 管理员 API Key，请检查 saver.sub2ApiAdminApiKey。');
    }
    return apiKey;
}

async function adminRequest<T>(
    method: Method,
    path: string,
    schema: z.ZodType<T>,
    options: AdminRequestOptions = {}
): Promise<T> {
    const headers: Record<string, string> = {
        Accept: 'application/json',
        'User-Agent': config.saver.sub2ApiUserAgent,
        'x-api-key': resolveAdminApiKey()
    };
    if (options.idempotencyKey) {
        headers['Idempotency-Key'] = options.idempotencyKey;
    }

    try {
        const response = await axios.request({
            method,
            url: resolveAdminApiUrl(path),
            data: options.data,
            headers,
            timeout: config.saver.sub2ApiRequestTimeoutMs,
            validateStatus: () => true
        });
        return parseSub2ApiResponse(response.data, response.status, schema);
    } catch (error) {
        if (!axios.isAxiosError(error)) throw error;
        if (error.code === 'ECONNABORTED') {
            throw new Error('Sub2API 请求超时，请稍后重试。');
        }
        throw new Error('无法连接到 Sub2API，请检查服务地址和网络状态。');
    }
}

function assertIdempotencyKey(value: string): string {
    const key = value.trim();
    if (!key) throw new Error('幂等请求键不能为空。');
    return key;
}

async function generateSub2ApiRedeemCode(
    data: Record<string, unknown>,
    idempotencyKey: string
): Promise<Sub2ApiRedeemCode> {
    const codes = await adminRequest('POST', '/admin/redeem-codes/generate', z.array(sub2ApiRedeemCodeSchema), {
        data: { count: 1, ...data },
        idempotencyKey: assertIdempotencyKey(idempotencyKey)
    });
    const code = codes[0];
    if (!code) throw new Error('Sub2API 未返回生成的兑换码。');
    return code;
}

export function createSub2ApiBalanceRedeemCode(amountUsd: number, idempotencyKey: string): Promise<Sub2ApiRedeemCode> {
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) throw new Error('充值金额无效。');
    return generateSub2ApiRedeemCode({ type: 'balance', value: amountUsd }, idempotencyKey);
}
