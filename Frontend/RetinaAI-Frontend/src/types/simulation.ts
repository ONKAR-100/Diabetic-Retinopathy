/**
 * RetinaAI Phase 7.1 - Retinal Computational State-Space Simulation Types
 * 
 * Defines data structures aligned with the authoritative backend Pydantic schemas
 * (Backend/retinaai-backend/schemas/simulation.py) for the LTI state-space simulation
 * layer downstream of Phase 6 biomarkers.
 * 
 * SCIENTIFIC INTEGRITY CONSTRAINT:
 * This is an engineering/research computational state model.
 * These metrics are computational states, NOT disease progression predictions,
 * clinical risk scores, or diagnostic severities.
 */

export interface BiomarkerInputSnapshot {
  vessel_density?: number;
  branch_count?: number;
  zone_b_count?: number;
  distance_tortuosity?: number;
  curvature_tortuosity?: number;
  fractal_dimension?: number;
  fractal_r_squared?: number;
  [key: string]: any;
}

export interface NormalizedInputs {
  normalization_version: string;
  u_dens: number;
  u_branch: number;
  u_zb: number;
  u_tau_d: number;
  u_tau_c: number;
  u_Df_star: number;
  u_Df_raw?: number;
  w_fit: number;
  [key: string]: any;
}

export interface SimulationOutputState {
  structural_complexity_state: number;
  tortuosity_computational_state: number;
  vascular_bed_density_state: number;
  composite_retinal_computational_state: number;
}

/**
 * Trajectory contract as returned by backend Pydantic schema:
 * { theta: number[], complexity_curve: number[], tortuosity_curve: number[], density_curve: number[] }
 * Plus optional compatibility alias fields.
 */
export interface SimulationTrajectory {
  theta?: number[];
  complexity_curve?: number[];
  tortuosity_curve?: number[];
  density_curve?: number[];
  // Compatibility aliases
  time?: number[];
  structural_complexity?: number[];
  tortuosity?: number[];
  vascular_bed_density?: number[];
  composite_state?: number[];
}

export type SimulationExecutionStatus = 
  | 'not_simulated'
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'disabled'
  | 'invalid_input'
  | 'unavailable';

/**
 * Single eye simulation record as serialized in backend SimulationItem
 */
export interface SimulationItem {
  id: string;
  screening_id: string;
  screening_display_id?: string | null;
  patient_id: string;
  patient_display_id?: string | null;
  eye: 'left' | 'right' | string;
  model_name: string;
  model_version: string;
  simulation_version: string;
  contract_version: string;
  execution_status: SimulationExecutionStatus | string;
  input_snapshot: BiomarkerInputSnapshot | null;
  normalized_inputs: NormalizedInputs | null;
  output_state: SimulationOutputState | null;
  trajectory: SimulationTrajectory | null;
  runtime_seconds: number | null;
  error_message: string | null;
  scientific_disclaimer?: string | null;
  created_at: string;
}

/** Alias for backward compatibility */
export type RetinalSimulationRecord = SimulationItem;

/**
 * Top-level response envelope returned by backend API:
 * POST /api/screenings/{screening_id}/simulate
 * GET  /api/screenings/{screening_id}/simulation
 * GET  /api/patients/{patient_id}/simulation
 */
export interface SimulationResponse {
  screening_id: string;
  screening_display_id?: string | null;
  patient_id: string;
  patient_display_id?: string | null;
  left?: SimulationItem | null;
  right?: SimulationItem | null;
  has_simulation: boolean;
  message?: string | null;
}

export interface SimulationSummaryCardProps {
  patientId: string;
  screenings?: any[];
  onNavigateToSimulation?: () => void;
}
