import type { INestApplication } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApp } from '../../src/app.factory';
import { PrismaService } from '../../src/prisma/prisma.service';

interface CitySeed {
  name: string;
  countryCode: string;
  lat: number;
  lon: number;
}

export const SESSION_COOKIE_NAME = 'sw_session';

export interface RegisterPayload {
  email: string;
  password: string;
  nickname: string;
  adultConfirmed: boolean;
}

export function registerPayload(overrides: Partial<RegisterPayload> = {}): RegisterPayload {
  return {
    email: 'traveler@example.test',
    password: 'fictional-passphrase-1',
    nickname: '海边写信的人',
    adultConfirmed: true,
    ...overrides,
  };
}

export async function startTestApp(): Promise<INestApplication> {
  const app = await createApp({ logger: false });
  await app.init();
  return app;
}

export async function closeTestApp(app: INestApplication): Promise<void> {
  await app.close();
}

export async function resetDatabase(app: INestApplication): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL ?? '';
  if (!databaseUrl.toLowerCase().includes('test')) {
    throw new Error('拒绝清空非测试数据库');
  }
  const prisma = app.get(PrismaService);
  // cities 是静态目录，跨测试保留；只清空用户与邮局相关数据
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "postcard_drafts", "postcards", "profiles", "sessions", "users" RESTART IDENTITY CASCADE',
  );
}

/** 直接运行 vitest 时也能保证城市目录存在（正常由 prepare-test-db 写入）。 */
export async function ensureCitiesSeeded(app: INestApplication): Promise<void> {
  const prisma = app.get(PrismaService);
  if ((await prisma.city.count()) >= 30) {
    return;
  }
  const cities = JSON.parse(
    readFileSync(resolve(process.cwd(), 'prisma/data/cities.json'), 'utf8'),
  ) as CitySeed[];

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
}

interface SetCookieCarrier {
  headers: { 'set-cookie'?: string[] | string };
}

export function readSetCookies(response: SetCookieCarrier): string[] {
  const raw = response.headers['set-cookie'];
  if (!raw) {
    return [];
  }
  return Array.isArray(raw) ? raw : [raw];
}

/** 返回可直接放入 Cookie 请求头的 `name=value` 片段。 */
export function sessionCookiePair(response: SetCookieCarrier): string {
  const cookie = readSetCookies(response).find((item) => item.startsWith(`${SESSION_COOKIE_NAME}=`));
  if (!cookie) {
    throw new Error('响应中没有会话 Cookie');
  }
  return cookie.split(';')[0] ?? '';
}

export function findSessionCookie(response: SetCookieCarrier): string | undefined {
  return readSetCookies(response).find((item) => item.startsWith(`${SESSION_COOKIE_NAME}=`));
}

export function isClearingCookie(setCookie: string | undefined): boolean {
  if (!setCookie) {
    return false;
  }
  return /Expires=Thu, 01 Jan 1970|Max-Age=0/i.test(setCookie);
}
