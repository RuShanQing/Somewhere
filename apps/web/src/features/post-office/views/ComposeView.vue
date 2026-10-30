<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  api,
  ApiError,
  type PassageSummary,
  type PostcardDetail,
  type PostcardRecipient,
} from '../../../shared/api/client';
import { toFriendlyAuthMessage } from '../../../shared/api/error-message';
import { countPostcardCharacters } from '../../../shared/format/postcard';
import PageHeader from '../../../shared/ui/PageHeader.vue';

const BODY_MAX = 2000;

const route = useRoute();
const router = useRouter();

const draftId = ref<string | null>(
  typeof route.params.id === 'string' ? route.params.id : null,
);
const recipients = ref<PostcardRecipient[]>([]);
const passage = ref<PassageSummary | null>(null);
const replyTarget = ref<PostcardDetail | null>(null);
const draftRecipientName = ref<string | null>(null);
const recipientId = ref('');
const body = ref('');
const isLoading = ref(true);
const isSaving = ref(false);
const isSending = ref(false);
const isConfirming = ref(false);
const loadError = ref<string | null>(null);
const saveError = ref<string | null>(null);
const sendError = ref<string | null>(null);
const savedMessage = ref<string | null>(null);

const bodyLength = computed(() => countPostcardCharacters(body.value.trim()));
const bodyTooLong = computed(() => bodyLength.value > BODY_MAX);
const bodyIsEmpty = computed(() => bodyLength.value === 0);
const canSubmit = computed(
  () => !bodyIsEmpty.value && !bodyTooLong.value && recipientId.value.length > 0,
);
const recipientIsListed = computed(() =>
  recipients.value.some((recipient) => recipient.id === recipientId.value),
);
const pageTitle = computed(() =>
  replyTarget.value ? '写一封会慢慢抵达的回信' : '写一张会慢慢抵达的明信片',
);

async function handleUnauthorized(error: unknown): Promise<boolean> {
  if (error instanceof ApiError && error.status === 401) {
    const redirect = draftId.value
      ? `/post-office/compose/${draftId.value}`
      : route.fullPath;
    await router.replace({ name: 'login', query: { redirect } });
    return true;
  }
  return false;
}

function friendlyError(error: unknown): string {
  if (error instanceof ApiError && error.code === 'RATE_LIMITED') {
    return error.message;
  }
  return toFriendlyAuthMessage(error);
}

async function loadCompose(): Promise<void> {
  isLoading.value = true;
  loadError.value = null;
  const queryPassageId =
    typeof route.query.passageId === 'string' ? route.query.passageId : null;
  const queryReplyToPostcardId =
    typeof route.query.replyToPostcardId === 'string'
      ? route.query.replyToPostcardId
      : null;
  let boundPassageId: string | null = queryPassageId;
  let replyTargetId: string | null = queryReplyToPostcardId;

  try {
    if (draftId.value) {
      const draft = await api.postcardDraft(draftId.value);
      body.value = draft.body;
      recipientId.value = draft.recipient?.id ?? '';
      draftRecipientName.value = draft.recipient?.nickname ?? null;
      boundPassageId = draft.passageId ?? boundPassageId;
      replyTargetId = draft.replyToPostcardId ?? replyTargetId;
    }

    if (replyTargetId) {
      const target = await api.postcardDetail(replyTargetId);
      if (!draftId.value && !target.canReply) {
        loadError.value = '这封信现在不能回信，可能已经回过、已停泊或不属于共途。';
        return;
      }
      replyTarget.value = target;
      boundPassageId = target.passageId ?? boundPassageId;
    }

    if (boundPassageId) {
      passage.value = await api.passageDetail(boundPassageId);
      recipients.value = await api.postcardRecipients(boundPassageId);
      if (!draftId.value) {
        recipientId.value = recipients.value[0]?.id ?? '';
      }
    } else {
      recipients.value = await api.postcardRecipients();
    }
  } catch (error) {
    if (await handleUnauthorized(error)) {
      return;
    }
    loadError.value =
      error instanceof ApiError && error.code === 'RESOURCE_NOT_ACCESSIBLE'
        ? boundPassageId
          ? '这段共途现在不可访问，可能不在你的参与范围内。'
          : '这封草稿已经不存在，或不属于你。'
        : toFriendlyAuthMessage(error);
  } finally {
    isLoading.value = false;
  }
}

async function saveDraft(): Promise<string | null> {
  if (isSaving.value) {
    return draftId.value;
  }
  saveError.value = null;
  savedMessage.value = null;
  sendError.value = null;

  if (bodyIsEmpty.value) {
    saveError.value = '写一点内容再保存。';
    return null;
  }
  if (bodyTooLong.value) {
    saveError.value = '正文最多 2000 个字符。';
    return null;
  }

  isSaving.value = true;
  try {
    const payload = {
      body: body.value,
      recipientId: recipientId.value === '' ? null : recipientId.value,
    };
    const draft = draftId.value
      ? await api.updatePostcardDraft(draftId.value, payload)
      : await api.createPostcardDraft({
          ...payload,
          ...(passage.value ? { passageId: passage.value.id } : {}),
          ...(replyTarget.value ? { replyToPostcardId: replyTarget.value.id } : {}),
        });

    draftId.value = draft.id;
    draftRecipientName.value = draft.recipient?.nickname ?? null;
    if (!route.params.id) {
      await router.replace({ name: 'compose', params: { id: draft.id } });
    }
    savedMessage.value = '草稿已保存。寄出之前，只有你能看到它。';
    return draft.id;
  } catch (error) {
    if (await handleUnauthorized(error)) {
      return null;
    }
    saveError.value = friendlyError(error);
    return null;
  } finally {
    isSaving.value = false;
  }
}

