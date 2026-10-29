import { describe, expect, it } from 'vitest';
import type { PassageList, PassageSummary } from '../src/shared/api/client';
import {
  canPause,
  canResume,
  consentLabel,
  groupPassages,
  progressLabel,
} from '../src/features/passages/passage-groups';
import { usePassages } from '../src/features/passages/composables/usePassages';

function passage(overrides: Partial<PassageSummary> = {}): PassageSummary {
  return {
    id: 'passage-1',
    topic: '海边的冬天',
    kind: 'ONE_OFF',
    progressStatus: 'ACTIVE',
    createdAt: '2026-10-29T00:00:00.000Z',
    updatedAt: '2026-10-29T00:00:00.000Z',
    completedAt: null,
    archivedAt: null,
    me: { consentState: 'ALLOW', pausedAt: null },
    counterpart: {
      nickname: '虚构旅人',
      city: { id: 'city-1', name: '虚构城市', countryCode: 'CN' },
      consentState: 'ALLOW',
    },
    permissions: { canSend: true },
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

describe('共途分组与标签', () => {
  it('已归档单独成组，进行中与已完成留在进行区域', () => {
    const groups = groupPassages([
      passage({ id: 'a' }),
      passage({ id: 'b', progressStatus: 'COMPLETED' }),
      passage({ id: 'c', progressStatus: 'ARCHIVED' }),
    ]);
    expect(groups.active.map((item: PassageSummary) => item.id)).toEqual(['a', 'b']);
    expect(groups.archived.map((item: PassageSummary) => item.id)).toEqual(['c']);
  });

  it('进度与意愿标签不合并成布尔值', () => {
    expect(progressLabel('ACTIVE')).toBe('进行中');
    expect(progressLabel('COMPLETED')).toBe('已完成');
    expect(progressLabel('ARCHIVED')).toBe('已归档');
    expect(consentLabel('ALLOW')).toBe('可以继续');
    expect(consentLabel('PAUSED')).toBe('已停泊');
    expect(consentLabel('CLOSED')).toBe('已关闭');
  });

  it('只有 ACTIVE 且本人 ALLOW / PAUSED 时才显示对应动作', () => {
    expect(canPause(passage())).toBe(true);
    expect(canResume(passage())).toBe(false);
    expect(
      canResume(passage({ me: { consentState: 'PAUSED', pausedAt: '2026-10-29T00:00:00.000Z' } })),
    ).toBe(true);
    expect(canPause(passage({ progressStatus: 'COMPLETED' }))).toBe(false);
    expect(canPause(passage({ me: { consentState: 'CLOSED', pausedAt: null } }))).toBe(false);
  });
});

describe('usePassages', () => {
  it('读取本人共途并保留服务端顺序', async () => {
    const feed = usePassages({
      fetchPassages: async () => ({
        items: [passage({ id: 'a' }), passage({ id: 'b', progressStatus: 'ARCHIVED' })],
      }),
    });

    await feed.load();

    expect(feed.items.value.map((item: PassageSummary) => item.id)).toEqual(['a', 'b']);
    expect(feed.isLoading.value).toBe(false);
    expect(feed.loadError.value).toBeNull();
  });

  it('失败时清空列表并给出友好提示', async () => {
    const feed = usePassages({
      fetchPassages: async () => {
        throw new Error('boom');
      },
    });

    await feed.load();

    expect(feed.items.value).toEqual([]);
    expect(feed.isLoading.value).toBe(false);
    expect(feed.loadError.value).toBe('网络暂时不可用，请稍后再试。');
  });

  it('丢弃过期响应，避免旧列表覆盖新列表', async () => {
    const first = deferred<PassageList>();
    const second = deferred<PassageList>();
    let call = 0;

    const feed = usePassages({
      fetchPassages: () => {
        call += 1;
        return call === 1 ? first.promise : second.promise;
      },
    });

    const firstLoad = feed.load();
    const secondLoad = feed.load();

    second.resolve({ items: [passage({ id: 'new' })] });
    await secondLoad;
    first.resolve({ items: [passage({ id: 'old' })] });
    await firstLoad;

    expect(feed.items.value.map((item: PassageSummary) => item.id)).toEqual(['new']);
    expect(feed.isLoading.value).toBe(false);
  });
});
