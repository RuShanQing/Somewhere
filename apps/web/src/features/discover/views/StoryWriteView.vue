<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  api,
  type CitySummary,
  type OwnStory,
} from '../../../shared/api/client';
import PageHeader from '../../../shared/ui/PageHeader.vue';
import SectionCard from '../../../shared/ui/SectionCard.vue';
import { toFriendlyStoryMessage } from '../../../shared/story/messages';
import {
  canEditStory,
  canSubmitStory,
  storyStatusHint,
  storyStatusLabel,
} from '../../../shared/story/status';

const route = useRoute();
const router = useRouter();

const storyId = computed(() => (typeof route.params.id === 'string' ? route.params.id : null));
const cities = ref<CitySummary[]>([]);
const story = ref<OwnStory | null>(null);
const isLoading = ref(true);
const loadError = ref<string | null>(null);
const isSaving = ref(false);
const isSubmitting = ref(false);
const formError = ref<string | null>(null);
const formSuccess = ref<string | null>(null);

const form = reactive({
  title: '',
  body: '',
  topicTags: '',
  cityId: '',
});

const titleLength = computed(() => Array.from(form.title.trim()).length);
const bodyLength = computed(() => Array.from(form.body.trim()).length);
const isEditable = computed(() => !story.value || canEditStory(story.value.reviewStatus));
const canSubmit = computed(() => !story.value || canSubmitStory(story.value.reviewStatus));
const status = computed(() => story.value?.reviewStatus ?? 'DRAFT');
const isBusy = computed(() => isSaving.value || isSubmitting.value);

function fillForm(value: OwnStory): void {
  form.title = value.title;
  form.body = value.body;
  form.topicTags = value.topicTags.join('，');
  form.cityId = value.city.id;
}

function parseTags(): string[] | null {
  const tags = form.topicTags
    .split(/[,，]/)
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
  if (tags.length > 3) {
    formError.value = '主题标签最多 3 个。';
    return null;
  }
  if (tags.some((tag) => Array.from(tag).length > 24)) {
    formError.value = '每个主题标签最多 24 个字符。';
    return null;
  }
  return tags;
}

function validate(): string[] | null {
  formError.value = null;
  const title = form.title.trim();
  const body = form.body.trim();
  if (!form.cityId) {
    formError.value = '请选择故事所属城市。';
    return null;
  }
  if (title.length === 0) {
    formError.value = '标题不能为空。';
    return null;
  }
  if (Array.from(title).length > 80) {
    formError.value = '标题最多 80 个字符。';
    return null;
  }
  if (Array.from(body).length < 20 || Array.from(body).length > 3000) {
    formError.value = '正文需要 20–3000 个字符。';
    return null;
  }
  const tags = parseTags();
  if (tags === null) {
    return null;
  }
  return tags;
}

async function load(): Promise<void> {
  isLoading.value = true;
  loadError.value = null;
  try {
    cities.value = await api.cities();
    if (storyId.value) {
      const value = await api.myStory(storyId.value);
      story.value = value;
      fillForm(value);
    } else if (cities.value[0]) {
      form.cityId = cities.value[0].id;
    }
  } catch (error) {
    loadError.value = toFriendlyStoryMessage(error);
  } finally {
    isLoading.value = false;
  }
}

async function saveDraft(): Promise<void> {
  if (isBusy.value || !isEditable.value) {
    return;
  }
  const tags = validate();
  if (tags === null) {
    return;
  }
  isSaving.value = true;
  formSuccess.value = null;
  try {
    const input = {
      title: form.title.trim(),
      body: form.body.trim(),
      topicTags: tags,
      cityId: form.cityId,
    };
    const saved = storyId.value
      ? await api.updateStory(storyId.value, input)
      : await api.createStory(input);
    story.value = saved;
    if (!storyId.value) {
      await router.replace({ name: 'story-write', params: { id: saved.id } });
    }
    formSuccess.value = '草稿已保存，只有你能看到。';
  } catch (error) {
    formError.value = toFriendlyStoryMessage(error);
  } finally {
    isSaving.value = false;
  }
}

