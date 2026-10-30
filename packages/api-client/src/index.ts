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
export type StoryCity = components['schemas']['StoryCityDto'];
export type OwnStory = components['schemas']['OwnStoryDto'];
export type PublicStoryItem = components['schemas']['PublicStoryItemDto'];
export type PublicStoryList = components['schemas']['PublicStoryListDto'];
export type PublicStoryDetail = components['schemas']['PublicStoryDetailDto'];
export type ModerationStoryItem = components['schemas']['ModerationStoryItemDto'];
export type ModerationQueue = components['schemas']['ModerationQueueDto'];
export type CreateStoryInput = components['schemas']['CreateStoryDto'];
export type UpdateStoryInput = components['schemas']['UpdateStoryDto'];
export type StoryDecisionInput = components['schemas']['StoryDecisionDto'];
export type StoryDecisionResult = components['schemas']['StoryDecisionResponseDto'];
export type DiscoveryCity = components['schemas']['DiscoveryCityDto'];
export type CityMemoryItem = components['schemas']['CityMemoryItemDto'];
export type CityMemoryList = components['schemas']['CityMemoryListDto'];
export type PassageSummary = components['schemas']['PassageSummaryDto'];
export type PassageList = components['schemas']['PassageListDto'];
export type PassageProgressStatus = PassageSummary['progressStatus'];
export type PassageConsentState = PassageSummary['me']['consentState'];
export type BlockedUser = components['schemas']['BlockedUserDto'];
export type BlockList = components['schemas']['BlockListDto'];
export type BlockUserInput = components['schemas']['BlockUserDto'];
export type PenpalCity = components['schemas']['PenpalCityDto'];
export type PenpalCounterpart = components['schemas']['PenpalCounterpartDto'];
export type PenpalActive = components['schemas']['PenpalActiveDto'];
export type PenpalPending = components['schemas']['PenpalPendingDto'];
export type PenpalOverview = components['schemas']['PenpalOverviewDto'];
export type PenpalConsentInput = components['schemas']['PenpalConsentDto'];
export type PenpalConsentResult = components['schemas']['PenpalConsentResultDto'];
export type PersonalMemory = components['schemas']['PersonalMemoryDto'];
export type PersonalMemoryList = components['schemas']['PersonalMemoryListDto'];
export type CreatePersonalMemoryInput = components['schemas']['CreatePersonalMemoryDto'];
export type UpdatePersonalMemoryInput = components['schemas']['UpdatePersonalMemoryDto'];

export interface PostcardListParams {
  limit?: number;
  offset?: number;
}

export interface StoryListParams {
  cityId?: string;
  topic?: string;
  cursor?: string;
  limit?: number;
}

export interface ModerationQueueParams {
  cursor?: string;
  limit?: number;
}

export interface CityMemoryParams {
  topic?: string;
}

