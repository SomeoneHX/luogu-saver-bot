import assert from 'node:assert/strict';
import test from 'node:test';
import { SaverSchema } from '@/config/schemas/saver';

test('saver config defaults NewAPI and recharge settings', () => {
    const saver = SaverSchema.parse({});

    assert.equal(saver.newApiBaseUrl, 'https://ai.luogu.me');
    assert.equal(saver.newApiAccessToken, '');
    assert.equal(saver.newApiUserId, 0);
    assert.equal(saver.newApiUserAgent, 'luogu-saver-bot/1.0.0');
    assert.deepEqual(saver.rechargeAllowedGroupIds, [1017248143]);
    assert.equal(saver.selfRechargeDailyLimitUsd, 5);
    assert.equal(saver.dailyLimitTimezone, 'Asia/Shanghai');
});

test('saver config provides a safe configurable NewAPI User-Agent', () => {
    assert.equal(
        SaverSchema.parse({ newApiUserAgent: '  SaverBot-Firewall/2.0  ' }).newApiUserAgent,
        'SaverBot-Firewall/2.0'
    );
    assert.throws(() => SaverSchema.parse({ newApiUserAgent: 'invalid\r\nheader' }));
});
