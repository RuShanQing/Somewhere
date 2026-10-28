import { SetMetadata } from '@nestjs/common';

export type AuthRateLimitKind = 'register' | 'login';

export const AUTH_RATE_LIMIT_KEY = 'auth_rate_limit_kind';

export const AuthRateLimited = (kind: AuthRateLimitKind): MethodDecorator =>
  SetMetadata(AUTH_RATE_LIMIT_KEY, kind);
