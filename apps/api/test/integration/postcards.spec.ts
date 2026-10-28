import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PostcardDeliveryService } from '../../src/modules/postcard/postcard-delivery.service';
import { PrismaService } from '../../src/prisma/prisma.service';
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

interface DraftBody {
  id: string;
  recipient: { id: string; nickname: string } | null;
  body: string;
  updatedAt: string;
}

interface SendBody {
  postcardId: string;
  status: string;
  sentAt: string;
  deliverAt: string;
}

interface SummaryBody {
  incoming: Array<{ id: string; senderNickname: string; deliveredAt: string }>;
  inTransit: Array<{ id: string; deliverAt: string; stage: string }>;
  drafts: Array<{ id: string; updatedAt: string }>;
}

interface DetailBody {
  id: string;
  status: string;
  body: string | null;
  sentAt: string;
  deliverAt: string;
  deliveredAt: string | null;
  sender: { id: string; nickname: string };
  receiver: { id: string; nickname: string };
  originCity: CityBody;
  destinationCity: CityBody;
}

const DEMO_RECIPIENT_EMAIL = 'postcard.recipient@example.test';
let sequence = 0;

function uniqueEmail(prefix: string): string {
  sequence += 1;
  return `${prefix}.${Date.now()}.${sequence}@example.test`;
}

