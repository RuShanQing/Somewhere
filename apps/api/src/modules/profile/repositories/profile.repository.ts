import { Injectable } from '@nestjs/common';
import {
  Prisma,
  type City,
  type Profile,
  type ReceptionMode,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

export type ProfileWithCity = Profile & { city: City | null };

export interface ProfileChanges {
  cityId?: string | null;
  receptionMode?: ReceptionMode;
}

@Injectable()
export class ProfileRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByUserId(userId: string): Promise<ProfileWithCity | null> {
    return this.prisma.profile.findUnique({
      where: { userId },
      include: { city: true },
    });
  }

  async findManyByUserIds(userIds: string[]): Promise<ProfileWithCity[]> {
    if (userIds.length === 0) {
      return [];
    }
    return this.prisma.profile.findMany({
      where: { userId: { in: userIds } },
      include: { city: true },
    });
  }

  async upsert(userId: string, changes: ProfileChanges): Promise<ProfileWithCity> {
    const update: Prisma.ProfileUpdateInput = {};
    if (changes.cityId !== undefined) {
      update.city =
        changes.cityId === null
          ? { disconnect: true }
          : { connect: { id: changes.cityId } };
    }
    if (changes.receptionMode !== undefined) {
      update.receptionMode = changes.receptionMode;
    }

    return this.prisma.profile.upsert({
      where: { userId },
      create: {
        userId,
        cityId: changes.cityId ?? null,
        ...(changes.receptionMode ? { receptionMode: changes.receptionMode } : {}),
      },
      update,
      include: { city: true },
    });
  }
}
