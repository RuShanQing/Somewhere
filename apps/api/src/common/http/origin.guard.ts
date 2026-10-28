import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import { AppError } from '../errors/app-error';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * 写请求的 Origin 校验：
 * - 浏览器发起的跨站写请求一定携带 Origin，不在白名单内直接拒绝；
 * - 无 Origin 的非浏览器客户端不携带会话 Cookie 的跨站风险，仍由 SameSite=Lax + 会话校验保护。
 */
@Injectable()
export class OriginGuard implements CanActivate {
  private readonly allowedOrigins: Set<string>;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.allowedOrigins = new Set(
      config.webOrigins.map((origin) => {
        try {
          return new URL(origin).origin.toLowerCase();
        } catch {
          return origin.replace(/\/$/, '').toLowerCase();
        }
      }),
    );
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(request.method)) {
      return true;
    }

    const origin = request.header('origin');
    if (!origin) {
      return true;
    }

    let normalized: string;
    try {
      normalized = new URL(origin).origin.toLowerCase();
    } catch {
      throw AppError.originNotAllowed();
    }

    if (!this.allowedOrigins.has(normalized)) {
      throw AppError.originNotAllowed();
    }

    return true;
  }
}
