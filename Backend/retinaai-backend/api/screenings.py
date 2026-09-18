from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from datetime import datetime
import os
import io
import logging
import cv2
import numpy as np
from PIL import Image as PILImage
import aiofiles

from database.db import get_db
from database.models import Screening, User, Patient, Review
from schemas.screening import ScreeningCreate, ScreeningResponse
from core.dependencies import get_current_user
from config import settings

logger = logging.getLogger(__name__)

router = APIRouter()


def serialize_review(review: Optional[Review]) -> Optional[dict]:
    """Serialize a Review ORM object into a dictionary for API response."""
    if review is None:
        return None

    reviewer_name = ""
    reviewer = getattr(review, "reviewer", None)
    if reviewer:
        reviewer_name = getattr(reviewer, "full_name", None) or getattr(reviewer, "username", None) or ""

    return {
        "id": review.id,
        "reviewer_id": review.reviewer_id,
        "reviewer_name": reviewer_name,
        "decision": review.decision,
        "final_grade_left": review.final_grade_left,
        "final_grade_right": review.final_grade_right,
        "final_referable": review.final_referable,
        "notes": review.notes,
        "reviewed_at": review.reviewed_at.isoformat() if getattr(review, "reviewed_at", None) else None,
        "review_duration_seconds": getattr(review, "review_duration_seconds", None),
    }


def get_latest_review(scr: Screening) -> Optional[Review]:
    """Retrieve the most recent Review associated with a Screening, if any."""
    reviews = getattr(scr, "reviews", None)
    if not reviews:
        return None
    try:
        return max(
            reviews,
            key=lambda r: getattr(r, "reviewed_at", None) or datetime.min
        )
    except Exception:
        return reviews[0] if len(reviews) > 0 else None


from services.storage_service import storage_service

def map_screening_to_response(scr: Screening):
    def build_eye(eye_prefix):
        status = getattr(scr, f"{eye_prefix}_quality_status")
        if not status: return None

        lesion_data = getattr(scr, f"{eye_prefix}_lesion_result")
        if lesion_data and isinstance(lesion_data, dict) and lesion_data.get("overlay_url"):
            lesion_data = dict(lesion_data)
            lesion_data["overlay_url"] = storage_service.resolve_asset_url(lesion_data["overlay_url"])

        return {
            "quality": {
                "status": status,
                "scores": getattr(scr, f"{eye_prefix}_quality_scores") or {},
                "reason": getattr(scr, f"{eye_prefix}_quality_reason")
            },
            "original_image_url": storage_service.resolve_asset_url(getattr(scr, f"{eye_prefix}_image_path")),
            "dr_grade": getattr(scr, f"{eye_prefix}_dr_grade"),
            "dr_grade_name": f"Grade {getattr(scr, f'{eye_prefix}_dr_grade')}" if getattr(scr, f"{eye_prefix}_dr_grade") is not None else None,
            "class_probabilities": getattr(scr, f"{eye_prefix}_class_probabilities"),
            "confidence_raw": getattr(scr, f"{eye_prefix}_confidence_raw"),
            "confidence_calibrated": getattr(scr, f"{eye_prefix}_confidence_calibrated"),
            "referable": getattr(scr, f"{eye_prefix}_referable"),
            "gradcam_url": storage_service.resolve_asset_url(getattr(scr, f"{eye_prefix}_gradcam_path")),
            "vessel_overlay_url": storage_service.resolve_asset_url(getattr(scr, f"{eye_prefix}_vessel_overlay_path")),
            "vessel_mask_url": storage_service.resolve_asset_url(getattr(scr, f"{eye_prefix}_vessel_mask_path")),
            "vessel_density": getattr(scr, f"{eye_prefix}_vessel_density"),
            "od_fovea_overlay_url": storage_service.resolve_asset_url(getattr(scr, f"{eye_prefix}_od_fovea_overlay_path")),
            "od_x": getattr(scr, f"{eye_prefix}_od_x"),
            "od_y": getattr(scr, f"{eye_prefix}_od_y"),
            "od_confidence": getattr(scr, f"{eye_prefix}_od_confidence"),
            "fovea_x": getattr(scr, f"{eye_prefix}_fovea_x"),
            "fovea_y": getattr(scr, f"{eye_prefix}_fovea_y"),
            "fovea_confidence": getattr(scr, f"{eye_prefix}_fovea_confidence"),
            "lesion": lesion_data,
            "biomarkers": getattr(scr, f"{eye_prefix}_biomarkers"),
            "avr": getattr(scr, f"{eye_prefix}_avr"),
            "vessel_tortuosity": getattr(scr, f"{eye_prefix}_tortuosity"),
            "fractal_dimension": getattr(scr, f"{eye_prefix}_fractal_dim"),
        }

    latest_review = get_latest_review(scr)

    return {
        "id": scr.id,
        "screening_id": scr.screening_display_id,
        "patient_id": scr.patient.patient_display_id if scr.patient else "",
        "patient_name": scr.patient.name if scr.patient else "",
        "previous_screening_id": scr.previous_screening_id,
        "status": scr.status,
        "created_at": scr.created_at.isoformat() if scr.created_at else None,
        "left_eye": build_eye("left"),
        "right_eye": build_eye("right"),
        "overall_referable": scr.overall_referable,
        "recommendation": scr.recommendation,
        "review_status": scr.review_status,
        "review": serialize_review(latest_review)
    }

