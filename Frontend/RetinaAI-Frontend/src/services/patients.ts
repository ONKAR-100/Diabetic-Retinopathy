import { apiClient } from './api';
import { cache, TTL } from './cache';

export async function createPatient(data: any) {
  const { data: r } = await apiClient.post('/patients', data);
  cache.invalidate('patients:list');
  return r;
}

export async function listPatients(search?: string) {
  const key = `patients:list:${search || ''}`;
  return cache.get(
    key,
    async () => {
      const { data } = await apiClient.get('/patients', { params: { search } });
      return data;
    },
    TTL.PATIENTS
  );
}

export async function getPatient(id: string) {
  return cache.get(
    `patients:detail:${id}`,
    async () => {
      const { data } = await apiClient.get(`/patients/${id}`);
      return data;
    },
    TTL.PATIENTS
  );
}

export async function deletePatient(id: string) {
  const { data } = await apiClient.delete(`/patients/${id}`);
  cache.invalidatePrefix('patients:');
  return data;
}
