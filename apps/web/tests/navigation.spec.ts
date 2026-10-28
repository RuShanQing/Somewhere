import { describe, expect, it } from 'vitest';
import { NAV_ITEMS, isActiveNavItem } from '../src/app/navigation';

describe('四个主导航', () => {
  it('顺序与路由固定为邮局、发现、共途、纪念册', () => {
    expect(NAV_ITEMS.map((item) => item.label)).toEqual(['邮局', '发现', '共途', '纪念册']);
    expect(NAV_ITEMS.map((item) => item.to)).toEqual(['/post-office', '/discover', '/passages', '/memories']);
  });

  it('除发现外都要求登录', () => {
    expect(NAV_ITEMS.filter((item) => !item.requiresAuth).map((item) => item.key)).toEqual(['discover']);
  });

  it('当前路由包含子路径时仍标记为选中', () => {
    const postOffice = NAV_ITEMS[0]!;
    expect(isActiveNavItem(postOffice, '/post-office')).toBe(true);
    expect(isActiveNavItem(postOffice, '/post-office/transit')).toBe(true);
    expect(isActiveNavItem(postOffice, '/discover')).toBe(false);
    expect(isActiveNavItem(postOffice, '/post-office-archive')).toBe(false);
  });
});
