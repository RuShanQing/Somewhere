import { ref } from 'vue';
import { api, type PersonalMemory, type PersonalMemoryList } from '../../../shared/api/client';
import { toFriendlyMemoryMessage } from '../messages';

export interface UsePersonalMemoriesOptions {
  fetchMemories?: () => Promise<PersonalMemoryList>;
}

/** 只加载本人列表；过期响应不覆盖新状态。 */
export function usePersonalMemories(options: UsePersonalMemoriesOptions = {}) {
  const fetchMemories = options.fetchMemories ?? (() => api.personalMemories());
  const items = ref<PersonalMemory[]>([]);
  const isLoading = ref(true);
  const loadError = ref<string | null>(null);

  let requestToken = 0;

  async function load(): Promise<void> {
    const token = ++requestToken;
    isLoading.value = true;
    loadError.value = null;
    try {
      const result = await fetchMemories();
      if (token !== requestToken) {
        return;
      }
      items.value = result.items;
    } catch (error) {
      if (token !== requestToken) {
        return;
      }
      items.value = [];
      loadError.value = toFriendlyMemoryMessage(error);
    } finally {
      if (token === requestToken) {
        isLoading.value = false;
      }
    }
  }

  return { items, isLoading, loadError, load };
}
