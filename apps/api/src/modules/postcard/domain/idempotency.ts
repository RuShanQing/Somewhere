export const IDEMPOTENCY_KEY_MAX_LENGTH = 80;
const ALLOWED_KEY = /^[A-Za-z0-9._:-]+$/;

/** 幂等键只接受可见 ASCII 字符，避免把任意文本写进数据库或日志。 */
export function normalizeIdempotencyKey(raw: string | undefined): string | null {
  if (raw === undefined || raw.trim() === '') {
    return null;
  }
  const key = raw.trim();
  if (key.length > IDEMPOTENCY_KEY_MAX_LENGTH || !ALLOWED_KEY.test(key)) {
    throw new RangeError('幂等键不合法');
  }
  return key;
}
