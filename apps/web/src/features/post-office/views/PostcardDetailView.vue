<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  api,
  ApiError,
  type BlockedUser,
  type PostcardDetail,
} from '../../../shared/api/client';
import { toFriendlyAuthMessage } from '../../../shared/api/error-message';
import { formatDateTime, postcardStatusLabel } from '../../../shared/format/postcard';
import { useAuthStore } from '../../../shared/stores/auth';
import PageHeader from '../../../shared/ui/PageHeader.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const detail = ref<PostcardDetail | null>(null);
const isLoading = ref(true);
const notFound = ref(false);
const loadError = ref<string | null>(null);
const blockedUsers = ref<BlockedUser[]>([]);
const blockStateError = ref<string | null>(null);
const isBlockConfirming = ref(false);
const blockPending = ref(false);
const blockNotice = ref<string | null>(null);
const blockError = ref<string | null>(null);

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
const viewerId = computed(() => auth.user?.id ?? '');
const otherUser = computed(() => {
  if (!detail.value || !viewerId.value) {
    return null;
  }
  if (detail.value.sender.id === viewerId.value) {
    return detail.value.receiver;
  }
  if (detail.value.receiver.id === viewerId.value) {
    return detail.value.sender;
  }
  return null;
});
const isBlocked = computed(() =>
  Boolean(
    otherUser.value &&
      blockedUsers.value.some((item) => item.userId === otherUser.value?.id),
  ),
);

async function loadBlockState(): Promise<void> {
  blockStateError.value = null;
  try {
    const result = await api.blockedUsers();
    blockedUsers.value = result.items;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return;
    }
    blockStateError.value = toFriendlyAuthMessage(error);
  }
}

async function confirmBlock(): Promise<void> {
  if (!otherUser.value || blockPending.value) {
    return;
  }
  blockPending.value = true;
  blockError.value = null;
  blockNotice.value = null;
  try {
    await api.blockUser({ userId: otherUser.value.id });
    await loadBlockState();
    isBlockConfirming.value = false;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      await router.replace({
        name: 'login',
        query: { redirect: `/postcards/${postcardId.value}` },
      });
      return;
    }
    blockError.value = toFriendlyAuthMessage(error);
  } finally {
    blockPending.value = false;
  }
}

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

onMounted(() => {
  void loadPostcard();
  void loadBlockState();
});
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

      <section class="safety-actions" aria-labelledby="postcard-safety-title">
        <h2 id="postcard-safety-title">安全</h2>

        <p v-if="blockStateError" class="form-alert" role="alert">{{ blockStateError }}</p>
        <template v-else-if="otherUser">
          <p v-if="isBlocked" class="form-status" role="status">
            你已封锁这位用户。双方新的通信已经停止，已送达的信件仍会保留；可以在设置中解除。
          </p>

          <template v-else>
            <p class="field-hint">
              封锁会停止双方新的通信，不会删除已经送达的信件；解除后可以恢复新的通信。
            </p>
            <button
              class="button button-quiet"
              type="button"
              :disabled="blockPending"
              @click="isBlockConfirming = true"
            >
              封锁这位用户
            </button>

            <div v-if="isBlockConfirming" class="send-confirm">
              <p class="send-confirm-title">确认封锁 {{ otherUser.nickname }}？</p>
              <p class="field-hint">
                封锁后，双方都不能再寄新的明信片或继续共途通信。可以在设置中解除。
              </p>
              <div class="form-actions">
                <button
                  class="button"
                  type="button"
                  :disabled="blockPending"
                  @click="confirmBlock"
                >
                  {{ blockPending ? '正在封锁…' : '确认封锁' }}
                </button>
                <button
                  class="button button-quiet"
                  type="button"
                  :disabled="blockPending"
                  @click="isBlockConfirming = false"
                >
                  先不封锁
                </button>
              </div>
            </div>
          </template>

          <p v-if="blockNotice" class="form-success" role="status">{{ blockNotice }}</p>
          <p v-if="blockError" class="form-alert" role="alert">{{ blockError }}</p>
          <RouterLink class="delivery-link" :to="{ name: 'settings' }">前往设置</RouterLink>
        </template>
      </section>
    </article>
  </div>
</template>
