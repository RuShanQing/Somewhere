import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { assertSafeTestDatabaseUrl, readTestDatabaseUrl } from './test-db-safety.mjs';

const testUrl = readTestDatabaseUrl(process.env);

let databaseName;
try {
  databaseName = assertSafeTestDatabaseUrl(testUrl, process.env.NODE_ENV ?? 'development');
} catch (error) {
  process.stderr.write(`[test-db] ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}

const prisma = new PrismaClient({ datasources: { db: { url: testUrl } } });

try {
  // 保留 cities 静态目录，只清理用户、故事、邮局、共途与信友相关数据
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "personal_memories", "penpal_consents", "passage_events", "passage_participants", "passages", "story_review_actions", "stories", "postcard_drafts", "postcards", "profiles", "sessions", "users" RESTART IDENTITY CASCADE',
  );
  process.stdout.write(`[test-db] 已清空 ${databaseName} 中的测试数据\n`);
} finally {
  await prisma.$disconnect();
}
