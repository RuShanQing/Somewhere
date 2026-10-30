import { Inject, Injectable } from '@nestjs/common';
import type { City, Postcard, PostcardDraft } from '@prisma/client';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import { AppError } from '../../common/errors/app-error';
import type { AuthenticatedUser } from '../../common/http/request.types';
import { AccountService } from '../auth/account.service';
import { DeliveryPolicy } from '../delivery/delivery-policy.service';
import { PassageReader } from '../passage/passage-reader.service';
import { PenpalReader } from '../penpal/penpal-reader.service';
import { BlockPolicy } from '../safety/block-policy.service';
import { CityService } from '../profile/city.service';
import type { MailProfile } from '../profile/profile-reader.service';
import { ProfileReader } from '../profile/profile-reader.service';
import { validatePostcardBody } from './domain/body';
import { normalizeIdempotencyKey } from './domain/idempotency';
import { resolvePassageRecipient } from './domain/passage-binding';
import {
  canReadPostcardBody,
  postcardRoleFor,
  type PostcardStatusValue,
} from './domain/visibility';
import type { CreatePostcardDraftDto, UpdatePostcardDraftDto } from './dto/draft.dto';
import type { PostcardListQueryDto } from './dto/list-query.dto';
import type {
  DraftSummaryDto,
  InboxItemDto,
  PostOfficeSummaryDto,
  PostcardCityDto,
  PostcardDetailDto,
  PostcardDraftResponseDto,
  PostcardParticipantDto,
  RecipientResponseDto,
  SendPostcardResponseDto,
  TransitItemDto,
  TransitSummaryDto,
} from './dto/postcard-response.dto';
import { DraftRepository } from './repositories/draft.repository';
import { PostcardRepository } from './repositories/postcard.repository';

const DEFAULT_LIMIT = 20;
const SUMMARY_LIMIT = 5;

