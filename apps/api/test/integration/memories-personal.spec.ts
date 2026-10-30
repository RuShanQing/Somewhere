import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
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

interface Account {
  id: string;
  nickname: string;
  cookie: string;
}

interface MemoryBody {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

interface MemoryListBody {
  items: MemoryBody[];
}

let sequence = 0;

function uniqueEmail(prefix: string): string {
  sequence += 1;
  return `${prefix}.${Date.now()}.${sequence}@example.test`;
}

describe('MEMORY · 个人记忆 CRUD 与私有边界（真实 PostgreSQL）', () => {
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

  async function createMemory(
    account: Account,
    input: { title: string; body: string },
  ): Promise<MemoryBody> {
    const response = await server()
      .post('/api/v1/memories/personal')
      .set('Cookie', account.cookie)
      .send(input)
      .expect(201);
    return response.body as MemoryBody;
  }

  async function listMemories(account: Account, query = ''): Promise<MemoryBody[]> {
    const response = await server()
      .get(`/api/v1/memories/personal${query}`)
      .set('Cookie', account.cookie)
      .expect(200);
    return (response.body as MemoryListBody).items;
  }

  it('AC-01 匿名访问四个个人记忆接口全部 401', async () => {
    const id = randomUUID();
    await server().get('/api/v1/memories/personal').expect(401);
    await server()
      .post('/api/v1/memories/personal')
      .send({ title: '海', body: '风' })
      .expect(401);
    await server().patch(`/api/v1/memories/personal/${id}`).send({ title: '海' }).expect(401);
    await server().delete(`/api/v1/memories/personal/${id}`).expect(401);
  });

  it('AC-01 创建后只返回本人列表，字段不含 email 或 ownerId', async () => {
    const account = await register('memory-owner');
    const created = await createMemory(account, {
      title: '港口的风',
      body: '傍晚的港口有一点咸味。',
    });

    expect(created.title).toBe('港口的风');
    expect(created.body).toBe('傍晚的港口有一点咸味。');
    expect(Object.keys(created).sort()).toEqual(
      ['body', 'createdAt', 'id', 'title', 'updatedAt'].sort(),
    );

    const items = await listMemories(account);
    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe(created.id);

    const raw = await prisma.personalMemory.findUniqueOrThrow({ where: { id: created.id } });
    expect(raw.ownerId).toBe(account.id);

    const response = await server()
      .get('/api/v1/memories/personal')
      .set('Cookie', account.cookie)
      .expect(200);
    const text = JSON.stringify(response.body);
    expect(text).not.toMatch(/"email"\s*:/);
    expect(text).not.toMatch(/"ownerId"\s*:/);
  });

  it('AC-02 标题与正文边界、空白、emoji 与空更新', async () => {
    const account = await register('memory-validation');

    await createMemory(account, { title: '海', body: '风' });
    await createMemory(account, { title: '海'.repeat(80), body: '风'.repeat(3000) });
    await createMemory(account, { title: '🌊'.repeat(80), body: '风' });

    for (const payload of [
      { title: '海'.repeat(81), body: '风' },
      { title: '海', body: '风'.repeat(3001) },
      { title: ' \n\t ', body: '风' },
      { title: '海', body: '\n\t ' },
    ]) {
      const response = await server()
        .post('/api/v1/memories/personal')
        .set('Cookie', account.cookie)
        .send(payload)
        .expect(422);
      expect((response.body as { code: string }).code).toBe('VALIDATION_ERROR');
    }

    const created = await createMemory(account, { title: '原标题', body: '原正文' });
    await server()
      .patch(`/api/v1/memories/personal/${created.id}`)
      .set('Cookie', account.cookie)
      .send({ title: '海'.repeat(81) })
      .expect(422);
    await server()
      .patch(`/api/v1/memories/personal/${created.id}`)
      .set('Cookie', account.cookie)
      .send({})
      .expect(422);

    const items = await listMemories(account);
    const unchanged = items.find((item) => item.id === created.id);
    expect(unchanged?.title).toBe('原标题');
    expect(unchanged?.body).toBe('原正文');
  });

  it('AC-03 编辑自己的记录会更新内容与时间，并按最近更新排序', async () => {
    const account = await register('memory-edit');
    const first = await createMemory(account, { title: '第一段', body: '最早写下的内容。' });
    await new Promise((resolve) => setTimeout(resolve, 10));
    const second = await createMemory(account, { title: '第二段', body: '后来写下的内容。' });

    expect((await listMemories(account)).map((item) => item.id)).toEqual([second.id, first.id]);

    await new Promise((resolve) => setTimeout(resolve, 10));
    const updated = await server()
      .patch(`/api/v1/memories/personal/${first.id}`)
      .set('Cookie', account.cookie)
      .send({ title: '第一段（改）', body: '重新整理过的内容。' })
      .expect(200);

    const body = updated.body as MemoryBody;
    expect(body.title).toBe('第一段（改）');
    expect(body.body).toBe('重新整理过的内容。');
    expect(body.updatedAt).not.toBe(first.updatedAt);

    expect((await listMemories(account)).map((item) => item.id)).toEqual([first.id, second.id]);
  });

  it('AC-03 删除只删除本人记录，重复删除 404，其他表不变', async () => {
    const account = await register('memory-delete');
    const other = await register('memory-other');
    const seeded = await seedPassage(app, {
      topic: '删除前的共途',
      progressStatus: 'COMPLETED',
      participants: [{ userId: account.id }, { userId: other.id }],
    });
    const created = await createMemory(account, { title: '会消失', body: '只删除本人视图。' });

    const before = {
      memories: await prisma.personalMemory.count(),
      passages: await prisma.passage.count(),
      postcards: await prisma.postcard.count(),
    };

    await server()
      .delete(`/api/v1/memories/personal/${created.id}`)
      .set('Cookie', account.cookie)
      .expect(204);

    expect(await prisma.personalMemory.count()).toBe(before.memories - 1);
    expect(await prisma.passage.count()).toBe(before.passages);
    expect(await prisma.postcard.count()).toBe(before.postcards);
    expect(await prisma.passage.findUnique({ where: { id: seeded.id } })).not.toBeNull();

    await server()
      .delete(`/api/v1/memories/personal/${created.id}`)
      .set('Cookie', account.cookie)
      .expect(404);
    expect(await listMemories(account)).toHaveLength(0);
  });

  it('AC-04 其他用户与 ADMIN 无法读取、修改或删除他人记录', async () => {
    const owner = await register('memory-private-owner');
    const intruder = await register('memory-intruder');
    const created = await createMemory(owner, { title: '只给本人', body: '这是一段私人内容。' });

    expect(await listMemories(intruder)).toHaveLength(0);

    await server()
      .patch(`/api/v1/memories/personal/${created.id}`)
      .set('Cookie', intruder.cookie)
      .send({ title: '被改掉' })
      .expect(404);
    await server()
      .delete(`/api/v1/memories/personal/${created.id}`)
      .set('Cookie', intruder.cookie)
      .expect(404);
    await server()
      .patch(`/api/v1/memories/personal/${randomUUID()}`)
      .set('Cookie', intruder.cookie)
      .send({ title: '不存在' })
      .expect(404);
    await server()
      .patch('/api/v1/memories/personal/not-a-uuid')
      .set('Cookie', owner.cookie)
      .send({ title: '非法 ID' })
      .expect(404);

    const ownerItems = await listMemories(owner);
    expect(ownerItems[0]?.title).toBe('只给本人');
    expect(ownerItems[0]?.body).toBe('这是一段私人内容。');

    await promoteToAdmin(app, intruder.id);
    expect(await listMemories(intruder)).toHaveLength(0);
    await server()
      .patch(`/api/v1/memories/personal/${created.id}`)
      .set('Cookie', intruder.cookie)
      .send({ title: '管理员也不能改' })
      .expect(404);
  });

  it('AC-04 共途与信友关系不会让渡个人记忆读取权', async () => {
    const owner = await register('memory-relation-owner');
    const friend = await register('memory-relation-friend');
    const passage = await seedPassage(app, {
      topic: '一起看过海',
      progressStatus: 'COMPLETED',
      participants: [{ userId: owner.id }, { userId: friend.id }],
    });

    for (const [account, counterpartId] of [
      [owner, friend.id],
      [friend, owner.id],
    ] as const) {
      await server()
        .post('/api/v1/penpals/consent')
        .set('Cookie', account.cookie)
        .send({ counterpartId })
        .expect(200);
    }

    const created = await createMemory(owner, { title: '关系之外的私人记录', body: '与关系无关。' });

    await server()
      .patch(`/api/v1/memories/personal/${created.id}`)
      .set('Cookie', friend.cookie)
      .send({ title: '朋友也不能改' })
      .expect(404);
    expect(await listMemories(friend)).toHaveLength(0);
    expect(await prisma.passage.findUnique({ where: { id: passage.id } })).not.toBeNull();
  });

  it('AC-04 列表分页与非法分页参数', async () => {
    const account = await register('memory-pagination');
    const created: MemoryBody[] = [];
    for (let index = 0; index < 3; index += 1) {
      created.push(
        await createMemory(account, {
          title: `第 ${index + 1} 段`,
          body: `正文 ${index + 1}`,
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    const pageOne = await listMemories(account, '?limit=2&offset=0');
    expect(pageOne.map((item) => item.id)).toEqual([created[2]?.id, created[1]?.id]);
    const pageTwo = await listMemories(account, '?limit=2&offset=2');
    expect(pageTwo.map((item) => item.id)).toEqual([created[0]?.id]);

    for (const query of ['?limit=0', '?limit=51', '?offset=-1']) {
      await server()
        .get(`/api/v1/memories/personal${query}`)
        .set('Cookie', account.cookie)
        .expect(422);
    }
  });

  it('AC-06 数据库拒绝空白与超长标题/正文', async () => {
    const account = await register('memory-db-constraint');
    const insert = (title: string, body: string) =>
      prisma.$executeRawUnsafe(
        'INSERT INTO "personal_memories" ("id", "owner_id", "title", "body", "created_at", "updated_at") VALUES ($1::uuid, $2::uuid, $3, $4, NOW(), NOW())',
        randomUUID(),
        account.id,
        title,
        body,
      );

    await expect(insert('   ', '正文')).rejects.toThrow();
    await expect(insert('标题', '\n\t')).rejects.toThrow();
    await expect(insert('海'.repeat(81), '正文')).rejects.toThrow();
    await expect(insert('标题', '风'.repeat(3001))).rejects.toThrow();
  });
});
