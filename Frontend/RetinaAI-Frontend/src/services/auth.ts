import { apiClient } from './api';
export async function apiLogin(username: string, password: string) {
  const { data } = await apiClient.post('/auth/login', { username, password });
  return data;
}
export async function getMe() {
  const { data } = await apiClient.get('/auth/me');
  return data;
}
