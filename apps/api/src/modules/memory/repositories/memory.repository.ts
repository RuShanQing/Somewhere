import { Injectable } from '@nestjs/common';
import type { PersonalMemory } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * 个人记忆唯一的数据访问点。
 * 所有读写都显式带 ownerId，避免把“私人”交给调用方记忆。
 */
@Injectable()
export class MemoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listByOwner(ownerId: string, limit: number, offset: number): Promise<PersonalMemory[]> {
    return this.prisma.personalMemory.findMany({
      where: { ownerId },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      skip: offset,
      take: limit,
    });
  }

  async create(
    ownerId: string,
    input: { title: string; body: string },
  ): Promise<PersonalMemory> {
    return this.prisma.personalMemory.create({
      data: { ownerId, title: input.title, body: input.body },
    });
  }

  async update(
    ownerId: string,
    id: string,
    input: { title?: string; body?: string },
  ): Promise<PersonalMemory | null> {
    const result = await this.prisma.personalMemory.updateMany({
      where: { id, ownerId },
      data: input,
    });
    if (result.count === 0) {
      return null;
    }
    return this.prisma.personalMemory.findFirst({ where: { id, ownerId } });
  }

  async delete(ownerId: string, id: string): Promise<boolean> {
    const result = await this.prisma.personalMemory.deleteMany({
      where: { id, ownerId },
    });
    return result.count > 0;
  }
}
