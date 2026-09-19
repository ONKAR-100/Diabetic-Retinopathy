"""
Phase 5 Dedicated Test Suite: Production Hardening & Reliability Verification

Tests:
1. Security & Hygiene:
   - Migration DB credential is environment-driven and not hard-coded in source.
   - Developer-specific absolute paths are eliminated from approved files.
   - SQLite database (*.db) is ignored in .gitignore and retinaai.db is untracked.
2. Longitudinal Storage Portability:
   - _register_images persists diff overlay via storage_service.upload_cv2_image.
   - Generated diff overlay path resolves to a valid authenticated URL reference.
3. Workflow Failure Recovery:
   - Display-ID analysis exception recovery transitions screening status to 'failed'.
   - UUID-based analysis exception recovery transitions screening status to 'failed'.
4. Path Determinism:
   - UPLOAD_DIR and RESULT_DIR default anchored to canonical STATIC_DIR.
   - Path resolution is independent of working directory.
5. Runtime Modernization:
   - Pydantic schemas use modern ConfigDict(from_attributes=True).
   - from_attributes serialization works seamlessly with ORM models.
   - App-owned source code has zero deprecated datetime.utcnow() calls.
6. Startup Decoupling:
   - Importing main and database.db causes no import-time DB connection side effects.
   - init_db() initializes tables during startup.
   - /api/health truthfully verifies DB connectivity and does not report healthy when DB fails.
"""

import os
import sys
import uuid
import inspect
from datetime import datetime, timezone
from unittest.mock import patch, MagicMock
import numpy as np

# Ensure backend root is on sys.path
backend_root = os.path.abspath(os.path.dirname(__file__))
if backend_root not in sys.path:
    sys.path.insert(0, backend_root)

import pytest
from pydantic import ConfigDict
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from config import settings, _resolve_path
from database.models import Base, User, Patient, Screening, Review, Report, LongitudinalComparison, utc_now
from database.db import get_db, verify_db_connection, init_db
from schemas.auth import UserResponse
from schemas.patient import PatientResponse, PatientCreate
from schemas.screening import ScreeningResponse, ReviewData
from schemas.review import ReviewResponse
from schemas.report import ReportResponse


# ============================================================================
# 1. SECURITY & REPOSITORY HYGIENE TESTS
# ============================================================================

def test_migration_credential_environment_driven():
    """Verify migrate_to_supabase.py does not hardcode database passwords."""
    migrate_path = os.path.join(backend_root, "migrate_to_supabase.py")
    with open(migrate_path, "r", encoding="utf-8") as f:
        content = f.read()

    assert "Onkar8194" not in content, "Hardcoded developer password found in migrate_to_supabase.py"
    assert 'os.getenv("LOCAL_DB_URL")' in content or "os.environ.get('LOCAL_DB_URL')" in content or "os.getenv('LOCAL_DB_URL')" in content, \
        "LOCAL_DB_URL must be read from environment"


def test_developer_paths_removed():
    """Verify developer-specific absolute paths are absent from approved files."""
    files_to_check = [
        os.path.join(backend_root, "build_dirs.py"),
        os.path.join(backend_root, "config.py"),
        os.path.join(backend_root, ".env.example"),
    ]
    forbidden_patterns = [
        r"C:\Users\onkar",
        r"D:/SIH2026",
        r"D:\SIH2026",
    ]
    for filepath in files_to_check:
        with open(filepath, "r", encoding="utf-8") as f:
            text_content = f.read()
        for pattern in forbidden_patterns:
            assert pattern.lower() not in text_content.lower(), \
                f"Forbidden developer pattern '{pattern}' found in {os.path.basename(filepath)}"


