<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from 'vue';
import { api, type PersonalMemory } from '../../../shared/api/client';
import { formatDateTime } from '../../../shared/format/postcard';
import EmptyState from '../../../shared/ui/EmptyState.vue';
import PageHeader from '../../../shared/ui/PageHeader.vue';
import SectionCard from '../../../shared/ui/SectionCard.vue';
import { usePersonalMemories } from '../composables/usePersonalMemories';
import { toFriendlyMemoryMessage } from '../messages';
import {
  MEMORY_BODY_MAX,
  MEMORY_TITLE_MAX,
  canSaveMemory,
  charCount,
  memoryBodyError,
  memoryTitleError,
  memoryUpdatedLabel,
} from '../personal-memory';

const { items, isLoading, loadError, load } = usePersonalMemories();

const form = reactive({ title: '', body: '' });
const editingId = ref<string | null>(null);
const isSaving = ref(false);
const formError = ref<string | null>(null);
const formNotice = ref<string | null>(null);
const deleteConfirmId = ref<string | null>(null);
const deletePendingId = ref<string | null>(null);
const titleInput = ref<HTMLInputElement | null>(null);

const titleCount = computed(() => charCount(form.title));
const bodyCount = computed(() => charCount(form.body));
const isEditing = computed(() => editingId.value !== null);
const canSubmit = computed(() => !isSaving.value && canSaveMemory(form.title, form.body));

function resetForm(): void {
  editingId.value = null;
  form.title = '';
  form.body = '';
  formError.value = null;
}

function startEdit(memory: PersonalMemory): void {
  editingId.value = memory.id;
  form.title = memory.title;
  form.body = memory.body;
  formError.value = null;
  formNotice.value = null;
  void nextTick(() => titleInput.value?.focus());
}

async function save(): Promise<void> {
  if (isSaving.value) {
    return;
  }
  const titleIssue = memoryTitleError(form.title);
  const bodyIssue = memoryBodyError(form.body);
  if (titleIssue || bodyIssue) {
    formError.value = titleIssue ?? bodyIssue;
    return;
  }

  isSaving.value = true;
  formError.value = null;
  formNotice.value = null;
  try {
    if (editingId.value) {
      await api.updatePersonalMemory(editingId.value, {
        title: form.title,
        body: form.body,
      });
      formNotice.value = '已保存修改。';
    } else {
      await api.createPersonalMemory({ title: form.title, body: form.body });
      formNotice.value = '已保存这段记忆。';
    }
    resetForm();
    await load();
  } catch (error) {
    formError.value = toFriendlyMemoryMessage(error);
  } finally {
    isSaving.value = false;
  }
}

