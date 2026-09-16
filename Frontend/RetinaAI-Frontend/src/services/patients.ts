import { apiClient } from './api';

export async function createPatient(data: any) {
  const { data: r } = await apiClient.post('/patients', data);
  return r;
}

export async function listPatients(search?: string) {
  const { data } = await apiClient.get('/patients', { params: { search } });
  return data;
}

export async function getPatient(id: string) {
  const { data } = await apiClient.get(`/patients/${id}`);
  return data;
}

export async function deletePatient(id: string) {
  const { data } = await apiClient.delete(`/patients/${id}`);
  return data;
}