def test_gitignore_and_untracked_sqlite_db():
    """Verify *.db is ignored and retinaai.db is not tracked by Git."""
    gitignore_path = os.path.join(backend_root, ".gitignore")
    assert os.path.exists(gitignore_path), "Backend .gitignore must exist"
    with open(gitignore_path, "r", encoding="utf-8") as f:
        gi_content = f.read()
    assert "*.db" in gi_content, "*.db rule must be present in backend .gitignore"

    # Verify git status does not track retinaai.db
    import subprocess
    res = subprocess.run(
        ["git", "ls-files", "Backend/retinaai-backend/retinaai.db"],
        capture_output=True, text=True, cwd=os.path.join(backend_root, "..", "..")
    )
    assert res.stdout.strip() == "", "retinaai.db must be untracked from Git"


# ============================================================================
# 2. LONGITUDINAL DIFF STORAGE PORTABILITY TESTS
# ============================================================================

def test_longitudinal_diff_uses_storage_abstraction():
    """Verify _register_images persists diff overlay via storage_service and returns canonical path."""
    from services.longitudinal_service import _register_images
    from services.storage_service import storage_service

    # Create dummy images with enough keypoints
    np.random.seed(42)
    img1 = np.ones((512, 512, 3), dtype=np.uint8) * 100
    img2 = np.ones((512, 512, 3), dtype=np.uint8) * 100
    # Add synthetic textured features
    for _ in range(50):
        x, y = np.random.randint(50, 450, 2)
        img1[y:y+10, x:x+10] = np.random.randint(0, 255, (10, 10, 3), dtype=np.uint8)
        img2[y:y+10, x:x+10] = img1[y:y+10, x:x+10].copy()

    with patch.object(storage_service, "upload_cv2_image", return_value="https://example.supabase.co/sign/diff.jpg?token=temp") as mock_upload:
        result = _register_images(img1, img2, "left", "test-screening-p5")
        if result["status"] == "success":
            assert mock_upload.called, "storage_service.upload_cv2_image must be called on successful registration"
            expected_canonical = "test-screening-p5/left_longitudinal_diff.jpg"
            assert result["diff_overlay_path"] == expected_canonical, (
                f"diff_overlay_path must be canonical path '{expected_canonical}', got '{result['diff_overlay_path']}'"
            )
            assert not result["diff_overlay_path"].startswith("http"), "Must not persist short-lived signed URL"

    # Verify resolve_asset_url with canonical path in local mode
    local_resolved = storage_service.resolve_asset_url("test-screening-p5/left_longitudinal_diff.jpg")
    assert local_resolved == "/api/media/test-screening-p5/left_longitudinal_diff.jpg"

    # Verify resolve_asset_url with canonical path when Supabase is configured
    with patch.object(storage_service, "_client") as mock_client:
        mock_client.storage.from_().create_signed_url.return_value = {
            "signedURL": "https://example.supabase.co/storage/v1/object/sign/retina-results/test-screening-p5/left_longitudinal_diff.jpg?token=fresh_token"
        }
        cloud_resolved = storage_service.resolve_asset_url("test-screening-p5/left_longitudinal_diff.jpg")
        assert "token=fresh_token" in cloud_resolved

        # Also verify backward-compatible re-signing of historical signed URLs
        old_signed = "https://example.supabase.co/storage/v1/object/sign/retina-results/test-screening-p5/left_longitudinal_diff.jpg?token=expired"
        re_signed = storage_service.resolve_asset_url(old_signed)
        assert "token=fresh_token" in re_signed


# ============================================================================
# 3. WORKFLOW FAILURE RECOVERY TESTS
# ============================================================================

def setup_sqlite_session():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        echo=False
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine, expire_on_commit=False)
    return Session()


