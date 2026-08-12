import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { parseSub2ApiResponse, sub2ApiRedeemCodeSchema } from '@/utils/sub2api-contracts';
import { SaverSchema } from '@/config/schemas/saver';

test('parseSub2ApiResponse parses a successful recharge code response', () => {
    const code = parseSub2ApiResponse(
        {
            code: 0,
            message: 'success',
            data: {
                id: 42,
                code: 'REDEEM-CODE',
                type: 'balance',
                value: 5,
                status: 'unused'
            }
        },
        200,
        sub2ApiRedeemCodeSchema
    );

    assert.equal(code.id, 42);
    assert.equal(code.code, 'REDEEM-CODE');
    assert.equal(code.value, 5);
});

test('parseSub2ApiResponse surfaces API errors without exposing the raw response', () => {
    assert.throws(
        () =>
            parseSub2ApiResponse(
                { code: 400, message: 'user not found', reason: 'USER_NOT_FOUND' },
                404,
                z.object({ id: z.number() })
            ),
        /Sub2API 请求失败：user not found/
    );
});

test('parseSub2ApiResponse rejects incompatible payloads', () => {
    assert.throws(
        () =>
            parseSub2ApiResponse(
                { code: 0, message: 'success', data: { id: '42' } },
                200,
                z.object({ id: z.number() })
            ),
        /响应数据格式与当前接入版本不兼容/
    );
});

test('saver config defaults recharge to the designated QQ group', () => {
    const saver = SaverSchema.parse({});

    assert.equal(saver.newApiBaseUrl, 'https://ai.luogu.me');
    assert.equal(saver.newApiAccessToken, '');
    assert.equal(saver.newApiUserId, 0);
    assert.deepEqual(saver.rechargeAllowedGroupIds, [1017248143]);
    assert.equal(saver.sub2ApiBaseUrl, 'https://sub2api.luogu.me');
    assert.equal(saver.sub2ApiRedeemUrl, 'https://sub2api.luogu.me/redeem');
});

test('saver config provides a configurable Sub2API User-Agent', () => {
    assert.equal(SaverSchema.parse({}).sub2ApiUserAgent, 'luogu-saver-bot/1.0.0');
    assert.equal(
        SaverSchema.parse({ sub2ApiUserAgent: '  SaverBot-Firewall/2.0  ' }).sub2ApiUserAgent,
        'SaverBot-Firewall/2.0'
    );
    assert.throws(() => SaverSchema.parse({ sub2ApiUserAgent: 'invalid\r\nheader' }));
});
