import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  closeTestApp,
  findSessionCookie,
  registerPayload,
  resetDatabase,
  sessionCookiePair,
  startTestApp,
} from './helpers';

interface ApiErrorBody {
  code: string;
  message: string;
  requestId: string;
  details?: string[];
}

const AUTH_USER_EMAIL = 'traveler@example.test';
const AUTH_USER_PASSWORD = 'fictional-passphrase-1';

describe('AC-07 安全基线：限流、来源校验、日志与响应头', () => {
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

  it('健康检查返回数据库真实连通状态', async () => {
    const response = await server().get('/api/v1/health').expect(200);
    expect(response.body).toMatchObject({ status: 'ok', database: 'up' });
    expect(typeof (response.body as { checkedAt: string }).checkedAt).toBe('string');

    const prisma = app.get(PrismaService);
    await expect(prisma.$queryRaw`SELECT 1`).resolves.toBeDefined();
  });

  it('未知路由返回统一 JSON 错误而不是 HTML 堆栈', async () => {
    const response = await server().get('/api/v1/does-not-exist').expect(404);
    const body = response.body as ApiErrorBody;
    expect(body.code).toBe('NOT_FOUND');
    expect(body.requestId).toBeTruthy();
    expect(response.text).not.toMatch(/at .*\.ts:\d+/);
  });

  it('未知写请求来源被拒绝，允许的来源可以通过', async () => {
    const blocked = await server()
      .post('/api/v1/auth/login')
      .set('Origin', 'https://evil.example')
      .send({ email: AUTH_USER_EMAIL, password: 'whatever-fictional' })
      .expect(403);
    expect((blocked.body as ApiErrorBody).code).toBe('ORIGIN_NOT_ALLOWED');
    expect(findSessionCookie(blocked)).toBeUndefined();

    const allowed = await server()
      .post('/api/v1/auth/login')
      .set('Origin', 'http://localhost:5273')
      .send({ email: AUTH_USER_EMAIL, password: 'whatever-fictional' })
      .expect(401);
    expect((allowed.body as ApiErrorBody).code).toBe('AUTH_INVALID_CREDENTIALS');
  });

  it('响应携带安全头且不暴露 X-Powered-By', async () => {
    const response = await server().get('/api/v1/health').expect(200);
    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['content-security-policy']).toContain("default-src 'none'");
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('requestId 会回传并出现在错误体中', async () => {
    const requestId = 'test-request-abc123';
    const response = await server()
      .get('/api/v1/auth/me')
      .set('x-request-id', requestId)
      .expect(401);
    expect(response.headers['x-request-id']).toBe(requestId);
    expect((response.body as ApiErrorBody).requestId).toBe(requestId);

    const generated = await server().get('/api/v1/auth/me').set('x-request-id', 'short').expect(401);
    expect(generated.headers['x-request-id']).not.toBe('short');
    expect((generated.body as ApiErrorBody).requestId).toBe(generated.headers['x-request-id']);
  });

  it('频繁错误登录返回 429 RATE_LIMITED', async () => {
    const previousIdentityLimit = process.env.AUTH_LOGIN_MAX_PER_IDENTITY;
    const previousIpLimit = process.env.AUTH_LOGIN_MAX_PER_IP;
    process.env.AUTH_LOGIN_MAX_PER_IDENTITY = '2';
    process.env.AUTH_LOGIN_MAX_PER_IP = '500';

    const limitedApp = await startTestApp();
    try {
      await resetDatabase(limitedApp);
      const limitedServer = request(limitedApp.getHttpServer());
      await limitedServer.post('/api/v1/auth/register').send(registerPayload()).expect(201);

      await limitedServer
        .post('/api/v1/auth/login')
        .send({ email: AUTH_USER_EMAIL, password: 'wrong-fictional-passphrase' })
        .expect(401);
      await limitedServer
        .post('/api/v1/auth/login')
        .send({ email: AUTH_USER_EMAIL, password: 'wrong-fictional-passphrase' })
        .expect(401);

      const blocked = await limitedServer
        .post('/api/v1/auth/login')
        .send({ email: AUTH_USER_EMAIL, password: AUTH_USER_PASSWORD })
        .expect(429);
      const body = blocked.body as ApiErrorBody;
      expect(body.code).toBe('RATE_LIMITED');
      expect(findSessionCookie(blocked)).toBeUndefined();
    } finally {
      await closeTestApp(limitedApp);
      process.env.AUTH_LOGIN_MAX_PER_IDENTITY = previousIdentityLimit;
      process.env.AUTH_LOGIN_MAX_PER_IP = previousIpLimit;
    }
  });

  it('服务端日志不包含密码、邮箱或会话 Token', async () => {
    const chunks: string[] = [];
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown): boolean => {
      chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk as Uint8Array).toString('utf8'));
      return true;
    });

    let registrationCookie = '';
    let loginCookie = '';
    try {
      const registration = await server().post('/api/v1/auth/register').send(registerPayload()).expect(201);
      registrationCookie = sessionCookiePair(registration);
      const login = await server()
        .post('/api/v1/auth/login')
        .send({ email: AUTH_USER_EMAIL, password: AUTH_USER_PASSWORD })
        .expect(200);
      loginCookie = sessionCookiePair(login);
      await server().get('/api/v1/auth/me').set('Cookie', loginCookie).expect(200);
      await server()
        .post('/api/v1/auth/login')
        .send({ email: AUTH_USER_EMAIL, password: 'wrong-fictional-passphrase' })
        .expect(401);
    } finally {
      stdoutSpy.mockRestore();
    }

    const logs = chunks.join('');
    expect(logs).toContain('http_request');
    expect(logs).not.toContain(AUTH_USER_PASSWORD);
    expect(logs).not.toContain('wrong-fictional-passphrase');
    expect(logs).not.toContain(AUTH_USER_EMAIL);
    expect(logs).not.toContain(registrationCookie.split('=')[1] ?? 'missing-token');
    expect(logs).not.toContain(loginCookie.split('=')[1] ?? 'missing-token');
  });
});
