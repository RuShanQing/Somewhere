<script setup lang="ts">
defineProps<{
  title: string;
  description: string;
  hint?: string;
}>();
</script>

<template>
  <div class="empty-state">
    <p class="empty-title">{{ title }}</p>
    <p class="empty-description">{{ description }}</p>
    <p v-if="hint" class="empty-hint">{{ hint }}</p>
  </div>
</template>
