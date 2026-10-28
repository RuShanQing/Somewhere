import { expect, test } from '@playwright/test';
import {
  advancePostcardDelivery,
  API_URL,
  capture,
  chooseFirstCityAndSave,
  E2E_DEMO_RECIPIENT_EMAIL,
  registerViaUi,
  uniqueEmail,
} from './support';

test('POSTCARD AC-03～06 草稿、寄出、在途保密与送达后阅读', async ({ page }) => {
  const recipientNickname = '远方收件人';
  await registerViaUi(page, {
    email: E2E_DEMO_RECIPIENT_EMAIL,
    nickname: recipientNickname,
  });
  await page.getByRole('link', { name: '设置' }).click();
  await chooseFirstCityAndSave(page);
  await page.getByRole('button', { name: '退出' }).click();
  await expect(page).toHaveURL(/\/auth\/login$/);

  const senderNickname = '写信的人';
  await registerViaUi(page, {
    email: uniqueEmail('postcard-sender'),
    nickname: senderNickname,
  });
  await page.getByRole('link', { name: '设置' }).click();
  await chooseFirstCityAndSave(page);

  await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: /邮局/ }).click();
  await page.getByRole('link', { name: '写一张明信片' }).click();
  await expect(page).toHaveURL(/\/post-office\/compose$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('写一张会慢慢抵达的明信片');

  const recipientsResponse = await page.request.get(`${API_URL}/api/v1/postcards/recipients`);
  expect(recipientsResponse.status()).toBe(200);
  const recipients = (await recipientsResponse.json()) as Array<{
    id: string;
    nickname: string;
    city: { name: string };
  }>;
  const recipient = recipients.find((item) => item.nickname === recipientNickname);
  expect(recipient).toBeTruthy();

  const body = '海风把这句话吹慢了一点。愿你抵达时，正好是一个安静的早晨。';
  await page.getByLabel('收件人').selectOption(recipient?.id ?? '');
  await page.getByLabel('正文').fill(body);
  await page.getByRole('button', { name: '保存草稿' }).click();
  await expect(page.getByRole('status')).toContainText('草稿已保存');
  await expect(page).toHaveURL(/\/post-office\/compose\/[0-9a-f-]+$/);

  await page.reload();
  await expect(page.getByLabel('正文')).toHaveValue(body);
  await expect(page.getByLabel('收件人')).toHaveValue(recipient?.id ?? '');

  await page.getByRole('button', { name: '寄出这张明信片' }).click();
  await expect(page.getByText('寄出后，正文与到达时间都不能再修改。')).toBeVisible();
  await page.getByRole('button', { name: '确认寄出' }).click();

  await expect(page).toHaveURL(/\/postcards\/[0-9a-f-]+$/);
  const postcardId = page.url().split('/').pop() ?? '';
  expect(postcardId).toMatch(/^[0-9a-f-]{36}$/);
  await expect(page.locator('.letter-meta .status-pill')).toHaveText('正在路上');
  await expect(page.locator('.letter-body')).toContainText(body);
  await expect(page.locator('.letter-times')).toContainText('预计抵达');
  await capture(page, 'postcard-in-transit');

  await page.getByRole('button', { name: '退出' }).click();
  await page.goto('/auth/login');
  await page.getByLabel('邮箱').fill(E2E_DEMO_RECIPIENT_EMAIL);
  await page.getByLabel('密码').fill('fictional-e2e-passphrase-01');
  await page.getByRole('button', { name: '登录' }).click();
  await expect(page).toHaveURL(/\/post-office$/);

  await page.goto(`/postcards/${postcardId}`);
  await expect(page.getByText('这封信还没有抵达，或不属于你。')).toBeVisible();
  await expect(page.locator('.letter-body')).toHaveCount(0);

  await page.goto('/post-office');
  await expect(page.getByText('还没有新来信')).toBeVisible();

  advancePostcardDelivery(postcardId);
  await page.reload();
  await expect(page.getByText(`${senderNickname} 的来信`)).toBeVisible();
  await expect(page.getByRole('link', { name: '打开来信' })).toHaveCount(1);
  await page.getByRole('link', { name: '打开来信' }).click();
  await expect(page.locator('.letter-body')).toContainText(body);
  await expect(page.locator('.letter-meta .status-pill')).toHaveText('已抵达');
  await capture(page, 'postcard-delivered');

  // 再扫描一次：不应产生第二封来信，也不改变已送达时间。
  advancePostcardDelivery(postcardId);
  await page.goto('/post-office');
  await expect(page.getByRole('link', { name: '打开来信' })).toHaveCount(1);
});

test('POSTCARD AC-06 写信页在 390px 可用且无横向溢出', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await registerViaUi(page, {
    email: uniqueEmail('postcard-mobile'),
    nickname: '移动写信人',
  });
  await page.getByRole('link', { name: '写一张明信片' }).click();

  await expect(page.getByLabel('收件人')).toBeVisible();
  await expect(page.getByLabel('正文')).toBeVisible();
  await expect(page.getByRole('button', { name: '保存草稿' })).toBeVisible();
  await expect(page.getByRole('button', { name: '寄出这张明信片' })).toBeDisabled();

  const layout = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.innerWidth + 1);
  await capture(page, 'postcard-compose-mobile');
});

test('POSTCARD AC-04 未登录访问明信片详情跳转登录并保留回跳目标', async ({ page }) => {
  const id = '00000000-0000-4000-8000-000000000000';
  await page.goto(`/postcards/${id}`);
  await expect(page).toHaveURL(new RegExp(`/auth/login\\?redirect=(%2F|/)postcards(%2F|/)${id}`));
  await expect(page.getByRole('heading', { level: 1 })).toContainText('欢迎回来');
});
