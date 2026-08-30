import assert from 'node:assert/strict';
import test from 'node:test';
import { getSafeErrorSummary, logSanitizedError } from '@/utils/error';

test('sanitized Axios errors expose only message, code, and status', () => {
    const error = Object.assign(new Error('Request failed with status code 401'), {
        name: 'AxiosError',
        isAxiosError: true,
        code: 'ERR_BAD_REQUEST',
        response: { status: 401 },
        config: {
            headers: { Authorization: 'Bearer secret-api-key' },
            data: JSON.stringify({ input: 'private group message' })
        }
    });

    const summary = getSafeErrorSummary(error);
    assert.equal(summary, 'Request failed with status code 401, code=ERR_BAD_REQUEST, status=401');
    assert.doesNotMatch(summary, /secret-api-key|private group message|Authorization/);
});

test('sanitized error logging passes exactly one safe string to Winston-compatible loggers', () => {
    const calls: string[] = [];
    const target = {
        error(message: string): void {
            calls.push(message);
        }
    };
    const error = Object.assign(new Error('Network Error'), {
        name: 'AxiosError',
        isAxiosError: true,
        code: 'ERR_NETWORK',
        config: {
            headers: { Authorization: 'Bearer another-secret' },
            data: 'another private group message'
        }
    });

    logSanitizedError(target, 'Embedding request failed', error);
    assert.deepEqual(calls, ['Embedding request failed: Network Error, code=ERR_NETWORK']);
    assert.doesNotMatch(calls[0], /another-secret|another private group message|Authorization/);
});
