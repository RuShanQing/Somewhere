<script setup lang="ts">
defineProps<{
  title: string;
  subtitle: string;
}>();
</script>

<template>
  <section class="auth-panel">
    <RouterLink class="auth-brand" to="/discover">Somewhere</RouterLink>
    <p class="auth-eyebrow">慢一点，也能抵达</p>
    <h1>{{ title }}</h1>
    <p class="auth-subtitle">{{ subtitle }}</p>
    <slot />
    <p v-if="$slots.footer" class="auth-footer">
      <slot name="footer" />
    </p>
  </section>
</template>
