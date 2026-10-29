import { describe, expect, it } from 'vitest';
import {
  excerptOf,
  STORY_BODY_MAX,
  STORY_BODY_MIN,
  STORY_TITLE_MAX,
  validateStoryBody,
  validateStoryTags,
  validateStoryTitle,
} from '../../src/modules/story/domain/story-content';
import {
  decodeStoryCursor,
  encodeStoryCursor,
} from '../../src/modules/story/domain/story-cursor';
import {
  canDeleteStory,
  canEditStory,
  canReviewStory,
  canSubmitStory,
  canWithdrawStory,
  isPublicStory,
  shouldPublishOnApproval,
  statusAfterDecision,
} from '../../src/modules/story/domain/story-state';

const NOW = new Date('2026-10-29T12:00:00.000Z');
const STORY_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

describe('故事内容校验', () => {
  it('标题按 Unicode 码点计数，去掉首尾空白', () => {
    expect(validateStoryTitle('  雨夜书店  ')).toEqual({ ok: true, value: '雨夜书店' });
    expect(validateStoryTitle('题'.repeat(STORY_TITLE_MAX)).ok).toBe(true);
    expect(validateStoryTitle('题'.repeat(STORY_TITLE_MAX + 1))).toEqual({
      ok: false,
      reason: 'length',
    });
    expect(validateStoryTitle('   ')).toEqual({ ok: false, reason: 'blank' });
  });

  it('正文 20–3000 字符，emoji 算一个码点', () => {
    expect(validateStoryBody('🌊'.repeat(STORY_BODY_MIN)).ok).toBe(true);
    expect(validateStoryBody('🌊'.repeat(STORY_BODY_MAX)).ok).toBe(true);
    expect(validateStoryBody('🌊'.repeat(STORY_BODY_MIN - 1))).toEqual({
      ok: false,
      reason: 'length',
    });
    expect(validateStoryBody('🌊'.repeat(STORY_BODY_MAX + 1))).toEqual({
      ok: false,
      reason: 'length',
    });
    expect(validateStoryBody(' \n\t ')).toEqual({ ok: false, reason: 'blank' });
  });

  it('标签最多 3 个、每个最多 24 字符、去重但不丢大小写', () => {
    expect(validateStoryTags([' 城市 ', 'Rain', 'rain'])).toEqual({
      ok: true,
      value: ['城市', 'Rain'],
    });
    expect(validateStoryTags(['a', 'b', 'c', 'd'])).toEqual({ ok: false, reason: 'count' });
    expect(validateStoryTags([''])).toEqual({ ok: false, reason: 'empty' });
    expect(validateStoryTags(['x'.repeat(25)])).toEqual({ ok: false, reason: 'length' });
  });

  it('摘要按码点截断并保留完整 emoji', () => {
    expect(excerptOf('🌊'.repeat(3), 2)).toBe('🌊🌊…');
    expect(excerptOf('短句', 10)).toBe('短句');
  });
});

describe('故事状态转移', () => {
  it('只有草稿和未通过故事可以编辑/提交', () => {
    for (const status of ['DRAFT', 'REJECTED'] as const) {
      expect(canEditStory(status)).toBe(true);
      expect(canSubmitStory(status)).toBe(true);
    }
    for (const status of ['PENDING', 'APPROVED', 'REMOVED'] as const) {
      expect(canEditStory(status)).toBe(false);
      expect(canSubmitStory(status)).toBe(false);
    }
  });

  it('只有草稿可以删除，PENDING/APPROVED 可以撤回', () => {
    expect(canDeleteStory('DRAFT')).toBe(true);
    expect(canDeleteStory('PENDING')).toBe(false);
    expect(canWithdrawStory('PENDING')).toBe(true);
    expect(canWithdrawStory('APPROVED')).toBe(true);
    expect(canWithdrawStory('REJECTED')).toBe(false);
    expect(canWithdrawStory('REMOVED')).toBe(false);
  });

  it('审核动作与状态匹配', () => {
    expect(canReviewStory('PENDING', 'APPROVE')).toBe(true);
    expect(canReviewStory('PENDING', 'REJECT')).toBe(true);
    expect(canReviewStory('PENDING', 'REMOVE')).toBe(true);
    expect(canReviewStory('APPROVED', 'REMOVE')).toBe(true);
    expect(canReviewStory('APPROVED', 'APPROVE')).toBe(false);
    expect(canReviewStory('REJECTED', 'APPROVE')).toBe(false);
    expect(statusAfterDecision('APPROVE')).toBe('APPROVED');
    expect(statusAfterDecision('REJECT')).toBe('REJECTED');
    expect(statusAfterDecision('REMOVE')).toBe('REMOVED');
  });

  it('公开条件必须同时满足审核通过、已发布、未归档与公开授权', () => {
    const base = {
      reviewStatus: 'APPROVED' as const,
      publishedAt: NOW,
      archivedAt: null,
      publicConsentAt: NOW,
    };
    expect(isPublicStory(base)).toBe(true);
    expect(isPublicStory({ ...base, reviewStatus: 'PENDING' })).toBe(false);
    expect(isPublicStory({ ...base, publishedAt: null })).toBe(false);
    expect(isPublicStory({ ...base, archivedAt: NOW })).toBe(false);
    expect(isPublicStory({ ...base, publicConsentAt: null })).toBe(false);
  });

  it('城市容量未满才立即公开', () => {
    expect(shouldPublishOnApproval(49, 50)).toBe(true);
    expect(shouldPublishOnApproval(50, 50)).toBe(false);
    expect(shouldPublishOnApproval(51, 50)).toBe(false);
  });
});

describe('故事游标', () => {
  it('编码后可解码出同一时间与 ID', () => {
    const encoded = encodeStoryCursor({ at: NOW, id: STORY_ID });
    expect(decodeStoryCursor(encoded)).toEqual({ at: NOW, id: STORY_ID });
  });

  it('空游标返回 null，非法游标返回 null', () => {
    expect(decodeStoryCursor(undefined)).toBeNull();
    expect(decodeStoryCursor('')).toBeNull();
    expect(decodeStoryCursor('not-a-cursor')).toBeNull();
    expect(decodeStoryCursor(Buffer.from('nope|not-uuid').toString('base64url'))).toBeNull();
  });
});
