const SHANGHAI_DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/;

export function parseEmbeddingCutoffTimestamp(input: string): number | null {
    const value = input.trim();
    if (!value) return null;

    if (/^\d{1,10}$/.test(value)) {
        const seconds = Number(value);
        const timestamp = seconds * 1_000;
        return Number.isSafeInteger(timestamp) ? timestamp : null;
    }
    if (/^\d{13}$/.test(value)) {
        const timestamp = Number(value);
        return Number.isSafeInteger(timestamp) ? timestamp : null;
    }

    const shanghaiMatch = SHANGHAI_DATE_TIME_PATTERN.exec(value);
    if (shanghaiMatch) {
        const [, yearText, monthText, dayText, hourText = '00', minuteText = '00', secondText = '00'] = shanghaiMatch;
        const year = Number(yearText);
        const month = Number(monthText);
        const day = Number(dayText);
        const hour = Number(hourText);
        const minute = Number(minuteText);
        const second = Number(secondText);
        const daysInMonth = month >= 1 && month <= 12 ? new Date(Date.UTC(year, month, 0)).getUTCDate() : 0;
        if (year < 1970 || day < 1 || day > daysInMonth || hour > 23 || minute > 59 || second > 59) {
            return null;
        }
        return Date.UTC(year, month - 1, day, hour - 8, minute, second);
    }

    if (!/T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) return null;
    const timestamp = Date.parse(value);
    return Number.isSafeInteger(timestamp) && timestamp >= 0 ? timestamp : null;
}
