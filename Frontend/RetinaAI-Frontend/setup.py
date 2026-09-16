import os

def write_file(path, content):
    with open(path, "w", encoding="utf-8") as f:
        f.write(content.strip() + "\n")

write_file(".env", "VITE_API_BASE_URL=http://localhost:8000/api")

write_file("src/types/index.ts", """
export type DRGrade = 0 | 1 | 2 | 3 | 4;
export type ReviewStatus = 'not_required' | 'pending' | 'reviewed';
export type QualityStatus = 'good' | 'borderline' | 'ungradable';
export type UserRole = 'health_worker' | 'doctor';
export type ScreeningStatus = 'uploading' | 'quality_check' | 'analyzing' | 'complete' | 'needs_recapture';

export interface User {
  id: string;
  username: string;
  full_name: string;
  role: UserRole;
  centre: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
}

export interface QualityScores {
  focus: number;       // 0-100
  brightness: number;
  contrast: number;
  fov: number;
  overall: number;
}

export interface QualityResult {
  status: QualityStatus;
  reason: string | null;
  recapture_message: string | null;
  scores: QualityScores;
}

export interface EyeResult {
  quality: QualityResult;
  dr_grade: DRGrade;
  dr_grade_name: string;
  class_probabilities: number[];  // [p0,p1,p2,p3,p4]
  confidence_raw: number;
  confidence_calibrated: number;
  referable: boolean;
  gradcam_url: string | null;
  vessel_overlay_url: string | null;
  vessel_mask_url: string | null;
  od_fovea_overlay_url: string | null;
  od_x: number | null;
  od_y: number | null;
  od_confidence: number | null;
  fovea_x: number | null;
  fovea_y: number | null;
  fovea_confidence: number | null;
  lesion: LesionResult | null;  // null = not available yet
}

export interface LesionCategory {
  name: string;
  detected: boolean;
  confidence: number;
  count?: number;
}

export interface LesionResult {
  microaneurysm: LesionCategory;
  exudate: LesionCategory;
  hemorrhage: LesionCategory;
  neovascularization: LesionCategory;
  overlay_url: string | null;
}

export interface ScreeningResult {
  screening_id: string;
  patient_id: string;
  patient_name: string;
  status: ScreeningStatus;
  created_at: string;
  analyzed_at: string | null;
  pipeline_time_seconds: number | null;
  left_eye: EyeResult | null;
  right_eye: EyeResult | null;
  overall_referable: boolean | null;
  recommendation: string | null;
  review_status: ReviewStatus;
  review: ReviewDecision | null;
}

export interface ReviewDecision {
  id: string;
  reviewer_name: string;
  decision: 'confirmed' | 'modified' | 'flagged';
  final_grade_left: DRGrade | null;
  final_grade_right: DRGrade | null;
  final_referable: boolean | null;
  notes: string | null;
  reviewed_at: string;
}

export interface Patient {
  id: string;
  patient_display_id: string;
  name: string;
  age: number;
  sex: string;
  diabetes_duration: number;
  previous_dr: string;
  previous_screening: string | null;
  hba1c: string | null;
  created_at: string;
  screenings?: ScreeningResult[];
}

export interface AnalyticsSummary {
  total_screenings: number;
  today_screenings: number;
  referable_cases: number;
  non_referable_cases: number;
  ungradable_images: number;
  pending_reviews: number;
  average_pipeline_time: number;
  grade_distribution: Record<string, number>;
  recapture_rate: number;
  monthly_volumes: Array<{ month: string; count: number }>;
}

export interface InProgressScreening {
  patientId: string | null;
  patientName: string | null;
  screeningId: string | null;
  leftImageFile: File | null;
  rightImageFile: File | null;
  leftPreviewUrl: string | null;
  rightPreviewUrl: string | null;
  currentEye: 'left' | 'right';
  result: ScreeningResult | null;
}
""")

write_file("src/contexts/AuthContext.tsx", """
import React, { createContext, useContext, useState, useCallback } from 'react';
import { User } from '../types';
import { apiLogin } from '../services/auth';

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  isDoctor: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem('retinaai_user');
    return stored ? JSON.parse(stored) : null;
  });
  const [token, setToken] = useState<string | null>(
    () => localStorage.getItem('retinaai_token')
  );

  const login = useCallback(async (username: string, password: string) => {
    const { access_token, user: userData } = await apiLogin(username, password);
    localStorage.setItem('retinaai_token', access_token);
    localStorage.setItem('retinaai_user', JSON.stringify(userData));
    setToken(access_token);
    setUser(userData);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('retinaai_token');
    localStorage.removeItem('retinaai_user');
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{
      user, token, isAuthenticated: !!token,
      login, logout, isDoctor: user?.role === 'doctor'
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
""")

