import { Injectable } from '@nestjs/common';
import type { ReceptionMode } from '@prisma/client';
import { AccountService } from '../auth/account.service';
import { AppError } from '../../common/errors/app-error';
import type { AuthenticatedUser } from '../../common/http/request.types';
import {
  isValidNickname,
  normalizeNickname,
} from '../../common/identity/nickname';
import { CityService } from './city.service';
import { isReceptionMode } from './domain/reception';
import type { ProfileView } from './profile.types';
import { ProfileRepository, type ProfileWithCity } from './repositories/profile.repository';

export interface UpdateProfileInput {
  nickname?: string;
  cityId?: string | null;
  receptionMode?: ReceptionMode;
}

@Injectable()
export class ProfileService {
  constructor(
    private readonly profiles: ProfileRepository,
    private readonly cities: CityService,
    private readonly accounts: AccountService,
  ) {}

  async getForUser(user: AuthenticatedUser): Promise<ProfileView> {
    const profile = await this.profiles.findByUserId(user.id);
    return this.toView(user.id, user.nickname, profile);
  }

  async updateForUser(
    user: AuthenticatedUser,
    input: UpdateProfileInput,
  ): Promise<ProfileView> {
    const hasNickname = input.nickname !== undefined;
    const hasCity = input.cityId !== undefined;
    const hasReceptionMode = input.receptionMode !== undefined;

    if (!hasNickname && !hasCity && !hasReceptionMode) {
      throw AppError.validation(['body:empty']);
    }

    let nickname = user.nickname;
    if (hasNickname) {
      nickname = normalizeNickname(input.nickname ?? '');
      if (!isValidNickname(nickname)) {
        throw AppError.validation(['nickname:length']);
      }
    }

    if (hasReceptionMode && !isReceptionMode(input.receptionMode)) {
      throw AppError.validation(['receptionMode:invalid']);
    }

    // 先验证城市，避免昵称已更新但城市非法的半成功状态
    if (hasCity && input.cityId !== null) {
      const city = await this.cities.findById(input.cityId as string);
      if (!city) {
        throw AppError.validation(['cityId:notFound']);
      }
    }

    if (hasNickname) {
      await this.accounts.updateNickname(user.id, nickname);
    }

    const profile =
      hasCity || hasReceptionMode
        ? await this.profiles.upsert(user.id, {
            cityId: input.cityId,
            receptionMode: input.receptionMode,
          })
        : await this.profiles.findByUserId(user.id);

    return this.toView(user.id, nickname, profile);
  }

  private toView(
    userId: string,
    nickname: string,
    profile: ProfileWithCity | null,
  ): ProfileView {
    return {
      userId,
      nickname,
      city: profile?.city ? { id: profile.city.id, name: profile.city.name, countryCode: profile.city.countryCode } : null,
      receptionMode: profile?.receptionMode ?? 'OPEN',
    };
  }
}
