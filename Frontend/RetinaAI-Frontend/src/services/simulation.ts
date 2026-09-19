/**
 * RetinaAI Phase 7 - Retinal Computational Simulation Service
 * 
 * Interacts with backend simulation API endpoints:
 * - POST /api/screenings/{screening_id}/simulate
 * - GET  /api/screenings/{screening_id}/simulation
 * - GET  /api/patients/{patient_id}/simulation
 */

import { apiClient } from './api';
import { RetinalSimulationRecord } from '../types/simulation';

/**
 * Trigger (or re-compute) computational state-space simulation for a screening.
 */
export async function simulateScreening(
  screeningId: string, 
  forceRecompute: boolean = false
): Promise<RetinalSimulationRecord> {
  const { data } = await apiClient.post(
    `/screenings/${screeningId}/simulate`,
    null,
    { params: { force_recompute: forceRecompute } }
  );
  return data;
}

/**
 * Retrieve existing simulation result for a given screening (if any).
 * Returns null if no simulation has been run for this screening yet (404).
 */
export async function getScreeningSimulation(
  screeningId: string
): Promise<RetinalSimulationRecord | null> {
  try {
    const { data } = await apiClient.get(`/screenings/${screeningId}/simulation`);
    return data;
  } catch (err: any) {
    if (err.response?.status === 404) {
      return null;
    }
    throw err;
  }
}

/**
 * Retrieve all simulation records across all screenings for a given patient.
 * Returns empty array if patient has no simulations yet.
 */
export async function getPatientSimulations(
  patientId: string
): Promise<RetinalSimulationRecord[]> {
  try {
    const { data } = await apiClient.get(`/patients/${patientId}/simulation`);
    return Array.isArray(data) ? data : [];
  } catch (err: any) {
    if (err.response?.status === 404) {
      return [];
    }
    throw err;
  }
}
