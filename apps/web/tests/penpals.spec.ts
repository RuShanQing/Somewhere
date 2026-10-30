import { describe, expect, it } from 'vitest';
import type { PenpalOverview } from '../src/shared/api/client';
import { usePenpals } from '../src/features/penpals/composables/usePenpals';
import {
  hasPenpalActivity,
  penpalCityLabel,
  penpalEmptyDescription,
} from '../src/features/penpals/penpal-state';

function counterpart(id: string, cityName?: string) {
  return {
    id,
    nickname: `旅人${id}`,
    city: cityName ? { id: `city-${id}`, name: cityName, countryCode: 'CN' } : null,
  };
}

function overview(overrides: Partial<PenpalOverview> = {}): PenpalOverview {
  return { active: [], incoming: [], outgoing: [], ...overrides };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

describe('信友展示辅助', () => {
  it('有城市时拼接分隔符，没有城市时不产生多余文本', () => {
    expect(penpalCityLabel(counterpart('a', '里斯本'))).toBe(' · 里斯本');
    expect(penpalCityLabel(counterpart('b'))).toBe('');
  });

  it('三组都为空时没有活动，任一组非空则有活动', () => {
    expect(hasPenpalActivity(overview())).toBe(false);
    expect(hasPenpalActivity(overview({ incoming: [{ counterpart: counterpart('a') }] }))).toBe(
      true,
    );
  });

  it('空态文案强调双方同意与完成共途不自动生效', () => {
    const text = penpalEmptyDescription();
    expect(text).toContain('双方分别同意');
    expect(text).toContain('完成一段共途');
  });
});

describe('usePenpals', () => {
  it('读取三组关系并保留服务端顺序', async () => {
    const feed = usePenpals({
      fetchPenpals: async () =>
        overview({
          active: [{ counterpart: counterpart('a') }],
          incoming: [{ counterpart: counterpart('b') }],
          outgoing: [{ counterpart: counterpart('c') }],
        }),
    });

    await feed.load();

    expect(feed.overview.value.active.map((item) => item.counterpart.id)).toEqual(['a']);
    expect(feed.overview.value.incoming.map((item) => item.counterpart.id)).toEqual(['b']);
    expect(feed.overview.value.outgoing.map((item) => item.counterpart.id)).toEqual(['c']);
    expect(feed.isLoading.value).toBe(false);
    expect(feed.loadError.value).toBeNull();
  });

  it('失败时清空三组并给出友好提示', async () => {
    const feed = usePenpals({
      fetchPenpals: async () => {
        throw new Error('boom');
      },
    });

    await feed.load();

    expect(feed.overview.value).toEqual({ active: [], incoming: [], outgoing: [] });
    expect(feed.isLoading.value).toBe(false);
    expect(feed.loadError.value).toBe('网络暂时不可用，请稍后再试。');
  });

  it('丢弃过期响应，避免旧关系覆盖新关系', async () => {
    const first = deferred<PenpalOverview>();
    const second = deferred<PenpalOverview>();
    let call = 0;

    const feed = usePenpals({
      fetchPenpals: () => {
        call += 1;
        return call === 1 ? first.promise : second.promise;
      },
    });

    const firstLoad = feed.load();
    const secondLoad = feed.load();

    second.resolve(overview({ active: [{ counterpart: counterpart('new') }] }));
    await secondLoad;
    first.resolve(overview({ active: [{ counterpart: counterpart('old') }] }));
    await firstLoad;

    expect(feed.overview.value.active.map((item) => item.counterpart.id)).toEqual(['new']);
    expect(feed.isLoading.value).toBe(false);
  });
});
