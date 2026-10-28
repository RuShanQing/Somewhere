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
});
