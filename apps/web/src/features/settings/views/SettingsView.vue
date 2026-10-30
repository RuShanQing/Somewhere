<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  api,
  ApiError,
  type BlockedUser,
  type CitySummary,
  type Profile,
  type ReceptionMode,
} from '../../../shared/api/client';
import { toFriendlyAuthMessage } from '../../../shared/api/error-message';
import { formatDateTime } from '../../../shared/format/postcard';
import PageHeader from '../../../shared/ui/PageHeader.vue';
import { useAuthStore } from '../../../shared/stores/auth';

interface SettingsForm {
  nickname: string;
  cityId: string;
  receptionMode: ReceptionMode;
}

const RECEPTION_OPTIONS: ReadonlyArray<{
  value: ReceptionMode;
  label: string;
  hint: string;
}> = [
  { value: 'OPEN', label: '愿意接新信', hint: '仍受安全规则与频率限制。' },
  { value: 'RESTING', label: '休息中', hint: '暂不参与新的相遇；已经在途的信照常送达。' },
  { value: 'CLOSED', label: '关闭', hint: '拒绝新的陌生人通信；已有记忆不受影响。' },
];

const auth = useAuthStore();
const router = useRouter();

const form = reactive<SettingsForm>({ nickname: '', cityId: '', receptionMode: 'OPEN' });
const profile = ref<Profile | null>(null);
const cities = ref<CitySummary[]>([]);
const isLoading = ref(true);
const isSaving = ref(false);
const loadError = ref<string | null>(null);
const saveError = ref<string | null>(null);
const savedMessage = ref<string | null>(null);
const blockedUsers = ref<BlockedUser[]>([]);
const unblockPendingId = ref<string | null>(null);
const blockError = ref<string | null>(null);
const blockNotice = ref<string | null>(null);

const cityHint = computed(() =>
  form.cityId
    ? '只使用城市中心点计算距离，不保存住址或实时位置。'
    : '可以暂时不设置城市；寄信前需要补充。',
);

async function handleUnauthorized(error: unknown): Promise<boolean> {
  if (error instanceof ApiError && error.status === 401) {
    await router.replace({ name: 'login', query: { redirect: '/settings' } });
    return true;
  }
  return false;
}

async function loadSettings(): Promise<void> {
  isLoading.value = true;
  loadError.value = null;
  try {
    const [currentProfile, cityList, blocked] = await Promise.all([
      api.profileMe(),
      api.cities(),
      api.blockedUsers(),
    ]);
    profile.value = currentProfile;
    cities.value = cityList;
    blockedUsers.value = blocked.items;
    form.nickname = currentProfile.nickname;
    form.cityId = currentProfile.city?.id ?? '';
    form.receptionMode = currentProfile.receptionMode;
  } catch (error) {
    if (await handleUnauthorized(error)) {
      return;
    }
    loadError.value = toFriendlyAuthMessage(error);
  } finally {
    isLoading.value = false;
  }
}

async function saveSettings(): Promise<void> {
  if (isSaving.value) {
    return;
  }
  saveError.value = null;
  savedMessage.value = null;

  const nickname = form.nickname.trim();
  if (nickname.length < 1 || nickname.length > 32) {
    saveError.value = '昵称需要 1–32 个字符。';
    return;
  }

  isSaving.value = true;
  try {
    const updated = await api.updateProfile({
      nickname,
      cityId: form.cityId === '' ? null : form.cityId,
      receptionMode: form.receptionMode,
    });
    profile.value = updated;
    form.nickname = updated.nickname;
    form.cityId = updated.city?.id ?? '';
    form.receptionMode = updated.receptionMode;
    auth.setNickname(updated.nickname);
    savedMessage.value = '已保存。下次抵达这里时，它还会在。';
  } catch (error) {
    if (await handleUnauthorized(error)) {
      return;
    }
    saveError.value = toFriendlyAuthMessage(error);
  } finally {
    isSaving.value = false;
  }
}

