export const NICKNAME_MIN_LENGTH = 1;
export const NICKNAME_MAX_LENGTH = 32;

const CONTROL_CHARACTERS = /\p{Cc}/u;

/** 昵称只裁剪首尾空白并折叠内部连续空白，保留用户可读的书写方式。 */
export function normalizeNickname(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

export function isValidNickname(raw: string): boolean {
  const nickname = normalizeNickname(raw);
  const codePoints = Array.from(nickname).length;
  if (codePoints < NICKNAME_MIN_LENGTH || codePoints > NICKNAME_MAX_LENGTH) {
    return false;
  }
  return !CONTROL_CHARACTERS.test(nickname);
}
