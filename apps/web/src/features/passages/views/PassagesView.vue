<script setup lang="ts">
import { computed, onMounted } from 'vue';
import EmptyState from '../../../shared/ui/EmptyState.vue';
import PageHeader from '../../../shared/ui/PageHeader.vue';
import SectionCard from '../../../shared/ui/SectionCard.vue';
import { usePassages } from '../composables/usePassages';
import { consentLabel, groupPassages, progressLabel } from '../passage-groups';

const { items, isLoading, loadError, load } = usePassages();
const groups = computed(() => groupPassages(items.value));

onMounted(() => {
  void load();
});
</script>

<template>
  <div class="page">
    <PageHeader
      eyebrow="共途"
      title="一起走过的路，可以停泊"
      description="共途记录一段有始有终的共同经历，可以续程、停泊或归档；它不等于长期联系人。当前版本尚未开放创建共途。"
    />

    <div class="section-stack">
      <p v-if="isLoading" class="form-status" role="status">正在整理你的共途…</p>

      <div v-else-if="loadError" class="section-card">
        <p class="form-alert" role="alert">{{ loadError }}</p>
        <button class="button button-quiet" type="button" @click="load">重新读取</button>
      </div>

      <template v-else>
        <SectionCard
          title="信友"
          description="信友是双方同意的持续通信许可；完成共途不会自动成为信友，任一方都可以随时撤销。"
        >
          <RouterLink class="button button-quiet" :to="{ name: 'penpals' }">
            查看我的信友
          </RouterLink>
        </SectionCard>

        <SectionCard
          title="正在进行"
          :badge="String(groups.active.length)"
          description="每一段共途都保留自己的进度与许可；停泊只影响新的通信行为。"
        >
          <ul v-if="groups.active.length > 0" class="passage-grid">
            <li v-for="passage in groups.active" :key="passage.id">
              <RouterLink
                class="passage-card"
                :to="{ name: 'passage-detail', params: { id: passage.id } }"
              >
                <span class="passage-topic">{{ passage.topic }}</span>
                <span class="passage-meta">
                  与 {{ passage.counterpart.nickname }}
                  <template v-if="passage.counterpart.city">
                    · {{ passage.counterpart.city.name }}
                  </template>
                </span>
                <span class="passage-badges">
                  <span class="passage-status-badge">{{ progressLabel(passage.progressStatus) }}</span>
                  <span class="passage-consent-badge">你的状态：{{ consentLabel(passage.me.consentState) }}</span>
                </span>
                <span class="passage-hint">
                  {{
                    passage.permissions.canSend
                      ? '可以继续这段共途的通信。'
                      : '现在不能开始新的共途通信。'
                  }}
                </span>
              </RouterLink>
            </li>
          </ul>

          <EmptyState
            v-else
            title="还没有正在进行的共途"
            description="当你与另一个人开始一段共同主题的通信，它会出现在这里。"
            hint="完成共途不会自动成为信友；信友需要双方另行同意。"
          />
        </SectionCard>

        <SectionCard
          title="已归档"
          :badge="String(groups.archived.length)"
          description="归档只让这段经历离开进行中列表，不会删除历史，也不会改变双方的通信意愿。"
        >
          <ul v-if="groups.archived.length > 0" class="passage-grid">
            <li v-for="passage in groups.archived" :key="passage.id">
              <RouterLink
                class="passage-card"
                :to="{ name: 'passage-detail', params: { id: passage.id } }"
              >
                <span class="passage-topic">{{ passage.topic }}</span>
                <span class="passage-meta">与 {{ passage.counterpart.nickname }}</span>
                <span class="passage-badges">
                  <span class="passage-status-badge">已归档</span>
                </span>
                <span class="passage-hint">已授权的内容仍按原有权限保留。</span>
              </RouterLink>
            </li>
          </ul>

          <EmptyState
            v-else
            title="还没有已归档的共途"
            description="归档后的经历会留在这里，仍可按原权限阅读。"
          />
        </SectionCard>
      </template>
    </div>
  </div>
</template>