@Injectable()
export class PostcardService {
  constructor(
    private readonly drafts: DraftRepository,
    private readonly postcards: PostcardRepository,
    private readonly accounts: AccountService,
    private readonly profiles: ProfileReader,
    private readonly cities: CityService,
    private readonly delivery: DeliveryPolicy,
    private readonly passages: PassageReader,
    private readonly penpals: PenpalReader,
    private readonly blocks: BlockPolicy,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async listRecipients(
    user: AuthenticatedUser,
    passageId?: string,
  ): Promise<RecipientResponseDto[]> {
    const blockedIds = await this.blocks.listRelatedBlockedIds(user.id);

    if (passageId) {
      const context = await this.passages.findSendContext(passageId, user.id);
      if (!context) {
        throw AppError.resourceNotAccessible();
      }
      if (!context.canSend || blockedIds.has(context.receiverId)) {
        return [];
      }
      const profile = (await this.profiles.findMailProfiles([context.receiverId]))[0];
      if (!profile || profile.receptionMode !== 'OPEN' || !profile.city) {
        return [];
      }
      return [
        {
          id: profile.userId,
          nickname: profile.nickname,
          city: this.toCitySummary(profile.city),
        },
      ];
    }

    const allowedIds = await this.allowedRecipientIds(user);
    if (allowedIds.size === 0) {
      return [];
    }
    const profiles = await this.profiles.findMailProfiles(Array.from(allowedIds));
    return profiles
      .filter(
        (profile) =>
          profile.userId !== user.id &&
          !blockedIds.has(profile.userId) &&
          profile.receptionMode === 'OPEN' &&
          profile.city !== null,
      )
      .map((profile) => ({
        id: profile.userId,
        nickname: profile.nickname,
        city: this.toCitySummary(profile.city as NonNullable<MailProfile['city']>),
      }))
      .sort((left, right) => left.nickname.localeCompare(right.nickname, 'zh-Hans-CN'));
  }

  async getSummary(user: AuthenticatedUser): Promise<PostOfficeSummaryDto> {
    const [incomingRows, transitRows, draftRows] = await Promise.all([
      this.postcards.listIncoming(user.id, SUMMARY_LIMIT, 0),
      this.postcards.listTransit(user.id, SUMMARY_LIMIT, 0),
      this.drafts.findManyByOwner(user.id, SUMMARY_LIMIT, 0),
    ]);

    const senderIds = Array.from(new Set(incomingRows.map((row) => row.senderId)));
    const senders = await this.accounts.findPublicByIds(senderIds);
    const nicknameById = new Map(senders.map((sender) => [sender.id, sender.nickname]));

    return {
      incoming: incomingRows.map((row) => ({
        id: row.id,
        senderNickname: nicknameById.get(row.senderId) ?? '远方来信',
        deliveredAt: (row.deliveredAt ?? row.deliverAt).toISOString(),
      })),
      inTransit: transitRows.map((row) => this.toTransitSummary(row.id, row.deliverAt)),
      drafts: draftRows.map((draft) => this.toDraftSummary(draft)),
    };
  }

  async listDrafts(
    user: AuthenticatedUser,
    query: PostcardListQueryDto,
  ): Promise<PostcardDraftResponseDto[]> {
    const rows = await this.drafts.findManyByOwner(
      user.id,
      query.limit ?? DEFAULT_LIMIT,
      query.offset ?? 0,
    );
    const recipientIds = Array.from(
      new Set(rows.flatMap((draft) => (draft.recipientId ? [draft.recipientId] : []))),
    );
    const recipients = await this.accounts.findPublicByIds(recipientIds);
    const recipientById = new Map(recipients.map((recipient) => [recipient.id, recipient]));
    return rows.map((draft) =>
      this.toDraftResponse(
        draft,
        draft.recipientId ? recipientById.get(draft.recipientId) ?? null : null,
      ),
    );
  }

  async getDraft(user: AuthenticatedUser, id: string): Promise<PostcardDraftResponseDto> {
    const draft = await this.findOwnedUnsentDraft(user, id);
    const recipient = draft.recipientId
      ? (await this.accounts.findPublicByIds([draft.recipientId]))[0] ?? null
      : null;
    return this.toDraftResponse(draft, recipient);
  }

  async createDraft(
    user: AuthenticatedUser,
    input: CreatePostcardDraftDto,
  ): Promise<PostcardDraftResponseDto> {
    const body = this.requireValidBody(input.body);

    const passageContext = input.passageId
      ? await this.passages.findSendContext(input.passageId, user.id)
      : null;
    if (input.passageId && !passageContext) {
      throw AppError.resourceNotAccessible();
    }

    let recipientId = input.recipientId ?? null;
    if (passageContext) {
      if (await this.blocks.isBlockedEitherDirection(user.id, passageContext.receiverId)) {
        throw AppError.contactBlocked();
      }
      const resolution = resolvePassageRecipient(
        passageContext.receiverId,
        input.recipientId,
      );
      if (!resolution.ok) {
        throw AppError.validation(['recipient:passageMismatch']);
      }
      recipientId = resolution.recipientId;
    } else {
      await this.assertDraftRecipientAllowed(user, input.recipientId);
    }

    const draft = await this.drafts.create(
      user.id,
      body,
      recipientId,
      passageContext?.passageId ?? null,
    );
    const recipient = draft.recipientId
      ? (await this.accounts.findPublicByIds([draft.recipientId]))[0] ?? null
      : null;
    return this.toDraftResponse(draft, recipient);
  }

  async updateDraft(
    user: AuthenticatedUser,
    id: string,
    input: UpdatePostcardDraftDto,
  ): Promise<PostcardDraftResponseDto> {
    if (input.body === undefined && input.recipientId === undefined) {
      throw AppError.validation(['body:empty']);
    }
    const draft = await this.findOwnedUnsentDraft(user, id);
    const body = input.body === undefined ? undefined : this.requireValidBody(input.body);

    let nextRecipientId = input.recipientId;
    if (input.recipientId !== undefined) {
      if (draft.passageId) {
        const context = await this.passages.findSendContext(draft.passageId, user.id);
        if (!context) {
          throw AppError.resourceNotAccessible();
        }
        if (await this.blocks.isBlockedEitherDirection(user.id, context.receiverId)) {
          throw AppError.contactBlocked();
        }
        const resolution = resolvePassageRecipient(
          context.receiverId,
          input.recipientId,
        );
        if (!resolution.ok) {
          throw AppError.validation(['recipient:passageMismatch']);
        }
        nextRecipientId = resolution.recipientId;
      } else {
        await this.assertDraftRecipientAllowed(user, input.recipientId);
      }
    }

    const updated = await this.drafts.updateUnsent(id, user.id, {
      ...(body !== undefined ? { body } : {}),
      ...(nextRecipientId !== undefined ? { recipientId: nextRecipientId } : {}),
    });
    if (!updated) {
      throw AppError.resourceNotAccessible();
    }
    return this.getDraft(user, id);
  }

  async deleteDraft(user: AuthenticatedUser, id: string): Promise<void> {
    const deleted = await this.drafts.deleteUnsent(id, user.id);
    if (!deleted) {
      throw AppError.resourceNotAccessible();
    }
  }

  async sendDraft(
    user: AuthenticatedUser,
    draftId: string,
    rawIdempotencyKey: string | undefined,
  ): Promise<SendPostcardResponseDto> {
    const idempotencyKey = this.parseIdempotencyKey(rawIdempotencyKey);
    const draft = await this.findOwnedDraft(user, draftId);

    if (draft.sentPostcardId) {
      const existing = await this.postcards.findById(draft.sentPostcardId);
      if (existing) {
        return this.toSendResponse(existing);
      }
    }

    const body = this.requireValidBody(draft.body);

    let receiverId = draft.recipientId;
    let passageId: string | null = draft.passageId;

    if (draft.passageId) {
      const context = await this.passages.findSendContext(draft.passageId, user.id);
      if (!context) {
        throw AppError.resourceNotAccessible();
      }
      if (await this.blocks.isBlockedEitherDirection(user.id, context.receiverId)) {
        throw AppError.contactBlocked();
      }
      if (!context.canSend) {
        throw AppError.passageStateConflict('这段共途当前不允许新的通信');
      }
      const resolution = resolvePassageRecipient(context.receiverId, draft.recipientId);
      if (!resolution.ok) {
        throw AppError.validation(['recipient:passageMismatch']);
      }
      receiverId = resolution.recipientId;
      passageId = context.passageId;
    } else {
      if (!receiverId) {
        throw AppError.validation(['recipient:required']);
      }
      if (receiverId === user.id) {
        throw AppError.validation(['recipient:self']);
      }
      if (await this.blocks.isBlockedEitherDirection(user.id, receiverId)) {
        throw AppError.contactBlocked();
      }
      const allowed = await this.allowedRecipientIds(user);
      if (!allowed.has(receiverId)) {
        throw AppError.resourceNotAccessible();
      }
    }

    if (!receiverId) {
      throw AppError.validation(['recipient:required']);
    }
    if (receiverId === user.id) {
      throw AppError.validation(['recipient:self']);
    }

    const [senderProfile, recipientProfile] = await this.profiles.findMailProfiles([
      user.id,
      receiverId,
    ]);
    if (!senderProfile) {
      throw AppError.resourceNotAccessible();
    }
    if (!senderProfile.cityId) {
      throw AppError.validation(['senderCity:required']);
    }
    if (!recipientProfile) {
      throw AppError.resourceNotAccessible();
    }
    if (!recipientProfile.cityId) {
      throw AppError.validation(['recipient:cityRequired']);
    }
    if (recipientProfile.receptionMode !== 'OPEN') {
      throw AppError.validation(['recipient:notReceiving']);
    }

    const [originCity, destinationCity] = await Promise.all([
      this.cities.findById(senderProfile.cityId),
      this.cities.findById(recipientProfile.cityId),
    ]);
    if (!originCity || !destinationCity) {
      throw AppError.validation(['city:notFound']);
    }

    const sentAt = new Date();
    let plan;
    try {
      plan = this.delivery.plan(
        sentAt,
        { latitude: originCity.centroidLat, longitude: originCity.centroidLon },
        { latitude: destinationCity.centroidLat, longitude: destinationCity.centroidLon },
      );
    } catch {
      throw AppError.serviceUnavailable();
    }

    const result = await this.postcards.sendFromDraft({
      draftId: draft.id,
      ownerId: user.id,
      body,
      receiverId,
      passageId,
      originCityId: originCity.id,
      destinationCityId: destinationCity.id,
      sentAt,
      deliverAt: plan.deliverAt,
      idempotencyKey,
      maxSendsPerDay: this.config.postcardMaxSendsPerDay,
    });
    return this.toSendResponse(result.postcard);
  }

  async listTransit(
    user: AuthenticatedUser,
    query: PostcardListQueryDto,
  ): Promise<TransitItemDto[]> {
    const rows = await this.postcards.listTransit(
      user.id,
      query.limit ?? DEFAULT_LIMIT,
      query.offset ?? 0,
    );
    return rows.map((row) => ({
      id: row.id,
      deliverAt: row.deliverAt.toISOString(),
      stage: 'TRAVELING',
    }));
  }

  async listInbox(
    user: AuthenticatedUser,
    query: PostcardListQueryDto,
  ): Promise<InboxItemDto[]> {
    const rows = await this.postcards.listIncoming(
      user.id,
      query.limit ?? DEFAULT_LIMIT,
      query.offset ?? 0,
    );
    const senders = await this.accounts.findPublicByIds(
      Array.from(new Set(rows.map((row) => row.senderId))),
    );
    const nicknameById = new Map(senders.map((sender) => [sender.id, sender.nickname]));
    return rows.map((row) => ({
      id: row.id,
      senderNickname: nicknameById.get(row.senderId) ?? '远方来信',
      deliveredAt: (row.deliveredAt ?? row.deliverAt).toISOString(),
    }));
  }

  async getPostcard(user: AuthenticatedUser, id: string): Promise<PostcardDetailDto> {
    const postcard = await this.postcards.findById(id);
    if (!postcard) {
      throw AppError.resourceNotAccessible();
    }
    const now = new Date();
    const role = postcardRoleFor(user.id, postcard);
    if (role === 'OTHER') {
      throw AppError.resourceNotAccessible();
    }
    if (role === 'RECEIVER' && postcard.status === 'IN_TRANSIT') {
      throw AppError.resourceNotAccessible();
    }
    if (
      role === 'RECEIVER' &&
      postcard.status === 'DELIVERED' &&
      postcard.deliverAt.getTime() > now.getTime()
    ) {
      throw AppError.resourceNotAccessible();
    }

    const [sender, receiver, originCity, destinationCity] = await Promise.all([
      this.accounts.findPublicByIds([postcard.senderId]),
      this.accounts.findPublicByIds([postcard.receiverId]),
      this.cities.findById(postcard.originCityId),
      this.cities.findById(postcard.destinationCityId),
    ]);
    if (!sender[0] || !receiver[0] || !originCity || !destinationCity) {
      throw AppError.resourceNotAccessible();
    }

    const canRead = canReadPostcardBody(user.id, postcard, now);
    return {
      id: postcard.id,
      status: postcard.status,
      body: canRead ? postcard.body : null,
      sentAt: postcard.sentAt.toISOString(),
      deliverAt: postcard.deliverAt.toISOString(),
      deliveredAt: postcard.deliveredAt?.toISOString() ?? null,
      sender: this.toParticipant(sender[0]),
      receiver: this.toParticipant(receiver[0]),
      originCity: this.toCity(originCity),
      destinationCity: this.toCity(destinationCity),
    };
  }

  private async findOwnedDraft(user: AuthenticatedUser, id: string): Promise<PostcardDraft> {
    const draft = await this.drafts.findById(id);
    if (!draft || draft.ownerId !== user.id) {
      throw AppError.resourceNotAccessible();
    }
    return draft;
  }

  private async findOwnedUnsentDraft(
    user: AuthenticatedUser,
    id: string,
  ): Promise<PostcardDraft> {
    const draft = await this.findOwnedDraft(user, id);
    if (draft.sentPostcardId) {
      throw AppError.resourceNotAccessible();
    }
    return draft;
  }

  /** 草稿阶段也限制在服务端收件人来源内，避免通过草稿接口枚举其他用户。 */
  private async assertDraftRecipientAllowed(
    user: AuthenticatedUser,
    recipientId: string | null | undefined,
  ): Promise<void> {
    if (!recipientId) {
      return;
    }
    if (await this.blocks.isBlockedEitherDirection(user.id, recipientId)) {
      throw AppError.contactBlocked();
    }
    const allowed = await this.allowedRecipientIds(user);
    if (!allowed.has(recipientId)) {
      throw AppError.resourceNotAccessible();
    }
  }

  private async allowedRecipientIds(user: AuthenticatedUser): Promise<Set<string>> {
    const demoEmails = this.config.postcardDemoRecipientEmails;
    const [accounts, penpalIds] = await Promise.all([
      demoEmails.length > 0
        ? this.accounts.findPublicByEmails(demoEmails)
        : Promise.resolve([]),
      this.penpals.listActiveCounterpartIds(user.id),
    ]);
    return new Set([...accounts.map((account) => account.id), ...penpalIds]);
  }

  private requireValidBody(raw: string): string {
    const result = validatePostcardBody(raw);
    if (result.ok) {
      return result.body;
    }
    throw AppError.validation([
      result.reason === 'blank' ? 'body:blank' : 'body:length',
    ]);
  }

  private parseIdempotencyKey(raw: string | undefined): string | null {
    try {
      return normalizeIdempotencyKey(raw);
    } catch {
      throw AppError.validation(['idempotencyKey:invalid']);
    }
  }

  private toDraftResponse(
    draft: PostcardDraft,
    recipient: { id: string; nickname: string } | null,
  ): PostcardDraftResponseDto {
    return {
      id: draft.id,
      recipient: recipient ? { id: recipient.id, nickname: recipient.nickname } : null,
      body: draft.body,
      passageId: draft.passageId,
      updatedAt: draft.updatedAt.toISOString(),
    };
  }

  private toDraftSummary(draft: PostcardDraft): DraftSummaryDto {
    return { id: draft.id, updatedAt: draft.updatedAt.toISOString() };
  }

  private toTransitSummary(id: string, deliverAt: Date): TransitSummaryDto {
    return { id, deliverAt: deliverAt.toISOString(), stage: 'TRAVELING' };
  }

  private toSendResponse(postcard: Postcard): SendPostcardResponseDto {
    return {
      postcardId: postcard.id,
      status: postcard.status as PostcardStatusValue,
      sentAt: postcard.sentAt.toISOString(),
      deliverAt: postcard.deliverAt.toISOString(),
    };
  }

  private toParticipant(account: { id: string; nickname: string }): PostcardParticipantDto {
    return { id: account.id, nickname: account.nickname };
  }

  private toCity(city: City): PostcardCityDto {
    return { id: city.id, name: city.name, countryCode: city.countryCode };
  }

  private toCitySummary(city: NonNullable<MailProfile['city']>): PostcardCityDto {
    return { id: city.id, name: city.name, countryCode: city.countryCode };
  }
}
