import { defineConfig } from '@playwright/test';
import { config as loadDotenv } from 'dotenv';
import { resolve } from 'node:path';
import { TASK_ID } from './task';

const root = resolve(__dirname, '../..');
const apiRoot = resolve(root, 'apps/api');
const artifacts = resolve(root, 'artifacts/verification', TASK_ID);

loadDotenv({ path: resolve(apiRoot, '.env') });

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error('E2E 需要 TEST_DATABASE_URL（apps/api/.env），并指向隔离测试库');
}

const API_PORT = 4301;
const WEB_PORT = 5273;
const apiUrl = `http://127.0.0.1:${API_PORT}`;
const webUrl = `http://127.0.0.1:${WEB_PORT}`;
const runStamp = new Date().toISOString().replace(/[:.]/g, '-');
// 固定虚构邮箱：每次 E2E 启动前都会迁移并清空测试库，避免配置在多个进程里生成不同时间戳。
const demoRecipientEmail = 'postcard.recipient.e2e@example.test';
process.env.E2E_DEMO_RECIPIENT_EMAIL = demoRecipientEmail;
process.env.E2E_TEST_DATABASE_URL = testDatabaseUrl;

export default defineConfig({
  testDir: __dirname,
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // 每次运行使用独立目录，避免历史失败附件累积后触发本机批量删除保护
  outputDir: resolve(artifacts, 'test-results', runStamp),
  reporter: [
    ['list'],
    ['html', { outputFolder: resolve(artifacts, 'playwright-report'), open: 'never' }],
  ],
  use: {
    baseURL: webUrl,
    channel: 'chrome',
    locale: 'zh-CN',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'node scripts/prepare-test-db.mjs && node scripts/reset-test-db.mjs && node dist/main.js',
      cwd: apiRoot,
      url: `${apiUrl}/api/v1/health`,
      reuseExistingServer: false,
      timeout: 90_000,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        PORT: String(API_PORT),
        DATABASE_URL: testDatabaseUrl,
        TEST_DATABASE_URL: testDatabaseUrl,
        WEB_ORIGINS: `${webUrl},http://localhost:${WEB_PORT}`,
        SESSION_COOKIE_NAME: 'sw_session',
        SESSION_TTL_HOURS: '168',
        AUTH_REGISTER_MAX_PER_IP: '1000',
        AUTH_LOGIN_MAX_PER_IP: '1000',
        AUTH_LOGIN_MAX_PER_IDENTITY: '1000',
        POSTCARD_DEMO_RECIPIENT_EMAILS: demoRecipientEmail,
        POSTCARD_MAX_SENDS_PER_DAY: '10',
      },
    },
    {
      command: `pnpm --filter @somewhere/web dev --host 127.0.0.1 --port ${WEB_PORT}`,
      cwd: root,
      url: webUrl,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...process.env,
        VITE_API_PROXY_TARGET: apiUrl,
      },
    },
  ],
});
