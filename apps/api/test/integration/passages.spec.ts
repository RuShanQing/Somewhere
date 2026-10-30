import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  closeTestApp,
  ensureCitiesSeeded,
  promoteToAdmin,
  registerPayload,
  resetDatabase,
  seedPassage,
  sessionCookiePair,
  startTestApp,
} from './helpers';

interface CityBody {
  id: string;
  name: string;
  countryCode: string;
}

interface Account {
  id: string;
  nickname: string;
  cookie: string;
}

interface ApiErrorBody {
  code: string;
  message: string;
  requestId: string;
  details?: string[];
}

type ConsentState = 'ALLOW' | 'PAUSED' | 'CLOSED';

interface PassageBody {
  id: string;
  topic: string;
  kind: 'ONE_OFF' | 'ONGOING' | 'SEASONAL';
  progressStatus: 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  archivedAt: string | null;
  me: { consentState: ConsentState; pausedAt: string | null };
  counterpart: { id: string; nickname: string; city: CityBody | null; consentState: ConsentState };
  permissions: { canSend: boolean };
}

interface PassageListBody {
  items: PassageBody[];
}

let sequence = 0;

function uniqueEmail(prefix: string): string {
  sequence += 1;
  return `${prefix}.${Date.now()}.${sequence}@example.test`;
}

