import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { hashPassword, verifyPassword } from './domain/password-hashing';

@Injectable()
export class PasswordService {
  private dummyHash: Promise<string> | null = null;

  async hash(plainPassword: string): Promise<string> {
    return hashPassword(plainPassword);
  }

  async verify(passwordHash: string, plainPassword: string): Promise<boolean> {
    return verifyPassword(passwordHash, plainPassword);
  }

  /**
   * 账号不存在时也执行一次等价开销的校验，避免通过响应时间判断邮箱是否已注册。
   */
  async verifyAgainstDummy(plainPassword: string): Promise<void> {
    this.dummyHash ??= hashPassword(randomBytes(24).toString('hex'));
    const hash = await this.dummyHash;
    await verifyPassword(hash, plainPassword);
  }
}
