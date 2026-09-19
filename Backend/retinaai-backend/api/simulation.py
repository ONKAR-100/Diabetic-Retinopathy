"""
RetinaAI Simulink Computational Simulation API Router (Phase 7).

Endpoints:
  POST /api/screenings/{screening_id}/simulate - Run or rerun Simulink simulation for a screening
  GET  /api/screenings/{screening_id}/simulation - Get simulation results for a screening
  GET  /api/patients/{patient_id}/simulation - Get latest simulation results for a patient

SCIENTIFIC DISCLAIMER:
Outputs represent engineering computational state metrics over dimensionless
relaxation time theta in [0, 10]. They are NOT clinical risk, DR grade, or
disease progression measures.
"""
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database.db import get_db
from database.models import Screening, Patient, User, RetinalSimulation
from schemas.simulation import (
    SimulateRequest,
    SimulationItem,
    SimulationResponse,
    SimulationOutputState,
    SimulationTrajectory
)
from core.dependencies import get_current_user
from models_loader.loaders import simulink_service
from services.simulink_service import SCIENTIFIC_DISCLAIMER

logger = logging.getLogger(__name__)

router = APIRouter()


def _serialize_simulation(sim: Optional[RetinalSimulation]) -> Optional[SimulationItem]:
    if sim is None:
        return None

    out_st = None
    if sim.output_state and isinstance(sim.output_state, dict):
        try:
            out_st = SimulationOutputState(
                structural_complexity_state=float(sim.output_state.get("structural_complexity_state", 0.0)),
                tortuosity_computational_state=float(sim.output_state.get("tortuosity_computational_state", 0.0)),
                vascular_bed_density_state=float(sim.output_state.get("vascular_bed_density_state", 0.0)),
                composite_retinal_computational_state=float(sim.output_state.get("composite_retinal_computational_state", 0.0))
            )
        except Exception:
            out_st = None

    traj = None
    if sim.trajectory and isinstance(sim.trajectory, dict):
        try:
            traj = SimulationTrajectory(
                theta=sim.trajectory.get("theta", []),
                complexity_curve=sim.trajectory.get("complexity_curve", []),
                tortuosity_curve=sim.trajectory.get("tortuosity_curve", []),
                density_curve=sim.trajectory.get("density_curve", [])
            )
        except Exception:
            traj = None

    scr_disp = sim.screening.screening_display_id if sim.screening else None
    pat_disp = sim.patient.patient_display_id if sim.patient else None

    return SimulationItem(
        id=sim.id,
        screening_id=sim.screening_id,
        screening_display_id=scr_disp,
        patient_id=sim.patient_id,
        patient_display_id=pat_disp,
        eye=sim.eye,
        model_name=sim.model_name or "retina_computational_state",
        model_version=sim.model_version or "1.0.0",
        simulation_version=sim.simulation_version or "1.0.0",
        contract_version="1.0.0",
        execution_status=sim.execution_status,
        input_snapshot=sim.input_snapshot or {},
        normalized_inputs=sim.normalized_inputs or {},
        output_state=out_st,
        trajectory=traj,
        runtime_seconds=sim.runtime_seconds,
        error_message=sim.error_message,
        scientific_disclaimer=SCIENTIFIC_DISCLAIMER,
        created_at=sim.created_at or datetime.now(timezone.utc).replace(tzinfo=None)
    )


