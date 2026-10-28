import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  closeTestApp,
  ensureCitiesSeeded,
  registerPayload,
  resetDatabase,
  sessionCookiePair,
  startTestApp,
} from './helpers';

interface CityBody {
  id: string;
  name: string;
  countryCode: string;
}

interface ProfileBody {
  userId: string;
  nickname: string;
  city: CityBody | null;
  receptionMode: string;
  email?: unknown;
  passwordHash?: unknown;
}

interface ApiErrorBody {
  code: string;
  message: string;
  requestId: string;
  details?: string[];
}

const CITY_KEYS = ['countryCode', 'id', 'name'];
const PROFILE_KEYS = ['city', 'nickname', 'receptionMode', 'userId'];

let sequence = 0;

function profileEmail(prefix = 'profile'): string {
  sequence += 1;
  return `${prefix}.${Date.now()}.${sequence}@example.test`;
}

describe('PROFILE · 城市目录与本人资料（真实 PostgreSQL）', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await startTestApp();
    await ensureCitiesSeeded(app);
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  beforeEach(async () => {
    await resetDatabase(app);
  });

  const server = (): ReturnType<typeof request> => request(app.getHttpServer());

  async function registerAndGetCookie(prefix?: string): Promise<string> {
    const response = await server()
      .post('/api/v1/auth/register')
      .send(registerPayload({ email: profileEmail(prefix) }))
      .expect(201);
    return sessionCookiePair(response);
  }

  it('AC-01 城市目录公开可读，30–50 条且不暴露经纬度', async () => {
    const response = await server().get('/api/v1/cities').expect(200);
    const cities = response.body as CityBody[];

    expect(Array.isArray(cities)).toBe(true);
    expect(cities.length).toBeGreaterThanOrEqual(30);
    expect(cities.length).toBeLessThanOrEqual(50);

    for (const city of cities) {
      expect(Object.keys(city).sort()).toEqual(CITY_KEYS);
      expect(city.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(city.name.length).toBeGreaterThan(0);
      expect(city.countryCode).toMatch(/^[A-Z]{2}$/);
    }

    const compositeKeys = new Set(cities.map((city) => `${city.countryCode}:${city.name}`));
    expect(compositeKeys.size).toBe(cities.length);
  });

  it('AC-01 城市搜索按名称过滤，并拒绝过长查询', async () => {
    const all = await server().get('/api/v1/cities').expect(200);
    const allCities = all.body as CityBody[];
    const target = allCities[0]!;

    const filtered = await server()
      .get('/api/v1/cities')
      .query({ query: target.name.slice(0, 1) })
      .expect(200);
    const matched = filtered.body as CityBody[];
    expect(matched.length).toBeGreaterThan(0);
    expect(matched.every((city) => city.name.includes(target.name.slice(0, 1)))).toBe(true);

    const tooLong = await server()
      .get('/api/v1/cities')
      .query({ query: 'c'.repeat(65) })
      .expect(422);
    expect((tooLong.body as ApiErrorBody).code).toBe('VALIDATION_ERROR');
  });

  it('AC-02 未登录读取资料返回 401，注册后默认为空城市 + OPEN', async () => {
    await server().get('/api/v1/profile/me').expect(401);

    const cookie = await registerAndGetCookie('default');
    const response = await server().get('/api/v1/profile/me').set('Cookie', cookie).expect(200);
    const profile = response.body as ProfileBody;

    expect(Object.keys(profile).sort()).toEqual(PROFILE_KEYS);
    expect(profile.nickname).toBe('海边写信的人');
    expect(profile.city).toBeNull();
    expect(profile.receptionMode).toBe('OPEN');
    expect(profile).not.toHaveProperty('email');
    expect(profile).not.toHaveProperty('passwordHash');
  });

  it('AC-03 修改昵称、城市与接信状态后可持久读取', async () => {
    const cookie = await registerAndGetCookie('update');
    const citiesResponse = await server().get('/api/v1/cities').expect(200);
    const city = (citiesResponse.body as CityBody[])[0]!;

    const updated = await server()
      .patch('/api/v1/profile/me')
      .set('Cookie', cookie)
      .send({ nickname: '  新的昵称  ', cityId: city.id, receptionMode: 'RESTING' })
      .expect(200);
    const updatedBody = updated.body as ProfileBody;

    expect(updatedBody.nickname).toBe('新的昵称');
    expect(updatedBody.city).toMatchObject({
      id: city.id,
      name: city.name,
      countryCode: city.countryCode,
    });
    expect(updatedBody.receptionMode).toBe('RESTING');
    expect(updatedBody.city).not.toHaveProperty('centroidLat');
    expect(updatedBody.city).not.toHaveProperty('centroidLon');

    const reloaded = await server().get('/api/v1/profile/me').set('Cookie', cookie).expect(200);
    const reloadedBody = reloaded.body as ProfileBody;
    expect(reloadedBody).toMatchObject({
      nickname: '新的昵称',
      receptionMode: 'RESTING',
      city: { id: city.id, name: city.name, countryCode: city.countryCode },
    });

    // 认证接口读取的是同一条用户记录上的昵称
    const me = await server().get('/api/v1/auth/me').set('Cookie', cookie).expect(200);
    expect((me.body as { nickname: string }).nickname).toBe('新的昵称');
  });

  it('AC-03 可以清空城市，非法城市/状态/昵称与空请求体返回 422', async () => {
    const cookie = await registerAndGetCookie('invalid');
    const city = ((await server().get('/api/v1/cities').expect(200)).body as CityBody[])[0]!;

    await server()
      .patch('/api/v1/profile/me')
      .set('Cookie', cookie)
      .send({ cityId: city.id })
      .expect(200);
    const cleared = await server()
      .patch('/api/v1/profile/me')
      .set('Cookie', cookie)
      .send({ cityId: null })
      .expect(200);
    expect((cleared.body as ProfileBody).city).toBeNull();

    const invalidCity = await server()
      .patch('/api/v1/profile/me')
      .set('Cookie', cookie)
      .send({ cityId: '00000000-0000-4000-8000-000000000000' })
      .expect(422);
    expect((invalidCity.body as ApiErrorBody).details?.join(',')).toContain('cityId');

    const invalidMode = await server()
      .patch('/api/v1/profile/me')
      .set('Cookie', cookie)
      .send({ receptionMode: 'ALWAYS' })
      .expect(422);
    expect((invalidMode.body as ApiErrorBody).code).toBe('VALIDATION_ERROR');

    const blankNickname = await server()
      .patch('/api/v1/profile/me')
      .set('Cookie', cookie)
      .send({ nickname: '   ' })
      .expect(422);
    expect((blankNickname.body as ApiErrorBody).details?.join(',')).toContain('nickname');

    const emptyBody = await server()
      .patch('/api/v1/profile/me')
      .set('Cookie', cookie)
      .send({})
      .expect(422);
    expect((emptyBody.body as ApiErrorBody).code).toBe('VALIDATION_ERROR');

    const extraField = await server()
      .patch('/api/v1/profile/me')
      .set('Cookie', cookie)
      .send({ userId: 'someone-else' })
      .expect(422);
    expect((extraField.body as ApiErrorBody).code).toBe('VALIDATION_ERROR');
  });

  it('AC-05 一个账号修改资料不会影响另一个账号', async () => {
    const firstCookie = await registerAndGetCookie('first');
    const secondCookie = await registerAndGetCookie('second');
    const city = ((await server().get('/api/v1/cities').expect(200)).body as CityBody[])[0]!;

    await server()
      .patch('/api/v1/profile/me')
      .set('Cookie', firstCookie)
      .send({ nickname: '第一位旅人', cityId: city.id, receptionMode: 'CLOSED' })
      .expect(200);

    const secondProfile = await server()
      .get('/api/v1/profile/me')
      .set('Cookie', secondCookie)
      .expect(200);
    const secondBody = secondProfile.body as ProfileBody;
    expect(secondBody.nickname).toBe('海边写信的人');
    expect(secondBody.city).toBeNull();
    expect(secondBody.receptionMode).toBe('OPEN');

    const firstProfile = await server()
      .get('/api/v1/profile/me')
      .set('Cookie', firstCookie)
      .expect(200);
    expect((firstProfile.body as ProfileBody).nickname).toBe('第一位旅人');
  });
});
