import { createApiClient, ApiError } from '@somewhere/api-client';
import { describe, expect, it } from 'vitest';

interface CapturedRequest {
  url: string;
  init: RequestInit;
}

function jsonResponse(status: number, payload: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as unknown as Response;
}

function buildClient(status: number, payload: unknown) {
  const captured: CapturedRequest[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    captured.push({ url: String(input), init: init ?? {} });
    return jsonResponse(status, payload);
  }) as unknown as typeof fetch;

  return { client: createApiClient({ fetchImpl }), captured };
}

describe('API 客户端', () => {
  it('读取当前用户时携带 Cookie 且使用同源地址', async () => {
    const { client, captured } = buildClient(200, { id: 'u1', nickname: '旅人', email: 'a@b.test' });
    const user = await client.me();

    expect(user.id).toBe('u1');
    expect(captured[0]?.url).toBe('/api/v1/auth/me');
    expect(captured[0]?.init.credentials).toBe('include');
    expect(captured[0]?.init.method).toBe('GET');
  });

  it('登录以 JSON 提交，不把凭据拼到 URL', async () => {
    const { client, captured } = buildClient(200, { id: 'u1' });
    await client.login({ email: 'a@b.test', password: 'fictional-passphrase' });

    const request = captured[0]!;
    expect(request.url).toBe('/api/v1/auth/login');
    expect(request.url).not.toContain('password');
    expect(request.init.method).toBe('POST');
    expect(request.init.body).toBe(
      JSON.stringify({ email: 'a@b.test', password: 'fictional-passphrase' }),
    );
  });

  it('错误响应转换为带 code 与 requestId 的 ApiError', async () => {
    const { client } = buildClient(401, {
      code: 'AUTH_INVALID_CREDENTIALS',
      message: '邮箱或密码不正确',
      requestId: 'req_123',
    });

    await expect(client.login({ email: 'a@b.test', password: 'x' })).rejects.toMatchObject({
      code: 'AUTH_INVALID_CREDENTIALS',
      status: 401,
      requestId: 'req_123',
    });
  });

  it('非 JSON 错误响应仍抛出可处理的 ApiError', async () => {
    const fetchImpl = (async () =>
      ({
        ok: false,
        status: 502,
        json: async () => {
          throw new Error('not json');
        },
      }) as unknown as Response) as unknown as typeof fetch;
    const client = createApiClient({ fetchImpl });

    await expect(client.me()).rejects.toMatchObject({ status: 502, code: 'NETWORK_ERROR' });
    await expect(client.me()).rejects.toBeInstanceOf(ApiError);
  });

  it('退出返回 204 时不解析响应体', async () => {
    const { client, captured } = buildClient(204, undefined);
    await expect(client.logout()).resolves.toBeUndefined();
    expect(captured[0]?.url).toBe('/api/v1/auth/logout');
    expect(captured[0]?.init.method).toBe('POST');
  });

  it('城市搜索使用编码后的 query，空搜索不附加参数', async () => {
    const { client, captured } = buildClient(200, []);
    await client.cities('  北 京 ');
    await client.cities();

    expect(captured[0]?.url).toBe('/api/v1/cities?query=%E5%8C%97%20%E4%BA%AC');
    expect(captured[0]?.init.method).toBe('GET');
    expect(captured[1]?.url).toBe('/api/v1/cities');
  });

  it('资料接口使用 GET/PATCH，并只提交允许的字段', async () => {
    const profile = { userId: 'u1', nickname: '旅人', city: null, receptionMode: 'OPEN' };
    const { client, captured } = buildClient(200, profile);

    await client.profileMe();
    await client.updateProfile({ cityId: 'city-1', receptionMode: 'RESTING' });

    expect(captured[0]?.url).toBe('/api/v1/profile/me');
    expect(captured[0]?.init.method).toBe('GET');
    expect(captured[1]?.url).toBe('/api/v1/profile/me');
    expect(captured[1]?.init.method).toBe('PATCH');
    expect(captured[1]?.init.body).toBe(
      JSON.stringify({ cityId: 'city-1', receptionMode: 'RESTING' }),
    );
  });

  it('寄出明信片携带 Idempotency-Key，且不把幂等键放进 URL', async () => {
    const { client, captured } = buildClient(201, {
      postcardId: 'pc-1',
      status: 'IN_TRANSIT',
      sentAt: '2026-10-28T00:00:00.000Z',
      deliverAt: '2026-10-28T12:00:00.000Z',
    });

    await client.sendPostcardDraft('draft/1', 'send-once-key');

    expect(captured[0]?.url).toBe('/api/v1/postcards/drafts/draft%2F1/send');
    expect(captured[0]?.init.method).toBe('POST');
    expect((captured[0]?.init.headers as Record<string, string>)['Idempotency-Key']).toBe(
      'send-once-key',
    );
  });

  it('草稿删除使用 DELETE，列表使用编码后的分页参数', async () => {
    const { client, captured } = buildClient(204, undefined);
    await client.deletePostcardDraft('draft-1');
    await client.inboxPostcards({ limit: 5, offset: 10 });

    expect(captured[0]?.url).toBe('/api/v1/postcards/drafts/draft-1');
    expect(captured[0]?.init.method).toBe('DELETE');
    expect(captured[1]?.url).toBe('/api/v1/postcards/inbox?limit=5&offset=10');
  });

  it('个人记忆列表携带分页参数，写操作使用 JSON 与正确方法', async () => {
    const list = buildClient(200, { items: [] });
    await list.client.personalMemories({ limit: 5, offset: 10 });

    expect(list.captured[0]?.url).toBe('/api/v1/memories/personal?limit=5&offset=10');
    expect(list.captured[0]?.init.method).toBe('GET');

    const create = buildClient(201, { id: 'memory-1' });
    await create.client.createPersonalMemory({ title: '海', body: '风' });
    expect(create.captured[0]?.url).toBe('/api/v1/memories/personal');
    expect(create.captured[0]?.init.method).toBe('POST');
    expect(create.captured[0]?.init.body).toBe(
      JSON.stringify({ title: '海', body: '风' }),
    );

    const update = buildClient(200, { id: 'memory-1' });
    await update.client.updatePersonalMemory('memory 1', { title: '海' });
    expect(update.captured[0]?.url).toBe('/api/v1/memories/personal/memory%201');
    expect(update.captured[0]?.init.method).toBe('PATCH');

    const remove = buildClient(204, undefined);
    await remove.client.deletePersonalMemory('memory-1');
    expect(remove.captured[0]?.url).toBe('/api/v1/memories/personal/memory-1');
    expect(remove.captured[0]?.init.method).toBe('DELETE');
  });

  it('故事列表编码城市、主题与游标，详情与我的故事路径正确', async () => {
    const { client, captured } = buildClient(200, { items: [], nextCursor: null });

    await client.stories({
      cityId: 'city-1',
      topic: '雨 天',
      cursor: 'abc+/=',
      limit: 12,
    });
    await client.storyDetail('story/1');
    await client.myStories();
    await client.myStory('story/2');

    expect(captured[0]?.url).toBe(
      '/api/v1/stories?cityId=city-1&topic=%E9%9B%A8+%E5%A4%A9&cursor=abc%2B%2F%3D&limit=12',
    );
    expect(captured[1]?.url).toBe('/api/v1/stories/story%2F1');
    expect(captured[2]?.url).toBe('/api/v1/stories/mine');
    expect(captured[3]?.url).toBe('/api/v1/stories/mine/story%2F2');
  });

  it('审核队列与决策使用正确的路径、方法和请求体', async () => {
    const { client, captured } = buildClient(200, { id: 'story-1', reviewStatus: 'APPROVED' });

    await client.moderationQueue({ cursor: 'next', limit: 20 });
    await client.decideStory('story-1', { action: 'REJECT', reasonCode: 'PRIVACY' });

    expect(captured[0]?.url).toBe('/api/v1/moderation/queue?cursor=next&limit=20');
    expect(captured[0]?.init.method).toBe('GET');
    expect(captured[1]?.url).toBe('/api/v1/moderation/stories/story-1/decision');
    expect(captured[1]?.init.method).toBe('POST');
    expect(captured[1]?.init.body).toBe(
      JSON.stringify({ action: 'REJECT', reasonCode: 'PRIVACY' }),
    );
  });

  it('共途收件人请求携带 passageId，缺省仍走白名单路径', async () => {
    const { client, captured } = buildClient(200, []);

    await client.postcardRecipients('passage-1');
    await client.postcardRecipients();

    expect(captured[0]?.url).toBe('/api/v1/postcards/recipients?passageId=passage-1');
    expect(captured[1]?.url).toBe('/api/v1/postcards/recipients');
  });

  it('世界记忆地图城市聚合适配路径与主题参数', async () => {
    const { client, captured } = buildClient(200, { items: [] });

    await client.cityMemories({ topic: '雨 天' });
    await client.cityMemories();

    expect(captured[0]?.url).toBe('/api/v1/discovery/cities?topic=%E9%9B%A8+%E5%A4%A9');
    expect(captured[0]?.init.method).toBe('GET');
    expect(captured[1]?.url).toBe('/api/v1/discovery/cities');
  });

  it('封锁接口使用 GET/POST/DELETE，解除路径编码 userId', async () => {
    const { client, captured } = buildClient(200, { items: [] });

    await client.blockedUsers();
    await client.blockUser({ userId: 'user-2' });
    await client.unblockUser('user/2');

    expect(captured[0]?.url).toBe('/api/v1/safety/blocks');
    expect(captured[0]?.init.method).toBe('GET');
    expect(captured[1]?.url).toBe('/api/v1/safety/blocks');
    expect(captured[1]?.init.method).toBe('POST');
    expect(captured[1]?.init.body).toBe(JSON.stringify({ userId: 'user-2' }));
    expect(captured[2]?.url).toBe('/api/v1/safety/blocks/user%2F2');
    expect(captured[2]?.init.method).toBe('DELETE');
  });
});
