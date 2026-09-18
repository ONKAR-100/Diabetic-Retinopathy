"""
Phase 4.9 Focused Test Suite: Clinical Workflow Immutability, Failure Lifecycle, Storage Cleanup & Role Guards

Tests:
1. Reviewed screening immutability sequence (CLIN-02, CLIN-03):
   - Upload on reviewed screening rejected (409 Conflict).
   - Analysis on reviewed screening rejected (409 Conflict).
   - Quality assessment on reviewed screening rejected (409 Conflict).
   - Finalized clinical review state, grades, decision, and image paths remain completely unchanged.
2. Longitudinal indeterminate on missing previous clinical grades (CLIN-04):
   - When previous screening has no valid DR grades for either eye, progression is 'indeterminate', not 'stable'.
   - When valid grades exist, normal comparison functions as expected.
3. Analysis failure lifecycle transition (REL-04):
   - Unhandled pipeline failure transitions status to 'failed'.
   - Screening does NOT remain stuck in 'analyzing'.
   - Client receives a safe generic error without internal traceback leakage.
4. Storage artifact cleanup on patient deletion (DATA-01):
   - Patient deletion enumerates and deletes all associated media/artifacts via storage_service.delete_asset.
   - Nullable/empty asset paths handled safely.
   - DB records consistently deleted.
5. Doctor-only patient deletion authorization (AUTH-01):
   - Health worker rejected (403 Forbidden).
   - Unauthenticated rejected (401 Unauthorized).
   - Doctor allowed (200 OK).
6. Report regeneration timestamp freshness (REP-01):
   - Regenerating a report updates both pdf_path and generated_at to the latest timestamp.
"""

import os
import sys
import io
import uuid
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch
from PIL import Image

# Ensure backend root is on sys.path
backend_root = os.path.abspath(os.path.dirname(__file__))
if backend_root not in sys.path:
    sys.path.insert(0, backend_root)

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database.models import Base, User, Patient, Screening, Report, LongitudinalComparison, Review
from database.db import get_db
from core.security import create_access_token, get_password_hash
from services.storage_service import storage_service
from services.longitudinal_service import run_longitudinal_comparison
from api import auth, patients, screenings, analysis, reports, review, longitudinal


def get_valid_png_bytes(width=100, height=100):
    buf = io.BytesIO()
    img = Image.new("RGB", (width, height), color="green")
    img.save(buf, format="PNG")
    return buf.getvalue()


VALID_PNG = get_valid_png_bytes()


