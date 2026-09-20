import { apiClient } from './api';
import { cache, TTL } from './cache';

export async function getAnalyticsSummary() {
  return cache.get(
    'analytics:summary',
    async () => {
      const { data } = await apiClient.get('/analytics/summary');
      return data;
    },
    TTL.ANALYTICS
  );
}
