import { Injectable } from '@nestjs/common';
import { Prisma, type Story, type StoryReviewDecision } from '@prisma/client';
import { AppError } from '../../../common/errors/app-error';
import { PrismaService } from '../../../prisma/prisma.service';
import type { StoryCursor } from '../domain/story-cursor';
import {
  canDeleteStory,
  canEditStory,
  canReviewStory,
  canSubmitStory,
  canWithdrawStory,
  shouldPublishOnApproval,
} from '../domain/story-state';
import { PUBLIC_STORY_CONDITION } from '../domain/story-visibility';
import type { PublicCityStorySummary } from '../story.types';

export interface CreateStoryInput {
  authorId: string;
  cityId: string;
  title: string;
  body: string;
  topicTags: string[];
}

export interface UpdateStoryInput {
  title?: string;
  body?: string;
  topicTags?: string[];
  cityId?: string;
}

export interface PublicStoryQuery {
  cityId?: string;
  topic?: string;
  cursor: StoryCursor | null;
  limit: number;
}



@Injectable()
export class StoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateStoryInput): Promise<Story> {
    return this.prisma.story.create({
      data: {
        authorId: input.authorId,
        cityId: input.cityId,
        title: input.title,
        body: input.body,
        topicTags: input.topicTags,
        reviewStatus: 'DRAFT',
      },
    });
  }

  async findById(id: string): Promise<Story | null> {
    return this.prisma.story.findUnique({ where: { id } });
  }

  async findOwned(id: string, authorId: string): Promise<Story | null> {
    return this.prisma.story.findFirst({ where: { id, authorId } });
  }

  async listMine(authorId: string, limit: number, offset: number): Promise<Story[]> {
    return this.prisma.story.findMany({
      where: { authorId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      skip: offset,
    });
  }

  async updateOwned(
    id: string,
    authorId: string,
    input: UpdateStoryInput,
  ): Promise<Story | null> {
    const existing = await this.findOwned(id, authorId);
    if (!existing) {
      return null;
    }
    if (!canEditStory(existing.reviewStatus)) {
      throw AppError.storyStateConflict('只有草稿或未通过的故事可以编辑');
    }
    const result = await this.prisma.story.updateMany({
      where: {
        id,
        authorId,
        reviewStatus: { in: ['DRAFT', 'REJECTED'] },
      },
      data: input,
    });
    if (result.count !== 1) {
      throw AppError.storyStateConflict('只有草稿或未通过的故事可以编辑');
    }
    return this.findById(id);
  }

  async deleteDraft(id: string, authorId: string): Promise<boolean> {
    const existing = await this.findOwned(id, authorId);
    if (!existing) {
      return false;
    }
    if (!canDeleteStory(existing.reviewStatus)) {
      throw AppError.storyStateConflict('已提交的故事不能删除，只能撤回');
    }
    const result = await this.prisma.story.deleteMany({
      where: { id, authorId, reviewStatus: 'DRAFT' },
    });
    return result.count === 1;
  }

  async submitOwned(
    id: string,
    authorId: string,
    now: Date,
    windowStart: Date,
    maxSubmissions: number,
  ): Promise<Story> {
    return this.prisma.$transaction(async (tx) => {
      const story = await tx.story.findFirst({ where: { id, authorId } });
      if (!story) {
        throw AppError.resourceNotAccessible();
      }
      if (!canSubmitStory(story.reviewStatus)) {
        throw AppError.storyStateConflict('当前状态不能提交审核');
      }

      const recentCount = await tx.story.count({
        where: { authorId, submittedAt: { gte: windowStart } },
      });
      if (recentCount >= maxSubmissions) {
        throw AppError.storySubmissionLimitReached();
      }

      return tx.story.update({
        where: { id },
        data: {
          reviewStatus: 'PENDING',
          submittedAt: now,
          publicConsentAt: now,
          reviewedAt: null,
          reviewedById: null,
          publishedAt: null,
          archivedAt: null,
          removedBy: null,
        },
      });
    });
  }

  async withdrawOwned(id: string, authorId: string, now: Date): Promise<Story> {
    return this.prisma.$transaction(async (tx) => {
      const story = await tx.story.findFirst({ where: { id, authorId } });
      if (!story) {
        throw AppError.resourceNotAccessible();
      }
      if (!canWithdrawStory(story.reviewStatus)) {
        throw AppError.storyStateConflict('当前状态不能撤回');
      }

      await this.lockCity(tx, story.cityId);
      const updated = await tx.story.update({
        where: { id },
        data: {
          reviewStatus: 'REMOVED',
          archivedAt: now,
          publicConsentAt: null,
          removedBy: 'AUTHOR',
        },
      });
      if (story.publishedAt !== null) {
        await this.promoteNextLocked(tx, story.cityId, now);
      }
      return updated;
    });
  }

  async listPublic(query: PublicStoryQuery): Promise<Story[]> {
    const where: Prisma.StoryWhereInput = {
      ...PUBLIC_STORY_CONDITION,
      ...(query.cityId ? { cityId: query.cityId } : {}),
      ...(query.topic ? { topicTags: { has: query.topic } } : {}),
      ...(query.cursor
        ? {
            OR: [
              { publishedAt: { lt: query.cursor.at } },
              {
                publishedAt: query.cursor.at,
                id: { lt: query.cursor.id },
              },
            ],
          }
        : {}),
    };

    return this.prisma.story.findMany({
      where,
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
  }

  async findPublicById(id: string): Promise<Story | null> {
    return this.prisma.story.findFirst({
      where: { id, ...PUBLIC_STORY_CONDITION },
    });
  }

  /**
   * 按城市聚合公开故事数量。与 listPublic 共用同一谓词，
   * 保证地图城市入口与故事站返回同一批 Story。
   */
  async groupPublicByCity(topic: string | null): Promise<PublicCityStorySummary[]> {
    const grouped = await this.prisma.story.groupBy({
      by: ['cityId'],
      where: {
        ...PUBLIC_STORY_CONDITION,
        ...(topic ? { topicTags: { has: topic } } : {}),
      },
      _count: { _all: true },
      _max: { publishedAt: true },
      orderBy: [{ _max: { publishedAt: 'desc' } }, { cityId: 'asc' }],
    });

    return grouped.flatMap((row) => {
      const latestPublishedAt = row._max.publishedAt;
      if (!latestPublishedAt) {
        return [];
      }
      return [
        {
          cityId: row.cityId,
          publicStoryCount: row._count._all,
          latestPublishedAt,
        },
      ];
    });
  }

  async listModerationQueue(cursor: StoryCursor | null, limit: number): Promise<Story[]> {
    const where: Prisma.StoryWhereInput = {
      reviewStatus: 'PENDING',
      ...(cursor
        ? {
            OR: [
              { submittedAt: { gt: cursor.at } },
              {
                submittedAt: cursor.at,
                id: { gt: cursor.id },
              },
            ],
          }
        : {}),
    };

    return this.prisma.story.findMany({
      where,
      orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
      take: limit + 1,
    });
  }

  async decideStory(input: {
    storyId: string;
    moderatorId: string;
    decision: StoryReviewDecision;
    reasonCode: 'PRIVACY' | 'CONTACT_INFO' | 'HARASSMENT' | 'ILLEGAL' | 'OTHER' | null;
    now: Date;
    maxActivePerCity: number;
  }): Promise<Story> {
    return this.prisma.$transaction(async (tx) => {
      const story = await tx.story.findUnique({ where: { id: input.storyId } });
      if (!story) {
        throw AppError.resourceNotAccessible();
      }
      if (story.authorId === input.moderatorId) {
        throw AppError.forbidden('不能审核自己创作的故事');
      }
      if (!canReviewStory(story.reviewStatus, input.decision)) {
        throw AppError.storyStateConflict();
      }

      await this.lockCity(tx, story.cityId);

      let publishedAt = story.publishedAt;
      let archivedAt = story.archivedAt;
      let removedBy = story.removedBy;
      let reviewStatus = story.reviewStatus;

      if (input.decision === 'APPROVE') {
        const activeCount = await tx.story.count({
          where: { ...PUBLIC_STORY_CONDITION, cityId: story.cityId },
        });
        reviewStatus = 'APPROVED';
        publishedAt = shouldPublishOnApproval(activeCount, input.maxActivePerCity)
          ? input.now
          : null;
        archivedAt = null;
        removedBy = null;
      } else if (input.decision === 'REJECT') {
        reviewStatus = 'REJECTED';
        publishedAt = null;
        archivedAt = null;
        removedBy = null;
      } else {
        reviewStatus = 'REMOVED';
        archivedAt = input.now;
        removedBy = 'MODERATOR';
      }

      const updated = await tx.story.updateMany({
        where: { id: story.id, reviewStatus: story.reviewStatus },
        data: {
          reviewStatus,
          publishedAt,
          archivedAt,
          removedBy,
          reviewedAt: input.now,
          reviewedById: input.moderatorId,
        },
      });
      if (updated.count !== 1) {
        throw AppError.storyStateConflict();
      }

      await tx.storyReviewAction.create({
        data: {
          storyId: story.id,
          moderatorId: input.moderatorId,
          action: input.decision,
          reasonCode: input.reasonCode,
          createdAt: input.now,
        },
      });

      if (input.decision === 'REMOVE' && story.publishedAt !== null) {
        await this.promoteNextLocked(tx, story.cityId, input.now);
      }

      const result = await tx.story.findUnique({ where: { id: story.id } });
      if (!result) {
        throw AppError.resourceNotAccessible();
      }
      return result;
    });
  }

  private async lockCity(tx: Prisma.TransactionClient, cityId: string): Promise<void> {
    await tx.$queryRaw`SELECT "id" FROM "cities" WHERE "id" = ${cityId}::uuid FOR UPDATE`;
  }

  private async promoteNextLocked(
    tx: Prisma.TransactionClient,
    cityId: string,
    now: Date,
  ): Promise<void> {
    const next = await tx.story.findFirst({
      where: { ...PUBLIC_STORY_CONDITION, publishedAt: null, cityId },
      orderBy: [{ reviewedAt: 'asc' }, { id: 'asc' }],
    });
    if (!next) {
      return;
    }
    await tx.story.update({
      where: { id: next.id },
      data: { publishedAt: now },
    });
  }
}
