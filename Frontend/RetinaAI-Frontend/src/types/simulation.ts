/**
 * RetinaAI Phase 7 - Retinal Computational State-Space Simulation Types
 * 
 * Defines data structures for the LTI state-space simulation layer
 * downstream of Phase 6 biomarkers.
 * 
 * SCIENTIFIC INTEGRITY CONSTRAINT:
 * This is an engineering/research computational state model.
 * These metrics are computational states, NOT disease progression predictions,
 * clinical risk scores, or diagnostic severities.
 */

export interface BiomarkerInputSnapshot {
  vessel_density: number;
  branch_count: number;
  zone_b_count: number;
  distance_tortuosity: number;
  curvature_tortuosity: number;
  fractal_dimension: number;
  fractal_r_squared: number;
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
  u_Df_raw: number;
  w_fit: number;
  [key: string]: any;
}

export interface SimulationOutputState {
  structural_complexity_state: number;
  tortuosity_computational_state: number;
  vascular_bed_density_state: number;
  composite_retinal_computational_state: number;
}

export interface SimulationTrajectory {
  time: number[];
  structural_complexity: number[];
  tortuosity: number[];
  vascular_bed_density: number[];
  composite_state: number[];
}

export type SimulationExecutionStatus = 
  | 'not_simulated'
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'unavailable';

export interface RetinalSimulationRecord {
  id: string;
  screening_id: string;
  patient_id: string;
  eye: 'left' | 'right' | string;
  model_name: string;
  model_version: string;
  simulation_version: string;
  input_snapshot: BiomarkerInputSnapshot | null;
  normalized_inputs: NormalizedInputs | null;
  output_state: SimulationOutputState | null;
  trajectory: SimulationTrajectory | null;
  execution_status: SimulationExecutionStatus | string;
  runtime_seconds: number | null;
  error_message: string | null;
  created_at: string;
}

export interface SimulationSummaryCardProps {
  patientId: string;
  screenings?: any[];
  onNavigateToSimulation?: () => void;
}
