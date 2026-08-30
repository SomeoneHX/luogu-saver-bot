export function canViewMessageEmbeddingProfile(
    requesterId: number,
    targetId: number,
    administrator: boolean,
    superUser: boolean
): boolean {
    return requesterId === targetId || administrator || superUser;
}
