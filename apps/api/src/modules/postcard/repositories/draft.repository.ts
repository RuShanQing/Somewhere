import { Injectable } from '@nestjs/common';
import type { PostcardDraft } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

export interface DraftChanges {
  body?: string;
  recipientId?: string | null;
}

@Injectable()
export class DraftRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    ownerId: string,
    body: string,
    recipientId: string | null,
    passageId: string | null,
    replyToPostcardId: string | null,
  ): Promise<PostcardDraft> {
    return this.prisma.postcardDraft.create({
      data: { ownerId, body, recipientId, passageId, replyToPostcardId },
    });
  }

  async findById(id: string): Promise<PostcardDraft | null> {
    return this.prisma.postcardDraft.findUnique({ where: { id } });
  }

  async findManyByOwner(ownerId: string, limit: number, offset: number): Promise<PostcardDraft[]> {
    return this.prisma.postcardDraft.findMany({
      where: { ownerId, sentPostcardId: null },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      skip: offset,
    });
  }

  /** 只更新仍属于本人且尚未寄出的草稿；返回是否真的改到一行。 */
  async updateUnsent(id: string, ownerId: string, changes: DraftChanges): Promise<boolean> {
    const result = await this.prisma.postcardDraft.updateMany({
      where: { id, ownerId, sentPostcardId: null },
      data: {
        ...(changes.body !== undefined ? { body: changes.body } : {}),
        ...(changes.recipientId !== undefined ? { recipientId: changes.recipientId } : {}),
      },
    });
    return result.count === 1;
  }

  async deleteUnsent(id: string, ownerId: string): Promise<boolean> {
    const result = await this.prisma.postcardDraft.deleteMany({
      where: { id, ownerId, sentPostcardId: null },
    });
    return result.count === 1;
  }
}
