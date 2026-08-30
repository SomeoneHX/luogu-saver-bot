import { OneBotV11 } from '@onebots/protocol-onebot-v11/lib';
import { NapLink } from '@naplink/naplink';
import { config } from '@/config';
import { db } from '@/db';
import { MessageEmbeddingCommitQueue } from '@/helpers/message-embedding-queue';
import { getMessageEmbeddingPreference, recordMessageEmbedding } from '@/helpers/message-embedding';
import { registerMessageHandler } from '@/handlers/registry';
import { createEmbedding } from '@/utils/embedding-client';
import { logger } from '@/utils/logger';
import { logSanitizedError } from '@/utils/error';
import { isModuleEnabled } from '@/utils/module-toggle';

const commitQueue = new MessageEmbeddingCommitQueue();

async function handleMessageEmbedding(_client: NapLink, data: OneBotV11.GroupMessageEvent): Promise<void> {
    if (data.user_id === data.self_id) return;

    const input = data.raw_message.trim();
    const settings = { ...config.embedding };
    if (!input || !settings.endpoint) return;
    const preference = getMessageEmbeddingPreference(db, data.user_id);
    if (preference.optedOut) return;

    const groupId = data.group_id;
    const userId = data.user_id;
    const timestamp = Number.isFinite(data.time) && data.time > 0 ? Math.trunc(data.time * 1000) : Date.now();
    const spaceKey = `${settings.endpoint}\u0000${settings.model}`;
    void commitQueue
        .enqueue(
            groupId,
            userId,
            () => createEmbedding(input, settings),
            async embedding => {
                if (!(await isModuleEnabled(groupId, 'message-embedding'))) return;
                recordMessageEmbedding(db, {
                    groupId,
                    userId,
                    preferenceRevision: preference.revision,
                    embedding,
                    spaceKey,
                    timestamp,
                    decayHalfLifeMs: settings.decayHalfLifeMs
                });
            }
        )
        .catch(error => {
            logSanitizedError(
                logger,
                `Failed to update message embedding for user ${userId} in group ${groupId}`,
                error
            );
        });
}

export function setupMessageEmbeddingHandler(): void {
    registerMessageHandler({
        name: 'message-embedding',
        order: -100,
        moduleName: 'message-embedding',
        group: handleMessageEmbedding
    });
}
