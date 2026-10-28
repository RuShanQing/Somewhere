import { expect, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { TASK_ID } from './task';

export const API_URL = process.env.E2E_API_URL ?? 'http://127.0.0.1:4301';
export const E2E_PASSWORD = 'fictional-e2e-passphrase-01';
export const E2E_DEMO_RECIPIENT_EMAIL =
  process.env.E2E_DEMO_RECIPIENT_EMAIL ?? 'postcard.recipient.e2e@example.test';
export const ARTIFACTS_DIR = resolve(__dirname, `../../artifacts/verification/${TASK_ID}/e2e`);

let sequence = 0;

/** 每次运行使用唯一虚构邮箱，避免复用数据库残留数据。 */
export function uniqueEmail(prefix = 'e2e'): string {
  sequence += 1;
  return `${prefix}.${Date.now()}.${sequence}.${Math.random().toString(36).slice(2, 8)}@example.test`;
}

export async function registerViaUi(
  page: Page,
  options: { email: string; nickname: string; password?: string },
): Promise<void> {
  const password = options.password ?? E2E_PASSWORD;
  await page.goto('/auth/register');
  await page.getByLabel('邮箱').fill(options.email);
  await page.getByLabel('昵称').fill(options.nickname);
  await page.getByLabel('密码').fill(password);
  await page.getByLabel('我已年满 18 岁，并理解这是一段慢一点的通信。').check();
  await page.getByRole('button', { name: '创建账号' }).click();
  await expect(page).toHaveURL(/\/post-office$/);
}

export async function loginViaUi(page: Page, email: string, password = E2E_PASSWORD): Promise<void> {
  await page.goto('/auth/login');
  await page.getByLabel('邮箱').fill(email);
  await page.getByLabel('密码').fill(password);
  await page.getByRole('button', { name: '登录' }).click();
}

export async function capture(page: Page, name: string): Promise<void> {
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  await page.screenshot({ path: resolve(ARTIFACTS_DIR, `${name}.png`), fullPage: true });
}

export function sessionCookieFrom(
  cookies: Array<{ name: string; value: string; httpOnly: boolean; sameSite?: string }>,
): { name: string; value: string; httpOnly: boolean; sameSite?: string } {
  const cookie = cookies.find((item) => item.name === 'sw_session');
  if (!cookie) {
    throw new Error('浏览器中没有会话 Cookie');
  }
  return cookie;
}

/** 在设置页选择城市列表中的第一个城市并保存。 */
export async function chooseFirstCityAndSave(page: Page): Promise<string> {
  const citySelect = page.getByLabel('城市');
  const firstOption = citySelect.locator('option').nth(1);
  const cityId = await firstOption.getAttribute('value');
  if (!cityId) {
    throw new Error('城市目录为空，无法完成设置');
  }
  await citySelect.selectOption(cityId);
  await page.getByRole('button', { name: '保存设置' }).click();
  await expect(page.getByRole('status')).toContainText('已保存');
  return cityId;
}

/**
 * 测试专用时间推进：只允许测试库，把指定明信片设为到期并运行真实 Worker。
 * 不开放任何生产 HTTP 接口，也不修改延迟公式。
 */
export function advancePostcardDelivery(postcardId: string): void {
  const apiRoot = resolve(__dirname, '../../apps/api');
  const testDatabaseUrl = process.env.E2E_TEST_DATABASE_URL;
  if (!testDatabaseUrl) {
    throw new Error('E2E 缺少 E2E_TEST_DATABASE_URL');
  }
  execFileSync('node', ['scripts/test-advance-postcard.mjs', postcardId], {
    cwd: apiRoot,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      TEST_DATABASE_URL: testDatabaseUrl,
      E2E_TEST_DATABASE_URL: testDatabaseUrl,
    },
    stdio: 'pipe',
  });
}
