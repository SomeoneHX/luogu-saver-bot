import { NapLink } from '@naplink/naplink';
import { OneBotV11 } from '@onebots/protocol-onebot-v11/lib';
import { AllMessageEvent, Command, CommandScope } from '@/types';
import { reply, sendPrivateMessage } from '@/utils/client';
import {
    createSub2ApiSubscriptionRedeemCode,
    getSub2ApiBalancePackagePlans,
    getSub2ApiGroupModels,
    getSub2ApiGroups,
    getSub2ApiUser,
    getSub2ApiUserBalancePackages,
    grantSub2ApiUserBalancePackage,
    restoreSub2ApiUserBalancePackage,
    searchSub2ApiUsers,
    voidSub2ApiUserBalancePackage
} from '@/utils/sub2api-client';
import {
    formatSub2ApiBalancePackagePlans,
    formatSub2ApiGroups,
    formatSub2ApiModels,
    formatSub2ApiUserBalancePackages,
    formatSub2ApiUserInfo,
    formatSub2ApiUserSearchResults
} from '@/utils/sub2api-format';
import { getSub2ApiBindingByUserId, upsertSub2ApiBinding } from '@/utils/sub2api-bindings';
import { isSuperUser } from '@/utils/permission';
import { maskEmail } from '@/utils/email';
import {
    composeArgNormalizers,
    normalizeConditionalUserTargets,
    normalizeSubcommandUserTargets
} from '@/utils/command-args';
import { EmailVerificationStore, sendVerificationEmail } from '@/utils/email-verification';
import { getErrorMessage } from '@/utils/error';
import { isLikelyQqId } from '@/utils/user-target';
import { validateSub2ApiArgs } from '@/commands/sub2api-args';

type Sub2ApiVerification = {
    sub2ApiUserId: number;
};

type Sub2ApiTargetResolution = {
    sub2ApiUserId: number | null;
    qqUserId: number | null;
    targetLabel: string | null;
    errorMessage: string | null;
};

function buildCommandIdempotencyKey(data: AllMessageEvent, action: string): string {
    const scope = data.message_type === 'group' ? `group-${data.group_id}` : `private-${data.user_id}`;
    return `lgs-bot-${action}-${scope}-${data.message_id}`;
}

export class Sub2ApiCommand implements Command<AllMessageEvent> {
    name = 'sub2api';
    aliases = ['额度'];
    description = '绑定 Sub2API 用户并查询余额、分组和余额包。';
    usage = {
        me: '/sub2api me',
        bind: '/sub2api bind <Sub2API 用户 ID> [QQ 号/@用户]\n/sub2api bind query [QQ 号/@用户]',
        verify: '/sub2api verify <6 位验证码>',
        user: {
            query: '/sub2api user query [Sub2API 用户 ID/QQ 号/@用户]',
            search: '/sub2api user search <关键词>（超级管理员）'
        },
        group: {
            list: '/sub2api group list',
            models: '/sub2api group models <分组 ID>'
        },
        package: {
            list: '/sub2api package list',
            query: '/sub2api package query [Sub2API 用户 ID/QQ 号/@用户]',
            grant: '/sub2api package grant <计划 ID> <Sub2API 用户 ID/QQ 号/@用户>',
            void: '/sub2api package void <用户余额包 ID>',
            restore: '/sub2api package restore <用户余额包 ID>'
        },
        code: {
            subscription: '/sub2api code subscription <分组 ID> <有效天数>'
        }
    };
    scope: CommandScope = 'both';
    normalizeArgs = composeArgNormalizers(
        normalizeSubcommandUserTargets('bind', { 3: [2] }),
        normalizeConditionalUserTargets(args => args[0] === 'user' && args[1] === 'query', 2),
        normalizeConditionalUserTargets(args => args[0] === 'package' && args[1] === 'query', 2),
        normalizeConditionalUserTargets(args => args[0] === 'package' && args[1] === 'grant', 3)
    );

    private verificationStore = new EmailVerificationStore<Sub2ApiVerification>();

