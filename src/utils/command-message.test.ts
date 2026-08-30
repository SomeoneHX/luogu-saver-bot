import assert from 'node:assert/strict';
import test from 'node:test';
import { AllMessageEvent } from '@/types';
import { isCommandMessage, parseCommandMessage } from '@/utils/command-message';

function messageEvent(overrides: Record<string, unknown>): AllMessageEvent {
    return {
        self_id: 42,
        user_id: 7,
        time: 1,
        message_type: 'group',
        sub_type: 'normal',
        message_id: 1,
        group_id: 100,
        message: [],
        raw_message: '',
        font: 0,
        sender: {},
        post_type: 'message',
        ...overrides
    } as unknown as AllMessageEvent;
}

test('command detection excludes prefixed messages from semantic ingestion', () => {
    assert.equal(isCommandMessage(messageEvent({ raw_message: '/guess 这是谁说的' }), '/'), true);
    assert.equal(isCommandMessage(messageEvent({ raw_message: '/unknown 参数' }), '/'), true);
    assert.equal(isCommandMessage(messageEvent({ raw_message: '普通聊天消息' }), '/'), false);
});

test('command parsing handles replies and an at-mention of the bot', () => {
    const parsed = parseCommandMessage(
        messageEvent({
            raw_message: '[CQ:reply,id=9][CQ:at,qq=42] /guess 测试',
            message: [
                { type: 'reply', data: { id: '9' } },
                { type: 'at', data: { qq: '42' } },
                { type: 'text', data: { text: ' /guess 测试' } }
            ]
        })
    );

    assert.equal(parsed.rawMessage, '/guess 测试');
    assert.equal(parsed.replyMessageId, 9);
});
