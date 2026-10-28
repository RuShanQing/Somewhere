import { expect, request as playwrightRequest, test } from '@playwright/test';
import { API_URL, capture, loginViaUi, registerViaUi, sessionCookieFrom, uniqueEmail } from './support';

test('SMOKE-01 再次登录后旧会话立即失效', async ({ page }) => {
  const email = uniqueEmail('rotate');
  await registerViaUi(page, { email, nickname: '会话轮换' });
  const oldCookie = sessionCookieFrom(await page.context().cookies());

  // 模拟换一台设备：清除浏览器 Cookie 后重新登录
  await page.context().clearCookies();
  await loginViaUi(page, email);
  await expect(page).toHaveURL(/\/post-office$/);
  await expect(page.getByText('会话轮换')).toBeVisible();

  const newCookie = sessionCookieFrom(await page.context().cookies());
  expect(newCookie.value).not.toBe(oldCookie.value);

  const current = await page.request.get(`${API_URL}/api/v1/auth/me`);
  expect(current.status()).toBe(200);
  expect(((await current.json()) as { email: string }).email).toBe(email);

  const replayContext = await playwrightRequest.newContext();
  const replay = await replayContext.get(`${API_URL}/api/v1/auth/me`, {
    headers: { cookie: `sw_session=${oldCookie.value}` },
  });
  expect(replay.status()).toBe(401);
  await replayContext.dispose();

  await capture(page, 'login-rotation-post-office');
});
