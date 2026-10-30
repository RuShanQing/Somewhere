<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import {
  api,
  ApiError,
  type BlockedUser,
  type PassageSummary,
  type PenpalOverview,
} from '../../../shared/api/client';
import { toFriendlyAuthMessage } from '../../../shared/api/error-message';
import PageHeader from '../../../shared/ui/PageHeader.vue';
import { canPause, canResume, consentLabel, progressLabel } from '../passage-groups';
import {
  toFriendlyPassageMessage,
  toFriendlyPenpalActionMessage,
} from '../messages';

const route = useRoute();
const passage = ref<PassageSummary | null>(null);
const isLoading = ref(true);
const loadError = ref<string | null>(null);
const unavailable = ref(false);
const actionPending = ref(false);
const actionNotice = ref<string | null>(null);
const actionError = ref<string | null>(null);
const blockedUsers = ref<BlockedUser[]>([]);
const blockStateError = ref<string | null>(null);
const isBlockConfirming = ref(false);
const blockPending = ref(false);
const blockNotice = ref<string | null>(null);
const blockError = ref<string | null>(null);
const penpalOverview = ref<PenpalOverview>({ active: [], incoming: [], outgoing: [] });
const penpalStateError = ref<string | null>(null);
const penpalPending = ref(false);
const penpalNotice = ref<string | null>(null);
const penpalError = ref<string | null>(null);
const isPenpalRevokeConfirming = ref(false);

const id = String(route.params.id ?? '');
const counterpartId = computed(() => passage.value?.counterpart.id ?? '');
const isBlocked = computed(() =>
  Boolean(
    counterpartId.value &&
      blockedUsers.value.some((item) => item.userId === counterpartId.value),
  ),
);
const penpalRelationship = computed<'ACTIVE' | 'INCOMING' | 'OUTGOING' | 'NONE'>(() => {
  const target = counterpartId.value;
  if (!target) {
    return 'NONE';
  }
  if (penpalOverview.value.active.some((item) => item.counterpart.id === target)) {
    return 'ACTIVE';
  }
  if (penpalOverview.value.incoming.some((item) => item.counterpart.id === target)) {
    return 'INCOMING';
  }
  if (penpalOverview.value.outgoing.some((item) => item.counterpart.id === target)) {
    return 'OUTGOING';
  }
  return 'NONE';
});

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

async function loadPenpalState(): Promise<void> {
  penpalStateError.value = null;
  try {
    penpalOverview.value = await api.penpals();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return;
    }
    penpalStateError.value = toFriendlyAuthMessage(error);
  }
}

async function requestPenpal(): Promise<void> {
  if (!counterpartId.value || penpalPending.value) {
    return;
  }
  penpalPending.value = true;
  penpalError.value = null;
  penpalNotice.value = null;
  try {
    const result = await api.consentPenpal({ counterpartId: counterpartId.value });
    await loadPenpalState();
    penpalNotice.value =
      result.state === 'ACTIVE'
        ? '你们已经成为信友。'
        : '已表达意愿，等待对方回应。';
  } catch (error) {
    penpalError.value = toFriendlyPenpalActionMessage(error);
  } finally {
    penpalPending.value = false;
  }
}

async function revokePenpal(
  message = '已撤销信友许可；历史内容不受影响。',
): Promise<void> {
  if (!counterpartId.value || penpalPending.value) {
    return;
  }
  penpalPending.value = true;
  penpalError.value = null;
  penpalNotice.value = null;
  try {
    await api.revokePenpalConsent(counterpartId.value);
    isPenpalRevokeConfirming.value = false;
    await loadPenpalState();
    penpalNotice.value = message;
  } catch (error) {
    penpalError.value = toFriendlyPenpalActionMessage(error);
  } finally {
    penpalPending.value = false;
  }
}

async function confirmBlock(): Promise<void> {
  if (!passage.value || !counterpartId.value || blockPending.value) {
    return;
  }
  blockPending.value = true;
  blockError.value = null;
  blockNotice.value = null;
  try {
    await api.blockUser({ userId: counterpartId.value });
    await loadBlockState();
    passage.value = {
      ...passage.value,
      permissions: { ...passage.value.permissions, canSend: false },
    };
    isBlockConfirming.value = false;
  } catch (error) {
    blockError.value = toFriendlyAuthMessage(error);
  } finally {
    blockPending.value = false;
  }
}

