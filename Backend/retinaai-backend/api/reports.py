"""
Reports API
===========
Generates PDF reports and stores them in Supabase Storage.
Reports are served by redirecting to the Supabase public URL — no
local disk needed for permanent storage.
"""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse, RedirectResponse
from sqlalchemy.orm import Session
import io
import os
import traceback

from database.db import get_db
from database.models import Screening, Report, User
from schemas.report import ReportResponse
from models_loader.loaders import report_service
from config import settings
from services.storage_service import storage_service
from core.dependencies import get_current_user

import logging
logger = logging.getLogger(__name__)

router = APIRouter()


def ensure_pdf(screening_id: str, db: Session, force: bool = False):
    scr = db.query(Screening).filter(
        (Screening.id == screening_id) | (Screening.screening_display_id == screening_id)
    ).first()
    if not scr:
        raise HTTPException(404, "Screening not found")

    rep = db.query(Report).filter(Report.screening_id == scr.id).first()

    # If we have a report record and not forcing, return immediately
    if rep and not force and rep.pdf_path:
        return scr, rep, rep.pdf_path

    # Generate PDF into memory buffer
    try:
        pdf_buffer = io.BytesIO()
        report_service.generate_report_to_buffer(scr, scr.patient, pdf_buffer)
        pdf_buffer.seek(0)
    except AttributeError:
        # Fallback: if report_service doesn't have generate_report_to_buffer yet,
        # use the legacy generate_report with a temp file
        import tempfile
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            tmp_path = tmp.name
        try:
            report_service.generate_report(scr, scr.patient, tmp_path)
            with open(tmp_path, "rb") as f:
                pdf_buffer = io.BytesIO(f.read())
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)

    # Upload PDF to Supabase Storage
    storage_path = f"{scr.screening_display_id}/report.pdf"
    try:
        pdf_url = storage_service.upload_pdf_buffer(
            pdf_buffer, settings.STORAGE_BUCKET_REPORTS, storage_path
        )
    except Exception as exc:
        logger.error(f"Failed to upload report to storage for {scr.screening_display_id}: {exc}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Failed to save diagnostic report to storage. Please try again later."
        )

    # Persist / update Report record
    if not rep:
        rep = Report(screening_id=scr.id, pdf_path=pdf_url)
        db.add(rep)
    else:
        rep.pdf_path = pdf_url

    db.commit()
    db.refresh(rep)

    return scr, rep, pdf_url


@router.get("/{screening_id}")
def view_report_pdf(screening_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Return the PDF report bytes directly using StreamingResponse or FileResponse."""
    scr, rep, pdf_url = ensure_pdf(screening_id, db)

    filename = f"RetinaAI_Report_{scr.screening_display_id or screening_id}.pdf"
    headers = {"Content-Disposition": f"inline; filename={filename}"}

    # 1. If it's a remote/Supabase URL, download and stream directly
    if pdf_url.startswith("http://") or pdf_url.startswith("https://"):
        storage_path = f"{scr.screening_display_id}/report.pdf"
        try:
            pdf_bytes = storage_service.download_bytes(settings.STORAGE_BUCKET_REPORTS, storage_path)
            return StreamingResponse(
                io.BytesIO(pdf_bytes),
                media_type="application/pdf",
                headers=headers
            )
        except Exception:
            pass

    # 2. Local file resolution
    if os.path.isabs(pdf_url) and os.path.exists(pdf_url):
        local_path = pdf_url
    else:
        local_path = storage_service.get_local_path(pdf_url)
    if not local_path or not os.path.exists(local_path):
        candidate = os.path.join(settings.STATIC_DIR, scr.screening_display_id, "report.pdf")
        if os.path.exists(candidate):
            local_path = candidate

    if local_path and os.path.exists(local_path):
        from fastapi.responses import FileResponse
        return FileResponse(
            local_path,
            media_type="application/pdf",
            filename=filename,
            headers=headers
        )

    raise HTTPException(404, "Report file not found")


@router.post("/{screening_id}/generate", response_model=ReportResponse)
@router.post("/{screening_id}", response_model=ReportResponse)
def generate_report_endpoint(screening_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    scr, rep, pdf_url = ensure_pdf(screening_id, db, force=True)

    return ReportResponse(
        report_id=rep.id,
        screening_id=scr.screening_display_id,
        pdf_url=storage_service.resolve_asset_url(pdf_url),
        generated_at=rep.generated_at,
    )
