export function isGroupEnabled(groupId: number, enabledGroupIds: readonly number[] | null): boolean {
    return enabledGroupIds === null || enabledGroupIds.includes(groupId);
}
