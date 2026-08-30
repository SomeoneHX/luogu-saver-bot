import { NapLink } from '@naplink/naplink';
import { AllMessageEvent, Command, CommandScope } from '@/types';
import { db } from '@/db';
import { optInMessageEmbedding, optOutMessageEmbedding } from '@/helpers/message-embedding';
import { reply } from '@/utils/client';

export class EmbeddingCommand implements Command<AllMessageEvent> {
    name = 'embedding';
    aliases = ['向量画像'];
    description = '管理消息向量画像隐私设置。';
    usage = {
        'opt-out': '/embedding opt-out',
        'opt-in': '/embedding opt-in'
    };
    scope: CommandScope = 'both';
    alwaysAvailable = true;

    validateArgs(args: string[]): boolean {
        return args.length === 1 && (args[0] === 'opt-out' || args[0] === 'opt-in');
    }

    async execute(args: string[], client: NapLink, data: AllMessageEvent): Promise<void> {
        if (args[0] === 'opt-in') {
            const result = optInMessageEmbedding(db, data.user_id, Date.now());
            await reply(
                client,
                data,
                result.alreadyOptedIn
                    ? '你当前已经加入消息向量画像。'
                    : '已重新加入消息向量画像；你的个人特征向量将从之后的群消息重新建立。'
            );
            return;
        }

        const result = optOutMessageEmbedding(db, data.user_id, Date.now());
        await reply(
            client,
            data,
            result.alreadyOptedOut
                ? '你已经退出消息向量画像；当前没有保存你的个人特征向量。'
                : '已退出消息向量画像；已删除你的个人特征向量，之后的群消息不会再用于该功能。'
        );
    }
}
