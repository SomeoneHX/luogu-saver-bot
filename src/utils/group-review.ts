export type GroupReviewDecision = 'keyword-mismatch' | 'qq-level-unavailable' | 'qq-level-too-low' | 'approve';

export function evaluateGroupReview(
    message: string,
    autoApproveKeywords: readonly string[],
    minQqLevel: number,
    qqLevel: number | null
): GroupReviewDecision {
    const keywordMatched = autoApproveKeywords
        .map(keyword => keyword.trim())
        .filter(keyword => keyword.length > 0)
        .some(keyword => message.includes(keyword));
    if (!keywordMatched) return 'keyword-mismatch';
    if (minQqLevel <= 0) return 'approve';
    if (qqLevel === null) return 'qq-level-unavailable';
    return qqLevel >= minQqLevel ? 'approve' : 'qq-level-too-low';
}
