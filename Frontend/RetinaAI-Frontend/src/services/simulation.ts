/**
 * RetinaAI Phase 7.1 - Retinal Computational Simulation Service
 *
 * Interacts with authoritative backend simulation API endpoints:
 * - POST /api/screenings/{screening_id}/simulate
 * - GET  /api/screenings/{screening_id}/simulation
 * - GET  /api/patients/{patient_id}/simulation
 *
 * Adapts backend SimulationResponse envelope ({ left, right, has_simulation })
 * into typed models and consumable item lists.
 */

import { apiClient } from './api';
import { SimulationResponse, SimulationItem } from '../types/simulation';

/**
 * Helper to unpack non-null simulation items from a SimulationResponse envelope.
 * Returns an array containing available eye simulations:
 * - [left, right] if both exist
 * - [left] if left only
 * - [right] if right only
 * - [] if neither exists or has_simulation is false
 */
export function extractSimulationsList(res: SimulationResponse | null | undefined): SimulationItem[] {
  if (!res || !res.has_simulation) {
    return [];
  }
  const items: SimulationItem[] = [];
  if (res.left && typeof res.left === 'object' && res.left.id) {
    items.push(res.left);
  }
  if (res.right && typeof res.right === 'object' && res.right.id) {
    items.push(res.right);
  }
  return items;
}

/**
 * Trigger (or re-compute) computational state-space simulation for a screening.
 * Returns the authoritative SimulationResponse envelope.
 */
export async function simulateScreening(
  screeningId: string, 
  forceRecompute: boolean = false,
  eye: 'left' | 'right' | 'both' = 'both'
): Promise<SimulationResponse> {
  const { data } = await apiClient.post(
    `/screenings/${screeningId}/simulate`,
    { eye },
    { params: { force_recompute: forceRecompute } }
  );
  return data;
}

/**
 * Retrieve existing simulation result for a given screening (if any).
 * Returns the SimulationResponse envelope, or null if 404.
 */
export async function getScreeningSimulation(
  screeningId: string
): Promise<SimulationResponse | null> {
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
 * Retrieve simulation response envelope for a given patient.
 * Returns the SimulationResponse envelope, or null if 404.
 */
export async function getPatientSimulation(
  patientId: string
): Promise<SimulationResponse | null> {
  try {
    const { data } = await apiClient.get(`/patients/${patientId}/simulation`);
    return data;
  } catch (err: any) {
    if (err.response?.status === 404) {
      return null;
    }
    throw err;
  }
}

/**
 * Retrieve all available eye simulation items for a patient as a list.
 * Unpacks { left, right } from the backend envelope cleanly.
 * Returns [] if patient has no simulations.
 */
export async function getPatientSimulations(
  patientId: string
): Promise<SimulationItem[]> {
  try {
    const data = await getPatientSimulation(patientId);
    return extractSimulationsList(data);
  } catch (err: any) {
    return [];
  }
}
