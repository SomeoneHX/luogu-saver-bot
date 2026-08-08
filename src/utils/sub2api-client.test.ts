import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSub2ApiResponse, sub2ApiBalancePackagePlanSchema, sub2ApiUserSchema } from '@/utils/sub2api-contracts';
import { formatSub2ApiBalancePackagePlans, formatSub2ApiUserInfo } from '@/utils/sub2api-format';
import { SaverSchema } from '@/config/schemas/saver';

test('parseSub2ApiResponse parses a successful user response with defaults', () => {
    const user = parseSub2ApiResponse(
        {
            code: 0,
            message: 'success',
            data: {
                id: 42,
                email: 'user@example.com',
                balance: 12.5,
                internal_field: 'ignored'
            }
        },
        200,
        sub2ApiUserSchema
    );

    assert.equal(user.id, 42);
    assert.equal(user.balance, 12.5);
    assert.equal(user.username, '');
    assert.equal(user.allowed_groups, null);
    assert.equal('internal_field' in user, false);
});

test('user contract accepts null allowed_groups and preserves its all-groups meaning', () => {
    const user = sub2ApiUserSchema.parse({ id: 42, allowed_groups: null });

    assert.equal(user.allowed_groups, null);
    assert.match(formatSub2ApiUserInfo(user), /允许分组: 全部非专属分组/);
});

test('parseSub2ApiResponse surfaces API errors without exposing the raw response', () => {
    assert.throws(
        () =>
            parseSub2ApiResponse(
                { code: 400, message: 'user not found', reason: 'USER_NOT_FOUND' },
                404,
                sub2ApiUserSchema
            ),
        /Sub2API 请求失败：user not found/
    );
});

test('parseSub2ApiResponse rejects incompatible payloads', () => {
    assert.throws(
        () => parseSub2ApiResponse({ code: 0, message: 'success', data: { id: '42' } }, 200, sub2ApiUserSchema),
        /响应数据格式与当前接入版本不兼容/
    );
});

test('balance package formatting hides unavailable plans for regular users', () => {
    const visible = sub2ApiBalancePackagePlanSchema.parse({
        id: 1,
        name: 'Starter',
        price: 5,
        balance_amount: 10,
        validity_days: 30,
        validity_unit: 'day',
        monthly_limit_usd: 10,
        for_sale: true
    });
    const hidden = sub2ApiBalancePackagePlanSchema.parse({
        id: 2,
        name: 'Internal',
        price: 1,
        balance_amount: 1,
        validity_days: 1,
        validity_unit: 'day',
        monthly_limit_usd: 1,
        for_sale: false
    });

    const output = formatSub2ApiBalancePackagePlans([visible, hidden]);
    assert.match(output, /Starter/);
    assert.doesNotMatch(output, /Internal/);
});

test('saver config defaults recharge to the designated QQ group', () => {
    const saver = SaverSchema.parse({});

    assert.deepEqual(saver.rechargeAllowedGroupIds, [1017248143]);
});
