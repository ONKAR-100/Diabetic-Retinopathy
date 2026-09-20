import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database.db import get_db
from database.models import Patient, Screening, User
from schemas.patient import PatientCreate
from api.screenings import map_screening_to_response
from core.dependencies import get_current_user, require_doctor
from services.storage_service import storage_service
from typing import List, Optional

logger = logging.getLogger(__name__)

router = APIRouter()

def _format_patient_dict(p: Patient, screenings: list, latest_scr, progression_status, include_screenings: bool = False):
    latest_screening_data = None
    if latest_scr:
        lg = latest_scr.left_dr_grade if latest_scr.left_dr_grade is not None else -1
        rg = latest_scr.right_dr_grade if latest_scr.right_dr_grade is not None else -1
        max_grade = max(lg, rg)
        
        grade_name = "No DR"
        if max_grade == 1: grade_name = "Mild NPDR"
        elif max_grade == 2: grade_name = "Moderate NPDR"
        elif max_grade == 3: grade_name = "Severe NPDR"
        elif max_grade == 4: grade_name = "Proliferative DR"
        elif max_grade < 0: grade_name = "Pending analysis"
        
        conf = latest_scr.left_confidence_calibrated or latest_scr.right_confidence_calibrated or latest_scr.left_confidence_raw or latest_scr.right_confidence_raw or 0.92
        
        eyes = "Both eyes"
        if latest_scr.left_image_path and not latest_scr.right_image_path:
            eyes = "Left eye"
        elif latest_scr.right_image_path and not latest_scr.left_image_path:
            eyes = "Right eye"
            
        latest_screening_data = {
            "id": latest_scr.id,
            "screening_id": latest_scr.screening_display_id,
            "created_at": latest_scr.created_at.isoformat() if latest_scr.created_at else None,
            "status": latest_scr.status,
            "dr_grade": max_grade if max_grade >= 0 else None,
            "dr_grade_name": grade_name,
            "referable": latest_scr.overall_referable,
            "review_status": latest_scr.review_status,
            "confidence": conf,
            "eyes": eyes
        }

    data = {
        "id": p.id,
        "patient_display_id": p.patient_display_id,
        "name": p.name,
        "age": p.age,
        "sex": p.sex,
        "diabetes_duration": p.diabetes_duration,
        "previous_dr": p.previous_dr,
        "previous_screening": p.previous_screening.isoformat() if p.previous_screening else None,
        "hba1c": p.hba1c,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
        "latest_screening": latest_screening_data,
        "screenings_count": len(screenings),
        "progression_status": progression_status
    }

    if include_screenings:
        data["screenings"] = [map_screening_to_response(s) for s in screenings]
        
    return data

def serialize_patient(p: Patient, db: Session, include_screenings: bool = False):
    screenings = db.query(Screening).filter(Screening.patient_id == p.id).order_by(Screening.created_at.desc()).all()
    latest_scr = screenings[0] if screenings else None
    progression_status = None
    if latest_scr:
        from database.models import LongitudinalComparison
        latest_comp = db.query(LongitudinalComparison).filter(
            LongitudinalComparison.current_screening_id == latest_scr.id
        ).first()
        if latest_comp:
            progression_status = latest_comp.progression_status

    return _format_patient_dict(p, screenings, latest_scr, progression_status, include_screenings)

