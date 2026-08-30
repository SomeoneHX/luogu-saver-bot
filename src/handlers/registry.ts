import { NapLink } from '@naplink/naplink';
import { OneBotV11 } from '@onebots/protocol-onebot-v11/lib';
import { config } from '@/config';
import { isGroupEnabled } from '@/utils/group-policy';
import { isModuleEnabled } from '@/utils/module-toggle';

export type RegisteredMessageHandler = {
    name: string;
    order: number;
    moduleName?: string;
    group?: (client: NapLink, data: OneBotV11.GroupMessageEvent) => Promise<void>;
    private?: (client: NapLink, data: OneBotV11.PrivateMessageEvent) => Promise<void>;
};

export type RegisteredEventHandler = {
    name: string;
    order: number;
    events: string[];
    moduleName: string;
    handler: (client: NapLink, event: unknown) => Promise<void>;
};

const messageHandlers: RegisteredMessageHandler[] = [];
const eventHandlers: RegisteredEventHandler[] = [];

export function registerMessageHandler(handler: RegisteredMessageHandler): void {
    messageHandlers.push(handler);
    messageHandlers.sort((a, b) => a.order - b.order);
}

export function registerEventHandler(handler: RegisteredEventHandler): void {
    eventHandlers.push(handler);
    eventHandlers.sort((a, b) => a.order - b.order);
}

export function setupRegisteredMessageHandlers(client: NapLink): void {
    client.on('message.group', async (data: OneBotV11.GroupMessageEvent) => {
        if (!isGroupEnabled(data.group_id, config.group.enabledGroupIds)) return;
        for (const handler of messageHandlers) {
            if (handler.moduleName && !(await isModuleEnabled(data.group_id, handler.moduleName))) continue;
            await handler.group?.(client, data);
        }
    });

    client.on('message.private', async (data: OneBotV11.PrivateMessageEvent) => {
        for (const handler of messageHandlers) {
            await handler.private?.(client, data);
        }
    });
}

export function setupRegisteredEventHandlers(client: NapLink): void {
    for (const handler of eventHandlers) {
        for (const event of handler.events) {
            client.on(event, async (data: unknown) => {
                const groupId =
                    typeof data === 'object' && data !== null && 'group_id' in data && typeof data.group_id === 'number'
                        ? data.group_id
                        : Number.NaN;
                const hasGroupId = Number.isSafeInteger(groupId) && groupId > 0;
                if (hasGroupId && !isGroupEnabled(groupId, config.group.enabledGroupIds)) return;
                if (hasGroupId && !(await isModuleEnabled(groupId, handler.moduleName))) return;
                await handler.handler(client, data);
            });
        }
    }
}
