<script setup lang="ts">
import type { PublicStoryItem } from '../../../shared/api/client';
import { formatDateTime } from '../../../shared/format/postcard';

defineProps<{ story: PublicStoryItem }>();
</script>

<template>
  <li class="story-card">
    <div class="story-card-head">
      <div>
        <h2 class="story-card-title">
          <RouterLink :to="{ name: 'story-detail', params: { id: story.id } }">
            {{ story.title }}
          </RouterLink>
        </h2>
        <p class="story-meta">
          {{ story.city.name }} · {{ story.authorNickname }} · {{ formatDateTime(story.publishedAt) }}
        </p>
      </div>
      <span class="status-pill">已审核</span>
    </div>
    <p class="story-excerpt">{{ story.excerpt }}</p>
    <ul v-if="story.topicTags.length > 0" class="tag-list" aria-label="主题标签">
      <li v-for="tag in story.topicTags" :key="tag" class="tag">{{ tag }}</li>
    </ul>
  </li>
</template>
