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
  cookie: string;
}

interface ApiErrorBody {
  code: string;
  message: string;
  requestId: string;
  details?: string[];
}

interface OwnStoryBody {
  id: string;
  title: string;
  reviewStatus: string;
  publishedAt: string | null;
}

interface PublicStoryItem {
  id: string;
  title: string;
  city: CityBody;
  publishedAt: string;
}

interface PublicListBody {
  items: PublicStoryItem[];
  nextCursor: string | null;
}

interface CityMemoryItem {
  city: CityBody;
  publicStoryCount: number;
  latestPublishedAt: string;
}

interface CityMemoryBody {
  items: CityMemoryItem[];
}

const VALID_BODY = '雨落在旧书店的玻璃上，店里的人都没有说话，只有翻页的声音。';

let sequence = 0;

function uniqueEmail(prefix: string): string {
  sequence += 1;
  return `${prefix}.${Date.now()}.${sequence}@example.test`;
}

describe('MAP · 世界记忆地图城市聚合（真实 PostgreSQL）', () => {
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
      cookie: sessionCookiePair(response),
    };
  }

  async function makeAdmin(account: Account): Promise<Account> {
    await promoteToAdmin(app, account.id);
    return account;
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
    input: { cityId: string; title?: string; topicTags?: string[] },
  ): Promise<OwnStoryBody> {
    const response = await server()
      .post('/api/v1/stories')
      .set('Cookie', account.cookie)
      .send({
        cityId: input.cityId,
        title: input.title ?? '雨夜书店',
        body: VALID_BODY,
        topicTags: input.topicTags ?? ['城市日常'],
      })
      .expect(201);
    return response.body as OwnStoryBody;
  }

  async function submitStory(account: Account, id: string): Promise<void> {
    await server().post(`/api/v1/stories/${id}/submit`).set('Cookie', account.cookie).expect(200);
  }

  async function decide(
    admin: Account,
    id: string,
    action: 'APPROVE' | 'REJECT' | 'REMOVE',
  ): Promise<OwnStoryBody> {
    const response = await server()
      .post(`/api/v1/moderation/stories/${id}/decision`)
      .set('Cookie', admin.cookie)
      .send({ action })
      .expect(200);
    return response.body as OwnStoryBody;
  }

  /** 完整走一遍作者提交 + 管理员通过，返回发布结果。 */
  async function publishStory(
    author: Account,
    admin: Account,
    input: { cityId: string; title?: string; topicTags?: string[] },
  ): Promise<OwnStoryBody> {
    const draft = await createStory(author, input);
    await submitStory(author, draft.id);
    return decide(admin, draft.id, 'APPROVE');
  }

  async function discovery(query = ''): Promise<CityMemoryBody> {
    const response = await server().get(`/api/v1/discovery/cities${query}`).expect(200);
    return response.body as CityMemoryBody;
  }

  async function publicStories(query = ''): Promise<PublicListBody> {
    const response = await server().get(`/api/v1/stories${query}`).expect(200);
    return response.body as PublicListBody;
  }

  function cityIds(body: CityMemoryBody): string[] {
    return body.items.map((item) => item.city.id);
  }

  it('MAP AC-01 匿名可读；没有公开故事时返回空数组', async () => {
    const body = await discovery();
    expect(body.items).toEqual([]);
  });

  it('MAP AC-01 topic 去空格并通过 DTO 校验', async () => {
    const trimmed = await discovery('?topic=%20%20');
    expect(trimmed.items).toEqual([]);

    const tooLong = await server()
      .get(`/api/v1/discovery/cities?topic=${encodeURIComponent('x'.repeat(25))}`)
      .expect(422);
    expect((tooLong.body as ApiErrorBody).code).toBe('VALIDATION_ERROR');
  });

  it('MAP AC-02 草稿、待审核、驳回与撤回的故事不产生城市', async () => {
    const author = await register('草稿');
    const admin = await makeAdmin(await register('审核'));
    const city = await cityAt(0);

    const draft = await createStory(author, { cityId: city.id });
    expect((await discovery()).items).toEqual([]);

    await submitStory(author, draft.id);
    expect((await discovery()).items).toEqual([]);

    const rejected = await createStory(author, { cityId: city.id, title: '被驳回的故事' });
    await submitStory(author, rejected.id);
    await decide(admin, rejected.id, 'REJECT');
    expect((await discovery()).items).toEqual([]);

    const approved = await publishStory(author, admin, { cityId: city.id, title: '被撤回的故事' });
    expect(cityIds(await discovery())).toEqual([city.id]);

    await server()
      .post(`/api/v1/stories/${approved.id}/withdraw`)
      .set('Cookie', author.cookie)
      .expect(200);
    expect((await discovery()).items).toEqual([]);
  });

  it('MAP AC-02 聚合计数与故事站城市筛选返回同一 Story ID 集合', async () => {
    const author = await register('同源');
    const admin = await makeAdmin(await register('同源审核'));
    const cityA = await cityAt(0);
    const cityB = await cityAt(1);

    const first = await publishStory(author, admin, { cityId: cityA.id, title: '第一段' });
    const second = await publishStory(author, admin, { cityId: cityA.id, title: '第二段' });
    await publishStory(author, admin, { cityId: cityB.id, title: '另一座城' });

    const cityMemory = await discovery();
    const entry = cityMemory.items.find((item) => item.city.id === cityA.id);
    expect(entry?.publicStoryCount).toBe(2);
    expect(cityIds(cityMemory).sort()).toEqual([cityA.id, cityB.id].sort());

    const station = await publicStories(`?cityId=${cityA.id}`);
    expect(station.items.map((item) => item.id).sort()).toEqual([first.id, second.id].sort());
    expect(station.items).toHaveLength(entry?.publicStoryCount ?? -1);

    const stationAll = await publicStories();
    const stationCityIds = Array.from(new Set(stationAll.items.map((item) => item.city.id)));
    expect(stationCityIds.sort()).toEqual(cityIds(cityMemory).sort());
  });

  it('MAP AC-02 审核通过但在城市容量外排队的故事不计入城市', async () => {
    const author = await register('排队');
    const admin = await makeAdmin(await register('排队审核'));
    const city = await cityAt(2);
    const now = new Date();

    await prisma.story.createMany({
      data: Array.from({ length: 50 }, (_, index) => ({
        authorId: author.id,
        cityId: city.id,
        title: `已满容量故事 ${index + 1}`,
        body: VALID_BODY,
        topicTags: ['城市日常'],
        reviewStatus: 'APPROVED' as const,
        publicConsentAt: now,
        // 夹具故事放到 7 天配额窗口之外，避免占用当前作者的提交次数。
        submittedAt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
        reviewedAt: now,
        reviewedById: admin.id,
        publishedAt: now,
      })),
    });

    const queued = await publishStory(author, admin, { cityId: city.id, title: '第 51 段' });
    expect(queued.reviewStatus).toBe('APPROVED');
    expect(queued.publishedAt).toBeNull();

    const entry = (await discovery()).items.find((item) => item.city.id === city.id);
    expect(entry?.publicStoryCount).toBe(50);

    const station = await publicStories(`?cityId=${city.id}&limit=24`);
    expect(station.items.some((item) => item.id === queued.id)).toBe(false);
  });

  it('MAP AC-03 作者撤回后城市消失，重新公开后恢复', async () => {
    const author = await register('恢复');
    const admin = await makeAdmin(await register('恢复审核'));
    const city = await cityAt(3);

    const story = await publishStory(author, admin, { cityId: city.id });
    expect(cityIds(await discovery())).toEqual([city.id]);

    await server()
      .post(`/api/v1/stories/${story.id}/withdraw`)
      .set('Cookie', author.cookie)
      .expect(200);
    expect((await discovery()).items).toEqual([]);

    const again = await publishStory(author, admin, { cityId: city.id, title: '重新公开的片段' });
    expect(again.reviewStatus).toBe('APPROVED');
    expect(cityIds(await discovery())).toEqual([city.id]);
    expect((await discovery()).items[0]?.publicStoryCount).toBe(1);
  });

  it('MAP AC-03 管理员下架后城市消失', async () => {
    const author = await register('下架');
    const admin = await makeAdmin(await register('下架审核'));
    const city = await cityAt(4);

    const story = await publishStory(author, admin, { cityId: city.id });
    expect(cityIds(await discovery())).toEqual([city.id]);

    await decide(admin, story.id, 'REMOVE');
    expect((await discovery()).items).toEqual([]);
  });

  it('MAP AC-04 聚合响应不含邮箱、作者 ID 与城市坐标', async () => {
    const author = await register('隐私');
    const admin = await makeAdmin(await register('隐私审核'));
    const city = await cityAt(5);
    await publishStory(author, admin, { cityId: city.id });

    const response = await server().get('/api/v1/discovery/cities').expect(200);
    const text = JSON.stringify(response.body);
    expect(text).not.toContain('@example.test');
    expect(text).not.toMatch(/centroidLat|centroidLon/);
    expect(text).not.toMatch(/authorId|author_id/);
    expect(Object.keys((response.body as CityMemoryBody).items[0] ?? {}).sort()).toEqual([
      'city',
      'latestPublishedAt',
      'publicStoryCount',
    ]);
    expect(Object.keys((response.body as CityMemoryBody).items[0]?.city ?? {}).sort()).toEqual([
      'countryCode',
      'id',
      'name',
    ]);
  });

  it('MAP-02 城市按最近发布时间倒序，不按故事数量排序', async () => {
    const author = await register('排序');
    const admin = await makeAdmin(await register('排序审核'));
    const busyCity = await cityAt(6);
    const quietCity = await cityAt(7);

    await publishStory(author, admin, { cityId: busyCity.id, title: '繁忙城市第一段' });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await publishStory(author, admin, { cityId: busyCity.id, title: '繁忙城市第二段' });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await publishStory(author, admin, { cityId: quietCity.id, title: '安静城市唯一一段' });

    const body = await discovery();
    expect(cityIds(body)).toEqual([quietCity.id, busyCity.id]);
    expect(body.items[0]?.publicStoryCount).toBe(1);
    expect(body.items[1]?.publicStoryCount).toBe(2);
  });

  it('MAP AC-01 主题筛选与故事站主题筛选返回相同城市', async () => {
    const author = await register('主题');
    const admin = await makeAdmin(await register('主题审核'));
    const rainyCity = await cityAt(8);
    const sunnyCity = await cityAt(9);

    await publishStory(author, admin, {
      cityId: rainyCity.id,
      title: '雨天的一段',
      topicTags: ['雨天'],
    });
    await publishStory(author, admin, {
      cityId: sunnyCity.id,
      title: '晴天的一段',
      topicTags: ['晴天'],
    });

    const rainy = await discovery('?topic=%E9%9B%A8%E5%A4%A9');
    expect(cityIds(rainy)).toEqual([rainyCity.id]);
    expect(rainy.items[0]?.publicStoryCount).toBe(1);

    const station = await publicStories(`?topic=${encodeURIComponent('雨天')}`);
    expect(Array.from(new Set(station.items.map((item) => item.city.id)))).toEqual([rainyCity.id]);

    expect((await discovery(`?topic=${encodeURIComponent('不存在')}`)).items).toEqual([]);
  });

  it('MAP-04 未知城市的故事列表为空而不是 404', async () => {
    const response = await server()
      .get('/api/v1/stories?cityId=00000000-0000-4000-8000-000000000000')
      .expect(200);
    expect((response.body as PublicListBody).items).toEqual([]);
  });
});
