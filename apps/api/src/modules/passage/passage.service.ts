import { Injectable } from '@nestjs/common';
import type { PassageKind } from '@prisma/client';
import { AppError } from '../../common/errors/app-error';
import type { AuthenticatedUser } from '../../common/http/request.types';
import { ProfileReader, type MailProfile } from '../profile/profile-reader.service';
import { canSendPassage, isValidParticipantPair } from './domain/passage-policy';
import type { PassageListQueryDto } from './dto/passage.dto';
import type {
  PassageListDto,
  PassageSummaryDto,
} from './dto/passage-response.dto';
import { PassageRepository } from './repositories/passage.repository';
import type { PassageRecord } from './passage.types';

const MAX_TOPIC_LENGTH = 80;

@Injectable()
export class PassageService {
  constructor(
    private readonly passages: PassageRepository,
    private readonly profiles: ProfileReader,
  ) {}

  async list(user: AuthenticatedUser, query: PassageListQueryDto): Promise<PassageListDto> {
    const statuses =
      query.status && query.status !== 'ALL' ? [query.status] : null;
    const records = await this.passages.listForUser(user.id, statuses);
    const profileByUserId = await this.loadCounterpartProfiles(records, user.id);
    return {
      items: records.map((record) => this.toSummary(record, user.id, profileByUserId)),
    };
  }

  async get(user: AuthenticatedUser, id: string): Promise<PassageSummaryDto> {
    const record = await this.requireParticipant(user, id);
    const profileByUserId = await this.loadCounterpartProfiles([record], user.id);
    return this.toSummary(record, user.id, profileByUserId);
  }

  async pause(user: AuthenticatedUser, id: string): Promise<PassageSummaryDto> {
    return this.applyParticipantAction(user, id, 'PAUSE');
  }

  async resume(user: AuthenticatedUser, id: string): Promise<PassageSummaryDto> {
    return this.applyParticipantAction(user, id, 'RESUME');
  }

  async complete(user: AuthenticatedUser, id: string): Promise<PassageSummaryDto> {
    return this.applyProgressAction(user, id, 'COMPLETE');
  }

  async archive(user: AuthenticatedUser, id: string): Promise<PassageSummaryDto> {
    return this.applyProgressAction(user, id, 'ARCHIVE');
  }

  /**
   * 仅供测试夹具与后续邀请流程复用：当前没有 HTTP 创建入口。
   * 创建前必须确认是两名不同用户，避免出现 1 人或 3 人共途。
   */
  async createForPair(input: {
    topic: string;
    kind: PassageKind;
    participantIds: string[];
  }): Promise<PassageSummaryDto> {
    const topic = input.topic.trim();
    if (topic.length < 1 || topic.length > MAX_TOPIC_LENGTH) {
      throw AppError.validation(['topic']);
    }
    if (!isValidParticipantPair(input.participantIds)) {
      throw AppError.validation(['participants']);
    }
    const [first, second] = input.participantIds as [string, string];
    const profiles = await this.profiles.findMailProfiles([first, second]);
    if (profiles.length !== 2) {
      throw AppError.validation(['participants:not_found']);
    }

    const record = await this.passages.createForPair({
      topic,
      kind: input.kind,
      participantIds: [first, second],
      actorId: first,
    });
    return this.toSummary(
      record,
      first,
      new Map(profiles.map((profile) => [profile.userId, profile])),
    );
  }

  private async applyParticipantAction(
    user: AuthenticatedUser,
    id: string,
    action: 'PAUSE' | 'RESUME',
  ): Promise<PassageSummaryDto> {
    const result = await this.passages.applyParticipantAction({
      passageId: id,
      userId: user.id,
      action,
      now: new Date(),
    });
    if (!result) {
      throw AppError.resourceNotAccessible();
    }
    return this.toSummaryWithProfiles(result.record, user.id);
  }

  private async applyProgressAction(
    user: AuthenticatedUser,
    id: string,
    action: 'COMPLETE' | 'ARCHIVE',
  ): Promise<PassageSummaryDto> {
    const result = await this.passages.applyProgressAction({
      passageId: id,
      userId: user.id,
      action,
      now: new Date(),
    });
    if (!result) {
      throw AppError.resourceNotAccessible();
    }
    return this.toSummaryWithProfiles(result.record, user.id);
  }

  private async requireParticipant(
    user: AuthenticatedUser,
    id: string,
  ): Promise<PassageRecord> {
    const record = await this.passages.findForUser(id, user.id);
    if (!record) {
      throw AppError.resourceNotAccessible();
    }
    return record;
  }

  private async toSummaryWithProfiles(
    record: PassageRecord,
    viewerId: string,
  ): Promise<PassageSummaryDto> {
    const profileByUserId = await this.loadCounterpartProfiles([record], viewerId);
    return this.toSummary(record, viewerId, profileByUserId);
  }

  private async loadCounterpartProfiles(
    records: PassageRecord[],
    viewerId: string,
  ): Promise<Map<string, MailProfile>> {
    const counterpartIds = records.flatMap((record) =>
      record.participants
        .filter((participant) => participant.userId !== viewerId)
        .map((participant) => participant.userId),
    );
    if (counterpartIds.length === 0) {
      return new Map();
    }
    const profiles = await this.profiles.findMailProfiles(counterpartIds);
    return new Map(profiles.map((profile) => [profile.userId, profile]));
  }

  private toSummary(
    record: PassageRecord,
    viewerId: string,
    profileByUserId: Map<string, MailProfile>,
  ): PassageSummaryDto {
    const me = record.participants.find((participant) => participant.userId === viewerId);
    const counterpart = record.participants.find(
      (participant) => participant.userId !== viewerId,
    );
    const counterpartProfile = counterpart
      ? profileByUserId.get(counterpart.userId)
      : undefined;

    return {
      id: record.id,
      topic: record.topic,
      kind: record.kind,
      progressStatus: record.progressStatus,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      completedAt: record.completedAt?.toISOString() ?? null,
      archivedAt: record.archivedAt?.toISOString() ?? null,
      me: {
        consentState: me?.consentState ?? 'CLOSED',
        pausedAt: me?.pausedAt?.toISOString() ?? null,
      },
      counterpart: {
        nickname: counterpartProfile?.nickname ?? '一位旅人',
        city: counterpartProfile?.city ?? null,
        consentState: counterpart?.consentState ?? 'CLOSED',
      },
      permissions: {
        canSend: canSendPassage({
          viewerId,
          progressStatus: record.progressStatus,
          participants: record.participants.map((participant) => ({
            userId: participant.userId,
            consentState: participant.consentState,
          })),
        }),
      },
    };
  }
}
