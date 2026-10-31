import { Injectable } from '@nestjs/common';
import type { DiaryPage, PersonalMemory } from '@prisma/client';
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

  async listDiaryPagesByPassageIds(
    passageIds: string[],
    limit: number,
    offset: number,
  ): Promise<DiaryPage[]> {
    if (passageIds.length === 0) {
      return [];
    }
    return this.prisma.diaryPage.findMany({
      where: { passageId: { in: passageIds } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: offset,
      take: limit,
    });
  }

  async findDiaryPageById(id: string): Promise<DiaryPage | null> {
    return this.prisma.diaryPage.findUnique({ where: { id } });
  }

  /** 已经成页的回信 ID；用于生成前跳过重复候选。 */
  async listDiaryPageReplyIds(replyIds: string[]): Promise<Set<string>> {
    if (replyIds.length === 0) {
      return new Set();
    }
    const rows = await this.prisma.diaryPage.findMany({
      where: { postcardRightId: { in: replyIds } },
      select: { postcardRightId: true },
    });
    return new Set(rows.map((row) => row.postcardRightId));
  }

  async createDiaryPages(
    rows: Array<{ passageId: string; leftId: string; rightId: string }>,
  ): Promise<number> {
    if (rows.length === 0) {
      return 0;
    }
    const result = await this.prisma.diaryPage.createMany({
      data: rows.map((row) => ({
        passageId: row.passageId,
        postcardLeftId: row.leftId,
        postcardRightId: row.rightId,
      })),
      skipDuplicates: true,
    });
    return result.count;
  }
}
