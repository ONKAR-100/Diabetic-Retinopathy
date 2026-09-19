"""
Pydantic schemas for the RetinaAI Simulink Computational Simulation API (Phase 7).

SCIENTIFIC DISCLAIMER:
Outputs represent engineering computational state metrics over dimensionless
relaxation time theta in [0, 10]. They are NOT clinical risk, DR grade, or
disease progression measures.
"""
from typing import Optional, Dict, Any, List
from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict


class SimulateRequest(BaseModel):
    eye: str = Field("both", description="Eye to simulate: 'left', 'right', or 'both'")


class SimulationOutputState(BaseModel):
    structural_complexity_state: float = Field(..., ge=0.0, le=1.0)
    tortuosity_computational_state: float = Field(..., ge=0.0, le=1.0)
    vascular_bed_density_state: float = Field(..., ge=0.0, le=1.0)
    composite_retinal_computational_state: float = Field(..., ge=0.0, le=1.0)


class SimulationTrajectory(BaseModel):
    theta: List[float] = Field(default_factory=list)
    complexity_curve: List[float] = Field(default_factory=list)
    tortuosity_curve: List[float] = Field(default_factory=list)
    density_curve: List[float] = Field(default_factory=list)


class SimulationItem(BaseModel):
    id: str
    screening_id: str
    screening_display_id: Optional[str] = None
    patient_id: str
    patient_display_id: Optional[str] = None
    eye: str
    model_name: str = "retina_computational_state"
    model_version: str = "1.0.0"
    simulation_version: str = "1.0.0"
    contract_version: str = "1.0.0"
    execution_status: str  # 'completed', 'failed', 'disabled', 'invalid_input'
    input_snapshot: Dict[str, Any]
    normalized_inputs: Dict[str, Any]
    output_state: Optional[SimulationOutputState] = None
    trajectory: Optional[SimulationTrajectory] = None
    runtime_seconds: Optional[float] = None
    error_message: Optional[str] = None
    scientific_disclaimer: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SimulationResponse(BaseModel):
    screening_id: str
    screening_display_id: Optional[str] = None
    patient_id: str
    patient_display_id: Optional[str] = None
    left: Optional[SimulationItem] = None
    right: Optional[SimulationItem] = None
    has_simulation: bool = False
    message: Optional[str] = None
