<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../../shared/stores/auth';
import { toFriendlyAuthMessage } from '../../shared/api/error-message';
import { NAV_ITEMS, isActiveNavItem } from '../navigation';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const isLoggingOut = ref(false);
const logoutError = ref<string | null>(null);

const userLabel = computed(() => auth.user?.nickname ?? '');

async function handleLogout(): Promise<void> {
  if (isLoggingOut.value) {
    return;
  }
  isLoggingOut.value = true;
  logoutError.value = null;
  try {
    await auth.logout();
    await router.push({ name: 'login' });
  } catch (error) {
    logoutError.value = toFriendlyAuthMessage(error);
  } finally {
    isLoggingOut.value = false;
  }
}
</script>

<template>
  <header class="app-header">
    <div class="brand">
      <RouterLink class="brand-link" to="/discover">
        <span class="brand-name">Somewhere</span>
        <span class="brand-tagline">慢一点，也能抵达</span>
      </RouterLink>
    </div>

    <nav class="main-nav" aria-label="主导航">
      <ul>
        <li v-for="item in NAV_ITEMS" :key="item.key">
          <RouterLink
            class="nav-link"
            :to="item.requiresAuth && !auth.isAuthenticated ? { name: 'login', query: { redirect: item.to } } : item.to"
            :aria-current="isActiveNavItem(item, route.path) ? 'page' : undefined"
          >
            <span class="nav-label">{{ item.label }}</span>
            <span class="nav-description">{{ item.description }}</span>
          </RouterLink>
        </li>
      </ul>
    </nav>

    <div class="header-account">
      <template v-if="auth.isAuthenticated">
        <p class="account-name">
          <span class="account-eyebrow">已登录</span>
          {{ userLabel }}
        </p>
        <div class="account-actions">
          <RouterLink
            v-if="auth.isModerator"
            class="button button-quiet"
            :to="{ name: 'moderation' }"
            :aria-current="route.name === 'moderation' ? 'page' : undefined"
          >
            审核台
          </RouterLink>
          <RouterLink
            class="button button-quiet"
            :to="{ name: 'settings' }"
            :aria-current="route.name === 'settings' ? 'page' : undefined"
          >
            设置
          </RouterLink>
          <button class="button button-quiet" type="button" :disabled="isLoggingOut" @click="handleLogout">
            {{ isLoggingOut ? '正在退出…' : '退出' }}
          </button>
        </div>
      </template>
      <template v-else>
        <RouterLink class="button button-quiet" :to="{ name: 'login' }">登录</RouterLink>
        <RouterLink class="button" :to="{ name: 'register' }">注册</RouterLink>
      </template>
    </div>

    <p v-if="logoutError" class="form-alert header-alert" role="alert">{{ logoutError }}</p>
  </header>
</template>
