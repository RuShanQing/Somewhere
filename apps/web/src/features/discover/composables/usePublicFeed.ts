import { ref, type Ref } from 'vue';
import { api } from '../../../shared/api/client';
import type { PublicStoryItem, PublicStoryList, StoryListParams } from '../../../shared/api/client';
import { toFriendlyStoryMessage } from '../../../shared/story/messages';

export interface PublicFeedFilters {
  cityId?: string;
  topic?: string;
}

export interface PublicFeedOptions {
  pageSize?: number;
  /** 便于组件测试注入假数据；默认走真实公开故事接口。 */
  fetchStories?: (params: StoryListParams) => Promise<PublicStoryList>;
}

export interface PublicFeed {
  items: Ref<PublicStoryItem[]>;
  nextCursor: Ref<string | null>;
  isLoading: Ref<boolean>;
  isLoadingMore: Ref<boolean>;
  loadError: Ref<string | null>;
  load: () => Promise<void>;
  loadMore: () => Promise<void>;
}

/**
 * 城市故事站与世界记忆地图城市页共用的公开列表读取逻辑。
 * 只负责分页、四态与过期响应丢弃；公开可见性由服务端决定，前端不做过滤。
 */
export function usePublicFeed(
  filters: () => PublicFeedFilters,
  options: PublicFeedOptions = {},
): PublicFeed {
  const pageSize = options.pageSize ?? 12;
  const fetchStories = options.fetchStories ?? ((params: StoryListParams) => api.stories(params));

  const items = ref<PublicStoryItem[]>([]);
  const nextCursor = ref<string | null>(null);
  const isLoading = ref(true);
  const isLoadingMore = ref(false);
  const loadError = ref<string | null>(null);

  let requestToken = 0;

  function buildParams(cursor?: string): StoryListParams {
    const { cityId, topic } = filters();
    const trimmedTopic = topic?.trim();
    return {
      ...(cityId ? { cityId } : {}),
      ...(trimmedTopic ? { topic: trimmedTopic } : {}),
      ...(cursor ? { cursor } : {}),
      limit: pageSize,
    };
  }

  async function load(): Promise<void> {
    const token = ++requestToken;
    isLoading.value = true;
    isLoadingMore.value = false;
    loadError.value = null;
    nextCursor.value = null;
    try {
      const result = await fetchStories(buildParams());
      if (token !== requestToken) {
        return;
      }
      items.value = result.items;
      nextCursor.value = result.nextCursor ?? null;
    } catch (error) {
      if (token !== requestToken) {
        return;
      }
      items.value = [];
      loadError.value = toFriendlyStoryMessage(error);
    } finally {
      if (token === requestToken) {
        isLoading.value = false;
      }
    }
  }

  async function loadMore(): Promise<void> {
    const cursor = nextCursor.value;
    if (!cursor || isLoading.value || isLoadingMore.value) {
      return;
    }
    const token = requestToken;
    isLoadingMore.value = true;
    try {
      const result = await fetchStories(buildParams(cursor));
      if (token !== requestToken) {
        return;
      }
      items.value = [...items.value, ...result.items];
      nextCursor.value = result.nextCursor ?? null;
    } catch (error) {
      if (token !== requestToken) {
        return;
      }
      loadError.value = toFriendlyStoryMessage(error);
    } finally {
      if (token === requestToken) {
        isLoadingMore.value = false;
      }
    }
  }

  return { items, nextCursor, isLoading, isLoadingMore, loadError, load, loadMore };
}
