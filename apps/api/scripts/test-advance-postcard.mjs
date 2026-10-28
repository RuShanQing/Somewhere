import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { assertSafeTestDatabaseUrl, readTestDatabaseUrl } from './test-db-safety.mjs';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const postcardId = process.argv[2] ?? '';

if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(postcardId)) {
  process.stderr.write('[test-postcard] 需要一个合法的明信片 UUID\n');
  process.exit(1);
}

const testUrl = readTestDatabaseUrl(process.env) || process.env.E2E_TEST_DATABASE_URL || '';

try {
  assertSafeTestDatabaseUrl(testUrl, process.env.NODE_ENV ?? 'development');
} catch (error) {
  process.stderr.write(
    `[test-postcard] ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
}

const prisma = new PrismaClient({ datasources: { db: { url: testUrl } } });
try {
  const past = new Date(Date.now() - 1_000);
  const updated = await prisma.postcard.updateMany({
    where: { id: postcardId, status: 'IN_TRANSIT' },
    data: {
      sentAt: new Date(past.getTime() - 60_000),
      deliverAt: past,
    },
  });
  process.stdout.write(
    `[test-postcard] 已将 ${postcardId} 的到期时间推进到过去（影响 ${updated.count} 行）\n`,
  );
} finally {
  await prisma.$disconnect();
}

const result = spawnSync(process.execPath, ['dist/tools/run-delivery-once.js'], {
  cwd: apiRoot,
  env: {
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL: testUrl,
    TEST_DATABASE_URL: testUrl,
  },
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
