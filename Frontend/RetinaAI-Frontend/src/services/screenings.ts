import { apiClient } from './api';
import { cache, TTL } from './cache';

export async function createScreening(patientId: string, previousScreeningId?: string | null) {
  const { data } = await apiClient.post('/screenings', { 
    patient_id: patientId,
    previous_screening_id: previousScreeningId || null
  });
  // A new screening was created — invalidate the list cache
  cache.invalidatePrefix('screenings:list');
  cache.invalidate('analytics:summary');
  return data;
}

export async function uploadImage(screeningId: string, eye: 'left' | 'right', file: File) {
  const form = new FormData();
  form.append('eye', eye);
  form.append('image', file);
  const { data } = await apiClient.post(`/screenings/${screeningId}/upload`, form);
  return data;
}

export async function assessQuality(screeningId: string, eye: 'left' | 'right' | 'both') {
  const { data } = await apiClient.post(`/screenings/${screeningId}/assess-quality`, { eye });
  return data;
}

export async function analyzeScreening(screeningId: string, eye: 'left' | 'right' | 'both') {
  const { data } = await apiClient.post(`/screenings/${screeningId}/analyze`, { eye });
  // Analysis complete — invalidate list and analytics caches
  cache.invalidatePrefix('screenings:list');
  cache.invalidate(`screenings:detail:${screeningId}`);
  cache.invalidate('analytics:summary');
  return data;
}

export async function getScreening(screeningId: string) {
  return cache.get(
    `screenings:detail:${screeningId}`,
    async () => {
      const { data } = await apiClient.get(`/screenings/${screeningId}`);
      return data;
    },
    TTL.SCREENING_DETAIL
  );
}

export async function listScreenings(params?: { page?: number; limit?: number; grade?: number; referable?: boolean; status?: string; patient_id?: string }) {
  const key = `screenings:list:${JSON.stringify(params || {})}`;
  return cache.get(
    key,
    async () => {
      const { data } = await apiClient.get('/screenings', { params });
      return data;
    },
    TTL.SCREENINGS
  );
}

// ── Longitudinal comparison API calls ──────────────────────────────────────────

/** Trigger (or re-trigger) longitudinal comparison for a screening. */
export async function triggerComparison(screeningId: string) {
  const { data } = await apiClient.post(`/screenings/${screeningId}/compare`);
  return data;
}

/** Retrieve existing longitudinal comparison for a screening (if any). */
export async function getComparison(screeningId: string): Promise<{ exists: boolean; comparison: any | null }> {
  const { data } = await apiClient.get(`/screenings/${screeningId}/comparison`);
  return data;
}

/** Retrieve full patient examination timeline with comparison summaries. */
export async function getPatientTimeline(patientId: string) {
  const { data } = await apiClient.get(`/patients/${patientId}/timeline`);
  return data;
}
