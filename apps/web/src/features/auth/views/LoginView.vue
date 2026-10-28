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

const form = reactive({ email: '', password: '' });
const fieldErrors = reactive<{ email: string | null; password: string | null }>({ email: null, password: null });
const submitError = ref<string | null>(null);
const isSubmitting = ref(false);

function validate(): boolean {
  fieldErrors.email = form.email.trim().length === 0 ? '请填写注册时使用的邮箱。' : null;
  fieldErrors.password = form.password.length === 0 ? '请填写密码。' : null;
  return fieldErrors.email === null && fieldErrors.password === null;
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
    await auth.login({ email: form.email.trim(), password: form.password });
    await router.replace(safeRedirectTarget(route.query.redirect));
  } catch (error) {
    submitError.value = toFriendlyAuthMessage(error);
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <AuthPageShell title="欢迎回来" subtitle="用你的邮箱和密码继续这段慢一点的旅程。">
    <p v-if="auth.sessionError" class="form-alert" role="alert">{{ auth.sessionError }}</p>

    <form class="auth-form" novalidate @submit.prevent="handleSubmit">
      <div class="form-field">
        <label for="login-email">邮箱</label>
        <input
          id="login-email"
          v-model="form.email"
          type="email"
          name="email"
          autocomplete="email"
          inputmode="email"
          required
          :aria-invalid="fieldErrors.email !== null"
          :aria-describedby="fieldErrors.email ? 'login-email-error' : undefined"
        />
        <p v-if="fieldErrors.email" id="login-email-error" class="field-error">{{ fieldErrors.email }}</p>
      </div>

      <div class="form-field">
        <label for="login-password">密码</label>
        <input
          id="login-password"
          v-model="form.password"
          type="password"
          name="password"
          autocomplete="current-password"
          required
          :aria-invalid="fieldErrors.password !== null"
          :aria-describedby="fieldErrors.password ? 'login-password-error' : undefined"
        />
        <p v-if="fieldErrors.password" id="login-password-error" class="field-error">{{ fieldErrors.password }}</p>
      </div>

      <p v-if="submitError" class="form-alert" role="alert">{{ submitError }}</p>

      <button class="button button-block" type="submit" :disabled="isSubmitting">
        {{ isSubmitting ? '正在登录…' : '登录' }}
      </button>
    </form>

    <template #footer>
      还没有账号？
      <RouterLink :to="{ name: 'register', query: route.query }">创建一个</RouterLink>
    </template>
  </AuthPageShell>
</template>
