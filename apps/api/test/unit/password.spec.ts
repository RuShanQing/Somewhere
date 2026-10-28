import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../../src/modules/auth/domain/password-hashing';

describe('密码哈希', () => {
  it('使用 Argon2id 且不可逆', async () => {
    const password = 'fictional-passphrase-001';
    const hash = await hashPassword(password);
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(hash).not.toContain(password);
  });

  it('正确密码通过校验，错误密码失败', async () => {
    const hash = await hashPassword('fictional-passphrase-002');
    await expect(verifyPassword(hash, 'fictional-passphrase-002')).resolves.toBe(true);
    await expect(verifyPassword(hash, 'fictional-passphrase-003')).resolves.toBe(false);
  });

  it('相同密码两次哈希结果不同（随机盐）', async () => {
    const [first, second] = await Promise.all([
      hashPassword('fictional-passphrase-004'),
      hashPassword('fictional-passphrase-004'),
    ]);
    expect(first).not.toBe(second);
  });

  it('损坏的哈希返回 false 而不是抛错', async () => {
    await expect(verifyPassword('not-a-valid-hash', 'anything')).resolves.toBe(false);
  });
});
