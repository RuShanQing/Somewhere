import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  closeTestApp,
  ensureCitiesSeeded,
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

interface BlockBody {
  userId: string;
  nickname: string;
  blockedAt: string;
}

interface BlockListBody {
  items: BlockBody[];
}

interface DraftBody {
  id: string;
  recipient: { id: string; nickname: string } | null;
  passageId: string | null;
}

interface SendBody {
  postcardId: string;
  status: string;
}

let sequence = 0;

function uniqueEmail(prefix: string): string {
  sequence += 1;
  return `${prefix}.${Date.now()}.${sequence}@example.test`;
}

describe('SAFETY-BLOCK · 最小封锁与通信拦截（真实 PostgreSQL）', () => {
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

  async function setCity(account: Account, cityId: string): Promise<void> {
    await server()
      .patch('/api/v1/profile/me')
      .set('Cookie', account.cookie)
      .send({ cityId, receptionMode: 'OPEN' })
      .expect(200);
  }

  async function block(account: Account, targetId: string): Promise<BlockBody> {
    const response = await server()
      .post('/api/v1/safety/blocks')
      .set('Cookie', account.cookie)
      .send({ userId: targetId })
      .expect(200);
    return response.body as BlockBody;
  }

  async function createDraft(
    account: Account,
    payload: Record<string, unknown>,
  ): Promise<DraftBody> {
    const response = await server()
      .post('/api/v1/postcards/drafts')
      .set('Cookie', account.cookie)
      .send(payload)
      .expect(201);
    return response.body as DraftBody;
  }

  async function sendDraft(
    account: Account,
    draftId: string,
    key: string,
  ): Promise<SendBody> {
    const response = await server()
      .post(`/api/v1/postcards/drafts/${draftId}/send`)
      .set('Cookie', account.cookie)
      .set('Idempotency-Key', key)
      .expect(201);
    return response.body as SendBody;
  }

  it('AC-01 匿名访问封锁接口全部 401', async () => {
    await server().get('/api/v1/safety/blocks').expect(401);
    await server().post('/api/v1/safety/blocks').send({ userId: '00000000-0000-4000-8000-000000000000' }).expect(401);
    await server()
      .delete('/api/v1/safety/blocks/00000000-0000-4000-8000-000000000000')
      .expect(401);
  });

  it('AC-01 封锁、重复封锁、列表与解除均幂等，且列表不含 email', async () => {
    const a = await register('甲');
    const b = await register('乙');

    const first = await block(a, b.id);
    expect(first.userId).toBe(b.id);
    expect(first.nickname).toBe(b.nickname);
    expect(first.blockedAt).toBeTruthy();

    const second = await block(a, b.id);
    expect(second.userId).toBe(b.id);
    expect(await prisma.userBlock.count()).toBe(1);

    const list = await server()
      .get('/api/v1/safety/blocks')
      .set('Cookie', a.cookie)
      .expect(200);
    const body = list.body as BlockListBody;
    expect(body.items.map((item) => item.userId)).toEqual([b.id]);
    expect(JSON.stringify(body)).not.toMatch(/@example\.test|email|centroidLat|centroidLon/);

    await server()
      .delete(`/api/v1/safety/blocks/${b.id}`)
      .set('Cookie', a.cookie)
      .expect(204);
    expect(await prisma.userBlock.count()).toBe(0);

    await server()
      .delete(`/api/v1/safety/blocks/${b.id}`)
      .set('Cookie', a.cookie)
      .expect(204);
  });

  it('AC-01 自我封锁 422，目标不存在 404，列表只显示本人发起的封锁', async () => {
    const a = await register('甲');
    const b = await register('乙');
    const c = await register('丙');

    const self = await server()
      .post('/api/v1/safety/blocks')
      .set('Cookie', a.cookie)
      .send({ userId: a.id })
      .expect(422);
    expect((self.body as ApiErrorBody).code).toBe('VALIDATION_ERROR');

    const missing = await server()
      .post('/api/v1/safety/blocks')
      .set('Cookie', a.cookie)
      .send({ userId: '00000000-0000-4000-8000-000000000000' })
      .expect(404);
    expect((missing.body as ApiErrorBody).code).toBe('RESOURCE_NOT_ACCESSIBLE');

    await block(a, b.id);
    await block(c, a.id);

    const list = await server()
      .get('/api/v1/safety/blocks')
      .set('Cookie', a.cookie)
      .expect(200);
    expect((list.body as BlockListBody).items.map((item) => item.userId)).toEqual([b.id]);
  });

  it('AC-02 封锁后默认收件人互不出现，草稿创建被拒绝；解除后恢复', async () => {
    const a = await register('甲');
    const b = await register('乙', 'postcard.recipient@example.test');
    const city = await cityAt(0);
    await setCity(a, city.id);
    await setCity(b, city.id);

    const before = await server()
      .get('/api/v1/postcards/recipients')
      .set('Cookie', a.cookie)
      .expect(200);
    expect((before.body as Array<{ id: string }>).map((item) => item.id)).toContain(b.id);

    await block(b, a.id);

    const aRecipients = await server()
      .get('/api/v1/postcards/recipients')
      .set('Cookie', a.cookie)
      .expect(200);
    expect((aRecipients.body as Array<{ id: string }>).map((item) => item.id)).not.toContain(b.id);

    const bRecipients = await server()
      .get('/api/v1/postcards/recipients')
      .set('Cookie', b.cookie)
      .expect(200);
    expect((bRecipients.body as Array<{ id: string }>).map((item) => item.id)).not.toContain(a.id);

    const blockedDraft = await server()
      .post('/api/v1/postcards/drafts')
      .set('Cookie', a.cookie)
      .send({ body: '这封不应该建立。', recipientId: b.id })
      .expect(403);
    expect((blockedDraft.body as ApiErrorBody).code).toBe('CONTACT_BLOCKED');
    expect(await prisma.postcardDraft.count()).toBe(0);

    await server()
      .delete(`/api/v1/safety/blocks/${a.id}`)
      .set('Cookie', b.cookie)
      .expect(204);

    const after = await server()
      .get('/api/v1/postcards/recipients')
      .set('Cookie', a.cookie)
      .expect(200);
    expect((after.body as Array<{ id: string }>).map((item) => item.id)).toContain(b.id);
  });

  it('AC-02 已保存草稿在封锁后发送 403，不创建明信片、不消耗草稿或额度', async () => {
    const a = await register('甲');
    const b = await register('乙', 'postcard.recipient@example.test');
    const city = await cityAt(0);
    await setCity(a, city.id);
    await setCity(b, city.id);

    const draft = await createDraft(a, { body: '封锁前保存。', recipientId: b.id });
    await block(a, b.id);

    const response = await server()
      .post(`/api/v1/postcards/drafts/${draft.id}/send`)
      .set('Cookie', a.cookie)
      .set('Idempotency-Key', `blocked-${Date.now()}`)
      .expect(403);
    expect((response.body as ApiErrorBody).code).toBe('CONTACT_BLOCKED');

    expect(await prisma.postcard.count()).toBe(0);
    const stored = await prisma.postcardDraft.findUniqueOrThrow({ where: { id: draft.id } });
    expect(stored.sentPostcardId).toBeNull();

    await server()
      .delete(`/api/v1/safety/blocks/${b.id}`)
      .set('Cookie', a.cookie)
      .expect(204);

    const sent = await sendDraft(a, draft.id, `after-unblock-${Date.now()}`);
    expect(sent.postcardId).toBeTruthy();
    expect(await prisma.postcard.count()).toBe(1);
  });

  it('AC-03 封锁使共途 canSend=false，发送返回 403 而不是 409，解除后恢复', async () => {
    const a = await register('甲');
    const b = await register('乙');
    const city = await cityAt(0);
    await setCity(a, city.id);
    await setCity(b, city.id);
    const seeded = await seedPassage(app, {
      topic: '海边的冬天',
      participants: [{ userId: a.id }, { userId: b.id }],
    });

    const before = await server()
      .get(`/api/v1/passages/${seeded.id}`)
      .set('Cookie', a.cookie)
      .expect(200);
    expect((before.body as { permissions: { canSend: boolean } }).permissions.canSend).toBe(true);

    const draft = await createDraft(a, {
      body: '共途封锁前保存。',
      passageId: seeded.id,
    });

    await block(b, a.id);

    const after = await server()
      .get(`/api/v1/passages/${seeded.id}`)
      .set('Cookie', a.cookie)
      .expect(200);
    expect((after.body as { permissions: { canSend: boolean } }).permissions.canSend).toBe(false);

    const blocked = await server()
      .post(`/api/v1/postcards/drafts/${draft.id}/send`)
      .set('Cookie', a.cookie)
      .set('Idempotency-Key', `passage-blocked-${Date.now()}`)
      .expect(403);
    expect((blocked.body as ApiErrorBody).code).toBe('CONTACT_BLOCKED');
    expect(await prisma.postcard.count()).toBe(0);

    const participants = await prisma.passageParticipant.findMany({
      where: { passageId: seeded.id },
      orderBy: { userId: 'asc' },
    });
    expect(participants.map((item) => item.consentState)).toEqual(['ALLOW', 'ALLOW']);

    await server()
      .delete(`/api/v1/safety/blocks/${a.id}`)
      .set('Cookie', b.cookie)
      .expect(204);

    const restored = await server()
      .get(`/api/v1/passages/${seeded.id}`)
      .set('Cookie', a.cookie)
      .expect(200);
    expect((restored.body as { permissions: { canSend: boolean } }).permissions.canSend).toBe(true);

    const sent = await sendDraft(a, draft.id, `passage-after-unblock-${Date.now()}`);
    expect(sent.postcardId).toBeTruthy();
  });

  it('AC-03 封锁不改变共途参与者行，也不删除既有草稿', async () => {
    const a = await register('甲');
    const b = await register('乙');
    const seeded = await seedPassage(app, {
      topic: '雨夜',
      participants: [{ userId: a.id }, { userId: b.id }],
    });
    const draft = await createDraft(a, { body: '历史草稿。', passageId: seeded.id });

    await block(a, b.id);

    expect(await prisma.postcardDraft.count()).toBe(1);
    expect(await prisma.passage.count()).toBe(1);
    expect(
      await prisma.passageParticipant.count({
        where: { passageId: seeded.id, consentState: 'ALLOW' },
      }),
    ).toBe(2);
    expect(draft.passageId).toBe(seeded.id);
  });
});
