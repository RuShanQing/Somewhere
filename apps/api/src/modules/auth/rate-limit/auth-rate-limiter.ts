import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig, type RateLimitRule } from '../../../config/app-config';
import { AppError } from '../../../common/errors/app-error';

const MAX_TRACKED_KEYS = 5_000;

/**
 * 进程内固定窗口限流（单实例部署足够）。
 * key 只包含 IP / 邮箱（邮箱仅用于计算桶，不写日志，也不持久化）。
 */
@Injectable()
export class AuthRateLimiter {
  private readonly buckets = new Map<string, number[]>();

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  consume(kind: 'register' | 'login-ip' | 'login-identity', key: string, now: number = Date.now()): void {
    const rule = this.ruleFor(kind);
    const bucketKey = `${kind}:${key}`;
    const existing = this.buckets.get(bucketKey) ?? [];
    const windowStart = now - rule.windowMs;
    const recent = existing.filter((timestamp) => timestamp > windowStart);

    if (recent.length >= rule.max) {
      this.buckets.set(bucketKey, recent);
      throw AppError.rateLimited();
    }

    recent.push(now);
    this.buckets.set(bucketKey, recent);
    this.evictIfNeeded();
  }

  reset(): void {
    this.buckets.clear();
  }

  private ruleFor(kind: 'register' | 'login-ip' | 'login-identity'): RateLimitRule {
    const limits = this.config.authRateLimits;
    if (kind === 'register') {
      return limits.registerPerIp;
    }
    return kind === 'login-ip' ? limits.loginPerIp : limits.loginPerIdentity;
  }

  private evictIfNeeded(): void {
    if (this.buckets.size <= MAX_TRACKED_KEYS) {
      return;
    }
    const oldestKey = this.buckets.keys().next().value;
    if (typeof oldestKey === 'string') {
      this.buckets.delete(oldestKey);
    }
  }
}
