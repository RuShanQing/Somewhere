<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api, type OwnStory } from '../../../shared/api/client';
import { formatDateTime } from '../../../shared/format/postcard';
import EmptyState from '../../../shared/ui/EmptyState.vue';
import PageHeader from '../../../shared/ui/PageHeader.vue';
import SectionCard from '../../../shared/ui/SectionCard.vue';
import { toFriendlyStoryMessage } from '../../../shared/story/messages';
import {
  canDeleteStory,
  canEditStory,
  canSubmitStory,
  canWithdrawStory,
  storyStatusHint,
  storyStatusLabel,
} from '../../../shared/story/status';

const stories = ref<OwnStory[]>([]);
const isLoading = ref(true);
const loadError = ref<string | null>(null);
const actionError = ref<string | null>(null);
const actionSuccess = ref<string | null>(null);
const busyId = ref<string | null>(null);

async function load(): Promise<void> {
  isLoading.value = true;
  loadError.value = null;
  try {
    stories.value = await api.myStories();
  } catch (error) {
    loadError.value = toFriendlyStoryMessage(error);
  } finally {
    isLoading.value = false;
  }
}

async function submit(story: OwnStory): Promise<void> {
  if (!window.confirm('提交后进入审核，审核期间不能直接修改。继续吗？')) {
    return;
  }
  await runAction(story.id, async () => {
    await api.submitStory(story.id);
    actionSuccess.value = '已提交审核。';
  });
}

async function withdraw(story: OwnStory): Promise<void> {
  if (!window.confirm('撤回后，这条故事会立即从公开故事站消失。继续吗？')) {
    return;
  }
  await runAction(story.id, async () => {
    await api.withdrawStory(story.id);
    actionSuccess.value = '已撤回公开授权。';
  });
}

async function remove(story: OwnStory): Promise<void> {
  if (!window.confirm('删除草稿后无法恢复。继续吗？')) {
    return;
  }
  await runAction(story.id, async () => {
    await api.deleteStory(story.id);
    actionSuccess.value = '草稿已删除。';
  });
}

async function runAction(id: string, action: () => Promise<void>): Promise<void> {
  busyId.value = id;
  actionError.value = null;
  actionSuccess.value = null;
  try {
    await action();
    await load();
  } catch (error) {
    actionError.value = toFriendlyStoryMessage(error);
  } finally {
    busyId.value = null;
  }
}

onMounted(load);
</script>

<template>
  <div class="page">
    <PageHeader
      eyebrow="发现 · 我的故事"
      title="你写下的城市片段"
      description="草稿、待审核、已通过和已撤回的故事都在这里；公开端只读取审核通过且作者同意公开的内容。"
    />

    <div class="post-office-actions">
      <RouterLink class="button" :to="{ name: 'story-write' }">写一段新故事</RouterLink>
      <RouterLink class="button button-quiet" :to="{ name: 'discover' }">回到故事站</RouterLink>
    </div>

    <p v-if="isLoading" class="form-status" role="status">正在读取你的故事…</p>

    <div v-else-if="loadError" class="section-card">
      <p class="form-alert" role="alert">{{ loadError }}</p>
      <button class="button button-quiet" type="button" @click="load">重新读取</button>
    </div>

    <template v-else>
      <p v-if="actionError" class="form-alert" role="alert">{{ actionError }}</p>
      <p v-if="actionSuccess" class="form-success" role="status">{{ actionSuccess }}</p>

      <SectionCard title="全部故事" :badge="String(stories.length)" description="状态由服务端决定，页面不自行推断审核结果。">
        <ul v-if="stories.length > 0" class="story-list">
          <li v-for="story in stories" :key="story.id" class="story-card">
            <div class="story-card-head">
              <div>
                <h2 class="story-card-title">
                  <RouterLink
                    v-if="story.publishedAt"
                    :to="{ name: 'story-detail', params: { id: story.id } }"
                  >
                    {{ story.title }}
                  </RouterLink>
                  <template v-else>{{ story.title }}</template>
                </h2>
                <p class="story-meta">
                  {{ story.city.name }} · 更新于 {{ formatDateTime(story.updatedAt) }}
                </p>
              </div>
              <span class="status-pill" :data-status="story.reviewStatus">
                {{ storyStatusLabel(story.reviewStatus) }}
              </span>
            </div>

            <p class="story-excerpt">{{ storyStatusHint(story.reviewStatus) }}</p>
            <p v-if="story.reviewStatus === 'APPROVED' && !story.publishedAt" class="field-hint">
              已通过审核，正在等待这个城市的展示位。
            </p>
            <p v-if="story.reviewStatus === 'REMOVED' && story.removedBy" class="field-hint">
              {{ story.removedBy === 'AUTHOR' ? '由你撤回公开授权。' : '由管理员下架。' }}
            </p>

            <div class="form-actions story-actions">
              <RouterLink
                v-if="canEditStory(story.reviewStatus)"
                class="button button-quiet"
                :to="{ name: 'story-write', params: { id: story.id } }"
              >
                编辑
              </RouterLink>
              <button
                v-if="canSubmitStory(story.reviewStatus)"
                class="button"
                type="button"
                :disabled="busyId === story.id"
                @click="submit(story)"
              >
                提交审核
              </button>
              <button
                v-if="canWithdrawStory(story.reviewStatus)"
                class="button button-quiet"
                type="button"
                :disabled="busyId === story.id"
                @click="withdraw(story)"
              >
                撤回
              </button>
              <button
                v-if="canDeleteStory(story.reviewStatus)"
                class="button button-quiet"
                type="button"
                :disabled="busyId === story.id"
                @click="remove(story)"
              >
                删除草稿
              </button>
            </div>
          </li>
        </ul>

        <EmptyState
          v-else
          title="还没有写过故事"
          description="你可以先保存一份草稿，再决定是否提交审核。"
          hint="没有内容时，这里不会出现示例故事。"
        />
      </SectionCard>
    </template>
  </div>
</template>
