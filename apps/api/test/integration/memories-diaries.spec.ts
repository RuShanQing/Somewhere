import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MemoryService } from '../../src/modules/memory/memory.service';
import { PostcardDeliveryService } from '../../src/modules/postcard/postcard-delivery.service';
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

interface Account {
  id: string;
  nickname: string;
  email: string;
  cookie: string;
}

interface CityBody {
  id: string;
  name: string;
  countryCode: string;
}

interface DraftBody {
  id: string;
  recipient: { id: string; nickname: string } | null;
  body: string;
  passageId: string | null;
  replyToPostcardId: string | null;
}

interface SendBody {
  postcardId: string;
  status: string;
  sentAt: string;
  deliverAt: string;
}

interface DiarySummaryBody {
  id: string;
  passageId: string;
  topic: string;
  leftCity: CityBody;
  rightCity: CityBody;
  leftSentAt: string;
  rightSentAt: string;
  createdAt: string;
}

interface DiaryPostcardBody {
  id: string;
  senderNickname: string;
  body: string;
  sentAt: string;
  deliveredAt: string | null;
  city: CityBody;
}

interface DiaryDetailBody {
  id: string;
  passageId: string;
  topic: string;
  createdAt: string;
  left: DiaryPostcardBody;
  right: DiaryPostcardBody;
}

interface ApiErrorBody {
  code: string;
  message: string;
}

let sequence = 0;

function uniqueEmail(prefix: string): string {
  sequence += 1;
  return `${prefix}.${Date.now()}.${sequence}@example.test`;
}