export interface PassageListParams {
  status?: 'ALL' | PassageProgressStatus;
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
  postcardRecipients(passageId?: string): Promise<PostcardRecipient[]>;
  postcardDrafts(params?: PostcardListParams): Promise<PostcardDraft[]>;
  postcardDraft(id: string): Promise<PostcardDraft>;
  createPostcardDraft(input: CreatePostcardDraftInput): Promise<PostcardDraft>;
  updatePostcardDraft(id: string, input: UpdatePostcardDraftInput): Promise<PostcardDraft>;
  deletePostcardDraft(id: string): Promise<void>;
  sendPostcardDraft(id: string, idempotencyKey?: string): Promise<PostcardSendResult>;
  transitPostcards(params?: PostcardListParams): Promise<PostcardTransitItem[]>;
  inboxPostcards(params?: PostcardListParams): Promise<PostcardInboxItem[]>;
  postcardDetail(id: string): Promise<PostcardDetail>;
  stories(params?: StoryListParams): Promise<PublicStoryList>;
  storyDetail(id: string): Promise<PublicStoryDetail>;
  cityMemories(params?: CityMemoryParams): Promise<CityMemoryList>;
  myStories(): Promise<OwnStory[]>;
  myStory(id: string): Promise<OwnStory>;
  createStory(input: CreateStoryInput): Promise<OwnStory>;
  updateStory(id: string, input: UpdateStoryInput): Promise<OwnStory>;
  deleteStory(id: string): Promise<void>;
  submitStory(id: string): Promise<OwnStory>;
  withdrawStory(id: string): Promise<OwnStory>;
  moderationQueue(params?: ModerationQueueParams): Promise<ModerationQueue>;
  decideStory(id: string, input: StoryDecisionInput): Promise<StoryDecisionResult>;
  passages(params?: PassageListParams): Promise<PassageList>;
  passageDetail(id: string): Promise<PassageSummary>;
  pausePassage(id: string): Promise<PassageSummary>;
  resumePassage(id: string): Promise<PassageSummary>;
  completePassage(id: string): Promise<PassageSummary>;
  archivePassage(id: string): Promise<PassageSummary>;
  blockedUsers(): Promise<BlockList>;
  blockUser(input: BlockUserInput): Promise<BlockedUser>;
  unblockUser(userId: string): Promise<void>;
  penpals(): Promise<PenpalOverview>;
  consentPenpal(input: PenpalConsentInput): Promise<PenpalConsentResult>;
  revokePenpalConsent(counterpartId: string): Promise<void>;
  personalMemories(query?: { limit?: number; offset?: number }): Promise<PersonalMemoryList>;
  createPersonalMemory(input: CreatePersonalMemoryInput): Promise<PersonalMemory>;
  updatePersonalMemory(
    id: string,
    input: UpdatePersonalMemoryInput,
  ): Promise<PersonalMemory>;
  deletePersonalMemory(id: string): Promise<void>;
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
    postcardRecipients: (passageId) =>
      request<PostcardRecipient[]>(
        withQuery('/api/v1/postcards/recipients', passageId ? { passageId } : undefined),
      ),
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
    stories: (params) =>
      request<PublicStoryList>(withQuery('/api/v1/stories', params)),
    storyDetail: (id) =>
      request<PublicStoryDetail>(`/api/v1/stories/${encodeURIComponent(id)}`),
    cityMemories: (params) =>
      request<CityMemoryList>(withQuery('/api/v1/discovery/cities', params)),
    myStories: () => request<OwnStory[]>('/api/v1/stories/mine'),
    myStory: (id) =>
      request<OwnStory>(`/api/v1/stories/mine/${encodeURIComponent(id)}`),
    createStory: (input) =>
      request<OwnStory>('/api/v1/stories', { method: 'POST', body: input }),
    updateStory: (id, input) =>
      request<OwnStory>(`/api/v1/stories/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: input,
      }),
    deleteStory: (id) =>
      request<void>(`/api/v1/stories/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    submitStory: (id) =>
      request<OwnStory>(`/api/v1/stories/${encodeURIComponent(id)}/submit`, {
        method: 'POST',
      }),
    withdrawStory: (id) =>
      request<OwnStory>(`/api/v1/stories/${encodeURIComponent(id)}/withdraw`, {
        method: 'POST',
      }),
    moderationQueue: (params) =>
      request<ModerationQueue>(withQuery('/api/v1/moderation/queue', params)),
    decideStory: (id, input) =>
      request<StoryDecisionResult>(
        `/api/v1/moderation/stories/${encodeURIComponent(id)}/decision`,
        { method: 'POST', body: input },
      ),
    passages: (params) =>
      request<PassageList>(withQuery('/api/v1/passages', params)),
    passageDetail: (id) =>
      request<PassageSummary>(`/api/v1/passages/${encodeURIComponent(id)}`),
    pausePassage: (id) =>
      request<PassageSummary>(`/api/v1/passages/${encodeURIComponent(id)}/pause`, {
        method: 'POST',
      }),
    resumePassage: (id) =>
      request<PassageSummary>(`/api/v1/passages/${encodeURIComponent(id)}/resume`, {
        method: 'POST',
      }),
    completePassage: (id) =>
      request<PassageSummary>(`/api/v1/passages/${encodeURIComponent(id)}/complete`, {
        method: 'POST',
      }),
    archivePassage: (id) =>
      request<PassageSummary>(`/api/v1/passages/${encodeURIComponent(id)}/archive`, {
        method: 'POST',
      }),
    blockedUsers: () => request<BlockList>('/api/v1/safety/blocks'),
    blockUser: (input) =>
      request<BlockedUser>('/api/v1/safety/blocks', { method: 'POST', body: input }),
    unblockUser: (userId) =>
      request<void>(`/api/v1/safety/blocks/${encodeURIComponent(userId)}`, {
        method: 'DELETE',
      }),
    penpals: () => request<PenpalOverview>('/api/v1/penpals'),
    consentPenpal: (input) =>
      request<PenpalConsentResult>('/api/v1/penpals/consent', {
        method: 'POST',
        body: input,
      }),
    revokePenpalConsent: (counterpartId) =>
      request<void>(`/api/v1/penpals/${encodeURIComponent(counterpartId)}/consent`, {
        method: 'DELETE',
      }),
    personalMemories: (query) => {
      const params = new URLSearchParams();
      if (query?.limit !== undefined) {
        params.set('limit', String(query.limit));
      }
      if (query?.offset !== undefined) {
        params.set('offset', String(query.offset));
      }
      const suffix = params.toString();
      return request<PersonalMemoryList>(
        `/api/v1/memories/personal${suffix ? `?${suffix}` : ''}`,
      );
    },
    createPersonalMemory: (input) =>
      request<PersonalMemory>('/api/v1/memories/personal', {
        method: 'POST',
        body: input,
      }),
    updatePersonalMemory: (id, input) =>
      request<PersonalMemory>(
        `/api/v1/memories/personal/${encodeURIComponent(id)}`,
        { method: 'PATCH', body: input },
      ),
    deletePersonalMemory: (id) =>
      request<void>(`/api/v1/memories/personal/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
  };
}

/** 只拼接字符串 / 数字查询参数；空字符串与 undefined 视为未提供。 */
function withQuery(path: string, params?: object): string {
  if (!params) {
    return path;
  }
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if ((typeof value === 'string' && value !== '') || typeof value === 'number') {
      search.set(key, String(value));
    }
  }
  const suffix = search.toString();
  return suffix ? `${path}?${suffix}` : path;
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