@router.post("/screenings/{screening_id}/simulate", response_model=SimulationResponse)
def run_screening_simulation(
    screening_id: str,
    req: SimulateRequest = SimulateRequest(eye="both"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Triggers or reruns the Simulink continuous state-space simulation for a screening.
    Operates on completed Phase 6 biomarkers without altering original screening data.
    """
    scr = db.query(Screening).filter(
        (Screening.id == screening_id) | (Screening.screening_display_id == screening_id)
    ).first()
    if not scr:
        raise HTTPException(status_code=404, detail=f"Screening '{screening_id}' not found.")

    eyes_to_simulate = []
    if req.eye in ["left", "both"]:
        eyes_to_simulate.append("left")
    if req.eye in ["right", "both"]:
        eyes_to_simulate.append("right")

    available_eyes = []
    for eye in eyes_to_simulate:
        bm = getattr(scr, f"{eye}_biomarkers")
        if bm and isinstance(bm, dict):
            available_eyes.append(eye)

    if not available_eyes:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Cannot run simulation: screening '{screening_id}' has no completed Phase 6 "
                f"biomarkers for requested eye(s) '{req.eye}'."
            )
        )

    for eye in available_eyes:
        bm = getattr(scr, f"{eye}_biomarkers")
        sim_res = simulink_service.run_simulation(bm, eye=eye)

        # Upsert into retinal_simulations
        existing_sim = db.query(RetinalSimulation).filter(
            RetinalSimulation.screening_id == scr.id,
            RetinalSimulation.eye == eye
        ).first()

        now_utc = datetime.now(timezone.utc).replace(tzinfo=None)

        if existing_sim:
            existing_sim.model_name = sim_res.model_name
            existing_sim.model_version = sim_res.model_version
            existing_sim.simulation_version = sim_res.simulation_version
            existing_sim.input_snapshot = sim_res.input_snapshot or bm
            existing_sim.normalized_inputs = sim_res.normalized_inputs or {}
            existing_sim.output_state = sim_res.output_state or {}
            existing_sim.trajectory = sim_res.trajectory or {}
            existing_sim.execution_status = sim_res.execution_status
            existing_sim.runtime_seconds = sim_res.runtime_seconds
            existing_sim.error_message = sim_res.error_message
            existing_sim.created_at = now_utc
        else:
            new_sim = RetinalSimulation(
                id=str(uuid.uuid4()),
                screening_id=scr.id,
                patient_id=scr.patient_id,
                eye=eye,
                model_name=sim_res.model_name,
                model_version=sim_res.model_version,
                simulation_version=sim_res.simulation_version,
                input_snapshot=sim_res.input_snapshot or bm,
                normalized_inputs=sim_res.normalized_inputs or {},
                output_state=sim_res.output_state or {},
                trajectory=sim_res.trajectory or {},
                execution_status=sim_res.execution_status,
                runtime_seconds=sim_res.runtime_seconds,
                error_message=sim_res.error_message,
                created_at=now_utc
            )
            db.add(new_sim)

    db.commit()

    # Query back all simulations for this screening
    sims = db.query(RetinalSimulation).filter(RetinalSimulation.screening_id == scr.id).all()
    sim_dict = {s.eye: s for s in sims}

    left_item = _serialize_simulation(sim_dict.get("left"))
    right_item = _serialize_simulation(sim_dict.get("right"))

    return SimulationResponse(
        screening_id=scr.id,
        screening_display_id=scr.screening_display_id,
        patient_id=scr.patient_id,
        patient_display_id=scr.patient.patient_display_id if scr.patient else None,
        left=left_item,
        right=right_item,
        has_simulation=bool(left_item or right_item),
        message="Simulation executed successfully."
    )


@router.get("/screenings/{screening_id}/simulation", response_model=SimulationResponse)
def get_screening_simulation(
    screening_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Retrieves the simulation record associated with a screening.
    """
    scr = db.query(Screening).filter(
        (Screening.id == screening_id) | (Screening.screening_display_id == screening_id)
    ).first()
    if not scr:
        raise HTTPException(status_code=404, detail=f"Screening '{screening_id}' not found.")

    sims = db.query(RetinalSimulation).filter(RetinalSimulation.screening_id == scr.id).all()
    sim_dict = {s.eye: s for s in sims}

    left_item = _serialize_simulation(sim_dict.get("left"))
    right_item = _serialize_simulation(sim_dict.get("right"))

    return SimulationResponse(
        screening_id=scr.id,
        screening_display_id=scr.screening_display_id,
        patient_id=scr.patient_id,
        patient_display_id=scr.patient.patient_display_id if scr.patient else None,
        left=left_item,
        right=right_item,
        has_simulation=bool(left_item or right_item),
        message=None if (left_item or right_item) else "No simulation records found for this screening."
    )


@router.get("/patients/{patient_id}/simulation", response_model=SimulationResponse)
def get_patient_simulation(
    patient_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Retrieves the latest simulation record for a patient profile.
    """
    pat = db.query(Patient).filter(
        (Patient.id == patient_id) | (Patient.patient_display_id == patient_id)
    ).first()
    if not pat:
        raise HTTPException(status_code=404, detail=f"Patient '{patient_id}' not found.")

    # Find the most recent simulation for this patient
    sims = db.query(RetinalSimulation).filter(
        RetinalSimulation.patient_id == pat.id
    ).order_by(RetinalSimulation.created_at.desc()).all()

    if not sims:
        return SimulationResponse(
            screening_id="",
            screening_display_id="",
            patient_id=pat.id,
            patient_display_id=pat.patient_display_id,
            left=None,
            right=None,
            has_simulation=False,
            message="No simulation records exist for this patient."
        )

    # Pick the latest per eye
    sim_dict = {}
    screening_ref = sims[0].screening

    for s in sims:
        if s.eye not in sim_dict:
            sim_dict[s.eye] = s

    left_item = _serialize_simulation(sim_dict.get("left"))
    right_item = _serialize_simulation(sim_dict.get("right"))

    return SimulationResponse(
        screening_id=screening_ref.id if screening_ref else "",
        screening_display_id=screening_ref.screening_display_id if screening_ref else None,
        patient_id=pat.id,
        patient_display_id=pat.patient_display_id,
        left=left_item,
        right=right_item,
        has_simulation=bool(left_item or right_item),
        message=None
    )
