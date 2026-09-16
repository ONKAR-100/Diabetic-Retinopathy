import { apiClient, API_BASE } from './api';
export function getReportPdfUrl(screeningId: string) {
  return `${API_BASE}/reports/${screeningId}`;
}
export async function generateReport(screeningId: string) {
  const { data } = await apiClient.post(`/reports/${screeningId}/generate`);
  return data;
}
