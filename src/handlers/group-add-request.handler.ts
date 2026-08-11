import { registerEventHandler } from '@/handlers/registry';
import { NapLink } from '@naplink/naplink';
import { OneBotV11 } from '@onebots/protocol-onebot-v11/lib';
import { config } from '@/config';
import { sendGroupMessage } from '@/utils/client';
import { db } from '@/db';
import { groupBlacklists } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { logger } from '@/utils/logger';
import { resolveQqLevel } from '@/utils/qq-profile';
import { isGroupEnabled } from '@/utils/group-policy';
import { evaluateGroupReview } from '@/utils/group-review';

function isAutoReviewActive(groupId: number): boolean {
    return config.group.autoReviewEnabled && isGroupEnabled(groupId, config.group.enabledGroupIds);
}

export function setupGroupAddRequestHandler() {
    registerEventHandler({
        name: 'group-add-request-handler',
        order: 100,
        events: ['request.group'],
        handler: async (client: NapLink, event: OneBotV11.GroupRequestEvent) => {
            if (event.sub_type !== 'add') return;
            const message = event.comment ?? '';
            const groupId = event.group_id;
            if (!isAutoReviewActive(groupId)) return;

            const blacklistRecord = await db.query.groupBlacklists.findFirst({
                where: and(eq(groupBlacklists.groupId, groupId), eq(groupBlacklists.userId, event.user_id))
            });
            if (!isAutoReviewActive(groupId)) return;

            if (blacklistRecord) {
                const reason = blacklistRecord.reason
                    ? `你已被本群拉黑。原因：${blacklistRecord.reason}`
                    : '你已被本群拉黑。';
                await client.handleGroupRequest(event.flag, event.sub_type, false, reason);
                await sendGroupMessage(
                    client,
                    groupId,
                    `已自动拒绝 ${event.user_id} 的加群请求：该用户在本群黑名单中。${blacklistRecord.reason ? `\n原因：${blacklistRecord.reason}` : ''}`
                );
                return;
            }

            const minQqLevel = config.group.autoApproveMinQqLevel;
            let qqLevel: number | null = null;
            let reviewDecision = evaluateGroupReview(message, config.group.autoApproveKeywords, minQqLevel, qqLevel);
            if (reviewDecision === 'keyword-mismatch') {
                await sendGroupMessage(client, groupId, `收到 ${event.user_id} 的加群请求，验证消息：${message}。`);
                return;
            }

            if (minQqLevel > 0) {
                try {
                    qqLevel = resolveQqLevel(await client.getStrangerInfo(event.user_id, true));
                } catch (error) {
                    logger.warn(`Failed to query QQ level for group request user ${event.user_id}.`, error);
                }
                if (!isAutoReviewActive(groupId)) return;
                const currentMinQqLevel = config.group.autoApproveMinQqLevel;
                reviewDecision = evaluateGroupReview(
                    message,
                    config.group.autoApproveKeywords,
                    currentMinQqLevel,
                    qqLevel
                );

                if (reviewDecision === 'keyword-mismatch') {
                    await sendGroupMessage(
                        client,
                        groupId,
                        `收到 ${event.user_id} 的加群请求；自动审核条件已变更，保留人工审核。`
                    );
                    return;
                }

                if (reviewDecision === 'qq-level-unavailable') {
                    await sendGroupMessage(
                        client,
                        groupId,
                        `收到 ${event.user_id} 的加群请求；验证消息已匹配，但无法获取 QQ 等级，保留人工审核。`
                    );
                    return;
                }
                if (reviewDecision === 'qq-level-too-low') {
                    await sendGroupMessage(
                        client,
                        groupId,
                        `收到 ${event.user_id} 的加群请求；QQ 等级 ${qqLevel} 低于自动通过要求 ${currentMinQqLevel}，保留人工审核。`
                    );
                    return;
                }
            }

            if (!isAutoReviewActive(groupId)) return;
            await client.handleGroupRequest(event.flag, event.sub_type, true);
            await sendGroupMessage(
                client,
                groupId,
                `已自动通过 ${event.user_id} 的加群请求${qqLevel === null ? '' : `（QQ 等级 ${qqLevel}）`}，验证消息：${message}。`
            );
        }
    });
}
