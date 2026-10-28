import { describe, expect, it } from 'vitest';
import {
  createSessionToken,
  hashSessionToken,
  isPlausibleSessionToken,
  SESSION_TOKEN_BYTES,
} from '../../src/modules/auth/domain/session-token';

describe('会话 Token', () => {
  it('生成 256 位随机 Token 的 base64url 形式', () => {
    const token = createSessionToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token).toHaveLength(43);
    expect(SESSION_TOKEN_BYTES).toBe(32);
  });

  it('多次生成互不相同', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => createSessionToken()));
    expect(tokens.size).toBe(200);
  });

  it('数据库哈希是 64 位十六进制且不等于明文 Token', () => {
    const token = createSessionToken();
    const hash = hashSessionToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toBe(token);
    expect(hashSessionToken(token)).toBe(hash);
  });

  it('拒绝明显伪造的 Token 形状', () => {
    expect(isPlausibleSessionToken('short')).toBe(false);
    expect(isPlausibleSessionToken('a'.repeat(43))).toBe(true);
    expect(isPlausibleSessionToken(`${'a'.repeat(20)} ${'b'.repeat(20)}`)).toBe(false);
  });
});