async function remove(id: string): Promise<void> {
  if (deletePendingId.value) {
    return;
  }
  deletePendingId.value = id;
  formError.value = null;
  formNotice.value = null;
  try {
    await api.deletePersonalMemory(id);
    if (editingId.value === id) {
      resetForm();
    }
    deleteConfirmId.value = null;
    formNotice.value = '已删除这段记忆。';
    await load();
  } catch (error) {
    formError.value = toFriendlyMemoryMessage(error);
  } finally {
    deletePendingId.value = null;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div class="page">
    <PageHeader
      eyebrow="纪念册"
      title="把共同的时间收好"
      description="双城日记与共同手帐仍是诚实的暂未开放；个人记忆现在可以保存、编辑和删除，只归你个人查看。"
    />

    <div class="section-stack">
      <SectionCard title="双城日记" description="只由双方真实交换并且已经抵达的内容形成。">
        <EmptyState
          title="还没有双城日记"
          description="当你们之间出现第一封已抵达的信，这里才会开始记录。"
          hint="没有内容时不会生成示例日记。"
        />
      </SectionCard>

      <SectionCard title="共同手帐" badge="暂未开放 · P1" description="双方共同编辑的长期作品，需要额外授权。">
        <EmptyState
          title="共同手帐尚未开放"
          description="它会是一份独立的共享授权，不会因为参与共途而自动创建。"
        />
      </SectionCard>

      <SectionCard
        title="个人记忆"
        description="只归你个人查看，不会随个人资料公开，也不会进入城市故事或地图。"
      >
        <p v-if="isLoading" class="form-status" role="status">正在读取你的个人记忆…</p>

        <div v-else-if="loadError" class="form-alert" role="alert">
          <p>{{ loadError }}</p>
          <button class="button button-quiet" type="button" @click="load">重新读取</button>
        </div>

        <template v-else>
          <p v-if="formNotice" class="form-success" role="status">{{ formNotice }}</p>
          <p v-if="formError" class="form-alert" role="alert">{{ formError }}</p>

          <form class="compose-form memory-form" novalidate @submit.prevent="save">
            <h3>{{ isEditing ? '编辑这段记忆' : '写下一段只属于自己的记忆' }}</h3>

            <div class="form-field">
              <label for="memory-title">标题</label>
              <input
                id="memory-title"
                ref="titleInput"
                v-model="form.title"
                name="title"
                type="text"
                autocomplete="off"
                aria-describedby="memory-title-hint"
              />
              <p
                id="memory-title-hint"
                class="field-hint"
                :class="{ 'character-count-over': titleCount > MEMORY_TITLE_MAX }"
              >
                {{ titleCount }} / {{ MEMORY_TITLE_MAX }} 个字符
              </p>
            </div>

            <div class="form-field">
              <label for="memory-body">正文</label>
              <textarea
                id="memory-body"
                v-model="form.body"
                name="body"
                rows="6"
                aria-describedby="memory-body-hint"
              ></textarea>
              <p
                id="memory-body-hint"
                class="field-hint"
                :class="{ 'character-count-over': bodyCount > MEMORY_BODY_MAX }"
              >
                {{ bodyCount }} / {{ MEMORY_BODY_MAX }} 个字符
              </p>
            </div>

            <div class="form-actions">
              <button class="button" type="submit" :disabled="!canSubmit">
                {{ isSaving ? '正在保存…' : isEditing ? '保存修改' : '保存这段记忆' }}
              </button>
              <button
                v-if="isEditing"
                class="button button-quiet"
                type="button"
                :disabled="isSaving"
                @click="resetForm"
              >
                取消编辑
              </button>
              <span class="field-hint">标题和正文都不能为空。</span>
            </div>
          </form>

          <EmptyState
            v-if="items.length === 0"
            title="还没有个人记忆"
            description="你可以把想留下的片段保存在这里，仅自己可见。"
            hint="它不会进入城市故事、地图或任何公开页面。"
          />

          <ul v-else class="passage-grid memory-list">
            <li v-for="memory in items" :key="memory.id" class="passage-card penpal-card">
              <span class="passage-topic">{{ memory.title }}</span>
              <p class="memory-body">{{ memory.body }}</p>
              <span class="passage-hint">
                {{ memoryUpdatedLabel(memory) }} {{ formatDateTime(memory.updatedAt) }}
              </span>

              <div class="penpal-actions">
                <button
                  class="button button-quiet"
                  type="button"
                  :disabled="deletePendingId !== null"
                  @click="startEdit(memory)"
                >
                  编辑
                </button>
                <button
                  v-if="deleteConfirmId !== memory.id"
                  class="button button-quiet"
                  type="button"
                  :disabled="deletePendingId !== null"
                  @click="deleteConfirmId = memory.id"
                >
                  删除
                </button>
              </div>

              <div v-if="deleteConfirmId === memory.id" class="send-confirm">
                <p class="send-confirm-title">确认删除「{{ memory.title }}」？</p>
                <p class="field-hint">
                  只会删除这段个人记忆，不影响任何明信片、共途或他人的记录。
                </p>
                <div class="form-actions">
                  <button
                    class="button"
                    type="button"
                    :disabled="deletePendingId === memory.id"
                    @click="remove(memory.id)"
                  >
                    {{ deletePendingId === memory.id ? '正在删除…' : '确认删除' }}
                  </button>
                  <button
                    class="button button-quiet"
                    type="button"
                    :disabled="deletePendingId === memory.id"
                    @click="deleteConfirmId = null"
                  >
                    先不删除
                  </button>
                </div>
              </div>
            </li>
          </ul>
        </template>
      </SectionCard>
    </div>
  </div>
</template>
