import axios, { type Method } from 'axios';
import { z } from 'zod';
import { config } from '@/config';
import {
    paginatedSub2ApiUsersSchema,
    parseSub2ApiResponse,
    sub2ApiBalancePackagePlanSchema,
    sub2ApiGroupModelsSchema,
    sub2ApiGroupSchema,
    sub2ApiRedeemCodeSchema,
    sub2ApiUserBalancePackageSchema,
    sub2ApiUserSchema,
    type Sub2ApiBalancePackagePlan,
    type Sub2ApiGroup,
    type Sub2ApiRedeemCode,
    type Sub2ApiUser,
    type Sub2ApiUserBalancePackage
} from '@/utils/sub2api-contracts';

type AdminRequestOptions = {
    params?: Record<string, string | number | boolean | undefined>;
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
            params: options.params,
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

function assertPositiveInteger(value: number, label: string): void {
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`${label}无效。`);
    }
}

function assertIdempotencyKey(value: string): string {
    const key = value.trim();
    if (!key) throw new Error('幂等请求键不能为空。');
    return key;
}

export function getSub2ApiUser(userId: number): Promise<Sub2ApiUser> {
    assertPositiveInteger(userId, 'Sub2API 用户 ID');
    return adminRequest('GET', `/admin/users/${userId}`, sub2ApiUserSchema);
}

export async function searchSub2ApiUsers(keyword: string, limit = 3): Promise<Sub2ApiUser[]> {
    const search = keyword.trim();
    if (!search) throw new Error('搜索关键词不能为空。');
    const pageSize = Math.min(Math.max(1, limit), 20);
    const result = await adminRequest('GET', '/admin/users', paginatedSub2ApiUsersSchema, {
        params: { search, page: 1, page_size: pageSize }
    });
    return result.items.slice(0, pageSize);
}

export function getSub2ApiGroups(): Promise<Sub2ApiGroup[]> {
    return adminRequest('GET', '/admin/groups/all', z.array(sub2ApiGroupSchema));
}

export async function getSub2ApiGroupModels(groupId: number, platform?: string): Promise<string[]> {
    if (!Number.isInteger(groupId) || groupId < 0) throw new Error('Sub2API 分组 ID 无效。');
    const result = await adminRequest(
        'GET',
        `/admin/groups/${groupId}/models-list-candidates`,
        sub2ApiGroupModelsSchema,
        {
            params: { platform }
        }
    );
    return [...new Set(result.models)].sort((a, b) => a.localeCompare(b));
}

export function getSub2ApiBalancePackagePlans(): Promise<Sub2ApiBalancePackagePlan[]> {
    return adminRequest('GET', '/admin/payment/balance-package-plans', z.array(sub2ApiBalancePackagePlanSchema));
}

export function getSub2ApiUserBalancePackages(userId: number): Promise<Sub2ApiUserBalancePackage[]> {
    assertPositiveInteger(userId, 'Sub2API 用户 ID');
    return adminRequest('GET', '/admin/payment/user-balance-packages', z.array(sub2ApiUserBalancePackageSchema), {
        params: { user_id: userId }
    });
}

export function grantSub2ApiUserBalancePackage(
    userId: number,
    planId: number,
    reason: string
): Promise<Sub2ApiUserBalancePackage> {
    assertPositiveInteger(userId, 'Sub2API 用户 ID');
    assertPositiveInteger(planId, '余额包计划 ID');
    return adminRequest('POST', '/admin/payment/user-balance-packages', sub2ApiUserBalancePackageSchema, {
        data: { user_id: userId, plan_id: planId, reason: reason.trim() }
    });
}

export function voidSub2ApiUserBalancePackage(packageId: number, reason: string): Promise<Sub2ApiUserBalancePackage> {
    assertPositiveInteger(packageId, '用户余额包 ID');
    return adminRequest(
        'POST',
        `/admin/payment/user-balance-packages/${packageId}/void`,
        sub2ApiUserBalancePackageSchema,
        {
            data: { reason: reason.trim() }
        }
    );
}

export function restoreSub2ApiUserBalancePackage(
    packageId: number,
    reason: string
): Promise<Sub2ApiUserBalancePackage> {
    assertPositiveInteger(packageId, '用户余额包 ID');
    return adminRequest(
        'POST',
        `/admin/payment/user-balance-packages/${packageId}/restore`,
        sub2ApiUserBalancePackageSchema,
        {
            data: { reason: reason.trim() }
        }
    );
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

export function createSub2ApiSubscriptionRedeemCode(
    groupId: number,
    validityDays: number,
    idempotencyKey: string
): Promise<Sub2ApiRedeemCode> {
    assertPositiveInteger(groupId, 'Sub2API 分组 ID');
    assertPositiveInteger(validityDays, '订阅有效天数');
    return generateSub2ApiRedeemCode(
        { type: 'subscription', value: 0, group_id: groupId, validity_days: validityDays },
        idempotencyKey
    );
}