write_file("src/contexts/ScreeningContext.tsx", """
import React, { createContext, useContext, useState } from 'react';
import { InProgressScreening, ScreeningResult } from '../types';

const defaultState: InProgressScreening = {
  patientId: null, patientName: null, screeningId: null,
  leftImageFile: null, rightImageFile: null,
  leftPreviewUrl: null, rightPreviewUrl: null,
  currentEye: 'left', result: null
};

interface ScreeningContextValue {
  screening: InProgressScreening;
  setPatient: (id: string, name: string) => void;
  setScreeningId: (id: string) => void;
  setImage: (eye: 'left' | 'right', file: File, previewUrl: string) => void;
  setResult: (result: ScreeningResult) => void;
  reset: () => void;
}

const ScreeningContext = createContext<ScreeningContextValue | null>(null);

export function ScreeningProvider({ children }: { children: React.ReactNode }) {
  const [screening, setScreening] = useState<InProgressScreening>(defaultState);

  const setPatient = (id: string, name: string) =>
    setScreening(s => ({ ...s, patientId: id, patientName: name }));
  
  const setScreeningId = (id: string) =>
    setScreening(s => ({ ...s, screeningId: id }));
  
  const setImage = (eye: 'left' | 'right', file: File, previewUrl: string) =>
    setScreening(s => ({
      ...s,
      leftImageFile: eye === 'left' ? file : s.leftImageFile,
      rightImageFile: eye === 'right' ? file : s.rightImageFile,
      leftPreviewUrl: eye === 'left' ? previewUrl : s.leftPreviewUrl,
      rightPreviewUrl: eye === 'right' ? previewUrl : s.rightPreviewUrl,
    }));
  
  const setResult = (result: ScreeningResult) =>
    setScreening(s => ({ ...s, result }));
  
  const reset = () => setScreening(defaultState);

  return (
    <ScreeningContext.Provider value={{ screening, setPatient, setScreeningId, setImage, setResult, reset }}>
      {children}
    </ScreeningContext.Provider>
  );
}

export function useScreening() {
  const ctx = useContext(ScreeningContext);
  if (!ctx) throw new Error('useScreening must be used within ScreeningProvider');
  return ctx;
}
""")

write_file("src/services/api.ts", """
import axios from 'axios';

export const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

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
""")

write_file("src/services/auth.ts", """
import { apiClient } from './api';
export async function apiLogin(username: string, password: string) {
  const form = new FormData();
  form.append('username', username);
  form.append('password', password);
  const { data } = await apiClient.post('/auth/login', form);
  return data;
}
export async function getMe() {
  const { data } = await apiClient.get('/auth/me');
  return data;
}
""")

write_file("src/services/screenings.ts", """
import { apiClient } from './api';
export async function createScreening(patientId: string) {
  const { data } = await apiClient.post('/screenings', { patient_id: patientId });
  return data;
}
export async function uploadImage(screeningId: string, eye: 'left' | 'right', file: File) {
  const form = new FormData();
  form.append('eye', eye);
  form.append('image', file);
  const { data } = await apiClient.post(`/screenings/${screeningId}/upload`, form);
  return data;
}
export async function analyzeScreening(screeningId: string, eye: 'left' | 'right' | 'both') {
  const { data } = await apiClient.post(`/screenings/${screeningId}/analyze`, { eye });
  return data;
}
export async function getScreening(screeningId: string) {
  const { data } = await apiClient.get(`/screenings/${screeningId}`);
  return data;
}
export async function listScreenings(params?: { page?: number; grade?: number; referable?: boolean; status?: string }) {
  const { data } = await apiClient.get('/screenings', { params });
  return data;
}
""")

write_file("src/services/patients.ts", """
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
""")

write_file("src/services/review.ts", """
import { apiClient } from './api';
export async function submitReview(screeningId: string, review: any) {
  const { data } = await apiClient.post(`/screenings/${screeningId}/review`, review);
  return data;
}
export async function getReviewQueue() {
  const { data } = await apiClient.get('/review/queue');
  return data;
}
""")

write_file("src/services/analytics.ts", """
import { apiClient } from './api';
export async function getAnalyticsSummary() {
  const { data } = await apiClient.get('/analytics/summary');
  return data;
}
""")

write_file("src/services/reports.ts", """
import { apiClient, API_BASE } from './api';
export function getReportPdfUrl(screeningId: string) {
  return `${API_BASE}/reports/${screeningId}`;
}
export async function generateReport(screeningId: string) {
  const { data } = await apiClient.post(`/reports/${screeningId}/generate`);
  return data;
}
""")
