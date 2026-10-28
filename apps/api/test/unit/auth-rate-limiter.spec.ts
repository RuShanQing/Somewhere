import { describe, expect, it } from 'vitest';
import { AppError } from '../../src/common/errors/app-error';
import type { AppConfig } from '../../src/config/app-config';
import { AuthRateLimiter } from '../../src/modules/auth/rate-limit/auth-rate-limiter';

function buildConfig(max: number, windowMs: number): AppConfig {
  return {
    nodeEnv: 'test',
    isProduction: false,
    port: 4301,
    databaseUrl: 'postgresql://user:pass@localhost:5432/somewhere_test',
    webOrigins: ['http://localhost:5273'],
    sessionCookieName: 'sw_session',
    sessionTtlMs: 1_000,
    secureCookies: false,
    authRateLimits: {
      registerPerIp: { max, windowMs },
      loginPerIp: { max, windowMs },
      loginPerIdentity: { max, windowMs },
    },
    postcardDemoRecipientEmails: [],
    postcardMaxSendsPerDay: 10,
    deliveryPollIntervalMs: 60_000,
  };
}

describe('认证限流', () => {
  it('窗口内达到上限后返回 RATE_LIMITED / 429', () => {
    const limiter = new AuthRateLimiter(buildConfig(2, 60_000));
    const now = 1_000_000;
    limiter.consume('login-ip', '127.0.0.1', now);
    limiter.consume('login-ip', '127.0.0.1', now + 10);

    expect(() => limiter.consume('login-ip', '127.0.0.1', now + 20)).toThrowError(AppError);
    try {
      limiter.consume('login-ip', '127.0.0.1', now + 20);
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).status).toBe(429);
      expect((error as AppError).code).toBe('RATE_LIMITED');
    }
  });

  it('不同 key 互不影响', () => {
    const limiter = new AuthRateLimiter(buildConfig(1, 60_000));
    const now = 1_000_000;
    limiter.consume('login-identity', 'ip:first', now);
    expect(() => limiter.consume('login-identity', 'ip:second', now)).not.toThrow();
  });

  it('窗口过去后重新允许请求', () => {
    const limiter = new AuthRateLimiter(buildConfig(1, 1_000));
    limiter.consume('register', '127.0.0.1', 0);
    expect(() => limiter.consume('register', '127.0.0.1', 500)).toThrowError(AppError);
    expect(() => limiter.consume('register', '127.0.0.1', 1_500)).not.toThrow();
  });
});
