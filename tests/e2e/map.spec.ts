import { expect, test } from '@playwright/test';
import {
  capture,
  chooseFirstCityAndSave,
  grantAdmin,
  loginViaUi,
  registerViaUi,
  uniqueEmail,
} from './support';

const STORY_TITLE = '地图上的一盏灯';
const STORY_BODY = '夜里沿着河边走，桥下的灯一盏一盏亮起来，像是在替人指路。';

test('MAP AC-05 城市入口与故事站指向同一 Story ID，撤回后同时消失', async ({ page }) => {
  page.on('dialog', (dialog) => dialog.accept());

  const authorEmail = uniqueEmail('map-author');
  await registerViaUi(page, { email: authorEmail, nickname: '地图作者' });
  await page.getByRole('link', { name: '设置' }).click();
  await chooseFirstCityAndSave(page);

  await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: /发现/ }).click();
  await page.getByRole('link', { name: '写一段城市故事' }).click();
  const citySelect = page.getByLabel('城市');
  await expect(citySelect).not.toHaveValue('');
  // 选项文案是「城市名 · 国家代码」，地图入口只显示城市名
  const cityOptionText = (await citySelect.locator('option:checked').textContent())?.trim() ?? '';
  const cityName = cityOptionText.split('·')[0]?.trim() ?? '';
  expect(cityName).not.toBe('');
  expect(cityName).not.toBe('请选择城市');

  await page.getByLabel('标题').fill(STORY_TITLE);
  await page.getByLabel('正文').fill(STORY_BODY);
  await page.getByLabel('主题标签').fill('夜晚，河流');
  await page.getByRole('button', { name: '提交审核' }).click();
  await expect(page.getByText('等待审核', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: '退出' }).click();
  await page.goto('/discover/map');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('世界记忆地图');
  await expect(page.getByText('地图上还没有亮起的城市')).toBeVisible();
  await expect(page.getByRole('link', { name: cityName })).toHaveCount(0);
  await capture(page, 'map-empty');

  const adminEmail = uniqueEmail('map-admin');
  await registerViaUi(page, { email: adminEmail, nickname: '地图管理员' });
  grantAdmin(adminEmail);
  await page.goto('/discover');
  await page.reload();
  await page.getByRole('link', { name: '审核台' }).click();
  await expect(page.locator('.admin-queue-title').filter({ hasText: STORY_TITLE })).toBeVisible();
  await page.getByRole('button', { name: '通过' }).click();
  await expect(page.getByText('已通过。')).toBeVisible();

  await page.getByRole('button', { name: '退出' }).click();
  await page.goto('/discover/map');
  const cityLink = page.getByRole('link', { name: cityName });
  await expect(cityLink).toBeVisible();
  await expect(cityLink).toContainText('1 篇可读故事');
  await capture(page, 'map-cities');

  await cityLink.focus();
  await expect(cityLink).toBeFocused();
  await cityLink.click();
  await expect(page).toHaveURL(/\/discover\/map\/[0-9a-f-]+$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(cityName);
  await expect(page.getByRole('link', { name: STORY_TITLE })).toBeVisible();
  await capture(page, 'map-city-stories');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
  ).toBe(false);
  await capture(page, 'map-city-390');

  await page.setViewportSize({ width: 1280, height: 900 });
  const mapHref = await page.getByRole('link', { name: STORY_TITLE }).getAttribute('href');
  await page.getByRole('link', { name: STORY_TITLE }).click();
  await expect(page).toHaveURL(/\/discover\/stories\/[0-9a-f-]+$/);
  await expect(page.getByText(STORY_BODY)).toBeVisible();
  const detailPath = new URL(page.url()).pathname;
  expect(detailPath).toMatch(/^\/discover\/stories\/[0-9a-f-]+$/);
  expect(mapHref).toBe(detailPath);
  await capture(page, 'map-story-detail');

  await page.goto('/discover');
  const stationHref = await page.getByRole('link', { name: STORY_TITLE }).getAttribute('href');
  expect(stationHref).toBe(detailPath);

  await loginViaUi(page, authorEmail);
  await expect(page).toHaveURL(/\/post-office$/);
  await page.goto('/discover/mine');
  await page.getByRole('button', { name: '撤回' }).click();
  await expect(page.getByText('已撤回公开授权。')).toBeVisible();

  await page.goto('/discover/map');
  await expect(page.getByText('地图上还没有亮起的城市')).toBeVisible();
  await expect(page.getByRole('link', { name: cityName })).toHaveCount(0);

  await page.goto('/discover');
  await expect(page.getByRole('link', { name: STORY_TITLE })).toHaveCount(0);
  await capture(page, 'map-after-withdraw');
});
