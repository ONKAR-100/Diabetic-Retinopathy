from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from models_loader.loaders import load_all_models
from database.db import engine, Base
from api import auth, patients, screenings, analysis, review, reports, analytics, longitudinal

# Create tables
Base.metadata.create_all(bind=engine)

@asynccontextmanager
async def lifespan(app: FastAPI):
    load_all_models()
    yield

app = FastAPI(title="RetinaAI Backend", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

import os
os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

# Include all routers
app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(patients.router, prefix="/api/patients", tags=["Patients"])
app.include_router(screenings.router, prefix="/api/screenings", tags=["Screenings"])
app.include_router(analysis.router, prefix="/api/screenings", tags=["Analysis"])
app.include_router(review.router, prefix="/api", tags=["Review"])
app.include_router(reports.router, prefix="/api/reports", tags=["Reports"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["Analytics"])
app.include_router(longitudinal.router, prefix="/api", tags=["Longitudinal"])

@app.get("/", tags=["Root"])
def root():
    return {
        "title": "RetinaAI Screening Backend",
        "version": "1.0.0",
        "status": "operational",
        "docs": "/docs"
    }

@app.get("/api/health", tags=["Health"])
def health():
    return {"status": "ok"}