async function submitForReview(): Promise<void> {
  if (isBusy.value || !isEditable.value || !canSubmit.value) {
    return;
  }
  if (!storyId.value) {
    await saveDraft();
    if (!story.value) {
      return;
    }
  }
  if (!story.value) {
    return;
  }
  isSubmitting.value = true;
  formError.value = null;
  formSuccess.value = null;
  try {
    const submitted = await api.submitStory(story.value.id);
    story.value = submitted;
    fillForm(submitted);
    formSuccess.value = '已提交审核。审核期间内容不能直接修改。';
  } catch (error) {
    formError.value = toFriendlyStoryMessage(error);
  } finally {
    isSubmitting.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="page page-narrow">
    <PageHeader
      eyebrow="发现 · 写作"
      title="写一段城市故事"
      description="先保存草稿，再提交审核。通过审核且作者同意公开后，故事才会出现在故事站。"
    />

    <p v-if="isLoading" class="form-status" role="status">正在准备写作页…</p>

    <div v-else-if="loadError" class="section-card">
      <p class="form-alert" role="alert">{{ loadError }}</p>
      <RouterLink class="button button-quiet" :to="{ name: 'my-stories' }">回到我的故事</RouterLink>
    </div>

    <SectionCard v-else title="故事内容" :description="story ? `当前状态：${storyStatusLabel(status)}` : '草稿只对你自己可见。'">
      <p v-if="story" class="status-banner" :data-status="status">
        <strong>{{ storyStatusLabel(status) }}</strong>
        {{ storyStatusHint(status) }}
      </p>

      <form class="compose-form" @submit.prevent="saveDraft">
        <div class="form-field">
          <label for="story-city">城市</label>
          <select id="story-city" v-model="form.cityId" :disabled="!isEditable">
            <option value="">请选择城市</option>
            <option v-for="city in cities" :key="city.id" :value="city.id">
              {{ city.name }} · {{ city.countryCode }}
            </option>
          </select>
          <p class="field-hint">只使用城市级信息，不收集街道或实时定位。</p>
        </div>

        <div class="form-field">
          <label for="story-title">标题</label>
          <input
            id="story-title"
            v-model="form.title"
            type="text"
            :disabled="!isEditable"
            :aria-invalid="titleLength > 80"
            placeholder="例如：雨夜书店"
          />
          <p class="compose-foot">
            <span class="field-hint">1–80 个字符</span>
            <span class="character-count" :class="{ 'character-count-over': titleLength > 80 }">
              {{ titleLength }} / 80
            </span>
          </p>
        </div>

        <div class="form-field">
          <label for="story-body">正文</label>
          <textarea
            id="story-body"
            v-model="form.body"
            :disabled="!isEditable"
            :aria-invalid="bodyLength > 0 && (bodyLength < 20 || bodyLength > 3000)"
            placeholder="写下一个真实的生活片段。不要包含电话、住址或其他人的隐私。"
          />
          <p class="compose-foot">
            <span class="field-hint">20–3000 个字符；请自行去除联系方式与精确位置。</span>
            <span class="character-count" :class="{ 'character-count-over': bodyLength > 3000 }">
              {{ bodyLength }} / 3000
            </span>
          </p>
        </div>

        <div class="form-field">
          <label for="story-tags">主题标签</label>
          <input
            id="story-tags"
            v-model="form.topicTags"
            type="text"
            :disabled="!isEditable"
            placeholder="用逗号分隔，最多 3 个，例如：雨天，书店"
          />
          <p class="field-hint">标签用于筛选，不用于热度排名。</p>
        </div>

        <p v-if="formError" class="form-alert" role="alert">{{ formError }}</p>
        <p v-if="formSuccess" class="form-success" role="status">{{ formSuccess }}</p>

        <div class="form-actions">
          <button v-if="isEditable" class="button" type="submit" :disabled="isBusy">
            {{ isSaving ? '正在保存…' : '保存草稿' }}
          </button>
          <button
            v-if="isEditable && canSubmit"
            class="button button-quiet"
            type="button"
            :disabled="isBusy"
            @click="submitForReview"
          >
            {{ isSubmitting ? '正在提交…' : '提交审核' }}
          </button>
          <RouterLink class="button button-quiet" :to="{ name: 'my-stories' }">返回我的故事</RouterLink>
        </div>
      </form>
    </SectionCard>
  </div>
</template>
