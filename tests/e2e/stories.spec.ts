import { expect, test } from '@playwright/test';
import {
  capture,
  chooseFirstCityAndSave,
  grantAdmin,
  loginViaUi,
  registerViaUi,
  uniqueEmail,
} from './support';

const STORY_TITLE = '雨夜书店的灯';
const STORY_BODY = '雨落在旧书店的玻璃上，店里的人都没有说话，只有翻页的声音。';

test('STORY AC-02～06 草稿、审核、公开故事站与撤回闭环', async ({ page }) => {
  page.on('dialog', (dialog) => dialog.accept());
  const authorEmail = uniqueEmail('story-author');
  const authorNickname = '写故事的人';

  await registerViaUi(page, { email: authorEmail, nickname: authorNickname });
  await page.getByRole('link', { name: '设置' }).click();
  await chooseFirstCityAndSave(page);

  await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: /发现/ }).click();
  await page.getByRole('link', { name: '写一段城市故事' }).click();
  await expect(page).toHaveURL(/\/discover\/write$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('写一段城市故事');

  await page.getByLabel('标题').fill(STORY_TITLE);
  await page.getByLabel('正文').fill(STORY_BODY);
  await page.getByLabel('主题标签').fill('雨天，书店');
  await page.getByRole('button', { name: '保存草稿' }).click();
  await expect(page.getByText('草稿已保存，只有你能看到。')).toBeVisible();
  await expect(page).toHaveURL(/\/discover\/write\/[0-9a-f-]+$/);

  await page.reload();
  await expect(page.getByLabel('标题')).toHaveValue(STORY_TITLE);
  await expect(page.getByLabel('正文')).toHaveValue(STORY_BODY);

  await page.getByRole('button', { name: '提交审核' }).click();
  await expect(page.getByText('等待审核', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '保存草稿' })).toHaveCount(0);
  await capture(page, 'story-pending');

  await page.getByRole('button', { name: '退出' }).click();
  await expect(page).toHaveURL(/\/auth\/login$/);
  await page.goto('/discover');
  await expect(page.getByRole('link', { name: STORY_TITLE })).toHaveCount(0);

  const adminEmail = uniqueEmail('story-admin');
  await registerViaUi(page, { email: adminEmail, nickname: '审核管理员' });
  grantAdmin(adminEmail);
  await page.goto('/discover');
  await page.reload();
  await expect(page.getByRole('link', { name: '审核台' })).toBeVisible();
  await page.getByRole('link', { name: '审核台' }).click();
  await expect(page).toHaveURL(/\/admin\/moderation$/);
  await expect(page.getByRole('heading', { name: '故事审核台' })).toBeVisible();
  await expect(page.locator('.admin-queue-title').filter({ hasText: STORY_TITLE })).toBeVisible();
  await expect(page.locator('.story-body')).toContainText(STORY_BODY);

  await page.getByRole('button', { name: '通过' }).click();
  await expect(page.getByText('已通过。')).toBeVisible();
  await capture(page, 'story-approved');

  await page.goto('/discover');
  await expect(page.getByRole('link', { name: STORY_TITLE })).toBeVisible();
  const storyHref = await page.getByRole('link', { name: STORY_TITLE }).getAttribute('href');
  expect(storyHref).toMatch(/\/discover\/stories\/[0-9a-f-]+$/);
  await page.getByRole('link', { name: STORY_TITLE }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('一段被同意公开的生活片段');
  await expect(page.getByText(STORY_BODY)).toBeVisible();
  await expect(page.getByText(authorNickname)).toBeVisible();
  await capture(page, 'story-public-detail');

  await page.getByRole('button', { name: '退出' }).click();
  await page.goto('/discover');
  await expect(page.getByRole('link', { name: STORY_TITLE })).toBeVisible();
  await capture(page, 'story-public-anonymous');

  await loginViaUi(page, authorEmail);
  await expect(page).toHaveURL(/\/post-office$/);
  await page.goto('/discover/mine');
  await expect(page.getByText(STORY_TITLE)).toBeVisible();
  await page.getByRole('button', { name: '撤回' }).click();
  await expect(page.getByText('已撤回公开授权。')).toBeVisible();

  await page.goto('/discover');
  await expect(page.getByRole('link', { name: STORY_TITLE })).toHaveCount(0);
});

test('STORY AC-03 普通用户访问审核台进入无权限页', async ({ page }) => {
  await registerViaUi(page, {
    email: uniqueEmail('story-normal'),
    nickname: '普通读者',
  });
  await page.goto('/admin/moderation');
  await expect(page).toHaveURL(/\/forbidden$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('这里不对外开放');
  await expect(page.getByText('故事审核台')).toHaveCount(0);
});

test('STORY AC-06 写作页在 390px 可用且无横向溢出', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await registerViaUi(page, {
    email: uniqueEmail('story-mobile'),
    nickname: '移动写作者',
  });
  await page.goto('/discover/write');
  await expect(page.getByLabel('城市')).toBeVisible();
  await expect(page.getByLabel('标题')).toBeVisible();
  await expect(page.getByLabel('正文')).toBeVisible();
  await expect(page.getByRole('button', { name: '保存草稿' })).toBeVisible();

  const layout = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.innerWidth + 1);
  await capture(page, 'story-write-mobile');
});
