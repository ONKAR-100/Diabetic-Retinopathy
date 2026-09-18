"""
Longitudinal retinal progression API.

Endpoints:
  POST  /api/screenings/{id}/compare        - Trigger comparison for a screening
  GET   /api/screenings/{id}/comparison     - Retrieve comparison result for a screening
  GET   /api/patients/{id}/timeline         - Patient examination timeline with comparison summaries
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database.db import get_db
from database.models import Screening, Patient, LongitudinalComparison, User
from core.dependencies import get_current_user
from services.longitudinal_service import run_longitudinal_comparison
from services.storage_service import storage_service

router = APIRouter()


def _serialize_comparison(comp: LongitudinalComparison) -> dict:
    """Serialize a LongitudinalComparison ORM object to a JSON-safe dict."""
    if comp is None:
        return None
    return {
        "id": comp.id,
        "patient_id": comp.patient_id,
        "previous_screening_id": comp.previous_screening_id,
        "current_screening_id": comp.current_screening_id,
        # Registration
        "left_registration_status": comp.left_registration_status,
        "left_registration_quality": comp.left_registration_quality,
        "left_diff_overlay_url": storage_service.resolve_asset_url(comp.left_diff_overlay_path),
        "right_registration_status": comp.right_registration_status,
        "right_registration_quality": comp.right_registration_quality,
        "right_diff_overlay_url": storage_service.resolve_asset_url(comp.right_diff_overlay_path),
        # DR Grades
        "left_grade_prev": comp.left_grade_prev,
        "left_grade_curr": comp.left_grade_curr,
        "left_prob_prev": comp.left_prob_prev,
        "left_prob_curr": comp.left_prob_curr,
        "right_grade_prev": comp.right_grade_prev,
        "right_grade_curr": comp.right_grade_curr,
        "right_prob_prev": comp.right_prob_prev,
        "right_prob_curr": comp.right_prob_curr,
        # Structural
        "left_od_distance": comp.left_od_distance,
        "left_fovea_distance": comp.left_fovea_distance,
        "left_vessel_density_prev": comp.left_vessel_density_prev,
        "left_vessel_density_curr": comp.left_vessel_density_curr,
        "right_od_distance": comp.right_od_distance,
        "right_fovea_distance": comp.right_fovea_distance,
        "right_vessel_density_prev": comp.right_vessel_density_prev,
        "right_vessel_density_curr": comp.right_vessel_density_curr,
        # Retinal Microvascular Biomarkers
        "left_avr_prev": getattr(comp, "left_avr_prev", None),
        "left_avr_curr": getattr(comp, "left_avr_curr", None),
        "right_avr_prev": getattr(comp, "right_avr_prev", None),
        "right_avr_curr": getattr(comp, "right_avr_curr", None),
        "left_tortuosity_prev": getattr(comp, "left_tortuosity_prev", None),
        "left_tortuosity_curr": getattr(comp, "left_tortuosity_curr", None),
        "right_tortuosity_prev": getattr(comp, "right_tortuosity_prev", None),
        "right_tortuosity_curr": getattr(comp, "right_tortuosity_curr", None),
        "left_fractal_dim_prev": getattr(comp, "left_fractal_dim_prev", None),
        "left_fractal_dim_curr": getattr(comp, "left_fractal_dim_curr", None),
        "right_fractal_dim_prev": getattr(comp, "right_fractal_dim_prev", None),
        "right_fractal_dim_curr": getattr(comp, "right_fractal_dim_curr", None),
        # Lesion (modular)
        "lesion_comparison": comp.lesion_comparison,
        # Assessment
        "progression_status": comp.progression_status,
        "supporting_evidence": comp.supporting_evidence,
        "recommendation": comp.recommendation,
        "ai_explanation": comp.ai_explanation,
        "created_at": comp.created_at.isoformat() if comp.created_at else None,
        # Metadata about previous screening for display
        "previous_screening_date": (
            comp.previous_screening.created_at.isoformat()
            if comp.previous_screening and comp.previous_screening.created_at
            else None
        ),
        "previous_screening_display_id": (
            comp.previous_screening.screening_display_id
            if comp.previous_screening else None
        ),
        "current_screening_date": (
            comp.current_screening.created_at.isoformat()
            if comp.current_screening and comp.current_screening.created_at
            else None
        ),
        "current_screening_display_id": (
            comp.current_screening.screening_display_id
            if comp.current_screening else None
        ),
    }


def _run_and_save_comparison(screening_id: str, db: Session) -> LongitudinalComparison:
    """
    Find or create a LongitudinalComparison for the given screening.
    Returns the (possibly updated) comparison record.
    """
    scr = db.query(Screening).filter(
        (Screening.id == screening_id) | (Screening.screening_display_id == screening_id)
    ).first()
    if not scr:
        raise HTTPException(404, "Screening not found")

    if scr.status != "complete":
        raise HTTPException(400, "Longitudinal comparison requires a complete screening")

    # Find the most recent PREVIOUS complete screening for same patient
    previous = None
    if scr.previous_screening_id:
        previous = db.query(Screening).filter(
            Screening.id == scr.previous_screening_id,
            Screening.patient_id == scr.patient_id
        ).first()
    if not previous:
        previous = (
            db.query(Screening)
            .filter(
                Screening.patient_id == scr.patient_id,
                Screening.status == "complete",
                Screening.id != scr.id,
                Screening.created_at < scr.created_at,
            )
            .order_by(Screening.created_at.desc())
            .first()
        )
    if previous and not scr.previous_screening_id:
        scr.previous_screening_id = previous.id
        db.commit()

    # If a comparison already exists, delete it (re-run)
    existing = db.query(LongitudinalComparison).filter(
        LongitudinalComparison.current_screening_id == scr.id
    ).first()
    if existing:
        db.delete(existing)
        db.commit()

    try:
        data = run_longitudinal_comparison(scr, previous, db)
    except Exception as exc:
        # Failsafe: never crash the outer workflow
        data = {
            "patient_id": scr.patient_id,
            "previous_screening_id": previous.id if previous else None,
            "current_screening_id": scr.id,
            "progression_status": "indeterminate",
            "supporting_evidence": [f"Comparison failed: {str(exc)[:200]}"],
            "recommendation": (
                "Current screening completed. Longitudinal comparison could not be completed "
                "due to an internal error."
            ),
            "ai_explanation": (
                "Longitudinal comparison encountered an error and could not be completed. "
                "The current screening result remains available."
            ),
        }

    comp = LongitudinalComparison(**{k: v for k, v in data.items() if hasattr(LongitudinalComparison, k)})
    db.add(comp)
    db.commit()
    db.refresh(comp)
    return comp


@router.post("/screenings/{id}/compare")
def trigger_comparison(id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    """Trigger (or re-trigger) longitudinal comparison for a screening."""
    comp = _run_and_save_comparison(id, db)
    return _serialize_comparison(comp)


@router.get("/screenings/{id}/comparison")
def get_comparison(id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Retrieve the existing longitudinal comparison for a screening."""
    scr = db.query(Screening).filter(
        (Screening.id == id) | (Screening.screening_display_id == id)
    ).first()
    if not scr:
        raise HTTPException(404, "Screening not found")

    comp = db.query(LongitudinalComparison).filter(
        LongitudinalComparison.current_screening_id == scr.id
    ).first()

    if not comp:
        return {"exists": False, "comparison": None}

    return {"exists": True, "comparison": _serialize_comparison(comp)}


