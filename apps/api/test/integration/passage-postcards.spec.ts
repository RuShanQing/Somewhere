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

interface DraftBody {
  id: string;
  recipient: { id: string; nickname: string } | null;
  body: string;
  passageId: string | null;
  updatedAt: string;
}

interface RecipientBody {
  id: string;
  nickname: string;
  city: CityBody;
}

interface SendBody {
  postcardId: string;
  status: string;
  sentAt: string;
  deliverAt: string;
}

let sequence = 0;

function uniqueEmail(prefix: string): string {
  sequence += 1;
  return `${prefix}.${Date.now()}.${sequence}@example.test`;
}

describe('PASSAGE-POSTCARD · 共途通信许可接入邮局（真实 PostgreSQL）', () => {
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
    const nickname = `${prefix}旅人`;
    const response = await server()
      .post('/api/v1/auth/register')
      .send(registerPayload({ email: uniqueEmail(prefix), nickname }))
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

  async function setCity(
    account: Account,
    cityId: string,
    receptionMode = 'OPEN',
  ): Promise<void> {
    await server()
      .patch('/api/v1/profile/me')
      .set('Cookie', account.cookie)
      .send({ cityId, receptionMode })
      .expect(200);
  }

  async function pairWithCities(options: {
    aConsent?: 'ALLOW' | 'PAUSED' | 'CLOSED';
    bReception?: 'OPEN' | 'RESTING' | 'CLOSED';
  } = {}): Promise<{ a: Account; b: Account; passageId: string; city: CityBody }> {
    const a = await register('甲');
    const b = await register('乙');
    const city = await cityAt(0);
    await setCity(a, city.id);
    await setCity(b, city.id, options.bReception ?? 'OPEN');
    const seeded = await seedPassage(app, {
      topic: '海边的冬天',
      participants: [
        { userId: a.id, consentState: options.aConsent ?? 'ALLOW' },
        { userId: b.id },
      ],
    });
    return { a, b, passageId: seeded.id, city };
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

  it('AC-01 参与者绑定共途草稿时收件人由服务端解析为对方', async () => {
    const { a, b, passageId } = await pairWithCities();

    const draft = await createDraft(a, {
      body: '想从这段共途里寄一张。',
      passageId,
    });

    expect(draft.passageId).toBe(passageId);
    expect(draft.recipient?.id).toBe(b.id);
    expect(draft.recipient?.nickname).toBe(b.nickname);

    const text = JSON.stringify(draft);
    expect(text).not.toContain('@example.test');
    expect(text).not.toMatch(/centroidLat|centroidLon|receptionMode/);
  });

  it('AC-01 非参与者不能创建绑定共途的草稿，且不落库', async () => {
    const { passageId } = await pairWithCities();
    const outsider = await register('局外');

    const response = await server()
      .post('/api/v1/postcards/drafts')
      .set('Cookie', outsider.cookie)
      .send({ body: '偷偷写信', passageId })
      .expect(404);
    expect((response.body as ApiErrorBody).code).toBe('RESOURCE_NOT_ACCESSIBLE');

    const count = await prisma.postcardDraft.count({ where: { ownerId: outsider.id } });
    expect(count).toBe(0);
  });

  it('AC-01 收件人与共途对方不一致时 422 且不落库', async () => {
    const { a, passageId } = await pairWithCities();
    const third = await register('第三人');

    const response = await server()
      .post('/api/v1/postcards/drafts')
      .set('Cookie', a.cookie)
      .send({ body: '寄给第三人', passageId, recipientId: third.id })
      .expect(422);
    expect((response.body as ApiErrorBody).code).toBe('VALIDATION_ERROR');

    const count = await prisma.postcardDraft.count({ where: { ownerId: a.id } });
    expect(count).toBe(0);
  });

  it('AC-02 共途收件人列表只返回对方，停泊后为空，非参与者 404', async () => {
    const { a, b, passageId } = await pairWithCities();

    const response = await server()
      .get(`/api/v1/postcards/recipients?passageId=${passageId}`)
      .set('Cookie', a.cookie)
      .expect(200);
    const recipients = response.body as RecipientBody[];
    expect(recipients.map((item) => item.id)).toEqual([b.id]);
    expect(JSON.stringify(recipients)).not.toMatch(/@example\.test|centroidLat|centroidLon/);

    await server()
      .post(`/api/v1/passages/${passageId}/pause`)
      .set('Cookie', b.cookie)
      .expect(200);
    const paused = await server()
      .get(`/api/v1/postcards/recipients?passageId=${passageId}`)
      .set('Cookie', a.cookie)
      .expect(200);
    expect(paused.body).toEqual([]);

    const outsider = await register('局外');
    await server()
      .get(`/api/v1/postcards/recipients?passageId=${passageId}`)
      .set('Cookie', outsider.cookie)
      .expect(404);
  });

  it('AC-03 双方 ALLOW 时可以寄出，收件人为对方并保存 passageId', async () => {
    const { a, b, passageId } = await pairWithCities();
    const draft = await createDraft(a, { body: '从共途寄出。', passageId });

    const response = await server()
      .post(`/api/v1/postcards/drafts/${draft.id}/send`)
      .set('Cookie', a.cookie)
      .set('Idempotency-Key', `passage-${Date.now()}`)
      .expect(201);
    const sent = response.body as SendBody;

    const postcard = await prisma.postcard.findUniqueOrThrow({
      where: { id: sent.postcardId },
    });
    expect(postcard.receiverId).toBe(b.id);
    expect(postcard.passageId).toBe(passageId);
    expect(postcard.status).toBe('IN_TRANSIT');
    expect(postcard.deliverAt.getTime()).toBeGreaterThanOrEqual(postcard.sentAt.getTime());

    const used = await prisma.postcardDraft.findUniqueOrThrow({ where: { id: draft.id } });
    expect(used.sentPostcardId).toBe(sent.postcardId);
  });

  it('AC-03 任一方停泊后发送 409，且不创建明信片、不消耗草稿', async () => {
    const { a, passageId } = await pairWithCities();
    const draft = await createDraft(a, { body: '停泊后不该寄出。', passageId });

    await server()
      .post(`/api/v1/passages/${passageId}/pause`)
      .set('Cookie', a.cookie)
      .expect(200);

    const response = await server()
      .post(`/api/v1/postcards/drafts/${draft.id}/send`)
      .set('Cookie', a.cookie)
      .set('Idempotency-Key', `blocked-${Date.now()}`)
      .expect(409);
    expect((response.body as ApiErrorBody).code).toBe('PASSAGE_STATE_CONFLICT');

    expect(await prisma.postcard.count()).toBe(0);
    const stored = await prisma.postcardDraft.findUniqueOrThrow({ where: { id: draft.id } });
    expect(stored.sentPostcardId).toBeNull();
    expect(stored.passageId).toBe(passageId);
  });

  it('AC-05 共途许可不能绕过接信状态', async () => {
    const { a, passageId } = await pairWithCities({ bReception: 'RESTING' });
    const draft = await createDraft(a, { body: '对方正在休息。', passageId });

    const response = await server()
      .post(`/api/v1/postcards/drafts/${draft.id}/send`)
      .set('Cookie', a.cookie)
      .expect(422);
    expect((response.body as ApiErrorBody).code).toBe('VALIDATION_ERROR');
    expect(await prisma.postcard.count()).toBe(0);
  });

  it('AC-01 已绑定共途的草稿不能把收件人改成第三人', async () => {
    const { a, passageId } = await pairWithCities();
    const third = await register('第三人');
    const draft = await createDraft(a, { body: '先保存。', passageId });

    await server()
      .patch(`/api/v1/postcards/drafts/${draft.id}`)
      .set('Cookie', a.cookie)
      .send({ recipientId: third.id })
      .expect(422);

    const stored = await prisma.postcardDraft.findUniqueOrThrow({ where: { id: draft.id } });
    expect(stored.recipientId).not.toBe(third.id);
  });
});