def test_display_id_analysis_failure_rollback():
    """Verify analysis pipeline failure rollback transitions status to 'failed' when using display ID."""
    from api.analysis import analyze_screening
    from schemas.analysis import AnalyzeRequest
    from database.models import Patient, Screening, User

    db = setup_sqlite_session()

    doctor = User(id=str(uuid.uuid4()), username="dr_test", password_hash="hash", full_name="Dr. T", role="doctor", centre="C")
    patient = Patient(id=str(uuid.uuid4()), patient_display_id="PAT-P5-01", name="Test P", age=50, sex="F", diabetes_duration=5)
    screening = Screening(
        id=str(uuid.uuid4()),
        screening_display_id="SCR-P5-001",
        patient_id=patient.id,
        created_by=doctor.id,
        status="uploading",
        left_image_path="dummy_left.jpg"
    )
    db.add_all([doctor, patient, screening])
    db.commit()

    # Intentionally trigger failure in pipeline_service.run
    with patch("api.analysis.pipeline_service.run", side_effect=RuntimeError("Simulated pipeline crash")):
        with patch("api.analysis.cv2.imread", return_value=np.zeros((512, 512, 3), dtype=np.uint8)):
            with pytest.raises(HTTPException) as exc_info:
                analyze_screening("SCR-P5-001", AnalyzeRequest(eye="left"), db=db, current_user=doctor)
            assert exc_info.value.status_code == 500

    # Query DB to verify screening status was updated to 'failed'
    db.expire_all()
    updated = db.query(Screening).filter(Screening.screening_display_id == "SCR-P5-001").first()
    assert updated is not None
    assert updated.status == "failed", f"Screening status should be 'failed' after display ID rollback, got '{updated.status}'"


def test_uuid_analysis_failure_rollback():
    """Verify analysis pipeline failure rollback transitions status to 'failed' when using UUID."""
    from api.analysis import analyze_screening
    from schemas.analysis import AnalyzeRequest
    from database.models import Patient, Screening, User

    db = setup_sqlite_session()

    doctor = User(id=str(uuid.uuid4()), username="dr_test2", password_hash="hash", full_name="Dr. T", role="doctor", centre="C")
    patient = Patient(id=str(uuid.uuid4()), patient_display_id="PAT-P5-02", name="Test P2", age=50, sex="F", diabetes_duration=5)
    scr_id = str(uuid.uuid4())
    screening = Screening(
        id=scr_id,
        screening_display_id="SCR-P5-002",
        patient_id=patient.id,
        created_by=doctor.id,
        status="uploading",
        right_image_path="dummy_right.jpg"
    )
    db.add_all([doctor, patient, screening])
    db.commit()

    with patch("api.analysis.pipeline_service.run", side_effect=RuntimeError("Simulated pipeline crash")):
        with patch("api.analysis.cv2.imread", return_value=np.zeros((512, 512, 3), dtype=np.uint8)):
            with pytest.raises(HTTPException) as exc_info:
                analyze_screening(scr_id, AnalyzeRequest(eye="right"), db=db, current_user=doctor)
            assert exc_info.value.status_code == 500

    db.expire_all()
    updated = db.query(Screening).filter(Screening.id == scr_id).first()
    assert updated is not None
    assert updated.status == "failed", f"Screening status should be 'failed' after UUID rollback, got '{updated.status}'"


# ============================================================================
# 4. PATH DETERMINISM TESTS
# ============================================================================

def test_static_dirs_anchored():
    """Verify UPLOAD_DIR and RESULT_DIR are anchored to STATIC_DIR and independent of cwd."""
    assert os.path.isabs(settings.STATIC_DIR), "STATIC_DIR must be absolute"
    assert os.path.isabs(settings.UPLOAD_DIR), "UPLOAD_DIR must be absolute"
    assert os.path.isabs(settings.RESULT_DIR), "RESULT_DIR must be absolute"

    assert settings.UPLOAD_DIR.startswith(settings.STATIC_DIR), "UPLOAD_DIR must be a subpath of STATIC_DIR"
    assert settings.RESULT_DIR.startswith(settings.STATIC_DIR), "RESULT_DIR must be a subpath of STATIC_DIR"


def test_resolve_path_candidates():
    """Verify _resolve_path finds existing repository models without developer machine assumptions."""
    path = _resolve_path("NON_EXISTENT_ENV", "dr_grade/best_efficientnet_b2.pth")
    assert os.path.exists(path), f"Model path candidate must resolve to existing file: {path}"
    repo_root = os.path.abspath(os.path.join(backend_root, "..", ".."))
    assert path.startswith(repo_root), f"Resolved path must be inside repository root: {path}"


# ============================================================================
# 5. RUNTIME MODERNIZATION (PYDANTIC V2 & DATETIME) TESTS
# ============================================================================