describe('POSTCARD · 草稿、距离延迟、在途保密与投递（真实 PostgreSQL）', () => {
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

  async function registerDemoRecipient(): Promise<Account> {
    return register('收件人', DEMO_RECIPIENT_EMAIL);
  }

  async function cityAt(index: number): Promise<CityBody> {
    const response = await server().get('/api/v1/cities').expect(200);
    const cities = response.body as CityBody[];
    const city = cities[index];
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
    input: { body?: string; recipientId?: string | null } = {},
  ): Promise<DraftBody> {
    const response = await server()
      .post('/api/v1/postcards/drafts')
      .set('Cookie', account.cookie)
      .send({
        body: input.body ?? '海风把这句话吹慢了一点。',
        ...(input.recipientId !== undefined ? { recipientId: input.recipientId } : {}),
      })
      .expect(201);
    return response.body as DraftBody;
  }

  async function sendDraft(
    account: Account,
    draftId: string,
    idempotencyKey?: string,
  ): Promise<SendBody> {
    const call = server()
      .post(`/api/v1/postcards/drafts/${draftId}/send`)
      .set('Cookie', account.cookie);
    if (idempotencyKey) {
      call.set('Idempotency-Key', idempotencyKey);
    }
    const response = await call.expect(201);
    return response.body as SendBody;
  }

  async function summary(account: Account): Promise<SummaryBody> {
    const response = await server()
      .get('/api/v1/post-office/summary')
      .set('Cookie', account.cookie)
      .expect(200);
    return response.body as SummaryBody;
  }

  it('AC-04 所有邮局接口未登录返回 401 AUTH_REQUIRED', async () => {
    const missingId = '00000000-0000-4000-8000-000000000000';
    const calls = [
      () => server().get('/api/v1/postcards/recipients'),
      () => server().get('/api/v1/post-office/summary'),
      () => server().get('/api/v1/postcards/drafts'),
      () => server().get(`/api/v1/postcards/drafts/${missingId}`),
      () => server().get('/api/v1/postcards/transit'),
      () => server().get('/api/v1/postcards/inbox'),
      () => server().get(`/api/v1/postcards/${missingId}`),
      () => server().post('/api/v1/postcards/drafts').send({ body: '未登录' }),
      () => server().patch(`/api/v1/postcards/drafts/${missingId}`).send({ body: '未登录' }),
      () => server().delete(`/api/v1/postcards/drafts/${missingId}`),
      () => server().post(`/api/v1/postcards/drafts/${missingId}/send`),
    ];

    for (const call of calls) {
      const response = await call().expect(401);
      expect((response.body as ApiErrorBody).code).toBe('AUTH_REQUIRED');
    }
  });

  it('AC-01 收件人只来自服务端白名单，且不暴露邮箱与坐标', async () => {
    const recipient = await registerDemoRecipient();
    await setCity(recipient, (await cityAt(0)).id);

    const outsider = await register('局外人');
    await setCity(outsider, (await cityAt(1)).id);

    const sender = await register('寄件人');
    const response = await server()
      .get('/api/v1/postcards/recipients')
      .set('Cookie', sender.cookie)
      .expect(200);
    const recipients = response.body as Array<{
      id: string;
      nickname: string;
      city: CityBody;
      email?: unknown;
    }>;

    expect(recipients).toHaveLength(1);
    expect(recipients[0]?.id).toBe(recipient.id);
    expect(Object.keys(recipients[0] ?? {}).sort()).toEqual(['city', 'id', 'nickname']);
    expect(Object.keys(recipients[0]?.city ?? {}).sort()).toEqual(['countryCode', 'id', 'name']);
    expect(JSON.stringify(recipients)).not.toContain('@example.test');
    expect(JSON.stringify(recipients)).not.toContain('centroid');
  });

  it('AC-02 草稿仅作者可读写，正文长度与全空白校验生效', async () => {
    const owner = await register('草稿主人');
    const other = await register('旁观者');

    const created = await createDraft(owner, { body: '  第一封慢信  ' });
    expect(Object.keys(created).sort()).toEqual(['body', 'id', 'recipient', 'updatedAt']);
    expect(created.body).toBe('第一封慢信');
    expect(created.recipient).toBeNull();

    const list = await server()
      .get('/api/v1/postcards/drafts')
      .set('Cookie', owner.cookie)
      .expect(200);
    expect((list.body as DraftBody[]).map((item) => item.id)).toEqual([created.id]);

    const updated = await server()
      .patch(`/api/v1/postcards/drafts/${created.id}`)
      .set('Cookie', owner.cookie)
      .send({ body: '改短一点，也慢一点。' })
      .expect(200);
    expect((updated.body as DraftBody).body).toBe('改短一点，也慢一点。');

    await server()
      .get(`/api/v1/postcards/drafts/${created.id}`)
      .set('Cookie', other.cookie)
      .expect(404);
    await server()
      .patch(`/api/v1/postcards/drafts/${created.id}`)
      .set('Cookie', other.cookie)
      .send({ body: '不属于我的修改' })
      .expect(404);
    await server()
      .delete(`/api/v1/postcards/drafts/${created.id}`)
      .set('Cookie', other.cookie)
      .expect(404);

    const tooLong = await server()
      .post('/api/v1/postcards/drafts')
      .set('Cookie', owner.cookie)
      .send({ body: '慢'.repeat(2001) })
      .expect(422);
    expect((tooLong.body as ApiErrorBody).code).toBe('VALIDATION_ERROR');

    const blank = await server()
      .post('/api/v1/postcards/drafts')
      .set('Cookie', owner.cookie)
      .send({ body: ' \n\t ' })
      .expect(422);
    expect((blank.body as ApiErrorBody).code).toBe('VALIDATION_ERROR');

    const extra = await server()
      .post('/api/v1/postcards/drafts')
      .set('Cookie', owner.cookie)
      .send({ body: '合法正文', status: 'DELIVERED' })
      .expect(422);
    expect((extra.body as ApiErrorBody).code).toBe('VALIDATION_ERROR');

    const unknownRecipient = await server()
      .post('/api/v1/postcards/drafts')
      .set('Cookie', owner.cookie)
      .send({
        body: '写给一个不存在的账号',
        recipientId: '00000000-0000-4000-8000-000000000000',
      })
      .expect(404);
    expect((unknownRecipient.body as ApiErrorBody).code).toBe('RESOURCE_NOT_ACCESSIBLE');

    await server()
      .delete(`/api/v1/postcards/drafts/${created.id}`)
      .set('Cookie', owner.cookie)
      .expect(204);
    const afterDelete = await server()
      .get('/api/v1/postcards/drafts')
      .set('Cookie', owner.cookie)
      .expect(200);
    expect(afterDelete.body).toEqual([]);
  });

  it('AC-02 正文按 Unicode 码点计数：2000 个 emoji 可保存，2001 个被拒绝', async () => {
    const owner = await register('码点旅人');
    const accepted = await createDraft(owner, { body: '🌊'.repeat(2000) });
    expect(Array.from(accepted.body)).toHaveLength(2000);

    await server()
      .post('/api/v1/postcards/drafts')
      .set('Cookie', owner.cookie)
      .send({ body: '🌊'.repeat(2001) })
      .expect(422);
  });

  it('AC-03 发送成功：服务端生成时间与城市快照，同城为 12 小时', async () => {
    const recipient = await registerDemoRecipient();
    const sameCity = await cityAt(0);
    await setCity(recipient, sameCity.id);
    const sender = await register('寄件人');
    await setCity(sender, sameCity.id);

    const draft = await createDraft(sender, { recipientId: recipient.id });
    const sent = await sendDraft(sender, draft.id, 'send-once-key');

    expect(Object.keys(sent).sort()).toEqual(['deliverAt', 'postcardId', 'sentAt', 'status']);
    expect(sent.status).toBe('IN_TRANSIT');
    expect(new Date(sent.deliverAt).getTime() - new Date(sent.sentAt).getTime()).toBe(720 * 60_000);

    const row = await prisma.postcard.findUnique({ where: { id: sent.postcardId } });
    expect(row).not.toBeNull();
    expect(row?.senderId).toBe(sender.id);
    expect(row?.receiverId).toBe(recipient.id);
    expect(row?.originCityId).toBe(sameCity.id);
    expect(row?.destinationCityId).toBe(sameCity.id);
    expect(row?.deliveredAt).toBeNull();

    const senderDetail = await server()
      .get(`/api/v1/postcards/${sent.postcardId}`)
      .set('Cookie', sender.cookie)
      .expect(200);
    expect((senderDetail.body as DetailBody).body).toBe(draft.body);

    const receiverDetail = await server()
      .get(`/api/v1/postcards/${sent.postcardId}`)
      .set('Cookie', recipient.cookie)
      .expect(404);
    expect((receiverDetail.body as ApiErrorBody).code).toBe('RESOURCE_NOT_ACCESSIBLE');

    const receiverSummary = await summary(recipient);
    expect(receiverSummary.incoming).toEqual([]);
    expect(JSON.stringify(receiverSummary)).not.toContain('"body"');

    const receiverInbox = await server()
      .get('/api/v1/postcards/inbox')
      .set('Cookie', recipient.cookie)
      .expect(200);
    expect(receiverInbox.body).toEqual([]);

    const senderSummary = await summary(sender);
    expect(senderSummary.incoming).toEqual([]);
    expect(senderSummary.inTransit).toHaveLength(1);
    expect(Object.keys(senderSummary.inTransit[0] ?? {}).sort()).toEqual([
      'deliverAt',
      'id',
      'stage',
    ]);
    expect(JSON.stringify(senderSummary)).not.toContain('"body"');
    expect(JSON.stringify(senderSummary)).not.toContain('@example.test');

    const transit = await server()
      .get('/api/v1/postcards/transit')
      .set('Cookie', sender.cookie)
      .expect(200);
    expect(transit.body).toHaveLength(1);
    expect(Object.keys((transit.body as Array<Record<string, unknown>>)[0] ?? {}).sort()).toEqual([
      'deliverAt',
      'id',
      'stage',
    ]);
    expect(JSON.stringify(transit.body)).not.toContain('"body"');
  });

  it('AC-03 同一草稿重复发送与同一幂等键都不会产生第二张明信片', async () => {
    const recipient = await registerDemoRecipient();
    await setCity(recipient, (await cityAt(0)).id);
    const sender = await register('重复寄件人');
    await setCity(sender, (await cityAt(1)).id);

    const draft = await createDraft(sender, { recipientId: recipient.id });
    const first = await sendDraft(sender, draft.id);
    const second = await sendDraft(sender, draft.id);
    expect(second.postcardId).toBe(first.postcardId);
    expect(await prisma.postcard.count()).toBe(1);

    const anotherDraft = await createDraft(sender, { recipientId: recipient.id, body: '另一封信' });
    const secondPostcard = await sendDraft(sender, anotherDraft.id, 'send-once-key');
    expect(secondPostcard.postcardId).not.toBe(first.postcardId);
    const replay = await sendDraft(sender, anotherDraft.id, 'send-once-key');
    expect(replay.postcardId).toBe(secondPostcard.postcardId);
    expect(await prisma.postcard.count()).toBe(2);

    const drafts = await server()
      .get('/api/v1/postcards/drafts')
      .set('Cookie', sender.cookie)
      .expect(200);
    expect(drafts.body).toEqual([]);

    await server()
      .get(`/api/v1/postcards/drafts/${anotherDraft.id}`)
      .set('Cookie', sender.cookie)
      .expect(404);

    const invalidKey = await server()
      .post(`/api/v1/postcards/drafts/${anotherDraft.id}/send`)
      .set('Cookie', sender.cookie)
      .set('Idempotency-Key', 'has space')
      .expect(422);
    expect((invalidKey.body as ApiErrorBody).details?.join(',')).toContain('idempotencyKey');
  });

  it('AC-03 发送拒绝缺城市、自我发送、非白名单、休息中收件人', async () => {
    const recipient = await registerDemoRecipient();
    const city = await cityAt(0);
    await setCity(recipient, city.id);
    const sender = await register('校验寄件人');

    const noCityDraft = await createDraft(sender, { recipientId: recipient.id });
    const noCity = await server()
      .post(`/api/v1/postcards/drafts/${noCityDraft.id}/send`)
      .set('Cookie', sender.cookie)
      .expect(422);
    expect((noCity.body as ApiErrorBody).details?.join(',')).toContain('senderCity');

    await setCity(sender, city.id);
    // 草稿接口本身也限制收件人来源；这里直接落库，专门验证发送层仍会拒绝。
    const selfDraft = await prisma.postcardDraft.create({
      data: { ownerId: sender.id, recipientId: sender.id, body: '寄给自己' },
    });
    const self = await server()
      .post(`/api/v1/postcards/drafts/${selfDraft.id}/send`)
      .set('Cookie', sender.cookie)
      .expect(422);
    expect((self.body as ApiErrorBody).details?.join(',')).toContain('recipient:self');

    const outsider = await register('非白名单');
    await setCity(outsider, city.id);
    const outsiderDraft = await prisma.postcardDraft.create({
      data: { ownerId: sender.id, recipientId: outsider.id, body: '写给非白名单' },
    });
    const notAllowed = await server()
      .post(`/api/v1/postcards/drafts/${outsiderDraft.id}/send`)
      .set('Cookie', sender.cookie)
      .expect(404);
    expect((notAllowed.body as ApiErrorBody).code).toBe('RESOURCE_NOT_ACCESSIBLE');

    await setCity(recipient, city.id, 'RESTING');
    const restingDraft = await createDraft(sender, { recipientId: recipient.id });
    const resting = await server()
      .post(`/api/v1/postcards/drafts/${restingDraft.id}/send`)
      .set('Cookie', sender.cookie)
      .expect(422);
    expect((resting.body as ApiErrorBody).details?.join(',')).toContain('recipient:notReceiving');
  });

  it('AC-03 每日上限为 10 张成功寄出，第 11 张返回 429', async () => {
    const recipient = await registerDemoRecipient();
    const city = await cityAt(0);
    await setCity(recipient, city.id);
    const sender = await register('限额寄件人');
    await setCity(sender, city.id);

    for (let index = 0; index < 10; index += 1) {
      const draft = await createDraft(sender, {
        recipientId: recipient.id,
        body: `第 ${index + 1} 封信`,
      });
      await sendDraft(sender, draft.id);
    }

    const eleventh = await createDraft(sender, { recipientId: recipient.id, body: '第十一封信' });
    const response = await server()
      .post(`/api/v1/postcards/drafts/${eleventh.id}/send`)
      .set('Cookie', sender.cookie)
      .expect(429);
    expect((response.body as ApiErrorBody).code).toBe('RATE_LIMITED');
    expect(await prisma.postcard.count()).toBe(10);

    const stillDraft = await server()
      .get(`/api/v1/postcards/drafts/${eleventh.id}`)
      .set('Cookie', sender.cookie)
      .expect(200);
    expect((stillDraft.body as DraftBody).body).toBe('第十一封信');
  });

  it('AC-03 发送后修改双方城市不改变旧信的 deliverAt', async () => {
    const recipient = await registerDemoRecipient();
    await setCity(recipient, (await cityAt(0)).id);
    const sender = await register('搬家寄件人');
    await setCity(sender, (await cityAt(1)).id);

    const draft = await createDraft(sender, { recipientId: recipient.id });
    const sent = await sendDraft(sender, draft.id);

    const anotherCity = await cityAt(2);
    await setCity(sender, anotherCity.id);
    await setCity(recipient, anotherCity.id);

    const detail = await server()
      .get(`/api/v1/postcards/${sent.postcardId}`)
      .set('Cookie', sender.cookie)
      .expect(200);
    expect((detail.body as DetailBody).deliverAt).toBe(sent.deliverAt);
    expect((detail.body as DetailBody).originCity.id).not.toBe(anotherCity.id);
  });

  it('AC-05 Worker 只投递一次：到期前不投递，重复扫描不覆盖 deliveredAt', async () => {
    const recipient = await registerDemoRecipient();
    await setCity(recipient, (await cityAt(0)).id);
    const sender = await register('等待投递');
    await setCity(sender, (await cityAt(1)).id);

    const draft = await createDraft(sender, { recipientId: recipient.id });
    const sent = await sendDraft(sender, draft.id);
    const delivery = app.get(PostcardDeliveryService);

    expect(await delivery.deliverDue()).toBe(0);

    const past = new Date(Date.now() - 60_000);
    await prisma.postcard.update({
      where: { id: sent.postcardId },
      data: {
        sentAt: new Date(past.getTime() - 12 * 60 * 60 * 1000),
        deliverAt: past,
      },
    });

    expect(await delivery.deliverDue()).toBe(1);
    const delivered = await prisma.postcard.findUnique({ where: { id: sent.postcardId } });
    expect(delivered?.status).toBe('DELIVERED');
    expect(delivered?.deliveredAt).not.toBeNull();
    const deliveredAt = delivered?.deliveredAt?.getTime();

    expect(await delivery.deliverDue()).toBe(0);
    const afterSecondScan = await prisma.postcard.findUnique({
      where: { id: sent.postcardId },
    });
    expect(afterSecondScan?.deliveredAt?.getTime()).toBe(deliveredAt);

    const inbox = await server()
      .get('/api/v1/postcards/inbox')
      .set('Cookie', recipient.cookie)
      .expect(200);
    expect(inbox.body).toHaveLength(1);
    const item = (inbox.body as Array<{ id: string; senderNickname: string; deliveredAt: string }>)[0];
    expect(item?.id).toBe(sent.postcardId);
    expect(item?.senderNickname).toBe(sender.nickname);

    const detail = await server()
      .get(`/api/v1/postcards/${sent.postcardId}`)
      .set('Cookie', recipient.cookie)
      .expect(200);
    expect((detail.body as DetailBody).body).toBe(draft.body);
    expect((detail.body as DetailBody).deliveredAt).not.toBeNull();

    const receiverSummary = await summary(recipient);
    expect(receiverSummary.incoming).toHaveLength(1);
    expect(JSON.stringify(receiverSummary)).not.toContain('"body"');

    const senderSummary = await summary(sender);
    expect(senderSummary.inTransit).toEqual([]);

    // 并发扫描同一封到期信：两轮扫描合计只能有 1 次投递。
    const secondDraft = await createDraft(sender, {
      recipientId: recipient.id,
      body: '第二封用来验证并发扫描。',
    });
    const secondSent = await sendDraft(sender, secondDraft.id);
    const secondPast = new Date(Date.now() - 30_000);
    await prisma.postcard.update({
      where: { id: secondSent.postcardId },
      data: {
        sentAt: new Date(secondPast.getTime() - 12 * 60 * 60 * 1000),
        deliverAt: secondPast,
      },
    });
    const [firstScan, secondScan] = await Promise.all([
      delivery.deliverDue(),
      delivery.deliverDue(),
    ]);
    expect(firstScan + secondScan).toBe(1);

    const inboxAfterConcurrentScan = await server()
      .get('/api/v1/postcards/inbox')
      .set('Cookie', recipient.cookie)
      .expect(200);
    expect(inboxAfterConcurrentScan.body).toHaveLength(2);
  });
});