    validateArgs = validateSub2ApiArgs;

    async execute(
        args: string[],
        client: NapLink,
        data: OneBotV11.GroupMessageEvent | OneBotV11.PrivateMessageEvent
    ): Promise<void> {
        if (args[0] === 'me') {
            await this.handleUser(['query'], client, data);
            return;
        }
        if (args[0] === 'bind') {
            if (args[1] === 'query') await this.handleBindQuery(args[2], client, data);
            else if (args.length === 2) await this.handleBind(Number(args[1]), client, data);
            else await this.handleAdminBind(Number(args[1]), args[2], client, data);
            return;
        }
        if (args[0] === 'verify') {
            await this.handleVerify(args[1], client, data);
            return;
        }
        if (args[0] === 'user') {
            await this.handleUser(args.slice(1), client, data);
            return;
        }
        if (args[0] === 'group') {
            await this.handleGroup(args.slice(1), client, data);
            return;
        }
        if (args[0] === 'package') {
            await this.handlePackage(args.slice(1), client, data);
            return;
        }
        await this.handleSubscriptionCode(Number(args[2]), Number(args[3]), client, data);
    }

    private async requireSuperUser(client: NapLink, data: AllMessageEvent): Promise<boolean> {
        if (isSuperUser(data.user_id)) return true;
        await reply(client, data, '权限不足，需要超级管理员权限。');
        return false;
    }

    private async handleBind(sub2ApiUserId: number, client: NapLink, data: AllMessageEvent): Promise<void> {
        try {
            const user = await getSub2ApiUser(sub2ApiUserId);
            if (!user.email) {
                await reply(client, data, '这个 Sub2API 用户没有可验证的邮箱，请先在 Sub2API 中绑定邮箱。');
                return;
            }

            this.verificationStore.assertCanSend(data.user_id);
            const verification = this.verificationStore.create(data.user_id, user.email, { sub2ApiUserId });
            await sendVerificationEmail(user.email, 'LGS-Bot Sub2API 绑定验证码', verification.code, 'Sub2API 绑定');
            this.verificationStore.markSent(data.user_id);
            await reply(
                client,
                data,
                `验证码已发送至 ${maskEmail(user.email)}。\n请使用 /sub2api verify <验证码> 完成绑定。\n验证码有效期为 10 分钟。`
            );
        } catch (error) {
            await reply(client, data, `绑定失败：${getErrorMessage(error)}`);
        }
    }

    private async handleAdminBind(
        sub2ApiUserId: number,
        target: string,
        client: NapLink,
        data: AllMessageEvent
    ): Promise<void> {
        if (!(await this.requireSuperUser(client, data))) return;
        const targetUserId = Number(target);
        try {
            await getSub2ApiUser(sub2ApiUserId);
            await upsertSub2ApiBinding(targetUserId, sub2ApiUserId);
            await reply(client, data, `已将 QQ 用户 ${targetUserId} 绑定到 Sub2API 用户 ${sub2ApiUserId}。`);
        } catch (error) {
            await reply(client, data, `绑定失败：${getErrorMessage(error)}`);
        }
    }

    private async handleBindQuery(target: string | undefined, client: NapLink, data: AllMessageEvent): Promise<void> {
        const targetUserId = target ? Number(target) : data.user_id;
        if (target && !(await this.requireSuperUser(client, data))) return;
        const binding = await getSub2ApiBindingByUserId(targetUserId);
        if (!binding) {
            await reply(client, data, `QQ 用户 ${targetUserId} 还没有绑定 Sub2API 用户。`);
            return;
        }
        await reply(client, data, `QQ 用户 ${targetUserId} 已绑定 Sub2API 用户 ${binding.sub2ApiUserId}。`);
    }

