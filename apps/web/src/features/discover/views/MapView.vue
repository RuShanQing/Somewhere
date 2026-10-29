<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api, type CityMemoryItem } from '../../../shared/api/client';
import EmptyState from '../../../shared/ui/EmptyState.vue';
import PageHeader from '../../../shared/ui/PageHeader.vue';
import SectionCard from '../../../shared/ui/SectionCard.vue';
import { toFriendlyStoryMessage } from '../../../shared/story/messages';
import DiscoverNav from '../components/DiscoverNav.vue';

const items = ref<CityMemoryItem[]>([]);
const topic = ref('');
const appliedTopic = ref('');
const isLoading = ref(true);
const loadError = ref<string | null>(null);

let requestToken = 0;

async function loadCityMemories(): Promise<void> {
  const token = ++requestToken;
  isLoading.value = true;
  loadError.value = null;
  try {
    const result = await api.cityMemories(
      appliedTopic.value ? { topic: appliedTopic.value } : {},
    );
    if (token !== requestToken) {
      return;
    }
    items.value = result.items;
  } catch (error) {
    if (token !== requestToken) {
      return;
    }
    items.value = [];
    loadError.value = toFriendlyStoryMessage(error);
  } finally {
    if (token === requestToken) {
      isLoading.value = false;
    }
  }
}

function applyFilter(): void {
  appliedTopic.value = topic.value.trim();
  void loadCityMemories();
}

onMounted(loadCityMemories);
</script>

<template>
  <div class="page">
    <PageHeader
      eyebrow="发现"
      title="世界记忆地图"
      description="按城市读取作者主动公开、管理员审核通过的生活片段。这里只显示城市级信息，不显示实时位置、住址或邮件轨迹。"
    />

    <DiscoverNav active="map" />

    <form class="filter-row" @submit.prevent="applyFilter">
      <div class="form-field">
        <label for="map-topic-filter">主题</label>
        <input
          id="map-topic-filter"
          v-model="topic"
          type="search"
          placeholder="例如：雨天、书店"
        />
      </div>
      <button class="button button-quiet" type="submit">筛选</button>
    </form>

    <p v-if="isLoading" class="form-status" role="status">正在整理地图上的城市…</p>

    <div v-else-if="loadError" class="section-card">
      <p class="form-alert" role="alert">{{ loadError }}</p>
      <button class="button button-quiet" type="button" @click="loadCityMemories">
        重新读取
      </button>
    </div>

    <SectionCard
      v-else
      title="有故事亮起的城市"
      :badge="String(items.length)"
      description="按最近一次公开时间排列，不按故事数量或热度排序。"
    >
      <ul v-if="items.length > 0" class="city-memory-grid">
        <li v-for="item in items" :key="item.city.id" class="city-memory-card">
          <RouterLink
            class="city-memory-link"
            :to="{ name: 'map-city', params: { cityId: item.city.id } }"
          >
            <span class="city-memory-name">{{ item.city.name }}</span>
            <span class="city-memory-meta">
              {{ item.city.countryCode }} · {{ item.publicStoryCount }} 篇可读故事
            </span>
          </RouterLink>
        </li>
      </ul>

      <EmptyState
        v-else
        title="地图上还没有亮起的城市"
        description="这里只显示有已审核公开故事的城市；不会用示例内容或未授权故事填充。"
        hint="你可以先去城市故事站，写下自己的第一段故事。"
      />

      <p class="field-hint">
        地图与城市故事站读取同一批故事；作者撤回或管理员下架后，两边会同时消失。
      </p>
    </SectionCard>
  </div>
</template>
