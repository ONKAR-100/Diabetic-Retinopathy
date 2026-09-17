import os
from pydantic_settings import BaseSettings
from dotenv import load_dotenv

_backend_env = os.path.join(os.path.dirname(__file__), ".env")
if os.path.exists(_backend_env):
    load_dotenv(_backend_env)
load_dotenv()

def _resolve_path(env_var: str, default_rel: str) -> str:
    val = os.getenv(env_var)
    if val and os.path.exists(val):
        return val
    candidates = [
        f"D:/SIH2026/Complete Project/Models/{default_rel}",
        f"D:/SIH2026/Complete Project/{default_rel}",
        f"D:/SIH2026/Complete Project/Unwanted/{default_rel}",
        os.path.join(os.path.dirname(__file__), "..", "..", "Models", default_rel),
        os.path.join(os.path.dirname(__file__), "..", "..", default_rel),
        os.path.join(os.path.dirname(__file__), "..", "..", "Unwanted", default_rel),
    ]
    for c in candidates:
        if c and os.path.exists(c):
            return c
    return val or candidates[0]

class Settings(BaseSettings):
    # ── Database (Supabase PostgreSQL) ────────────────────────────────────────
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql://postgres:password@localhost:5432/retinaai"
    )

    # ── Supabase Storage ──────────────────────────────────────────────────────
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "https://xtyofnqmzqkimamgjwuk.supabase.co")
    SUPABASE_ANON_KEY: str = os.getenv("SUPABASE_ANON_KEY", "")
    SUPABASE_SERVICE_ROLE_KEY: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

    # Storage bucket names
    STORAGE_BUCKET_UPLOADS: str = os.getenv("STORAGE_BUCKET_UPLOADS", "retina-uploads")
    STORAGE_BUCKET_RESULTS: str = os.getenv("STORAGE_BUCKET_RESULTS", "retina-results")
    STORAGE_BUCKET_REPORTS: str = os.getenv("STORAGE_BUCKET_REPORTS", "retina-reports")

    # ── Auth (JWT) ────────────────────────────────────────────────────────────
    JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "your-super-secret-key-change-in-production")
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    JWT_EXPIRE_MINUTES: int = int(os.getenv("JWT_EXPIRE_MINUTES", "480"))

    # ── AI Model Paths ─────────────────────────────────────────────────────────
    DR_MODEL_PATH: str = _resolve_path("DR_MODEL_PATH", "dr_grade/best_efficientnet_b2.pth")
    DR_NORM_PATH: str = _resolve_path("DR_NORM_PATH", "dr_grade/normalization_stats.json")
    VESSEL_MODEL_PATH: str = _resolve_path("VESSEL_MODEL_PATH", "vessel_extraction/Vessel_Model")
    OD_FOVEA_MODEL_PATH: str = _resolve_path("OD_FOVEA_MODEL_PATH", "od_fovea_localization/best_fundus_localization_model.pth")
    LESION_MODEL_PATH: str = _resolve_path("LESION_MODEL_PATH", "lesion_segmentation/fundus_ensemble_bundle.pth")
    ENABLE_MATLAB_BIOMARKERS: bool = os.getenv("ENABLE_MATLAB_BIOMARKERS", "true").lower() in ("true", "1", "yes")
    MATLAB_SCRIPTS_PATH: str = os.getenv(
        "MATLAB_SCRIPTS_PATH",
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "MATLAB"))
    )
    MATLAB_TIMEOUT_SECONDS: int = int(os.getenv("MATLAB_TIMEOUT_SECONDS", "60"))

    # ── Local static & temp dirs ─────────────────────────────────────────────
    STATIC_DIR: str = os.getenv(
        "STATIC_DIR",
        os.path.abspath(os.path.join(os.path.dirname(__file__), "static"))
    )
    UPLOAD_DIR: str = os.getenv("UPLOAD_DIR", "static/uploads")
    RESULT_DIR: str = os.getenv("RESULT_DIR", "static/results")
    MAX_UPLOAD_MB: int = int(os.getenv("MAX_UPLOAD_MB", "20"))

settings = Settings()

# Keep local static & temp dirs for intermediate processing
os.makedirs(settings.STATIC_DIR, exist_ok=True)
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
os.makedirs(settings.RESULT_DIR, exist_ok=True)
