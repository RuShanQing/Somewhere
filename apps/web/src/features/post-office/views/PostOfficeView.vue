<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api, ApiError, type PostOfficeSummary } from '../../../shared/api/client';
import { toFriendlyAuthMessage } from '../../../shared/api/error-message';
import { formatDateTime } from '../../../shared/format/postcard';
import EmptyState from '../../../shared/ui/EmptyState.vue';
import PageHeader from '../../../shared/ui/PageHeader.vue';
import SectionCard from '../../../shared/ui/SectionCard.vue';

const router = useRouter();
const summary = ref<PostOfficeSummary | null>(null);
const isLoading = ref(true);
const loadError = ref<string | null>(null);

async function handleUnauthorized(error: unknown): Promise<boolean> {
  if (error instanceof ApiError && error.status === 401) {
    await router.replace({ name: 'login', query: { redirect: '/post-office' } });
    return true;
  }
  return false;
}

async function loadSummary(): Promise<void> {
  isLoading.value = true;
  loadError.value = null;
  try {
    summary.value = await api.postOfficeSummary();
  } catch (error) {
    if (await handleUnauthorized(error)) {
      return;
    }
    loadError.value = toFriendlyAuthMessage(error);
  } finally {
    isLoading.value = false;
  }
}

onMounted(loadSummary);
</script>

<template>
  <div class="page">
    <PageHeader
      eyebrow="邮局"
      title="你的信，会按距离慢慢抵达"
      description="一封信要走过两座城市之间的距离。这里不会催你回复，也不会显示谁已经读过。"
    />

    <div class="post-office-actions">
      <RouterLink class="button" :to="{ name: 'compose' }">写一张明信片</RouterLink>
      <p class="field-hint">同城最快 12 小时，最远约 5 天；具体时间由服务器计算。</p>
    </div>

    <p v-if="isLoading" class="form-status" role="status">正在整理你的信箱…</p>

    <div v-else-if="loadError" class="section-card">
      <p class="form-alert" role="alert">{{ loadError }}</p>
      <button class="button button-quiet" type="button" @click="loadSummary">重新读取</button>
    </div>

    <div v-else-if="summary" class="section-stack">
      <SectionCard
        title="新来信"
        :badge="String(summary.incoming.length)"
        description="已经抵达、属于你的明信片。"
      >
        <ul v-if="summary.incoming.length > 0" class="delivery-list">
          <li v-for="item in summary.incoming" :key="item.id" class="delivery-item">
            <div class="delivery-main">
              <p class="delivery-title">{{ item.senderNickname }} 的来信</p>
              <p class="delivery-note">抵达于 {{ formatDateTime(item.deliveredAt) }}</p>
            </div>
            <RouterLink class="delivery-link" :to="{ name: 'postcard-detail', params: { id: item.id } }">
              打开来信
            </RouterLink>
          </li>
        </ul>
        <EmptyState
          v-else
          title="还没有新来信"
          description="当有人寄来的明信片抵达你的城市，它会出现在这里。"
          hint="没有消息时，这里也不会出现示例信件。"
        />
      </SectionCard>

      <SectionCard
        title="正在路上"
        :badge="String(summary.inTransit.length)"
        description="寄出后仍在投递中的信，具体到达时间由服务器按城市距离计算。"
      >
        <ul v-if="summary.inTransit.length > 0" class="delivery-list">
          <li v-for="item in summary.inTransit" :key="item.id" class="delivery-item">
            <div class="delivery-main">
              <p class="delivery-title">一封正在路上的信</p>
              <p class="delivery-note">预计 {{ formatDateTime(item.deliverAt) }} 抵达</p>
            </div>
            <span class="status-pill">在途</span>
            <RouterLink class="delivery-link" :to="{ name: 'postcard-detail', params: { id: item.id } }">
              查看
            </RouterLink>
          </li>
        </ul>
        <EmptyState
          v-else
          title="没有正在路上的信"
          description="寄出的明信片会经历一段安静的等待，再抵达对方的城市。"
          hint="你仍然可以现在就写一张。"
        />
      </SectionCard>

      <SectionCard
        title="继续写信"
        :badge="String(summary.drafts.length)"
        description="只属于你的未完成内容，不会在寄出前被任何人读到。"
      >
        <ul v-if="summary.drafts.length > 0" class="delivery-list">
          <li v-for="item in summary.drafts" :key="item.id" class="delivery-item">
            <div class="delivery-main">
              <p class="delivery-title">未完成的草稿</p>
              <p class="delivery-note">最后修改于 {{ formatDateTime(item.updatedAt) }}</p>
            </div>
            <RouterLink
              class="delivery-link"
              :to="{ name: 'compose', params: { id: item.id } }"
            >
              继续写
            </RouterLink>
          </li>
        </ul>
        <EmptyState
          v-else
          title="还没有草稿"
          description="草稿会保存在这里，直到你决定寄出或放弃。"
          hint="写下的内容在寄出前只有你能看到。"
        />
      </SectionCard>
    </div>
  </div>
</template>
