from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
import cv2
import time
from database.db import get_db
from database.models import Screening, Review
from schemas.analysis import AnalyzeRequest
from models_loader.loaders import pipeline_service, quality_service, enhancement_service
from api.screenings import serialize_review, get_latest_review

router = APIRouter()


@router.post("/{id}/assess-quality")
def assess_quality(id: str, req: AnalyzeRequest, db: Session = Depends(get_db)):
    """
    Run image quality assessment (and optional enhancement) BEFORE the full AI pipeline.
    Returns per-eye quality scores, status, and recapture reason.
    Fast — does NOT run the DR model.
    """
    scr = db.query(Screening).filter(
        (Screening.id == id) | (Screening.screening_display_id == id)
    ).first()
    if not scr:
        raise HTTPException(404, "Screening not found")

    scr.status = "quality_check"
    db.commit()

    eyes_to_check = []
    if req.eye in ["left", "both"] and scr.left_image_path:
        eyes_to_check.append("left")
    if req.eye in ["right", "both"] and scr.right_image_path:
        eyes_to_check.append("right")

    results = {}
    any_ungradable = False
    all_ungradable = True

    for eye in eyes_to_check:
        path = getattr(scr, f"{eye}_image_path")
        bgr = cv2.imread(path)
        if bgr is None:
            results[eye] = {"status": "ungradable", "reason": "unreadable_file",
                            "recapture_message": "Image file could not be read. Please upload a valid JPEG or PNG file.",
                            "scores": {"focus": 0, "brightness": 0, "contrast": 0, "fov": 0, "overall": 0},
                            "enhanced": False}
            any_ungradable = True
            continue

        qual = quality_service.assess(bgr)
        enhanced = False

        if qual.status == "borderline":
            # Try to enhance and reassess
            enhanced_bgr = enhancement_service.enhance(bgr)
            qual2 = quality_service.assess(enhanced_bgr)
            if qual2.status != "ungradable":
                qual = qual2
                enhanced = True
                # Save enhanced image back to disk so the DR pipeline uses it
                cv2.imwrite(path, enhanced_bgr)
            else:
                qual = qual2  # Still fails, mark ungradable

        # Normalize scores to 0-100 range
        raw_scores = qual.scores or {}
        def norm_focus(v):
            # focus is fft ratio * 1000, cap at 100
            return min(100, max(0, round(v)))
        def norm_brightness(v):
            # brightness is mean green 0-255, map to 0-100
            return min(100, max(0, round((v / 255.0) * 100)))
        def norm_fov(v):
            return min(100, max(0, round(v)))

        focus_score = norm_focus(raw_scores.get("focus", 50))
        brightness_score = norm_brightness(raw_scores.get("brightness", 128))
        contrast_score = min(100, max(0, round(raw_scores.get("contrast", 70))))
        fov_score = norm_fov(raw_scores.get("fov", 70))
        overall_score = round((focus_score + brightness_score + contrast_score + fov_score) / 4)

        scores = {
            "focus": focus_score,
            "brightness": brightness_score,
            "contrast": contrast_score,
            "fov": fov_score,
            "overall": overall_score,
        }

        # Persist to DB
        setattr(scr, f"{eye}_quality_status", qual.status)
        setattr(scr, f"{eye}_quality_scores", scores)
        setattr(scr, f"{eye}_quality_reason", qual.reason)
        setattr(scr, f"{eye}_enhanced", enhanced)

        results[eye] = {
            "status": qual.status,
            "reason": qual.reason,
            "recapture_message": qual.recapture_message,
            "scores": scores,
            "enhanced": enhanced,
        }

        if qual.status == "ungradable":
            any_ungradable = True
        else:
            all_ungradable = False

    # If we checked no eyes
    if not eyes_to_check:
        all_ungradable = False

    # Update screening status
    if all_ungradable and eyes_to_check:
        scr.status = "needs_recapture"
    else:
        scr.status = "quality_check"

    db.commit()
    db.refresh(scr)

    return {
        "screening_id": scr.screening_display_id,
        "status": scr.status,
        "left": results.get("left"),
        "right": results.get("right"),
        "any_ungradable": any_ungradable,
        "all_ungradable": all_ungradable and bool(eyes_to_check),
    }