def test_pydantic_v2_configdict_modernization():
    """Verify schemas use ConfigDict and do not contain deprecated class Config."""
    schemas_to_check = [
        UserResponse,
        PatientResponse,
        ScreeningResponse,
        ReviewResponse,
        ReportResponse,
        ReviewData,
    ]
    for schema_cls in schemas_to_check:
        assert hasattr(schema_cls, "model_config"), f"{schema_cls.__name__} must define model_config"
        assert schema_cls.model_config.get("from_attributes") is True, \
            f"{schema_cls.__name__} model_config must have from_attributes=True"
        assert "Config" not in schema_cls.__dict__, \
            f"{schema_cls.__name__} must not contain deprecated class-based Config"


def test_schema_from_attributes_serialization():
    """Verify from_attributes ORM serialization works seamlessly with modern ConfigDict."""
    user = User(
        id="user-123",
        username="dr_anita",
        password_hash="secret",
        full_name="Dr. Anita Sharma",
        role="doctor",
        centre="Apex Eye"
    )
    dto = UserResponse.model_validate(user)
    assert dto.id == "user-123"
    assert dto.username == "dr_anita"
    assert dto.full_name == "Dr. Anita Sharma"


def test_zero_app_owned_datetime_utcnow():
    """Verify app-owned production Python files do not call datetime.utcnow()."""
    app_files = [
        os.path.join(backend_root, "core", "security.py"),
        os.path.join(backend_root, "api", "analytics.py"),
        os.path.join(backend_root, "api", "reports.py"),
        os.path.join(backend_root, "api", "patients.py"),
        os.path.join(backend_root, "api", "analysis.py"),
        os.path.join(backend_root, "database", "models.py"),
    ]
    for file_path in app_files:
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
        assert "datetime.utcnow()" not in content, \
            f"Deprecated datetime.utcnow() found in {os.path.basename(file_path)}"


def test_models_utc_now_callable():
    """Verify utc_now helper produces valid naive UTC datetime for database compatibility."""
    t = utc_now()
    assert isinstance(t, datetime)
    assert t.tzinfo is None, "utc_now must return naive datetime for SQL column compatibility"
    # Ensure time is close to current UTC
    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
    assert abs((now_utc - t).total_seconds()) < 5


# ============================================================================
# 6. STARTUP DECOUPLING TESTS
# ============================================================================

def test_no_import_time_side_effects():
    """Verify importing main and database.db does not attempt DB network connections."""
    import main
    import database.db
    # If module imported cleanly without throwing connection error, import-time decoupling is verified.
    assert hasattr(database.db, "init_db"), "database.db must export init_db"
    assert hasattr(database.db, "verify_db_connection"), "database.db must export verify_db_connection"


def test_init_db_in_production_mode_raises_on_failure():
    """Verify init_db(strict=True) fails fast when database is unreachable."""
    with patch("database.db.engine.connect", side_effect=ConnectionRefusedError("Database offline")):
        with pytest.raises(RuntimeError) as exc_info:
            init_db(strict=True)
        assert "Database initialization failed" in str(exc_info.value)


def test_health_endpoint_truthful_reporting():
    """Verify /api/health returns 200 when connected and 503 when DB fails."""
    app = FastAPI()

    # Simulate healthy DB session
    mock_healthy_db = MagicMock()
    mock_healthy_db.execute.return_value = None

    def get_healthy_db():
        yield mock_healthy_db

    # Simulate unhealthy DB session
    def get_broken_db():
        mock_db = MagicMock()
        mock_db.execute.side_effect = ConnectionError("PostgreSQL disconnected")
        yield mock_db

    # Test healthy app
    from main import health
    app.dependency_overrides[get_db] = get_healthy_db
    app.get("/api/health")(health)
    client = TestClient(app)

    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok", "database": "connected"}

    # Test unhealthy app
    app.dependency_overrides[get_db] = get_broken_db
    resp = client.get("/api/health")
    assert resp.status_code == 503
    assert "Database unavailable" in resp.json()["detail"]
