import { Injectable } from '@nestjs/common';
import type { ReceptionMode } from '@prisma/client';
import { AccountService } from '../auth/account.service';
import type { CitySummary } from './profile.types';
import { ProfileRepository, type ProfileWithCity } from './repositories/profile.repository';

/** 投递需要的最小资料：昵称、城市与接信状态；绝不包含邮箱。 */
export interface MailProfile {
  userId: string;
  nickname: string;
  cityId: string | null;
  city: CitySummary | null;
  receptionMode: ReceptionMode;
}

/**
 * ProfileModule 对其他模块公开的只读入口。
 * PostcardModule 通过它判断收件人是否可接信以及双方城市，不直接访问 profiles/users 表。
 */
@Injectable()
export class ProfileReader {
  constructor(
    private readonly profiles: ProfileRepository,
    private readonly accounts: AccountService,
  ) {}

  async findMailProfile(userId: string): Promise<MailProfile | null> {
    const profiles = await this.findMailProfiles([userId]);
    return profiles[0] ?? null;
  }

  async findMailProfiles(userIds: string[]): Promise<MailProfile[]> {
    const uniqueIds = Array.from(new Set(userIds));
    if (uniqueIds.length === 0) {
      return [];
    }

    const [accounts, profiles] = await Promise.all([
      this.accounts.findPublicByIds(uniqueIds),
      this.profiles.findManyByUserIds(uniqueIds),
    ]);
    const accountById = new Map(accounts.map((account) => [account.id, account]));
    const profileByUserId = new Map(profiles.map((profile) => [profile.userId, profile]));

    return uniqueIds.flatMap((userId) => {
      const account = accountById.get(userId);
      if (!account) {
        return [];
      }
      return [this.toMailProfile(userId, account.nickname, profileByUserId.get(userId) ?? null)];
    });
  }

  async findMailProfilesByEmails(emails: string[]): Promise<MailProfile[]> {
    const uniqueEmails = Array.from(new Set(emails.filter((email) => email.length > 0)));
    if (uniqueEmails.length === 0) {
      return [];
    }
    const accounts = await this.accounts.findPublicByEmails(uniqueEmails);
    return this.findMailProfiles(accounts.map((account) => account.id));
  }

  private toMailProfile(
    userId: string,
    nickname: string,
    profile: ProfileWithCity | null,
  ): MailProfile {
    return {
      userId,
      nickname,
      cityId: profile?.cityId ?? null,
      city: profile?.city
        ? {
            id: profile.city.id,
            name: profile.city.name,
            countryCode: profile.city.countryCode,
          }
        : null,
      receptionMode: profile?.receptionMode ?? 'OPEN',
    };
  }
}
