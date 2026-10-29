import { describe, expect, it } from 'vitest';
import {
  canSendPassage,
  isValidParticipantPair,
  type PassagePolicyInput,
} from '../../src/modules/passage/domain/passage-policy';

/**
 * canSend 是共途与邮局之间唯一的通信许可出口。
 * 三个维度（进度 / 双方意愿 / 记忆可见性）不能合并；这里只锁定前两个。
 */

function input(overrides: Partial<PassagePolicyInput> = {}): PassagePolicyInput {
  return {
    viewerId: 'user-a',
    progressStatus: 'ACTIVE',
    participants: [
      { userId: 'user-a', consentState: 'ALLOW' },
      { userId: 'user-b', consentState: 'ALLOW' },
    ],
    ...overrides,
  };
}

describe('共途通信许可', () => {
  it('ACTIVE 且双方 ALLOW 时允许新的共途通信', () => {
    expect(canSendPassage(input())).toBe(true);
  });

  it('本人停泊或关闭时不允许', () => {
    expect(
      canSendPassage(
        input({
          participants: [
            { userId: 'user-a', consentState: 'PAUSED' },
            { userId: 'user-b', consentState: 'ALLOW' },
          ],
        }),
      ),
    ).toBe(false);
    expect(
      canSendPassage(
        input({
          participants: [
            { userId: 'user-a', consentState: 'CLOSED' },
            { userId: 'user-b', consentState: 'ALLOW' },
          ],
        }),
      ),
    ).toBe(false);
  });

  it('对方停泊或关闭时同样不允许，不能替对方恢复', () => {
    expect(
      canSendPassage(
        input({
          participants: [
            { userId: 'user-a', consentState: 'ALLOW' },
            { userId: 'user-b', consentState: 'PAUSED' },
          ],
        }),
      ),
    ).toBe(false);
    expect(
      canSendPassage(
        input({
          participants: [
            { userId: 'user-a', consentState: 'ALLOW' },
            { userId: 'user-b', consentState: 'CLOSED' },
          ],
        }),
      ),
    ).toBe(false);
  });

  it('已完成或已归档的共途不允许新的通信行为', () => {
    expect(canSendPassage(input({ progressStatus: 'COMPLETED' }))).toBe(false);
    expect(canSendPassage(input({ progressStatus: 'ARCHIVED' }))).toBe(false);
  });

  it('查看者不是参与者时不允许', () => {
    expect(canSendPassage(input({ viewerId: 'user-c' }))).toBe(false);
  });

  it('参与者不是恰好两名时不允许', () => {
    expect(
      canSendPassage(
        input({ participants: [{ userId: 'user-a', consentState: 'ALLOW' }] }),
      ),
    ).toBe(false);
    expect(
      canSendPassage(
        input({
          participants: [
            { userId: 'user-a', consentState: 'ALLOW' },
            { userId: 'user-b', consentState: 'ALLOW' },
            { userId: 'user-c', consentState: 'ALLOW' },
          ],
        }),
      ),
    ).toBe(false);
    expect(
      canSendPassage(
        input({
          participants: [
            { userId: 'user-a', consentState: 'ALLOW' },
            { userId: 'user-a', consentState: 'ALLOW' },
          ],
        }),
      ),
    ).toBe(false);
  });

  it('记忆可见性不参与 canSend，也不由进度推导', () => {
    // 该断言是结构性的：policy 输入不包含 memoryVisibility 字段，
    // 因此完成 / 归档不会因为「记忆是否共享」而改变通信许可的判定来源。
    const base = input({ progressStatus: 'COMPLETED' });
    expect(Object.keys(base).sort()).toEqual(['participants', 'progressStatus', 'viewerId']);
    expect(canSendPassage(base)).toBe(false);
  });
});

describe('参与者配对校验', () => {
  it('接受两名不同用户', () => {
    expect(isValidParticipantPair(['user-a', 'user-b'])).toBe(true);
  });

  it('拒绝 1 人、3 人、重复与自己和自己', () => {
    expect(isValidParticipantPair(['user-a'])).toBe(false);
    expect(isValidParticipantPair(['user-a', 'user-b', 'user-c'])).toBe(false);
    expect(isValidParticipantPair(['user-a', 'user-a'])).toBe(false);
    expect(isValidParticipantPair(['user-a', ''])).toBe(false);
  });
});
