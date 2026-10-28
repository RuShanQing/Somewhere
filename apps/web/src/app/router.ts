import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '../shared/stores/auth';
import { NAV_ITEMS } from './navigation';
import { safeRedirectTarget } from './redirect';

declare module 'vue-router' {
  interface RouteMeta {
    title?: string;
    requiresAuth?: boolean;
    guestOnly?: boolean;
    mainNav?: boolean;
    shell?: boolean;
  }
}

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/post-office' },
  {
    path: '/post-office',
    name: 'post-office',
    component: () => import('../features/post-office/views/PostOfficeView.vue'),
    meta: { title: '邮局', requiresAuth: true, mainNav: true },
  },
  {
    path: '/post-office/compose/:id?',
    name: 'compose',
    component: () => import('../features/post-office/views/ComposeView.vue'),
    meta: { title: '写一张明信片', requiresAuth: true, mainNav: true },
  },
  {
    path: '/postcards/:id',
    name: 'postcard-detail',
    component: () => import('../features/post-office/views/PostcardDetailView.vue'),
    meta: { title: '明信片', requiresAuth: true, shell: true },
  },
  {
    path: '/discover',
    name: 'discover',
    component: () => import('../features/discover/views/DiscoverView.vue'),
    meta: { title: '发现', mainNav: true },
  },
  {
    path: '/passages',
    name: 'passages',
    component: () => import('../features/passages/views/PassagesView.vue'),
    meta: { title: '共途', requiresAuth: true, mainNav: true },
  },
  {
    path: '/memories',
    name: 'memories',
    component: () => import('../features/memories/views/MemoriesView.vue'),
    meta: { title: '纪念册', requiresAuth: true, mainNav: true },
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('../features/settings/views/SettingsView.vue'),
    meta: { title: '设置', requiresAuth: true, shell: true },
  },
  {
    path: '/auth/login',
    name: 'login',
    component: () => import('../features/auth/views/LoginView.vue'),
    meta: { title: '登录', guestOnly: true },
  },
  {
    path: '/auth/register',
    name: 'register',
    component: () => import('../features/auth/views/RegisterView.vue'),
    meta: { title: '注册', guestOnly: true },
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('../shared/views/NotFoundView.vue'),
    meta: { title: '页面不存在' },
  },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  await auth.ensureLoaded();

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return {
      name: 'login',
      query: to.fullPath === '/' ? {} : { redirect: to.fullPath },
    };
  }

  if (to.meta.guestOnly && auth.isAuthenticated) {
    return safeRedirectTarget(typeof to.query.redirect === 'string' ? to.query.redirect : null);
  }

  return true;
});

router.afterEach((to) => {
  const navTitle = NAV_ITEMS.find((item) => to.path.startsWith(item.to))?.label;
  const title = to.meta.title ?? navTitle;
  document.title = title ? `${title} · Somewhere` : 'Somewhere · 慢一点，也能抵达';
});
