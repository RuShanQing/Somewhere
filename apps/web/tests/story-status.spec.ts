import { describe, expect, it } from 'vitest';
import {
  canDeleteStory,
  canEditStory,
  canSubmitStory,
  canWithdrawStory,
  storyStatusHint,
  storyStatusLabel,
} from '../src/shared/story/status';
import { toFriendlyStoryMessage } from '../src/shared/story/messages';
import { ApiError } from '@somewhere/api-client';

describe('故事状态文案与操作', () => {
  it('五种状态都有中文文案与说明', () => {
    for (const status of ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'REMOVED'] as const) {
      expect(storyStatusLabel(status).length).toBeGreaterThan(0);
      expect(storyStatusHint(status).length).toBeGreaterThan(0);
    }
  });

  it('只有草稿和驳回可编辑/提交，只有草稿可删除', () => {
    expect(canEditStory('DRAFT')).toBe(true);
    expect(canEditStory('REJECTED')).toBe(true);
    expect(canEditStory('PENDING')).toBe(false);
    expect(canSubmitStory('DRAFT')).toBe(true);
    expect(canSubmitStory('APPROVED')).toBe(false);
    expect(canDeleteStory('DRAFT')).toBe(true);
    expect(canDeleteStory('REJECTED')).toBe(false);
  });

  it('待审核和已通过可以撤回', () => {
    expect(canWithdrawStory('PENDING')).toBe(true);
    expect(canWithdrawStory('APPROVED')).toBe(true);
    expect(canWithdrawStory('DRAFT')).toBe(false);
    expect(canWithdrawStory('REMOVED')).toBe(false);
  });
});

describe('故事错误提示', () => {
  it('不泄露内部信息，并区分权限、不可见、状态冲突与配额', () => {
    expect(toFriendlyStoryMessage(new ApiError('FORBIDDEN', 403, 'x'))).toContain('权限');
    expect(toFriendlyStoryMessage(new ApiError('RESOURCE_NOT_ACCESSIBLE', 404, 'x'))).toContain(
      '不可见',
    );
    expect(toFriendlyStoryMessage(new ApiError('STORY_STATE_CONFLICT', 409, 'x'))).toContain(
      '刷新',
    );
    expect(toFriendlyStoryMessage(new ApiError('RATE_LIMITED', 429, 'x'))).toContain('故事');
    expect(toFriendlyStoryMessage(new Error('stack trace'))).not.toContain('stack trace');
  });
});
