import { expect, test } from '@playwright/test';
import {
  capture,
  chooseFirstCityAndSave,
  loginViaUi,
  registerViaUi,
  seedPassageForEmails,
  uniqueEmail,
} from './support';

test('PENPAL AC-06/AC-07 完成共途后双向同意、寄信、封锁优先与撤销', async ({ page }) => {
  const emailA = uniqueEmail('penpal-a');
  const emailB = uniqueEmail('penpal-b');
  const nicknameA = '信友测试甲';
  const nicknameB = '信友测试乙';

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
    topic: '信友测试共途',
  });

  // A 完成共途，然后请求成为信友
  await loginViaUi(page, emailA);
  await expect(page).toHaveURL(/\/post-office$/);
  await page.goto(`/passages/${passageId}`);
  await page.getByRole('button', { name: '完成这段共途' }).click();
  await expect(page.getByText('这段共途已完成，不会自动成为信友。')).toBeVisible();

  const penpalSection = page.getByRole('region', { name: '信友' });
  await expect(penpalSection.getByText('你们已经完成过一段共途。')).toBeVisible();
  await penpalSection.getByRole('button', { name: '请求成为信友' }).click();
  await expect(penpalSection.getByText('已发出请求，等待对方回应。')).toBeVisible();
  await capture(page, 'penpal-requested');

  // B 在信友页看到请求并同意
  await page.getByRole('button', { name: '退出' }).click();
  await expect(page).toHaveURL(/\/auth\/login$/);
  await loginViaUi(page, emailB);
  await expect(page).toHaveURL(/\/post-office$/);
  await page.goto('/passages');
  await page.getByRole('link', { name: '查看我的信友' }).click();
  await expect(page).toHaveURL(/\/penpals$/);
  await expect(page.getByRole('heading', { name: '收到的请求' })).toBeVisible();
  await expect(page.getByText(nicknameA)).toBeVisible();
  await page.getByRole('button', { name: '同意' }).click();
  await expect(page.getByText('你们已经成为信友。')).toBeVisible();
  await expect(page.getByRole('heading', { name: '已建立' })).toBeVisible();
  await capture(page, 'penpal-active');

  // A 重新登录，确认已建立，并验证写信收件人包含信友
  await page.getByRole('button', { name: '退出' }).click();
  await expect(page).toHaveURL(/\/auth\/login$/);
  await loginViaUi(page, emailA);
  await expect(page).toHaveURL(/\/post-office$/);
  await page.goto('/penpals');
  await expect(page.getByRole('heading', { name: '已建立' })).toBeVisible();
  await expect(page.getByText(nicknameB)).toBeVisible();

  await page.goto('/post-office/compose');
  const recipients = page.getByLabel('收件人');
  await expect(recipients.locator('option', { hasText: nicknameB })).toHaveCount(1);

  // 封锁优先：信友关系从列表消失，解除后恢复
  await page.goto(`/passages/${passageId}`);
  await page.getByRole('button', { name: '封锁对方' }).click();
  await page.getByRole('button', { name: '确认封锁' }).click();
  await expect(page.getByText('你已封锁对方。')).toBeVisible();

  await page.goto('/penpals');
  await expect(page.getByText('还没有信友', { exact: true })).toBeVisible();

  await page.getByRole('link', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '解除封锁' }).click();
  await expect(page.locator('.form-success')).toContainText('已解除封锁');

  await page.goto('/penpals');
  await expect(page.getByRole('heading', { name: '已建立' })).toBeVisible();

  // 撤销后不再出现在信友页与收件人列表
  await page.getByRole('button', { name: '撤销信友许可' }).click();
  await page.getByRole('button', { name: '确认撤销' }).click();
  await expect(page.getByText('已撤销信友许可；历史内容不受影响。')).toBeVisible();
  await expect(page.getByText('还没有信友', { exact: true })).toBeVisible();

  await page.goto('/post-office/compose');
  await expect(page.getByLabel('收件人').locator('option', { hasText: nicknameB })).toHaveCount(0);

  // 移动端与键盘可用性
  await page.goto('/penpals');
  await page.setViewportSize({ width: 390, height: 844 });
  const layout = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.innerWidth + 1);

  await page.goto('/passages');
  await page.getByRole('link', { name: '查看我的信友' }).focus();
  await expect(page.getByRole('link', { name: '查看我的信友' })).toBeFocused();
});
