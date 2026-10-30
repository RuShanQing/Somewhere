import { Injectable } from '@nestjs/common';
import { isBlockedBetween } from './domain/block-policy';
import { BlockRepository } from './repositories/block.repository';

/**
 * SafetyModule 对其他模块公开的最小读取入口。
 * 只返回“是否可以联系”的结果，不暴露封锁原因或方向。
 */
@Injectable()
export class BlockPolicy {
  constructor(private readonly blocks: BlockRepository) {}

  async isBlockedEitherDirection(
    firstUserId: string,
    secondUserId: string,
  ): Promise<boolean> {
    if (firstUserId === secondUserId) {
      return false;
    }
    const edges = await this.blocks.findBetween(firstUserId, secondUserId);
    return isBlockedBetween(firstUserId, secondUserId, edges);
  }

  async listRelatedBlockedIds(userId: string): Promise<Set<string>> {
    return this.blocks.listRelatedIds(userId);
  }
}
