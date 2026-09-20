"""
RetinaAI Simulink Computational State-Space Modeling Service (Phase 7).

Integrates the standalone Simulink model (retina_computational_state.slx)
and runner (run_retina_simulation.m) into the RetinaAI backend.

SCIENTIFIC DISCLAIMER:
This module produces engineering computational state outputs only.
Simulation time theta in [0, 10] is dimensionless computational relaxation time
and has NO relation to biological time, disease progression, or aging.
Outputs must NOT be interpreted as clinical risk, DR severity, or diagnostic scores.
"""
import os
import time
import math
import logging
import threading
from typing import Optional, Dict, Any, Tuple
from dataclasses import dataclass, asdict

logger = logging.getLogger(__name__)

# Lazy import flag for matlab.engine
try:
    import matlab
    import matlab.engine
    MATLAB_ENGINE_AVAILABLE = True
except ImportError:
    MATLAB_ENGINE_AVAILABLE = False
    matlab = None

MODEL_NAME = "retina_computational_state"
MODEL_VERSION = "1.0.0"
SIMULATION_VERSION = "1.0.0"
CONTRACT_VERSION = "1.0.0"

SCIENTIFIC_DISCLAIMER = (
    "Research/computational modeling prototype only. States reflect mathematical "
    "continuous state-space dynamics over dimensionless relaxation time theta in [0, 10] "
    "and do NOT represent clinical risk, DR grade, disease progression, or biological time."
)


@dataclass
class SimulinkSimulationResult:
    execution_status: str  # 'completed', 'failed', 'disabled', 'invalid_input'
    model_name: str = MODEL_NAME
    model_version: str = MODEL_VERSION
    simulation_version: str = SIMULATION_VERSION
    contract_version: str = CONTRACT_VERSION
    input_snapshot: Optional[Dict[str, Any]] = None
    normalized_inputs: Optional[Dict[str, Any]] = None
    output_state: Optional[Dict[str, Any]] = None
    trajectory: Optional[Dict[str, Any]] = None
    runtime_seconds: float = 0.0
    error_message: Optional[str] = None
    scientific_disclaimer: str = SCIENTIFIC_DISCLAIMER

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def clamp(val: float, lo: float, hi: float) -> float:
    return min(hi, max(lo, val))


def normalize_contract_v1(raw_inputs: Dict[str, Any]) -> Tuple[Dict[str, float], Dict[str, float]]:
    """
    Applies the frozen Canonical Normalization Contract v1.0.0.
    
    Returns:
        (raw_snapshot, normalized_inputs)
        
    Raises:
        ValueError if required biomarkers are missing, NaN, Inf, or negative.
    """
    def extract_field(aliases, min_val=0.0, max_val=float("inf")):
        for a in aliases:
            if a in raw_inputs and raw_inputs[a] is not None:
                v = raw_inputs[a]
                try:
                    f = float(v)
                    if math.isnan(f) or math.isinf(f):
                        raise ValueError(f"Field '{aliases[0]}' is non-finite ({f}).")
                    if f < min_val or f > max_val:
                        raise ValueError(f"Field '{aliases[0]}' = {f} is out of range [{min_val}, {max_val}].")
                    return f
                except (TypeError, ValueError) as exc:
                    raise ValueError(f"Field '{aliases[0]}' is invalid: {exc}")
        raise ValueError(f"Missing required biomarker field: '{aliases[0]}'.")

    v_dens   = extract_field(["vessel_density", "V_d"], 0.0, 1.0)
    n_branch = extract_field(["branch_count", "N_branch"], 0.0, 10000.0)
    n_zb     = extract_field(["zone_b_count", "N_zb"], 0.0, 500.0)
    tau_d    = extract_field(["mean_tortuosity_distance", "tau_distance", "tau_d"], 0.0, 10.0)
    tau_c    = extract_field(["mean_tortuosity_curvature", "tau_curvature", "tau_c"], 0.0, 100.0)
    df_val   = extract_field(["fractal_dimension", "df_skel", "Df"], 0.0, 3.0)
    r2_val   = extract_field(["fractal_r_squared", "r2_skel", "R2"], 0.0, 1.0)

    raw_snapshot = {
        "vessel_density": round(v_dens, 6),
        "branch_count": int(round(n_branch)),
        "zone_b_count": int(round(n_zb)),
        "mean_tortuosity_distance": round(tau_d, 6),
        "mean_tortuosity_curvature": round(tau_c, 6),
        "fractal_dimension": round(df_val, 6),
        "fractal_r_squared": round(r2_val, 6),
    }

    # Canonical Normalization Contract v1.0.0
    u_dens = clamp(v_dens / 0.20, 0.0, 1.0)
    u_branch = clamp(n_branch / 500.0, 0.0, 1.0)
    u_zb = clamp(n_zb / 30.0, 0.0, 1.0)
    u_taud = clamp(tau_d / 0.04, 0.0, 1.0)
    u_tauc = clamp(tau_c / 0.30, 0.0, 1.0)
    u_df_raw = clamp((df_val - 0.85) / 0.35, 0.0, 1.0)
    w_fit = clamp((r2_val - 0.90) / 0.10, 0.0, 1.0)
    u_df_star = w_fit * u_df_raw + (1.0 - w_fit) * 0.50

    normalized_inputs = {
        "normalization_version": "1.0.0",
        "u_dens": round(u_dens, 6),
        "u_branch": round(u_branch, 6),
        "u_zb": round(u_zb, 6),
        "u_taud": round(u_taud, 6),
        "u_tau_d": round(u_taud, 6),       # alias for frontend TypeScript contract
        "u_tauc": round(u_tauc, 6),
        "u_tau_c": round(u_tauc, 6),       # alias for frontend TypeScript contract
        "u_df_raw": round(u_df_raw, 6),
        "u_Df_raw": round(u_df_raw, 6),    # alias for frontend contract
        "w_fit": round(w_fit, 6),
        "u_df_star": round(u_df_star, 6),
        "u_Df_star": round(u_df_star, 6),  # alias for frontend TypeScript contract
    }

    return raw_snapshot, normalized_inputs


