import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  isValidEmail,
  isValidNickname,
  isValidPassword,
  normalizeEmail,
  normalizeNickname,
} from '../src/modules/auth/domain/identity';
import { hashPassword } from '../src/modules/auth/domain/password-hashing';

interface CitySeed {
  name: string;
  countryCode: string;
  lat: number;
  lon: number;
}

function readCitySeed(): CitySeed[] {
  const cities = JSON.parse(
    readFileSync(resolve(process.cwd(), 'prisma/data/cities.json'), 'utf8'),
  ) as CitySeed[];

  if (!Array.isArray(cities) || cities.length < 30 || cities.length > 50) {
    throw new Error('城市种子必须在 30–50 条之间');
  }
  for (const city of cities) {
    if (
      typeof city.name !== 'string' ||
      city.name.trim().length === 0 ||
      typeof city.countryCode !== 'string' ||
      !/^[A-Z]{2}$/.test(city.countryCode) ||
      typeof city.lat !== 'number' ||
      typeof city.lon !== 'number' ||
      city.lat < -90 ||
      city.lat > 90 ||
      city.lon < -180 ||
      city.lon > 180
    ) {
      throw new Error(`非法城市种子：${JSON.stringify(city)}`);
    }
  }
  return cities;
}

/**
 * 开发/演示种子：只从环境变量读取虚构账号，不写入任何真实邮箱或弱口令。
 * 生产环境直接拒绝执行。
 */
async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('禁止在生产环境执行 seed');
  }

  const email = normalizeEmail(process.env.SEED_USER_EMAIL ?? '');
  const password = process.env.SEED_USER_PASSWORD ?? '';
  const nickname = normalizeNickname(process.env.SEED_USER_NICKNAME ?? '');

  if (!isValidEmail(email) || !isValidPassword(password) || !isValidNickname(nickname)) {
    throw new Error(
      'seed 需要有效的 SEED_USER_EMAIL / SEED_USER_PASSWORD（≥12 字符）/ SEED_USER_NICKNAME，请参考 .env.example',
    );
  }

  const cities = readCitySeed();
  const prisma = new PrismaClient();
  try {
    for (const city of cities) {
      await prisma.city.upsert({
        where: { name_countryCode: { name: city.name, countryCode: city.countryCode } },
        update: { centroidLat: city.lat, centroidLon: city.lon },
        create: {
          name: city.name,
          countryCode: city.countryCode,
          centroidLat: city.lat,
          centroidLon: city.lon,
        },
      });
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.upsert({
      where: { emailNormalized: email },
      update: {},
      create: {
        emailNormalized: email,
        passwordHash,
        nickname,
        adultConfirmedAt: new Date(),
      },
    });
    process.stdout.write(
      `seed: 城市 ${cities.length} 条；演示账号 ${user.emailNormalized} 已就绪（id=${user.id}），密码不落日志\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`seed failed: ${error instanceof Error ? error.message : 'unknown'}\n`);
  process.exitCode = 1;
});
