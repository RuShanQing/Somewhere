import { Injectable } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error';
import type { AuthenticatedUser } from '../../common/http/request.types';
import { AccountService } from '../auth/account.service';
import { BlockListDto, BlockedUserDto } from './dto/block-response.dto';
import { BlockRepository } from './repositories/block.repository';

@Injectable()
export class SafetyService {
  constructor(
    private readonly blocks: BlockRepository,
    private readonly accounts: AccountService,
  ) {}

  async list(user: AuthenticatedUser): Promise<BlockListDto> {
    const rows = await this.blocks.listByBlocker(user.id);
    const accounts = await this.accounts.findPublicByIds(rows.map((row) => row.blockedId));
    const nicknameById = new Map(accounts.map((account) => [account.id, account.nickname]));

    return {
      items: rows.flatMap((row) => {
        const nickname = nicknameById.get(row.blockedId);
        if (!nickname) {
          return [];
        }
        return [
          {
            userId: row.blockedId,
            nickname,
            blockedAt: row.createdAt.toISOString(),
          },
        ];
      }),
    };
  }

  async block(user: AuthenticatedUser, targetUserId: string): Promise<BlockedUserDto> {
    if (targetUserId === user.id) {
      throw AppError.validation(['userId:self']);
    }

    const target = (await this.accounts.findPublicByIds([targetUserId]))[0];
    if (!target) {
      throw AppError.resourceNotAccessible();
    }

    const result = await this.blocks.create(user.id, targetUserId);
    return {
      userId: target.id,
      nickname: target.nickname,
      blockedAt: result.createdAt.toISOString(),
    };
  }

  async unblock(user: AuthenticatedUser, targetUserId: string): Promise<void> {
    await this.blocks.delete(user.id, targetUserId);
  }
}
