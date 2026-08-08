import { maskEmail } from '@/utils/email';
import type {
    Sub2ApiBalancePackagePlan,
    Sub2ApiGroup,
    Sub2ApiUser,
    Sub2ApiUserBalancePackage
} from '@/utils/sub2api-contracts';

function formatUsd(value: number): string {
    return `$${value.toFixed(2)}`;
}

function formatLimit(value: number | null): string {
    return value === null ? '不限' : formatUsd(value);
}

function formatDateTime(value: string): string {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
}

function formatValidity(days: number, unit: string): string {
    const unitNames: Record<string, string> = { day: '天', month: '个月', year: '年' };
    return `${days}${unitNames[unit] ?? unit}`;
}

export function formatSub2ApiUserInfo(user: Sub2ApiUser): string {
    return [
        'Sub2API 用户信息',
        `ID: ${user.id}`,
        `用户名: ${user.username || '-'}`,
        `邮箱: ${user.email ? maskEmail(user.email) : '-'}`,
        `状态: ${user.status || '-'}`,
        `余额: ${formatUsd(user.balance)}`,
        `冻结余额: ${formatUsd(user.frozen_balance)}`,
        `并发: ${user.current_concurrency}/${user.concurrency}`,
        `RPM 限制: ${user.rpm_limit > 0 ? user.rpm_limit : '不限'}`,
        `允许分组: ${user.allowed_groups === null ? '全部非专属分组' : user.allowed_groups.length > 0 ? user.allowed_groups.join(', ') : '无'}`
    ].join('\n');
}

export function formatSub2ApiUserSearchResults(users: Sub2ApiUser[]): string {
    if (users.length === 0) return '没有搜索到 Sub2API 用户。';
    return [
        `Sub2API 用户搜索结果（${users.length} 个）`,
        ...users.map(user =>
            [
                `ID: ${user.id}`,
                `用户名: ${user.username || '-'}`,
                `邮箱: ${user.email ? maskEmail(user.email) : '-'}`,
                `状态: ${user.status || '-'}`,
                `余额: ${formatUsd(user.balance)}`
            ].join('\n')
        )
    ].join('\n\n');
}

export function formatSub2ApiGroups(groups: Sub2ApiGroup[]): string {
    if (groups.length === 0) return '当前没有可用的 Sub2API 分组。';
    return [
        `Sub2API 分组（${groups.length} 个）`,
        ...groups.map(group =>
            [
                `#${group.id} ${group.name || '-'}`,
                `平台: ${group.platform || '-'} / 状态: ${group.status || '-'}`,
                `倍率: ${group.rate_multiplier}`,
                `限额: 日 ${formatLimit(group.daily_limit_usd)} / 周 ${formatLimit(group.weekly_limit_usd)} / 月 ${formatLimit(group.monthly_limit_usd)}`
            ].join('\n')
        )
    ].join('\n\n');
}

export function formatSub2ApiModels(groupId: number, models: string[]): string {
    if (models.length === 0) return `Sub2API 分组 ${groupId} 当前没有候选模型。`;
    return [
        `Sub2API 分组 ${groupId} 候选模型（${models.length} 个）`,
        ...models.map((model, index) => `${index + 1}. ${model}`)
    ].join('\n');
}

export function formatSub2ApiBalancePackagePlans(
    originalPlans: Sub2ApiBalancePackagePlan[],
    showUnavailable = false
): string {
    const plans = showUnavailable ? originalPlans : originalPlans.filter(plan => plan.for_sale);
    if (plans.length === 0) return '当前没有可用的 Sub2API 余额包计划。';
    return [
        `Sub2API 余额包计划（${plans.length} 个）`,
        ...plans.map(plan =>
            [
                `#${plan.id} ${plan.name || '-'}`,
                `售价: ${plan.currency ? `${plan.currency} ` : ''}${plan.price.toFixed(2)}${plan.for_sale ? '' : '（未上架）'}`,
                `额度: ${formatUsd(plan.monthly_limit_usd ?? plan.balance_amount)} / 有效期: ${formatValidity(plan.validity_days, plan.validity_unit)}`,
                `限额: 日 ${formatLimit(plan.daily_limit_usd)} / 周 ${formatLimit(plan.weekly_limit_usd)} / 月 ${formatLimit(plan.monthly_limit_usd)}`,
                plan.description ? `说明: ${plan.description}` : null
            ]
                .filter((line): line is string => line !== null)
                .join('\n')
        )
    ].join('\n\n');
}

export function formatSub2ApiUserBalancePackages(packages: Sub2ApiUserBalancePackage[]): string {
    if (packages.length === 0) return '当前没有 Sub2API 余额包。';
    return [
        `Sub2API 用户余额包（${packages.length} 个）`,
        ...packages.map(item =>
            [
                `#${item.id} ${item.name || `计划 ${item.plan_id ?? '-'}`}`,
                `状态: ${item.status || '-'}`,
                `可用: ${formatUsd(item.effective_available)} / 剩余: ${formatUsd(item.remaining_amount)} / 总额: ${formatUsd(item.total_amount)}`,
                `用量: 日 ${formatUsd(item.daily_usage_usd)} / 周 ${formatUsd(item.weekly_usage_usd)} / 月 ${formatUsd(item.monthly_usage_usd)}`,
                `有效期: ${formatDateTime(item.starts_at)} - ${formatDateTime(item.expires_at)}`
            ].join('\n')
        )
    ].join('\n\n');
}
