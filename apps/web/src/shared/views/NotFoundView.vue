<script setup lang="ts">
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
</script>

<template>
  <section class="auth-panel">
    <p class="auth-eyebrow">Somewhere</p>
    <h1>这里没有信箱</h1>
    <p class="auth-subtitle">你访问的页面不存在，或者已经被收回。</p>
    <p class="auth-actions">
      <RouterLink class="button" :to="auth.isAuthenticated ? '/post-office' : '/discover'">
        {{ auth.isAuthenticated ? '回到邮局' : '去发现看看' }}
      </RouterLink>
    </p>
  </section>
</template>
