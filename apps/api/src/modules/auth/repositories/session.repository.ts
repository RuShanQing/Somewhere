import { Injectable } from '@nestjs/common';
import type { Session, User } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

export interface CreateSessionInput {
  userId: string;
  sessionHash: string;
  expiresAt: Date;
}

export type SessionWithUser = Session & { user: User };

@Injectable()
export class SessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateSessionInput): Promise<Session> {
    return this.prisma.session.create({ data: input });
  }

  async findByHash(sessionHash: string): Promise<SessionWithUser | null> {
    return this.prisma.session.findUnique({
      where: { sessionHash },
      include: { user: true },
    });
  }

  async revoke(sessionId: string, revokedAt: Date): Promise<number> {
    const result = await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt },
    });
    return result.count;
  }

  async revokeOthers(userId: string, keepSessionId: string, revokedAt: Date): Promise<number> {
    const result = await this.prisma.session.updateMany({
      where: { userId, id: { not: keepSessionId }, revokedAt: null },
      data: { revokedAt },
    });
    return result.count;
  }
}
