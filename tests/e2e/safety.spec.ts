import { expect, test } from '@playwright/test';
import {
  capture,
  chooseFirstCityAndSave,
  loginViaUi,
  registerViaUi,
  seedPassageForEmails,
  uniqueEmail,
} from './support';

test('SAFETY AC-05 封锁共途对方、停止写信入口并在设置中解除', async ({ page }) => {
  const emailA = uniqueEmail('safety-a');
  const emailB = uniqueEmail('safety-b');
  const nicknameA = '封锁测试甲';
  const nicknameB = '封锁测试乙';

  await registerViaUi(page, { email: emailA, nickname: nicknameA });
  await page.getByRole('link', { name: '设置' }).click();
  await chooseFirstCityAndSave(page);
  await page.getByRole('button', { name: '退出' }).click();
  await expect(page).toHaveURL(/\/auth\/login$/);

  await registerViaUi(page, { email: emailB, nickname: nicknameB });
  await page.getByRole('link', { name: '设置' }).click();
  await chooseFirstCityAndSave(page);
  await page.getByRole('button', { name: '退出' }).click();
  await expect(page).toHaveURL(/\/auth\/login$/);

  const passageId = seedPassageForEmails({
    emailA,
    emailB,
    topic: '封锁测试共途',
  });

  await loginViaUi(page, emailA);
  await expect(page).toHaveURL(/\/post-office$/);

  await page.goto(`/passages/${passageId}`);
  await page.getByRole('link', { name: '写一张明信片' }).click();
  await expect(page.getByLabel('收件人')).toBeDisabled();
  await page.getByLabel('正文').fill('封锁前写下的一封信。');
  await page.getByRole('button', { name: '寄出这张明信片' }).click();
  await page.getByRole('button', { name: '确认寄出' }).click();
  await expect(page).toHaveURL(/\/postcards\/[0-9a-f-]+$/);

  await page.getByRole('button', { name: '封锁这位用户' }).click();
  await page.getByRole('button', { name: '确认封锁' }).click();
  await expect(page.getByText('你已封锁这位用户。', { exact: false })).toBeVisible();
  await capture(page, 'safety-blocked');

  await page.goto(`/passages/${passageId}`);
  await expect(page.getByRole('link', { name: '写一张明信片' })).toHaveCount(0);
  await expect(page.getByText('你已封锁对方。')).toBeVisible();

  await page.getByRole('link', { name: '设置', exact: true }).click();
  await expect(page.getByRole('heading', { name: '已封锁的用户' })).toBeVisible();
  await expect(page.getByText(nicknameB)).toBeVisible();
  await page.getByRole('button', { name: '解除封锁' }).click();
  await expect(page.locator('.form-success')).toContainText('已解除封锁');

  await page.goto(`/passages/${passageId}`);
  await expect(page.getByRole('link', { name: '写一张明信片' })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('link', { name: '设置', exact: true }).click();
  const layout = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.innerWidth + 1);
});
