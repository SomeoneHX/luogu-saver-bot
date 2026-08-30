import { AllMessageEvent } from '@/types';
import { MessageSegment } from '@/types/message';
import { MessageBuilder } from '@/utils/message-builder';

export type ParsedCommandMessage = {
    rawMessage: string;
    replyMessageId?: number;
};

export function parseCommandMessage(data: AllMessageEvent): ParsedCommandMessage {
    const segments = data.message?.length
        ? (data.message as MessageSegment[])
        : new MessageBuilder().cqCode(data.raw_message).build();
    const firstSegment = segments[0];
    const replyMessageId =
        firstSegment?.type === 'reply' && Number.isInteger(Number(firstSegment.data.id))
            ? Number(firstSegment.data.id)
            : undefined;

    let startIndex = firstSegment?.type === 'reply' ? 1 : 0;
    const firstCommandSegment = segments[startIndex];
    if (
        firstCommandSegment?.type === 'at' &&
        String((firstCommandSegment.data as { qq?: string | number }).qq) === String(data.self_id)
    ) {
        startIndex += 1;
    }

    return {
        rawMessage: new MessageBuilder().segment(segments.slice(startIndex)).buildCqCode().trimStart(),
        replyMessageId: replyMessageId && replyMessageId > 0 ? replyMessageId : undefined
    };
}

export function isCommandMessage(data: AllMessageEvent, prefix: string): boolean {
    return parseCommandMessage(data).rawMessage.startsWith(prefix);
}