def _build_eye(scr: Screening, eye_prefix: str):
    """Build the per-eye response dict from ORM fields."""
    status = getattr(scr, f"{eye_prefix}_quality_status")
    if not status:
        return None
    return {
        "quality": {
            "status": status,
            "scores": getattr(scr, f"{eye_prefix}_quality_scores") or {},
            "reason": getattr(scr, f"{eye_prefix}_quality_reason"),
        },
        "original_image_url": getattr(scr, f"{eye_prefix}_image_path"),
        "dr_grade": getattr(scr, f"{eye_prefix}_dr_grade"),
        "dr_grade_name": (
            f"Grade {getattr(scr, f'{eye_prefix}_dr_grade')}"
            if getattr(scr, f"{eye_prefix}_dr_grade") is not None
            else None
        ),
        "class_probabilities": getattr(scr, f"{eye_prefix}_class_probabilities"),
        "confidence_raw": getattr(scr, f"{eye_prefix}_confidence_raw"),
        "confidence_calibrated": getattr(scr, f"{eye_prefix}_confidence_calibrated"),
        "referable": getattr(scr, f"{eye_prefix}_referable"),
        "gradcam_url": getattr(scr, f"{eye_prefix}_gradcam_path"),
        "vessel_overlay_url": getattr(scr, f"{eye_prefix}_vessel_overlay_path"),
        "vessel_mask_url": getattr(scr, f"{eye_prefix}_vessel_mask_path"),
        "vessel_density": getattr(scr, f"{eye_prefix}_vessel_density"),
        "od_fovea_overlay_url": getattr(scr, f"{eye_prefix}_od_fovea_overlay_path"),
        "od_x": getattr(scr, f"{eye_prefix}_od_x"),
        "od_y": getattr(scr, f"{eye_prefix}_od_y"),
        "od_confidence": getattr(scr, f"{eye_prefix}_od_confidence"),
        "fovea_x": getattr(scr, f"{eye_prefix}_fovea_x"),
        "fovea_y": getattr(scr, f"{eye_prefix}_fovea_y"),
        "fovea_confidence": getattr(scr, f"{eye_prefix}_fovea_confidence"),
        "lesion": getattr(scr, f"{eye_prefix}_lesion_result"),
        "biomarkers": getattr(scr, f"{eye_prefix}_biomarkers"),
        "avr": getattr(scr, f"{eye_prefix}_avr"),
        "vessel_tortuosity": getattr(scr, f"{eye_prefix}_tortuosity"),
        "fractal_dimension": getattr(scr, f"{eye_prefix}_fractal_dim"),
    }


def _screening_response(scr: Screening) -> dict:
    """Build the full screening response dict (same shape as map_screening_to_response)."""
    return {
        "id": scr.id,
        "screening_id": scr.screening_display_id,
        "patient_id": scr.patient.patient_display_id if scr.patient else "",
        "patient_name": scr.patient.name if scr.patient else "",
        "previous_screening_id": scr.previous_screening_id,
        "status": scr.status,
        "created_at": scr.created_at,
        "analyzed_at": scr.analyzed_at,
        "pipeline_time_seconds": scr.pipeline_time_seconds,
        "left_eye": _build_eye(scr, "left"),
        "right_eye": _build_eye(scr, "right"),
        "overall_referable": scr.overall_referable,
        "recommendation": scr.recommendation,
        "review_status": scr.review_status,
        "review": serialize_review(get_latest_review(scr)),
    }


