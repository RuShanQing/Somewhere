export const POSTCARD_BODY_MAX_LENGTH = 2000;

export type BodyValidation =
  | { ok: true; body: string }
  | { ok: false; reason: 'blank' | 'length' };

/** 正文按 Unicode 码点计数，避免 emoji 被 UTF-16 长度误判。 */
export function countPostcardCharacters(value: string): number {
  return Array.from(value).length;
}

export function validatePostcardBody(raw: string): BodyValidation {
  const body = raw.trim();
  if (body.length === 0) {
    return { ok: false, reason: 'blank' };
  }
  const length = countPostcardCharacters(body);
  if (length > POSTCARD_BODY_MAX_LENGTH) {
    return { ok: false, reason: 'length' };
  }
  return { ok: true, body };
}
