import { Injectable } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error';
import type { AuthenticatedUser } from '../../common/http/request.types';
import { PassageReader } from '../passage/passage-reader.service';
import { ProfileReader } from '../profile/profile-reader.service';
import { BlockPolicy } from '../safety/block-policy.service';
import {
  derivePenpalStatus,
  indexPenpalPairs,
  toPenpalView,
} from './domain/penpal-policy';
import type {
  PenpalActiveDto,
  PenpalConsentResultDto,
  PenpalCounterpartDto,
  PenpalOverviewDto,
  PenpalPendingDto,
} from './dto/penpal-response.dto';
import { PenpalRepository } from './repositories/penpal.repository';

@Injectable()
export class PenpalService {
  constructor(
    private readonly penpals: PenpalRepository,
    private readonly profiles: ProfileReader,
    private readonly passages: PassageReader,
    private readonly blocks: BlockPolicy,
  ) {}

  async list(user: AuthenticatedUser): Promise<PenpalOverviewDto> {
    const [rows, blockedIds] = await Promise.all([
      this.penpals.listForUser(user.id),
      this.blocks.listRelatedBlockedIds(user.id),
    ]);

    const pairById = indexPenpalPairs(user.id, rows);
    const counterpartIds = Array.from(pairById.keys());
    if (counterpartIds.length === 0) {
      return { active: [], incoming: [], outgoing: [] };
    }

    const profiles = await this.profiles.findMailProfiles(counterpartIds);
    const profileById = new Map(profiles.map((profile) => [profile.userId, profile]));

    const active: PenpalActiveDto[] = [];
    const incoming: PenpalPendingDto[] = [];
    const outgoing: PenpalPendingDto[] = [];

    for (const counterpartId of counterpartIds) {
      if (blockedIds.has(counterpartId)) {
        continue;
      }
      const profile = profileById.get(counterpartId);
      if (!profile) {
        continue;
      }
      const pair = pairById.get(counterpartId);
      const view = pair ? toPenpalView(pair) : null;
      if (!view) {
        continue;
      }
      const counterpart: PenpalCounterpartDto = {
        id: counterpartId,
        nickname: profile.nickname,
        city: profile.city
          ? {
              id: profile.city.id,
              name: profile.city.name,
              countryCode: profile.city.countryCode,
            }
          : null,
      };
      if (view === 'ACTIVE') {
        active.push({ counterpart });
      } else if (view === 'INCOMING') {
        incoming.push({ counterpart });
      } else {
        outgoing.push({ counterpart });
      }
    }

    return {
      active: this.sortByNickname(active),
      incoming: this.sortByNickname(incoming),
      outgoing: this.sortByNickname(outgoing),
    };
  }

  async consent(
    user: AuthenticatedUser,
    counterpartId: string,
  ): Promise<PenpalConsentResultDto> {
    if (counterpartId === user.id) {
      throw AppError.validation(['counterpartId:self']);
    }

    const hasCompletedPassage = await this.passages.hasCompletedPassageWith(
      user.id,
      counterpartId,
    );
    if (!hasCompletedPassage) {
      throw AppError.resourceNotAccessible();
    }

    if (await this.blocks.isBlockedEitherDirection(user.id, counterpartId)) {
      throw AppError.contactBlocked();
    }

    await this.penpals.allow(user.id, counterpartId, new Date());
    const pair = await this.penpals.findPair(user.id, counterpartId);
    return { state: derivePenpalStatus(pair) };
  }

  async revoke(user: AuthenticatedUser, counterpartId: string): Promise<void> {
    await this.penpals.revoke(user.id, counterpartId, new Date());
  }

  private sortByNickname<T extends { counterpart: PenpalCounterpartDto }>(items: T[]): T[] {
    return [...items].sort((left, right) => {
      const compared = left.counterpart.nickname.localeCompare(
        right.counterpart.nickname,
        'zh-Hans-CN',
      );
      return compared !== 0 ? compared : left.counterpart.id.localeCompare(right.counterpart.id);
    });
  }
}