@pytest.fixture(scope="module")
def setup_env():
    """Sets up an in-memory SQLite database, seeded entities, and FastAPI TestClient."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        echo=False
    )
    Base.metadata.create_all(bind=engine)
    TestingSession = sessionmaker(bind=engine, expire_on_commit=False)

    app = FastAPI(title="RetinaAI Phase 4.9 Test App")

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
        username="dr_phase49",
        password_hash=get_password_hash("doctorpass"),
        full_name="Dr. Workflow Immutability",
        role="doctor"
    )
    hw = User(
        id=str(uuid.uuid4()),
        username="hw_phase49",
        password_hash=get_password_hash("hwpass"),
        full_name="HW Primary Care",
        role="health_worker"
    )
    patient = Patient(
        id=str(uuid.uuid4()),
        patient_display_id="PAT-49001",
        name="Phase 4.9 Patient",
        age=58,
        sex="Male",
        diabetes_duration=12
    )

    db.add_all([doctor, hw, patient])
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
    }


# ==============================================================================
# TEST 1: REVIEWED SCREENING IMMUTABILITY (CLIN-02, CLIN-03)
# ==============================================================================

def test_reviewed_screening_immutability(setup_env):
    """
    CLIN-02 & CLIN-03: Complete immutability sequence on a reviewed screening:
    1. Start with a reviewed screening containing finalized clinical data.
    2. Attempt image upload -> 409 Conflict.
    3. Attempt automated analysis -> 409 Conflict.
    4. Attempt quality assessment -> 409 Conflict.
    5. Verify review status, final grades, clinician decision, overall referable,
       and image paths remain strictly unchanged.
    """
    client = setup_env["client"]
    token = setup_env["doctor_token"]
    TestingSession = setup_env["TestingSession"]
    patient = setup_env["patient"]

    db = TestingSession()

    # 1. Create a finalized/reviewed screening
    scr = Screening(
        id=str(uuid.uuid4()),
        screening_display_id="SCR-IMMUTABLE-01",
        patient_id=patient.id,
        status="completed",
        review_status="reviewed",
        left_image_path="uploads/final_left.png",
        right_image_path="uploads/final_right.png",
        left_dr_grade=1,
        right_dr_grade=0,
        recommendation="Refer to ophthalmologist within 2 weeks",
        overall_referable=True
    )
    rev = Review(
        id=str(uuid.uuid4()),
        screening_id=scr.id,
        reviewer_id=setup_env["doctor"].id,
        decision="modified",
        final_grade_left=3,
        final_grade_right=2,
        final_referable=True,
        notes="Refer to ophthalmologist within 2 weeks"
    )
    db.add_all([scr, rev])
    db.commit()

    scr_id = scr.id

    # 2. Attempt image upload on reviewed screening -> HTTP 409 Conflict
    res_upload = client.post(
        f"/api/screenings/{scr_id}/upload",
        headers={"Authorization": f"Bearer {token}"},
        data={"eye": "left"},
        files={"file": ("new_image.png", VALID_PNG, "image/png")}
    )
    assert res_upload.status_code == 409
    assert "clinical review" in res_upload.json()["detail"].lower()

    # 3. Attempt automated analysis on reviewed screening -> HTTP 409 Conflict
    res_analyze = client.post(
        f"/api/screenings/{scr_id}/analyze",
        headers={"Authorization": f"Bearer {token}"},
        json={"eye": "both"}
    )
    assert res_analyze.status_code == 409
    assert "clinical review" in res_analyze.json()["detail"].lower()

    # 4. Attempt quality assessment on reviewed screening -> HTTP 409 Conflict
    res_quality = client.post(
        f"/api/screenings/{scr_id}/assess-quality",
        headers={"Authorization": f"Bearer {token}"},
        json={"eye": "both"}
    )
    assert res_quality.status_code == 409
    assert "clinical review" in res_quality.json()["detail"].lower()

    # 5. Verify all finalized clinical fields and image paths remain strictly unchanged
    db.expire_all()
    scr_after = db.query(Screening).filter(Screening.id == scr_id).first()
    rev_after = db.query(Review).filter(Review.screening_id == scr_id).first()

    assert scr_after.review_status == "reviewed"
    assert scr_after.status == "completed"
    assert scr_after.overall_referable is True
    assert scr_after.recommendation == "Refer to ophthalmologist within 2 weeks"
    assert scr_after.left_image_path == "uploads/final_left.png"
    assert scr_after.right_image_path == "uploads/final_right.png"
    assert rev_after.final_grade_left == 3
    assert rev_after.final_grade_right == 2
    assert rev_after.decision == "modified"
    assert rev_after.notes == "Refer to ophthalmologist within 2 weeks"


# ==============================================================================
# TEST 2: LONGITUDINAL INDETERMINATE (CLIN-04)
# ==============================================================================

def test_longitudinal_indeterminate_when_no_valid_prev_grade(setup_env):
    """
    CLIN-04: If neither eye in the previous screening has a valid DR grade,
    the longitudinal result must be 'indeterminate' rather than falsely 'stable'.
    """
    patient = setup_env["patient"]

    # Previous screening with no valid DR grades for either eye
    prev_scr = Screening(
        id=str(uuid.uuid4()),
        screening_display_id="SCR-PREV-UNGRADED",
        patient_id=patient.id,
        status="completed",
        left_dr_grade=None,
        right_dr_grade=None,
        created_at=datetime.utcnow() - timedelta(days=180)
    )

    # Current screening with valid grades
    curr_scr = Screening(
        id=str(uuid.uuid4()),
        screening_display_id="SCR-CURR-GRADED",
        patient_id=patient.id,
        status="completed",
        left_dr_grade=2,
        right_dr_grade=1,
        created_at=datetime.utcnow()
    )

    TestingSession = setup_env["TestingSession"]
    db = TestingSession()

    # Compute longitudinal comparison
    result = run_longitudinal_comparison(curr_scr, prev_scr, db)

    assert result["progression_status"] == "indeterminate"
    assert any("indeterminate" in ev.lower() for ev in result["supporting_evidence"]) or "indeterminate" in result["ai_explanation"].lower()

    # When previous screening HAS valid grades, verify standard evaluation is preserved
    prev_scr_valid = Screening(
        id=str(uuid.uuid4()),
        screening_display_id="SCR-PREV-VALID",
        patient_id=patient.id,
        status="completed",
        left_dr_grade=1,
        right_dr_grade=1,
        created_at=datetime.utcnow() - timedelta(days=180)
    )
    curr_scr_stable = Screening(
        id=str(uuid.uuid4()),
        screening_display_id="SCR-CURR-STABLE",
        patient_id=patient.id,
        status="completed",
        left_dr_grade=1,
        right_dr_grade=1,
        created_at=datetime.utcnow()
    )
    result_stable = run_longitudinal_comparison(curr_scr_stable, prev_scr_valid, db)
    assert result_stable["progression_status"] == "stable"


# ==============================================================================
# TEST 3: ANALYSIS FAILURE LIFECYCLE (REL-04)
# ==============================================================================

def test_analysis_failure_lifecycle(setup_env):
    """
    REL-04: An unhandled inference/analysis failure transitions screening status to 'failed'
    and persists it, rather than leaving it stuck in 'analyzing'.
    Client receives safe generic error without exposing raw exception.
    """
    import numpy as np

    client = setup_env["client"]
    token = setup_env["doctor_token"]
    TestingSession = setup_env["TestingSession"]
    patient = setup_env["patient"]

    db = TestingSession()

    scr = Screening(
        id=str(uuid.uuid4()),
        screening_display_id="SCR-FAIL-01",
        patient_id=patient.id,
        status="uploaded",
        left_image_path="uploads/test_fail_left.png",
        right_image_path=None
    )
    db.add(scr)
    db.commit()

    scr_id = scr.id

    dummy_bgr = np.zeros((100, 100, 3), dtype=np.uint8)

    # Mock cv2.imread and pipeline_service.run to raise an unexpected internal exception
    with patch("api.analysis.cv2.imread", return_value=dummy_bgr), \
         patch("api.analysis.pipeline_service.run", side_effect=RuntimeError("GPU OOM / Unhandled CUDA kernel crash")):
        res = client.post(
            f"/api/screenings/{scr_id}/analyze",
            headers={"Authorization": f"Bearer {token}"},
            json={"eye": "left"}
        )
        # Server returns 500
        assert res.status_code == 500
        # Client receives generic safe message, not raw internal trace
        assert "analysis pipeline failed" in res.json()["detail"].lower()
        assert "cuda kernel crash" not in res.json()["detail"].lower()

    # Verify database state was updated to 'failed' and NOT stuck in 'analyzing'
    db.expire_all()
    scr_db = db.query(Screening).filter(Screening.id == scr_id).first()
    assert scr_db.status == "failed"


# ==============================================================================
# TEST 4: PATIENT STORAGE CLEANUP (DATA-01)
# ==============================================================================

def test_patient_storage_cleanup(setup_env):
    """
    DATA-01: Deleting a patient deletes all associated clinical media/storage artifacts
    using storage_service.delete_asset across screenings, reports, and comparisons.
    """
    client = setup_env["client"]
    token = setup_env["doctor_token"]
    TestingSession = setup_env["TestingSession"]

    db = TestingSession()

    # Create dedicated patient
    pat = Patient(
        id=str(uuid.uuid4()),
        patient_display_id="PAT-CLEANUP-01",
        name="Cleanup Test Patient",
        age=60,
        sex="Female",
        diabetes_duration=10
    )
    db.add(pat)
    db.commit()

    # Add screening with comprehensive artifact paths
    scr = Screening(
        id=str(uuid.uuid4()),
        screening_display_id="SCR-CLEANUP-01",
        patient_id=pat.id,
        status="completed",
        left_image_path="uploads/left_pat.png",
        right_image_path="uploads/right_pat.png",
        left_gradcam_path="gradcam/left_gradcam.png",
        right_gradcam_path="gradcam/right_gradcam.png",
        left_vessel_mask_path="vessels/left_mask.png",
        right_vessel_mask_path="vessels/right_mask.png",
        left_vessel_overlay_path="vessels/left_overlay.png",
        right_vessel_overlay_path="vessels/right_overlay.png",
        left_od_fovea_overlay_path="od/left_od.png",
        right_od_fovea_overlay_path="od/right_od.png",
        left_lesion_result={"overlay_url": "lesions/left_lesion.png"},
        right_lesion_result={"overlay_path": "lesions/right_lesion.png"},
    )
    db.add(scr)
    db.commit()

    # Add report
    rep = Report(
        id=str(uuid.uuid4()),
        screening_id=scr.id,
        pdf_path="reports/pat_report.pdf",
        generated_at=datetime.utcnow()
    )
    db.add(rep)

    # Add longitudinal comparison
    comp = LongitudinalComparison(
        id=str(uuid.uuid4()),
        patient_id=pat.id,
        current_screening_id=scr.id,
        previous_screening_id=None,
        left_diff_overlay_path="diffs/left_diff.png",
        right_diff_overlay_path="diffs/right_diff.png",
    )
    db.add(comp)
    db.commit()

    expected_assets = {
        "uploads/left_pat.png",
        "uploads/right_pat.png",
        "gradcam/left_gradcam.png",
        "gradcam/right_gradcam.png",
        "vessels/left_mask.png",
        "vessels/right_mask.png",
        "vessels/left_overlay.png",
        "vessels/right_overlay.png",
        "od/left_od.png",
        "od/right_od.png",
        "lesions/left_lesion.png",
        "lesions/right_lesion.png",
        "reports/pat_report.pdf",
        "diffs/left_diff.png",
        "diffs/right_diff.png",
    }

    deleted_assets = set()

    def mock_delete_asset(path):
        deleted_assets.add(path)
        return True

    pat_id = pat.id
    scr_id = scr.id
    rep_id = rep.id
    comp_id = comp.id

    with patch.object(storage_service, "delete_asset", side_effect=mock_delete_asset):
        res = client.delete(
            f"/api/patients/{pat_id}",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert res.status_code == 200
        assert res.json()["message"] == "Patient deleted successfully"

    # Verify all expected storage assets were passed to delete_asset
    assert expected_assets.issubset(deleted_assets)

    # Verify database records are gone
    db.expire_all()
    assert db.query(Patient).filter(Patient.id == pat_id).first() is None
    assert db.query(Screening).filter(Screening.id == scr_id).first() is None
    assert db.query(Report).filter(Report.id == rep_id).first() is None
    assert db.query(LongitudinalComparison).filter(LongitudinalComparison.id == comp_id).first() is None


# ==============================================================================
# TEST 5: DOCTOR-ONLY PATIENT DELETION (AUTH-01)
# ==============================================================================

def test_patient_deletion_doctor_only(setup_env):
    """
    AUTH-01: Patient deletion requires doctor role:
    - Health worker rejected (403 Forbidden).
    - Unauthenticated rejected (401 Unauthorized).
    - Doctor allowed (200 OK).
    """
    client = setup_env["client"]
    doctor_token = setup_env["doctor_token"]
    hw_token = setup_env["hw_token"]
    TestingSession = setup_env["TestingSession"]

    db = TestingSession()

    pat = Patient(
        id=str(uuid.uuid4()),
        patient_display_id="PAT-AUTH-01",
        name="Auth Test Patient",
        age=45,
        sex="Male",
        diabetes_duration=5
    )
    db.add(pat)
    db.commit()
    pat_id = pat.id

    # 1. Unauthenticated request -> 401
    res_unauth = client.delete(f"/api/patients/{pat_id}")
    assert res_unauth.status_code == 401

    # 2. Health worker request -> 403 Forbidden
    res_hw = client.delete(
        f"/api/patients/{pat_id}",
        headers={"Authorization": f"Bearer {hw_token}"}
    )
    assert res_hw.status_code == 403
    assert "doctor" in res_hw.json()["detail"].lower()

    # Ensure patient still exists in DB
    db.expire_all()
    assert db.query(Patient).filter(Patient.id == pat_id).first() is not None

    # 3. Doctor request -> 200 OK
    with patch.object(storage_service, "delete_asset", return_value=True):
        res_dr = client.delete(
            f"/api/patients/{pat_id}",
            headers={"Authorization": f"Bearer {doctor_token}"}
        )
        assert res_dr.status_code == 200

    # Ensure patient is now deleted
    db.expire_all()
    assert db.query(Patient).filter(Patient.id == pat_id).first() is None


# ==============================================================================
# TEST 6: REPORT TIMESTAMP FRESHNESS (REP-01)
# ==============================================================================

def test_report_timestamp_freshness(setup_env):
    """
    REP-01: Forced report regeneration updates both pdf_path and generated_at timestamp.
    """
    client = setup_env["client"]
    token = setup_env["doctor_token"]
    TestingSession = setup_env["TestingSession"]
    patient = setup_env["patient"]

    db = TestingSession()

    scr = Screening(
        id=str(uuid.uuid4()),
        screening_display_id="SCR-REP-FRESH",
        patient_id=patient.id,
        status="completed",
        left_dr_grade=2,
        right_dr_grade=1,
        overall_referable=True
    )
    db.add(scr)
    db.commit()

    # Initial report created in the past
    stale_timestamp = datetime.utcnow() - timedelta(hours=5)
    stale_pdf = "https://storage.retinaai.org/reports/stale_v1.pdf"
    rep = Report(
        id=str(uuid.uuid4()),
        screening_id=scr.id,
        pdf_path=stale_pdf,
        generated_at=stale_timestamp
    )
    db.add(rep)
    db.commit()

    new_pdf_url = "https://storage.retinaai.org/reports/fresh_v2.pdf"

    with patch("models_loader.loaders.report_service.generate_report_to_buffer") as mock_gen, \
         patch.object(storage_service, "upload_pdf_buffer", return_value=new_pdf_url):
        mock_gen.side_effect = lambda s, p, buf: buf.write(b"%PDF-1.4 Fresh Report Content")

        # Call generate endpoint
        res = client.post(
            f"/api/reports/{scr.id}/generate",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert res.status_code == 200
        data = res.json()
        assert data["pdf_url"] == new_pdf_url

    # Query DB and verify updated generated_at
    db.expire_all()
    rep_db = db.query(Report).filter(Report.screening_id == scr.id).first()
    assert rep_db.pdf_path == new_pdf_url
    assert rep_db.generated_at > stale_timestamp
    # Verify timestamp is within the last minute
    assert (datetime.utcnow() - rep_db.generated_at).total_seconds() < 60
