import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { hashSessionToken } from '../../src/modules/auth/domain/session-token';
import {
  closeTestApp,
  findSessionCookie,
  isClearingCookie,
  registerPayload,
  resetDatabase,
  sessionCookiePair,
  startTestApp,
} from './helpers';

interface SessionUserBody {
  id: string;
  nickname: string;
  emailVerified: boolean;
  cityId: string | null;
}

interface AuthUserBody extends SessionUserBody {
  email: string;
}

interface ApiErrorBody {
  code: string;
  message: string;
  requestId: string;
  details?: string[];
}

describe('AUTH · 注册、登录与会话（真实 PostgreSQL）', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await startTestApp();
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  beforeEach(async () => {
    await resetDatabase(app);
  });

  const server = (): ReturnType<typeof request> => request(app.getHttpServer());

  it('AC-02 注册成功：只创建一条用户、密码为 Argon2id 哈希、Cookie 为 HttpOnly', async () => {
    const payload = registerPayload();
    const response = await server().post('/api/v1/auth/register').send(payload).expect(201);

    const body = response.body as SessionUserBody;
    expect(body).toMatchObject({
      nickname: payload.nickname,
      emailVerified: false,
      cityId: null,
    });
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/);
    // AUTH-03：注册/登录响应不返回 email
    expect(body).not.toHaveProperty('email');
    expect(response.text).not.toContain(payload.email);
    expect(body).not.toHaveProperty('password');
    expect(body).not.toHaveProperty('passwordHash');

    const setCookie = findSessionCookie(response);
    expect(setCookie).toBeDefined();
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(setCookie).not.toMatch(/Secure/i);

    const prisma = app.get(PrismaService);
    const users = await prisma.user.findMany();
    expect(users).toHaveLength(1);
    const user = users[0]!;
    expect(user.emailNormalized).toBe('traveler@example.test');
    expect(user.passwordHash.startsWith('$argon2id$')).toBe(true);
    expect(user.passwordHash).not.toContain(payload.password);
    expect(user.adultConfirmedAt).toBeInstanceOf(Date);
    expect(user.emailVerifiedAt).toBeNull();

    const sessions = await prisma.session.findMany();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.sessionHash).toMatch(/^[0-9a-f]{64}$/);
    expect(setCookie).not.toContain(sessions[0]!.sessionHash);

    // 会话明文只出现在 Set-Cookie，不进入响应体或任何业务字段
    const sessionToken = (setCookie ?? '').split('=')[1]?.split(';')[0] ?? '';
    expect(sessionToken.length).toBeGreaterThanOrEqual(43);
    expect(response.text).not.toContain(sessionToken);

    // 只有 /auth/me 返回本人邮箱
    const me = await server()
      .get('/api/v1/auth/me')
      .set('Cookie', sessionCookiePair(response))
      .expect(200);
    const meBody = me.body as AuthUserBody;
    expect(meBody.email).toBe(payload.email);
    expect(meBody.id).toBe(body.id);
  });

  it('AC-02 邮箱大小写与空格不产生第二个账号，且重复注册不泄露邮箱存在性', async () => {
    await server().post('/api/v1/auth/register').send(registerPayload()).expect(201);
    const duplicate = await server()
      .post('/api/v1/auth/register')
      .send(registerPayload({ email: '  TRAVELER@Example.TEST  ' }))
      .expect(409);

    const body = duplicate.body as ApiErrorBody;
    expect(body.code).toBe('REGISTRATION_CONFLICT');
    expect(body.message).not.toContain('example.test');
    expect(body.message.toLowerCase()).not.toContain('traveler');
    expect(findSessionCookie(duplicate)).toBeUndefined();

    const prisma = app.get(PrismaService);
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.session.count()).toBe(1);
  });

  it('AC-02 注册输入不合法返回 422 且错误详情不回显输入值', async () => {
    const shortPassword = await server()
      .post('/api/v1/auth/register')
      .send(registerPayload({ password: 'short-pass' }))
      .expect(422);
    const shortPasswordBody = shortPassword.body as ApiErrorBody;
    expect(shortPasswordBody.code).toBe('VALIDATION_ERROR');
    expect(shortPasswordBody.details?.join(',')).toContain('password');
    expect(shortPasswordBody.details?.join(',')).not.toContain('short-pass');

    const blankNickname = await server()
      .post('/api/v1/auth/register')
      .send(registerPayload({ nickname: '   ' }))
      .expect(422);
    expect((blankNickname.body as ApiErrorBody).details?.join(',')).toContain('nickname');

    const notAdult = await server()
      .post('/api/v1/auth/register')
      .send(registerPayload({ adultConfirmed: false }))
      .expect(422);
    expect((notAdult.body as ApiErrorBody).details?.join(',')).toContain('adultConfirmed');

    const invalidEmail = await server()
      .post('/api/v1/auth/register')
      .send(registerPayload({ email: 'not-an-email' }))
      .expect(422);
    expect((invalidEmail.body as ApiErrorBody).details?.join(',')).toContain('email');

    const extraField = await server()
      .post('/api/v1/auth/register')
      .send({ ...registerPayload(), isAdmin: true })
      .expect(422);
    expect((extraField.body as ApiErrorBody).code).toBe('VALIDATION_ERROR');

    const prisma = app.get(PrismaService);
    expect(await prisma.user.count()).toBe(0);
  });

  it('注册昵称会裁剪空白并折叠连续空格', async () => {
    const response = await server()
      .post('/api/v1/auth/register')
      .send(registerPayload({ nickname: '  海边   写信的人  ' }))
      .expect(201);
    expect((response.body as SessionUserBody).nickname).toBe('海边 写信的人');
  });

  it('AC-02/AC-03 登录成功：响应不含 email、轮换会话并撤销旧会话，/auth/me 返回本人', async () => {
    const registration = await server().post('/api/v1/auth/register').send(registerPayload()).expect(201);
    const registrationUser = registration.body as SessionUserBody;
    const registrationCookie = sessionCookiePair(registration);

    const login = await server()
      .post('/api/v1/auth/login')
      .send({ email: '  Traveler@Example.Test ', password: 'fictional-passphrase-1' })
      .expect(200);
    const loginUser = login.body as SessionUserBody;
    expect(loginUser.id).toBe(registrationUser.id);
    expect(loginUser.nickname).toBe('海边写信的人');
    expect(loginUser).not.toHaveProperty('email');
    expect(login.text).not.toContain('traveler@example.test');
    expect(loginUser).not.toHaveProperty('password');

    const loginCookie = sessionCookiePair(login);
    expect(loginCookie).not.toBe(registrationCookie);

    // 单活动会话：登录后旧 Cookie 立即失效
    const oldSession = await server()
      .get('/api/v1/auth/me')
      .set('Cookie', registrationCookie)
      .expect(401);
    expect((oldSession.body as ApiErrorBody).code).toBe('AUTH_REQUIRED');

    const me = await server().get('/api/v1/auth/me').set('Cookie', loginCookie).expect(200);
    const meBody = me.body as AuthUserBody;
    expect(meBody.id).toBe(registrationUser.id);
    expect(meBody.email).toBe('traveler@example.test');
    expect(meBody.emailVerified).toBe(false);

    const prisma = app.get(PrismaService);
    const sessions = await prisma.session.findMany({ orderBy: { createdAt: 'asc' } });
    expect(sessions).toHaveLength(2);
    expect(sessions.filter((session) => session.revokedAt === null)).toHaveLength(1);
    expect(sessions.filter((session) => session.revokedAt !== null)).toHaveLength(1);
  });

  it('登录失败不会撤销已有活动会话', async () => {
    const registration = await server().post('/api/v1/auth/register').send(registerPayload()).expect(201);
    const cookie = sessionCookiePair(registration);

    await server()
      .post('/api/v1/auth/login')
      .send({ email: 'traveler@example.test', password: 'wrong-fictional-passphrase' })
      .expect(401);

    await server().get('/api/v1/auth/me').set('Cookie', cookie).expect(200);
  });

  it('AC-03 错误密码与不存在的账号返回完全一致的信息，不泄露账号是否存在', async () => {
    await server().post('/api/v1/auth/register').send(registerPayload()).expect(201);

    const wrongPassword = await server()
      .post('/api/v1/auth/login')
      .send({ email: 'traveler@example.test', password: 'wrong-fictional-passphrase' })
      .expect(401);
    const unknownAccount = await server()
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@example.test', password: 'wrong-fictional-passphrase' })
      .expect(401);

    const wrongBody = wrongPassword.body as ApiErrorBody;
    const unknownBody = unknownAccount.body as ApiErrorBody;
    expect(wrongBody.code).toBe('AUTH_INVALID_CREDENTIALS');
    expect(unknownBody.code).toBe(wrongBody.code);
    expect(unknownBody.message).toBe(wrongBody.message);
    expect(JSON.stringify(wrongBody)).not.toContain('traveler@example.test');
    expect(JSON.stringify(unknownBody)).not.toContain('nobody@example.test');
    expect(findSessionCookie(wrongPassword)).toBeUndefined();
    expect(findSessionCookie(unknownAccount)).toBeUndefined();
  });

  it('AC-03 未携带会话访问 /auth/me 返回 401 AUTH_REQUIRED', async () => {
    const response = await server().get('/api/v1/auth/me').expect(401);
    const body = response.body as ApiErrorBody;
    expect(body.code).toBe('AUTH_REQUIRED');
    expect(body.requestId).toBeTruthy();
  });

  it('AC-04 退出：服务端撤销会话、清理 Cookie，旧 Cookie 无法再访问 /auth/me', async () => {
    const registration = await server().post('/api/v1/auth/register').send(registerPayload()).expect(201);
    const cookie = sessionCookiePair(registration);

    const logout = await server().post('/api/v1/auth/logout').set('Cookie', cookie).expect(204);
    const clearingCookie = findSessionCookie(logout);
    expect(isClearingCookie(clearingCookie)).toBe(true);

    const me = await server().get('/api/v1/auth/me').set('Cookie', cookie).expect(401);
    expect((me.body as ApiErrorBody).code).toBe('AUTH_REQUIRED');

    const secondLogout = await server().post('/api/v1/auth/logout').set('Cookie', cookie).expect(401);
    expect((secondLogout.body as ApiErrorBody).code).toBe('AUTH_REQUIRED');

    const prisma = app.get(PrismaService);
    const session = await prisma.session.findFirstOrThrow();
    expect(session.revokedAt).toBeInstanceOf(Date);
  });

  it('AUTH 过期会话不可用', async () => {
    const registration = await server().post('/api/v1/auth/register').send(registerPayload()).expect(201);
    const user = registration.body as SessionUserBody;
    const expiredToken = 'e'.repeat(43);
    const prisma = app.get(PrismaService);
    await prisma.session.create({
      data: {
        userId: user.id,
        sessionHash: hashSessionToken(expiredToken),
        expiresAt: new Date(Date.now() - 60_000),
      },
    });

    const me = await server().get('/api/v1/auth/me').set('Cookie', `sw_session=${expiredToken}`).expect(401);
    expect((me.body as ApiErrorBody).code).toBe('AUTH_REQUIRED');
  });

  it('AC-07 一个会话只能读到自己的资料，不会返回其他用户邮箱', async () => {
    const first = await server()
      .post('/api/v1/auth/register')
      .send(registerPayload({ email: 'first.person@example.test', nickname: '第一位' }))
      .expect(201);
    const second = await server()
      .post('/api/v1/auth/register')
      .send(registerPayload({ email: 'second.person@example.test', nickname: '第二位' }))
      .expect(201);

    const firstCookie = sessionCookiePair(first);
    const me = await server().get('/api/v1/auth/me').set('Cookie', firstCookie).expect(200);
    const body = me.body as AuthUserBody;

    expect(body.email).toBe('first.person@example.test');
    expect(body.nickname).toBe('第一位');
    expect(me.text).not.toContain('second.person@example.test');
    expect(me.text).not.toContain('第二位');

    const secondMe = await server()
      .get('/api/v1/auth/me')
      .set('Cookie', sessionCookiePair(second))
      .expect(200);
    expect((secondMe.body as AuthUserBody).email).toBe('second.person@example.test');
  });

  it('伪造的 Cookie 值不会命中任何会话', async () => {
    const response = await server().get('/api/v1/auth/me').set('Cookie', `sw_session=${'z'.repeat(43)}`).expect(401);
    expect((response.body as ApiErrorBody).code).toBe('AUTH_REQUIRED');
  });
});
