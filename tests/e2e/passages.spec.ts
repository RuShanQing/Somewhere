import { expect, test } from '@playwright/test';
import {
  capture,
  loginViaUi,
  registerViaUi,
  seedPassageForEmails,
  uniqueEmail,
} from './support';

const TOPIC = '海边的冬天';

test('PASSAGE AC-03～07 共途列表、停泊、续程、完成与归档闭环', async ({ page }) => {
  const emailA = uniqueEmail('passage-a');
  const emailB = uniqueEmail('passage-b');

  await registerViaUi(page, { email: emailA, nickname: '写信的甲' });
  await page.getByRole('button', { name: '退出' }).click();
  await expect(page).toHaveURL(/\/auth\/login$/);

  await registerViaUi(page, { email: emailB, nickname: '收信的乙' });
  await page.getByRole('button', { name: '退出' }).click();
  await expect(page).toHaveURL(/\/auth\/login$/);

  seedPassageForEmails({ emailA, emailB, topic: TOPIC });

  await loginViaUi(page, emailA);
  await expect(page).toHaveURL(/\/post-office$/);
  await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: /共途/ }).click();
  await expect(page).toHaveURL(/\/passages$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('一起走过的路，可以停泊');

  const card = page.getByRole('link', { name: new RegExp(TOPIC) });
  await expect(card).toBeVisible();
  await capture(page, 'passage-list-active');
  await card.click();
  await expect(page).toHaveURL(/\/passages\/[0-9a-f-]+$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(TOPIC);
  await expect(page.getByText('你的状态：可以继续')).toBeVisible();
  await expect(page.getByText('现在可以继续这段共途的通信。')).toBeVisible();

  const pauseButton = page.getByRole('button', { name: '停泊' });
  await pauseButton.focus();
  await expect(pauseButton).toBeFocused();
  await pauseButton.click();
  await expect(page.getByText('你的状态：已停泊')).toBeVisible();
  await expect(page.getByText('已停泊。对方无法替你续程。')).toBeVisible();
  await expect(page.getByText('现在不能开始新的共途通信。')).toBeVisible();
  await capture(page, 'passage-paused');

  await page.reload();
  await expect(page.getByText('你的状态：已停泊')).toBeVisible();
  await expect(page.getByRole('button', { name: '续程' })).toBeVisible();

  await page.getByRole('button', { name: '退出' }).click();
  await loginViaUi(page, emailB);
  await expect(page).toHaveURL(/\/post-office$/);
  await page.goto('/passages');
  await expect(page.getByRole('link', { name: new RegExp(TOPIC) })).toBeVisible();
  await page.getByRole('link', { name: new RegExp(TOPIC) }).click();
  await expect(page.getByText('对方状态：已停泊')).toBeVisible();
  await expect(page.getByText('现在不能开始新的共途通信。')).toBeVisible();
  await expect(page.getByRole('button', { name: '续程' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: '写一张明信片' })).toHaveCount(0);
  await capture(page, 'passage-counterpart-paused');

  await page.getByRole('button', { name: '退出' }).click();
  await loginViaUi(page, emailA);
  await expect(page).toHaveURL(/\/post-office$/);
  await page.goto('/passages');
  await page.getByRole('link', { name: new RegExp(TOPIC) }).click();
  await page.getByRole('button', { name: '续程' }).click();
  await expect(page.getByText('你的状态：可以继续')).toBeVisible();

  const composeLink = page.getByRole('link', { name: '写一张明信片' });
  await expect(composeLink).toBeVisible();
  await composeLink.click();
  await expect(page).toHaveURL(/\/post-office\/compose\?passageId=/);
  await expect(page.getByText(`这段共途 · ${TOPIC}`)).toBeVisible();
  await page.getByRole('link', { name: '返回共途' }).click();
  await expect(page).toHaveURL(/\/passages\/[0-9a-f-]+$/);

  await page.getByRole('button', { name: '完成这段共途' }).click();
  await expect(page.locator('.passage-status-badge')).toContainText('已完成');
  await expect(page.getByRole('link', { name: '写一张明信片' })).toHaveCount(0);
  await expect(page.getByText('这段共途已完成，不会自动成为信友。')).toBeVisible();

  await page.getByRole('button', { name: '归档这段共途' }).click();
  await expect(page.locator('.passage-status-badge')).toContainText('已归档');
  await capture(page, 'passage-archived');

  await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: /共途/ }).click();
  await expect(page.getByText('还没有正在进行的共途')).toBeVisible();
  await expect(page.getByRole('heading', { name: '已归档' })).toBeVisible();
  await expect(page.getByRole('link', { name: new RegExp(TOPIC) })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('link', { name: new RegExp(TOPIC) }).click();
  const layout = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.innerWidth + 1);
  await capture(page, 'passage-mobile');
});