async function unblock(userId: string): Promise<void> {
  if (unblockPendingId.value) {
    return;
  }
  unblockPendingId.value = userId;
  blockError.value = null;
  blockNotice.value = null;
  try {
    await api.unblockUser(userId);
    blockedUsers.value = blockedUsers.value.filter((item) => item.userId !== userId);
    blockNotice.value = '已解除封锁。新的通信可以按原有许可恢复。';
  } catch (error) {
    if (await handleUnauthorized(error)) {
      return;
    }
    blockError.value = toFriendlyAuthMessage(error);
  } finally {
    unblockPendingId.value = null;
  }
}

onMounted(loadSettings);
</script>

<template>
  <div class="page page-narrow">
    <PageHeader
      eyebrow="设置"
      title="让别人知道怎样找到你"
      description="这里只收集城市级信息。你的邮箱不会展示给其他用户，城市也不会精确到住址。"
    />

    <p v-if="isLoading" class="form-status" role="status">正在读取你的资料…</p>

    <div v-else-if="loadError" class="section-card">
      <p class="form-alert" role="alert">{{ loadError }}</p>
      <button class="button button-quiet" type="button" @click="loadSettings">重新读取</button>
    </div>

    <form v-else class="section-card settings-form" novalidate @submit.prevent="saveSettings">
      <div class="form-field">
        <label for="settings-nickname">昵称</label>
        <input
          id="settings-nickname"
          v-model="form.nickname"
          type="text"
          name="nickname"
          autocomplete="nickname"
          maxlength="32"
          required
        />
        <p class="field-hint">1–32 个字符，会显示在你写下的内容旁。</p>
      </div>

      <div class="form-field">
        <label for="settings-city">城市</label>
        <select id="settings-city" v-model="form.cityId" name="city">
          <option value="">不设置城市</option>
          <option v-for="city in cities" :key="city.id" :value="city.id">
            {{ city.name }} · {{ city.countryCode }}
          </option>
        </select>
        <p class="field-hint">{{ cityHint }}</p>
      </div>

      <fieldset class="reception-fieldset">
        <legend>接信状态</legend>
        <p class="field-hint">这只影响新的陌生人通信，不会清除已经发生的共途或记忆。</p>
        <div class="radio-group">
          <label v-for="option in RECEPTION_OPTIONS" :key="option.value" class="radio-option">
            <input v-model="form.receptionMode" type="radio" name="receptionMode" :value="option.value" />
            <span>
              <strong>{{ option.label }}</strong>
              <span class="radio-hint">{{ option.hint }}</span>
            </span>
          </label>
        </div>
      </fieldset>

      <p v-if="saveError" class="form-alert" role="alert">{{ saveError }}</p>
      <p v-if="savedMessage" class="form-success" role="status">{{ savedMessage }}</p>

      <div class="form-actions">
        <button class="button" type="submit" :disabled="isSaving">
          {{ isSaving ? '正在保存…' : '保存设置' }}
        </button>
        <span v-if="profile" class="field-hint">当前昵称：{{ profile.nickname }}</span>
      </div>
    </form>

    <section
      v-if="!isLoading && !loadError"
      class="section-card safety-actions"
      aria-labelledby="settings-blocked-title"
    >
      <h2 id="settings-blocked-title">已封锁的用户</h2>
      <p class="field-hint">
        封锁会停止双方新的通信，但不会删除已经送达的信件或共同经历。解除后，新的通信可以按原有许可恢复。
      </p>

      <p v-if="blockNotice" class="form-success" role="status">{{ blockNotice }}</p>
      <p v-if="blockError" class="form-alert" role="alert">{{ blockError }}</p>

      <ul v-if="blockedUsers.length > 0" class="blocked-user-list">
        <li v-for="user in blockedUsers" :key="user.userId" class="blocked-user-item">
          <div>
            <strong>{{ user.nickname }}</strong>
            <span class="field-hint">封锁于 {{ formatDateTime(user.blockedAt) }}</span>
          </div>
          <button
            class="button button-quiet"
            type="button"
            :disabled="unblockPendingId === user.userId"
            @click="unblock(user.userId)"
          >
            {{ unblockPendingId === user.userId ? '正在解除…' : '解除封锁' }}
          </button>
        </li>
      </ul>

      <p v-else class="empty-description">还没有封锁任何用户。</p>
    </section>
  </div>
</template>