@router.get("", response_model=dict)
@router.get("/", response_model=dict)
def list_screenings(
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    limit: int = Query(50, ge=1, le=100, description="Page size (max 100)"),
    patient_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(Screening).options(
        joinedload(Screening.reviews).joinedload(Review.reviewer)
    )
    if patient_id:
        patient = db.query(Patient).filter((Patient.id == patient_id) | (Patient.patient_display_id == patient_id)).first()
        pid = patient.id if patient else patient_id
        query = query.filter(Screening.patient_id == pid)
    
    total = query.count()
    screenings = query.order_by(Screening.created_at.desc()).offset((page - 1) * limit).limit(limit).all()
    mapped = [map_screening_to_response(s) for s in screenings]
    
    return {
        "screenings": mapped,
        "items": mapped,
        "total": total,
        "page": page,
        "limit": limit
    }


@router.post("", response_model=dict)
@router.post("/", response_model=dict)
def create_screening(req: ScreeningCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    # Look up existing patient by UUID or display ID (e.g. PAT-001 or RTA-2401)
    patient = db.query(Patient).filter(
        (Patient.id == req.patient_id) | (Patient.patient_display_id == req.patient_id)
    ).first()
    if not patient:
        raise HTTPException(status_code=404, detail=f"Patient '{req.patient_id}' not found")

    existing_ids = db.query(Screening.screening_display_id).filter(Screening.screening_display_id.like("SCR-%")).all()
    max_num = 10000
    for (sid,) in existing_ids:
        if sid and sid.startswith("SCR-"):
            try:
                num = int(sid.split("-")[1])
                if num > max_num:
                    max_num = num
            except (ValueError, IndexError):
                pass
    candidate = f"SCR-{max_num + 1}"
    while db.query(Screening).filter(Screening.screening_display_id == candidate).first():
        max_num += 1
        candidate = f"SCR-{max_num + 1}"
    display_id = candidate
    
    # Check for previous complete examination for this patient
    prev_screening_id = None
    if req.previous_screening_id:
        prev = db.query(Screening).filter(
            (Screening.id == req.previous_screening_id) | (Screening.screening_display_id == req.previous_screening_id),
            Screening.patient_id == patient.id
        ).first()
        if prev:
            prev_screening_id = prev.id
    if not prev_screening_id:
        latest_prev = db.query(Screening).filter(
            Screening.patient_id == patient.id,
            Screening.status == "complete"
        ).order_by(Screening.created_at.desc()).first()
        if latest_prev:
            prev_screening_id = latest_prev.id

    scr = Screening(
        screening_display_id=display_id,
        patient_id=patient.id,
        previous_screening_id=prev_screening_id,
        created_by=user.id,
        status="uploading"
    )
    db.add(scr)
    db.commit()
    db.refresh(scr)
    
    return map_screening_to_response(scr)

@router.post("/{id}/upload")
async def upload_image(
    id: str,
    eye: str = Form(...),
    file: UploadFile = File(None),
    image: UploadFile = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    upload = file or image
    if not upload:
        raise HTTPException(400, "No image file provided")

    # 1. Strict eye validation
    clean_eye = (eye or "").strip().lower()
    if clean_eye not in ("left", "right"):
        raise HTTPException(422, detail="Invalid eye parameter. Must be 'left' or 'right'.")

    scr = db.query(Screening).filter((Screening.id == id) | (Screening.screening_display_id == id)).first()
    if not scr:
        raise HTTPException(404, "Screening not found")

    # 2. Extension allowlist
    ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png"}
    filename = upload.filename or "upload.jpg"
    raw_ext = os.path.splitext(filename)[1].lower()
    if not raw_ext:
        raw_ext = ".jpg"
    if raw_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            415,
            detail="Unsupported file format. Only JPEG (.jpg, .jpeg) and PNG (.png) images are accepted."
        )

    # 3. Bounded chunked read to enforce MAX_UPLOAD_MB without memory exhaustion
    max_bytes = settings.MAX_UPLOAD_MB * 1024 * 1024
    if upload.size is not None and upload.size > max_bytes:
        raise HTTPException(413, detail=f"Upload exceeds maximum allowed size of {settings.MAX_UPLOAD_MB}MB.")

    CHUNK_SIZE = 64 * 1024  # 64 KB
    chunks = []
    total_size = 0
    while True:
        chunk = await upload.read(CHUNK_SIZE)
        if not chunk:
            break
        total_size += len(chunk)
        if total_size > max_bytes:
            raise HTTPException(413, detail=f"Upload exceeds maximum allowed size of {settings.MAX_UPLOAD_MB}MB.")
        chunks.append(chunk)

    content = b"".join(chunks)
    if not content:
        raise HTTPException(400, detail="Uploaded image file is empty.")

    # 4. Magic / signature validation
    is_jpeg = content.startswith(b"\xff\xd8\xff")
    is_png = content.startswith(b"\x89PNG\r\n\x1a\n")

    if not (is_jpeg or is_png):
        raise HTTPException(400, detail="Invalid file signature. Uploaded file is not a valid JPEG or PNG image.")

    canonical_ext = ".png" if is_png else ".jpg"

    # 5. Image dimension safety & decompression-bomb protection via PIL header inspection
    try:
        with PILImage.open(io.BytesIO(content)) as img:
            img.verify()
            w, h = img.size
            if w < 100 or h < 100:
                raise HTTPException(400, detail="Image dimensions are too small for clinical retinal analysis (minimum 100x100).")
            if w > settings.MAX_IMAGE_WIDTH or h > settings.MAX_IMAGE_HEIGHT:
                raise HTTPException(
                    400,
                    detail=f"Image dimensions ({w}x{h}) exceed maximum allowed ({settings.MAX_IMAGE_WIDTH}x{settings.MAX_IMAGE_HEIGHT})."
                )
            if (w * h) > settings.MAX_IMAGE_PIXELS:
                raise HTTPException(400, detail="Image pixel count exceeds safe clinical processing limits.")
    except (PILImage.DecompressionBombError, PILImage.DecompressionBombWarning):
        raise HTTPException(400, detail="Image exceeds safe decompression limits.")
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning(f"PIL verification failed for uploaded image: {exc}")
        raise HTTPException(400, detail="Corrupted or invalid image file. Unable to decode retinal image.")

    # 6. OpenCV decode validation before persistence
    buf = np.frombuffer(content, dtype=np.uint8)
    decoded = cv2.imdecode(buf, cv2.IMREAD_COLOR)
    if decoded is None:
        raise HTTPException(400, detail="Corrupted or invalid image file. Unable to decode retinal image.")

    # ── Upload directly to Supabase Storage ─────────────────────────────────
    from services.storage_service import storage_service

    storage_path = f"{scr.id}_{clean_eye}{canonical_ext}"
    content_type = "image/png" if is_png else "image/jpeg"
    public_url = storage_service.upload_bytes(
        content,
        settings.STORAGE_BUCKET_UPLOADS,
        storage_path,
        content_type,
    )

    # Also write to local temp dir so cv2.imread works during the AI pipeline
    local_path = os.path.join(settings.UPLOAD_DIR, storage_path)
    with open(local_path, 'wb') as f:
        f.write(content)

    if clean_eye == "left":
        scr.left_image_path = local_path   # local path for pipeline use
    else:
        scr.right_image_path = local_path  # local path for pipeline use

    db.commit()
    return {"status": "ok", "path": storage_service.resolve_asset_url(public_url), "local_path": local_path}


@router.get("/{id}")
def get_screening(id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    scr = db.query(Screening).options(
        joinedload(Screening.reviews).joinedload(Review.reviewer)
    ).filter((Screening.id == id) | (Screening.screening_display_id == id)).first()
    if not scr:
        raise HTTPException(404, "Screening not found")
    return map_screening_to_response(scr)
