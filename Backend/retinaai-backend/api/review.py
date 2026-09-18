import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime

from database.db import get_db
from database.models import Screening, Review, Report
from schemas.review import ReviewCreate, ReviewResponse
from core.dependencies import get_current_user, require_doctor
from services.storage_service import storage_service
from api.screenings import map_screening_to_response

logger = logging.getLogger(__name__)

router = APIRouter()

@router.get("/review/queue")
def get_review_queue(db: Session = Depends(get_db), user = Depends(require_doctor)):
    # Return pending, ordered by grade roughly (highest left or right)
    scrs = db.query(Screening).filter(Screening.review_status == "pending").all()
    # Sort highest grade first
    def max_grade(s):
        lg = s.left_dr_grade if s.left_dr_grade is not None else -1
        rg = s.right_dr_grade if s.right_dr_grade is not None else -1
        return max(lg, rg)
    scrs.sort(key=max_grade, reverse=True)
    return [map_screening_to_response(s) for s in scrs]

@router.post("/screenings/{id}/review", response_model=ReviewResponse)
def submit_review(id: str, req: ReviewCreate, db: Session = Depends(get_db), user = Depends(require_doctor)):
    scr = db.query(Screening).filter(
        (Screening.id == id) | (Screening.screening_display_id == id)
    ).first()
    if not scr:
        raise HTTPException(404, "Screening not found")
        
    rev = Review(
        screening_id=scr.id,
        reviewer_id=user.id,
        decision=req.decision,
        final_grade_left=req.final_grade_left,
        final_grade_right=req.final_grade_right,
        final_referable=req.final_referable,
        notes=req.notes,
        review_duration_seconds=req.review_duration_seconds
    )
    db.add(rev)
    
    scr.review_status = "reviewed"

    # Synchronize overall_referable with doctor's final judgment
    if req.final_referable is not None:
        scr.overall_referable = req.final_referable

    # CLIN-01: Invalidate and purge cached report to ensure subsequent report requests regenerate fresh
    cached_rep = db.query(Report).filter(Report.screening_id == scr.id).first()
    if cached_rep:
        if cached_rep.pdf_path:
            try:
                storage_service.delete_asset(cached_rep.pdf_path)
            except Exception as exc:
                logger.warning(f"Could not delete old report artifact {cached_rep.pdf_path}: {exc}")
        db.delete(cached_rep)

    db.commit()
    db.refresh(rev)
    
    return rev
