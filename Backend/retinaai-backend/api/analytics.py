from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, case, text
from database.db import get_db
from database.models import Screening, Review, User
from core.dependencies import get_current_user
from datetime import datetime, timezone
import time
import threading

router = APIRouter()

# ── In-process 30-second TTL cache ───────────────────────────────────────────
_analytics_cache: dict = {}
_analytics_lock = threading.Lock()
_ANALYTICS_TTL = 30.0  # seconds


def _get_cached_analytics(db: Session) -> dict:
    now = time.monotonic()
    with _analytics_lock:
        entry = _analytics_cache.get("summary")
        if entry and (now - entry["ts"]) < _ANALYTICS_TTL:
            return entry["data"]

    data = _compute_analytics(db)

    with _analytics_lock:
        _analytics_cache["summary"] = {"data": data, "ts": time.monotonic()}
    return data


def _compute_analytics(db: Session) -> dict:
    """
    Pure-SQL aggregation — no Python-side loops over all rows.
    All counts are computed in one or two DB round-trips.
    """
    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
    today_start = now_utc.replace(hour=0, minute=0, second=0, microsecond=0)

    # ── Single aggregate query for all scalar stats ───────────────────────────
    row = db.execute(text("""
        SELECT
            COUNT(*)                                                          AS total,
            COUNT(*) FILTER (WHERE overall_referable = TRUE)                  AS referable,
            COUNT(*) FILTER (WHERE review_status = 'pending')                 AS pending,
            COUNT(*) FILTER (WHERE
                left_quality_status  = 'ungradable' OR
                right_quality_status = 'ungradable' OR
                status               = 'needs_recapture')                     AS ungradable,
            COUNT(*) FILTER (WHERE created_at >= :today_start)               AS today_count,
            AVG(pipeline_time_seconds)                                        AS avg_pipeline
        FROM screenings
    """), {"today_start": today_start}).fetchone()

    total        = int(row.total or 0)
    referable    = int(row.referable or 0)
    pending      = int(row.pending or 0)
    ungradable   = int(row.ungradable or 0)
    today_count  = int(row.today_count or 0)
    avg_pipeline = round(float(row.avg_pipeline or 0.0), 1)

    # ── Grade distribution — group by max grade across both eyes ─────────────
    grade_rows = db.execute(text("""
        SELECT
            GREATEST(
                COALESCE(left_dr_grade, -1),
                COALESCE(right_dr_grade, -1)
            ) AS max_grade,
            COUNT(*) AS cnt
        FROM screenings
        WHERE
            left_dr_grade IS NOT NULL OR right_dr_grade IS NOT NULL
        GROUP BY max_grade
    """)).fetchall()

    grade_dist = {"0": 0, "1": 0, "2": 0, "3": 0, "4": 0}
    for r in grade_rows:
        g = int(r.max_grade)
        if 0 <= g <= 4:
            grade_dist[str(g)] = int(r.cnt)

    # ── Monthly volumes — last 6 months, SQL GROUP BY month ─────────────────
    monthly_rows = db.execute(text("""
        SELECT
            TO_CHAR(DATE_TRUNC('month', created_at), 'Mon') AS month_label,
            COUNT(*) AS cnt
        FROM screenings
        WHERE created_at >= NOW() - INTERVAL '6 months'
        GROUP BY DATE_TRUNC('month', created_at)
        ORDER BY DATE_TRUNC('month', created_at)
    """)).fetchall()

    # Build ordered 6-month labels
    from datetime import timedelta
    monthly_map: dict = {}
    for m in range(5, -1, -1):
        label = (now_utc - timedelta(days=m * 30)).strftime("%b")
        monthly_map[label] = 0
    for r in monthly_rows:
        lbl = r.month_label.strip()
        if lbl in monthly_map:
            monthly_map[lbl] = int(r.cnt)

    monthly_volumes = [{"month": k, "count": v} for k, v in monthly_map.items()]

    # ── Average review duration ───────────────────────────────────────────────
    avg_review_row = db.execute(
        text("SELECT AVG(review_duration_seconds) FROM reviews")
    ).scalar()
    avg_review_time = round(float(avg_review_row or 0.0), 1)

    recapture_rate = round(ungradable / (total * 2), 3) if total > 0 else 0.0

    return {
        "total_screenings":    total,
        "today_screenings":    today_count,
        "referable_cases":     referable,
        "non_referable_cases": total - referable,
        "ungradable_images":   ungradable,
        "pending_reviews":     pending,
        "average_pipeline_time": avg_pipeline,
        "average_review_time":   avg_review_time,
        "grade_distribution":    grade_dist,
        "recapture_rate":        recapture_rate,
        "monthly_volumes":       monthly_volumes,
    }


@router.get("/summary")
def get_analytics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return _get_cached_analytics(db)
