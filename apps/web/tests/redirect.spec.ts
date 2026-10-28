import { describe, expect, it } from 'vitest';
import { DEFAULT_AUTHENTICATED_PATH, safeRedirectTarget } from '../src/app/redirect';

describe('登录后的回跳目标', () => {
  it('没有提供目标时回到邮局', () => {
    expect(safeRedirectTarget(undefined)).toBe(DEFAULT_AUTHENTICATED_PATH);
    expect(safeRedirectTarget(null)).toBe(DEFAULT_AUTHENTICATED_PATH);
  });

  it('接受站内绝对路径并保留查询串', () => {
    expect(safeRedirectTarget('/memories')).toBe('/memories');
    expect(safeRedirectTarget('/passages?tab=archived')).toBe('/passages?tab=archived');
  });

  it.each([
    'https://evil.example/phish',
    '//evil.example',
    '/\\evil.example',
    'javascript:alert(1)',
    '/auth/login',
    '/auth/register?redirect=/memories',
    'memories',
  ])('拒绝不安全或循环的目标 %j', (target) => {
    expect(safeRedirectTarget(target)).toBe(DEFAULT_AUTHENTICATED_PATH);
  });

  it('拒绝超长与包含控制字符的目标', () => {
    expect(safeRedirectTarget(`/${'a'.repeat(600)}`)).toBe(DEFAULT_AUTHENTICATED_PATH);
    expect(safeRedirectTarget('/memories\nLocation: https://evil.example')).toBe(DEFAULT_AUTHENTICATED_PATH);
  });
});
