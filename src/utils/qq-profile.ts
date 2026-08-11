function parseQqLevel(value: unknown): number | null {
    if (typeof value === 'number') {
        return Number.isSafeInteger(value) && value >= 0 ? value : null;
    }
    if (typeof value !== 'string') return null;

    const match = value.trim().match(/^(?:lv\.?\s*)?(\d+)$/i);
    if (!match) return null;

    const level = Number(match[1]);
    return Number.isSafeInteger(level) ? level : null;
}

export function resolveQqLevel(profile: unknown): number | null {
    if (!profile || typeof profile !== 'object') return null;

    const record = profile as Record<string, unknown>;
    for (const key of ['qqLevel', 'qq_level', 'level']) {
        const level = parseQqLevel(record[key]);
        if (level !== null) return level;
    }
    return null;
}
