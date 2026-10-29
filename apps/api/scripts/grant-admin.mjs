import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

function readEmail() {
  const index = process.argv.indexOf('--email');
  const fromArg = index >= 0 ? process.argv[index + 1] : undefined;
  const raw = fromArg ?? process.env.ADMIN_EMAIL ?? '';
  return raw.trim().toLowerCase();
}

if (process.env.NODE_ENV === 'production') {
  process.stderr.write('[admin] 禁止在生产环境直接授予管理员角色\n');
  process.exit(1);
}

const email = readEmail();
if (!email || !email.includes('@')) {
  process.stderr.write('[admin] 需要 --email 或 ADMIN_EMAIL（虚构测试账号）\n');
  process.exit(1);
}

const prisma = new PrismaClient();
try {
  const user = await prisma.user.findUnique({ where: { emailNormalized: email } });
  if (!user) {
    process.stderr.write('[admin] 未找到该账号；请先注册后再授予角色\n');
    process.exitCode = 1;
  } else {
    await prisma.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } });
    process.stdout.write(`[admin] 已授予 ADMIN：userId=${user.id}\n`);
  }
} finally {
  await prisma.$disconnect();
}
