from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from datetime import datetime

class QualityResult(BaseModel):
    status: str
    scores: dict
    reason: Optional[str] = None
    recapture_message: Optional[str] = None

class BiomarkersResultSchema(BaseModel):
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
    runtime_seconds: Optional[float] = None
    status: Optional[str] = "completed"

class EyeResult(BaseModel):
    quality: QualityResult
    original_image_url: Optional[str] = None
    dr_grade: Optional[int] = None
    dr_grade_name: Optional[str] = None
    class_probabilities: Optional[List[float]] = None
    confidence_raw: Optional[float] = None
    confidence_calibrated: Optional[float] = None
    referable: Optional[bool] = None
    gradcam_url: Optional[str] = None
    vessel_overlay_url: Optional[str] = None
    vessel_mask_url: Optional[str] = None
    vessel_density: Optional[float] = None
    od_fovea_overlay_url: Optional[str] = None
    od_x: Optional[float] = None
    od_y: Optional[float] = None
    od_confidence: Optional[float] = None
    fovea_x: Optional[float] = None
    fovea_y: Optional[float] = None
    fovea_confidence: Optional[float] = None
    lesion: Optional[dict] = None
    biomarkers: Optional[BiomarkersResultSchema] = None
    avr: Optional[float] = None
    vessel_tortuosity: Optional[float] = None
    fractal_dimension: Optional[float] = None

class ScreeningCreate(BaseModel):
    patient_id: str
    previous_screening_id: Optional[str] = None

class ScreeningResponse(BaseModel):
    screening_id: str
    patient_id: str
    patient_name: str
    previous_screening_id: Optional[str] = None
    status: str
    created_at: datetime
    left_eye: Optional[EyeResult] = None
    right_eye: Optional[EyeResult] = None
    overall_referable: Optional[bool] = None
    recommendation: Optional[str] = None
    review_status: str
    review: Optional[dict] = None

    class Config:
        from_attributes = True
