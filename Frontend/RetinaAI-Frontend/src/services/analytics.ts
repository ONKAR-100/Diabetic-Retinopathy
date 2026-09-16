import { apiClient } from './api';
export async function getAnalyticsSummary() {
  const { data } = await apiClient.get('/analytics/summary');
  return data;
}