describe('MEMORY-02/03 · 双城日记生成、列表与只读双页（真实 PostgreSQL）', () => {
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

  async function setCity(account: Account, cityId: string): Promise<void> {
    await server()
      .patch('/api/v1/profile/me')
      .set('Cookie', account.cookie)
      .send({ cityId, receptionMode: 'OPEN' })
      .expect(200);
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

  async function sendDraft(account: Account, draftId: string): Promise<SendBody> {
    const response = await server()
      .post(`/api/v1/postcards/drafts/${draftId}/send`)
      .set('Cookie', account.cookie)
      .set('Idempotency-Key', `diary-${draftId}`)
      .expect(201);
    return response.body as SendBody;
  }

  async function deliver(postcardId: string): Promise<void> {
    const past = new Date(Date.now() - 60_000);
    await prisma.postcard.update({
      where: { id: postcardId },
      data: {
        sentAt: new Date(past.getTime() - 12 * 60 * 60 * 1000),
        deliverAt: past,
      },
    });
    const delivered = await app.get(PostcardDeliveryService).deliverDue();
    expect(delivered).toBeGreaterThanOrEqual(1);
  }

  async function createPassagePair(): Promise<{
    a: Account;
    b: Account;
    passageId: string;
    city: CityBody;
  }> {
    const a = await register('甲');
    const b = await register('乙');
    const city = await cityAt(0);
    await setCity(a, city.id);
    await setCity(b, city.id);
    const seeded = await seedPassage(app, {
      topic: '雨夜的东京',
      participants: [{ userId: a.id }, { userId: b.id }],
    });
    return { a, b, passageId: seeded.id, city };
  }

  async function sendPassageCard(
    sender: Account,
    passageId: string,
    body: string,
  ): Promise<SendBody> {
    const draft = await createDraft(sender, { body, passageId });
    return sendDraft(sender, draft.id);
  }

  async function sendReply(
    receiver: Account,
    targetId: string,
    body: string,
  ): Promise<SendBody> {
    const draft = await createDraft(receiver, {
      body,
      replyToPostcardId: targetId,
    });
    return sendDraft(receiver, draft.id);
  }

  async function generate(): Promise<number> {
    return app.get(MemoryService).generateDueDiaries();
  }

  async function listDiaries(
    account: Account,
    query = '',
  ): Promise<DiarySummaryBody[]> {
    const response = await server()
      .get(`/api/v1/memories/diaries${query}`)
      .set('Cookie', account.cookie)
      .expect(200);
    return (response.body as { items: DiarySummaryBody[] }).items;
  }

  async function completeExchange(
    a: Account,
    b: Account,
    passageId: string,
  ): Promise<{ originalId: string; replyId: string }> {
    const original = await sendPassageCard(a, passageId, '这是慢慢寄出的原信。');
    await deliver(original.postcardId);
    const reply = await sendReply(b, original.postcardId, '这是慢慢抵达的回信。');
    await deliver(reply.postcardId);
    return { originalId: original.postcardId, replyId: reply.postcardId };
  }

  it('AC-01 两封均送达后生成一页，重复生成不重复', async () => {
    const { a, b, passageId } = await createPassagePair();
    const original = await sendPassageCard(a, passageId, '原信。');
    await deliver(original.postcardId);

    expect(await generate()).toBe(0);
    expect(await listDiaries(a)).toEqual([]);

    const reply = await sendReply(b, original.postcardId, '回信。');
    expect(await generate()).toBe(0);
    expect(await listDiaries(a)).toEqual([]);

    await deliver(reply.postcardId);
    expect(await generate()).toBe(1);
    expect(await generate()).toBe(0);

    const pages = await prisma.diaryPage.findMany();
    expect(pages).toHaveLength(1);
    expect(pages[0]?.passageId).toBe(passageId);
    expect(pages[0]?.postcardLeftId).toBe(original.postcardId);
    expect(pages[0]?.postcardRightId).toBe(reply.postcardId);
  });

  it('AC-02 列表只返回参与者与元数据，不含正文', async () => {
    const { a, b, passageId } = await createPassagePair();
    const outsider = await register('局外');
    await completeExchange(a, b, passageId);
    await generate();

    const items = await listDiaries(a);
    expect(items).toHaveLength(1);
    expect(Object.keys(items[0]!).sort()).toEqual([
      'createdAt',
      'id',
      'leftCity',
      'leftSentAt',
      'passageId',
      'rightCity',
      'rightSentAt',
      'topic',
    ]);
    expect(items[0]?.topic).toBe('雨夜的东京');
    expect(items[0]?.leftCity.id).toBe(items[0]?.rightCity.id);

    const text = JSON.stringify(items);
    expect(text).not.toContain('这是慢慢寄出的原信。');
    expect(text).not.toContain('这是慢慢抵达的回信。');
    expect(text).not.toContain('@example.test');
    expect(text).not.toMatch(/userId|ownerId|centroidLat|centroidLon/);

    expect(await listDiaries(b)).toHaveLength(1);
    expect(await listDiaries(outsider)).toEqual([]);

    await promoteToAdmin(app, outsider.id);
    expect(await listDiaries(outsider)).toEqual([]);
  });

  it('AC-03 只有双方可读详情，第三人、ADMIN 与非法 ID 统一 404', async () => {
    const { a, b, passageId } = await createPassagePair();
    const outsider = await register('局外');
    await completeExchange(a, b, passageId);
    await generate();
    const pageId = (await listDiaries(a))[0]?.id;
    expect(pageId).toBeTruthy();

    const forA = await server()
      .get(`/api/v1/memories/diaries/${pageId}`)
      .set('Cookie', a.cookie)
      .expect(200);
    const detailA = forA.body as DiaryDetailBody;
    expect(detailA.left.body).toBe('这是慢慢寄出的原信。');
    expect(detailA.right.body).toBe('这是慢慢抵达的回信。');
    expect(Object.keys(detailA).sort()).toEqual([
      'createdAt',
      'id',
      'left',
      'passageId',
      'right',
      'topic',
    ]);
    expect(Object.keys(detailA.left).sort()).toEqual([
      'body',
      'city',
      'deliveredAt',
      'id',
      'senderNickname',
      'sentAt',
    ]);
    expect(JSON.stringify(detailA)).not.toMatch(/userId|ownerId|email|centroidLat/);

    await server()
      .get(`/api/v1/memories/diaries/${pageId}`)
      .set('Cookie', b.cookie)
      .expect(200);

    const outsiderResponse = await server()
      .get(`/api/v1/memories/diaries/${pageId}`)
      .set('Cookie', outsider.cookie)
      .expect(404);
    expect((outsiderResponse.body as ApiErrorBody).code).toBe('RESOURCE_NOT_ACCESSIBLE');

    await promoteToAdmin(app, outsider.id);
    await server()
      .get(`/api/v1/memories/diaries/${pageId}`)
      .set('Cookie', outsider.cookie)
      .expect(404);

    await server()
      .get(`/api/v1/memories/diaries/${randomUUID()}`)
      .set('Cookie', a.cookie)
      .expect(404);
    await server()
      .get('/api/v1/memories/diaries/not-a-uuid')
      .set('Cookie', a.cookie)
      .expect(404);
    await server().get('/api/v1/memories/diaries').expect(401);
  });

  it('AC-04 受限页面隐藏；停泊、完成与归档不删除历史', async () => {
    const { a, b, passageId } = await createPassagePair();
    const exchange = await completeExchange(a, b, passageId);
    await generate();
    const pageId = (await listDiaries(a))[0]?.id;
    expect(pageId).toBeTruthy();

    await server()
      .post(`/api/v1/passages/${passageId}/pause`)
      .set('Cookie', a.cookie)
      .expect(200);
    expect(await listDiaries(a)).toHaveLength(1);
    await server()
      .get(`/api/v1/memories/diaries/${pageId}`)
      .set('Cookie', a.cookie)
      .expect(200);

    await server()
      .post(`/api/v1/passages/${passageId}/resume`)
      .set('Cookie', a.cookie)
      .expect(200);
    await server()
      .post(`/api/v1/passages/${passageId}/complete`)
      .set('Cookie', a.cookie)
      .expect(200);
    await server()
      .post(`/api/v1/passages/${passageId}/archive`)
      .set('Cookie', a.cookie)
      .expect(200);

    expect(await listDiaries(a)).toHaveLength(1);
    await server()
      .get(`/api/v1/memories/diaries/${pageId}`)
      .set('Cookie', a.cookie)
      .expect(200);

    await prisma.postcard.update({
      where: { id: exchange.replyId },
      data: { status: 'RESTRICTED' },
    });
    expect(await listDiaries(a)).toEqual([]);
    await server()
      .get(`/api/v1/memories/diaries/${pageId}`)
      .set('Cookie', a.cookie)
      .expect(404);
  });

  it('AC-05 数据库拒绝自指与重复页面', async () => {
    const { a, b, passageId } = await createPassagePair();
    const exchange = await completeExchange(a, b, passageId);
    await generate();

    await expect(
      prisma.diaryPage.create({
        data: {
          passageId,
          postcardLeftId: exchange.originalId,
          postcardRightId: exchange.originalId,
        },
      }),
    ).rejects.toBeTruthy();

    await expect(
      prisma.diaryPage.create({
        data: {
          passageId,
          postcardLeftId: exchange.originalId,
          postcardRightId: exchange.replyId,
        },
      }),
    ).rejects.toBeTruthy();
  });

  it('AC-02 分页与同共途多页', async () => {
    const { a, b, passageId } = await createPassagePair();
    await completeExchange(a, b, passageId);
    await generate();

    const secondOriginal = await sendPassageCard(a, passageId, '第二轮原信。');
    await deliver(secondOriginal.postcardId);
    const secondReply = await sendReply(b, secondOriginal.postcardId, '第二轮回信。');
    await deliver(secondReply.postcardId);
    expect(await generate()).toBe(1);

    const all = await listDiaries(a);
    expect(all).toHaveLength(2);
    expect(new Set(all.map((item) => item.id)).size).toBe(2);

    const firstPage = await listDiaries(a, '?limit=1&offset=0');
    const secondPage = await listDiaries(a, '?limit=1&offset=1');
    expect(firstPage).toHaveLength(1);
    expect(secondPage).toHaveLength(1);
    expect(firstPage[0]?.id).not.toBe(secondPage[0]?.id);

    await server()
      .get('/api/v1/memories/diaries?limit=0')
      .set('Cookie', a.cookie)
      .expect(422);
    await server()
      .get('/api/v1/memories/diaries?limit=51')
      .set('Cookie', a.cookie)
      .expect(422);
  });
});
