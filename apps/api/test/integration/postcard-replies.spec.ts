import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PostcardDeliveryService } from '../../src/modules/postcard/postcard-delivery.service';
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
  updatedAt: string;
}

interface SendBody {
  postcardId: string;
  status: string;
  sentAt: string;
  deliverAt: string;
}

interface DetailBody {
  id: string;
  status: string;
  body: string | null;
  passageId: string | null;
  canReply: boolean;
  sentAt: string;
  deliverAt: string;
  deliveredAt: string | null;
}

interface ApiErrorBody {
  code: string;
  message: string;
  details?: string[];
}

const DEMO_RECIPIENT_EMAIL = 'postcard.recipient@example.test';
let sequence = 0;

function uniqueEmail(prefix: string): string {
  sequence += 1;
  return `${prefix}.${Date.now()}.${sequence}@example.test`;
}

describe('POSTCARD-REPLY · 共途回信与引用（真实 PostgreSQL）', () => {
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
      .set('Idempotency-Key', `reply-${draftId}`)
      .expect(201);
    return response.body as SendBody;
  }

  /** 把信件推进到已过期并运行真实 Worker，不修改延迟公式。 */
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

  async function pairWithPassage(): Promise<{
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
      topic: '回信测试共途',
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

  it('AC-01 收件人回信时收件人、共途与引用由服务端解析', async () => {
    const { a, b, passageId } = await pairWithPassage();
    const sent = await sendPassageCard(a, passageId, '先寄一封原信。');
    await deliver(sent.postcardId);

    const draft = await createDraft(b, {
      body: '这是我慢慢写下的回信。',
      replyToPostcardId: sent.postcardId,
    });

    expect(draft.recipient?.id).toBe(a.id);
    expect(draft.recipient?.nickname).toBe(a.nickname);
    expect(draft.passageId).toBe(passageId);
    expect(draft.replyToPostcardId).toBe(sent.postcardId);

    const text = JSON.stringify(draft);
    expect(text).not.toContain('@example.test');
    expect(text).not.toMatch(/centroidLat|centroidLon|receptionMode/);
  });

  it('AC-01 客户端传入不一致的收件人或共途时 422 且不落库', async () => {
    const { a, b, passageId } = await pairWithPassage();
    const third = await register('第三人');
    const sent = await sendPassageCard(a, passageId, '原信。');
    await deliver(sent.postcardId);

    const wrongRecipient = await server()
      .post('/api/v1/postcards/drafts')
      .set('Cookie', b.cookie)
      .send({
        body: '想绕过共途。',
        replyToPostcardId: sent.postcardId,
        recipientId: third.id,
      })
      .expect(422);
    expect((wrongRecipient.body as ApiErrorBody).code).toBe('VALIDATION_ERROR');

    const wrongPassage = await server()
      .post('/api/v1/postcards/drafts')
      .set('Cookie', b.cookie)
      .send({
        body: '想换一段共途。',
        replyToPostcardId: sent.postcardId,
        passageId: randomUUID(),
      })
      .expect(422);
    expect((wrongPassage.body as ApiErrorBody).code).toBe('VALIDATION_ERROR');

    expect(await prisma.postcardDraft.count({ where: { ownerId: b.id } })).toBe(0);
  });

  it('AC-02 在途、非参与者、回复自己与非共途信都不能回信', async () => {
    const { a, b, passageId } = await pairWithPassage();
    const third = await register('局外');

    const inTransit = await sendPassageCard(a, passageId, '还在路上。');
    const early = await server()
      .post('/api/v1/postcards/drafts')
      .set('Cookie', b.cookie)
      .send({ body: '提前回信。', replyToPostcardId: inTransit.postcardId })
      .expect(404);
    expect((early.body as ApiErrorBody).code).toBe('RESOURCE_NOT_ACCESSIBLE');

    await deliver(inTransit.postcardId);

    const outsider = await server()
      .post('/api/v1/postcards/drafts')
      .set('Cookie', third.cookie)
      .send({ body: '局外人回信。', replyToPostcardId: inTransit.postcardId })
      .expect(404);
    expect((outsider.body as ApiErrorBody).code).toBe('RESOURCE_NOT_ACCESSIBLE');

    const selfReply = await server()
      .post('/api/v1/postcards/drafts')
      .set('Cookie', a.cookie)
      .send({ body: '回复自己。', replyToPostcardId: inTransit.postcardId })
      .expect(422);
    expect((selfReply.body as ApiErrorBody).code).toBe('VALIDATION_ERROR');

    const demo = await register('演示收件人', DEMO_RECIPIENT_EMAIL);
    const city = await cityAt(0);
    await setCity(demo, city.id);
    const plainDraft = await createDraft(a, {
      body: '这是一封不在共途里的信。',
      recipientId: demo.id,
    });
    const plainSent = await sendDraft(a, plainDraft.id);
    await deliver(plainSent.postcardId);

    const notPassage = await server()
      .post('/api/v1/postcards/drafts')
      .set('Cookie', demo.cookie)
      .send({ body: '非共途回信。', replyToPostcardId: plainSent.postcardId })
      .expect(422);
    expect((notPassage.body as ApiErrorBody).code).toBe('VALIDATION_ERROR');

    expect(await prisma.postcardDraft.count({ where: { ownerId: b.id } })).toBe(0);
  });

  it('AC-02 同一原信第二次回信返回 409 POSTCARD_ALREADY_REPLIED', async () => {
    const { a, b, passageId } = await pairWithPassage();
    const sent = await sendPassageCard(a, passageId, '只回一次。');
    await deliver(sent.postcardId);

    const first = await createDraft(b, {
      body: '第一次回信。',
      replyToPostcardId: sent.postcardId,
    });
    await sendDraft(b, first.id);

    const duplicate = await server()
      .post('/api/v1/postcards/drafts')
      .set('Cookie', b.cookie)
      .send({ body: '第二次回信。', replyToPostcardId: sent.postcardId })
      .expect(409);
    expect((duplicate.body as ApiErrorBody).code).toBe('POSTCARD_ALREADY_REPLIED');
    expect(await prisma.postcardDraft.count({ where: { ownerId: b.id } })).toBe(1);
  });

  it('AC-02 停泊与封锁分别返回 409 与 403', async () => {
    const { a, b, passageId } = await pairWithPassage();
    const sent = await sendPassageCard(a, passageId, '先别回。');
    await deliver(sent.postcardId);

    await server()
      .post(`/api/v1/passages/${passageId}/pause`)
      .set('Cookie', a.cookie)
      .expect(200);

    const paused = await server()
      .post('/api/v1/postcards/drafts')
      .set('Cookie', b.cookie)
      .send({ body: '停泊时回信。', replyToPostcardId: sent.postcardId })
      .expect(409);
    expect((paused.body as ApiErrorBody).code).toBe('PASSAGE_STATE_CONFLICT');

    await server()
      .post(`/api/v1/passages/${passageId}/resume`)
      .set('Cookie', a.cookie)
      .expect(200);

    await server()
      .post('/api/v1/safety/blocks')
      .set('Cookie', a.cookie)
      .send({ userId: b.id })
      .expect(200);

    const blocked = await server()
      .post('/api/v1/postcards/drafts')
      .set('Cookie', b.cookie)
      .send({ body: '封锁后回信。', replyToPostcardId: sent.postcardId })
      .expect(403);
    expect((blocked.body as ApiErrorBody).code).toBe('CONTACT_BLOCKED');
  });

  it('AC-03 发送后落库 reply_to_postcard_id，且送达前收件人读不到正文', async () => {
    const { a, b, passageId } = await pairWithPassage();
    const sent = await sendPassageCard(a, passageId, '原信。');
    await deliver(sent.postcardId);

    const draft = await createDraft(b, {
      body: '按距离慢慢抵达的回信。',
      replyToPostcardId: sent.postcardId,
    });
    const reply = await sendDraft(b, draft.id);

    const stored = await prisma.postcard.findUniqueOrThrow({ where: { id: reply.postcardId } });
    expect(stored.replyToPostcardId).toBe(sent.postcardId);
    expect(stored.receiverId).toBe(a.id);
    expect(stored.passageId).toBe(passageId);
    expect(stored.status).toBe('IN_TRANSIT');
    expect(stored.deliverAt.getTime() - stored.sentAt.getTime()).toBe(720 * 60_000);

    const early = await server()
      .get(`/api/v1/postcards/${reply.postcardId}`)
      .set('Cookie', a.cookie)
      .expect(404);
    expect((early.body as ApiErrorBody).code).toBe('RESOURCE_NOT_ACCESSIBLE');

    const senderView = await server()
      .get(`/api/v1/postcards/${reply.postcardId}`)
      .set('Cookie', b.cookie)
      .expect(200);
    expect((senderView.body as DetailBody).body).toBe('按距离慢慢抵达的回信。');
    expect((senderView.body as DetailBody).canReply).toBe(false);

    const used = await prisma.postcardDraft.findUniqueOrThrow({ where: { id: draft.id } });
    expect(used.sentPostcardId).toBe(reply.postcardId);
  });

  it('AC-04 同一原信的并发回信只成功一封', async () => {
    const { a, b, passageId } = await pairWithPassage();
    const sent = await sendPassageCard(a, passageId, '并发回信。');
    await deliver(sent.postcardId);

    const first = await createDraft(b, {
      body: '第一封并发回信。',
      replyToPostcardId: sent.postcardId,
    });
    const second = await createDraft(b, {
      body: '第二封并发回信。',
      replyToPostcardId: sent.postcardId,
    });

    const [left, right] = await Promise.all([
      server()
        .post(`/api/v1/postcards/drafts/${first.id}/send`)
        .set('Cookie', b.cookie)
        .set('Idempotency-Key', `race-left-${first.id}`),
      server()
        .post(`/api/v1/postcards/drafts/${second.id}/send`)
        .set('Cookie', b.cookie)
        .set('Idempotency-Key', `race-right-${second.id}`),
    ]);

    const statuses = [left.status, right.status].sort((x, y) => x - y);
    expect(statuses).toEqual([201, 409]);
    const rejected = left.status === 409 ? left : right;
    expect((rejected.body as ApiErrorBody).code).toBe('POSTCARD_ALREADY_REPLIED');

    const replies = await prisma.postcard.count({
      where: { replyToPostcardId: sent.postcardId },
    });
    expect(replies).toBe(1);

    const unsent = await prisma.postcardDraft.findMany({
      where: { id: { in: [first.id, second.id] } },
    });
    expect(unsent.filter((draft) => draft.sentPostcardId === null)).toHaveLength(1);
  });

  it('AC-05 canReply 随送达、停泊/续程与已回信变化', async () => {
    const { a, b, passageId } = await pairWithPassage();
    const sent = await sendPassageCard(a, passageId, '查看回信资格。');
    await deliver(sent.postcardId);

    const receiverBefore = await server()
      .get(`/api/v1/postcards/${sent.postcardId}`)
      .set('Cookie', b.cookie)
      .expect(200);
    expect((receiverBefore.body as DetailBody).canReply).toBe(true);
    expect((receiverBefore.body as DetailBody).passageId).toBe(passageId);

    const senderView = await server()
      .get(`/api/v1/postcards/${sent.postcardId}`)
      .set('Cookie', a.cookie)
      .expect(200);
    expect((senderView.body as DetailBody).canReply).toBe(false);

    await server()
      .post(`/api/v1/passages/${passageId}/pause`)
      .set('Cookie', b.cookie)
      .expect(200);
    const paused = await server()
      .get(`/api/v1/postcards/${sent.postcardId}`)
      .set('Cookie', b.cookie)
      .expect(200);
    expect((paused.body as DetailBody).canReply).toBe(false);

    await server()
      .post(`/api/v1/passages/${passageId}/resume`)
      .set('Cookie', b.cookie)
      .expect(200);

    const draft = await createDraft(b, {
      body: '回完就不能再回。',
      replyToPostcardId: sent.postcardId,
    });
    await sendDraft(b, draft.id);

    const replied = await server()
      .get(`/api/v1/postcards/${sent.postcardId}`)
      .set('Cookie', b.cookie)
      .expect(200);
    expect((replied.body as DetailBody).canReply).toBe(false);
  });

  it('AC-05 回信草稿不可改绑收件人或回复引用', async () => {
    const { a, b, passageId } = await pairWithPassage();
    const third = await register('第三人');
    const sent = await sendPassageCard(a, passageId, '锁定回信引用。');
    await deliver(sent.postcardId);

    const draft = await createDraft(b, {
      body: '先保存的回信。',
      replyToPostcardId: sent.postcardId,
    });

    const changedRecipient = await server()
      .patch(`/api/v1/postcards/drafts/${draft.id}`)
      .set('Cookie', b.cookie)
      .send({ recipientId: third.id })
      .expect(422);
    expect((changedRecipient.body as ApiErrorBody).code).toBe('VALIDATION_ERROR');

    const changedReply = await server()
      .patch(`/api/v1/postcards/drafts/${draft.id}`)
      .set('Cookie', b.cookie)
      .send({ replyToPostcardId: randomUUID() })
      .expect(422);
    expect((changedReply.body as ApiErrorBody).code).toBe('VALIDATION_ERROR');

    const stored = await prisma.postcardDraft.findUniqueOrThrow({ where: { id: draft.id } });
    expect(stored.replyToPostcardId).toBe(sent.postcardId);
    expect(stored.recipientId).toBe(a.id);
  });
});
