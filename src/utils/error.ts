import axios from 'axios';

export function getErrorMessage(error: unknown, fallback = '未知错误'): string {
    return error instanceof Error ? error.message : fallback;
}

export function getSafeErrorSummary(error: unknown, fallback = '未知错误'): string {
    const parts = [getErrorMessage(error, fallback)];
    if (!axios.isAxiosError(error)) return parts[0];
    if (typeof error.code === 'string' && error.code) parts.push(`code=${error.code}`);
    if (typeof error.response?.status === 'number') parts.push(`status=${error.response.status}`);
    return parts.join(', ');
}

export function logSanitizedError(target: { error(message: string): unknown }, context: string, error: unknown): void {
    target.error(`${context}: ${getSafeErrorSummary(error)}`);
}
