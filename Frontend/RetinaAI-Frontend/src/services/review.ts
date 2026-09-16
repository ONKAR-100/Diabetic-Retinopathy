import { apiClient } from './api';
export async function submitReview(screeningId: string, review: any) {
  const { data } = await apiClient.post(`/screenings/${screeningId}/review`, review);
  return data;
}
export async function getReviewQueue() {
  const { data } = await apiClient.get('/review/queue');
  return data;
}
