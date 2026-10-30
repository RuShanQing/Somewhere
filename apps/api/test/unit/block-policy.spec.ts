import { describe, expect, it } from 'vitest';
import {
  canContact,
  isBlockedBetween,
  type BlockEdge,
} from '../../src/modules/safety/domain/block-policy';

const edge = (blockerId: string, blockedId: string): BlockEdge => ({
  blockerId,
  blockedId,
});

describe('SAFETY · 封锁关系纯策略', () => {
  it('同一对用户任一方向存在封锁时都视为不可联系', () => {
    const edges = [edge('a', 'b')];

    expect(isBlockedBetween('a', 'b', edges)).toBe(true);
    expect(isBlockedBetween('b', 'a', edges)).toBe(true);
    expect(canContact('a', 'b', edges)).toBe(false);
    expect(canContact('b', 'a', edges)).toBe(false);
  });

  it('没有封锁边时允许联系', () => {
    expect(isBlockedBetween('a', 'b', [])).toBe(false);
    expect(canContact('a', 'b', [])).toBe(true);
  });

  it('不会把第三方之间的封锁误判为当前关系', () => {
    const edges = [edge('a', 'c')];

    expect(isBlockedBetween('a', 'b', edges)).toBe(false);
    expect(canContact('a', 'b', edges)).toBe(true);
  });

  it('自己与自己不产生封锁关系；自我封锁由 DTO/服务层拒绝', () => {
    expect(isBlockedBetween('a', 'a', [edge('a', 'a')])).toBe(false);
  });

  it('多个边中只要存在一条双向边就拒绝联系', () => {
    const edges = [edge('a', 'c'), edge('c', 'b'), edge('b', 'a')];

    expect(isBlockedBetween('a', 'b', edges)).toBe(true);
    expect(canContact('a', 'b', edges)).toBe(false);
  });
});
