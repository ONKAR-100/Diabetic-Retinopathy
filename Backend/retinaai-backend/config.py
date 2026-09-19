import os
import secrets
import logging
from typing import List
from pydantic_settings import BaseSettings
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

_backend_env = os.path.join(os.path.dirname(__file__), ".env")
if os.path.exists(_backend_env):
    load_dotenv(_backend_env)
load_dotenv()

INSECURE_JWT_SECRETS = {
    "your-super-secret-key-change-in-production",
    "super-secret-key-change-in-production",
    "secret",
    "changeme",
    "change-me",
}

def _resolve_jwt_secret() -> str:
    raw = os.getenv("JWT_SECRET_KEY")
    env = os.getenv("ENVIRONMENT", "development").lower()
    if raw and raw not in INSECURE_JWT_SECRETS:
        return raw
    if env in ("production", "prod"):
        raise RuntimeError(
            "JWT_SECRET_KEY must be explicitly configured with a secure key in production environments."
        )
    # Ephemeral secure random secret for local development/testing to prevent known-secret exploitation
    logger.warning("No explicit secure JWT_SECRET_KEY configured; using an ephemeral generated secret for development.")
    return secrets.token_urlsafe(32)

def _resolve_path(env_var: str, default_rel: str) -> str:
    val = os.getenv(env_var)
    if val and os.path.exists(val):
        return val
    candidates = [
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "Models", default_rel)),
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", default_rel)),
        os.path.abspath(os.path.join(os.path.dirname(__file__), "Models", default_rel)),
    ]
    for c in candidates:
        if c and os.path.exists(c):
            return c
    return val or candidates[0]

class Settings(BaseSettings):
    # ── Environment ───────────────────────────────────────────────────────────
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development").lower()

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
    JWT_SECRET_KEY: str = _resolve_jwt_secret()
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    JWT_EXPIRE_MINUTES: int = int(os.getenv("JWT_EXPIRE_MINUTES", "480"))

    # ── CORS ──────────────────────────────────────────────────────────────────
    CORS_ALLOWED_ORIGINS: str = os.getenv(
        "CORS_ALLOWED_ORIGINS",
        "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173,http://127.0.0.1:3000"
    )

    @property
    def cors_origins_list(self) -> List[str]:
        if not self.CORS_ALLOWED_ORIGINS:
            return ["http://localhost:5173", "http://localhost:3000"]
        return [origin.strip() for origin in self.CORS_ALLOWED_ORIGINS.split(",") if origin.strip()]

    def validate_jwt_secret(self, strict: bool = False) -> None:
        """Validate that the configured secret is safe."""
        is_insecure = not self.JWT_SECRET_KEY or self.JWT_SECRET_KEY in INSECURE_JWT_SECRETS
        if (strict or self.ENVIRONMENT in ("production", "prod")) and is_insecure:
            raise RuntimeError(
                "JWT_SECRET_KEY must be explicitly configured with a secure key in production environments."
            )

    # ── AI Model Paths ─────────────────────────────────────────────────────────
    DR_MODEL_PATH: str = _resolve_path("DR_MODEL_PATH", "dr_grade/best_efficientnet_b2.pth")
    DR_NORM_PATH: str = _resolve_path("DR_NORM_PATH", "dr_grade/normalization_stats.json")
    VESSEL_MODEL_PATH: str = _resolve_path("VESSEL_MODEL_PATH", "vessel_extraction/Vessel_Model")
    OD_FOVEA_MODEL_PATH: str = _resolve_path("OD_FOVEA_MODEL_PATH", "od_fovea_localization/best_fundus_localization_model.pth")
    LESION_MODEL_PATH: str = _resolve_path("LESION_MODEL_PATH", "lesion_segmentation/fundus_ensemble_bundle.pth")
    ENABLE_MATLAB_BIOMARKERS: bool = os.getenv("ENABLE_MATLAB_BIOMARKERS", "true").lower() in ("true", "1", "yes")
    ENABLE_SIMULINK: bool = os.getenv("ENABLE_SIMULINK", "true").lower() in ("true", "1", "yes")
    MATLAB_SCRIPTS_PATH: str = os.getenv(
        "MATLAB_SCRIPTS_PATH",
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "MATLAB"))
    )
    MATLAB_TIMEOUT_SECONDS: int = int(os.getenv("MATLAB_TIMEOUT_SECONDS", "60"))
    SIMULINK_TIMEOUT_SECONDS: int = int(os.getenv("SIMULINK_TIMEOUT_SECONDS", "30"))

    # ── Local static & temp dirs ─────────────────────────────────────────────
    STATIC_DIR: str = os.getenv(
        "STATIC_DIR",
        os.path.abspath(os.path.join(os.path.dirname(__file__), "static"))
    )
    UPLOAD_DIR: str = os.getenv(
        "UPLOAD_DIR",
        os.path.abspath(os.path.join(os.getenv("STATIC_DIR") or os.path.abspath(os.path.join(os.path.dirname(__file__), "static")), "uploads"))
    )
    RESULT_DIR: str = os.getenv(
        "RESULT_DIR",
        os.path.abspath(os.path.join(os.getenv("STATIC_DIR") or os.path.abspath(os.path.join(os.path.dirname(__file__), "static")), "results"))
    )

    # ── Upload & Image Limits ────────────────────────────────────────────────
    MAX_UPLOAD_MB: int = int(os.getenv("MAX_UPLOAD_MB", "20"))
    MAX_IMAGE_WIDTH: int = int(os.getenv("MAX_IMAGE_WIDTH", "8192"))
    MAX_IMAGE_HEIGHT: int = int(os.getenv("MAX_IMAGE_HEIGHT", "8192"))
    MAX_IMAGE_PIXELS: int = int(os.getenv("MAX_IMAGE_PIXELS", "64000000"))

settings = Settings()

# Keep local static & temp dirs for intermediate processing
os.makedirs(settings.STATIC_DIR, exist_ok=True)
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
os.makedirs(settings.RESULT_DIR, exist_ok=True)
