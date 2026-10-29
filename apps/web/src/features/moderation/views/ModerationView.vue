<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  api,
  type ModerationStoryItem,
  type StoryDecisionInput,
} from '../../../shared/api/client';
import { formatDateTime } from '../../../shared/format/postcard';
import EmptyState from '../../../shared/ui/EmptyState.vue';
import PageHeader from '../../../shared/ui/PageHeader.vue';
import SectionCard from '../../../shared/ui/SectionCard.vue';
import { toFriendlyStoryMessage } from '../../../shared/story/messages';

const items = ref<ModerationStoryItem[]>([]);
const selectedId = ref<string | null>(null);
const nextCursor = ref<string | null>(null);
const isLoading = ref(true);
const isLoadingMore = ref(false);
const loadError = ref<string | null>(null);
const isForbidden = ref(false);
const actionError = ref<string | null>(null);
const actionSuccess = ref<string | null>(null);
const isDeciding = ref(false);
const reasonCode = ref<NonNullable<StoryDecisionInput['reasonCode']>>('OTHER');

const selected = computed(
  () => items.value.find((item) => item.id === selectedId.value) ?? items.value[0] ?? null,
);

async function load(reset: boolean): Promise<void> {
  if (reset) {
    isLoading.value = true;
    loadError.value = null;
    isForbidden.value = false;
    nextCursor.value = null;
  } else {
    isLoadingMore.value = true;
  }
  try {
    const result = await api.moderationQueue({
      ...(reset || !nextCursor.value ? {} : { cursor: nextCursor.value }),
      limit: 20,
    });
    items.value = reset ? result.items : [...items.value, ...result.items];
    nextCursor.value = result.nextCursor ?? null;
    if (!items.value.some((item) => item.id === selectedId.value)) {
      selectedId.value = items.value[0]?.id ?? null;
    }
  } catch (error) {
    if (error instanceof Error && 'status' in error && error.status === 403) {
      isForbidden.value = true;
    } else {
      loadError.value = toFriendlyStoryMessage(error);
    }
  } finally {
    isLoading.value = false;
    isLoadingMore.value = false;
  }
}

function selectItem(id: string): void {
  selectedId.value = id;
  actionError.value = null;
  actionSuccess.value = null;
}

async function decide(action: StoryDecisionInput['action']): Promise<void> {
  if (!selected.value || isDeciding.value) {
    return;
  }
  const verb = action === 'APPROVE' ? '通过' : action === 'REJECT' ? '驳回' : '下架';
  if (!window.confirm(`确定${verb}《${selected.value.title}》吗？`)) {
    return;
  }
  isDeciding.value = true;
  actionError.value = null;
  actionSuccess.value = null;
  try {
    await api.decideStory(selected.value.id, {
      action,
      ...(action === 'APPROVE' ? {} : { reasonCode: reasonCode.value }),
    });
    actionSuccess.value = `已${verb}。`;
    await load(true);
  } catch (error) {
    actionError.value = toFriendlyStoryMessage(error);
  } finally {
    isDeciding.value = false;
  }
}

onMounted(() => load(true));
</script>

<template>
  <div class="page">
    <PageHeader
      eyebrow="审核"
      title="故事审核台"
      description="只处理已经提交的故事。通过、驳回或下架都会写入审计；管理员不能审核自己的故事。"
    />

    <p v-if="isLoading" class="form-status" role="status">正在读取待审核故事…</p>

    <SectionCard v-else-if="isForbidden" title="没有审核权限">
      <EmptyState
        title="这个页面只对管理员开放"
        description="普通用户无法查看审核队列，也无法通过修改 URL 获得权限。"
        hint="你仍然可以阅读公开故事。"
      />
      <RouterLink class="button button-quiet" :to="{ name: 'discover' }">回到故事站</RouterLink>
    </SectionCard>

    <div v-else-if="loadError" class="section-card">
      <p class="form-alert" role="alert">{{ loadError }}</p>
      <button class="button button-quiet" type="button" @click="load(true)">重新读取</button>
    </div>

    <template v-else>
      <p v-if="actionError" class="form-alert" role="alert">{{ actionError }}</p>
      <p v-if="actionSuccess" class="form-success" role="status">{{ actionSuccess }}</p>

      <EmptyState
        v-if="items.length === 0"
        title="现在没有待审核的故事"
        description="作者提交后，故事会按提交时间出现在这里。"
        hint="审核队列为空时，不会伪造待审核内容。"
      />

      <div v-else class="moderation-layout">
        <SectionCard title="待审核队列" :badge="String(items.length)" description="按提交时间从早到晚。">
          <ul class="admin-queue">
            <li v-for="item in items" :key="item.id">
              <button
                type="button"
                class="admin-queue-item"
                :class="{ 'admin-queue-item-active': item.id === selected?.id }"
                @click="selectItem(item.id)"
              >
                <span class="admin-queue-title">{{ item.title }}</span>
                <span class="admin-queue-meta">
                  {{ item.authorNickname }} · {{ item.city.name }} · {{ formatDateTime(item.submittedAt) }}
                </span>
              </button>
            </li>
          </ul>
          <div v-if="nextCursor" class="form-actions">
            <button class="button button-quiet" type="button" :disabled="isLoadingMore" @click="load(false)">
              {{ isLoadingMore ? '正在读取…' : '加载更多' }}
            </button>
          </div>
        </SectionCard>

        <SectionCard v-if="selected" title="故事内容" :description="`${selected.authorNickname} · ${selected.city.name}`">
          <h3 class="story-card-title">{{ selected.title }}</h3>
          <p class="story-meta">提交于 {{ formatDateTime(selected.submittedAt) }}</p>
          <p class="story-body">{{ selected.body }}</p>
          <ul v-if="selected.topicTags.length > 0" class="tag-list" aria-label="主题标签">
            <li v-for="tag in selected.topicTags" :key="tag" class="tag">{{ tag }}</li>
          </ul>

          <div class="form-field moderation-reason">
            <label for="moderation-reason">驳回 / 下架原因</label>
            <select id="moderation-reason" v-model="reasonCode">
              <option value="PRIVACY">隐私或精确位置</option>
              <option value="CONTACT_INFO">联系方式</option>
              <option value="HARASSMENT">骚扰或攻击</option>
              <option value="ILLEGAL">违法内容</option>
              <option value="OTHER">其他</option>
            </select>
            <p class="field-hint">原因写入审计，不向公众展示内部备注。</p>
          </div>

          <div class="form-actions">
            <button class="button" type="button" :disabled="isDeciding" @click="decide('APPROVE')">
              通过
            </button>
            <button class="button button-quiet" type="button" :disabled="isDeciding" @click="decide('REJECT')">
              驳回
            </button>
            <button class="button button-quiet" type="button" :disabled="isDeciding" @click="decide('REMOVE')">
              下架
            </button>
          </div>
        </SectionCard>
      </div>
    </template>
  </div>
</template>
