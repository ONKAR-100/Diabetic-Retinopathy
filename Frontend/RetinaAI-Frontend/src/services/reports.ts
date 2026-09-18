import { apiClient, API_BASE } from './api';

export function getReportPdfUrl(screeningId: string) {
  return `${API_BASE}/reports/${screeningId}`;
}

export async function generateReport(screeningId: string) {
  const { data } = await apiClient.post(`/reports/${screeningId}/generate`);
  return data;
}

export async function fetchReportPdfBlobUrl(screeningId: string): Promise<string> {
  const response = await apiClient.get(`/reports/${screeningId}`, {
    responseType: 'blob'
  });
  const blob = new Blob([response.data], { type: 'application/pdf' });
  return URL.createObjectURL(blob);
}
