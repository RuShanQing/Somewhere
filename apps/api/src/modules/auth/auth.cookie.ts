import type { CookieOptions, Response } from 'express';
import type { AppConfig } from '../../config/app-config';
import type { IssuedSession } from './auth.types';

/** 会话 Cookie 只允许 HttpOnly + SameSite=Lax；生产必须走 HTTPS（Secure）。 */
export function sessionCookieOptions(config: AppConfig, expiresAt: Date): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.secureCookies,
    path: '/',
    expires: expiresAt,
  };
}

export function setSessionCookie(response: Response, config: AppConfig, session: IssuedSession): void {
  response.cookie(config.sessionCookieName, session.token, sessionCookieOptions(config, session.expiresAt));
}

export function clearSessionCookie(response: Response, config: AppConfig): void {
  response.clearCookie(config.sessionCookieName, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.secureCookies,
    path: '/',
  });
}
