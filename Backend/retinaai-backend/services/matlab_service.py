import os
import time
import logging
import threading
from typing import Optional, Tuple, Dict, Any
from dataclasses import dataclass, asdict
import numpy as np

logger = logging.getLogger(__name__)

# Lazy import flag for matlab.engine
try:
    import matlab
    import matlab.engine
    MATLAB_ENGINE_AVAILABLE = True
except ImportError:
    MATLAB_ENGINE_AVAILABLE = False
    matlab = None

@dataclass
class RetinaBiomarkersResult:
    avr: Optional[float] = None
    crae_pixels: Optional[float] = None
    crve_pixels: Optional[float] = None
    mean_tortuosity_distance: Optional[float] = None
    mean_tortuosity_curvature: Optional[float] = None
    max_tortuosity: Optional[float] = None
    fractal_dimension: Optional[float] = None
    fractal_r_squared: Optional[float] = None
    vessel_density: Optional[float] = None
    zone_b_count: Optional[int] = None
    branch_count: Optional[int] = None
    runtime_seconds: float = 0.0
    status: str = "completed"
    error_message: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

class MatlabService:
    def __init__(
        self,
        matlab_scripts_dir: Optional[str] = None,
        timeout_sec: int = 60,
        enabled: bool = True
    ):
        self.scripts_dir = matlab_scripts_dir or os.path.abspath(
            os.path.join(os.path.dirname(__file__), "..", "..", "..", "MATLAB")
        )
        self.timeout_sec = timeout_sec
        self.enabled = enabled and MATLAB_ENGINE_AVAILABLE
        self._engine = None
        self._lock = threading.Lock()

        if not MATLAB_ENGINE_AVAILABLE and enabled:
            logger.warning(
                "MatlabService initialized with enabled=True, but 'matlab.engine' is not installed. "
                "Biomarker computation will operate in fallback/disabled mode."
            )

    def is_engine_alive(self) -> bool:
        if self._engine is None:
            return False
        try:
            res = self._engine.eval("1+1;", nargout=1)
            return res == 2
        except Exception:
            return False

    def start_engine(self):
        """Starts or re-connects to a persistent headless MATLAB session."""
        if not self.enabled:
            return None

        with self._lock:
            if self.is_engine_alive():
                return self._engine

            logger.info("Starting headless MATLAB Engine session...")
            t0 = time.time()
            try:
                # Start headless MATLAB without desktop, splash screen, or figure display
                self._engine = matlab.engine.start_matlab("-nodesktop -nosplash -noFigureWindows")
                if os.path.exists(self.scripts_dir):
                    self._engine.addpath(self.scripts_dir, nargout=0)
                logger.info(f"MATLAB Engine started successfully in {time.time() - t0:.2f}s.")
            except Exception as e:
                logger.error(f"Failed to start MATLAB Engine: {e}")
                self._engine = None
                raise

        return self._engine

    def stop_engine(self):
        """Gracefully terminates the persistent MATLAB session."""
        with self._lock:
            if self._engine is not None:
                try:
                    self._engine.quit()
                except Exception:
                    pass
                self._engine = None
                logger.info("MATLAB Engine session closed.")

    def compute_biomarkers(
        self,
        vessel_mask: Optional[np.ndarray] = None,
        fundus_rgb: Optional[np.ndarray] = None,
        od_coords: Optional[Tuple[float, float]] = None,
        fovea_coords: Optional[Tuple[float, float]] = None,
        config: Optional[Dict[str, Any]] = None,
        image_path: Optional[str] = None,
        mask_path: Optional[str] = None
    ) -> RetinaBiomarkersResult:
        """
        Executes retina_biomarkers.m in MATLAB with full circuit-breaker fault isolation.
        
        Args:
            vessel_mask: 2D numpy array (H x W), foreground > 0
            fundus_rgb: 3D numpy array (H x W x 3) in RGB color space
            od_coords: (x, y) 0-based Python coordinates of Optic Disc center
            fovea_coords: (x, y) 0-based Python coordinates of Fovea center (optional)
            config: algorithm configuration dictionary
            image_path: optional path to fundus image on disk (fast-path ingestion)
            mask_path: optional path to vessel mask on disk (fast-path ingestion)
            
        Returns:
            RetinaBiomarkersResult structured dataclass
        """
        if not self.enabled:
            return RetinaBiomarkersResult(
                status="disabled",
                error_message="MATLAB Engine is not installed or feature is disabled."
            )

        t_start = time.time()
        try:
            eng = self.start_engine()
            if eng is None:
                return RetinaBiomarkersResult(
                    status="unavailable",
                    error_message="Could not initialize MATLAB Engine."
                )

            # 1. Format coordinates (0-based Python -> 1-based MATLAB)
            if od_coords is not None and not (np.isnan(od_coords[0]) or np.isnan(od_coords[1])):
                od_matlab = matlab.double([float(od_coords[0]) + 1.0, float(od_coords[1]) + 1.0])
            else:
                od_matlab = matlab.double([])

            if fovea_coords is not None and not (np.isnan(fovea_coords[0]) or np.isnan(fovea_coords[1])):
                fov_matlab = matlab.double([float(fovea_coords[0]) + 1.0, float(fovea_coords[1]) + 1.0])
            else:
                fov_matlab = matlab.double([float("nan"), float("nan")])

            cfg_struct = config or {}

            # 2. Ingest inputs (Fast-path: file paths; Fallback: array marshaling)
            with self._lock:
                if os.path.exists(self.scripts_dir):
                    eng.addpath(self.scripts_dir, nargout=0)

                if (image_path and os.path.isfile(image_path) and 
                    mask_path and os.path.isfile(mask_path)):
                    # Fast C++ file ingestion entirely inside MATLAB (zero IPC array transfer)
                    eng.workspace["tmp_img_p"] = image_path
                    eng.workspace["tmp_mask_p"] = mask_path
                    eng.workspace["tmp_od"] = od_matlab
                    eng.workspace["tmp_fov"] = fov_matlab
                    eng.workspace["tmp_cfg"] = cfg_struct
                    eng.eval("fundus_rgb_in = imread(tmp_img_p);", nargout=0)
                    eng.eval(
                        "mask_in = imread(tmp_mask_p); "
                        "if size(mask_in, 3) > 1, mask_in = mask_in(:, :, 1); end; "
                        "mask_in = (mask_in > 127);",
                        nargout=0
                    )
                    eng.eval("bm_out = retina_biomarkers(mask_in, fundus_rgb_in, tmp_od, tmp_fov, tmp_cfg);", nargout=0)
                    bm_struct = eng.workspace["bm_out"]
                else:
                    if vessel_mask is None or fundus_rgb is None:
                        raise ValueError("Either (image_path, mask_path) or (fundus_rgb, vessel_mask) arrays must be provided.")
                    
                    # Convert in-memory arrays (nargout=1 skips huge diagnostic_struct marshaling)
                    vessel_mask_in = matlab.logical((vessel_mask > 127).tolist())
                    fundus_rgb_in = matlab.uint8(fundus_rgb.tolist())
                    bm_struct = eng.retina_biomarkers(
                        vessel_mask_in,
                        fundus_rgb_in,
                        od_matlab,
                        fov_matlab,
                        cfg_struct,
                        nargout=1
                    )

            # 3. Parse scalar outputs cleanly
            def clean_float(val) -> Optional[float]:
                if val is None:
                    return None
                try:
                    f = float(val)
                    return None if (np.isnan(f) or np.isinf(f)) else round(f, 4)
                except (ValueError, TypeError):
                    return None

            def clean_int(val) -> Optional[int]:
                if val is None:
                    return None
                try:
                    f = float(val)
                    if np.isnan(f) or np.isinf(f):
                        return None
                    return int(round(f))
                except (ValueError, TypeError, OverflowError):
                    return None

            elapsed = time.time() - t_start

            return RetinaBiomarkersResult(
                avr=clean_float(bm_struct.get("avr")),
                crae_pixels=clean_float(bm_struct.get("crae_pixels")),
                crve_pixels=clean_float(bm_struct.get("crve_pixels")),
                mean_tortuosity_distance=clean_float(bm_struct.get("mean_tortuosity_distance")),
                mean_tortuosity_curvature=clean_float(bm_struct.get("mean_tortuosity_curvature")),
                max_tortuosity=clean_float(bm_struct.get("max_tortuosity")),
                fractal_dimension=clean_float(bm_struct.get("fractal_dimension")),
                fractal_r_squared=clean_float(bm_struct.get("fractal_r_squared")),
                vessel_density=clean_float(bm_struct.get("vessel_density")),
                zone_b_count=clean_int(bm_struct.get("zone_b_count")),
                branch_count=clean_int(bm_struct.get("branch_count")),
                runtime_seconds=round(elapsed, 3),
                status="completed",
                error_message=None
            )

        except Exception as e:
            elapsed = time.time() - t_start
            logger.error(f"MatlabService error during biomarker computation: {e}", exc_info=True)
            return RetinaBiomarkersResult(
                runtime_seconds=round(elapsed, 3),
                status="error",
                error_message=str(e)
            )
