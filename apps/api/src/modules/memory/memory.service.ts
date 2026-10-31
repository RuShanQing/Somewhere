import { Injectable } from '@nestjs/common';
import type { PersonalMemory } from '@prisma/client';
import { AppError } from '../../common/errors/app-error';
import type { AuthenticatedUser } from '../../common/http/request.types';
import { PassageReader } from '../passage/passage-reader.service';
import {
  PostcardReader,
  type DiaryPairRecord,
  type DiaryPostcardRecord,
} from '../postcard/postcard-reader.service';
import { diaryPairBlockReason } from './domain/diary';
import {
  validatePersonalMemoryCreate,
  validatePersonalMemoryUpdate,
} from './domain/personal-memory';
import type {
  DiaryDetailDto,
  DiaryListDto,
  DiaryListQueryDto,
  DiaryPostcardDto,
  DiarySummaryDto,
} from './dto/diary-response.dto';
import type {
  CreatePersonalMemoryDto,
  UpdatePersonalMemoryDto,
} from './dto/personal-memory.dto';
import type {
  PersonalMemoryDto,
  PersonalMemoryListDto,
  PersonalMemoryListQueryDto,
} from './dto/personal-memory-response.dto';
import { MemoryRepository } from './repositories/memory.repository';

const DEFAULT_LIMIT = 20;

@Injectable()
export class MemoryService {
  constructor(
    private readonly memories: MemoryRepository,
    private readonly postcards: PostcardReader,
    private readonly passages: PassageReader,
  ) {}

  async list(
    user: AuthenticatedUser,
    query: PersonalMemoryListQueryDto,
  ): Promise<PersonalMemoryListDto> {
    const rows = await this.memories.listByOwner(
      user.id,
      query.limit ?? DEFAULT_LIMIT,
      query.offset ?? 0,
    );
    return { items: rows.map((row) => this.toDto(row)) };
  }

  async create(
    user: AuthenticatedUser,
    input: CreatePersonalMemoryDto,
  ): Promise<PersonalMemoryDto> {
    const result = validatePersonalMemoryCreate(input);
    if (!result.ok) {
      throw AppError.validation(result.details);
    }
    const row = await this.memories.create(user.id, result.value);
    return this.toDto(row);
  }

  async update(
    user: AuthenticatedUser,
    id: string,
    input: UpdatePersonalMemoryDto,
  ): Promise<PersonalMemoryDto> {
    const result = validatePersonalMemoryUpdate(input);
    if (!result.ok) {
      throw AppError.validation(result.details);
    }
    const row = await this.memories.update(user.id, id, result.value);
    if (!row) {
      throw AppError.resourceNotAccessible();
    }
    return this.toDto(row);
  }

  async remove(user: AuthenticatedUser, id: string): Promise<void> {
    const deleted = await this.memories.delete(user.id, id);
    if (!deleted) {
      throw AppError.resourceNotAccessible();
    }
  }

  async listDiaries(
    user: AuthenticatedUser,
    query: DiaryListQueryDto,
  ): Promise<DiaryListDto> {
    const limit = query.limit ?? DEFAULT_LIMIT;
    const offset = query.offset ?? 0;
    const contexts = await this.passages.listParticipantContexts(user.id);
    const topicById = new Map(contexts.map((context) => [context.id, context.topic]));
    const pages = await this.memories.listDiaryPagesByPassageIds(
      Array.from(topicById.keys()),
      limit,
      offset,
    );

    const items: DiarySummaryDto[] = [];
    for (const page of pages) {
      const topic = topicById.get(page.passageId);
      if (!topic) {
        continue;
      }
      const pair = await this.postcards.readDeliveredPair(
        user.id,
        page.postcardLeftId,
        page.postcardRightId,
      );
      if (!pair || !this.isReadablePair(pair)) {
        continue;
      }
      items.push(this.toDiarySummary(page.id, page.createdAt, page.passageId, topic, pair));
    }
    return { items };
  }

