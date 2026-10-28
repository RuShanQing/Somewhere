import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import { toAuthenticatedUser, type IssuedSession, type ResolvedSession } from './auth.types';
import { createSessionToken, hashSessionToken, isPlausibleSessionToken } from './domain/session-token';
import { SessionRepository } from './repositories/session.repository';

@Injectable()
export class SessionService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly sessions: SessionRepository,
  ) {}

  async issue(userId: string, now: Date = new Date()): Promise<IssuedSession> {
    const token = createSessionToken();
    const expiresAt = new Date(now.getTime() + this.config.sessionTtlMs);
    const session = await this.sessions.create({
      userId,
      sessionHash: hashSessionToken(token),
      expiresAt,
    });
    return { token, expiresAt, sessionId: session.id };
  }

  /**
   * 单活动会话：登录成功后创建新会话，并撤销该用户其他活动会话。
   * 并发登录的竞态未做数据库级串行化，单实例演示场景可接受。
   */
  async rotateForUser(userId: string, now: Date = new Date()): Promise<IssuedSession> {
    const issued = await this.issue(userId, now);
    await this.sessions.revokeOthers(userId, issued.sessionId, now);
    return issued;
  }

  async resolve(token: string, now: Date = new Date()): Promise<ResolvedSession | null> {
    if (!isPlausibleSessionToken(token)) {
      return null;
    }
    const record = await this.sessions.findByHash(hashSessionToken(token));
    if (!record || record.revokedAt !== null || record.expiresAt.getTime() <= now.getTime()) {
      return null;
    }
    return { sessionId: record.id, user: toAuthenticatedUser(record.user) };
  }

  async revoke(sessionId: string): Promise<void> {
    await this.sessions.revoke(sessionId, new Date());
  }
}
