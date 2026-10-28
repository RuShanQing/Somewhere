import { Injectable } from '@nestjs/common';
import { Prisma, type Postcard } from '@prisma/client';
import { AppError } from '../../../common/errors/app-error';
import { PrismaService } from '../../../prisma/prisma.service';

export interface SendFromDraftInput {
  draftId: string;
  ownerId: string;
  body: string;
  receiverId: string;
  originCityId: string;
  destinationCityId: string;
  sentAt: Date;
  deliverAt: Date;
  idempotencyKey: string | null;
  maxSendsPerDay: number;
}

export interface SendFromDraftResult {
  postcard: Postcard;
  created: boolean;
}

export interface IncomingPostcardRow {
  id: string;
  senderId: string;
  deliverAt: Date;
  deliveredAt: Date | null;
}

export interface TransitPostcardRow {
  id: string;
  deliverAt: Date;
}

@Injectable()
export class PostcardRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Postcard | null> {
    return this.prisma.postcard.findUnique({ where: { id } });
  }

  async findIdempotent(senderId: string, key: string): Promise<Postcard | null> {
    return this.prisma.postcard.findFirst({
      where: { senderId, idempotencyKey: key },
    });
  }

  async listIncoming(
    receiverId: string,
    limit: number,
    offset: number,
  ): Promise<IncomingPostcardRow[]> {
    return this.prisma.postcard.findMany({
      where: { receiverId, status: 'DELIVERED', deliverAt: { lte: new Date() } },
      orderBy: { deliveredAt: 'desc' },
      take: limit,
      skip: offset,
      select: { id: true, senderId: true, deliverAt: true, deliveredAt: true },
    });
  }

  async listTransit(
    senderId: string,
    limit: number,
    offset: number,
  ): Promise<TransitPostcardRow[]> {
    return this.prisma.postcard.findMany({
      where: { senderId, status: 'IN_TRANSIT' },
      orderBy: { deliverAt: 'asc' },
      take: limit,
      skip: offset,
      select: { id: true, deliverAt: true },
    });
  }

  /**
   * 发送事务：创建明信片并用草稿的 sent_postcard_id 作为幂等闸门。
   * 并发发送同一草稿时，只有一个事务能把 sent_postcard_id 从 NULL 改成新明信片。
   */
  async sendFromDraft(input: SendFromDraftInput): Promise<SendFromDraftResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const draft = await tx.postcardDraft.findUnique({ where: { id: input.draftId } });
        if (!draft || draft.ownerId !== input.ownerId) {
          throw AppError.resourceNotAccessible();
        }

        if (draft.sentPostcardId) {
          const existing = await tx.postcard.findUnique({ where: { id: draft.sentPostcardId } });
          if (existing) {
            return { postcard: existing, created: false };
          }
        }

        if (input.idempotencyKey) {
          const existing = await tx.postcard.findFirst({
            where: { senderId: input.ownerId, idempotencyKey: input.idempotencyKey },
          });
          if (existing) {
            return { postcard: existing, created: false };
          }
        }

        const since = new Date(input.sentAt.getTime() - 24 * 60 * 60 * 1000);
        const recentCount = await tx.postcard.count({
          where: { senderId: input.ownerId, sentAt: { gte: since } },
        });
        if (recentCount >= input.maxSendsPerDay) {
          throw AppError.postcardLimitReached();
        }

        const postcard = await tx.postcard.create({
          data: {
            senderId: input.ownerId,
            receiverId: input.receiverId,
            body: input.body,
            originCityId: input.originCityId,
            destinationCityId: input.destinationCityId,
            sentAt: input.sentAt,
            deliverAt: input.deliverAt,
            idempotencyKey: input.idempotencyKey,
          },
        });

        const claimed = await tx.postcardDraft.updateMany({
          where: { id: input.draftId, ownerId: input.ownerId, sentPostcardId: null },
          data: { sentPostcardId: postcard.id },
        });
        if (claimed.count !== 1) {
          // 另一个并发请求已经使用该草稿；回滚本次插入，避免第二张信。
          throw AppError.resourceNotAccessible();
        }

        return { postcard, created: true };
      });
    } catch (error) {
      if (
        input.idempotencyKey &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.findIdempotent(input.ownerId, input.idempotencyKey);
        if (existing) {
          return { postcard: existing, created: false };
        }
      }
      throw error;
    }
  }

  /** Worker 领取到期信件；SKIP LOCKED 保证多个进程不会重复处理同一行。 */
  async deliverDue(limit: number): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      UPDATE "postcards"
      SET "status" = 'DELIVERED',
          "delivered_at" = NOW(),
          "updated_at" = NOW()
      WHERE "id" IN (
        SELECT "id"
        FROM "postcards"
        WHERE "status" = 'IN_TRANSIT'
          AND "deliver_at" <= NOW()
        ORDER BY "deliver_at" ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING "id"
    `);
    return rows.length;
  }
}
