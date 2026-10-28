export const DEFAULT_AUTHENTICATED_PATH = '/post-office';
export const LOGIN_PATH = '/auth/login';

const SAFE_PATH_PATTERN = /^\/[A-Za-z0-9\-._~!$&'()*+,;=:@%/?#[\]]*$/;

/**
 * 只接受站内绝对路径，防止 `redirect` 参数被用成开放跳转。
 * 认证页面自身不作为回跳目标，避免登录后的循环。
 */
export function safeRedirectTarget(value: unknown): string {
  if (typeof value !== 'string' || value.length > 512) {
    return DEFAULT_AUTHENTICATED_PATH;
  }
  if (!SAFE_PATH_PATTERN.test(value) || value.startsWith('//') || value.startsWith('/\\')) {
    return DEFAULT_AUTHENTICATED_PATH;
  }
  if (value === '/auth' || value.startsWith('/auth/')) {
    return DEFAULT_AUTHENTICATED_PATH;
  }
  return value;
}