    private async handleVerify(code: string, client: NapLink, data: AllMessageEvent): Promise<void> {
        const verification = this.verificationStore.verify(data.user_id, code);
        if (!verification) {
            await reply(client, data, '验证码错误或已过期，请重新使用 /sub2api bind <用户ID> 获取验证码。');
            return;
        }
        try {
            await upsertSub2ApiBinding(data.user_id, verification.payload.sub2ApiUserId);
            await reply(client, data, `已绑定 Sub2API 用户 ${verification.payload.sub2ApiUserId}。`);
        } catch (error) {
            await reply(client, data, `验证失败：${getErrorMessage(error)}`);
        }
    }

    private async resolveTarget(
        target: string | undefined,
        data: AllMessageEvent,
        action: string
    ): Promise<Sub2ApiTargetResolution> {
        if (!target) {
            const binding = await getSub2ApiBindingByUserId(data.user_id);
            if (!binding) {
                return {
                    sub2ApiUserId: null,
                    qqUserId: data.user_id,
                    targetLabel: null,
                    errorMessage: '你还没有绑定 Sub2API 用户，请先使用 /sub2api bind <用户ID>。'
                };
            }
            return {
                sub2ApiUserId: binding.sub2ApiUserId,
                qqUserId: data.user_id,
                targetLabel: `QQ 用户 ${data.user_id} 绑定的 Sub2API 用户 ${binding.sub2ApiUserId}`,
                errorMessage: null
            };
        }

        const targetUserId = Number(target);
        const binding = await getSub2ApiBindingByUserId(targetUserId);
        if (binding) {
            return {
                sub2ApiUserId: binding.sub2ApiUserId,
                qqUserId: targetUserId,
                targetLabel: `QQ 用户 ${targetUserId} 绑定的 Sub2API 用户 ${binding.sub2ApiUserId}`,
                errorMessage: null
            };
        }
        if (isLikelyQqId(target)) {
            return {
                sub2ApiUserId: null,
                qqUserId: targetUserId,
                targetLabel: null,
                errorMessage: `QQ 用户 ${targetUserId} 还没有绑定 Sub2API 用户，无法${action}。`
            };
        }
        return {
            sub2ApiUserId: Number(target),
            qqUserId: null,
            targetLabel: `Sub2API 用户 ${target}`,
            errorMessage: null
        };
    }

    private async handleUser(args: string[], client: NapLink, data: AllMessageEvent): Promise<void> {
        if (args[0] === 'search') {
            if (!(await this.requireSuperUser(client, data))) return;
            try {
                const users = await searchSub2ApiUsers(args.slice(1).join(' '), 3);
                await reply(client, data, formatSub2ApiUserSearchResults(users));
            } catch (error) {
                await reply(client, data, `搜索失败：${getErrorMessage(error)}`);
            }
            return;
        }
        if (args[1] && !(await this.requireSuperUser(client, data))) return;
        const resolution = await this.resolveTarget(args[1], data, '查询用户信息');
        if (!resolution.sub2ApiUserId) {
            await reply(client, data, resolution.errorMessage ?? '无法解析目标用户。');
            return;
        }
        try {
            const user = await getSub2ApiUser(resolution.sub2ApiUserId);
            await reply(client, data, formatSub2ApiUserInfo(user));
        } catch (error) {
            await reply(client, data, `查询失败：${getErrorMessage(error)}`);
        }
    }

    private async handleGroup(args: string[], client: NapLink, data: AllMessageEvent): Promise<void> {
        try {
            if (args[0] === 'list') {
                await reply(client, data, formatSub2ApiGroups(await getSub2ApiGroups()));
                return;
            }
            const groupId = Number(args[1]);
            await reply(client, data, formatSub2ApiModels(groupId, await getSub2ApiGroupModels(groupId)));
        } catch (error) {
            await reply(client, data, `查询失败：${getErrorMessage(error)}`);
        }
    }

