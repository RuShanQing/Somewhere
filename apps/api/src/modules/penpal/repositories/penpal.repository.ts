import { Injectable } from '@nestjs/common';
import type { Prisma, PenpalConsentState } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import type { PenpalPairConsent } from '../domain/penpal-policy';

export interface PenpalConsentRow {
  ownerId: string;
  counterpartId: string;
  consentState: PenpalConsentState;
}

/**
 * 信友同意持久化。
 *
 * 只保存两条单方记录；聚合状态不落库。
 * 重复同意保持原 consentedAt，撤销只改本人行。
 */
@Injectable()
export class PenpalRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findPair(viewerId: string, counterpartId: string): Promise<PenpalPairConsent> {
    if (viewerId === counterpartId) {
      return { mine: null, theirs: null };
    }
    const rows = await this.prisma.penpalConsent.findMany({
      where: {
        OR: [
          { ownerId: viewerId, counterpartId },
          { ownerId: counterpartId, counterpartId: viewerId },
        ],
      },
      select: { ownerId: true, consentState: true },
    });
    return {
      mine: rows.find((row) => row.ownerId === viewerId)?.consentState ?? null,
      theirs: rows.find((row) => row.ownerId === counterpartId)?.consentState ?? null,
    };
  }

  async listForUser(userId: string): Promise<PenpalConsentRow[]> {
    return this.prisma.penpalConsent.findMany({
      where: { OR: [{ ownerId: userId }, { counterpartId: userId }] },
      select: { ownerId: true, counterpartId: true, consentState: true },
      orderBy: [{ counterpartId: 'asc' }, { ownerId: 'asc' }],
    });
  }

  /** 幂等同意：已 ALLOW 时不更新时间；REVOKED 时重新打开。 */
  async allow(ownerId: string, counterpartId: string, now: Date): Promise<void> {
    const key = { ownerId_counterpartId: { ownerId, counterpartId } };
    const existing = await this.prisma.penpalConsent.findUnique({
      where: key,
      select: { consentState: true },
    });
    if (existing?.consentState === 'ALLOW') {
      return;
    }
    if (existing) {
      await this.prisma.penpalConsent.updateMany({
        where: { ownerId, counterpartId, consentState: 'REVOKED' },
        data: { consentState: 'ALLOW', consentedAt: now, revokedAt: null },
      });
      return;
    }

    try {
      await this.prisma.penpalConsent.create({
        data: { ownerId, counterpartId, consentState: 'ALLOW', consentedAt: now },
      });
    } catch (error) {
      if (!this.isUniqueViolation(error)) {
        throw error;
      }
      // 并发同意已经写入：即使对方刚撤销，也以本次明确同意为准。
      await this.prisma.penpalConsent.updateMany({
        where: { ownerId, counterpartId, consentState: 'REVOKED' },
        data: { consentState: 'ALLOW', consentedAt: now, revokedAt: null },
      });
    }
  }

  /**
   * 幂等撤销：
   * - 本人已有 ALLOW：改为 REVOKED；
   * - 本人从未同意但对方有请求：写入本人 REVOKED，关闭请求；
   * - 其余情况不写行。
   */
  async revoke(ownerId: string, counterpartId: string, now: Date): Promise<void> {
    const updated = await this.prisma.penpalConsent.updateMany({
      where: { ownerId, counterpartId, consentState: 'ALLOW' },
      data: { consentState: 'REVOKED', revokedAt: now },
    });
    if (updated.count > 0) {
      return;
    }

    const own = await this.prisma.penpalConsent.findUnique({
      where: { ownerId_counterpartId: { ownerId, counterpartId } },
      select: { consentState: true },
    });
    if (own) {
      return;
    }

    const counterpart = await this.prisma.penpalConsent.findUnique({
      where: { ownerId_counterpartId: { ownerId: counterpartId, counterpartId: ownerId } },
      select: { consentState: true },
    });
    if (counterpart?.consentState !== 'ALLOW') {
      return;
    }

    await this.prisma.penpalConsent.createMany({
      data: [{ ownerId, counterpartId, consentState: 'REVOKED', revokedAt: now }],
      skipDuplicates: true,
    });
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
