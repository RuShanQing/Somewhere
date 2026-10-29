import type { User, UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/http/request.types';

export interface RegisterInput {
  email: string;
  password: string;
  nickname: string;
  adultConfirmed: boolean;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface IssuedSession {
  token: string;
  expiresAt: Date;
  sessionId: string;
}

/** 注册/登录响应只包含会话用户字段，不包含 email。 */
export interface AuthSessionUser {
  id: string;
  nickname: string;
  emailVerified: boolean;
  cityId: string | null;
  role: UserRole;
}

export interface ResolvedSession {
  sessionId: string;
  user: AuthenticatedUser;
}

export function toSessionUser(user: User): AuthSessionUser {
  return {
    id: user.id,
    nickname: user.nickname,
    emailVerified: user.emailVerifiedAt !== null,
    cityId: null,
    role: user.role,
  };
}

export function toAuthenticatedUser(user: User): AuthenticatedUser {
  return {
    id: user.id,
    nickname: user.nickname,
    email: user.emailNormalized,
    emailVerified: user.emailVerifiedAt !== null,
    cityId: null,
    role: user.role,
  };
}
