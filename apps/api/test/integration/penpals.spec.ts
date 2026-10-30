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
  email: string;
  cookie: string;
}

interface ApiErrorBody {
  code: string;
  message: string;
  requestId: string;
  details?: string[];
}

interface PenpalCounterpartBody {
  id: string;
  nickname: string;
  city: CityBody | null;
}

interface PenpalOverviewBody {
  active: Array<{ counterpart: PenpalCounterpartBody }>;
  incoming: Array<{ counterpart: PenpalCounterpartBody }>;
  outgoing: Array<{ counterpart: PenpalCounterpartBody }>;
}

interface ConsentBody {
  state: 'NONE' | 'ONE_SIDED' | 'ACTIVE' | 'REVOKED';
}

interface RecipientBody {
  id: string;
  nickname: string;
  city: CityBody;
}

let sequence = 0;

function uniqueEmail(prefix: string): string {
  sequence += 1;
  return `${prefix}.${Date.now()}.${sequence}@example.test`;
}

describe('PENPAL · 双向信友授权与邮局接入（真实 PostgreSQL）', () => {
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

  async function register(prefix: string, email = uniqueEmail(prefix)): Promise<Account> {
    const nickname = `${prefix}旅人`;
    const response = await server()
      .post('/api/v1/auth/register')
      .send(registerPayload({ email, nickname }))
      .expect(201);
    return {
      id: (response.body as { id: string }).id,
      nickname,
      email,
      cookie: sessionCookiePair(response),
    };
  }

  async function cityAt(index: number): Promise<CityBody> {
    const response = await server().get('/api/v1/cities').expect(200);
    const city = (response.body as CityBody[])[index];
    if (!city) {
      throw new Error(`城市目录不足 ${index + 1} 条`);
    }
    return city;
  }

  async function setCity(account: Account, cityId: string, receptionMode = 'OPEN'): Promise<void> {
    await server()
      .patch('/api/v1/profile/me')
      .set('Cookie', account.cookie)
      .send({ cityId, receptionMode })
      .expect(200);
  }

  async function seedCompletedPassage(a: Account, b: Account): Promise<string> {
    const seeded = await seedPassage(app, {
      topic: '一起看过的海',
      progressStatus: 'COMPLETED',
      participants: [{ userId: a.id }, { userId: b.id }],
    });
    return seeded.id;
  }

  async function consent(account: Account, counterpartId: string): Promise<ConsentBody> {
    const response = await server()
      .post('/api/v1/penpals/consent')
      .set('Cookie', account.cookie)
      .send({ counterpartId })
      .expect(200);
    return response.body as ConsentBody;
  }

  async function revoke(account: Account, counterpartId: string): Promise<void> {
    await server()
      .delete(`/api/v1/penpals/${counterpartId}/consent`)
      .set('Cookie', account.cookie)
      .expect(204);
  }

  async function overview(account: Account): Promise<PenpalOverviewBody> {
    const response = await server()
      .get('/api/v1/penpals')
      .set('Cookie', account.cookie)
      .expect(200);
    return response.body as PenpalOverviewBody;
  }

  it('AC-01 匿名访问信友接口全部 401', async () => {
    await server().get('/api/v1/penpals').expect(401);
    await server()
      .post('/api/v1/penpals/consent')
      .send({ counterpartId: '00000000-0000-4000-8000-000000000000' })
      .expect(401);
    await server()
      .delete('/api/v1/penpals/00000000-0000-4000-8000-000000000000/consent')
      .expect(401);
  });

  it('AC-01 只有一方同意时只出现在 outgoing / incoming，不产生 ACTIVE', async () => {
    const a = await register('甲');
    const b = await register('乙');
    await seedCompletedPassage(a, b);

    const result = await consent(a, b.id);
    expect(result.state).toBe('ONE_SIDED');

    const aOverview = await overview(a);
    expect(aOverview.active).toEqual([]);
    expect(aOverview.outgoing.map((item) => item.counterpart.id)).toEqual([b.id]);
    expect(aOverview.incoming).toEqual([]);

    const bOverview = await overview(b);
    expect(bOverview.active).toEqual([]);
    expect(bOverview.incoming.map((item) => item.counterpart.id)).toEqual([a.id]);
    expect(bOverview.outgoing).toEqual([]);

    const text = JSON.stringify({ aOverview, bOverview });
    expect(text).not.toMatch(/@example\.test|"email"|receptionMode|centroidLat|centroidLon/);
  });

  it('AC-02 双方同意后成为 ACTIVE，重复同意幂等且不改变同意时间', async () => {
    const a = await register('甲');
    const b = await register('乙');
    await seedCompletedPassage(a, b);

    await consent(a, b.id);
    const first = await prisma.penpalConsent.findUniqueOrThrow({
      where: { ownerId_counterpartId: { ownerId: a.id, counterpartId: b.id } },
    });
    const second = await consent(a, b.id);
    expect(second.state).toBe('ONE_SIDED');
    expect(await prisma.penpalConsent.count()).toBe(1);
    const afterDuplicate = await prisma.penpalConsent.findUniqueOrThrow({
      where: { ownerId_counterpartId: { ownerId: a.id, counterpartId: b.id } },
    });
    expect(afterDuplicate.consentedAt?.toISOString()).toBe(first.consentedAt?.toISOString());

    const bResult = await consent(b, a.id);
    expect(bResult.state).toBe('ACTIVE');

    const aOverview = await overview(a);
    const bOverview = await overview(b);
    expect(aOverview.active.map((item) => item.counterpart.id)).toEqual([b.id]);
    expect(bOverview.active.map((item) => item.counterpart.id)).toEqual([a.id]);
    expect(aOverview.incoming).toEqual([]);
    expect(aOverview.outgoing).toEqual([]);
    expect(aOverview.active[0]?.counterpart.nickname).toBe(b.nickname);
    expect(JSON.stringify(aOverview)).not.toMatch(/@example\.test|"email"|receptionMode/);
  });

  it('AC-02 双方同意的并发请求不会产生重复行或单方 ACTIVE', async () => {
    const a = await register('甲');
    const b = await register('乙');
    await seedCompletedPassage(a, b);

    const duplicate = await Promise.all([consent(a, b.id), consent(a, b.id)]);
    expect(duplicate.map((item) => item.state)).toEqual(['ONE_SIDED', 'ONE_SIDED']);
    expect(await prisma.penpalConsent.count()).toBe(1);

    await Promise.all([consent(b, a.id), consent(b, a.id)]);
    expect(await prisma.penpalConsent.count()).toBe(2);

    const rows = await prisma.penpalConsent.findMany({
      where: { OR: [{ ownerId: a.id }, { counterpartId: a.id }] },
      orderBy: { ownerId: 'asc' },
    });
    expect(rows.map((row) => row.consentState)).toEqual(['ALLOW', 'ALLOW']);
    expect((await overview(a)).active.map((item) => item.counterpart.id)).toEqual([b.id]);
  });

  it('AC-03 撤销后双方不再是信友，重复撤销幂等，且不删除共途与草稿', async () => {
    const a = await register('甲');
    const b = await register('乙');
    const city = await cityAt(0);
    await setCity(a, city.id);
    await setCity(b, city.id);
    const passageId = await seedCompletedPassage(a, b);
    await consent(a, b.id);
    await consent(b, a.id);

    const draft = await server()
      .post('/api/v1/postcards/drafts')
      .set('Cookie', a.cookie)
      .send({ body: '撤销前保存的草稿。', recipientId: b.id })
      .expect(201);
    expect((draft.body as { id: string }).id).toBeTruthy();

    await revoke(a, b.id);
    await revoke(a, b.id);

    const revoked = await prisma.penpalConsent.findUniqueOrThrow({
      where: { ownerId_counterpartId: { ownerId: a.id, counterpartId: b.id } },
    });
    expect(revoked.consentState).toBe('REVOKED');
    expect(revoked.revokedAt).not.toBeNull();

    expect((await overview(a)).active).toEqual([]);
    expect((await overview(b)).active).toEqual([]);
    expect(await prisma.passage.count()).toBe(1);
    expect(await prisma.passageParticipant.count({ where: { passageId } })).toBe(2);
    expect(await prisma.postcardDraft.count()).toBe(1);
    expect(await prisma.postcard.count()).toBe(0);
  });

  it('AC-03 拒绝收到的请求会关闭请求，但不会产生 ACTIVE', async () => {
    const a = await register('甲');
    const b = await register('乙');
    await seedCompletedPassage(a, b);
    await consent(a, b.id);

    await revoke(b, a.id);

    expect((await overview(a)).outgoing).toEqual([]);
    expect((await overview(b)).incoming).toEqual([]);
    expect((await overview(b)).active).toEqual([]);

    const declined = await prisma.penpalConsent.findUniqueOrThrow({
      where: { ownerId_counterpartId: { ownerId: b.id, counterpartId: a.id } },
    });
    expect(declined.consentState).toBe('REVOKED');
    expect(declined.consentedAt).toBeNull();
    expect(declined.revokedAt).not.toBeNull();
  });

  it('AC-03 撤销后本人重新同意，在对方仍 ALLOW 时恢复 ACTIVE', async () => {
    const a = await register('甲');
    const b = await register('乙');
    await seedCompletedPassage(a, b);
    await consent(a, b.id);
    await consent(b, a.id);
    await revoke(a, b.id);
    expect((await overview(a)).active).toEqual([]);

    const restored = await consent(a, b.id);
    expect(restored.state).toBe('ACTIVE');
    expect((await overview(a)).active.map((item) => item.counterpart.id)).toEqual([b.id]);
  });

  it('AC-04 封锁优先：列表隐藏、请求 403、撤销仍可用、解除后恢复', async () => {
    const a = await register('甲');
    const b = await register('乙');
    await seedCompletedPassage(a, b);
    await consent(a, b.id);
    await consent(b, a.id);

    const blocked = await server()
      .post('/api/v1/safety/blocks')
      .set('Cookie', a.cookie)
      .send({ userId: b.id })
      .expect(200);
    expect((blocked.body as { userId: string }).userId).toBe(b.id);

    expect((await overview(a)).active).toEqual([]);
    expect((await overview(b)).active).toEqual([]);

    const blockedConsent = await server()
      .post('/api/v1/penpals/consent')
      .set('Cookie', a.cookie)
      .send({ counterpartId: b.id })
      .expect(403);
    expect((blockedConsent.body as ApiErrorBody).code).toBe('CONTACT_BLOCKED');

    await revoke(a, b.id);
    const rows = await prisma.penpalConsent.findMany({
      where: { OR: [{ ownerId: a.id }, { counterpartId: a.id }] },
    });
    expect(rows).toHaveLength(2);

    await server()
      .delete(`/api/v1/safety/blocks/${b.id}`)
      .set('Cookie', a.cookie)
      .expect(204);

    expect((await overview(a)).active.map((item) => item.counterpart.id)).toEqual([]);
    await consent(a, b.id);
    expect((await overview(a)).active.map((item) => item.counterpart.id)).toEqual([b.id]);
  });

  it('AC-04 反向封锁同样使信友失效，解除后按双方许可恢复', async () => {
    const a = await register('甲');
    const b = await register('乙');
    await seedCompletedPassage(a, b);
    await consent(a, b.id);
    await consent(b, a.id);

    await server()
      .post('/api/v1/safety/blocks')
      .set('Cookie', b.cookie)
      .send({ userId: a.id })
      .expect(200);

    expect((await overview(a)).active).toEqual([]);
    expect((await overview(b)).active).toEqual([]);

    await server()
      .delete(`/api/v1/safety/blocks/${a.id}`)
      .set('Cookie', b.cookie)
      .expect(204);

    expect((await overview(a)).active.map((item) => item.counterpart.id)).toEqual([b.id]);
  });

  it('AC-05 无资格、目标不存在与自我请求按统一规则拒绝，且不写行', async () => {
    const a = await register('甲');
    const b = await register('乙');
    const c = await register('丙');

    const self = await server()
      .post('/api/v1/penpals/consent')
      .set('Cookie', a.cookie)
      .send({ counterpartId: a.id })
      .expect(422);
    expect((self.body as ApiErrorBody).code).toBe('VALIDATION_ERROR');

    const missing = await server()
      .post('/api/v1/penpals/consent')
      .set('Cookie', a.cookie)
      .send({ counterpartId: '00000000-0000-4000-8000-000000000000' })
      .expect(404);
    expect((missing.body as ApiErrorBody).code).toBe('RESOURCE_NOT_ACCESSIBLE');

    await seedPassage(app, {
      topic: '仍在进行',
      progressStatus: 'ACTIVE',
      participants: [{ userId: a.id }, { userId: b.id }],
    });
    const activeOnly = await server()
      .post('/api/v1/penpals/consent')
      .set('Cookie', a.cookie)
      .send({ counterpartId: b.id })
      .expect(404);
    expect((activeOnly.body as ApiErrorBody).code).toBe('RESOURCE_NOT_ACCESSIBLE');

    const stranger = await server()
      .post('/api/v1/penpals/consent')
      .set('Cookie', a.cookie)
      .send({ counterpartId: c.id })
      .expect(404);
    expect((stranger.body as ApiErrorBody).code).toBe('RESOURCE_NOT_ACCESSIBLE');

    expect(await prisma.penpalConsent.count()).toBe(0);
  });

  it('AC-05 归档但曾完成的共途仍具备请求资格', async () => {
    const a = await register('甲');
    const b = await register('乙');
    await seedPassage(app, {
      topic: '已经归档的完成共途',
      progressStatus: 'ARCHIVED',
      participants: [{ userId: a.id }, { userId: b.id }],
    });

    const result = await consent(a, b.id);
    expect(result.state).toBe('ONE_SIDED');
  });

  it('AC-05 第三方不能看到两人的信友关系，ADMIN 也没有直通权限', async () => {
    const a = await register('甲');
    const b = await register('乙');
    const c = await register('丙');
    await seedCompletedPassage(a, b);
    await consent(a, b.id);
    await consent(b, a.id);
    await promoteToAdmin(app, c.id);

    const cOverview = await overview(c);
    expect(cOverview).toEqual({ active: [], incoming: [], outgoing: [] });

    const cConsent = await server()
      .post('/api/v1/penpals/consent')
      .set('Cookie', c.cookie)
      .send({ counterpartId: a.id })
      .expect(404);
    expect((cConsent.body as ApiErrorBody).code).toBe('RESOURCE_NOT_ACCESSIBLE');
  });

  it('AC-06 有效信友成为邮局收件人并可寄信；撤销与封锁后立即失效', async () => {
    const a = await register('甲');
    const b = await register('乙');
    const city = await cityAt(0);
    await setCity(a, city.id);
    await setCity(b, city.id);
    await seedCompletedPassage(a, b);
    await consent(a, b.id);
    await consent(b, a.id);

    const recipients = await server()
      .get('/api/v1/postcards/recipients')
      .set('Cookie', a.cookie)
      .expect(200);
    const recipientIds = (recipients.body as RecipientBody[]).map((item) => item.id);
    expect(recipientIds).toContain(b.id);
    expect(JSON.stringify(recipients.body)).not.toMatch(/@example\.test|"email"/);

    const draft = await server()
      .post('/api/v1/postcards/drafts')
      .set('Cookie', a.cookie)
      .send({ body: '给信友的一张明信片。', recipientId: b.id })
      .expect(201);
    const draftId = (draft.body as { id: string }).id;

    const sent = await server()
      .post(`/api/v1/postcards/drafts/${draftId}/send`)
      .set('Cookie', a.cookie)
      .set('Idempotency-Key', `penpal-send-${Date.now()}`)
      .expect(201);
    expect((sent.body as { status: string }).status).toBe('IN_TRANSIT');

    await revoke(a, b.id);
    const afterRevoke = await server()
      .get('/api/v1/postcards/recipients')
      .set('Cookie', a.cookie)
      .expect(200);
    expect((afterRevoke.body as RecipientBody[]).map((item) => item.id)).not.toContain(b.id);

    const rejectedDraft = await server()
      .post('/api/v1/postcards/drafts')
      .set('Cookie', a.cookie)
      .send({ body: '撤销后不该建立。', recipientId: b.id })
      .expect(404);
    expect((rejectedDraft.body as ApiErrorBody).code).toBe('RESOURCE_NOT_ACCESSIBLE');

    await consent(a, b.id);
    await server()
      .post('/api/v1/safety/blocks')
      .set('Cookie', b.cookie)
      .send({ userId: a.id })
      .expect(200);

    const afterBlock = await server()
      .get('/api/v1/postcards/recipients')
      .set('Cookie', a.cookie)
      .expect(200);
    expect((afterBlock.body as RecipientBody[]).map((item) => item.id)).not.toContain(b.id);

    const blockedDraft = await server()
      .post('/api/v1/postcards/drafts')
      .set('Cookie', a.cookie)
      .send({ body: '封锁后不该建立。', recipientId: b.id })
      .expect(403);
    expect((blockedDraft.body as ApiErrorBody).code).toBe('CONTACT_BLOCKED');
  });

  it('AC-06 非 OPEN 的信友不出现在收件人列表，但同意记录不受影响', async () => {
    const a = await register('甲');
    const b = await register('乙');
    const city = await cityAt(0);
    await setCity(a, city.id);
    await setCity(b, city.id, 'RESTING');
    await seedCompletedPassage(a, b);
    await consent(a, b.id);
    await consent(b, a.id);

    const recipients = await server()
      .get('/api/v1/postcards/recipients')
      .set('Cookie', a.cookie)
      .expect(200);
    expect((recipients.body as RecipientBody[]).map((item) => item.id)).not.toContain(b.id);

    const stored = await prisma.penpalConsent.findUniqueOrThrow({
      where: { ownerId_counterpartId: { ownerId: a.id, counterpartId: b.id } },
    });
    expect(stored.consentState).toBe('ALLOW');
  });

  it('AC-07 数据库拒绝自指、重复与状态时间不一致的同意行', async () => {
    const a = await register('甲');
    const b = await register('乙');

    await expect(
      prisma.penpalConsent.create({
        data: {
          ownerId: a.id,
          counterpartId: a.id,
          consentState: 'ALLOW',
          consentedAt: new Date(),
        },
      }),
    ).rejects.toThrow();

    await prisma.penpalConsent.create({
      data: {
        ownerId: a.id,
        counterpartId: b.id,
        consentState: 'ALLOW',
        consentedAt: new Date(),
      },
    });
    await expect(
      prisma.penpalConsent.create({
        data: {
          ownerId: a.id,
          counterpartId: b.id,
          consentState: 'REVOKED',
          revokedAt: new Date(),
        },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.penpalConsent.create({
        data: {
          ownerId: b.id,
          counterpartId: a.id,
          consentState: 'ALLOW',
        },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.penpalConsent.create({
        data: {
          ownerId: b.id,
          counterpartId: a.id,
          consentState: 'REVOKED',
        },
      }),
    ).rejects.toThrow();
  });
});
