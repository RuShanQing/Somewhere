import { Injectable } from '@nestjs/common';
import { UserRepository, type PublicUserRecord } from './repositories/user.repository';

/**
 * 账号级读写的公开入口：其他模块通过它读取公开昵称或修改昵称，
 * 不直接访问 users 表，也不接触邮箱与密码哈希。
 */
@Injectable()
export class AccountService {
  constructor(private readonly users: UserRepository) {}

  async updateNickname(userId: string, nickname: string): Promise<void> {
    await this.users.updateNickname(userId, nickname);
  }

  async findPublicByIds(ids: string[]): Promise<PublicUserRecord[]> {
    return this.users.findPublicByIds(ids);
  }

  async findPublicByEmails(emails: string[]): Promise<PublicUserRecord[]> {
    return this.users.findPublicByEmails(emails);
  }
}
