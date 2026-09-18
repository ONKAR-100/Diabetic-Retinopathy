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
        traceback.print_exc()
        raise HTTPException(500, f"Failed to upload report to storage: {str(exc)}")

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
    """Redirect the browser directly to the Supabase Storage public URL or serve from local disk."""
    _, _, pdf_url = ensure_pdf(screening_id, db)

    # If it's a full HTTP URL (Supabase), redirect to it
    if pdf_url.startswith("http"):
        return RedirectResponse(url=pdf_url, status_code=302)

    # Fallback: serve from local disk
    local_path = storage_service.get_local_path(pdf_url)
    if local_path and os.path.exists(local_path):
        from fastapi.responses import FileResponse
        return FileResponse(
            local_path,
            media_type="application/pdf",
            filename=f"RetinaAI_Report_{screening_id}.pdf",
            headers={"Content-Disposition": f"inline; filename=RetinaAI_Report_{screening_id}.pdf"},
        )
    raise HTTPException(404, "Report file not found")


@router.post("/{screening_id}/generate", response_model=ReportResponse)
@router.post("/{screening_id}", response_model=ReportResponse)
def generate_report_endpoint(screening_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    scr, rep, pdf_url = ensure_pdf(screening_id, db, force=True)

    return ReportResponse(
        report_id=rep.id,
        screening_id=scr.screening_display_id,
        pdf_url=pdf_url,
        generated_at=rep.generated_at,
    )
