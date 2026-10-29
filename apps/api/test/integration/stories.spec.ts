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

interface StoryBody {
  id: string;
  title: string;
  body: string;
  topicTags: string[];
  reviewStatus: string;
  city: CityBody;
  submittedAt: string | null;
  reviewedAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PublicStoryItem {
  id: string;
  title: string;
  excerpt: string;
  topicTags: string[];
  authorNickname: string;
  city: CityBody;
  publishedAt: string;
}

interface PublicStoryDetail extends Omit<PublicStoryItem, 'excerpt'> {
  body: string;
}

interface PublicListBody {
  items: PublicStoryItem[];
  nextCursor: string | null;
}

interface ModerationQueueBody {
  items: Array<{
    id: string;
    title: string;
    body: string;
    authorNickname: string;
    city: CityBody;
    submittedAt: string;
  }>;
  nextCursor: string | null;
}

interface DecisionBody {
  id: string;
  reviewStatus: string;
  publishedAt: string | null;
}

const VALID_BODY = '雨落在旧书店的玻璃上，店里的人都没有说话，只有翻页的声音。';

let sequence = 0;

function uniqueEmail(prefix: string): string {
  sequence += 1;
  return `${prefix}.${Date.now()}.${sequence}@example.test`;
}

describe('STORY · 草稿、审核、公开故事站与容量（真实 PostgreSQL）', () => {
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
    const nickname = `${prefix}作者`;
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

  async function createStory(
    account: Account,
    input: {
      cityId: string;
      title?: string;
      body?: string;
      topicTags?: string[];
    },
  ): Promise<StoryBody> {
    const response = await server()
      .post('/api/v1/stories')
      .set('Cookie', account.cookie)
      .send({
        cityId: input.cityId,
        title: input.title ?? '雨夜书店',
        body: input.body ?? VALID_BODY,
        topicTags: input.topicTags ?? ['城市日常'],
      })
      .expect(201);
    return response.body as StoryBody;
  }

  async function submitStory(account: Account, id: string): Promise<StoryBody> {
    const response = await server()
      .post(`/api/v1/stories/${id}/submit`)
      .set('Cookie', account.cookie)
      .expect(200);
    return response.body as StoryBody;
  }

  async function listPublic(query = ''): Promise<PublicListBody> {
    const response = await server().get(`/api/v1/stories${query}`).expect(200);
    return response.body as PublicListBody;
  }

  async function queue(admin: Account): Promise<ModerationQueueBody> {
    const response = await server()
      .get('/api/v1/moderation/queue')
      .set('Cookie', admin.cookie)
      .expect(200);
    return response.body as ModerationQueueBody;
  }

  async function decide(
    admin: Account,
    id: string,
    action: 'APPROVE' | 'REJECT' | 'REMOVE',
    reasonCode?: string,
  ): Promise<DecisionBody> {
    const response = await server()
      .post(`/api/v1/moderation/stories/${id}/decision`)
      .set('Cookie', admin.cookie)
      .send({ action, ...(reasonCode ? { reasonCode } : {}) })
      .expect(200);
    return response.body as DecisionBody;
  }

  async function makeAdmin(account: Account): Promise<Account> {
    await promoteToAdmin(app, account.id);
    return account;
  }

  it('AC-04 未登录访问作者与审核接口返回 401', async () => {
    const id = '00000000-0000-4000-8000-000000000000';
    const calls = [
      () => server().post('/api/v1/stories').send({}),
      () => server().get('/api/v1/stories/mine'),
      () => server().get(`/api/v1/stories/mine/${id}`),
      () => server().patch(`/api/v1/stories/${id}`).send({ title: 'x' }),
      () => server().post(`/api/v1/stories/${id}/submit`),
      () => server().post(`/api/v1/stories/${id}/withdraw`),
      () => server().delete(`/api/v1/stories/${id}`),
      () => server().get('/api/v1/moderation/queue'),
      () => server().post(`/api/v1/moderation/stories/${id}/decision`).send({ action: 'APPROVE' }),
    ];
    for (const call of calls) {
      const response = await call().expect(401);
      expect((response.body as ApiErrorBody).code).toBe('AUTH_REQUIRED');
    }
  });

  it('AC-02 作者创建草稿、读取、编辑、提交；其他用户不可见', async () => {
    const author = await register('作者');
    const other = await register('旁观者');
    const city = await cityAt(0);

    const draft = await createStory(author, { cityId: city.id });
    expect(draft.reviewStatus).toBe('DRAFT');
    expect(draft.body).toContain('旧书店');
    expect(draft.city).toEqual({ id: city.id, name: city.name, countryCode: city.countryCode });

    const mine = await server()
      .get('/api/v1/stories/mine')
      .set('Cookie', author.cookie)
      .expect(200);
    expect((mine.body as StoryBody[]).map((item) => item.id)).toContain(draft.id);

    const ownDetail = await server()
      .get(`/api/v1/stories/mine/${draft.id}`)
      .set('Cookie', author.cookie)
      .expect(200);
    expect((ownDetail.body as StoryBody).id).toBe(draft.id);

    await server()
      .get(`/api/v1/stories/mine/${draft.id}`)
      .set('Cookie', other.cookie)
      .expect(404);

    const updated = await server()
      .patch(`/api/v1/stories/${draft.id}`)
      .set('Cookie', author.cookie)
      .send({ title: '雨停之后', topicTags: ['城市日常', '书店'] })
      .expect(200);
    expect((updated.body as StoryBody).title).toBe('雨停之后');

    const submitted = await submitStory(author, draft.id);
    expect(submitted.reviewStatus).toBe('PENDING');
    expect(submitted.submittedAt).toBeTruthy();

    await server()
      .patch(`/api/v1/stories/${draft.id}`)
      .set('Cookie', author.cookie)
      .send({ title: '不能直接改' })
      .expect(409);

    const publicList = await listPublic();
    expect(publicList.items).toHaveLength(0);

    await server().get(`/api/v1/stories/${draft.id}`).expect(404);
  });

  it('AC-02 标题/正文/标签边界返回 422，80/3000 字符可通过', async () => {
    const author = await register('边界作者');
    const city = await cityAt(0);

    const invalid = [
      { title: 'x'.repeat(81) },
      { body: 'x'.repeat(19) },
      { body: 'x'.repeat(3001) },
      { body: '   ' },
      { topicTags: ['a', 'b', 'c', 'd'] },
      { topicTags: ['x'.repeat(25)] },
      { topicTags: [''] },
    ];
    for (const input of invalid) {
      const response = await server()
        .post('/api/v1/stories')
        .set('Cookie', author.cookie)
        .send({
          cityId: city.id,
          title: '有效标题',
          body: VALID_BODY,
          topicTags: ['城市日常'],
          ...input,
        })
        .expect(422);
      expect((response.body as ApiErrorBody).code).toBe('VALIDATION_ERROR');
    }

    await createStory(author, {
      cityId: city.id,
      title: '题'.repeat(80),
      body: '字'.repeat(3000),
      topicTags: ['一', '二', '三'],
    });
  });

  it('AC-03 普通用户不能审核；管理员通过后公开，且自审被拒绝', async () => {
    const author = await register('故事作者');
    const admin = await makeAdmin(await register('管理员'));
    const city = await cityAt(1);

    const draft = await createStory(author, { cityId: city.id, title: '清晨地铁' });
    await submitStory(author, draft.id);

    const denied = await server()
      .get('/api/v1/moderation/queue')
      .set('Cookie', author.cookie)
      .expect(403);
    expect((denied.body as ApiErrorBody).code).toBe('FORBIDDEN');

    const pending = await queue(admin);
    expect(pending.items.map((item) => item.id)).toContain(draft.id);

    const approved = await decide(admin, draft.id, 'APPROVE');
    expect(approved.reviewStatus).toBe('APPROVED');
    expect(approved.publishedAt).toBeTruthy();

    const publicList = await listPublic();
    expect(publicList.items.map((item) => item.id)).toContain(draft.id);
    const item = publicList.items.find((entry) => entry.id === draft.id);
    expect(item?.authorNickname).toBe(author.nickname);
    expect(item?.city.id).toBe(city.id);

    const detail = await server().get(`/api/v1/stories/${draft.id}`).expect(200);
    const detailBody = detail.body as PublicStoryDetail;
    expect(detailBody.id).toBe(draft.id);
    expect(detailBody.body).toContain('旧书店');

    const ownDraft = await createStory(admin, { cityId: city.id, title: '管理员自己的故事' });
    await submitStory(admin, ownDraft.id);
    const selfReview = await server()
      .post(`/api/v1/moderation/stories/${ownDraft.id}/decision`)
      .set('Cookie', admin.cookie)
      .send({ action: 'APPROVE' })
      .expect(403);
    expect((selfReview.body as ApiErrorBody).code).toBe('FORBIDDEN');
    expect(
      await prisma.storyReviewAction.count({ where: { storyId: ownDraft.id } }),
    ).toBe(0);

    const repeated = await server()
      .post(`/api/v1/moderation/stories/${draft.id}/decision`)
      .set('Cookie', admin.cookie)
      .send({ action: 'APPROVE' })
      .expect(409);
    expect((repeated.body as ApiErrorBody).code).toBe('STORY_STATE_CONFLICT');
  });

  it('AC-03 并发审核同一条故事只成功一次，审计只写一条', async () => {
    const author = await register('并发作者');
    const admin = await makeAdmin(await register('并发管理员'));
    const city = await cityAt(9);

    const draft = await createStory(author, { cityId: city.id, title: '并发审核' });
    await submitStory(author, draft.id);

    const requestDecision = () =>
      server()
        .post(`/api/v1/moderation/stories/${draft.id}/decision`)
        .set('Cookie', admin.cookie)
        .send({ action: 'APPROVE' });

    const [first, second] = await Promise.all([requestDecision(), requestDecision()]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([200, 409]);

    const actions = await prisma.storyReviewAction.count({ where: { storyId: draft.id } });
    expect(actions).toBe(1);
  });

  it('AC-03 管理员可直接下架待审核故事', async () => {
    const author = await register('待审下架作者');
    const admin = await makeAdmin(await register('待审下架管理员'));
    const city = await cityAt(10);

    const draft = await createStory(author, { cityId: city.id, title: '待审下架' });
    await submitStory(author, draft.id);
    const removed = await decide(admin, draft.id, 'REMOVE', 'OTHER');
    expect(removed.reviewStatus).toBe('REMOVED');

    await server().get(`/api/v1/stories/${draft.id}`).expect(404);
    const mine = await server()
      .get('/api/v1/stories/mine')
      .set('Cookie', author.cookie)
      .expect(200);
    expect((mine.body as StoryBody[])[0]?.reviewStatus).toBe('REMOVED');
  });

  it('AC-04 非法游标返回 422', async () => {
    const response = await server().get('/api/v1/stories?cursor=not-a-cursor').expect(422);
    expect((response.body as ApiErrorBody).code).toBe('VALIDATION_ERROR');
  });

  it('AC-03 驳回后作者可修改重提；管理员下架后公开入口消失', async () => {
    const author = await register('重提作者');
    const admin = await makeAdmin(await register('审核管理员'));
    const city = await cityAt(2);

    const draft = await createStory(author, { cityId: city.id, title: '一次温柔的偶遇' });
    await submitStory(author, draft.id);
    const rejected = await decide(admin, draft.id, 'REJECT', 'PRIVACY');
    expect(rejected.reviewStatus).toBe('REJECTED');

    await server().get(`/api/v1/stories/${draft.id}`).expect(404);

    await server()
      .patch(`/api/v1/stories/${draft.id}`)
      .set('Cookie', author.cookie)
      .send({ title: '一次温柔的偶遇（修改）' })
      .expect(200);
    const resubmitted = await submitStory(author, draft.id);
    expect(resubmitted.reviewStatus).toBe('PENDING');

    await decide(admin, draft.id, 'APPROVE');
    await server().get(`/api/v1/stories/${draft.id}`).expect(200);

    const removed = await decide(admin, draft.id, 'REMOVE', 'OTHER');
    expect(removed.reviewStatus).toBe('REMOVED');
    await server().get(`/api/v1/stories/${draft.id}`).expect(404);
    const publicList = await listPublic();
    expect(publicList.items).toHaveLength(0);
  });

  it('AC-04 公开响应不包含 email、坐标、审核备注或作者 ID', async () => {
    const author = await register('隐私作者');
    const admin = await makeAdmin(await register('隐私管理员'));
    const city = await cityAt(3);

    const draft = await createStory(author, { cityId: city.id, title: '公开隐私检查' });
    await submitStory(author, draft.id);
    await decide(admin, draft.id, 'APPROVE');

    const listResponse = await server().get('/api/v1/stories').expect(200);
    const detailResponse = await server().get(`/api/v1/stories/${draft.id}`).expect(200);
    for (const text of [listResponse.text, detailResponse.text]) {
      expect(text).not.toMatch(/email/i);
      expect(text).not.toMatch(/centroidLat|centroidLon|latitude|longitude/);
      expect(text).not.toMatch(/reviewNote|internalNote|reasonCode/);
      expect(text).not.toContain(author.email);
      expect(text).not.toContain(author.id);
    }
  });

  it('AC-04 城市与主题筛选只返回公开故事；游标分页不重复', async () => {
    const author = await register('筛选作者');
    const admin = await makeAdmin(await register('筛选管理员'));
    const cityA = await cityAt(4);
    const cityB = await cityAt(5);

    const ids: string[] = [];
    for (const [city, title, tag] of [
      [cityA, '城市 A 的雨天', '雨天'],
      [cityA, '城市 A 的清晨', '清晨'],
      [cityB, '城市 B 的夜晚', '夜晚'],
    ] as const) {
      const draft = await createStory(author, { cityId: city.id, title, topicTags: [tag] });
      await submitStory(author, draft.id);
      await decide(admin, draft.id, 'APPROVE');
      ids.push(draft.id);
    }

    const cityAList = await listPublic(`?cityId=${cityA.id}`);
    expect(cityAList.items).toHaveLength(2);
    expect(cityAList.items.every((item) => item.city.id === cityA.id)).toBe(true);

    const topicList = await listPublic('?topic=夜晚');
    expect(topicList.items).toHaveLength(1);
    expect(topicList.items[0]?.title).toBe('城市 B 的夜晚');

    const firstPage = await listPublic('?limit=2');
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.nextCursor).toBeTruthy();
    const secondPage = await listPublic(`?limit=2&cursor=${encodeURIComponent(firstPage.nextCursor ?? '')}`);
    expect(secondPage.items).toHaveLength(1);
    const allIds = [...firstPage.items, ...secondPage.items].map((item) => item.id);
    expect(new Set(allIds).size).toBe(3);
    expect(allIds.sort()).toEqual([...ids].sort());
  });

  it('AC-05 城市满 50 条时通过后排队，释放名额后提升最早排队故事', async () => {
    const author = await register('容量作者');
    const admin = await makeAdmin(await register('容量管理员'));
    const city = await cityAt(6);
    const now = new Date();
    const old = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    await prisma.story.createMany({
      data: Array.from({ length: 50 }, (_, index) => ({
        authorId: author.id,
        cityId: city.id,
        title: `已公开故事 ${index + 1}`,
        body: VALID_BODY,
        topicTags: ['容量'],
        reviewStatus: 'APPROVED',
        publicConsentAt: old,
        submittedAt: old,
        reviewedAt: old,
        reviewedById: admin.id,
        publishedAt: new Date(now.getTime() - index * 1000),
      })),
    });

    const draft = await createStory(author, { cityId: city.id, title: '排队中的故事' });
    await submitStory(author, draft.id);
    const approved = await decide(admin, draft.id, 'APPROVE');
    expect(approved.reviewStatus).toBe('APPROVED');
    expect(approved.publishedAt).toBeNull();

    const visibleIds: string[] = [];
    let cursor: string | null = null;
    do {
      const page = await listPublic(
        `?cityId=${city.id}&limit=24${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
      );
      visibleIds.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor;
    } while (cursor);
    expect(visibleIds).toHaveLength(50);

    const active = await prisma.story.findFirst({
      where: { cityId: city.id, publishedAt: { not: null } },
      orderBy: { publishedAt: 'asc' },
    });
    if (!active) {
      throw new Error('缺少可释放的公开故事');
    }
    await server()
      .post(`/api/v1/stories/${active.id}/withdraw`)
      .set('Cookie', author.cookie)
      .expect(200);

    const promoted = await prisma.story.findUnique({ where: { id: draft.id } });
    expect(promoted?.publishedAt).toBeTruthy();
  });

  it('AC-05 每 7 天第 4 次提交返回 429', async () => {
    const author = await register('配额作者');
    const city = await cityAt(7);

    for (let index = 0; index < 3; index += 1) {
      const draft = await createStory(author, {
        cityId: city.id,
        title: `配额故事 ${index + 1}`,
      });
      await submitStory(author, draft.id);
    }

    const fourth = await createStory(author, { cityId: city.id, title: '配额故事 4' });
    const response = await server()
      .post(`/api/v1/stories/${fourth.id}/submit`)
      .set('Cookie', author.cookie)
      .expect(429);
    expect((response.body as ApiErrorBody).code).toBe('RATE_LIMITED');
  });

  it('AC-02 已提交故事不能删除；草稿可删除', async () => {
    const author = await register('删除作者');
    const city = await cityAt(8);

    const draft = await createStory(author, { cityId: city.id });
    await server()
      .delete(`/api/v1/stories/${draft.id}`)
      .set('Cookie', author.cookie)
      .expect(204);

    const submittedDraft = await createStory(author, { cityId: city.id, title: '提交后不可删除' });
    await submitStory(author, submittedDraft.id);
    await server()
      .delete(`/api/v1/stories/${submittedDraft.id}`)
      .set('Cookie', author.cookie)
      .expect(409);
  });

  it('AC-07 注册请求不能自选 ADMIN 角色', async () => {
    const response = await server()
      .post('/api/v1/auth/register')
      .send({
        ...registerPayload({ email: uniqueEmail('role-mass-assignment') }),
        role: 'ADMIN',
      })
      .expect(422);
    expect((response.body as ApiErrorBody).code).toBe('VALIDATION_ERROR');
  });

  it('AC-03 /auth/me 返回本人角色，普通用户为 USER', async () => {
    const author = await register('角色作者');
    const me = await server()
      .get('/api/v1/auth/me')
      .set('Cookie', author.cookie)
      .expect(200);
    expect((me.body as { role: string }).role).toBe('USER');

    await promoteToAdmin(app, author.id);
    const promoted = await server()
      .get('/api/v1/auth/me')
      .set('Cookie', author.cookie)
      .expect(200);
    expect((promoted.body as { role: string }).role).toBe('ADMIN');
  });
});
