import { Injectable } from '@nestjs/common';
import type { PassageKind, PassageProgressStatus } from '@prisma/client';
import { AppError } from '../../../common/errors/app-error';
import { PrismaService } from '../../../prisma/prisma.service';
import { decidePassageAction } from '../domain/passage-state';
import type { PassageRecord } from '../passage.types';

export interface CreatePassageInput {
  topic: string;
  kind: PassageKind;
  participantIds: [string, string];
  actorId: string;
}

export interface PassageActionResult {
  record: PassageRecord;
  outcome: 'APPLY' | 'NOOP';
}

const RECORD_INCLUDE = { participants: true } as const;

/**
 * 共途持久化。
 *
 * 所有写操作都在事务中完成：
 * 1. 以「参与者」为条件读取，非参与者直接视为不存在；
 * 2. 由纯状态机判定 APPLY / NOOP / CONFLICT；
 * 3. 条件更新 + 追加事件；并发下只有一个请求真正改变状态。
 */
@Injectable()
export class PassageRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listForUser(
    userId: string,
    statuses: PassageProgressStatus[] | null,
  ): Promise<PassageRecord[]> {
    return this.prisma.passage.findMany({
      where: {
        participants: { some: { userId } },
        ...(statuses ? { progressStatus: { in: statuses } } : {}),
      },
      include: RECORD_INCLUDE,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    });
  }

  async findForUser(id: string, userId: string): Promise<PassageRecord | null> {
    return this.prisma.passage.findFirst({
      where: { id, participants: { some: { userId } } },
      include: RECORD_INCLUDE,
    });
  }

  /** 只回答两人是否至少共同完成过一段共途；不暴露主题、状态或事件。 */
  async hasCompletedBetween(firstUserId: string, secondUserId: string): Promise<boolean> {
    if (firstUserId === secondUserId) {
      return false;
    }
    const count = await this.prisma.passage.count({
      where: {
        completedAt: { not: null },
        AND: [
          { participants: { some: { userId: firstUserId } } },
          { participants: { some: { userId: secondUserId } } },
        ],
      },
    });
    return count > 0;
  }

  /** 仅供测试夹具与后续邀请流程使用；当前没有 HTTP 创建入口。 */
  async createForPair(input: CreatePassageInput): Promise<PassageRecord> {
    return this.prisma.passage.create({
      data: {
        topic: input.topic,
        kind: input.kind,
        participants: {
          create: input.participantIds.map((userId) => ({ userId })),
        },
        events: {
          create: {
            actorId: input.actorId,
            eventType: 'CREATED',
            metadataRedacted: { toStatus: 'ACTIVE' },
          },
        },
      },
      include: RECORD_INCLUDE,
    });
  }

  async applyParticipantAction(input: {
    passageId: string;
    userId: string;
    action: 'PAUSE' | 'RESUME';
    now: Date;
  }): Promise<PassageActionResult | null> {
    return this.prisma.$transaction(async (tx) => {
      const passage = await tx.passage.findFirst({
        where: {
          id: input.passageId,
          participants: { some: { userId: input.userId } },
        },
        include: RECORD_INCLUDE,
      });
      if (!passage) {
        return null;
      }

      const own = passage.participants.find((item) => item.userId === input.userId);
      if (!own) {
        return null;
      }

      const decision = decidePassageAction(input.action, {
        progressStatus: passage.progressStatus,
        ownConsentState: own.consentState,
      });
      if (decision.outcome === 'CONFLICT') {
        throw AppError.passageStateConflict(
          decision.progressStatus !== 'ACTIVE'
            ? '这段共途已经结束，不能再改变通信意愿'
            : '当前意愿状态不允许此操作',
        );
      }
      if (decision.outcome === 'NOOP') {
        return { record: passage, outcome: 'NOOP' };
      }

      const updated = await tx.passageParticipant.updateMany({
        where: {
          passageId: input.passageId,
          userId: input.userId,
          consentState: own.consentState,
        },
        data: {
          consentState: decision.consentState,
          lastConfirmedAt: input.now,
          ...(decision.setsPausedAt ? { pausedAt: input.now } : {}),
          ...(decision.clearPausedAt ? { pausedAt: null } : {}),
        },
      });

      // 并发请求已经先一步改了同一行：视为幂等，不重复写事件。
      if (updated.count !== 1) {
        const latest = await tx.passage.findUniqueOrThrow({
          where: { id: input.passageId },
          include: RECORD_INCLUDE,
        });
        return { record: latest, outcome: 'NOOP' };
      }

      await tx.passageEvent.create({
        data: {
          passageId: input.passageId,
          actorId: input.userId,
          eventType: input.action === 'PAUSE' ? 'PAUSED' : 'RESUMED',
          metadataRedacted: {
            fromConsent: own.consentState,
            toConsent: decision.consentState,
          },
        },
      });

      const record = await tx.passage.findUniqueOrThrow({
        where: { id: input.passageId },
        include: RECORD_INCLUDE,
      });
      return { record, outcome: 'APPLY' };
    });
  }

  async applyProgressAction(input: {
    passageId: string;
    userId: string;
    action: 'COMPLETE' | 'ARCHIVE';
    now: Date;
  }): Promise<PassageActionResult | null> {
    return this.prisma.$transaction(async (tx) => {
      const passage = await tx.passage.findFirst({
        where: {
          id: input.passageId,
          participants: { some: { userId: input.userId } },
        },
        include: RECORD_INCLUDE,
      });
      if (!passage) {
        return null;
      }

      const own = passage.participants.find((item) => item.userId === input.userId);
      if (!own) {
        return null;
      }

      const decision = decidePassageAction(input.action, {
        progressStatus: passage.progressStatus,
        ownConsentState: own.consentState,
      });
      if (decision.outcome === 'CONFLICT') {
        throw AppError.passageStateConflict('已归档的共途不能再改变进度');
      }
      if (decision.outcome === 'NOOP') {
        return { record: passage, outcome: 'NOOP' };
      }

      const updated = await tx.passage.updateMany({
        where: { id: input.passageId, progressStatus: passage.progressStatus },
        data: {
          progressStatus: decision.progressStatus,
          ...(input.action === 'COMPLETE' ? { completedAt: input.now } : { archivedAt: input.now }),
        },
      });

      if (updated.count !== 1) {
        const latest = await tx.passage.findUniqueOrThrow({
          where: { id: input.passageId },
          include: RECORD_INCLUDE,
        });
        return { record: latest, outcome: 'NOOP' };
      }

      await tx.passageEvent.create({
        data: {
          passageId: input.passageId,
          actorId: input.userId,
          eventType: input.action === 'COMPLETE' ? 'COMPLETED' : 'ARCHIVED',
          metadataRedacted: {
            fromStatus: passage.progressStatus,
            toStatus: decision.progressStatus,
          },
        },
      });

      const record = await tx.passage.findUniqueOrThrow({
        where: { id: input.passageId },
        include: RECORD_INCLUDE,
      });
      return { record, outcome: 'APPLY' };
    });
  }
}
