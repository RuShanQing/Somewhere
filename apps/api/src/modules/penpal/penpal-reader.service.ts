import { Injectable } from '@nestjs/common';
import { BlockPolicy } from '../safety/block-policy.service';
import { indexPenpalPairs, toPenpalView } from './domain/penpal-policy';
import { PenpalRepository } from './repositories/penpal.repository';

/**
 * PenpalModule 对邮局公开的最小读取入口。
 * 只返回当前可联系的信友 ID，不暴露同意方向、时间或撤销原因。
 */
@Injectable()
export class PenpalReader {
  constructor(
    private readonly penpals: PenpalRepository,
    private readonly blocks: BlockPolicy,
  ) {}

  async listActiveCounterpartIds(userId: string): Promise<string[]> {
    const [rows, blockedIds] = await Promise.all([
      this.penpals.listForUser(userId),
      this.blocks.listRelatedBlockedIds(userId),
    ]);
    const pairById = indexPenpalPairs(userId, rows);

    return Array.from(pairById.entries())
      .filter(([counterpartId, pair]) => {
        return !blockedIds.has(counterpartId) && toPenpalView(pair) === 'ACTIVE';
      })
      .map(([counterpartId]) => counterpartId);
  }
}