@router.post("/{id}/analyze")
def analyze_screening(id: str, req: AnalyzeRequest, db: Session = Depends(get_db)):
    scr = db.query(Screening).options(
        joinedload(Screening.reviews).joinedload(Review.reviewer)
    ).filter(
        (Screening.id == id) | (Screening.screening_display_id == id)
    ).first()
    if not scr:
        raise HTTPException(404, "Screening not found")

    scr.status = "analyzing"
    db.commit()

    eyes_to_process = []
    if req.eye in ["left", "both"] and scr.left_image_path:
        eyes_to_process.append("left")
    if req.eye in ["right", "both"] and scr.right_image_path:
        eyes_to_process.append("right")

    total_time = 0
    needs_recapture = False
    referable = False

    for eye in eyes_to_process:
        path = getattr(scr, f"{eye}_image_path")
        bgr = cv2.imread(path)
        if bgr is None:
            continue

        res = pipeline_service.run(bgr, eye, str(scr.id), image_path=path)

        # Map quality back to DB
        setattr(scr, f"{eye}_quality_status", res["quality"].status)
        setattr(scr, f"{eye}_quality_scores", res["quality"].scores)
        setattr(scr, f"{eye}_quality_reason", res["quality"].reason)

        if res["status"] == "needs_recapture":
            needs_recapture = True
            continue

        setattr(scr, f"{eye}_dr_grade", res["dr"].grade)
        setattr(scr, f"{eye}_class_probabilities", res["dr"].class_probabilities)
        setattr(scr, f"{eye}_confidence_raw", res["dr"].confidence_raw)
        setattr(scr, f"{eye}_confidence_calibrated", res["calibrated_confidence"])
        setattr(scr, f"{eye}_referable", res["dr"].referable)
        setattr(scr, f"{eye}_gradcam_path", res["gradcam_url"])
        setattr(scr, f"{eye}_vessel_overlay_path", res["vessel_overlay_url"])
        setattr(scr, f"{eye}_vessel_mask_path", res["vessel_mask_url"])
        setattr(scr, f"{eye}_vessel_density", res.get("vessel_density"))
        setattr(scr, f"{eye}_od_fovea_overlay_path", res["od_fovea_overlay_url"])
        setattr(scr, f"{eye}_od_x", res["od_x"])
        setattr(scr, f"{eye}_od_y", res["od_y"])
        setattr(scr, f"{eye}_od_confidence", res["od_confidence"])
        setattr(scr, f"{eye}_fovea_x", res["fovea_x"])
        setattr(scr, f"{eye}_fovea_y", res["fovea_y"])
        setattr(scr, f"{eye}_fovea_confidence", res["fovea_confidence"])
        
        # Biomarkers (MATLAB integration)
        setattr(scr, f"{eye}_biomarkers", res.get("biomarkers"))
        setattr(scr, f"{eye}_avr", res.get("avr"))
        setattr(scr, f"{eye}_tortuosity", res.get("vessel_tortuosity"))
        setattr(scr, f"{eye}_fractal_dim", res.get("fractal_dimension"))

        # Format lesion result as a JSON dict and store it
        if res.get("lesion"):
            les_obj = res["lesion"]
            les_dict = {
                "microaneurysm": les_obj.microaneurysm.__dict__,
                "exudate": les_obj.exudate.__dict__,
                "hemorrhage": les_obj.hemorrhage.__dict__,
                "neovascularization": les_obj.neovascularization.__dict__,
                "overlay_url": res.get("lesion_overlay_url")
            }
            setattr(scr, f"{eye}_lesion_result", les_dict)

        if res["dr"].referable:
            referable = True

        total_time += res["pipeline_time"]

    if needs_recapture:
        scr.status = "needs_recapture"
    else:
        scr.status = "complete"
        scr.overall_referable = referable
        scr.recommendation = (
            "Priority referral — Specialist evaluation recommended."
            if referable
            else "Routine annual screening recommended."
        )
        scr.review_status = "pending" if referable else "not_required"
        scr.pipeline_time_seconds = total_time
        scr.analyzed_at = time.strftime('%Y-%m-%d %H:%M:%S')

    db.commit()
    db.refresh(scr)

    # Automatically trigger longitudinal comparison after successful analysis
    if scr.status == "complete":
        try:
            from api.longitudinal import _run_and_save_comparison
            _run_and_save_comparison(scr.id, db)
        except Exception:
            db.rollback()  # Never let longitudinal failure break the screening workflow

    # Return full structured response so AnalyzePage gets the correct ScreeningResult shape
    return _screening_response(scr)