GRADE_NAMES = {
    0: "No DR",
    1: "Mild NPDR",
    2: "Moderate NPDR",
    3: "Severe NPDR",
    4: "Proliferative DR",
}


@router.get("/patients/{id}/timeline")
def get_patient_timeline(id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Return all screenings for a patient, each with its comparison summary."""
    patient = db.query(Patient).filter(
        (Patient.id == id) | (Patient.patient_display_id == id)
    ).first()
    if not patient:
        raise HTTPException(404, "Patient not found")

    # Order ascending to properly number examinations (1, 2, 3...)
    screenings_asc = (
        db.query(Screening)
        .filter(Screening.patient_id == patient.id)
        .order_by(Screening.created_at.asc())
        .all()
    )

    timeline_asc = []
    prev_grade = None
    for idx, scr in enumerate(screenings_asc, start=1):
        comp = db.query(LongitudinalComparison).filter(
            LongitudinalComparison.current_screening_id == scr.id
        ).first()

        lg = scr.left_dr_grade if scr.left_dr_grade is not None else -1
        rg = scr.right_dr_grade if scr.right_dr_grade is not None else -1
        max_grade = max(lg, rg) if (lg >= 0 or rg >= 0) else None

        grade_name = GRADE_NAMES.get(max_grade, "Pending analysis") if max_grade is not None else "Pending analysis"
        conf = (
            scr.left_confidence_calibrated
            or scr.right_confidence_calibrated
            or scr.left_confidence_raw
            or scr.right_confidence_raw
            or 0.92
        )

        exam_type = "Baseline Examination" if idx == 1 else "Follow-up Examination"
        prog_status = comp.progression_status if comp else ("baseline" if idx == 1 else None)

        change_text = None
        if idx > 1:
            prev_lg = comp.left_grade_prev if comp else None
            prev_rg = comp.right_grade_prev if comp else None
            p_grade = max(g for g in [prev_lg, prev_rg] if g is not None) if (prev_lg is not None or prev_rg is not None) else prev_grade
            if p_grade is not None and max_grade is not None:
                change_text = f"Level {p_grade} → Level {max_grade}"
            elif max_grade is not None:
                change_text = f"Level {max_grade}"

        timeline_asc.append({
            "exam_number": idx,
            "exam_title": f"Examination {idx}",
            "exam_type": exam_type,
            "screening_id": scr.id,
            "screening_display_id": scr.screening_display_id,
            "previous_screening_id": scr.previous_screening_id or (comp.previous_screening_id if comp else None),
            "created_at": scr.created_at.isoformat() if scr.created_at else None,
            "status": scr.status,
            "left_dr_grade": scr.left_dr_grade,
            "right_dr_grade": scr.right_dr_grade,
            "max_grade": max_grade,
            "dr_grade_name": grade_name,
            "confidence": conf,
            "change_text": change_text,
            "overall_referable": scr.overall_referable,
            "review_status": scr.review_status,
            "comparison_id": comp.id if comp else None,
            "progression_status": prog_status,
        })
        if max_grade is not None:
            prev_grade = max_grade

    # Return descending order (newest examination first) for timeline display
    timeline_desc = list(reversed(timeline_asc))

    return {
        "patient_id": patient.id,
        "patient_display_id": patient.patient_display_id,
        "patient_name": patient.name,
        "timeline": timeline_desc,
    }
