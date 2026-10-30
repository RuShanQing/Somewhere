import { describe, expect, it } from 'vitest';
import {
  replyBlockReason,
  type ReplyEligibilityInput,
} from '../../src/modules/postcard/domain/reply';

function input(overrides: Partial<ReplyEligibilityInput> = {}): ReplyEligibilityInput {
  return {
    viewerId: 'receiver-id',
    senderId: 'sender-id',
    receiverId: 'receiver-id',
    status: 'DELIVERED',
    passageId: 'passage-id',
    blocked: false,
    canSend: true,
    alreadyReplied: false,
    ...overrides,
  };
}

describe('POSTCARD-REPLY · 回信资格矩阵', () => {
  it('收件人回复已送达的共途信时允许', () => {
    expect(replyBlockReason(input())).toBeNull();
  });

  it('自己的信与第三方的信都不能回信', () => {
    expect(replyBlockReason(input({ viewerId: 'sender-id' }))).toBe('OWN_POSTCARD');
    expect(replyBlockReason(input({ viewerId: 'third-id' }))).toBe('NOT_RECEIVER');
  });

  it('在途与受限状态都不能回信', () => {
    expect(replyBlockReason(input({ status: 'IN_TRANSIT' }))).toBe('NOT_DELIVERED');
    expect(replyBlockReason(input({ status: 'RESTRICTED' }))).toBe('NOT_DELIVERED');
  });

  it('不属于共途的信不能回信', () => {
    expect(replyBlockReason(input({ passageId: null }))).toBe('NO_PASSAGE');
  });

  it('封锁优先于共途许可', () => {
    expect(replyBlockReason(input({ blocked: true, canSend: false }))).toBe('BLOCKED');
  });

  it('停泊、完成或归档导致共途不可发送', () => {
    expect(replyBlockReason(input({ canSend: false }))).toBe('PASSAGE_CLOSED');
  });

  it('同一原信已经回过一次就不能再回', () => {
    expect(replyBlockReason(input({ alreadyReplied: true }))).toBe('ALREADY_REPLIED');
  });

  it('身份与送达状态优先于其他失败原因', () => {
    expect(
      replyBlockReason(
        input({
          viewerId: 'sender-id',
          passageId: null,
          blocked: true,
          canSend: false,
          alreadyReplied: true,
        }),
      ),
    ).toBe('OWN_POSTCARD');
    expect(
      replyBlockReason(
        input({
          status: 'IN_TRANSIT',
          blocked: true,
          canSend: false,
          alreadyReplied: true,
        }),
      ),
    ).toBe('NOT_DELIVERED');
  });
});
