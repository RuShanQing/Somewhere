<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { api, type PublicStoryDetail } from '../../../shared/api/client';
import { formatDateTime } from '../../../shared/format/postcard';
import EmptyState from '../../../shared/ui/EmptyState.vue';
import PageHeader from '../../../shared/ui/PageHeader.vue';
import SectionCard from '../../../shared/ui/SectionCard.vue';
import { toFriendlyStoryMessage } from '../../../shared/story/messages';

const route = useRoute();
const story = ref<PublicStoryDetail | null>(null);
const isLoading = ref(true);
const loadError = ref<string | null>(null);

async function loadStory(): Promise<void> {
  isLoading.value = true;
  loadError.value = null;
  try {
    story.value = await api.storyDetail(String(route.params.id));
  } catch (error) {
    story.value = null;
    loadError.value = toFriendlyStoryMessage(error);
  } finally {
    isLoading.value = false;
  }
}

onMounted(loadStory);
</script>

<template>
  <div class="page page-narrow">
    <PageHeader
      eyebrow="城市故事"
      title="一段被同意公开的生活片段"
      description="故事经过作者授权与管理员审核；这里不会显示作者邮箱、精确位置或私人内容。"
    />

    <p v-if="isLoading" class="form-status" role="status">正在打开这段故事…</p>

    <div v-else-if="loadError" class="section-card">
      <EmptyState
        title="这段故事现在不可见"
        description="它可能尚未通过审核、已经被作者撤回，或已由管理员下架。"
        hint="你可以回到故事站，继续读其他已审核的内容。"
      />
      <p class="form-alert" role="alert">{{ loadError }}</p>
      <RouterLink class="button button-quiet" :to="{ name: 'discover' }">回到故事站</RouterLink>
    </div>

    <SectionCard v-else-if="story" :title="story.title" :description="`${story.city.name} · ${story.authorNickname}`">
      <p class="story-meta">公开于 {{ formatDateTime(story.publishedAt) }}</p>
      <p class="story-body">{{ story.body }}</p>
      <ul v-if="story.topicTags.length > 0" class="tag-list" aria-label="主题标签">
        <li v-for="tag in story.topicTags" :key="tag" class="tag">{{ tag }}</li>
      </ul>
      <p class="field-hint story-footnote">
        这个故事与未来的世界记忆地图共用同一个故事 ID；地图不会另建一份内容。
      </p>
    </SectionCard>
  </div>
</template>
