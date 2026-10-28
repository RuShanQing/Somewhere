import { expect, test } from '@playwright/test';
import { capture, registerViaUi, uniqueEmail } from './support';

test('SMOKE-02 移动端布局可用且不横向溢出', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await registerViaUi(page, { email: uniqueEmail('mobile'), nickname: '移动端旅人' });

  await expect(page.getByRole('navigation', { name: '主导航' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  const layout = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.innerWidth + 1);

  await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: /共途/ }).click();
  await expect(page).toHaveURL(/\/passages$/);
  await expect(page.getByText('还没有正在进行的共途')).toBeVisible();
  await capture(page, 'mobile-passages');
});
