import { expect, request as playwrightRequest, test } from '@playwright/test';
import {
  API_URL,
  E2E_PASSWORD,
  capture,
  loginViaUi,
  registerViaUi,
  sessionCookieFrom,
  uniqueEmail,
} from './support';

test('SMOKE-01 注册 → 会话保持 → 四导航 → 退出闭环', async ({ page }) => {
  const email = uniqueEmail('journey');
  const nickname = '端到端旅人';

  await registerViaUi(page, { email, nickname });
  await expect(page.getByRole('heading', { level: 1 })).toContainText('你的信，会按距离慢慢抵达');
  await expect(page.getByText('还没有新来信')).toBeVisible();
  await expect(page.getByText('已登录')).toBeVisible();
  await capture(page, 'register-success-post-office');

  // 浏览器同源请求共享 Cookie：/auth/me 返回的必须是刚注册的人
  const me = await page.request.get(`${API_URL}/api/v1/auth/me`);
  expect(me.status()).toBe(200);
  const meBody = (await me.json()) as { id: string; email: string; nickname: string; emailVerified: boolean };
  expect(meBody.email).toBe(email);
  expect(meBody.nickname).toBe(nickname);
  expect(meBody.emailVerified).toBe(false);
  expect(Object.keys(meBody)).not.toContain('passwordHash');

  // 前端不把会话或密码写进浏览器存储
  const storageKeys = await page.evaluate(() => ({
    local: Object.keys(window.localStorage),
    session: Object.keys(window.sessionStorage),
  }));
  expect(storageKeys.local).toHaveLength(0);
  expect(storageKeys.session).toHaveLength(0);
  expect(page.url()).not.toContain('sw_session');
  expect(page.url()).not.toContain('token');

  // 刷新后会话仍属于本人
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('你的信，会按距离慢慢抵达');
  await expect(page.getByText(nickname)).toBeVisible();
  const meAfterReload = await page.request.get(`${API_URL}/api/v1/auth/me`);
  expect(meAfterReload.status()).toBe(200);
  expect(((await meAfterReload.json()) as { email: string }).email).toBe(email);

  // Cookie 属性：HttpOnly，不暴露给脚本
  const sessionCookie = sessionCookieFrom(await page.context().cookies());
  expect(sessionCookie.httpOnly).toBe(true);
  expect(sessionCookie.sameSite).toBe('Lax');
  const cookieAfterLogout = await playwrightRequest.newContext();

  // 四个主导航逐一切换
  for (const [label, path, heading] of [
    ['发现', '/discover', '看看别人生活的城市'],
    ['共途', '/passages', '一起走过的路，可以停泊'],
    ['纪念册', '/memories', '把共同的时间收好'],
    ['邮局', '/post-office', '你的信，会按距离慢慢抵达'],
  ] as const) {
    await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: new RegExp(label) }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole('heading', { level: 1 })).toContainText(heading);
  }

  // 退出：服务端撤销，旧 Cookie 直接访问 API 也必须 401
  await page.getByRole('button', { name: '退出' }).click();
  await expect(page).toHaveURL(/\/auth\/login$/);
  expect((await page.request.get(`${API_URL}/api/v1/auth/me`)).status()).toBe(401);

  const replay = await cookieAfterLogout.get(`${API_URL}/api/v1/auth/me`, {
    headers: { cookie: `sw_session=${sessionCookie.value}` },
  });
  expect(replay.status()).toBe(401);
  await cookieAfterLogout.dispose();

  // 刷新受保护页面回到登录
  await page.goto('/passages');
  await expect(page).toHaveURL(/\/auth\/login\?redirect=(%2F|\/)passages/);
});

test('SMOKE-01 错误密码与不存在的账号给出相同提示', async ({ page }) => {
  const email = uniqueEmail('credential');
  await registerViaUi(page, { email, nickname: '凭据检查' });
  await page.getByRole('button', { name: '退出' }).click();

  await loginViaUi(page, email, 'definitely-wrong-passphrase');
  const wrongPasswordAlert = page.getByRole('alert');
  await expect(wrongPasswordAlert).toHaveText('邮箱或密码不正确。');
  const wrongPasswordText = await wrongPasswordAlert.textContent();

  await loginViaUi(page, uniqueEmail('nobody'), 'definitely-wrong-passphrase');
  await expect(page.getByRole('alert')).toHaveText(wrongPasswordText ?? '');
  await expect(page.getByRole('alert')).not.toContainText('@example.test');
});

test('SMOKE-01 注册输入校验：短密码与未确认成年', async ({ page }) => {
  await page.goto('/auth/register');
  await page.getByLabel('邮箱').fill(uniqueEmail('invalid'));
  await page.getByLabel('昵称').fill('不合规的注册');
  await page.getByLabel('密码').fill('too-short');
  await page.getByRole('button', { name: '创建账号' }).click();

  await expect(page.getByText('密码至少需要 12 个字符。')).toBeVisible();
  await expect(page.getByText('需要确认已满 18 岁才能注册。')).toBeVisible();
  await expect(page).toHaveURL(/\/auth\/register$/);

  const me = await page.request.get(`${API_URL}/api/v1/auth/me`);
  expect(me.status()).toBe(401);
});

test('未登录访问私人页面被引导登录，登录后回到原目标', async ({ page }) => {
  const email = uniqueEmail('redirect');
  await registerViaUi(page, { email, nickname: '回跳旅人' });
  await page.getByRole('button', { name: '退出' }).click();
  await expect(page).toHaveURL(/\/auth\/login$/);

  await page.goto('/memories');
  await expect(page).toHaveURL(/\/auth\/login\?redirect=(%2F|\/)memories/);
  await page.getByLabel('邮箱').fill(email);
  await page.getByLabel('密码').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: '登录' }).click();
  await expect(page).toHaveURL(/\/memories$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('把共同的时间收好');
});