  async getDiary(user: AuthenticatedUser, id: string): Promise<DiaryDetailDto> {
    const page = await this.memories.findDiaryPageById(id);
    if (!page) {
      throw AppError.resourceNotAccessible();
    }
    const pair = await this.postcards.readDeliveredPair(
      user.id,
      page.postcardLeftId,
      page.postcardRightId,
    );
    if (!pair || !this.isReadablePair(pair)) {
      throw AppError.resourceNotAccessible();
    }
    const contexts = await this.passages.listParticipantContexts(user.id);
    const topic = contexts.find((context) => context.id === page.passageId)?.topic;
    if (!topic) {
      throw AppError.resourceNotAccessible();
    }
    return {
      id: page.id,
      passageId: page.passageId,
      topic,
      createdAt: page.createdAt.toISOString(),
      left: this.toDiaryPostcard(pair.left),
      right: this.toDiaryPostcard(pair.right),
    };
  }

  /**
   * Worker 组合根在投递后调用。候选由 PostcardReader 提供，配对规则与唯一性
   * 仍在本模块判定；重复候选由数据库唯一键与 skipDuplicates 兜底。
   */
  async generateDueDiaries(limit = 50): Promise<number> {
    const candidates = await this.postcards.listDiaryCandidates(limit);
    const valid = candidates.filter(
      (candidate) =>
        diaryPairBlockReason({
          leftId: candidate.left.id,
          leftStatus: candidate.left.status,
          leftPassageId: candidate.left.passageId,
          leftSenderId: candidate.left.senderId,
          leftReceiverId: candidate.left.receiverId,
          rightStatus: candidate.right.status,
          rightPassageId: candidate.right.passageId,
          rightSenderId: candidate.right.senderId,
          rightReceiverId: candidate.right.receiverId,
          rightReplyToPostcardId: candidate.right.replyToPostcardId,
        }) === null,
    );
    if (valid.length === 0) {
      return 0;
    }
    const existing = await this.memories.listDiaryPageReplyIds(
      valid.map((candidate) => candidate.right.id),
    );
    const rows = valid
      .filter((candidate) => !existing.has(candidate.right.id))
      .map((candidate) => ({
        passageId: candidate.right.passageId as string,
        leftId: candidate.left.id,
        rightId: candidate.right.id,
      }));
    return this.memories.createDiaryPages(rows);
  }

  private isReadablePair(pair: DiaryPairRecord): boolean {
    return (
      diaryPairBlockReason({
        leftId: pair.left.id,
        leftStatus: pair.left.status,
        leftPassageId: pair.left.passageId,
        leftSenderId: pair.left.senderId,
        leftReceiverId: pair.left.receiverId,
        rightStatus: pair.right.status,
        rightPassageId: pair.right.passageId,
        rightSenderId: pair.right.senderId,
        rightReceiverId: pair.right.receiverId,
        rightReplyToPostcardId: pair.right.replyToPostcardId,
      }) === null
    );
  }

  private toDiarySummary(
    id: string,
    createdAt: Date,
    passageId: string,
    topic: string,
    pair: DiaryPairRecord,
  ): DiarySummaryDto {
    return {
      id,
      passageId,
      topic,
      leftCity: pair.left.city,
      rightCity: pair.right.city,
      leftSentAt: pair.left.sentAt.toISOString(),
      rightSentAt: pair.right.sentAt.toISOString(),
      createdAt: createdAt.toISOString(),
    };
  }

  private toDiaryPostcard(postcard: DiaryPostcardRecord): DiaryPostcardDto {
    return {
      id: postcard.id,
      senderNickname: postcard.senderNickname,
      body: postcard.body,
      sentAt: postcard.sentAt.toISOString(),
      deliveredAt: postcard.deliveredAt?.toISOString() ?? null,
      city: postcard.city,
    };
  }

  private toDto(row: PersonalMemory): PersonalMemoryDto {
    return {
      id: row.id,
      title: row.title,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
