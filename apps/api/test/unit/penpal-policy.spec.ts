import { describe, expect, it } from 'vitest';
import {
  canContinueContact,
  canRequestPenpal,
  derivePenpalStatus,
  toPenpalView,
  type PenpalPairConsent,
} from '../../src/modules/penpal/domain/penpal-policy';
import { PenpalPolicy } from '../../src/modules/penpal/penpal-policy.service';
import type { PenpalRepository } from '../../src/modules/penpal/repositories/penpal.repository';
import type { BlockPolicy } from '../../src/modules/safety/block-policy.service';

const pair = (
  mine: PenpalPairConsent['mine'],
  theirs: PenpalPairConsent['theirs'],
): PenpalPairConsent => ({ mine, theirs });

describe('PENPAL · 双向同意聚合策略', () => {
  it('双方都没有记录时是 NONE', () => {
    expect(derivePenpalStatus(pair(null, null))).toBe('NONE');
    expect(toPenpalView(pair(null, null))).toBeNull();
  });

  it('只有本人同意时是 ONE_SIDED，并归为我发出的请求', () => {
    expect(derivePenpalStatus(pair('ALLOW', null))).toBe('ONE_SIDED');
    expect(toPenpalView(pair('ALLOW', null))).toBe('OUTGOING');
  });

  it('只有对方同意时是 ONE_SIDED，并归为收到的请求', () => {
    expect(derivePenpalStatus(pair(null, 'ALLOW'))).toBe('ONE_SIDED');
    expect(toPenpalView(pair(null, 'ALLOW'))).toBe('INCOMING');
  });

  it('双方都 ALLOW 才是 ACTIVE', () => {
    expect(derivePenpalStatus(pair('ALLOW', 'ALLOW'))).toBe('ACTIVE');
    expect(toPenpalView(pair('ALLOW', 'ALLOW'))).toBe('ACTIVE');
  });

  it('一方撤销且另一方仍同意时是 REVOKED，不归入任何请求分组', () => {
    expect(derivePenpalStatus(pair('REVOKED', 'ALLOW'))).toBe('REVOKED');
    expect(derivePenpalStatus(pair('ALLOW', 'REVOKED'))).toBe('REVOKED');
    expect(toPenpalView(pair('REVOKED', 'ALLOW'))).toBeNull();
    expect(toPenpalView(pair('ALLOW', 'REVOKED'))).toBeNull();
  });

  it('撤销后没有另一方有效同意时回到 NONE', () => {
    expect(derivePenpalStatus(pair('REVOKED', null))).toBe('NONE');
    expect(derivePenpalStatus(pair(null, 'REVOKED'))).toBe('NONE');
    expect(derivePenpalStatus(pair('REVOKED', 'REVOKED'))).toBe('NONE');
  });

  it('封锁会覆盖 ACTIVE，但不改变派生状态本身', () => {
    const status = derivePenpalStatus(pair('ALLOW', 'ALLOW'));

    expect(status).toBe('ACTIVE');
    expect(canContinueContact({ status, blocked: false })).toBe(true);
    expect(canContinueContact({ status, blocked: true })).toBe(false);
  });

  it('单方同意不能继续联系，REVOKED 与 NONE 同样不能', () => {
    expect(canContinueContact({ status: 'ONE_SIDED', blocked: false })).toBe(false);
    expect(canContinueContact({ status: 'REVOKED', blocked: false })).toBe(false);
    expect(canContinueContact({ status: 'NONE', blocked: false })).toBe(false);
  });

  it('只有存在已完成共途且不是自己时才允许发起请求', () => {
    expect(canRequestPenpal({ hasCompletedPassage: true, isSelf: false })).toBe(true);
    expect(canRequestPenpal({ hasCompletedPassage: false, isSelf: false })).toBe(false);
    expect(canRequestPenpal({ hasCompletedPassage: true, isSelf: true })).toBe(false);
  });
});

describe('PENPAL · PenpalPolicy 封锁优先', () => {
  function policyWith(options: {
    mine: 'ALLOW' | 'REVOKED' | null;
    theirs: 'ALLOW' | 'REVOKED' | null;
    blocked: boolean;
  }): PenpalPolicy {
    const penpals = {
      findPair: async () => ({ mine: options.mine, theirs: options.theirs }),
    } as unknown as PenpalRepository;
    const blocks = {
      isBlockedEitherDirection: async () => options.blocked,
    } as unknown as BlockPolicy;
    return new PenpalPolicy(penpals, blocks);
  }

  it('双方 ALLOW 且无封锁时允许继续联系', async () => {
    await expect(
      policyWith({ mine: 'ALLOW', theirs: 'ALLOW', blocked: false }).canContinueContact(
        'a',
        'b',
      ),
    ).resolves.toBe(true);
  });

  it('双方 ALLOW 但任一方向封锁时拒绝继续联系', async () => {
    await expect(
      policyWith({ mine: 'ALLOW', theirs: 'ALLOW', blocked: true }).canContinueContact(
        'a',
        'b',
      ),
    ).resolves.toBe(false);
  });

  it('单方同意或自己与自己都不允许继续联系', async () => {
    await expect(
      policyWith({ mine: 'ALLOW', theirs: null, blocked: false }).canContinueContact('a', 'b'),
    ).resolves.toBe(false);
    await expect(
      policyWith({ mine: 'ALLOW', theirs: 'ALLOW', blocked: false }).canContinueContact('a', 'a'),
    ).resolves.toBe(false);
  });
});
