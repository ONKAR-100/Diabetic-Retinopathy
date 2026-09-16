import axios from 'axios';

// Dynamically resolve backend host.
// In dev and LAN, requests route through Vite's proxy on the same origin (port 5173 -> backend 8000)
// This eliminates CORS issues and Windows Firewall port 8000 blocking across network devices.
export const BACKEND_URL = (() => {
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return 'http://localhost:5173';
})();

export const API_BASE = (() => {
  const envUrl = import.meta.env.VITE_API_BASE_URL;
  if (envUrl) return envUrl;
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api`;
  }
  return 'http://localhost:5173/api';
})();

export const apiClient = axios.create({ baseURL: API_BASE });

apiClient.interceptors.request.use(config => {
  const token = localStorage.getItem('retinaai_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

apiClient.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('retinaai_token');
      localStorage.removeItem('retinaai_user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);
