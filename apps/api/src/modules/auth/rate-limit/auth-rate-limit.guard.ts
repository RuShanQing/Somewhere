import { createHash } from 'node:crypto';
import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { normalizeEmail } from '../domain/identity';
import { AuthRateLimiter } from './auth-rate-limiter';
import { AUTH_RATE_LIMIT_KEY, type AuthRateLimitKind } from './rate-limit.decorator';

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly limiter: AuthRateLimiter,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const kind = this.reflector.getAllAndOverride<AuthRateLimitKind | undefined>(AUTH_RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!kind) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const ip = request.ip ?? request.socket.remoteAddress ?? 'unknown';

    if (kind === 'register') {
      this.limiter.consume('register', ip);
      return true;
    }

    this.limiter.consume('login-ip', ip);
    const rawEmail = (request.body as { email?: unknown } | undefined)?.email;
    const identity = typeof rawEmail === 'string' ? normalizeEmail(rawEmail) : 'anonymous';
    // 只保留邮箱的哈希用于计数，避免在内存中无界保存明文个人标识
    const identityKey = createHash('sha256').update(`${ip}:${identity}`, 'utf8').digest('hex');
    this.limiter.consume('login-identity', identityKey);
    return true;
  }
}
