import { Injectable } from '@nestjs/common';
import { BlockPolicy } from '../safety/block-policy.service';
import { canContinueContact, derivePenpalStatus } from './domain/penpal-policy';
import { PenpalRepository } from './repositories/penpal.repository';

/**
 * PenpalModule 对其他模块公开的最小判定入口。
 * 只回答“能否继续联系”，不暴露同意方向、撤销原因或关系时间。
 */
@Injectable()
export class PenpalPolicy {
  constructor(
    private readonly penpals: PenpalRepository,
    private readonly blocks: BlockPolicy,
  ) {}

  async canContinueContact(firstUserId: string, secondUserId: string): Promise<boolean> {
    if (firstUserId === secondUserId) {
      return false;
    }
    const [pair, blocked] = await Promise.all([
      this.penpals.findPair(firstUserId, secondUserId),
      this.blocks.isBlockedEitherDirection(firstUserId, secondUserId),
    ]);
    return canContinueContact({ status: derivePenpalStatus(pair), blocked });
  }
}
