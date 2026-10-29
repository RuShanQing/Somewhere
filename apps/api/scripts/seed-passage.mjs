import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

/**
 * 非生产数据脚本：为两个已注册账号建立一段 ACTIVE 共途。
 *
 * 产品没有邀请 / 创建接口——在双方同意流程实现前，任何 HTTP 创建入口
 * 都等于让一方替另一方表达同意。该脚本只用于测试、E2E 与本地演示。
 */

function readArg(name) {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  return value?.trim();
}

function readEmail(name) {
  return readArg(name)?.toLowerCase();
}

const TOPIC_MAX = 80;
const KINDS = ['ONE_OFF', 'ONGOING', 'SEASONAL'];

if (process.env.NODE_ENV === 'production') {
  process.stderr.write('[passage] 禁止在生产环境写入演示共途\n');
  process.exit(1);
}

const emailA = readEmail('email-a');
const emailB = readEmail('email-b');
const topic = readArg('topic');
const kind = (readArg('kind') ?? 'ONE_OFF').toUpperCase();

if (!emailA || !emailB || !emailA.includes('@') || !emailB.includes('@')) {
  process.stderr.write('[passage] 需要 --email-a 与 --email-b（已注册的虚构账号）\n');
  process.exit(1);
}
if (emailA === emailB) {
  process.stderr.write('[passage] 两名参与者必须是不同账号\n');
  process.exit(1);
}
if (!topic || topic.length > TOPIC_MAX) {
  process.stderr.write(`[passage] 需要 --topic（1–${TOPIC_MAX} 字符）\n`);
  process.exit(1);
}
if (!KINDS.includes(kind)) {
  process.stderr.write(`[passage] --kind 只能是 ${KINDS.join(' / ')}\n`);
  process.exit(1);
}

const prisma = new PrismaClient();
try {
  const [userA, userB] = await Promise.all([
    prisma.user.findUnique({ where: { emailNormalized: emailA } }),
    prisma.user.findUnique({ where: { emailNormalized: emailB } }),
  ]);

  if (!userA || !userB) {
    process.stderr.write('[passage] 未找到账号；请先注册两个虚构账号\n');
    process.exitCode = 1;
  } else {
    const passage = await prisma.passage.create({
      data: {
        topic,
        kind,
        participants: {
          create: [{ userId: userA.id }, { userId: userB.id }],
        },
        events: {
          create: {
            actorId: userA.id,
            eventType: 'CREATED',
            metadataRedacted: { toStatus: 'ACTIVE' },
          },
        },
      },
    });
    process.stdout.write(`[passage] 已建立 ${kind} 共途：id=${passage.id}\n`);
  }
} finally {
  await prisma.$disconnect();
}
