<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api, type CitySummary } from '../../../shared/api/client';
import { useAuthStore } from '../../../shared/stores/auth';
import EmptyState from '../../../shared/ui/EmptyState.vue';
import PageHeader from '../../../shared/ui/PageHeader.vue';
import SectionCard from '../../../shared/ui/SectionCard.vue';
import DiscoverNav from '../components/DiscoverNav.vue';
import StoryCard from '../components/StoryCard.vue';
import { usePublicFeed } from '../composables/usePublicFeed';

const auth = useAuthStore();
const cities = ref<CitySummary[]>([]);
const cityId = ref('');
const topic = ref('');
const appliedFilters = ref<{ cityId?: string; topic?: string }>({});

const {
  items,
  nextCursor,
  isLoading,
  isLoadingMore,
  loadError,
  load,
  loadMore,
} = usePublicFeed(() => appliedFilters.value);

async function loadCities(): Promise<void> {
  try {
    cities.value = await api.cities();
  } catch {
    cities.value = [];
  }
}

function applyFilters(): void {
  appliedFilters.value = {
    ...(cityId.value ? { cityId: cityId.value } : {}),
    ...(topic.value.trim() ? { topic: topic.value.trim() } : {}),
  };
  void load();
}

onMounted(async () => {
  await loadCities();
  await load();
});
</script>

<template>
  <div class="page">
    <PageHeader
      eyebrow="发现"
      title="看看别人生活的城市"
      description="这里只展示作者主动公开、并通过管理员审核的城市生活片段。没有热度榜，也不会催你回应。"
    />

    <DiscoverNav active="stories" />

    <div class="post-office-actions">
      <RouterLink
        class="button"
        :to="auth.isAuthenticated ? { name: 'story-write' } : { name: 'login', query: { redirect: '/discover/write' } }"
      >
        写一段城市故事
      </RouterLink>
      <RouterLink v-if="auth.isAuthenticated" class="button button-quiet" :to="{ name: 'my-stories' }">
        我的故事
      </RouterLink>
      <p class="field-hint">故事先提交审核，通过后才会出现在这里。</p>
    </div>

    <form class="filter-row" @submit.prevent="applyFilters">
      <div class="form-field">
        <label for="story-city-filter">城市</label>
        <select id="story-city-filter" v-model="cityId">
          <option value="">全部城市</option>
          <option v-for="city in cities" :key="city.id" :value="city.id">
            {{ city.name }}
          </option>
        </select>
      </div>
      <div class="form-field">
        <label for="story-topic-filter">主题</label>
        <input id="story-topic-filter" v-model="topic" type="search" placeholder="例如：雨天、书店" />
      </div>
      <button class="button button-quiet" type="submit">筛选</button>
    </form>

    <p v-if="isLoading" class="form-status" role="status">正在整理故事站…</p>

    <div v-else-if="loadError" class="section-card">
      <p class="form-alert" role="alert">{{ loadError }}</p>
      <button class="button button-quiet" type="button" @click="load">重新读取</button>
    </div>

    <SectionCard
      v-else
      title="城市故事站"
      :badge="String(items.length)"
      description="按发布时间阅读，不按点赞或浏览量排序。"
    >
      <ul v-if="items.length > 0" class="story-list">
        <StoryCard v-for="story in items" :key="story.id" :story="story" />
      </ul>

      <EmptyState
        v-else
        title="还没有符合条件的故事"
        description="这里只展示已经通过审核、作者同意公开的内容；不会用示例故事填充。"
        hint="你可以换一个城市或主题，或者写下自己的第一段故事。"
      />

      <div v-if="nextCursor" class="form-actions">
        <button class="button button-quiet" type="button" :disabled="isLoadingMore" @click="loadMore">
          {{ isLoadingMore ? '正在读取…' : '继续读下去' }}
        </button>
      </div>
    </SectionCard>

    <p class="field-hint story-footnote">
      世界记忆地图复用同一批已审核故事，只显示城市级信息，不收集实时位置或精确住址。
    </p>
  </div>
</template>
