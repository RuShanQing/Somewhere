import { Injectable } from '@nestjs/common';
import { Prisma, type User } from '@prisma/client';
import { AppError } from '../../../common/errors/app-error';
import { PrismaService } from '../../../prisma/prisma.service';

export interface CreateUserInput {
  emailNormalized: string;
  passwordHash: string;
  nickname: string;
  adultConfirmedAt: Date;
}

/** 跨模块可见的最小账号信息：不含邮箱、密码哈希或验证状态。 */
export interface PublicUserRecord {
  id: string;
  nickname: string;
}

@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByNormalizedEmail(emailNormalized: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { emailNormalized } });
  }

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async findPublicByIds(ids: string[]): Promise<PublicUserRecord[]> {
    if (ids.length === 0) {
      return [];
    }
    return this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, nickname: true },
    });
  }

  async findPublicByEmails(emails: string[]): Promise<PublicUserRecord[]> {
    if (emails.length === 0) {
      return [];
    }
    return this.prisma.user.findMany({
      where: { emailNormalized: { in: emails } },
      select: { id: true, nickname: true },
    });
  }

  async create(input: CreateUserInput): Promise<User> {
    try {
      return await this.prisma.user.create({ data: input });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // 唯一约束竞态：不暴露具体字段或邮箱
        throw AppError.registrationConflict();
      }
      throw error;
    }
  }

  async updateNickname(id: string, nickname: string): Promise<void> {
    await this.prisma.user.update({ where: { id }, data: { nickname } });
  }
}
