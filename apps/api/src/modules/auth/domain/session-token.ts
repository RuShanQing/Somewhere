import { createHash, randomBytes } from 'node:crypto';

export const SESSION_TOKEN_BYTES = 32;
const SESSION_TOKEN_SHAPE = /^[A-Za-z0-9_-]{43,128}$/;

/** 256 位随机 Token；只通过 HttpOnly Cookie 返回给浏览器。 */
export function createSessionToken(): string {
  return randomBytes(SESSION_TOKEN_BYTES).toString('base64url');
}

/** 数据库只保存 Token 的 SHA-256 哈希，泄露数据库不能直接复用会话。 */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function isPlausibleSessionToken(token: string): boolean {
  return SESSION_TOKEN_SHAPE.test(token);
}
