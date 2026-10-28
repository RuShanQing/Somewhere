const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi;
const CONNECTION_STRING_PATTERN = /\bpostgres(?:ql)?:\/\/[^\s"']+/gi;
const SECRET_PAIR_PATTERN =
  /("?(?:password|passwordHash|password_hash|token|session|sessionHash|authorization|cookie)"?\s*[:=]\s*)("?)([^",\s}]+)/gi;

/**
 * 日志脱敏：邮箱、密码/会话字段与 Bearer 值都不落地。
 * 只用于日志与错误摘要，不用于业务数据。
 */
export function sanitizeForLog(value: unknown, maxLength = 300): string {
  const text = typeof value === 'string' ? value : String(value);
  const sanitized = text
    .replace(CONNECTION_STRING_PATTERN, '[redacted-connection-string]')
    .replace(EMAIL_PATTERN, '[redacted-email]')
    .replace(BEARER_PATTERN, 'Bearer [redacted]')
    .replace(SECRET_PAIR_PATTERN, '$1[redacted]')
    .replace(/[\p{Cc}]/gu, ' ');

  return sanitized.length > maxLength ? `${sanitized.slice(0, maxLength)}…` : sanitized;
}
