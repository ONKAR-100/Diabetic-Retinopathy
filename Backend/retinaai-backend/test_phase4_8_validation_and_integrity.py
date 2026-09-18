"""
Phase 4.8 Focused Test Suite: API Input Validation, Upload Hardening & Clinical Workflow Integrity

Tests:
1. Oversized upload rejected (413).
2. Upload implementation does not first read an arbitrarily large payload into memory (chunked read).
3. Unsupported extension rejected (415).
4. Invalid/mismatched magic bytes rejected (400).
5. Corrupt image rejected (400).
6. Excessive image dimensions rejected safely (400).
7. Invalid eye rejected (4xx).
8. Path traversal-style eye rejected (4xx).
9. Review decision validation (422).
10. Final DR grade bounds 0–4 (422).
11. Invalid patient age/duration rejected (422).
12. Pagination bounds (422).
13. Empty analysis rejected (400).
14. Review invalidates stale report.
15. Full report freshness sequence:
    initial AI report -> review override -> request report again -> verify current reviewed result.
16. DB rollback behavior.
17. Safe error messages do not expose raw storage exception details.
18. Longitudinal recomputation failure preserves prior comparison.
19. Insecure JWT secret rejection in production.
"""

import os
import sys
import io
import uuid
import base64
from datetime import datetime
from unittest.mock import MagicMock, patch, AsyncMock
from PIL import Image

# Ensure backend root is on sys.path
backend_root = os.path.abspath(os.path.dirname(__file__))
if backend_root not in sys.path:
    sys.path.insert(0, backend_root)

import pytest
from fastapi import FastAPI, UploadFile, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from config import settings
from database.models import Base, User, Patient, Screening, Report, LongitudinalComparison, Review
from database.db import get_db
from core.security import create_access_token, get_password_hash
from services.storage_service import StorageService, storage_service
from api import auth, patients, screenings, analysis, reports, review, longitudinal

# Generate valid 200x200 PNG bytes
def get_valid_png_bytes(width=200, height=200):
    buf = io.BytesIO()
    img = Image.new("RGB", (width, height), color="green")
    img.save(buf, format="PNG")
    return buf.getvalue()

VALID_PNG = get_valid_png_bytes(200, 200)

# Generate valid 200x200 JPEG bytes
def get_valid_jpeg_bytes(width=200, height=200):
    buf = io.BytesIO()
    img = Image.new("RGB", (width, height), color="red")
    img.save(buf, format="JPEG")
    return buf.getvalue()

VALID_JPEG = get_valid_jpeg_bytes(200, 200)


