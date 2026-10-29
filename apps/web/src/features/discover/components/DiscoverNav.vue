<script setup lang="ts">
defineProps<{ active: 'stories' | 'map' }>();
</script>

<template>
  <nav class="discover-nav" aria-label="发现分栏">
    <RouterLink
      class="discover-nav-link"
      :class="{ 'is-active': active === 'stories' }"
      :aria-current="active === 'stories' ? 'page' : undefined"
      :to="{ name: 'discover' }"
    >
      城市故事站
    </RouterLink>
    <RouterLink
      class="discover-nav-link"
      :class="{ 'is-active': active === 'map' }"
      :aria-current="active === 'map' ? 'page' : undefined"
      :to="{ name: 'map' }"
    >
      世界记忆地图
    </RouterLink>
  </nav>
</template>
