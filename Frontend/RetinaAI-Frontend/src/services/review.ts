import { apiClient } from './api';
import { cache, TTL } from './cache';

export async function submitReview(screeningId: string, review: any) {
  const { data } = await apiClient.post(`/screenings/${screeningId}/review`, review);
  // Review submitted — invalidate affected caches
  cache.invalidate(`screenings:detail:${screeningId}`);
  cache.invalidatePrefix('screenings:list');
  cache.invalidate('analytics:summary');
  cache.invalidate('review:queue');
  return data;
}

export async function getReviewQueue() {
  return cache.get(
    'review:queue',
    async () => {
      const { data } = await apiClient.get('/review/queue');
      return data;
    },
    TTL.REVIEW_QUEUE
  );
}
