import { NapLink } from '@naplink/naplink';
import { OneBotV11 } from '@onebots/protocol-onebot-v11/lib';
import { Command, CommandScope } from '@/types';
import { db } from '@/db';
import { getUserMessageEmbeddingSummary } from '@/helpers/message-embedding';
import { normalizeUserTargets } from '@/utils/command-args';
import { reply } from '@/utils/client';
import { canViewMessageEmbeddingProfile } from '@/utils/embedding-profile-access';
import { isAdminByData, isSuperUser } from '@/utils/permission';
import { isValidPositiveInteger } from '@/utils/validator';

export class EmbeddingProfileCommand implements Command<OneBotV11.GroupMessageEvent> {
    name = 'embedding-profile';
    aliases = ['向量特征'];
    description = '查看群成员当前的跨群特征向量概要。';
    usage = '/embedding-profile [QQ号/@用户]';
    scope: CommandScope = 'group';
    normalizeArgs = normalizeUserTargets(0);

    validateArgs(args: string[]): boolean {
        return args.length === 0 || (args.length === 1 && isValidPositiveInteger(args[0]));
    }

    async execute(args: string[], client: NapLink, data: OneBotV11.GroupMessageEvent): Promise<void> {
        const targetId = args.length === 0 ? data.user_id : Number(args[0]);
        const superUser = isSuperUser(data.user_id);
        const administrator = targetId !== data.user_id && !superUser ? await isAdminByData(client, data) : false;
        if (!canViewMessageEmbeddingProfile(data.user_id, targetId, administrator, superUser)) {
            await reply(client, data, '权限不足，普通群成员只能查询自己的向量特征。');
            return;
        }

        let displayName = data.sender.nickname;
        if (targetId !== data.user_id) {
            try {
                const memberInfo = (await client.getGroupMemberInfo(
                    data.group_id,
                    targetId
                )) as OneBotV11.GroupMemberInfo;
                displayName = memberInfo.card || memberInfo.nickname || String(targetId);
            } catch {
                await reply(client, data, `无法确认用户 ${targetId} 是本群成员。`);
                return;
            }
        }

        const summary = getUserMessageEmbeddingSummary(db, targetId);
        if (!summary) {
            await reply(client, data, `群成员 ${displayName}（${targetId}）当前没有可用的个人向量特征。`);
            return;
        }

        const preview = summary.preview.map(value => value.toPrecision(6)).join(', ');
        await reply(
            client,
            data,
            [
                `群成员 ${displayName}（${targetId}）的跨群特征向量概要`,
                `模型: ${summary.model || '-'}`,
                `维度: ${summary.dimensions}`,
                `有效权重: ${summary.effectiveWeight.toPrecision(6)}`,
                `分量均值: ${summary.componentMean.toPrecision(6)}`,
                `分量范围: [${summary.minimum.toPrecision(6)}, ${summary.maximum.toPrecision(6)}]`,
                `L2 范数: ${summary.l2Norm.toPrecision(6)}`,
                `前 ${summary.preview.length} 维: [${preview}]`,
                `更新时间: ${new Date(summary.updatedAt).toLocaleString()}`
            ].join('\n')
        );
    }
}