describe('PASSAGE · 共途状态与参与者许可（真实 PostgreSQL）', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await startTestApp();
    prisma = app.get(PrismaService);
    await ensureCitiesSeeded(app);
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  beforeEach(async () => {
    await resetDatabase(app);
  });

  const server = (): ReturnType<typeof request> => request(app.getHttpServer());

  async function register(prefix: string): Promise<Account> {
    const email = uniqueEmail(prefix);
    const nickname = `${prefix}旅人`;
    const response = await server()
      .post('/api/v1/auth/register')
      .send(registerPayload({ email, nickname }))
      .expect(201);
    return {
      id: (response.body as { id: string }).id,
      nickname,
      cookie: sessionCookiePair(response),
    };
  }

  async function list(account: Account, status?: string): Promise<PassageListBody> {
    const suffix = status ? `?status=${status}` : '';
    const response = await server()
      .get(`/api/v1/passages${suffix}`)
      .set('Cookie', account.cookie)
      .expect(200);
    return response.body as PassageListBody;
  }

  async function detail(account: Account, id: string): Promise<PassageBody> {
    const response = await server()
      .get(`/api/v1/passages/${id}`)
      .set('Cookie', account.cookie)
      .expect(200);
    return response.body as PassageBody;
  }

  async function act(
    account: Account,
    id: string,
    action: 'pause' | 'resume' | 'complete' | 'archive',
  ): Promise<PassageBody> {
    const response = await server()
      .post(`/api/v1/passages/${id}/${action}`)
      .set('Cookie', account.cookie)
      .expect(200);
    return response.body as PassageBody;
  }

  async function seedPair(
    input: {
      topic?: string;
      aConsent?: ConsentState;
      bConsent?: ConsentState;
    } = {},
  ): Promise<{ a: Account; b: Account; id: string }> {
    const a = await register('甲');
    const b = await register('乙');
    const seeded = await seedPassage(app, {
      topic: input.topic,
      participants: [
        { userId: a.id, consentState: input.aConsent ?? 'ALLOW' },
        { userId: b.id, consentState: input.bConsent ?? 'ALLOW' },
      ],
    });
    return { a, b, id: seeded.id };
  }

  it('AC-01 匿名访问六个端点全部 401', async () => {
    const anonymousId = '00000000-0000-4000-8000-000000000000';
    const calls = [
      () => server().get('/api/v1/passages'),
      () => server().get(`/api/v1/passages/${anonymousId}`),
      () => server().post(`/api/v1/passages/${anonymousId}/pause`),
      () => server().post(`/api/v1/passages/${anonymousId}/resume`),
      () => server().post(`/api/v1/passages/${anonymousId}/complete`),
      () => server().post(`/api/v1/passages/${anonymousId}/archive`),
    ];
    for (const call of calls) {
      const response = await call().expect(401);
      expect((response.body as ApiErrorBody).code).toBe('AUTH_REQUIRED');
    }
  });

  it('AC-01 非参与者列表不含、详情 404，管理员同样 404', async () => {
    const { a, id } = await seedPair();
    const outsider = await register('局外');
    const admin = await register('管理员');
    await promoteToAdmin(app, admin.id);

    expect((await list(outsider)).items).toEqual([]);
    for (const account of [outsider, admin]) {
      const response = await server()
        .get(`/api/v1/passages/${id}`)
        .set('Cookie', account.cookie)
        .expect(404);
      expect((response.body as ApiErrorBody).code).toBe('RESOURCE_NOT_ACCESSIBLE');
    }

    const own = await list(a);
    expect(own.items.map((item) => item.id)).toEqual([id]);
    expect(own.items[0]?.counterpart.nickname).toBe('乙旅人');
  });

  it('AC-02 字段白名单且对方资料最小化', async () => {
    const { a, b, id } = await seedPair({ topic: '海边的冬天' });

    const cities = await server().get('/api/v1/cities').expect(200);
    const city = (cities.body as CityBody[])[0];
    if (!city) {
      throw new Error('城市目录为空');
    }
    await server()
      .patch('/api/v1/profile/me')
      .set('Cookie', b.cookie)
      .send({ cityId: city.id })
      .expect(200);

    const response = await server()
      .get(`/api/v1/passages/${id}`)
      .set('Cookie', a.cookie)
      .expect(200);
    const passage = response.body as PassageBody;
    const text = JSON.stringify(response.body);

    expect(text).not.toContain('@example.test');
    expect(text).not.toMatch(/centroidLat|centroidLon|receptionMode|password|session/i);

    expect(Object.keys(passage).sort()).toEqual([
      'archivedAt',
      'completedAt',
      'counterpart',
      'createdAt',
      'id',
      'kind',
      'me',
      'permissions',
      'progressStatus',
      'topic',
      'updatedAt',
    ]);
    expect(Object.keys(passage.me).sort()).toEqual(['consentState', 'pausedAt']);
    expect(Object.keys(passage.counterpart).sort()).toEqual([
      'city',
      'consentState',
      'id',
      'nickname',
    ]);
    expect(Object.keys(passage.permissions)).toEqual(['canSend']);
    expect(Object.keys(passage.counterpart.city ?? {}).sort()).toEqual([
      'countryCode',
      'id',
      'name',
    ]);
  });

  it('AC-03 停泊只改本人；对方不能替其续程；本人续程后恢复', async () => {
    const { a, b, id } = await seedPair();

    expect((await detail(a, id)).permissions.canSend).toBe(true);
    const paused = await act(a, id, 'pause');
    expect(paused.me.consentState).toBe('PAUSED');
    expect(paused.me.pausedAt).not.toBeNull();
    expect(paused.permissions.canSend).toBe(false);

    const bView = await detail(b, id);
    expect(bView.me.consentState).toBe('ALLOW');
    expect(bView.counterpart.consentState).toBe('PAUSED');
    expect(bView.permissions.canSend).toBe(false);

    const bResume = await act(b, id, 'resume');
    expect(bResume.me.consentState).toBe('ALLOW');
    expect((await detail(a, id)).me.consentState).toBe('PAUSED');
    expect((await detail(a, id)).permissions.canSend).toBe(false);

    const resumed = await act(a, id, 'resume');
    expect(resumed.me.consentState).toBe('ALLOW');
    expect(resumed.me.pausedAt).toBeNull();
    expect(resumed.permissions.canSend).toBe(true);
  });

  it('AC-03 重复停泊返回 200 且只写一条事件', async () => {
    const { a, id } = await seedPair();

    await act(a, id, 'pause');
    await act(a, id, 'pause');

    const pausedEvents = await prisma.passageEvent.count({
      where: { passageId: id, eventType: 'PAUSED' },
    });
    expect(pausedEvents).toBe(1);
  });

  it('AC-04 完成不改双方许可；重复完成幂等；完成后续程 409', async () => {
    const { a, b, id } = await seedPair();

    const completed = await act(a, id, 'complete');
    expect(completed.progressStatus).toBe('COMPLETED');
    expect(completed.completedAt).not.toBeNull();
    expect(completed.permissions.canSend).toBe(false);

    const participants = await prisma.passageParticipant.findMany({
      where: { passageId: id },
      orderBy: { userId: 'asc' },
    });
    expect(participants.map((item) => item.consentState)).toEqual(['ALLOW', 'ALLOW']);

    await act(a, id, 'complete');
    const completedEvents = await prisma.passageEvent.count({
      where: { passageId: id, eventType: 'COMPLETED' },
    });
    expect(completedEvents).toBe(1);

    const conflict = await server()
      .post(`/api/v1/passages/${id}/resume`)
      .set('Cookie', b.cookie)
      .expect(409);
    expect((conflict.body as ApiErrorBody).code).toBe('PASSAGE_STATE_CONFLICT');
  });

  it('AC-04 归档后从进行中消失、已归档可读、重复归档幂等', async () => {
    const { a, b, id } = await seedPair();
    await act(a, id, 'pause');
    await act(a, id, 'resume');
    await act(a, id, 'complete');

    const archived = await act(b, id, 'archive');
    expect(archived.progressStatus).toBe('ARCHIVED');
    expect(archived.archivedAt).not.toBeNull();

    expect((await list(a, 'ACTIVE')).items).toEqual([]);
    const archivedList = await list(a, 'ARCHIVED');
    expect(archivedList.items.map((item) => item.id)).toEqual([id]);

    expect((await detail(a, id)).progressStatus).toBe('ARCHIVED');
    expect((await detail(b, id)).progressStatus).toBe('ARCHIVED');

    await act(a, id, 'archive');
    const archivedEvents = await prisma.passageEvent.count({
      where: { passageId: id, eventType: 'ARCHIVED' },
    });
    expect(archivedEvents).toBe(1);
  });

  it('AC-05 CLOSED 参与者 canSend=false 且不能续程', async () => {
    const { a, b, id } = await seedPair({ aConsent: 'CLOSED' });

    const view = await detail(a, id);
    expect(view.me.consentState).toBe('CLOSED');
    expect(view.permissions.canSend).toBe(false);

    const conflict = await server()
      .post(`/api/v1/passages/${id}/resume`)
      .set('Cookie', a.cookie)
      .expect(409);
    expect((conflict.body as ApiErrorBody).code).toBe('PASSAGE_STATE_CONFLICT');

    expect((await detail(b, id)).permissions.canSend).toBe(false);
  });

  it('AC-01 非法 status 查询参数返回 422', async () => {
    const { a } = await seedPair();
    const response = await server()
      .get('/api/v1/passages?status=UNKNOWN')
      .set('Cookie', a.cookie)
      .expect(422);
    expect((response.body as ApiErrorBody).code).toBe('VALIDATION_ERROR');
  });

  it('AC-03 并发停泊只产生一条事件并保持 PAUSED', async () => {
    const { a, id } = await seedPair();

    const [first, second] = await Promise.all([
      server().post(`/api/v1/passages/${id}/pause`).set('Cookie', a.cookie),
      server().post(`/api/v1/passages/${id}/pause`).set('Cookie', a.cookie),
    ]);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    expect((await detail(a, id)).me.consentState).toBe('PAUSED');
    const pausedEvents = await prisma.passageEvent.count({
      where: { passageId: id, eventType: 'PAUSED' },
    });
    expect(pausedEvents).toBe(1);
  });

  it('AC-04 完成与归档并发时终态一致且不重复写事件', async () => {
    const { a, b, id } = await seedPair();

    const [complete, archive] = await Promise.all([
      server().post(`/api/v1/passages/${id}/complete`).set('Cookie', a.cookie),
      server().post(`/api/v1/passages/${id}/archive`).set('Cookie', b.cookie),
    ]);

    expect([200, 409]).toContain(complete.status);
    expect([200, 409]).toContain(archive.status);

    const final = await detail(a, id);
    expect(['COMPLETED', 'ARCHIVED']).toContain(final.progressStatus);
    const archivedEvents = await prisma.passageEvent.count({
      where: { passageId: id, eventType: 'ARCHIVED' },
    });
    expect(archivedEvents).toBeLessThanOrEqual(1);
  });
});
