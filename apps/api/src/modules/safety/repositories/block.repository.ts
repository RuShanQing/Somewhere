import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import type { BlockEdge } from '../domain/block-policy';

export interface BlockListRow {
  blockedId: string;
  createdAt: Date;
}

@Injectable()
export class BlockRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findBetween(firstUserId: string, secondUserId: string): Promise<BlockEdge[]> {
    return this.prisma.userBlock.findMany({
      where: {
        OR: [
          { blockerId: firstUserId, blockedId: secondUserId },
          { blockerId: secondUserId, blockedId: firstUserId },
        ],
      },
      select: { blockerId: true, blockedId: true },
    });
  }

  /** 封锁幂等：重复调用返回已有记录，不重复写审计或时间。 */
  async create(
    blockerId: string,
    blockedId: string,
  ): Promise<{ createdAt: Date; created: boolean }> {
    try {
      const row = await this.prisma.userBlock.create({
        data: { blockerId, blockedId },
        select: { createdAt: true },
      });
      return { createdAt: row.createdAt, created: true };
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        const existing = await this.prisma.userBlock.findUniqueOrThrow({
          where: { blockerId_blockedId: { blockerId, blockedId } },
          select: { createdAt: true },
        });
        return { createdAt: existing.createdAt, created: false };
      }
      throw error;
    }
  }

  async delete(blockerId: string, blockedId: string): Promise<void> {
    await this.prisma.userBlock.deleteMany({ where: { blockerId, blockedId } });
  }

  async listByBlocker(blockerId: string): Promise<BlockListRow[]> {
    return this.prisma.userBlock.findMany({
      where: { blockerId },
      orderBy: [{ createdAt: 'desc' }, { blockedId: 'asc' }],
      select: { blockedId: true, createdAt: true },
    });
  }

  /** 返回与本人存在任一方向封锁的全部用户 ID，供列表过滤。 */
  async listRelatedIds(userId: string): Promise<Set<string>> {
    const rows = await this.prisma.userBlock.findMany({
      where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
      select: { blockerId: true, blockedId: true },
    });
    const ids = new Set<string>();
    for (const row of rows) {
      ids.add(row.blockerId === userId ? row.blockedId : row.blockerId);
    }
    return ids;
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as Prisma.PrismaClientKnownRequestError).code === 'P2002'
    );
  }
}
