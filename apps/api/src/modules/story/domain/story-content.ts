export const STORY_TITLE_MAX = 80;
export const STORY_BODY_MIN = 20;
export const STORY_BODY_MAX = 3000;
export const STORY_TAG_MAX = 3;
export const STORY_TAG_LENGTH_MAX = 24;

export type StoryTextFailure = 'blank' | 'length';

export type StoryTextResult =
  | { ok: true; value: string }
  | { ok: false; reason: StoryTextFailure };

export function countCodePoints(value: string): number {
  return Array.from(value).length;
}

export function validateStoryTitle(raw: string): StoryTextResult {
  const value = raw.trim();
  if (value.length === 0) {
    return { ok: false, reason: 'blank' };
  }
  if (countCodePoints(value) > STORY_TITLE_MAX) {
    return { ok: false, reason: 'length' };
  }
  return { ok: true, value };
}

export function validateStoryBody(raw: string): StoryTextResult {
  const value = raw.trim();
  if (value.length === 0) {
    return { ok: false, reason: 'blank' };
  }
  const length = countCodePoints(value);
  if (length < STORY_BODY_MIN || length > STORY_BODY_MAX) {
    return { ok: false, reason: 'length' };
  }
  return { ok: true, value };
}

export type StoryTagsResult =
  | { ok: true; value: string[] }
  | { ok: false; reason: 'count' | 'length' | 'empty' };

export function validateStoryTags(raw: readonly string[]): StoryTagsResult {
  const tags: string[] = [];
  const seen = new Set<string>();

  for (const item of raw) {
    const value = item.trim();
    if (value.length === 0) {
      return { ok: false, reason: 'empty' };
    }
    if (countCodePoints(value) > STORY_TAG_LENGTH_MAX) {
      return { ok: false, reason: 'length' };
    }
    const key = value.toLocaleLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    tags.push(value);
  }

  if (tags.length > STORY_TAG_MAX) {
    return { ok: false, reason: 'count' };
  }
  return { ok: true, value: tags };
}

/** 列表摘要按 Unicode 码点截断，避免把 emoji 截成半个。 */
export function excerptOf(body: string, max = 120): string {
  const points = Array.from(body);
  if (points.length <= max) {
    return body;
  }
  return `${points.slice(0, max).join('')}…`;
}
