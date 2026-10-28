import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertSafeTestDatabaseUrl, readTestDatabaseUrl } from './test-db-safety.mjs';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const testUrl = readTestDatabaseUrl(process.env);

try {
  const databaseName = assertSafeTestDatabaseUrl(testUrl, process.env.NODE_ENV ?? 'development');
  process.stdout.write(`[test-db] 同步迁移到隔离测试库 ${databaseName}\n`);
} catch (error) {
  process.stderr.write(`[test-db] ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}

const result = spawnSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
  cwd: apiRoot,
  env: { ...process.env, DATABASE_URL: testUrl, NODE_ENV: 'test' },
  stdio: 'inherit',
});

if (result.status !== 0) {
  process.stderr.write('[test-db] prisma migrate deploy 失败\n');
  process.exit(result.status ?? 1);
}

const seedCities = spawnSync('node', ['scripts/seed-test-cities.mjs'], {
  cwd: apiRoot,
  env: { ...process.env, DATABASE_URL: testUrl, TEST_DATABASE_URL: testUrl, NODE_ENV: 'test' },
  stdio: 'inherit',
});

if (seedCities.status !== 0) {
  process.stderr.write('[test-db] 城市种子写入失败\n');
  process.exit(seedCities.status ?? 1);
}

process.stdout.write('[test-db] 迁移与城市种子完成\n');
