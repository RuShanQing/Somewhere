import { ref } from 'vue';
import { api, type PassageList, type PassageSummary } from '../../../shared/api/client';
import { toFriendlyPassageMessage } from '../messages';

export interface UsePassagesOptions {
  fetchPassages?: () => Promise<PassageList>;
}

/** 共途列表加载：与故事站一致，过期响应不覆盖新状态。 */
export function usePassages(options: UsePassagesOptions = {}) {
  const fetchPassages = options.fetchPassages ?? (() => api.passages());
  const items = ref<PassageSummary[]>([]);
  const isLoading = ref(true);
  const loadError = ref<string | null>(null);

  let requestToken = 0;

  async function load(): Promise<void> {
    const token = ++requestToken;
    isLoading.value = true;
    loadError.value = null;
    try {
      const result = await fetchPassages();
      if (token !== requestToken) {
        return;
      }
      items.value = result.items;
    } catch (error) {
      if (token !== requestToken) {
        return;
      }
      items.value = [];
      loadError.value = toFriendlyPassageMessage(error);
    } finally {
      if (token === requestToken) {
        isLoading.value = false;
      }
    }
  }

  return { items, isLoading, loadError, load };
}
