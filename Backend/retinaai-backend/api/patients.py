from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database.db import get_db
from database.models import Patient, Screening, User
from schemas.patient import PatientCreate
from api.screenings import map_screening_to_response
from core.dependencies import get_current_user
from typing import List, Optional

router = APIRouter()

def serialize_patient(p: Patient, db: Session, include_screenings: bool = False):
    screenings = db.query(Screening).filter(Screening.patient_id == p.id).order_by(Screening.created_at.desc()).all()
    latest_scr = screenings[0] if screenings else None
    
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
        "progression_status": None  # Populated below if comparison exists
    }

    # Add latest progression status from longitudinal comparison
    if latest_scr:
        from database.models import LongitudinalComparison
        latest_comp = db.query(LongitudinalComparison).filter(
            LongitudinalComparison.current_screening_id == latest_scr.id
        ).first()
        if latest_comp:
            data["progression_status"] = latest_comp.progression_status

    if include_screenings:
        data["screenings"] = [map_screening_to_response(s) for s in screenings]
        
    return data

@router.get("", response_model=List[dict])
@router.get("/", response_model=List[dict])
def get_patients(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    pts = db.query(Patient).order_by(Patient.created_at.desc()).all()
    return [serialize_patient(p, db, include_screenings=False) for p in pts]

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
def delete_patient(id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    p = db.query(Patient).filter((Patient.id == id) | (Patient.patient_display_id == id)).first()
    if not p:
        raise HTTPException(404, "Patient not found")
    # Delete associated longitudinal comparisons, reports, reviews, and screenings
    from database.models import Report, Review, LongitudinalComparison
    
    # 1. Delete longitudinal comparisons linked directly to this patient
    db.query(LongitudinalComparison).filter(LongitudinalComparison.patient_id == p.id).delete(synchronize_session=False)

    screenings = db.query(Screening).filter(Screening.patient_id == p.id).all()
    screening_ids = [s.id for s in screenings]

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
    return {"status": "ok", "message": "Patient deleted successfully"}
