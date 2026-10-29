export interface RateLimitRule {
  max: number;
  windowMs: number;
}

export interface AuthRateLimits {
  registerPerIp: RateLimitRule;
  loginPerIp: RateLimitRule;
  loginPerIdentity: RateLimitRule;
}

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  isProduction: boolean;
  port: number;
  databaseUrl: string;
  webOrigins: string[];
  sessionCookieName: string;
  sessionTtlMs: number;
  secureCookies: boolean;
  authRateLimits: AuthRateLimits;
  /** 演示收件人白名单；未配置时写信页显示真实空态。 */
  postcardDemoRecipientEmails: string[];
  /** 每账号滚动 24 小时最多成功寄出的明信片数量。 */
  postcardMaxSendsPerDay: number;
  /** 独立 Worker 扫描到期明信片的间隔。 */
  deliveryPollIntervalMs: number;
  /** 每个城市同时公开的故事上限；通过审核但超出的故事排队等待。 */
  storyMaxActivePerCity: number;
  /** 每个账号在滚动窗口内最多提交的故事数量。 */
  storyMaxSubmissionsPerWindow: number;
  /** 故事提交配额的滚动窗口天数。 */
  storySubmissionWindowDays: number;
}

export const APP_CONFIG = Symbol('APP_CONFIG');

const HOUR_MS = 60 * 60 * 1000;
const FIVE_MINUTES_MS = 5 * 60 * 1000;

function readString(env: NodeJS.ProcessEnv, key: string, fallback?: string): string {
  const raw = env[key];
  if (raw === undefined || raw.trim() === '') {
    if (fallback !== undefined) {
      return fallback;
    }
    throw new Error(`缺少必需的环境变量 ${key}，请参考 apps/api/.env.example`);
  }
  return raw.trim();
}

function readInteger(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = env[key];
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`环境变量 ${key} 必须是正整数`);
  }
  return parsed;
}

function readBoolean(env: NodeJS.ProcessEnv, key: string, fallback: boolean): boolean {
  const raw = env[key];
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }
  return raw.trim().toLowerCase() === 'true';
}

function readList(env: NodeJS.ProcessEnv, key: string): string[] {
  const raw = env[key];
  if (raw === undefined || raw.trim() === '') {
    return [];
  }
  return Array.from(
    new Set(
      raw
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter((item) => item.length > 0),
    ),
  );
}

function parseNodeEnv(raw: string): AppConfig['nodeEnv'] {
  if (raw === 'production' || raw === 'test' || raw === 'development') {
    return raw;
  }
  return 'development';
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = parseNodeEnv(readString(env, 'NODE_ENV', 'development'));
  const databaseUrl = readString(env, 'DATABASE_URL');
  const webOrigins = readString(env, 'WEB_ORIGINS', 'http://localhost:5273,http://127.0.0.1:5273')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  return {
    nodeEnv,
    isProduction: nodeEnv === 'production',
    port: readInteger(env, 'PORT', 4301),
    databaseUrl,
    webOrigins,
    sessionCookieName: readString(env, 'SESSION_COOKIE_NAME', 'sw_session'),
    sessionTtlMs: readInteger(env, 'SESSION_TTL_HOURS', 168) * HOUR_MS,
    secureCookies: readBoolean(env, 'COOKIE_SECURE', nodeEnv === 'production'),
    authRateLimits: {
      registerPerIp: {
        max: readInteger(env, 'AUTH_REGISTER_MAX_PER_IP', 10),
        windowMs: readInteger(env, 'AUTH_REGISTER_WINDOW_MS', HOUR_MS),
      },
      loginPerIp: {
        max: readInteger(env, 'AUTH_LOGIN_MAX_PER_IP', 30),
        windowMs: readInteger(env, 'AUTH_LOGIN_WINDOW_MS', FIVE_MINUTES_MS),
      },
      loginPerIdentity: {
        max: readInteger(env, 'AUTH_LOGIN_MAX_PER_IDENTITY', 10),
        windowMs: readInteger(env, 'AUTH_LOGIN_WINDOW_MS', FIVE_MINUTES_MS),
      },
    },
    postcardDemoRecipientEmails: readList(env, 'POSTCARD_DEMO_RECIPIENT_EMAILS'),
    postcardMaxSendsPerDay: readInteger(env, 'POSTCARD_MAX_SENDS_PER_DAY', 10),
    deliveryPollIntervalMs: readInteger(env, 'DELIVERY_POLL_INTERVAL_MS', 60_000),
    storyMaxActivePerCity: readInteger(env, 'STORY_MAX_ACTIVE_PER_CITY', 50),
    storyMaxSubmissionsPerWindow: readInteger(env, 'STORY_MAX_SUBMISSIONS_PER_WINDOW', 3),
    storySubmissionWindowDays: readInteger(env, 'STORY_SUBMISSION_WINDOW_DAYS', 7),
  };
}
