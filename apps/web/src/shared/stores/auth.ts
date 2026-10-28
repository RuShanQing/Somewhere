import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { api, ApiError, type AuthSessionUser, type LoginInput, type RegisterInput } from '../api/client';

export type SessionStatus = 'unknown' | 'loading' | 'authenticated' | 'anonymous';

/**
 * 会话状态只在内存中保存；会话令牌由 HttpOnly Cookie 持有，
 * 本 store 与浏览器存储都不接触 Token。
 */
export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthSessionUser | null>(null);
  const status = ref<SessionStatus>('unknown');
  const sessionError = ref<string | null>(null);

  const isAuthenticated = computed(() => user.value !== null);

  async function loadSession(): Promise<void> {
    status.value = 'loading';
    sessionError.value = null;
    try {
      user.value = await api.me();
      status.value = 'authenticated';
    } catch (error) {
      user.value = null;
      status.value = 'anonymous';
      if (!(error instanceof ApiError && error.status === 401)) {
        sessionError.value = '无法确认当前登录状态，请稍后重试。';
      }
    }
  }

  async function ensureLoaded(): Promise<void> {
    if (status.value === 'unknown') {
      await loadSession();
    }
  }

  async function login(input: LoginInput): Promise<void> {
    user.value = await api.login(input);
    status.value = 'authenticated';
    sessionError.value = null;
  }

  async function register(input: RegisterInput): Promise<void> {
    user.value = await api.register(input);
    status.value = 'authenticated';
    sessionError.value = null;
  }

  async function logout(): Promise<void> {
    await api.logout();
    user.value = null;
    status.value = 'anonymous';
    sessionError.value = null;
  }

  /** 设置页保存昵称后同步 Header；email 只能通过 /auth/me 获取。 */
  function setNickname(nickname: string): void {
    if (user.value) {
      user.value = { ...user.value, nickname };
    }
  }

  return {
    user,
    status,
    sessionError,
    isAuthenticated,
    loadSession,
    ensureLoaded,
    login,
    register,
    logout,
    setNickname,
  };
});