@pytest.fixture(scope="module")
def setup_env():
    """Sets up an in-memory SQLite database, seeded entities, and FastAPI TestClients."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        echo=False
    )
    Base.metadata.create_all(bind=engine)
    TestingSession = sessionmaker(bind=engine, expire_on_commit=False)

    app = FastAPI(title="RetinaAI Phase 4.8 Test App")

    def override_get_db():
        db = TestingSession()
        try:
            yield db
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    # Include all routers exactly matching main.py
    app.include_router(auth.router, prefix="/api/auth")
    app.include_router(patients.router, prefix="/api/patients")
    app.include_router(screenings.router, prefix="/api/screenings")
    app.include_router(analysis.router, prefix="/api/screenings")
    app.include_router(reports.router, prefix="/api/reports")
    app.include_router(review.router, prefix="/api")
    app.include_router(longitudinal.router, prefix="/api")

    db = TestingSession()

    doctor = User(
        id=str(uuid.uuid4()),
        username="dr_phase48",
        password_hash=get_password_hash("doctorpass"),
        full_name="Dr. Clinical Integrity",
        role="doctor"
    )
    hw = User(
        id=str(uuid.uuid4()),
        username="hw_phase48",
        password_hash=get_password_hash("hwpass"),
        full_name="HW Clinical Integrity",
        role="health_worker"
    )
    patient = Patient(
        id=str(uuid.uuid4()),
        patient_display_id="PAT-48001",
        name="Test Patient 48",
        age=52,
        sex="Female",
        diabetes_duration=8
    )
    screening = Screening(
        id=str(uuid.uuid4()),
        screening_display_id="SCR-48001",
        patient_id=patient.id,
        status="pending",
        left_dr_grade=1,
        right_dr_grade=1,
        overall_referable=False
    )

    db.add_all([doctor, hw, patient, screening])
    db.commit()

    doctor_token = create_access_token(doctor.id, role=doctor.role)
    hw_token = create_access_token(hw.id, role=hw.role)

    client = TestClient(app)

    return {
        "app": app,
        "client": client,
        "engine": engine,
        "TestingSession": TestingSession,
        "doctor_token": doctor_token,
        "hw_token": hw_token,
        "doctor": doctor,
        "hw": hw,
        "patient": patient,
        "screening": screening,
    }


# ==========================================
# 1 & 2. UPLOAD SIZE & CHUNKED READ (SEC-01)
# ==========================================

def test_oversized_upload_rejected(setup_env):
    """SEC-01: An upload exceeding MAX_UPLOAD_MB is immediately rejected with 413."""
    client = setup_env["client"]
    token = setup_env["doctor_token"]
    scr_id = setup_env["screening"].id

    with patch.object(settings, "MAX_UPLOAD_MB", 1):
        oversized_data = b"\xff\xd8\xff\xe0" + (b"0" * (1200 * 1024))
        res = client.post(
            f"/api/screenings/{scr_id}/upload",
            headers={"Authorization": f"Bearer {token}"},
            data={"eye": "left"},
            files={"file": ("test.jpg", oversized_data, "image/jpeg")}
        )
        assert res.status_code == 413
        assert "exceeds maximum allowed size" in res.json()["detail"].lower()


def test_chunked_upload_bounds_memory(setup_env):
    """SEC-01: Upload reading stops immediately once limit is crossed, not reading rest of file."""
    client = setup_env["client"]
    token = setup_env["doctor_token"]
    scr_id = setup_env["screening"].id

    read_calls = []
    from starlette.datastructures import UploadFile as StarletteUploadFile
    orig_read = StarletteUploadFile.read

    async def tracked_read(self, size=-1):
        read_calls.append(size)
        return await orig_read(self, size)

    with patch.object(settings, "MAX_UPLOAD_MB", 1), patch.object(StarletteUploadFile, "read", tracked_read):
        large_data = b"\xff\xd8\xff\xe0" + (b"B" * (5 * 1024 * 1024))
        res = client.post(
            f"/api/screenings/{scr_id}/upload",
            headers={"Authorization": f"Bearer {token}"},
            data={"eye": "left"},
            files={"file": ("test.jpg", large_data, "image/jpeg")}
        )
        assert res.status_code == 413
        # Should have stopped reading early (under 25 chunks) instead of all 80 chunks
        assert len(read_calls) < 25


# ==========================================
# 3. UNSUPPORTED EXTENSION (SEC-01)
# ==========================================

def test_unsupported_file_extension_rejected(setup_env):
    """SEC-01: Disallowed file extensions (.exe, .pdf, .txt, .bmp) are rejected with 415."""
    client = setup_env["client"]
    token = setup_env["doctor_token"]
    scr_id = setup_env["screening"].id

    for bad_filename in ["payload.exe", "document.pdf", "script.sh", "raw.bmp", "image.tiff"]:
        res = client.post(
            f"/api/screenings/{scr_id}/upload",
            headers={"Authorization": f"Bearer {token}"},
            data={"eye": "left"},
            files={"file": (bad_filename, VALID_PNG, "application/octet-stream")}
        )
        assert res.status_code == 415, f"Expected 415 for {bad_filename}, got {res.status_code}"
        assert "Unsupported file" in res.json()["detail"]


# ==========================================
# 4. MISMATCHED MAGIC BYTES (SEC-01)
# ==========================================

def test_mismatched_magic_bytes_rejected(setup_env):
    """SEC-01: A text or executable file renamed to .jpg/.png is rejected by magic byte check."""
    client = setup_env["client"]
    token = setup_env["doctor_token"]
    scr_id = setup_env["screening"].id

    fake_jpeg_content = b"MZ\x90\x00\x03\x00\x00\x00This is a fake PE executable"
    res = client.post(
        f"/api/screenings/{scr_id}/upload",
        headers={"Authorization": f"Bearer {token}"},
        data={"eye": "left"},
        files={"file": ("fundus.jpg", fake_jpeg_content, "image/jpeg")}
    )
    assert res.status_code == 400
    assert "file signature" in res.json()["detail"].lower()


# ==========================================
# 5. CORRUPT IMAGE REJECTION (SEC-01)
# ==========================================

def test_corrupt_image_rejected(setup_env):
    """SEC-01: Valid magic bytes followed by truncated/corrupt image data is rejected."""
    client = setup_env["client"]
    token = setup_env["doctor_token"]
    scr_id = setup_env["screening"].id

    corrupted_bytes = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00CORRUPT_BYTES_DATA"
    res = client.post(
        f"/api/screenings/{scr_id}/upload",
        headers={"Authorization": f"Bearer {token}"},
        data={"eye": "left"},
        files={"file": ("corrupt.jpg", corrupted_bytes, "image/jpeg")}
    )
    assert res.status_code == 400
    detail = res.json()["detail"].lower()
    assert "corrupt" in detail or "unreadable" in detail


# ==========================================
# 6. EXCESSIVE DIMENSIONS / BOMBS (SEC-01)
# ==========================================

def test_excessive_image_dimensions_rejected(setup_env):
    """SEC-01: Images exceeding MAX_IMAGE_WIDTH/HEIGHT or pixel limit are safely rejected."""
    client = setup_env["client"]
    token = setup_env["doctor_token"]
    scr_id = setup_env["screening"].id

    with patch("api.screenings.PILImage.open") as mock_open:
        mock_img = MagicMock()
        mock_img.size = (settings.MAX_IMAGE_WIDTH + 100, 1000)
        mock_open.return_value.__enter__.return_value = mock_img

        res = client.post(
            f"/api/screenings/{scr_id}/upload",
            headers={"Authorization": f"Bearer {token}"},
            data={"eye": "left"},
            files={"file": ("oversized.jpg", VALID_JPEG, "image/jpeg")}
        )
        assert res.status_code == 400
        assert "exceed maximum allowed" in res.json()["detail"].lower()


# ==========================================
# 7 & 8. STRICT EYE VALIDATION (SEC-02)
# ==========================================

def test_invalid_eye_rejected(setup_env):
    """SEC-02: Eye values other than 'left' or 'right' are rejected with 4xx."""
    client = setup_env["client"]
    token = setup_env["doctor_token"]
    scr_id = setup_env["screening"].id

    for invalid_eye in ["both", "center", "left_eye", "OD", "OS", ""]:
        res = client.post(
            f"/api/screenings/{scr_id}/upload",
            headers={"Authorization": f"Bearer {token}"},
            data={"eye": invalid_eye},
            files={"file": ("test.png", VALID_PNG, "image/png")}
        )
        assert res.status_code in (400, 422), f"Expected 4xx for eye='{invalid_eye}', got {res.status_code}"


def test_path_traversal_eye_rejected(setup_env):
    """SEC-02: Traversal sequences in eye parameter are rejected with 4xx."""
    client = setup_env["client"]
    token = setup_env["doctor_token"]
    scr_id = setup_env["screening"].id

    for traversal_eye in ["../left", "../../etc/passwd", "..\\right", "/left"]:
        res = client.post(
            f"/api/screenings/{scr_id}/upload",
            headers={"Authorization": f"Bearer {token}"},
            data={"eye": traversal_eye},
            files={"file": ("test.png", VALID_PNG, "image/png")}
        )
        assert res.status_code in (400, 422), f"Expected 4xx for eye='{traversal_eye}', got {res.status_code}"


# ==========================================
# 9 & 10. REVIEW SCHEMA VALIDATION (VAL-01)
# ==========================================

def test_review_decision_validation(setup_env):
    """VAL-01: Review decision must be 'confirmed', 'modified', or 'flagged'."""
    client = setup_env["client"]
    token = setup_env["doctor_token"]
    scr_id = setup_env["screening"].id

    # Invalid decision
    res = client.post(
        f"/api/screenings/{scr_id}/review",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "decision": "rejected",  # not in enum
            "final_referable": True,
            "notes": "Invalid decision"
        }
    )
    assert res.status_code == 422


def test_review_dr_grade_bounds(setup_env):
    """VAL-01: Final DR grades must be within [0, 4]."""
    client = setup_env["client"]
    token = setup_env["doctor_token"]
    scr_id = setup_env["screening"].id

    # Out of bounds grade (>4)
    res_high = client.post(
        f"/api/screenings/{scr_id}/review",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "decision": "modified",
            "final_grade_left": 5,
            "final_referable": True
        }
    )
    assert res_high.status_code == 422

    # Out of bounds grade (<0)
    res_low = client.post(
        f"/api/screenings/{scr_id}/review",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "decision": "modified",
            "final_grade_right": -1,
            "final_referable": False
        }
    )
    assert res_low.status_code == 422


# ==========================================
# 11. PATIENT SCHEMA VALIDATION (VAL-01)
# ==========================================

def test_patient_age_and_duration_bounds(setup_env):
    """VAL-01: Patient age must be 0-130 and diabetes duration 0-100."""
    client = setup_env["client"]
    token = setup_env["hw_token"]

    # Negative age
    res_neg_age = client.post(
        "/api/patients",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": "Baby Negative", "age": -2, "sex": "Male"}
    )
    assert res_neg_age.status_code == 422

    # Excessive age
    res_high_age = client.post(
        "/api/patients",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": "Methuselah", "age": 140, "sex": "Male"}
    )
    assert res_high_age.status_code == 422

    # Negative diabetes duration
    res_neg_dur = client.post(
        "/api/patients",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": "Valid Age", "age": 45, "sex": "Female", "diabetes_duration": -5.0}
    )
    assert res_neg_dur.status_code == 422

    # Excessive diabetes duration
    res_high_dur = client.post(
        "/api/patients",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": "Valid Age", "age": 45, "sex": "Female", "diabetes_duration": 105.0}
    )
    assert res_high_dur.status_code == 422


# ==========================================
# 12. PAGINATION BOUNDS (VAL-01)
# ==========================================

def test_pagination_bounds(setup_env):
    """VAL-01: Pagination page >= 1 and limit between 1 and 100."""
    client = setup_env["client"]
    token = setup_env["hw_token"]

    # page < 1
    res_zero_page = client.get("/api/screenings?page=0", headers={"Authorization": f"Bearer {token}"})
    assert res_zero_page.status_code == 422

    # limit > 100
    res_high_limit = client.get("/api/screenings?limit=101", headers={"Authorization": f"Bearer {token}"})
    assert res_high_limit.status_code == 422

    # limit < 1
    res_low_limit = client.get("/api/screenings?limit=0", headers={"Authorization": f"Bearer {token}"})
    assert res_low_limit.status_code == 422


# ==========================================
# 13. EMPTY ANALYSIS REJECTED (VAL-01)
# ==========================================

def test_empty_analysis_rejected(setup_env):
    """VAL-01: Analysis on a screening without uploaded images is rejected with 400."""
    client = setup_env["client"]
    token = setup_env["doctor_token"]
    TestingSession = setup_env["TestingSession"]
    patient = setup_env["patient"]

    db = TestingSession()
    empty_scr = Screening(
        id=str(uuid.uuid4()),
        screening_display_id="SCR-EMPTY",
        patient_id=patient.id,
        status="pending"
    )
    db.add(empty_scr)
    db.commit()

    res = client.post(
        f"/api/screenings/{empty_scr.id}/analyze",
        headers={"Authorization": f"Bearer {token}"},
        json={"eye": "left"}
    )
    assert res.status_code == 400
    assert "uploaded image" in res.json()["detail"].lower()


# ==========================================
# 14 & 15. REPORT FRESHNESS & INVALIDATION (CLIN-01)
# ==========================================

def test_review_invalidates_stale_report(setup_env):
    """CLIN-01: Submitting a review deletes the cached Report row and storage asset."""
    client = setup_env["client"]
    token = setup_env["doctor_token"]
    TestingSession = setup_env["TestingSession"]
    scr = setup_env["screening"]

    db = TestingSession()
    old_report = Report(
        id=str(uuid.uuid4()),
        screening_id=scr.id,
        pdf_path="static/reports/old_report.pdf",
        generated_at=datetime.utcnow()
    )
    db.add(old_report)
    db.commit()

    with patch.object(storage_service, "delete_asset", return_value=True) as mock_delete:
        res = client.post(
            f"/api/screenings/{scr.id}/review",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "decision": "modified",
                "final_grade_left": 3,
                "final_grade_right": 2,
                "final_referable": True,
                "notes": "Upgraded to referable DR"
            }
        )
        assert res.status_code == 200
        mock_delete.assert_called_once_with("static/reports/old_report.pdf")

    # Verify Report row was deleted from DB
    rep_in_db = db.query(Report).filter(Report.screening_id == scr.id).first()
    assert rep_in_db is None


def test_full_report_freshness_sequence(setup_env):
    """CLIN-01: End-to-end flow: AI report -> doctor review modified -> request report -> reviewed result returned."""
    client = setup_env["client"]
    token = setup_env["doctor_token"]
    TestingSession = setup_env["TestingSession"]
    patient = setup_env["patient"]

    db = TestingSession()
    scr = Screening(
        id=str(uuid.uuid4()),
        screening_display_id="SCR-CLIN-FRESH",
        patient_id=patient.id,
        status="completed",
        left_dr_grade=1,
        right_dr_grade=1,
        overall_referable=False
    )
    db.add(scr)
    db.commit()

    generated_reports = []

    def mock_gen_buffer(s, p, buf):
        latest_rev = max(s.reviews, key=lambda r: r.reviewed_at or datetime.min) if s.reviews else None
        left_grade = latest_rev.final_grade_left if latest_rev and latest_rev.final_grade_left is not None else s.left_dr_grade
        generated_reports.append({
            "left_grade": left_grade,
            "overall_referable": s.overall_referable,
            "is_reviewed": latest_rev is not None
        })
        buf.write(b"%PDF-1.4 Mock PDF Content")

    with patch("models_loader.loaders.report_service.generate_report_to_buffer", side_effect=mock_gen_buffer), \
         patch.object(storage_service, "upload_pdf_buffer", return_value="https://storage.retinaai.org/reports/report_v1.pdf"), \
         patch.object(storage_service, "download_bytes", return_value=b"%PDF-1.4 Mock PDF Content"), \
         patch.object(storage_service, "delete_asset", return_value=True) as mock_delete:

        # Initial report generation
        res1 = client.get(f"/api/reports/{scr.id}", headers={"Authorization": f"Bearer {token}"})
        assert res1.status_code == 200
        assert len(generated_reports) == 1
        assert generated_reports[0]["left_grade"] == 1
        assert generated_reports[0]["is_reviewed"] is False

        # Clinician reviews and modifies ground truth to grade 3
        res_rev = client.post(
            f"/api/screenings/{scr.id}/review",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "decision": "modified",
                "final_grade_left": 3,
                "final_referable": True,
                "notes": "Severe NPDR detected by clinician"
            }
        )
        assert res_rev.status_code == 200
        mock_delete.assert_called_once_with("https://storage.retinaai.org/reports/report_v1.pdf")

        # Request report again -> must regenerate with new reviewed ground truth
        res2 = client.get(f"/api/reports/{scr.id}", headers={"Authorization": f"Bearer {token}"})
        assert res2.status_code == 200
        assert len(generated_reports) == 2
        assert generated_reports[1]["left_grade"] == 3
        assert generated_reports[1]["overall_referable"] is True
        assert generated_reports[1]["is_reviewed"] is True


# ==========================================
# 16. DATABASE ROLLBACK BEHAVIOR (REL-02)
# ==========================================

def test_db_rollback_behavior():
    """REL-02: get_db executes db.rollback() when an exception occurs inside the generator."""
    mock_db = MagicMock()
    with patch("database.db.SessionLocal", return_value=mock_db):
        gen = get_db()
        db_instance = next(gen)
        assert db_instance == mock_db

        with pytest.raises(ValueError, match="simulated db error"):
            gen.throw(ValueError("simulated db error"))

        mock_db.rollback.assert_called_once()
        mock_db.close.assert_called_once()


# ==========================================
# 17. MASK INTERNAL STORAGE EXCEPTIONS (LEAK-01)
# ==========================================

def test_safe_error_messages_mask_storage_exceptions(setup_env):
    """LEAK-01: 500 error responses from storage failures mask sensitive paths and internal errors."""
    client = setup_env["client"]
    token = setup_env["doctor_token"]
    scr = setup_env["screening"]

    with patch.object(storage_service, "upload_pdf_buffer", side_effect=Exception("Database /root/secret/keys.env access failure")):
        res = client.get(f"/api/reports/{scr.id}", headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 500
        detail = res.json()["detail"]
        assert "/root/secret/keys.env" not in detail
        assert "Failed to save diagnostic report" in detail


# ==========================================
# 18. SAFE LONGITUDINAL RECOMPUTATION (REL-03)
# ==========================================

def test_longitudinal_recomputation_preserves_prior_comparison(setup_env):
    """REL-03: Failed recomputation does not destroy a previously valid LongitudinalComparison."""
    TestingSession = setup_env["TestingSession"]
    patient = setup_env["patient"]

    db = TestingSession()
    scr_base = Screening(
        id=str(uuid.uuid4()),
        screening_display_id="SCR-BASE-01",
        patient_id=patient.id,
        status="complete",
        left_dr_grade=0
    )
    scr_follow = Screening(
        id=str(uuid.uuid4()),
        screening_display_id="SCR-FOLLOW-01",
        patient_id=patient.id,
        previous_screening_id=scr_base.id,
        status="complete",
        left_dr_grade=2
    )
    db.add_all([scr_base, scr_follow])
    db.commit()

    prior_comp = LongitudinalComparison(
        id=str(uuid.uuid4()),
        patient_id=patient.id,
        previous_screening_id=scr_base.id,
        current_screening_id=scr_follow.id,
        progression_status="moderate_progression",
        left_grade_prev=0,
        left_grade_curr=2,
        supporting_evidence=["Historical valid comparison"]
    )
    db.add(prior_comp)
    db.commit()

    prior_id = prior_comp.id

    client = setup_env["client"]
    token = setup_env["doctor_token"]

    with patch("api.longitudinal.run_longitudinal_comparison", side_effect=RuntimeError("Biomarker compute failed")):
        res = client.post(
            f"/api/screenings/{scr_follow.id}/compare",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert res.status_code == 200
        data = res.json()
        assert data["id"] == prior_id
        assert data["progression_status"] == "moderate_progression"

    reloaded = db.query(LongitudinalComparison).filter(LongitudinalComparison.id == prior_id).first()
    assert reloaded is not None
    assert reloaded.progression_status == "moderate_progression"


# ==========================================
# 19. INSECURE JWT SECRET REJECTION (SEC-03)
# ==========================================

def test_jwt_insecure_default_rejected_in_production():
    """SEC-03: Known development secret raises RuntimeError in production mode."""
    from config import Settings

    with patch.dict(os.environ, {
        "ENVIRONMENT": "production",
        "JWT_SECRET_KEY": "your-super-secret-key-change-in-production"
    }):
        prod_settings = Settings()
        with pytest.raises(RuntimeError, match="JWT_SECRET_KEY must be explicitly configured"):
            prod_settings.validate_jwt_secret()

    with patch.dict(os.environ, {
        "ENVIRONMENT": "production",
        "JWT_SECRET_KEY": ""
    }):
        prod_settings = Settings()
        with pytest.raises(RuntimeError, match="JWT_SECRET_KEY must be explicitly configured"):
            prod_settings.validate_jwt_secret()
