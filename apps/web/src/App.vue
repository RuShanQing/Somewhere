<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import AppHeader from './app/components/AppHeader.vue';

const route = useRoute();
const showShell = computed(() => route.meta.mainNav === true || route.meta.shell === true);
</script>

<template>
  <a class="skip-link" href="#main-content">跳到主要内容</a>

  <div v-if="showShell" class="app-shell">
    <AppHeader />
    <main id="main-content" class="app-main" tabindex="-1">
      <RouterView />
    </main>
    <footer class="app-footer">Somewhere · 慢一点，也能抵达</footer>
  </div>

  <div v-else class="auth-shell">
    <main id="main-content" class="auth-main" tabindex="-1">
      <RouterView />
    </main>
  </div>
</template>
