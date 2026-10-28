<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, ApiError, type PostcardDetail } from '../../../shared/api/client';
import { toFriendlyAuthMessage } from '../../../shared/api/error-message';
import { formatDateTime, postcardStatusLabel } from '../../../shared/format/postcard';
import PageHeader from '../../../shared/ui/PageHeader.vue';

const route = useRoute();
const router = useRouter();
const detail = ref<PostcardDetail | null>(null);
const isLoading = ref(true);
const notFound = ref(false);
const loadError = ref<string | null>(null);

const postcardId = computed(() =>
  typeof route.params.id === 'string' ? route.params.id : '',
);
const title = computed(() =>
  detail.value
    ? `寄往 ${detail.value.destinationCity.name} 的信`
    : '一封明信片',
);
const statusLabel = computed(() =>
  detail.value ? postcardStatusLabel(detail.value.status) : '',
);
const isDelivered = computed(() => detail.value?.status === 'DELIVERED');

async function loadPostcard(): Promise<void> {
  isLoading.value = true;
  notFound.value = false;
  loadError.value = null;
  try {
    detail.value = await api.postcardDetail(postcardId.value);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      await router.replace({
        name: 'login',
        query: { redirect: `/postcards/${postcardId.value}` },
      });
      return;
    }
    if (error instanceof ApiError && error.status === 404) {
      notFound.value = true;
      return;
    }
    loadError.value = toFriendlyAuthMessage(error);
  } finally {
    isLoading.value = false;
  }
}

onMounted(loadPostcard);
</script>

<template>
  <div class="page page-narrow">
    <PageHeader
      eyebrow="邮局 · 明信片"
      :title="title"
      description="信是慢慢抵达的。这里不会显示谁已经读过，也不催你立刻回复。"
    />

    <p v-if="isLoading" class="form-status" role="status">正在取出这封信…</p>

    <div v-else-if="notFound" class="section-card">
      <p class="empty-title">这封信还没有抵达，或不属于你。</p>
      <p class="empty-description">
        在服务端确认送达之前，收件人无法通过任何入口读到正文。
      </p>
      <div class="form-actions detail-actions">
        <RouterLink class="button button-quiet" :to="{ name: 'post-office' }">返回邮局</RouterLink>
      </div>
    </div>

    <div v-else-if="loadError" class="section-card">
      <p class="form-alert" role="alert">{{ loadError }}</p>
      <button class="button button-quiet" type="button" @click="loadPostcard">重新读取</button>
    </div>

    <article v-else-if="detail" class="section-card letter-card">
      <div class="letter-meta">
        <span class="status-pill">{{ statusLabel }}</span>
        <span class="letter-route">
          {{ detail.sender.nickname }} · {{ detail.originCity.name }}
          <span aria-hidden="true">→</span>
          {{ detail.receiver.nickname }} · {{ detail.destinationCity.name }}
        </span>
      </div>

      <p v-if="detail.body !== null" class="letter-body">{{ detail.body }}</p>
      <div v-else class="empty-state">
        <p class="empty-title">这封信目前只显示受限提示。</p>
        <p class="empty-description">安全处置中的内容不会返回正文或举报细节。</p>
      </div>

      <dl class="letter-times">
        <div>
          <dt>寄出</dt>
          <dd>{{ formatDateTime(detail.sentAt) }}</dd>
        </div>
        <div>
          <dt>{{ isDelivered ? '抵达' : '预计抵达' }}</dt>
          <dd>{{ formatDateTime(isDelivered ? detail.deliveredAt : detail.deliverAt) }}</dd>
        </div>
      </dl>

      <p v-if="isDelivered && detail.body !== null" class="field-hint letter-afterword">
        读完后不必急着回复。回信会在共途阶段开放。
      </p>

      <div class="form-actions detail-actions">
        <RouterLink class="button button-quiet" :to="{ name: 'post-office' }">返回邮局</RouterLink>
      </div>
    </article>
  </div>
</template>
