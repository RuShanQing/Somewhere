import type { components } from './generated';

/** 注册/登录响应：不包含 email。 */
export type AuthSessionUser = components['schemas']['AuthSessionUserDto'];
/** `/auth/me` 响应：本人资料，额外包含 email。 */
export type AuthUser = components['schemas']['AuthUserDto'];
export type RegisterInput = components['schemas']['RegisterDto'];
export type LoginInput = components['schemas']['LoginDto'];
export type ApiErrorBody = components['schemas']['ErrorResponseDto'];
export type HealthStatus = components['schemas']['HealthResponseDto'];
export type CitySummary = components['schemas']['CitySummaryDto'];
export type Profile = components['schemas']['ProfileResponseDto'];
export type UpdateProfileInput = components['schemas']['UpdateProfileDto'];
export type ReceptionMode = Profile['receptionMode'];
export type PostOfficeSummary = components['schemas']['PostOfficeSummaryDto'];
export type PostcardRecipient = components['schemas']['RecipientResponseDto'];
export type PostcardDraft = components['schemas']['PostcardDraftResponseDto'];
export type PostcardDetail = components['schemas']['PostcardDetailDto'];
export type PostcardSendResult = components['schemas']['SendPostcardResponseDto'];
export type PostcardInboxItem = components['schemas']['InboxItemDto'];
export type PostcardTransitItem = components['schemas']['TransitItemDto'];
export type CreatePostcardDraftInput = components['schemas']['CreatePostcardDraftDto'];
export type UpdatePostcardDraftInput = components['schemas']['UpdatePostcardDraftDto'];

export interface PostcardListParams {
  limit?: number;
  offset?: number;
}

/** 服务端错误码在前端唯一映射；未知状态仍保留 HTTP 状态码用于诊断。 */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly requestId: string | undefined;
  readonly details: string[] | undefined;

  constructor(code: string, status: number, message: string, requestId?: string, details?: string[]) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.requestId = requestId;
    this.details = details;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }
}

export interface ApiClientOptions {
  /** 同源部署时留空；开发环境由 Vite 代理 /api 到 API。 */
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface ApiClient {
  me(): Promise<AuthUser>;
  register(input: RegisterInput): Promise<AuthSessionUser>;
  login(input: LoginInput): Promise<AuthSessionUser>;
  logout(): Promise<void>;
  health(): Promise<HealthStatus>;
  cities(query?: string): Promise<CitySummary[]>;
  profileMe(): Promise<Profile>;
  updateProfile(input: UpdateProfileInput): Promise<Profile>;
  postOfficeSummary(): Promise<PostOfficeSummary>;
  postcardRecipients(): Promise<PostcardRecipient[]>;
  postcardDrafts(params?: PostcardListParams): Promise<PostcardDraft[]>;
  postcardDraft(id: string): Promise<PostcardDraft>;
  createPostcardDraft(input: CreatePostcardDraftInput): Promise<PostcardDraft>;
  updatePostcardDraft(id: string, input: UpdatePostcardDraftInput): Promise<PostcardDraft>;
  deletePostcardDraft(id: string): Promise<void>;
  sendPostcardDraft(id: string, idempotencyKey?: string): Promise<PostcardSendResult>;
  transitPostcards(params?: PostcardListParams): Promise<PostcardTransitItem[]>;
  inboxPostcards(params?: PostcardListParams): Promise<PostcardInboxItem[]>;
  postcardDetail(id: string): Promise<PostcardDetail>;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
}

export function createApiClient(options: ApiClientOptions = {}): ApiClient {
  const baseUrl = (options.baseUrl ?? '').replace(/\/$/, '');
  const doFetch = options.fetchImpl ?? globalThis.fetch;

  async function request<T>(path: string, init: RequestOptions = {}): Promise<T> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...(init.headers ?? {}),
    };
    if (init.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await doFetch(`${baseUrl}${path}`, {
      method: init.method ?? 'GET',
      headers,
      credentials: 'include',
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    });

    if (response.status === 204) {
      return undefined as T;
    }

    const payload: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      const errorBody = isErrorBody(payload) ? payload : undefined;
      throw new ApiError(
        errorBody?.code ?? 'NETWORK_ERROR',
        response.status,
        errorBody?.message ?? '请求未能完成，请稍后再试',
        errorBody?.requestId,
        errorBody?.details,
      );
    }

    return payload as T;
  }

  return {
    me: () => request<AuthUser>('/api/v1/auth/me'),
    register: (input) =>
      request<AuthSessionUser>('/api/v1/auth/register', { method: 'POST', body: input }),
    login: (input) => request<AuthSessionUser>('/api/v1/auth/login', { method: 'POST', body: input }),
    logout: () => request<void>('/api/v1/auth/logout', { method: 'POST' }),
    health: () => request<HealthStatus>('/api/v1/health'),
    cities: (query) => {
      const trimmed = query?.trim();
      const suffix = trimmed ? `?query=${encodeURIComponent(trimmed)}` : '';
      return request<CitySummary[]>(`/api/v1/cities${suffix}`);
    },
    profileMe: () => request<Profile>('/api/v1/profile/me'),
    updateProfile: (input) =>
      request<Profile>('/api/v1/profile/me', { method: 'PATCH', body: input }),
    postOfficeSummary: () => request<PostOfficeSummary>('/api/v1/post-office/summary'),
    postcardRecipients: () =>
      request<PostcardRecipient[]>('/api/v1/postcards/recipients'),
    postcardDrafts: (params) =>
      request<PostcardDraft[]>(withListQuery('/api/v1/postcards/drafts', params)),
    postcardDraft: (id) =>
      request<PostcardDraft>(`/api/v1/postcards/drafts/${encodeURIComponent(id)}`),
    createPostcardDraft: (input) =>
      request<PostcardDraft>('/api/v1/postcards/drafts', { method: 'POST', body: input }),
    updatePostcardDraft: (id, input) =>
      request<PostcardDraft>(`/api/v1/postcards/drafts/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: input,
      }),
    deletePostcardDraft: (id) =>
      request<void>(`/api/v1/postcards/drafts/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
    sendPostcardDraft: (id, idempotencyKey) =>
      request<PostcardSendResult>(
        `/api/v1/postcards/drafts/${encodeURIComponent(id)}/send`,
        {
          method: 'POST',
          ...(idempotencyKey ? { headers: { 'Idempotency-Key': idempotencyKey } } : {}),
        },
      ),
    transitPostcards: (params) =>
      request<PostcardTransitItem[]>(withListQuery('/api/v1/postcards/transit', params)),
    inboxPostcards: (params) =>
      request<PostcardInboxItem[]>(withListQuery('/api/v1/postcards/inbox', params)),
    postcardDetail: (id) =>
      request<PostcardDetail>(`/api/v1/postcards/${encodeURIComponent(id)}`),
  };
}

function withListQuery(path: string, params?: PostcardListParams): string {
  if (!params) {
    return path;
  }
  const search = new URLSearchParams();
  if (params.limit !== undefined) {
    search.set('limit', String(params.limit));
  }
  if (params.offset !== undefined) {
    search.set('offset', String(params.offset));
  }
  const suffix = search.toString();
  return suffix ? `${path}?${suffix}` : path;
}

function isErrorBody(payload: unknown): payload is ApiErrorBody {
  if (typeof payload !== 'object' || payload === null) {
    return false;
  }
  const candidate = payload as Partial<ApiErrorBody>;
  return typeof candidate.code === 'string' && typeof candidate.message === 'string';
}
