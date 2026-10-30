<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '../../../shared/api/client';
import EmptyState from '../../../shared/ui/EmptyState.vue';
import PageHeader from '../../../shared/ui/PageHeader.vue';
import SectionCard from '../../../shared/ui/SectionCard.vue';
import { usePenpals } from '../composables/usePenpals';
import { toFriendlyPenpalMessage } from '../messages';
import {
  hasPenpalActivity,
  penpalCityLabel,
  penpalEmptyDescription,
} from '../penpal-state';

const { overview, isLoading, loadError, load } = usePenpals();
const pendingId = ref<string | null>(null);
const actionError = ref<string | null>(null);
const actionNotice = ref<string | null>(null);
const revokeConfirmId = ref<string | null>(null);

async function runAction(
  counterpartId: string,
  action: 'accept' | 'decline' | 'revoke-request' | 'revoke-penpal',
): Promise<void> {
  if (pendingId.value) {
    return;
  }
  pendingId.value = counterpartId;
  actionError.value = null;
  actionNotice.value = null;
  try {
    if (action === 'accept') {
      const result = await api.consentPenpal({ counterpartId });
      actionNotice.value =
        result.state === 'ACTIVE'
          ? '你们已经成为信友。'
          : '已记录你的意愿，等待对方回应。';
    } else {
      await api.revokePenpalConsent(counterpartId);
      actionNotice.value =
        action === 'decline'
          ? '已关闭这个请求。'
          : action === 'revoke-request'
            ? '已撤回请求。'
            : '已撤销信友许可；历史内容不受影响。';
    }
    revokeConfirmId.value = null;
    await load();
  } catch (error) {
    actionError.value = toFriendlyPenpalMessage(error);
  } finally {
    pendingId.value = null;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div class="page">
    <PageHeader
      eyebrow="共途"
      title="信友，是双方同意的持续通信"
      description="完成共途不会自动成为信友；只有双方分别同意，才会建立这段许可。任一方都可以随时撤销。"
    />

    <div class="section-stack">
      <p v-if="isLoading" class="form-status" role="status">正在整理你的信友关系…</p>

      <div v-else-if="loadError" class="section-card">
        <p class="form-alert" role="alert">{{ loadError }}</p>
        <button class="button button-quiet" type="button" @click="load">重新读取</button>
      </div>

      <template v-else>
        <p v-if="actionNotice" class="form-success" role="status">{{ actionNotice }}</p>
        <p v-if="actionError" class="form-alert" role="alert">{{ actionError }}</p>

        <EmptyState
          v-if="!hasPenpalActivity(overview)"
          title="还没有信友"
          :description="penpalEmptyDescription()"
          hint="信友与共途是不同维度：一段共途可以结束而不成为信友。"
        />

        <template v-else>
          <SectionCard
            v-if="overview.active.length > 0"
            title="已建立"
            :badge="String(overview.active.length)"
            description="双方都已同意保持通信。这不会公开关系日期、通信次数或已读状态。"
          >
            <ul class="passage-grid">
              <li
                v-for="item in overview.active"
                :key="item.counterpart.id"
                class="passage-card penpal-card"
              >
                <span class="passage-topic">
                  {{ item.counterpart.nickname }}{{ penpalCityLabel(item.counterpart) }}
                </span>
                <span class="passage-hint">你们已同意保持通信。</span>

                <div v-if="revokeConfirmId === item.counterpart.id" class="send-confirm">
                  <p class="send-confirm-title">确认撤销与 {{ item.counterpart.nickname }} 的信友许可？</p>
                  <p class="field-hint">
                    撤销后，新的直接联系会被拒绝；已经寄出的信和共同经历不会被删除。
                  </p>
                  <div class="form-actions">
                    <button
                      class="button"
                      type="button"
                      :disabled="pendingId === item.counterpart.id"
                      @click="runAction(item.counterpart.id, 'revoke-penpal')"
                    >
                      确认撤销
                    </button>
                    <button
                      class="button button-quiet"
                      type="button"
                      :disabled="pendingId === item.counterpart.id"
                      @click="revokeConfirmId = null"
                    >
                      先不撤销
                    </button>
                  </div>
                </div>

                <div v-else class="penpal-actions">
                  <button
                    class="button button-quiet"
                    type="button"
                    :disabled="pendingId === item.counterpart.id"
                    @click="revokeConfirmId = item.counterpart.id"
                  >
                    撤销信友许可
                  </button>
                </div>
              </li>
            </ul>
          </SectionCard>

          <SectionCard
            v-if="overview.incoming.length > 0"
            title="收到的请求"
            :badge="String(overview.incoming.length)"
            description="对方希望与你保持长期通信。同意之前，可以先回到共途详情确认上下文。"
          >
            <ul class="passage-grid">
              <li
                v-for="item in overview.incoming"
                :key="item.counterpart.id"
                class="passage-card penpal-card"
              >
                <span class="passage-topic">
                  {{ item.counterpart.nickname }}{{ penpalCityLabel(item.counterpart) }}
                </span>
                <span class="passage-hint">对方希望与你成为信友。</span>
                <div class="penpal-actions">
                  <button
                    class="button"
                    type="button"
                    :disabled="pendingId === item.counterpart.id"
                    @click="runAction(item.counterpart.id, 'accept')"
                  >
                    同意
                  </button>
                  <button
                    class="button button-quiet"
                    type="button"
                    :disabled="pendingId === item.counterpart.id"
                    @click="runAction(item.counterpart.id, 'decline')"
                  >
                    拒绝
                  </button>
                </div>
              </li>
            </ul>
          </SectionCard>

          <SectionCard
            v-if="overview.outgoing.length > 0"
            title="我发出的请求"
            :badge="String(overview.outgoing.length)"
            description="等待对方回应。没有回应也不会产生催促提醒。"
          >
            <ul class="passage-grid">
              <li
                v-for="item in overview.outgoing"
                :key="item.counterpart.id"
                class="passage-card penpal-card"
              >
                <span class="passage-topic">
                  {{ item.counterpart.nickname }}{{ penpalCityLabel(item.counterpart) }}
                </span>
                <span class="passage-hint">已发出请求，等待对方回应。</span>
                <div class="penpal-actions">
                  <button
                    class="button button-quiet"
                    type="button"
                    :disabled="pendingId === item.counterpart.id"
                    @click="runAction(item.counterpart.id, 'revoke-request')"
                  >
                    撤回请求
                  </button>
                </div>
              </li>
            </ul>
          </SectionCard>
        </template>

        <section class="section-card">
          <h2>信友不会改变的事</h2>
          <p class="passage-hint">
            共途记录一段共同经历，信友记录是否允许继续联系；两者不互相替代。
            撤销信友许可不会删除已经合法保留的信件与记忆。
          </p>
          <p class="passage-hint">
            如果你们之间存在封锁，封禁优先于信友许可；解除后，双方原来的同意才会重新生效。
          </p>
        </section>
      </template>
    </div>
  </div>
</template>
