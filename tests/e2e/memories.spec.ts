import { expect, test } from '@playwright/test';
import { capture, registerViaUi, uniqueEmail } from './support';

test('MEMORY AC-05 个人记忆创建、刷新、编辑、删除与私有隔离', async ({ page }) => {
  const emailA = uniqueEmail('memory-a');
  const emailB = uniqueEmail('memory-b');
  const title = '港口的风';
  const body = '傍晚的港口有一点咸味，远处有人在收帆。';
  const editedTitle = '港口的风（改）';
  const editedBody = '重新整理后的片段：风从海面吹到旧仓库。';

  await registerViaUi(page, { email: emailA, nickname: '记忆测试甲' });
  await page.getByRole('link', { name: '纪念册' }).click();
  await expect(page).toHaveURL(/\/memories$/);
  await expect(page.getByText('把共同的时间收好')).toBeVisible();

  await expect(page.getByText('还没有个人记忆', { exact: true })).toBeVisible();

  await page.getByLabel('标题', { exact: true }).fill(title);
  await page.getByLabel('正文', { exact: true }).fill(body);
  await page.getByRole('button', { name: '保存这段记忆' }).click();
  await expect(page.getByText('已保存这段记忆。')).toBeVisible();
  await expect(page.getByText(title, { exact: true })).toBeVisible();
  await expect(page.getByText(body, { exact: true })).toBeVisible();
  await capture(page, 'memory-created');

  await page.reload();
  await expect(page.getByText(title, { exact: true })).toBeVisible();
  await expect(page.getByText(body, { exact: true })).toBeVisible();

  await page.getByRole('button', { name: '编辑', exact: true }).click();
  await expect(page.getByRole('heading', { name: '编辑这段记忆' })).toBeVisible();
  await page.getByLabel('标题', { exact: true }).fill(editedTitle);
  await page.getByLabel('正文', { exact: true }).fill(editedBody);
  await page.getByRole('button', { name: '保存修改' }).click();
  await expect(page.getByText('已保存修改。')).toBeVisible();
  await expect(page.getByText(editedTitle, { exact: true })).toBeVisible();
  await expect(page.getByText(editedBody, { exact: true })).toBeVisible();
  await capture(page, 'memory-edited');

  await page.setViewportSize({ width: 390, height: 844 });
  const layout = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.innerWidth + 1);

  await page.getByLabel('标题', { exact: true }).focus();
  await expect(page.getByLabel('标题', { exact: true })).toBeFocused();

  await page.getByRole('button', { name: '删除', exact: true }).click();
  await page.getByRole('button', { name: '确认删除' }).click();
  await expect(page.getByText('已删除这段记忆。')).toBeVisible();
  await expect(page.getByText('还没有个人记忆', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: '退出' }).click();
  await expect(page).toHaveURL(/\/auth\/login$/);

  await registerViaUi(page, { email: emailB, nickname: '记忆测试乙' });
  await page.getByRole('link', { name: '纪念册' }).click();
  await expect(page.getByText('还没有个人记忆', { exact: true })).toBeVisible();
  await expect(page.getByText(title, { exact: true })).toHaveCount(0);
  await expect(page.getByText(editedTitle, { exact: true })).toHaveCount(0);
});
