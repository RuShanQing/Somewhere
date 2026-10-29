import { describe, expect, it } from 'vitest';
import { PUBLIC_STORY_CONDITION } from '../../src/modules/story/domain/story-visibility';

/**
 * 公开谓词是故事站、地图聚合与容量提升的共同来源。
 * 这里锁定它的字段与取值，防止后续有人为了“让地图显示更多”而悄悄放宽条件。
 */
describe('公开故事查询谓词', () => {
  it('恰好包含四个条件，且与 isPublicStory 的含义一致', () => {
    expect(Object.keys(PUBLIC_STORY_CONDITION).sort()).toEqual([
      'archivedAt',
      'publicConsentAt',
      'publishedAt',
      'reviewStatus',
    ]);
    expect(PUBLIC_STORY_CONDITION.reviewStatus).toBe('APPROVED');
    expect(PUBLIC_STORY_CONDITION.publishedAt).toEqual({ not: null });
    expect(PUBLIC_STORY_CONDITION.archivedAt).toBeNull();
    expect(PUBLIC_STORY_CONDITION.publicConsentAt).toEqual({ not: null });
  });

  it('可组合出“已通过但排队”的条件且不影响其余三项', () => {
    const queued = { ...PUBLIC_STORY_CONDITION, publishedAt: null };
    expect(queued.publishedAt).toBeNull();
    expect(queued.reviewStatus).toBe('APPROVED');
    expect(queued.archivedAt).toBeNull();
    expect(queued.publicConsentAt).toEqual({ not: null });
  });

});
