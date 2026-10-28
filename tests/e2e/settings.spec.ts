import { expect, test } from '@playwright/test';
import { API_URL, capture, registerViaUi, uniqueEmail } from './support';

test('PROFILE-06 设置页保存昵称/城市/接信状态并在刷新后保持', async ({ page }) => {
  const email = uniqueEmail('settings');
  await registerViaUi(page, { email, nickname: '设置旅人' });

  await page.getByRole('link', { name: '设置' }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('让别人知道怎样找到你');

  // 键盘顺序：昵称 → 城市
  await page.getByLabel('昵称').focus();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('城市')).toBeFocused();

  const citySelect = page.getByLabel('城市');
  const cityOption = citySelect.locator('option').nth(1);
  const cityValue = await cityOption.getAttribute('value');
  expect(cityValue).toBeTruthy();

  await citySelect.selectOption(cityValue ?? '');
  await page.getByLabel('昵称').fill('新的设置昵称');
  await page.getByRole('radio', { name: /休息中/ }).check();
  await page.getByRole('button', { name: '保存设置' }).click();

  await expect(page.getByRole('status')).toContainText('已保存');
  await expect(page.locator('.account-name')).toContainText('新的设置昵称');

  const profileResponse = await page.request.get(`${API_URL}/api/v1/profile/me`);
  expect(profileResponse.status()).toBe(200);
  const profile = (await profileResponse.json()) as {
    nickname: string;
    city: { id: string } | null;
    receptionMode: string;
  };
  expect(profile.nickname).toBe('新的设置昵称');
  expect(profile.city?.id).toBe(cityValue);
  expect(profile.receptionMode).toBe('RESTING');

  // 刷新后仍显示已保存值
  await page.reload();
  await expect(page.getByLabel('昵称')).toHaveValue('新的设置昵称');
  await expect(page.getByLabel('城市')).toHaveValue(cityValue ?? '');
  await expect(page.getByRole('radio', { name: /休息中/ })).toBeChecked();
  await expect(page.locator('.account-name')).toContainText('新的设置昵称');
  await capture(page, 'settings-saved');
});

test('PROFILE-06 未登录访问设置页跳转登录并保留回跳目标', async ({ page }) => {
  await page.goto('/settings');
  await expect(page).toHaveURL(/\/auth\/login\?redirect=(%2F|\/)settings/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('欢迎回来');
});

test('PROFILE-06 设置页在 390px 宽度可用且不横向溢出', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await registerViaUi(page, { email: uniqueEmail('settings-mobile'), nickname: '移动设置' });

  await page.getByRole('link', { name: '设置' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('让别人知道怎样找到你');
  await expect(page.getByLabel('昵称')).toBeVisible();
  await expect(page.getByLabel('城市')).toBeVisible();
  await expect(page.getByRole('button', { name: '保存设置' })).toBeVisible();

  const layout = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.innerWidth + 1);
  await capture(page, 'settings-mobile');
});