    private async handlePackage(args: string[], client: NapLink, data: AllMessageEvent): Promise<void> {
        if (args[0] === 'list') {
            try {
                const plans = await getSub2ApiBalancePackagePlans();
                await reply(client, data, formatSub2ApiBalancePackagePlans(plans, isSuperUser(data.user_id)));
            } catch (error) {
                await reply(client, data, `查询失败：${getErrorMessage(error)}`);
            }
            return;
        }
        if (args[0] === 'query') {
            await this.handlePackageQuery(args[1], client, data);
            return;
        }
        if (args[0] === 'grant') {
            await this.handlePackageGrant(Number(args[1]), args[2], client, data);
            return;
        }
        await this.handlePackageState(args[0], Number(args[1]), client, data);
    }

    private async handlePackageQuery(
        target: string | undefined,
        client: NapLink,
        data: AllMessageEvent
    ): Promise<void> {
        if (target && !(await this.requireSuperUser(client, data))) return;
        const resolution = await this.resolveTarget(target, data, '查询余额包');
        if (!resolution.sub2ApiUserId) {
            await reply(client, data, resolution.errorMessage ?? '无法解析目标用户。');
            return;
        }
        try {
            const packages = await getSub2ApiUserBalancePackages(resolution.sub2ApiUserId);
            await reply(client, data, formatSub2ApiUserBalancePackages(packages));
        } catch (error) {
            await reply(client, data, `查询失败：${getErrorMessage(error)}`);
        }
    }

    private async handlePackageGrant(
        planId: number,
        target: string,
        client: NapLink,
        data: AllMessageEvent
    ): Promise<void> {
        if (!(await this.requireSuperUser(client, data))) return;
        const resolution = await this.resolveTarget(target, data, '发放余额包');
        if (!resolution.sub2ApiUserId) {
            await reply(client, data, resolution.errorMessage ?? '无法解析目标用户。');
            return;
        }
        try {
            const item = await grantSub2ApiUserBalancePackage(
                resolution.sub2ApiUserId,
                planId,
                `LGS-Bot 管理员 ${data.user_id} 发放`
            );
            await reply(
                client,
                data,
                `已为 ${resolution.targetLabel} 发放余额包计划 ${planId}，用户余额包 ID 为 ${item.id}。`
            );
        } catch (error) {
            await reply(client, data, `发放失败：${getErrorMessage(error)}`);
        }
    }

    private async handlePackageState(
        action: string,
        packageId: number,
        client: NapLink,
        data: AllMessageEvent
    ): Promise<void> {
        if (!(await this.requireSuperUser(client, data))) return;
        try {
            const reason = `LGS-Bot 管理员 ${data.user_id} ${action === 'void' ? '作废' : '恢复'}`;
            if (action === 'void') await voidSub2ApiUserBalancePackage(packageId, reason);
            else await restoreSub2ApiUserBalancePackage(packageId, reason);
            await reply(client, data, `已${action === 'void' ? '作废' : '恢复'}用户余额包 ${packageId}。`);
        } catch (error) {
            await reply(client, data, `${action === 'void' ? '作废' : '恢复'}失败：${getErrorMessage(error)}`);
        }
    }

    private async handleSubscriptionCode(
        groupId: number,
        validityDays: number,
        client: NapLink,
        data: AllMessageEvent
    ): Promise<void> {
        if (!(await this.requireSuperUser(client, data))) return;
        try {
            const result = await createSub2ApiSubscriptionRedeemCode(
                groupId,
                validityDays,
                buildCommandIdempotencyKey(data, `subscription-${groupId}-${validityDays}`)
            );
            const message = `Sub2API 订阅兑换码\n分组: ${groupId}\n有效天数: ${validityDays}\n兑换码: ${result.code}`;
            if (data.message_type === 'private') {
                await reply(client, data, message);
                return;
            }
            try {
                await sendPrivateMessage(client, data.user_id, message);
                await reply(client, data, '订阅兑换码已生成并私信发送给你。');
            } catch {
                await reply(
                    client,
                    data,
                    `订阅兑换码已生成但私信失败，请前往 Sub2API 后台查看兑换码记录 #${result.id}。`
                );
            }
        } catch (error) {
            await reply(client, data, `生成失败：${getErrorMessage(error)}`);
        }
    }
}
