import { NapLink } from '@naplink/naplink';
import { OneBotV11 } from '@onebots/protocol-onebot-v11/lib';
import { Command, CommandScope } from '@/types';
import { db } from '@/db';
import { getGroupMessageEmbeddingSummary } from '@/helpers/message-embedding';
import { reply } from '@/utils/client';
import { isAdminByData, isSuperUser } from '@/utils/permission';

export class EmbeddingSummaryCommand implements Command<OneBotV11.GroupMessageEvent> {
    name = 'embedding-summary';
    aliases = ['向量概要'];
    description = '查看本群消息均值向量概要。';
    usage = '/embedding-summary';
    scope: CommandScope = 'group';

    validateArgs(args: string[]): boolean {
        return args.length === 0;
    }

    async execute(_args: string[], client: NapLink, data: OneBotV11.GroupMessageEvent): Promise<void> {
        if (!isSuperUser(data.user_id) && !(await isAdminByData(client, data))) {
            await reply(client, data, '权限不足，需要管理员或超级管理员权限。');
            return;
        }

        const summary = getGroupMessageEmbeddingSummary(db, data.group_id);
        if (!summary) {
            await reply(client, data, '本群尚未记录消息均值向量。');
            return;
        }

        const preview = summary.preview.map(value => value.toPrecision(6)).join(', ');
        await reply(
            client,
            data,
            [
                '本群消息均值向量概要',
                `模型: ${summary.model || '-'}`,
                `样本数: ${summary.sampleCount}`,
                `维度: ${summary.dimensions}`,
                `分量均值: ${summary.componentMean.toPrecision(6)}`,
                `分量范围: [${summary.minimum.toPrecision(6)}, ${summary.maximum.toPrecision(6)}]`,
                `L2 范数: ${summary.l2Norm.toPrecision(6)}`,
                `前 ${summary.preview.length} 维: [${preview}]`,
                `更新时间: ${new Date(summary.updatedAt).toLocaleString()}`
            ].join('\n')
        );
    }
}
