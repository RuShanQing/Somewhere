import { describe, expect, it } from 'vitest';
import {
  isValidEmail,
  isValidNickname,
  isValidPassword,
  normalizeEmail,
  normalizeNickname,
} from '../../src/modules/auth/domain/identity';

describe('邮箱正规化与校验', () => {
  it('裁剪首尾空白并转为小写', () => {
    expect(normalizeEmail('  Traveler@Example.TEST ')).toBe('traveler@example.test');
  });

  it('接受常规邮箱', () => {
    expect(isValidEmail('traveler@example.test')).toBe(true);
  });

  it.each(['', '   ', 'not-an-email', 'a@b', 'a@@b.test', 'a b@example.test'])(
    '拒绝无效邮箱 %j',
    (input) => {
      expect(isValidEmail(input)).toBe(false);
    },
  );

  it('拒绝超过 254 字符的邮箱', () => {
    const localPart = 'a'.repeat(250);
    expect(isValidEmail(`${localPart}@example.test`)).toBe(false);
  });
});

describe('密码策略', () => {
  it('恰好 12 个字符可用', () => {
    expect(isValidPassword('a'.repeat(12))).toBe(true);
  });

  it('少于 12 个字符被拒绝', () => {
    expect(isValidPassword('a'.repeat(11))).toBe(false);
  });

  it('允许较长口令（256 字符）', () => {
    expect(isValidPassword('a'.repeat(256))).toBe(true);
  });

  it('超过 256 字符被拒绝', () => {
    expect(isValidPassword('a'.repeat(257))).toBe(false);
  });

  it('全空白不算有效密码', () => {
    expect(isValidPassword(' '.repeat(12))).toBe(false);
  });
});

describe('昵称策略', () => {
  it('裁剪首尾空白并折叠内部空白', () => {
    expect(normalizeNickname('  海边   写信的人  ')).toBe('海边 写信的人');
  });

  it('拒绝空昵称与纯空白昵称', () => {
    expect(isValidNickname('')).toBe(false);
    expect(isValidNickname('    ')).toBe(false);
  });

  it('接受 32 个字符并拒绝 33 个字符', () => {
    expect(isValidNickname('字'.repeat(32))).toBe(true);
    expect(isValidNickname('字'.repeat(33))).toBe(false);
  });

  it('拒绝控制字符', () => {
    expect(isValidNickname('坏\u0000名字')).toBe(false);
  });
});
