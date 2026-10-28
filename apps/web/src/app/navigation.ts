export type NavKey = 'post-office' | 'discover' | 'passages' | 'memories';

export interface NavItem {
  key: NavKey;
  label: string;
  to: string;
  description: string;
  requiresAuth: boolean;
}

/** 四个固定主导航，顺序与产品语义保持一致。 */
export const NAV_ITEMS: readonly NavItem[] = [
  {
    key: 'post-office',
    label: '邮局',
    to: '/post-office',
    description: '新来信、正在路上、继续写信',
    requiresAuth: true,
  },
  {
    key: 'discover',
    label: '发现',
    to: '/discover',
    description: '城市故事、善意接力、世界记忆地图',
    requiresAuth: false,
  },
  {
    key: 'passages',
    label: '共途',
    to: '/passages',
    description: '一起走过的路，可以续程或停泊',
    requiresAuth: true,
  },
  {
    key: 'memories',
    label: '纪念册',
    to: '/memories',
    description: '双城日记、共同手帐、个人记忆',
    requiresAuth: true,
  },
] as const;

export function isActiveNavItem(item: NavItem, currentPath: string): boolean {
  return currentPath === item.to || currentPath.startsWith(`${item.to}/`);
}
