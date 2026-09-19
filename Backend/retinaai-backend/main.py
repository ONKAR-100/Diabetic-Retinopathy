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
from core.dependencies import get_current_user

# Ensure local storage directory exists
os.makedirs(settings.STATIC_DIR, exist_ok=True)

@app.get("/api/media/{file_path:path}", tags=["Media"])
def get_media_file(
    file_path: str,
    current_user: User = Depends(get_current_user)
):
    """
    Authenticated media gateway for local clinical images and artifacts.
    Strictly confines file resolution to settings.STATIC_DIR and prevents traversal.
    """
    clean = file_path.replace("\\", "/").lstrip("/")
    parts = [p for p in clean.split("/") if p and p != "."]
    if any(p == ".." for p in parts):
        raise HTTPException(status_code=400, detail="Invalid path traversal sequence")

    static_root = os.path.abspath(settings.STATIC_DIR)
    target_path = os.path.abspath(os.path.join(static_root, *parts))

    # Strict confinement check
    if not target_path.startswith(static_root + os.sep) and target_path != static_root:
        raise HTTPException(status_code=403, detail="Access denied: path outside static directory")

    if not os.path.isfile(target_path):
        raise HTTPException(status_code=404, detail="Media file not found")

    ext = os.path.splitext(target_path)[-1].lower()
    media_types = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".pdf": "application/pdf"
    }
    media_type = media_types.get(ext, "application/octet-stream")
    return FileResponse(target_path, media_type=media_type)

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
