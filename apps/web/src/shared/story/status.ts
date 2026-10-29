import type { OwnStory } from '../api/client';

export type StoryStatus = OwnStory['reviewStatus'];

const STATUS_LABELS: Record<StoryStatus, string> = {
  DRAFT: '草稿',
  PENDING: '等待审核',
  APPROVED: '已通过',
  REJECTED: '未通过',
  REMOVED: '已撤回或下架',
};

const STATUS_HINTS: Record<StoryStatus, string> = {
  DRAFT: '只有你能看到这份草稿；提交后才会进入审核。',
  PENDING: '已经提交，正在等待管理员审核。审核期间不能直接修改。',
  APPROVED: '已经通过审核；是否公开展示由公开授权和城市名额决定。',
  REJECTED: '这次没有通过审核，可以修改内容后重新提交。',
  REMOVED: '这条故事已经撤回或下架，不再出现在公开故事站。',
};

export function storyStatusLabel(status: StoryStatus): string {
  return STATUS_LABELS[status];
}

export function storyStatusHint(status: StoryStatus): string {
  return STATUS_HINTS[status];
}

export function canEditStory(status: StoryStatus): boolean {
  return status === 'DRAFT' || status === 'REJECTED';
}

export function canSubmitStory(status: StoryStatus): boolean {
  return status === 'DRAFT' || status === 'REJECTED';
}

export function canWithdrawStory(status: StoryStatus): boolean {
  return status === 'PENDING' || status === 'APPROVED';
}

export function canDeleteStory(status: StoryStatus): boolean {
  return status === 'DRAFT';
}
