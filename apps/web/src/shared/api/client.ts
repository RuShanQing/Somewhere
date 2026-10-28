import { createApiClient } from '@somewhere/api-client';

/** 同源请求：开发环境由 Vite 代理 /api 到 NestJS，会话 Cookie 不会跨站。 */
export const api = createApiClient();

export { ApiError } from '@somewhere/api-client';
export type {
  AuthSessionUser,
  AuthUser,
  CitySummary,
  CreatePostcardDraftInput,
  LoginInput,
  PostcardDetail,
  PostcardDraft,
  PostcardInboxItem,
  PostcardRecipient,
  PostcardSendResult,
  PostcardTransitItem,
  PostOfficeSummary,
  Profile,
  ReceptionMode,
  RegisterInput,
  UpdatePostcardDraftInput,
  UpdateProfileInput,
} from '@somewhere/api-client';
