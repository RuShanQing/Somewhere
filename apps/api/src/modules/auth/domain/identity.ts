export {
  NICKNAME_MAX_LENGTH,
  NICKNAME_MIN_LENGTH,
  isValidNickname,
  normalizeNickname,
} from '../../../common/identity/nickname';

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 256;
export const EMAIL_MAX_LENGTH = 254;

const CONTROL_CHARACTERS = /\p{Cc}/u;
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 邮箱唯一性以 trim + 小写后的形式判断，大小写与前后空格不产生第二个账号。 */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidEmail(raw: string): boolean {
  const email = normalizeEmail(raw);
  if (email.length === 0 || email.length > EMAIL_MAX_LENGTH) {
    return false;
  }
  return EMAIL_SHAPE.test(email) && !CONTROL_CHARACTERS.test(email);
}

/** 12–256 字符；全空白不算有效密码，但允许空格出现在较长口令中。 */
export function isValidPassword(raw: string): boolean {
  const codePoints = Array.from(raw).length;
  if (codePoints < PASSWORD_MIN_LENGTH || codePoints > PASSWORD_MAX_LENGTH) {
    return false;
  }
  return raw.trim().length > 0 && !CONTROL_CHARACTERS.test(raw);
}
