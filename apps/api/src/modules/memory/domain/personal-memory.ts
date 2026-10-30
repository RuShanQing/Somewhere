/** 个人记忆校验纯函数：不依赖 NestJS、Prisma 或数据库。 */

export const PERSONAL_MEMORY_TITLE_MAX = 80;
export const PERSONAL_MEMORY_BODY_MAX = 3000;

export interface PersonalMemoryFields {
  title: string;
  body: string;
}

export type PersonalMemoryCreateResult =
  | { ok: true; value: PersonalMemoryFields }
  | { ok: false; details: string[] };

export type PersonalMemoryUpdateResult =
  | { ok: true; value: { title?: string; body?: string } }
  | { ok: false; details: string[] };

function charCount(value: string): number {
  return Array.from(value).length;
}

function validateTitle(raw: string): string | null {
  const value = raw.trim();
  if (value.length === 0) {
    return 'title:required';
  }
  if (charCount(value) > PERSONAL_MEMORY_TITLE_MAX) {
    return 'title:tooLong';
  }
  return null;
}

function validateBody(raw: string): string | null {
  const value = raw.trim();
  if (value.length === 0) {
    return 'body:required';
  }
  if (charCount(value) > PERSONAL_MEMORY_BODY_MAX) {
    return 'body:tooLong';
  }
  return null;
}

export function validatePersonalMemoryCreate(input: {
  title: string;
  body: string;
}): PersonalMemoryCreateResult {
  const details: string[] = [];
  const titleError = validateTitle(input.title);
  const bodyError = validateBody(input.body);
  if (titleError) {
    details.push(titleError);
  }
  if (bodyError) {
    details.push(bodyError);
  }
  if (details.length > 0) {
    return { ok: false, details };
  }
  return { ok: true, value: { title: input.title.trim(), body: input.body.trim() } };
}

export function validatePersonalMemoryUpdate(input: {
  title?: string;
  body?: string;
}): PersonalMemoryUpdateResult {
  const details: string[] = [];
  const value: { title?: string; body?: string } = {};

  if (input.title !== undefined) {
    const titleError = validateTitle(input.title);
    if (titleError) {
      details.push(titleError);
    } else {
      value.title = input.title.trim();
    }
  }

  if (input.body !== undefined) {
    const bodyError = validateBody(input.body);
    if (bodyError) {
      details.push(bodyError);
    } else {
      value.body = input.body.trim();
    }
  }

  if (input.title === undefined && input.body === undefined) {
    return { ok: false, details: ['update:empty'] };
  }
  if (details.length > 0) {
    return { ok: false, details };
  }
  return { ok: true, value };
}
