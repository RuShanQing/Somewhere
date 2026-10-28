import { expect, test } from '@playwright/test';
import { capture, registerViaUi, uniqueEmail } from './support';

test('SMOKE-02 四个主导航的空态与标题真实可信', async ({ page }) => {
  await registerViaUi(page, { email: uniqueEmail('nav'), nickname: '导航旅人' });

  const expectations = [
    { label: '邮局', path: '/post-office', heading: '你的信，会按距离慢慢抵达', empty: '还没有新来信' },
    { label: '发现', path: '/discover', heading: '看看别人生活的城市', empty: '还没有已审核的城市故事' },
    { label: '共途', path: '/passages', heading: '一起走过的路，可以停泊', empty: '还没有正在进行的共途' },
    { label: '纪念册', path: '/memories', heading: '把共同的时间收好', empty: '还没有双城日记' },
  ] as const;

  for (const item of expectations) {
    await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: new RegExp(item.label) }).click();
    await expect(page).toHaveURL(new RegExp(`${item.path}$`));
    await expect(page.getByRole('heading', { level: 1 })).toContainText(item.heading);
    await expect(page.getByText(item.empty)).toBeVisible();
    await expect(page.locator('nav a[aria-current="page"]')).toContainText(item.label);
    await capture(page, `nav-${item.path.replace(/\//g, '')}`);
  }

  // 不渲染任何伪造的内容
  await expect(page.getByText('示例来信')).toHaveCount(0);
  await expect(page.locator('.empty-state')).not.toHaveCount(0);
});

test('SMOKE-02 主导航可键盘访问且顺序稳定', async ({ page }) => {
  await registerViaUi(page, { email: uniqueEmail('keyboard'), nickname: '键盘旅人' });
  await page.goto('/post-office');

  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: '跳到主要内容' })).toBeFocused();

  const navLinks = page.getByRole('navigation', { name: '主导航' }).getByRole('link');
  await expect(navLinks).toHaveCount(4);
  await expect(navLinks.nth(0)).toContainText('邮局');
  await expect(navLinks.nth(1)).toContainText('发现');
  await expect(navLinks.nth(2)).toContainText('共途');
  await expect(navLinks.nth(3)).toContainText('纪念册');

  await navLinks.nth(0).focus();
  await page.keyboard.press('Tab');
  await expect(navLinks.nth(1)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/discover$/);
});

test('SMOKE-02 匿名可以浏览发现，但私人页面要求登录', async ({ page }) => {
  await page.goto('/discover');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('看看别人生活的城市');
  await expect(page.getByText('还没有已审核的城市故事')).toBeVisible();

  await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: /邮局/ }).click();
  await expect(page).toHaveURL(/\/auth\/login\?redirect=(%2F|\/)post-office/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('欢迎回来');
});
