import { NapLink } from '@naplink/naplink';
import { AllMessageEvent, Command, CommandScope } from '@/types';
import { db } from '@/db';
import { optOutInactiveMessageEmbeddingUsers } from '@/helpers/message-embedding';
import { reply } from '@/utils/client';
import { parseEmbeddingCutoffTimestamp } from '@/utils/embedding-cutoff';

export class EmbeddingOptOutBeforeCommand implements Command<AllMessageEvent> {
    name = 'embedding-opt-out-before';
    aliases = ['向量批量退出'];
    description = '将最后发言早于指定时刻的用户批量设为消息向量画像 opt-out。';
    usage = '/embedding-opt-out-before <YYYY-MM-DD HH:mm:ss | ISO 8601 | Unix时间戳>';
    scope: CommandScope = 'both';
    superUserOnly = true;
    alwaysAvailable = true;

    validateArgs(args: string[]): boolean {
        return args.length > 0 && parseEmbeddingCutoffTimestamp(args.join(' ')) !== null;
    }

    async execute(args: string[], client: NapLink, data: AllMessageEvent): Promise<void> {
        const cutoffTimestamp = parseEmbeddingCutoffTimestamp(args.join(' '));
        if (cutoffTimestamp === null) {
            await reply(client, data, `时间格式无效。\n用法：${this.usage}`, true);
            return;
        }

        const optedOutCount = optOutInactiveMessageEmbeddingUsers(db, cutoffTimestamp, Date.now());
        await reply(
            client,
            data,
            `已将最后发言时间早于 ${new Date(cutoffTimestamp).toISOString()} 的 ${optedOutCount} 名用户设为 opt-out，并删除其个人特征向量。`,
            true
        );
    }
}
