<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { safeRedirectTarget } from '../../../app/redirect';
import { toFriendlyAuthMessage } from '../../../shared/api/error-message';
import AuthPageShell from '../components/AuthPageShell.vue';
import { useAuthStore } from '../../../shared/stores/auth';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

const form = reactive({
  email: '',
  nickname: '',
  password: '',
  adultConfirmed: false,
});
const fieldErrors = reactive<Record<'email' | 'nickname' | 'password' | 'adultConfirmed', string | null>>({
  email: null,
  nickname: null,
  password: null,
  adultConfirmed: null,
});
const submitError = ref<string | null>(null);
const isSubmitting = ref(false);

function validate(): boolean {
  fieldErrors.email = form.email.trim().length === 0 ? '请填写邮箱。' : null;
  fieldErrors.nickname = form.nickname.trim().length === 0 ? '请给自己取一个昵称。' : null;
  fieldErrors.password = form.password.length < 12 ? '密码至少需要 12 个字符。' : null;
  fieldErrors.adultConfirmed = form.adultConfirmed ? null : '需要确认已满 18 岁才能注册。';
  return Object.values(fieldErrors).every((message) => message === null);
}

async function handleSubmit(): Promise<void> {
  if (isSubmitting.value) {
    return;
  }
  submitError.value = null;
  if (!validate()) {
    return;
  }

  isSubmitting.value = true;
  try {
    await auth.register({
      email: form.email.trim(),
      nickname: form.nickname.trim(),
      password: form.password,
      adultConfirmed: form.adultConfirmed,
    });
    await router.replace(safeRedirectTarget(route.query.redirect));
  } catch (error) {
    submitError.value = toFriendlyAuthMessage(error);
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <AuthPageShell
    title="写第一封信之前"
    subtitle="创建一个只属于你的账号。邮箱不会展示给其他人，密码只以不可逆哈希形式保存。"
  >
    <form class="auth-form" novalidate @submit.prevent="handleSubmit">
      <div class="form-field">
        <label for="register-email">邮箱</label>
        <input
          id="register-email"
          v-model="form.email"
          type="email"
          name="email"
          autocomplete="email"
          inputmode="email"
          required
          :aria-invalid="fieldErrors.email !== null"
          :aria-describedby="fieldErrors.email ? 'register-email-error' : undefined"
        />
        <p v-if="fieldErrors.email" id="register-email-error" class="field-error">{{ fieldErrors.email }}</p>
      </div>

      <div class="form-field">
        <label for="register-nickname">昵称</label>
        <input
          id="register-nickname"
          v-model="form.nickname"
          type="text"
          name="nickname"
          autocomplete="nickname"
          maxlength="32"
          required
          :aria-invalid="fieldErrors.nickname !== null"
          :aria-describedby="fieldErrors.nickname ? 'register-nickname-error' : 'register-nickname-hint'"
        />
        <p id="register-nickname-hint" class="field-hint">1–32 个字符，会显示在你自己写下的内容旁。</p>
        <p v-if="fieldErrors.nickname" id="register-nickname-error" class="field-error">
          {{ fieldErrors.nickname }}
        </p>
      </div>

      <div class="form-field">
        <label for="register-password">密码</label>
        <input
          id="register-password"
          v-model="form.password"
          type="password"
          name="password"
          autocomplete="new-password"
          minlength="12"
          maxlength="256"
          required
          :aria-invalid="fieldErrors.password !== null"
          :aria-describedby="fieldErrors.password ? 'register-password-error' : 'register-password-hint'"
        />
        <p id="register-password-hint" class="field-hint">至少 12 个字符，可以使用一句较长的暗号。</p>
        <p v-if="fieldErrors.password" id="register-password-error" class="field-error">
          {{ fieldErrors.password }}
        </p>
      </div>

      <div class="form-check">
        <input
          id="register-adult"
          v-model="form.adultConfirmed"
          type="checkbox"
          name="adultConfirmed"
          :aria-invalid="fieldErrors.adultConfirmed !== null"
          :aria-describedby="fieldErrors.adultConfirmed ? 'register-adult-error' : undefined"
        />
        <label for="register-adult">我已年满 18 岁，并理解这是一段慢一点的通信。</label>
      </div>
      <p v-if="fieldErrors.adultConfirmed" id="register-adult-error" class="field-error">
        {{ fieldErrors.adultConfirmed }}
      </p>

      <p v-if="submitError" class="form-alert" role="alert">{{ submitError }}</p>

      <button class="button button-block" type="submit" :disabled="isSubmitting">
        {{ isSubmitting ? '正在创建…' : '创建账号' }}
      </button>
    </form>

    <template #footer>
      已经有账号？
      <RouterLink :to="{ name: 'login', query: route.query }">去登录</RouterLink>
    </template>
  </AuthPageShell>
</template>