class SimulinkService:
    """
    Service managing headless Simulink model execution with full circuit-breaker isolation.
    Reuses persistent MATLAB Engine from MatlabService if provided.
    """

    def __init__(
        self,
        matlab_service=None,
        matlab_scripts_dir: Optional[str] = None,
        timeout_sec: int = 30,
        enabled: bool = True
    ):
        self.matlab_service = matlab_service
        self.scripts_dir = matlab_scripts_dir or os.path.abspath(
            os.path.join(os.path.dirname(__file__), "..", "..", "..", "MATLAB")
        )
        self.timeout_sec = timeout_sec
        self.enabled = enabled and MATLAB_ENGINE_AVAILABLE
        self._engine = None
        self._lock = threading.Lock()

        if not MATLAB_ENGINE_AVAILABLE and enabled:
            logger.warning(
                "SimulinkService initialized with enabled=True, but 'matlab.engine' is not installed. "
                "Retinal simulation will operate in fallback/disabled mode."
            )

    def _get_engine(self):
        """Acquires a MATLAB Engine reference safely."""
        if self.matlab_service is not None:
            return self.matlab_service.start_engine(), self.matlab_service._lock

        with self._lock:
            if self._engine is not None:
                return self._engine, self._lock

            if not MATLAB_ENGINE_AVAILABLE:
                return None, self._lock

            logger.info("Starting headless MATLAB Engine for SimulinkService...")
            self._engine = matlab.engine.start_matlab("-nodesktop -nosplash -noFigureWindows")
            if os.path.exists(self.scripts_dir):
                self._engine.addpath(self.scripts_dir, nargout=0)
            return self._engine, self._lock

    def run_simulation(
        self,
        biomarkers: Optional[Dict[str, Any]],
        eye: str = "unknown"
    ) -> SimulinkSimulationResult:
        """
        Executes retina_computational_state.slx via run_retina_simulation.m.
        Never raises unhandled exceptions.
        """
        t0 = time.time()

        if not self.enabled:
            return SimulinkSimulationResult(
                execution_status="disabled",
                error_message="Simulink service is disabled or MATLAB Engine is unavailable.",
                runtime_seconds=round(time.time() - t0, 4)
            )

        if not biomarkers or not isinstance(biomarkers, dict):
            return SimulinkSimulationResult(
                execution_status="invalid_input",
                error_message="Biomarker inputs must be provided as a non-empty dictionary.",
                runtime_seconds=round(time.time() - t0, 4)
            )

        # 1. Strict canonical validation & normalization
        try:
            raw_snapshot, norm_inputs = normalize_contract_v1(biomarkers)
        except ValueError as val_err:
            logger.warning(f"Simulink input validation rejected input for eye '{eye}': {val_err}")
            return SimulinkSimulationResult(
                execution_status="invalid_input",
                error_message=str(val_err),
                input_snapshot=biomarkers,
                runtime_seconds=round(time.time() - t0, 4)
            )

        # 2. Execute Simulink in MATLAB Engine under thread lock
        try:
            eng, lock = self._get_engine()
            if eng is None:
                return SimulinkSimulationResult(
                    execution_status="failed",
                    error_message="Could not initialize or connect to MATLAB Engine.",
                    input_snapshot=raw_snapshot,
                    normalized_inputs=norm_inputs,
                    runtime_seconds=round(time.time() - t0, 4)
                )

            with lock:
                if os.path.exists(self.scripts_dir):
                    eng.addpath(self.scripts_dir, nargout=0)

                # Call run_retina_simulation(raw_snapshot)
                sim_out = eng.run_retina_simulation(raw_snapshot, nargout=1)

            # 3. Parse MATLAB struct output cleanly
            mat_status = str(sim_out.get("status", "completed"))
            if mat_status != "completed":
                err_msg = str(sim_out.get("error_message", "Simulink execution failed."))
                return SimulinkSimulationResult(
                    execution_status="failed",
                    error_message=err_msg,
                    input_snapshot=raw_snapshot,
                    normalized_inputs=norm_inputs,
                    runtime_seconds=round(time.time() - t0, 4)
                )

            out_state_raw = sim_out.get("output_state", {})
            traj_raw = sim_out.get("trajectory", {})

            # Clean output states
            def safe_float(v) -> float:
                try:
                    return round(float(v), 6)
                except Exception:
                    return 0.0

            output_state = {
                "structural_complexity_state": safe_float(out_state_raw.get("structural_complexity_state")),
                "tortuosity_computational_state": safe_float(out_state_raw.get("tortuosity_computational_state")),
                "vascular_bed_density_state": safe_float(out_state_raw.get("vascular_bed_density_state")),
                "composite_retinal_computational_state": safe_float(out_state_raw.get("composite_retinal_computational_state")),
            }

            # Clean trajectory lists
            def mat_to_list(arr) -> list:
                if arr is None:
                    return []
                try:
                    # matlab.double converts via list comprehension or tolist
                    flat = []
                    for row in arr:
                        if hasattr(row, "__iter__"):
                            for el in row:
                                flat.append(round(float(el), 6))
                        else:
                            flat.append(round(float(row), 6))
                    return flat
                except Exception:
                    return []

            trajectory = {
                "theta": mat_to_list(traj_raw.get("theta")),
                "complexity_curve": mat_to_list(traj_raw.get("complexity_curve")),
                "tortuosity_curve": mat_to_list(traj_raw.get("tortuosity_curve")),
                "density_curve": mat_to_list(traj_raw.get("density_curve")),
            }

            elapsed = round(time.time() - t0, 4)
            return SimulinkSimulationResult(
                execution_status="completed",
                model_name=str(sim_out.get("model_name", MODEL_NAME)),
                model_version=str(sim_out.get("model_version", MODEL_VERSION)),
                simulation_version=str(sim_out.get("simulation_version", SIMULATION_VERSION)),
                contract_version=str(sim_out.get("contract_version", CONTRACT_VERSION)),
                input_snapshot=raw_snapshot,
                normalized_inputs=norm_inputs,
                output_state=output_state,
                trajectory=trajectory,
                runtime_seconds=elapsed,
                error_message=None
            )

        except Exception as exc:
            logger.error(f"SimulinkService execution failed for eye '{eye}': {exc}", exc_info=True)
            return SimulinkSimulationResult(
                execution_status="failed",
                error_message=f"Simulink simulation failed: {str(exc)}",
                input_snapshot=raw_snapshot,
                normalized_inputs=norm_inputs,
                runtime_seconds=round(time.time() - t0, 4)
            )
