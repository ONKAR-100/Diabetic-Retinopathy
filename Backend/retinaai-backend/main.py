from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from models_loader.loaders import load_all_models
from database.db import engine, Base, init_db, get_db
from api import auth, patients, screenings, analysis, review, reports, analytics, longitudinal, simulation
from config import settings

@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.validate_jwt_secret()
    init_db()
    load_all_models()
    yield

app = FastAPI(title="RetinaAI Backend", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

import os
from fastapi import Depends, HTTPException
from fastapi.responses import FileResponse
from config import settings
from database.models import User
from core.dependencies import get_current_user, get_current_user_flexible

# Ensure local storage directory exists
os.makedirs(settings.STATIC_DIR, exist_ok=True)

@app.get("/api/media/{file_path:path}", tags=["Media"])
def get_media_file(
    file_path: str,
    current_user: User = Depends(get_current_user_flexible)
):
    """
    Authenticated media gateway for local clinical images and artifacts.
    Strictly confines file resolution to settings.STATIC_DIR and prevents traversal.
    Adds 1-hour browser cache headers so images are served from disk on repeat visits.
    """
    clean = file_path.replace("\\", "/").lstrip("/")
    if "static/" in clean:
        clean = clean.split("static/", 1)[1].lstrip("/")

    parts = [p for p in clean.split("/") if p and p != "."]
    if any(p == ".." for p in parts):
        raise HTTPException(status_code=400, detail="Invalid path traversal sequence")

    static_root = os.path.abspath(settings.STATIC_DIR)
    target_path = os.path.abspath(os.path.join(static_root, *parts))

    # Strict confinement check
    if not target_path.startswith(static_root + os.sep) and target_path != static_root:
        raise HTTPException(status_code=403, detail="Access denied: path outside static directory")

    if not os.path.isfile(target_path):
        # On-demand fallback: attempt to download from Supabase Storage if missing locally
        from services.storage_service import storage_service
        downloaded = False
        rel_clean = "/".join(parts)
        for bucket in [settings.STORAGE_BUCKET_RESULTS, settings.STORAGE_BUCKET_UPLOADS, settings.STORAGE_BUCKET_REPORTS]:
            try:
                data = storage_service.download_bytes(bucket, rel_clean)
                if data:
                    os.makedirs(os.path.dirname(target_path), exist_ok=True)
                    with open(target_path, "wb") as f:
                        f.write(data)
                    downloaded = True
                    break
            except Exception:
                pass

        if not downloaded and not os.path.isfile(target_path):
            raise HTTPException(status_code=404, detail="Media file not found")

    ext = os.path.splitext(target_path)[-1].lower()
    media_types = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".pdf": "application/pdf"
    }
    media_type = media_types.get(ext, "application/octet-stream")

    # Build a deterministic ETag from file size + mtime so browsers validate cheaply
    stat = os.stat(target_path)
    etag = f'"{int(stat.st_mtime)}-{stat.st_size}"'

    headers = {
        # Clinical images never change once written — 1-hour public cache is safe
        "Cache-Control": "private, max-age=3600, stale-while-revalidate=300",
        "ETag": etag,
    }
    return FileResponse(target_path, media_type=media_type, headers=headers)


# Include all routers
app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(patients.router, prefix="/api/patients", tags=["Patients"])
app.include_router(screenings.router, prefix="/api/screenings", tags=["Screenings"])
app.include_router(analysis.router, prefix="/api/screenings", tags=["Analysis"])
app.include_router(review.router, prefix="/api", tags=["Review"])
app.include_router(reports.router, prefix="/api/reports", tags=["Reports"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["Analytics"])
app.include_router(longitudinal.router, prefix="/api", tags=["Longitudinal"])
app.include_router(simulation.router, prefix="/api", tags=["Simulation"])

@app.get("/", tags=["Root"])
def root():
    return {
        "title": "RetinaAI Screening Backend",
        "version": "1.0.0",
        "status": "operational",
        "docs": "/docs"
    }

from sqlalchemy import text
from sqlalchemy.orm import Session

@app.get("/api/health", tags=["Health"])
def health(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
        return {"status": "ok", "database": "connected"}
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Database unavailable: {exc}"
        )
