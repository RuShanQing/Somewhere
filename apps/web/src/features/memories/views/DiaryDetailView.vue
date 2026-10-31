<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, ApiError, type DiaryDetail } from '../../../shared/api/client';
import { formatDateTime } from '../../../shared/format/postcard';
import EmptyState from '../../../shared/ui/EmptyState.vue';
import PageHeader from '../../../shared/ui/PageHeader.vue';
import SectionCard from '../../../shared/ui/SectionCard.vue';
import { toFriendlyDiaryMessage } from '../messages';

const route = useRoute();
const router = useRouter();

const detail = ref<DiaryDetail | null>(null);
const isLoading = ref(true);
const loadError = ref<string | null>(null);
const notFound = ref(false);

const diaryId = computed(() =>
  typeof route.params.id === 'string' ? route.params.id : '',
);

async function load(): Promise<void> {
  isLoading.value = true;
  loadError.value = null;
  notFound.value = false;
  try {
    detail.value = await api.diary(diaryId.value);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      await router.replace({ name: 'login', query: { redirect: route.fullPath } });
      return;
    }
    if (error instanceof ApiError && error.status === 404) {
      notFound.value = true;
      return;
    }
    loadError.value = toFriendlyDiaryMessage(error);
  } finally {
    isLoading.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div class="page">
    <PageHeader
      eyebrow="纪念册 · 双城日记"
      :title="detail?.topic ?? '双城日记'"
      description="只读双页：它来自双方真实寄出并且都已经抵达的两封信。"
    />

    <div class="section-stack">
      <p v-if="isLoading" class="form-status" role="status">正在打开这一页…</p>

      <div v-else-if="loadError" class="form-alert" role="alert">
        <p>{{ loadError }}</p>
        <div class="form-actions">
          <button class="button" type="button" @click="load">重新读取</button>
          <RouterLink class="button button-quiet" :to="{ name: 'memories' }">
            返回纪念册
          </RouterLink>
        </div>
      </div>

      <EmptyState
        v-else-if="notFound"
        title="这一页暂时不可访问"
        description="它可能不属于当前账号，或者其中一封信已经受限。"
        hint="不会展示任何不属于你的内容。"
      />

      <template v-else-if="detail">
        <p class="field-hint">
          形成于 {{ formatDateTime(detail.createdAt) }} · 只读，不提供公开或分享入口
        </p>

        <div class="diary-pages">
          <SectionCard :title="`${detail.left.senderNickname} · ${detail.left.city.name}`">
            <p class="field-hint">{{ formatDateTime(detail.left.sentAt) }} 寄出</p>
            <p class="diary-page-body">{{ detail.left.body }}</p>
          </SectionCard>

          <SectionCard :title="`${detail.right.senderNickname} · ${detail.right.city.name}`">
            <p class="field-hint">{{ formatDateTime(detail.right.sentAt) }} 寄出</p>
            <p class="diary-page-body">{{ detail.right.body }}</p>
          </SectionCard>
        </div>

        <div class="form-actions">
          <RouterLink class="button button-quiet" :to="{ name: 'memories' }">
            返回纪念册
          </RouterLink>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.diary-pages {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1.5rem;
}

.diary-page-body {
  margin: 0;
  line-height: 1.8;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

@media (max-width: 720px) {
  .diary-pages {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
