import { describe, expect, it } from 'vitest';
import type { AppConfig } from '../../src/config/app-config';
import { sessionCookieOptions } from '../../src/modules/auth/auth.cookie';

function buildConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    nodeEnv: 'development',
    isProduction: false,
    port: 4301,
    databaseUrl: 'postgresql://user:pass@localhost:5432/somewhere_test',
    webOrigins: ['http://localhost:5273'],
    sessionCookieName: 'sw_session',
    sessionTtlMs: 1_000,
    secureCookies: false,
    authRateLimits: {
      registerPerIp: { max: 1, windowMs: 1_000 },
      loginPerIp: { max: 1, windowMs: 1_000 },
      loginPerIdentity: { max: 1, windowMs: 1_000 },
    },
    postcardDemoRecipientEmails: [],
    postcardMaxSendsPerDay: 10,
    deliveryPollIntervalMs: 60_000,
    storyMaxActivePerCity: 50,
    storyMaxSubmissionsPerWindow: 3,
    storySubmissionWindowDays: 7,
    ...overrides,
  };
}

describe('会话 Cookie 选项', () => {
  const expiresAt = new Date('2026-11-01T00:00:00.000Z');

  it('开发环境：HttpOnly + SameSite=Lax，非 Secure', () => {
    const options = sessionCookieOptions(buildConfig(), expiresAt);
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe('lax');
    expect(options.secure).toBe(false);
    expect(options.path).toBe('/');
    expect(options.expires).toEqual(expiresAt);
  });

  it('生产环境必须 Secure', () => {
    const options = sessionCookieOptions(
      buildConfig({ nodeEnv: 'production', isProduction: true, secureCookies: true }),
      expiresAt,
    );
    expect(options.secure).toBe(true);
  });

  it('不把会话值放到 Cookie 以外的可用字段（不设置 domain）', () => {
    const options = sessionCookieOptions(buildConfig(), expiresAt);
    expect(options.domain).toBeUndefined();
  });
});