@router.get("", response_model=List[dict])
@router.get("/", response_model=List[dict])
def get_patients(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    pts = db.query(Patient).order_by(Patient.created_at.desc()).all()
    if not pts:
        return []

    p_ids = [p.id for p in pts]
    all_screenings = db.query(Screening).filter(Screening.patient_id.in_(p_ids)).order_by(Screening.created_at.desc()).all()
    
    screenings_map = {}
    for s in all_screenings:
        screenings_map.setdefault(s.patient_id, []).append(s)

    latest_scr_ids = [scrs[0].id for scrs in screenings_map.values() if scrs]
    comp_map = {}
    if latest_scr_ids:
        from database.models import LongitudinalComparison
        comps = db.query(LongitudinalComparison).filter(LongitudinalComparison.current_screening_id.in_(latest_scr_ids)).all()
        comp_map = {c.current_screening_id: c.progression_status for c in comps}

    results = []
    for p in pts:
        p_scrs = screenings_map.get(p.id, [])
        latest_scr = p_scrs[0] if p_scrs else None
        prog_status = comp_map.get(latest_scr.id) if latest_scr else None
        results.append(_format_patient_dict(p, p_scrs, latest_scr, prog_status, include_screenings=False))
        
    return results

@router.get("/{id}", response_model=dict)
def get_patient(id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    p = db.query(Patient).filter((Patient.id == id) | (Patient.patient_display_id == id)).first()
    if not p:
        raise HTTPException(404, "Patient not found")
    return serialize_patient(p, db, include_screenings=True)

@router.post("", response_model=dict)
@router.post("/", response_model=dict)
def create_patient(patient: PatientCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    patient_data = patient.dict()
    if not patient_data.get("patient_display_id"):
        existing_ids = db.query(Patient.patient_display_id).filter(Patient.patient_display_id.like("RTA-%")).all()
        max_num = 2400
        for (pid,) in existing_ids:
            if pid and pid.startswith("RTA-"):
                try:
                    num = int(pid.split("-")[1])
                    if num > max_num:
                        max_num = num
                except (ValueError, IndexError):
                    pass
        candidate = f"RTA-{max_num + 1}"
        while db.query(Patient).filter(Patient.patient_display_id == candidate).first():
            max_num += 1
            candidate = f"RTA-{max_num + 1}"
        patient_data["patient_display_id"] = candidate
    if not patient_data.get("previous_dr"):
        patient_data["previous_dr"] = "None"
        
    db_patient = Patient(**patient_data)
    db.add(db_patient)
    db.commit()
    db.refresh(db_patient)
    return serialize_patient(db_patient, db, include_screenings=True)


@router.delete("/{id}")
def delete_patient(id: str, db: Session = Depends(get_db), current_user: User = Depends(require_doctor)):
    p = db.query(Patient).filter((Patient.id == id) | (Patient.patient_display_id == id)).first()
    if not p:
        raise HTTPException(404, "Patient not found")
    # Delete associated longitudinal comparisons, reports, reviews, screenings, and storage assets
    from database.models import Report, Review, LongitudinalComparison

    screenings = db.query(Screening).filter(Screening.patient_id == p.id).all()
    screening_ids = [s.id for s in screenings]

    # DATA-01: Collect and delete all associated storage assets via storage abstraction
    assets_to_delete = set()

    # 1. Longitudinal comparison diff overlays
    comp_filter = (LongitudinalComparison.patient_id == p.id)
    if screening_ids:
        comp_filter = comp_filter | (LongitudinalComparison.current_screening_id.in_(screening_ids)) | (LongitudinalComparison.previous_screening_id.in_(screening_ids))
    comps = db.query(LongitudinalComparison).filter(comp_filter).all()
    for comp in comps:
        if comp.left_diff_overlay_path:
            assets_to_delete.add(comp.left_diff_overlay_path)
        if comp.right_diff_overlay_path:
            assets_to_delete.add(comp.right_diff_overlay_path)

    # 2. PDF Reports
    reps = db.query(Report).filter(Report.screening_id.in_(screening_ids)).all() if screening_ids else []
    for rep in reps:
        if rep.pdf_path:
            assets_to_delete.add(rep.pdf_path)

    # 3. Screening image, overlay, and model outputs
    for s in screenings:
        for prefix in ["left", "right"]:
            for field in ["image_path", "gradcam_path", "vessel_mask_path", "vessel_overlay_path", "od_fovea_overlay_path"]:
                val = getattr(s, f"{prefix}_{field}", None)
                if val:
                    assets_to_delete.add(val)
            lesion = getattr(s, f"{prefix}_lesion_result", None)
            if isinstance(lesion, dict):
                overlay = lesion.get("overlay_url") or lesion.get("overlay_path")
                if overlay:
                    assets_to_delete.add(overlay)

    # Safely delete all collected clinical media from storage
    for asset in assets_to_delete:
        try:
            storage_service.delete_asset(asset)
        except Exception as exc:
            logger.warning(f"Failed to delete clinical storage asset '{asset}' during patient deletion: {exc}")

    # 4. Delete longitudinal comparisons linked directly to this patient
    db.query(LongitudinalComparison).filter(LongitudinalComparison.patient_id == p.id).delete(synchronize_session=False)

    if screening_ids:
        # Delete any comparisons referencing these screenings as previous or current
        db.query(LongitudinalComparison).filter(
            (LongitudinalComparison.current_screening_id.in_(screening_ids)) |
            (LongitudinalComparison.previous_screening_id.in_(screening_ids))
        ).delete(synchronize_session=False)

        # Clear previous_screening_id self-referential foreign keys to allow deletion
        db.query(Screening).filter(Screening.patient_id == p.id).update(
            {"previous_screening_id": None}, synchronize_session=False
        )

        for sid in screening_ids:
            db.query(Report).filter(Report.screening_id == sid).delete(synchronize_session=False)
            db.query(Review).filter(Review.screening_id == sid).delete(synchronize_session=False)
            db.query(Screening).filter(Screening.id == sid).delete(synchronize_session=False)
        
    db.delete(p)
    db.commit()

    # AUDIT-01: Operational audit logging for clinical record deletion
    logger.warning(
        f"[AUDIT] PATIENT_DELETED - patient_id='{p.id}' "
        f"display_id='{p.patient_display_id}' "
        f"deleted_by_user_id='{current_user.id}' "
        f"role='{current_user.role}' "
        f"screenings_count={len(screening_ids)} "
        f"timestamp='{datetime.now(timezone.utc).isoformat()}'"
    )

    return {"status": "ok", "message": "Patient deleted successfully"}