onMounted(() => {
  void load();
  void loadBlockState();
  void loadPenpalState();
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

        <section
          v-if="passage.completedAt && counterpartId && !isBlocked"
          class="section-card"
          aria-labelledby="passage-penpal-title"
        >
          <h2 id="passage-penpal-title">信友</h2>

          <p v-if="penpalStateError" class="form-alert" role="alert">{{ penpalStateError }}</p>
          <template v-else>
            <p v-if="penpalRelationship === 'NONE'" class="passage-hint">
              你们已经完成过一段共途。是否继续保持通信，需要双方分别同意；完成共途本身不会自动建立信友关系。
            </p>
            <p v-else-if="penpalRelationship === 'OUTGOING'" class="passage-hint">
              已发出请求，等待对方回应。没有回应也不会产生催促提醒。
            </p>
            <p v-else-if="penpalRelationship === 'INCOMING'" class="passage-hint">
              对方希望与你成为信友。同意后，双方可以继续直接寄信。
            </p>
            <p v-else class="passage-hint">
              你们已经同意保持通信。信友关系独立于共途，可以随时撤销。
            </p>

            <div class="passage-actions">
              <button
                v-if="penpalRelationship === 'NONE'"
                class="button"
                type="button"
                :disabled="penpalPending"
                @click="requestPenpal"
              >
                {{ penpalPending ? '正在记录…' : '请求成为信友' }}
              </button>
              <template v-else-if="penpalRelationship === 'INCOMING'">
                <button
                  class="button"
                  type="button"
                  :disabled="penpalPending"
                  @click="requestPenpal"
                >
                  同意
                </button>
                <button
                  class="button button-quiet"
                  type="button"
                  :disabled="penpalPending"
                  @click="revokePenpal('已关闭这个请求。')"
                >
                  拒绝
                </button>
              </template>
              <button
                v-else-if="penpalRelationship === 'OUTGOING'"
                class="button button-quiet"
                type="button"
                :disabled="penpalPending"
                @click="revokePenpal('已撤回请求。')"
              >
                撤回请求
              </button>
              <button
                v-else
                class="button button-quiet"
                type="button"
                :disabled="penpalPending"
                @click="isPenpalRevokeConfirming = true"
              >
                撤销信友许可
              </button>
              <RouterLink class="delivery-link" :to="{ name: 'penpals' }">
                查看我的信友
              </RouterLink>
            </div>

            <div v-if="isPenpalRevokeConfirming" class="send-confirm">
              <p class="send-confirm-title">
                确认撤销与 {{ passage.counterpart.nickname }} 的信友许可？
              </p>
              <p class="field-hint">
                撤销后，新的直接联系会被拒绝；已经寄出的信和共同经历不会被删除。
              </p>
              <div class="form-actions">
                <button
                  class="button"
                  type="button"
                  :disabled="penpalPending"
                  @click="revokePenpal()"
                >
                  {{ penpalPending ? '正在撤销…' : '确认撤销' }}
                </button>
                <button
                  class="button button-quiet"
                  type="button"
                  :disabled="penpalPending"
                  @click="isPenpalRevokeConfirming = false"
                >
                  先不撤销
                </button>
              </div>
            </div>

            <p v-if="penpalNotice" class="form-success" role="status">{{ penpalNotice }}</p>
            <p v-if="penpalError" class="form-alert" role="alert">{{ penpalError }}</p>
          </template>
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

        <section class="section-card" aria-labelledby="passage-safety-title">
          <h2 id="passage-safety-title">安全</h2>

          <p v-if="blockStateError" class="form-alert" role="alert">{{ blockStateError }}</p>
          <template v-else-if="counterpartId">
            <p v-if="isBlocked" class="form-status" role="status">
              你已封锁对方。双方新的通信已经停止，历史内容仍会保留；可以在设置中解除。
            </p>

            <template v-else>
              <p class="passage-hint">
                封锁会停止双方新的共途和明信片通信，不会删除已经发生的历史；解除后可以恢复新的通信。
              </p>
              <button
                class="button button-quiet"
                type="button"
                :disabled="blockPending"
                @click="isBlockConfirming = true"
              >
                封锁对方
              </button>

              <div v-if="isBlockConfirming" class="send-confirm">
                <p class="send-confirm-title">确认封锁 {{ passage.counterpart.nickname }}？</p>
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
      </div>
    </template>
  </div>
</template>
