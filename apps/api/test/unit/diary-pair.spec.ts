import { describe, expect, it } from 'vitest';
import {
  canReadDiary,
  diaryPairBlockReason,
  type DiaryPairInput,
} from '../../src/modules/memory/domain/diary';

function pair(overrides: Partial<DiaryPairInput> = {}): DiaryPairInput {
  return {
    leftId: 'left-id',
    leftStatus: 'DELIVERED',
    leftPassageId: 'passage-id',
    leftSenderId: 'sender-a',
    leftReceiverId: 'sender-b',
    rightStatus: 'DELIVERED',
    rightPassageId: 'passage-id',
    rightSenderId: 'sender-b',
    rightReceiverId: 'sender-a',
    rightReplyToPostcardId: 'left-id',
    ...overrides,
  };
}

describe('MEMORY-02 · 双城日记配对规则', () => {
  it('原信与回信均已送达、同共途、互为收发者时允许成页', () => {
    expect(diaryPairBlockReason(pair())).toBeNull();
  });

  it('任一封未送达都不能成页', () => {
    expect(diaryPairBlockReason(pair({ leftStatus: 'IN_TRANSIT' }))).toBe('LEFT_NOT_DELIVERED');
    expect(diaryPairBlockReason(pair({ rightStatus: 'IN_TRANSIT' }))).toBe('RIGHT_NOT_DELIVERED');
    expect(diaryPairBlockReason(pair({ rightStatus: 'RESTRICTED' }))).toBe('RIGHT_NOT_DELIVERED');
  });

  it('不属同一段共途或缺少共途都不能成页', () => {
    expect(diaryPairBlockReason(pair({ leftPassageId: null }))).toBe('NOT_SAME_PASSAGE');
    expect(diaryPairBlockReason(pair({ rightPassageId: 'other-passage' }))).toBe(
      'NOT_SAME_PASSAGE',
    );
  });

  it('回信必须显式引用原信', () => {
    expect(diaryPairBlockReason(pair({ rightReplyToPostcardId: null }))).toBe('NOT_REPLY');
    expect(diaryPairBlockReason(pair({ rightReplyToPostcardId: 'other-id' }))).toBe(
      'NOT_REPLY',
    );
  });

  it('同一作者的两封信不能组成双页', () => {
    expect(diaryPairBlockReason(pair({ rightSenderId: 'sender-a' }))).toBe('SAME_AUTHOR');
  });

  it('收发关系必须互为对方', () => {
    expect(diaryPairBlockReason(pair({ rightReceiverId: 'third-id' }))).toBe(
      'PARTICIPANTS_MISMATCH',
    );
    expect(diaryPairBlockReason(pair({ rightSenderId: 'third-id' }))).toBe(
      'PARTICIPANTS_MISMATCH',
    );
  });

  it('只有该页两封的收发者可以阅读', () => {
    expect(canReadDiary('sender-a', 'sender-a', 'sender-b')).toBe(true);
    expect(canReadDiary('sender-b', 'sender-a', 'sender-b')).toBe(true);
    expect(canReadDiary('third-id', 'sender-a', 'sender-b')).toBe(false);
  });
});