function requestSend(): void {
  saveError.value = null;
  sendError.value = null;
  if (bodyIsEmpty.value) {
    saveError.value = '写一点内容再寄出。';
    return;
  }
  if (bodyTooLong.value) {
    saveError.value = '正文最多 2000 个字符。';
    return;
  }
  if (!recipientId.value) {
    saveError.value = '请选择一个收件人。';
    return;
  }
  isConfirming.value = true;
}

function newIdempotencyKey(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `send-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

async function confirmSend(): Promise<void> {
  if (!canSubmit.value || isSending.value) {
    return;
  }
  isSending.value = true;
  sendError.value = null;
  try {
    const id = await saveDraft();
    if (!id) {
      return;
    }
    const result = await api.sendPostcardDraft(id, newIdempotencyKey());
    await router.push({
      name: 'postcard-detail',
      params: { id: result.postcardId },
    });
  } catch (error) {
    if (await handleUnauthorized(error)) {
      return;
    }
    sendError.value = friendlyError(error);
    isConfirming.value = false;
  } finally {
    isSending.value = false;
  }
}

onMounted(loadCompose);
</script>

<template>
  <div class="page page-narrow">
    <PageHeader
      eyebrow="邮局 · 写信"
      :title="pageTitle"
      description="正文会被保存成一封不可修改的信，到达时间由两座城市之间的距离决定。"
    />

    <p v-if="isLoading" class="form-status" role="status">正在准备信纸…</p>

    <div v-else-if="loadError" class="section-card">
      <p class="form-alert" role="alert">{{ loadError }}</p>
      <button class="button button-quiet" type="button" @click="loadCompose">重新读取</button>
    </div>

    <form v-else class="section-card compose-form" novalidate @submit.prevent="requestSend">
      <div v-if="passage" class="passage-compose-context">
        <p v-if="replyTarget" class="form-success" role="status">
          回复 {{ replyTarget.sender.nickname }} 的明信片
        </p>
        <p class="form-success" role="status">这段共途 · {{ passage.topic }}</p>
        <p class="field-hint">
          收件人由这段共途决定：{{ passage.counterpart.nickname }}。寄出后仍按双方城市距离计算到达时间。
        </p>
      </div>

      <div class="form-field">
        <label for="compose-recipient">收件人</label>
        <select
          id="compose-recipient"
          v-model="recipientId"
          name="recipient"
          :disabled="Boolean(passage)"
        >
          <option value="">请选择收件人</option>
          <option v-for="recipient in recipients" :key="recipient.id" :value="recipient.id">
            {{ recipient.nickname }} · {{ recipient.city.name }}
          </option>
          <option
            v-if="recipientId && !recipientIsListed && draftRecipientName"
            :value="recipientId"
          >
            {{ draftRecipientName }}（当前不可接信）
          </option>
        </select>
        <p v-if="passage" class="field-hint">
          {{
            passage.permissions.canSend
              ? '收件人固定为这段共途的对方，不能改成其他人。'
              : '这段共途当前不允许新的通信；续程或由对方恢复后才能寄出。'
          }}
        </p>
        <p v-else-if="recipients.length === 0 && !draftRecipientName" class="field-hint">
          当前没有可用的收件人。需要对方在设置中选择城市，或你们先成为信友。
        </p>
        <p v-else class="field-hint">
          收件人来自受控演示白名单和你的信友，不是公开的用户搜索。
        </p>
      </div>

      <div class="form-field">
        <label for="compose-body">正文</label>
        <textarea
          id="compose-body"
          v-model="body"
          name="body"
          rows="10"
          aria-describedby="compose-body-hint"
          :aria-invalid="bodyTooLong ? 'true' : undefined"
          placeholder="写下此刻想寄给远方的话…"
        ></textarea>
        <div class="compose-foot">
          <p id="compose-body-hint" class="field-hint">1–2000 个字符，全空白不算正文。</p>
          <p class="character-count" :class="{ 'character-count-over': bodyTooLong }">
            {{ bodyLength }} / 2000
          </p>
        </div>
      </div>

      <p v-if="saveError" class="form-alert" role="alert">{{ saveError }}</p>
      <p v-if="savedMessage" class="form-success" role="status">{{ savedMessage }}</p>
      <p v-if="sendError" class="form-alert" role="alert">{{ sendError }}</p>

      <div class="form-actions">
        <button class="button button-quiet" type="button" :disabled="isSaving || isSending" @click="saveDraft">
          {{ isSaving ? '正在保存…' : '保存草稿' }}
        </button>
        <button class="button" type="submit" :disabled="!canSubmit || isSaving || isSending">
          寄出这张明信片
        </button>
        <RouterLink
          v-if="passage"
          class="delivery-link"
          :to="{ name: 'passage-detail', params: { id: passage.id } }"
        >
          返回共途
        </RouterLink>
        <RouterLink class="delivery-link" :to="{ name: 'post-office' }">返回邮局</RouterLink>
      </div>

      <div v-if="isConfirming" class="send-confirm">
        <p class="send-confirm-title">寄出后，正文与到达时间都不能再修改。</p>
        <p class="field-hint">
          具体到达时间由服务器根据双方城市距离计算；页面不会用本地时钟提前开信。
        </p>
        <div class="form-actions">
          <button class="button" type="button" :disabled="isSending" @click="confirmSend">
            {{ isSending ? '正在寄出…' : '确认寄出' }}
          </button>
          <button class="button button-quiet" type="button" :disabled="isSending" @click="isConfirming = false">
            再想想
          </button>
        </div>
      </div>
    </form>
  </div>
</template>
