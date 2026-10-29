<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import {
  api,
  ApiError,
  type PassageSummary,
} from '../../../shared/api/client';
import PageHeader from '../../../shared/ui/PageHeader.vue';
import { canPause, canResume, consentLabel, progressLabel } from '../passage-groups';
import { toFriendlyPassageMessage } from '../messages';

const route = useRoute();
const passage = ref<PassageSummary | null>(null);
const isLoading = ref(true);
const loadError = ref<string | null>(null);
const unavailable = ref(false);
const actionPending = ref(false);
const actionNotice = ref<string | null>(null);
const actionError = ref<string | null>(null);

const id = String(route.params.id ?? '');

async function load(): Promise<void> {
  isLoading.value = true;
  loadError.value = null;
  unavailable.value = false;
  try {
    passage.value = await api.passageDetail(id);
  } catch (error) {
    passage.value = null;
    loadError.value = toFriendlyPassageMessage(error);
    unavailable.value = error instanceof ApiError && error.code === 'RESOURCE_NOT_ACCESSIBLE';
  } finally {
    isLoading.value = false;
  }
}

async function runAction(
  action: 'pause' | 'resume' | 'complete' | 'archive',
): Promise<void> {
  if (!passage.value || actionPending.value) {
    return;
  }
  actionPending.value = true;
  actionError.value = null;
  actionNotice.value = null;
  try {
    const updated =
      action === 'pause'
        ? await api.pausePassage(passage.value.id)
        : action === 'resume'
          ? await api.resumePassage(passage.value.id)
          : action === 'complete'
            ? await api.completePassage(passage.value.id)
            : await api.archivePassage(passage.value.id);
    passage.value = updated;
    actionNotice.value =
      action === 'pause'
        ? '已停泊。对方无法替你续程。'
        : action === 'resume'
          ? '已续程。是否继续通信仍由双方各自决定。'
          : action === 'complete'
            ? '这段共途已完成，不会自动成为信友。'
            : '这段共途已归档，历史仍按原有权限保留。';
  } catch (error) {
    actionError.value = toFriendlyPassageMessage(error);
  } finally {
    actionPending.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div class="page">
    <p v-if="isLoading" class="form-status" role="status">正在读取这段共途…</p>

    <div v-else-if="loadError" class="section-card">
      <p class="form-alert" role="alert">{{ loadError }}</p>
      <div class="passage-actions">
        <button v-if="!unavailable" class="button button-quiet" type="button" @click="load">
          重新读取
        </button>
        <RouterLink class="button button-quiet" :to="{ name: 'passages' }">
          返回共途
        </RouterLink>
      </div>
    </div>

    <template v-else-if="passage">
      <PageHeader
        eyebrow="共途"
        :title="passage.topic"
        description="这是一段两个人的共同经历；进度、通信意愿与记忆可见性彼此独立。"
      />

      <div class="section-stack">
        <section class="section-card passage-detail-card">
          <header class="section-heading">
            <h2>这段共途</h2>
            <span class="passage-status-badge">{{ progressLabel(passage.progressStatus) }}</span>
          </header>

          <dl class="passage-facts">
            <div>
              <dt>对方</dt>
              <dd>
                {{ passage.counterpart.nickname }}
                <template v-if="passage.counterpart.city">
                  · {{ passage.counterpart.city.name }}
                </template>
              </dd>
            </div>
            <div>
              <dt>类型</dt>
              <dd>{{ passage.kind === 'ONE_OFF' ? '一次交换' : passage.kind === 'ONGOING' ? '继续交换' : '季节性分享' }}</dd>
            </div>
            <div>
              <dt>通信意愿</dt>
              <dd>你的状态：{{ consentLabel(passage.me.consentState) }}</dd>
            </div>
            <div>
              <dt>对方意愿</dt>
              <dd>对方状态：{{ consentLabel(passage.counterpart.consentState) }}</dd>
            </div>
          </dl>

          <p class="passage-hint">
            {{
              passage.permissions.canSend
                ? '现在可以继续这段共途的通信。'
                : '现在不能开始新的共途通信。'
            }}
          </p>

          <p v-if="passage.progressStatus === 'COMPLETED'" class="passage-hint">
            共途完成不等于成为信友；长期通信许可需要双方另行同意。
          </p>

          <div class="passage-actions">
            <RouterLink
              v-if="passage.permissions.canSend"
              class="button"
              :to="{ name: 'compose', query: { passageId: passage.id } }"
            >
              写一张明信片
            </RouterLink>
            <button
              v-if="canPause(passage)"
              class="button button-quiet"
              type="button"
              :disabled="actionPending"
              @click="runAction('pause')"
            >
              停泊
            </button>
            <button
              v-if="canResume(passage)"
              class="button button-quiet"
              type="button"
              :disabled="actionPending"
              @click="runAction('resume')"
            >
              续程
            </button>
            <button
              v-if="passage.progressStatus === 'ACTIVE'"
              class="button button-quiet"
              type="button"
              :disabled="actionPending"
              @click="runAction('complete')"
            >
              完成这段共途
            </button>
            <button
              v-if="passage.progressStatus !== 'ARCHIVED'"
              class="button button-quiet"
              type="button"
              :disabled="actionPending"
              @click="runAction('archive')"
            >
              归档这段共途
            </button>
          </div>

          <p v-if="actionNotice" class="form-status" role="status">{{ actionNotice }}</p>
          <p v-if="actionError" class="form-alert" role="alert">{{ actionError }}</p>
        </section>

        <section class="section-card">
          <h2>这段经历不会替你决定的事</h2>
          <p class="passage-hint">
            停泊只阻止新的共途通信，不会取消已经寄出的信，也不会删除已经发生的记录。
            双方意愿各自独立；任何人都不能替对方续程。
          </p>
          <p class="passage-hint">
            共途与信友是不同维度：结束一段共途不会自动建立或撤销长期通信许可。
          </p>
        </section>
      </div>
    </template>
  </div>
</template>
