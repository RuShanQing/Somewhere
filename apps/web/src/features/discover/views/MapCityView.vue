<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { api, type CitySummary } from '../../../shared/api/client';
import EmptyState from '../../../shared/ui/EmptyState.vue';
import PageHeader from '../../../shared/ui/PageHeader.vue';
import SectionCard from '../../../shared/ui/SectionCard.vue';
import DiscoverNav from '../components/DiscoverNav.vue';
import StoryCard from '../components/StoryCard.vue';
import { usePublicFeed } from '../composables/usePublicFeed';

const route = useRoute();
const cityId = computed(() => String(route.params.cityId ?? ''));
const city = ref<CitySummary | null>(null);
const isCityLoading = ref(true);
const cityLookupFailed = ref(false);

const {
  items,
  nextCursor,
  isLoading: isFeedLoading,
  isLoadingMore,
  loadError,
  load: loadStories,
  loadMore,
} = usePublicFeed(() => ({ cityId: cityId.value }));

const heading = computed(() => city.value?.name ?? '未知的城市');
const description = computed(() =>
  city.value
    ? `${city.value.countryCode} · 只显示已审核并同意公开的城市生活片段。`
    : '这座城市不在城市目录中，或链接已经失效。',
);

async function loadCity(): Promise<void> {
  isCityLoading.value = true;
  cityLookupFailed.value = false;
  try {
    const cities = await api.cities();
    city.value = cities.find((item) => item.id === cityId.value) ?? null;
    cityLookupFailed.value = city.value === null;
  } catch {
    city.value = null;
    cityLookupFailed.value = true;
  } finally {
    isCityLoading.value = false;
  }
}

async function reload(): Promise<void> {
  await loadCity();
  await loadStories();
}

onMounted(reload);
watch(cityId, reload);
</script>

<template>
  <div class="page">
    <PageHeader eyebrow="世界记忆地图" :title="heading" :description="description" />

    <DiscoverNav active="map" />

    <p v-if="isCityLoading || isFeedLoading" class="form-status" role="status">
      正在打开这座城市的故事…
    </p>

    <div v-else-if="cityLookupFailed" class="section-card">
      <EmptyState
        title="没有找到这座城市"
        description="城市链接可能已经失效。地图只使用静态城市目录，不会根据你的位置推测城市。"
        hint="回到世界记忆地图，重新选一座城市。"
      />
      <RouterLink class="button button-quiet" :to="{ name: 'map' }">
        回到世界记忆地图
      </RouterLink>
    </div>

    <div v-else-if="loadError" class="section-card">
      <p class="form-alert" role="alert">{{ loadError }}</p>
      <button class="button button-quiet" type="button" @click="reload">重新读取</button>
    </div>

    <SectionCard
      v-else
      :title="`${heading}的故事`"
      description="与城市故事站读取同一批故事，详情使用同一个 Story ID。"
    >
      <ul v-if="items.length > 0" class="story-list">
        <StoryCard v-for="story in items" :key="story.id" :story="story" />
      </ul>

      <EmptyState
        v-else
        title="这座城市暂时没有可读的故事"
        description="只有作者主动公开、管理员审核通过并已发布的故事会出现在这里；撤回或下架后会立即消失。"
        hint="你可以换一座城市，或去城市故事站读其他内容。"
      />

      <div v-if="nextCursor" class="form-actions">
        <button
          class="button button-quiet"
          type="button"
          :disabled="isLoadingMore"
          @click="loadMore"
        >
          {{ isLoadingMore ? '正在读取…' : '继续读下去' }}
        </button>
      </div>

      <div class="post-office-actions map-city-actions">
        <RouterLink class="button button-quiet" :to="{ name: 'map' }">
          回到世界记忆地图
        </RouterLink>
        <RouterLink class="button button-quiet" :to="{ name: 'discover' }">
          去城市故事站
        </RouterLink>
      </div>
    </SectionCard>
  </div>
</template>
