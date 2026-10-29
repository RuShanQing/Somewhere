import type { StoryReviewDecision, StoryReviewStatus } from '@prisma/client';

export const STORY_STATUS = {
  DRAFT: 'DRAFT',
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  REMOVED: 'REMOVED',
} as const satisfies Record<StoryReviewStatus, StoryReviewStatus>;

export function canEditStory(status: StoryReviewStatus): boolean {
  return status === STORY_STATUS.DRAFT || status === STORY_STATUS.REJECTED;
}

export function canSubmitStory(status: StoryReviewStatus): boolean {
  return status === STORY_STATUS.DRAFT || status === STORY_STATUS.REJECTED;
}

export function canDeleteStory(status: StoryReviewStatus): boolean {
  return status === STORY_STATUS.DRAFT;
}

export function canWithdrawStory(status: StoryReviewStatus): boolean {
  return status === STORY_STATUS.PENDING || status === STORY_STATUS.APPROVED;
}

export function canReviewStory(status: StoryReviewStatus, decision: StoryReviewDecision): boolean {
  if (decision === 'APPROVE' || decision === 'REJECT') {
    return status === STORY_STATUS.PENDING;
  }
  return status === STORY_STATUS.PENDING || status === STORY_STATUS.APPROVED;
}

export interface PublicStoryLike {
  reviewStatus: StoryReviewStatus;
  publishedAt: Date | null;
  archivedAt: Date | null;
  publicConsentAt: Date | null;
}

/**
 * 内存行的公开可见性判断。
 * 与查询侧 `story-visibility.ts` 的 PUBLIC_STORY_CONDITION 必须保持同一含义：
 * APPROVED + 已发布 + 未归档 + 仍有公开授权。
 */
export function isPublicStory(story: PublicStoryLike): boolean {
  return (
    story.reviewStatus === STORY_STATUS.APPROVED &&
    story.publishedAt !== null &&
    story.archivedAt === null &&
    story.publicConsentAt !== null
  );
}

export function shouldPublishOnApproval(
  activeCount: number,
  maxActivePerCity: number,
): boolean {
  return activeCount < maxActivePerCity;
}

export function statusAfterDecision(decision: StoryReviewDecision): StoryReviewStatus {
  switch (decision) {
    case 'APPROVE':
      return STORY_STATUS.APPROVED;
    case 'REJECT':
      return STORY_STATUS.REJECTED;
    case 'REMOVE':
      return STORY_STATUS.REMOVED;
  }
}
