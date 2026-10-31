import { expect, test } from '@playwright/test';
import {
  advancePostcardDelivery,
  capture,
  chooseFirstCityAndSave,
  loginViaUi,
  registerViaUi,
  seedPassageForEmails,
  uniqueEmail,
} from './support';

test('REPLY AC-06 收件人回信、送达对方并在移动端可读', async ({ page }) => {
  const emailA = uniqueEmail('reply-a');
  const emailB = uniqueEmail('reply-b');
  const nicknameA = '回信测试甲';
  const nicknameB = '回信测试乙';

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
    topic: '回信测试共途',
  });

  await loginViaUi(page, emailA);
  await expect(page).toHaveURL(/\/post-office$/);
  await page.goto(`/passages/${passageId}`);
  await page.getByRole('link', { name: '写一张明信片' }).click();
  await page.getByLabel('正文').fill('这是回信流程里的原信。');
  await page.getByRole('button', { name: '寄出这张明信片' }).click();
  await page.getByRole('button', { name: '确认寄出' }).click();
  await expect(page).toHaveURL(/\/postcards\/[0-9a-f-]+$/);

  const originalUrl = page.url();
  const originalId = originalUrl.split('/').pop();
  if (!originalId) {
    throw new Error('寄出后没有拿到明信片 ID');
  }

  await expect(page.getByRole('link', { name: '回信', exact: true })).toHaveCount(0);

  advancePostcardDelivery(originalId);
  await page.reload();
  await expect(page.getByText('已抵达')).toBeVisible();
  await expect(page.getByRole('link', { name: '回信', exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: '退出' }).click();
  await expect(page).toHaveURL(/\/auth\/login$/);

  await loginViaUi(page, emailB);
  await expect(page).toHaveURL(/\/post-office$/);
  await page.goto(`/postcards/${originalId}`);
  await expect(page.getByText('已抵达')).toBeVisible();
  await page.getByRole('link', { name: '回信', exact: true }).click();

  await expect(page).toHaveURL(
    new RegExp(`/post-office/compose\\?replyToPostcardId=${originalId}$`),
  );
  await expect(page.getByLabel('收件人')).toBeDisabled();
  await expect(page.getByText(`回复 ${nicknameA} 的明信片`)).toBeVisible();
  await expect(page.getByText('回信测试共途')).toBeVisible();

  await page.getByLabel('正文').fill('这是慢慢抵达的回信。');
  await page.getByRole('button', { name: '寄出这张明信片' }).click();
  await page.getByRole('button', { name: '确认寄出' }).click();
  await expect(page).toHaveURL(/\/postcards\/[0-9a-f-]+$/);

  const replyUrl = page.url();
  const replyId = replyUrl.split('/').pop();
  if (!replyId) {
    throw new Error('回信寄出后没有拿到明信片 ID');
  }

  advancePostcardDelivery(replyId);
  await page.getByRole('button', { name: '退出' }).click();
  await expect(page).toHaveURL(/\/auth\/login$/);

  await loginViaUi(page, emailA);
  await expect(page).toHaveURL(/\/post-office$/);
  await page.goto(`/postcards/${replyId}`);
  await expect(page.getByText('这是慢慢抵达的回信。')).toBeVisible();
  await expect(page.getByText('已抵达')).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  const layout = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.innerWidth + 1);
  await capture(page, 'reply-delivered');

  await page.goto('/memories');
  await expect(page).toHaveURL(/\/memories$/);
  await expect(page.getByText('回信测试共途')).toBeVisible();
  await expect(page.getByText('这是慢慢抵达的回信。')).toHaveCount(0);

  await page.getByRole('link', { name: '打开这一页' }).first().click();
  await expect(page).toHaveURL(/\/memories\/diaries\/[0-9a-f-]+$/);
  await expect(page.getByText('这是回信流程里的原信。')).toBeVisible();
  await expect(page.getByText('这是慢慢抵达的回信。')).toBeVisible();
  await expect(page.getByRole('link', { name: /分享|导出/ })).toHaveCount(0);

  const diaryLayout = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(diaryLayout.scrollWidth).toBeLessThanOrEqual(diaryLayout.innerWidth + 1);
  await capture(page, 'diary-page');
});
