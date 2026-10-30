import { ref } from 'vue';
import { api, type PenpalOverview } from '../../../shared/api/client';
import { toFriendlyPenpalMessage } from '../messages';

const EMPTY: PenpalOverview = { active: [], incoming: [], outgoing: [] };

export interface UsePenpalsOptions {
  fetchPenpals?: () => Promise<PenpalOverview>;
}

/** 信友列表加载：与共途列表一致，过期响应不覆盖新状态。 */
export function usePenpals(options: UsePenpalsOptions = {}) {
  const fetchPenpals = options.fetchPenpals ?? (() => api.penpals());
  const overview = ref<PenpalOverview>({ ...EMPTY });
  const isLoading = ref(true);
  const loadError = ref<string | null>(null);

  let requestToken = 0;

  async function load(): Promise<void> {
    const token = ++requestToken;
    isLoading.value = true;
    loadError.value = null;
    try {
      const result = await fetchPenpals();
      if (token !== requestToken) {
        return;
      }
      overview.value = result;
    } catch (error) {
      if (token !== requestToken) {
        return;
      }
      overview.value = { ...EMPTY };
      loadError.value = toFriendlyPenpalMessage(error);
    } finally {
      if (token === requestToken) {
        isLoading.value = false;
      }
    }
  }

  return { overview, isLoading, loadError, load };
}
