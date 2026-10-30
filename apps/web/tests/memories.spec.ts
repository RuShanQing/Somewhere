import { describe, expect, it } from 'vitest';
import type { PersonalMemory } from '../src/shared/api/client';
import { usePersonalMemories } from '../src/features/memories/composables/usePersonalMemories';
import {
  MEMORY_BODY_MAX,
  MEMORY_TITLE_MAX,
  canSaveMemory,
  charCount,
  memoryBodyError,
  memoryTitleError,
  memoryUpdatedLabel,
} from '../src/features/memories/personal-memory';

function memory(overrides: Partial<PersonalMemory> = {}): PersonalMemory {
  return {
    id: 'memory-1',
    title: '港口的风',
    body: '傍晚的港口有一点咸味。',
    createdAt: '2026-10-30T06:00:00.000Z',
    updatedAt: '2026-10-30T06:00:00.000Z',
    ...overrides,
  };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

describe('个人记忆展示辅助', () => {
  it('按 Unicode 码点计数 emoji', () => {
    expect(charCount('🌊')).toBe(1);
    expect(charCount('海🌊风')).toBe(3);
  });

  it('标题 80/81 与空白校验', () => {
    expect(memoryTitleError('海'.repeat(MEMORY_TITLE_MAX))).toBeNull();
    expect(memoryTitleError('海'.repeat(MEMORY_TITLE_MAX + 1))).toContain('最多');
    expect(memoryTitleError(' \n\t ')).toBe('请填写标题。');
  });

  it('正文 3000/3001 与空白校验', () => {
    expect(memoryBodyError('风'.repeat(MEMORY_BODY_MAX))).toBeNull();
    expect(memoryBodyError('风'.repeat(MEMORY_BODY_MAX + 1))).toContain('最多');
    expect(memoryBodyError('\n\t ')).toBe('请填写正文。');
  });

  it('只有标题和正文都有效才允许保存', () => {
    expect(canSaveMemory('海', '风')).toBe(true);
    expect(canSaveMemory('', '风')).toBe(false);
    expect(canSaveMemory('海', '   ')).toBe(false);
  });

  it('根据时间是否变化给出创建/更新提示', () => {
    expect(memoryUpdatedLabel(memory())).toBe('创建于');
    expect(
      memoryUpdatedLabel(memory({ updatedAt: '2026-10-30T06:10:00.000Z' })),
    ).toBe('最后更新于');
  });
});

describe('usePersonalMemories', () => {
  it('读取本人列表并保留服务端顺序', async () => {
    const feed = usePersonalMemories({
      fetchMemories: async () => ({
        items: [memory({ id: 'b' }), memory({ id: 'a' })],
      }),
    });

    await feed.load();

    expect(feed.items.value.map((item) => item.id)).toEqual(['b', 'a']);
    expect(feed.isLoading.value).toBe(false);
    expect(feed.loadError.value).toBeNull();
  });

  it('失败时清空列表并给出友好提示', async () => {
    const feed = usePersonalMemories({
      fetchMemories: async () => {
        throw new Error('boom');
      },
    });

    await feed.load();

    expect(feed.items.value).toEqual([]);
    expect(feed.isLoading.value).toBe(false);
    expect(feed.loadError.value).toBe('网络暂时不可用，请稍后再试。');
  });

  it('丢弃过期响应，避免旧列表覆盖新列表', async () => {
    const first = deferred<{ items: PersonalMemory[] }>();
    const second = deferred<{ items: PersonalMemory[] }>();
    let call = 0;

    const feed = usePersonalMemories({
      fetchMemories: () => {
        call += 1;
        return call === 1 ? first.promise : second.promise;
      },
    });

    const firstLoad = feed.load();
    const secondLoad = feed.load();

    second.resolve({ items: [memory({ id: 'new' })] });
    await secondLoad;
    first.resolve({ items: [memory({ id: 'old' })] });
    await firstLoad;

    expect(feed.items.value.map((item) => item.id)).toEqual(['new']);
    expect(feed.isLoading.value).toBe(false);
  });
});
