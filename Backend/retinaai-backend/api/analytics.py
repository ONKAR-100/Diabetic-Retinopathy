from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database.db import get_db
from database.models import Screening, Review, User
from core.dependencies import get_current_user
from sqlalchemy.sql import func
from datetime import datetime, timedelta, timezone

router = APIRouter()

@router.get("/summary")
def get_analytics(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    screenings = db.query(Screening).all()
    total = len(screenings)
    referable = sum(1 for s in screenings if s.overall_referable)
    pending = sum(1 for s in screenings if s.review_status == "pending")
    
    # Calculate real grade distribution across all screenings in the database
    grade_dist = {"0": 0, "1": 0, "2": 0, "3": 0, "4": 0}
    ungradable_count = 0
    pipeline_times = []
    
    now_utc_naive = datetime.now(timezone.utc).replace(tzinfo=None)
    today_start = now_utc_naive.replace(hour=0, minute=0, second=0, microsecond=0)
    today_screenings = 0
    
    for s in screenings:
        if s.created_at and s.created_at >= today_start:
            today_screenings += 1
            
        if s.left_quality_status == "ungradable" or s.right_quality_status == "ungradable" or s.status == "needs_recapture":
            ungradable_count += 1
            
        if s.pipeline_time_seconds is not None:
            pipeline_times.append(s.pipeline_time_seconds)
            
        lg = s.left_dr_grade if s.left_dr_grade is not None else -1
        rg = s.right_dr_grade if s.right_dr_grade is not None else -1
        max_g = max(lg, rg)
        if max_g >= 0 and str(max_g) in grade_dist:
            grade_dist[str(max_g)] += 1
            
    # Calculate average review duration
    avg_duration = db.query(func.avg(Review.review_duration_seconds)).scalar()
    avg_review_time = float(avg_duration) if avg_duration else 0.0
    avg_pipeline_time = float(round(sum(pipeline_times) / len(pipeline_times), 1)) if pipeline_times else 0.0
    recapture_rate = float(round(ungradable_count / (total * 2), 3)) if total > 0 else 0.0

    # Monthly volume aggregation
    monthly_map = {}
    now = now_utc_naive
    for m_back in range(5, -1, -1):
        target_date = now - timedelta(days=m_back * 30)
        m_label = target_date.strftime("%b")
        monthly_map[m_label] = 0
    
    for s in screenings:
        if s.created_at:
            m_label = s.created_at.strftime("%b")
            if m_label in monthly_map:
                monthly_map[m_label] += 1

    monthly_volumes = [{"month": k, "count": v} for k, v in monthly_map.items()]

    return {
      "total_screenings": total,
      "today_screenings": today_screenings,
      "referable_cases": referable,
      "non_referable_cases": total - referable,
      "ungradable_images": ungradable_count,
      "pending_reviews": pending,
      "average_pipeline_time": avg_pipeline_time,
      "average_review_time": avg_review_time,
      "grade_distribution": grade_dist,
      "recapture_rate": recapture_rate,
      "monthly_volumes": monthly_volumes
    }

