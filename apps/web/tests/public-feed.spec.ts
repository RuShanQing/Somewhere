import { describe, expect, it } from 'vitest';
import type {
  PublicStoryItem,
  PublicStoryList,
  StoryListParams,
} from '../src/shared/api/client';
import { usePublicFeed } from '../src/features/discover/composables/usePublicFeed';

function story(id: string): PublicStoryItem {
  return {
    id,
    title: `故事 ${id}`,
    excerpt: '摘要',
    topicTags: [],
    authorNickname: '虚构作者',
    city: { id: 'city-1', name: '虚构城市', countryCode: 'CN' },
    publishedAt: '2026-10-29T00:00:00.000Z',
  };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

describe('usePublicFeed', () => {
  it('读取第一页并保留游标', async () => {
    const calls: StoryListParams[] = [];
    const feed = usePublicFeed(() => ({ cityId: 'city-1', topic: ' 雨天 ' }), {
      fetchStories: async (params) => {
        calls.push(params);
        return { items: [story('a')], nextCursor: 'cursor-1' };
      },
    });

    await feed.load();

    expect(calls).toEqual([{ cityId: 'city-1', topic: '雨天', limit: 12 }]);
    expect(feed.items.value.map((item) => item.id)).toEqual(['a']);
    expect(feed.nextCursor.value).toBe('cursor-1');
    expect(feed.isLoading.value).toBe(false);
    expect(feed.loadError.value).toBeNull();
  });

  it('加载更多会追加结果并在没有游标时停止', async () => {
    const calls: StoryListParams[] = [];
    const feed = usePublicFeed(() => ({}), {
      pageSize: 1,
      fetchStories: async (params) => {
        calls.push(params);
        return params.cursor
          ? { items: [story('b')], nextCursor: null }
          : { items: [story('a')], nextCursor: 'next' };
      },
    });

    await feed.load();
    await feed.loadMore();
    await feed.loadMore();

    expect(calls).toHaveLength(2);
    expect(calls[1]?.cursor).toBe('next');
    expect(feed.items.value.map((item) => item.id)).toEqual(['a', 'b']);
    expect(feed.nextCursor.value).toBeNull();
  });

  it('丢弃过期响应，避免旧筛选覆盖新筛选', async () => {
    const first = deferred<PublicStoryList>();
    const second = deferred<PublicStoryList>();
    const filters: { cityId?: string } = { cityId: 'city-old' };
    let call = 0;

    const feed = usePublicFeed(() => filters, {
      fetchStories: () => {
        call += 1;
        return call === 1 ? first.promise : second.promise;
      },
    });

    const firstLoad = feed.load();
    filters.cityId = 'city-new';
    const secondLoad = feed.load();

    second.resolve({ items: [story('new')], nextCursor: null });
    await secondLoad;
    first.resolve({ items: [story('old')], nextCursor: null });
    await firstLoad;

    expect(feed.items.value.map((item) => item.id)).toEqual(['new']);
    expect(feed.isLoading.value).toBe(false);
  });

  it('失败时清空列表并给出友好提示，不把错误当成空态', async () => {
    const feed = usePublicFeed(() => ({}), {
      fetchStories: async () => {
        throw new Error('boom');
      },
    });

    await feed.load();

    expect(feed.items.value).toEqual([]);
    expect(feed.isLoading.value).toBe(false);
    expect(feed.loadError.value).toBe('网络暂时不可用，请稍后再试。');
  });
});
