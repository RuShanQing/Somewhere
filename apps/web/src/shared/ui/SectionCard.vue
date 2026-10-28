<script setup lang="ts">
defineProps<{
  title: string;
  badge?: string;
  description?: string;
}>();
</script>

<template>
  <section class="section-card">
    <header class="section-heading">
      <h2>{{ title }}</h2>
      <span v-if="badge" class="badge">{{ badge }}</span>
    </header>
    <p v-if="description" class="section-description">{{ description }}</p>
    <slot />
  </section>
</template>
