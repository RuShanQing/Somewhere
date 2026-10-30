import type { PersonalMemory } from '../../shared/api/client';

export const MEMORY_TITLE_MAX = 80;
export const MEMORY_BODY_MAX = 3000;

export function charCount(value: string): number {
  return Array.from(value).length;
}

export function memoryTitleError(value: string): string | null {
  const title = value.trim();
  if (title.length === 0) {
    return '请填写标题。';
  }
  if (charCount(title) > MEMORY_TITLE_MAX) {
    return `标题最多 ${MEMORY_TITLE_MAX} 个字符。`;
  }
  return null;
}

export function memoryBodyError(value: string): string | null {
  const body = value.trim();
  if (body.length === 0) {
    return '请填写正文。';
  }
  if (charCount(body) > MEMORY_BODY_MAX) {
    return `正文最多 ${MEMORY_BODY_MAX} 个字符。`;
  }
  return null;
}

export function canSaveMemory(title: string, body: string): boolean {
  return memoryTitleError(title) === null && memoryBodyError(body) === null;
}

/** 列表只做展示；不把正文截断成另一份不可编辑的副本。 */
export function memoryUpdatedLabel(memory: PersonalMemory): string {
  return memory.updatedAt === memory.createdAt ? '创建于' : '最后更新于';
}
