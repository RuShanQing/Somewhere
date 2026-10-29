import type { UserRole } from '@prisma/client';
import type { Request } from 'express';

export interface AuthenticatedUser {
  id: string;
  nickname: string;
  email: string;
  emailVerified: boolean;
  cityId: string | null;
  role: UserRole;
}

/** 由 requestId 中间件与 SessionGuard 逐步填充的请求上下文。 */
export interface RequestWithContext extends Request {
  requestId: string;
  user?: AuthenticatedUser;
  sessionId?: string;
}
