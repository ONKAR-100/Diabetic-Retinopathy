"""
Phase 4.6 Focused Test Suite: Clinical API Authentication & Role Protection

Tests:
1. Test 1: Authentication Dependency Enforcement (Unauthenticated, Invalid, Tampered, Expired Token -> 401)
2. Test 2: Valid Authentication for Health Worker and Doctor (200 OK on general clinical routes)
3. Test 3: Role Enforcement (Health worker attempting review queue or submission -> 403, Doctor permitted)
4. Test 4: Comprehensive Protected Route Coverage (Patients, Screenings, Analysis, Reports, Longitudinal, Analytics)
5. Test 5: Report API PDF Authentication Enforcement
"""

import os
import sys
import uuid
from datetime import datetime, timedelta

# Ensure backend root is on sys.path
backend_root = os.path.abspath(os.path.dirname(__file__))
if backend_root not in sys.path:
    sys.path.insert(0, backend_root)

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from jose import jwt

from config import settings
from database.models import Base, User, Patient, Screening, Review, Report, LongitudinalComparison
from database.db import get_db
from core.security import create_access_token, get_password_hash
from api import auth, patients, screenings, analysis, review, reports, analytics, longitudinal


def setup_test_environment():
    """Sets up an in-memory SQLite database and isolated FastAPI test application."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        echo=False
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine, expire_on_commit=False)

    app = FastAPI(title="RetinaAI Test App")

    def override_get_db():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    app.include_router(auth.router, prefix="/api/auth")
    app.include_router(patients.router, prefix="/api/patients")
    app.include_router(screenings.router, prefix="/api/screenings")
    app.include_router(analysis.router, prefix="/api/screenings")
    app.include_router(review.router, prefix="/api")
    app.include_router(reports.router, prefix="/api/reports")
    app.include_router(analytics.router, prefix="/api/analytics")
    app.include_router(longitudinal.router, prefix="/api")

    # Seed sample users and clinical data
    db = Session()

    doc_id = str(uuid.uuid4())
    doctor = User(
        id=doc_id,
        username="dr_sharma",
        password_hash=get_password_hash("doc123"),
        full_name="Dr. Anita Sharma",
        role="doctor",
        centre="Apex Eye Centre"
    )

    hw_id = str(uuid.uuid4())
    health_worker = User(
        id=hw_id,
        username="hw_rahul",
        password_hash=get_password_hash("hw123"),
        full_name="Rahul Verma",
        role="health_worker",
        centre="Primary Health Centre 4"
    )

    pat_id = str(uuid.uuid4())
    patient = Patient(
        id=pat_id,
        patient_display_id="PAT-406-001",
        name="Kavita Devi",
        age=52,
        sex="Female",
        diabetes_duration=7,
        previous_dr="None"
    )

    scr_id = str(uuid.uuid4())
    screening = Screening(
        id=scr_id,
        screening_display_id="SCR-406-001",
        patient_id=pat_id,
        created_by=hw_id,
        status="complete",
        review_status="pending",
        left_dr_grade=2,
        right_dr_grade=1,
        overall_referable=True,
        left_vessel_density=0.152,
        right_vessel_density=0.158
    )

    db.add_all([doctor, health_worker, patient, screening])
    db.commit()
    db.close()

    client = TestClient(app)
    return client, doctor, health_worker, patient, screening


def test_authentication_dependency_enforcement():
    """
    Test 1: Unauthenticated, invalid, tampered, or expired tokens receive 401 Unauthorized.
    """
    print("\n--- Test 1: Authentication Dependency Enforcement ---")
    client, doctor, health_worker, patient, screening = setup_test_environment()

    # 1. Unauthenticated request (no header)
    resp = client.get("/api/patients")
    assert resp.status_code == 401, f"Expected 401 without token, got {resp.status_code}"

    # 2. Invalid/malformed token
    resp = client.get("/api/patients", headers={"Authorization": "Bearer not-a-valid-jwt"})
    assert resp.status_code == 401, f"Expected 401 with malformed token, got {resp.status_code}"

    # 3. Tampered token (signed with wrong secret)
    tampered = jwt.encode({"sub": doctor.id, "role": doctor.role}, "wrong-secret-key", algorithm="HS256")
    resp = client.get("/api/patients", headers={"Authorization": f"Bearer {tampered}"})
    assert resp.status_code == 401, f"Expected 401 with tampered secret, got {resp.status_code}"

    # 4. Expired token
    expired = jwt.encode(
        {"sub": doctor.id, "role": doctor.role, "exp": datetime.utcnow() - timedelta(minutes=10)},
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM
    )
    resp = client.get("/api/patients", headers={"Authorization": f"Bearer {expired}"})
    assert resp.status_code == 401, f"Expected 401 with expired token, got {resp.status_code}"

    # 5. Token with non-existent user sub
    ghost_token = create_access_token(subject=str(uuid.uuid4()), role="doctor")
    resp = client.get("/api/patients", headers={"Authorization": f"Bearer {ghost_token}"})
    assert resp.status_code == 401, f"Expected 401 for non-existent user, got {resp.status_code}"

    print("[PASS] Test 1: Unauthenticated, malformed, tampered, and expired tokens strictly return 401.")


def test_valid_authentication_for_roles():
    """
    Test 2: Valid tokens permit health workers and doctors to access general clinical routes.
    """
    print("\n--- Test 2: Valid Authentication for Roles ---")
    client, doctor, health_worker, patient, screening = setup_test_environment()

    doc_token = create_access_token(subject=doctor.id, role=doctor.role)
    hw_token = create_access_token(subject=health_worker.id, role=health_worker.role)

    # Health worker accessing patient list
    resp_hw = client.get("/api/patients", headers={"Authorization": f"Bearer {hw_token}"})
    assert resp_hw.status_code == 200, f"Expected 200 for health_worker, got {resp_hw.status_code}"
    data = resp_hw.json()
    assert len(data) >= 1
    assert data[0]["name"] == "Kavita Devi"

    # Doctor accessing patient list
    resp_doc = client.get("/api/patients", headers={"Authorization": f"Bearer {doc_token}"})
    assert resp_doc.status_code == 200, f"Expected 200 for doctor, got {resp_doc.status_code}"

    # Verify /api/auth/me returns caller profile
    me_doc = client.get("/api/auth/me", headers={"Authorization": f"Bearer {doc_token}"})
    assert me_doc.status_code == 200
    assert me_doc.json()["username"] == "dr_sharma"
    assert me_doc.json()["role"] == "doctor"

    me_hw = client.get("/api/auth/me", headers={"Authorization": f"Bearer {hw_token}"})
    assert me_hw.status_code == 200
    assert me_hw.json()["username"] == "hw_rahul"
    assert me_hw.json()["role"] == "health_worker"

    print("[PASS] Test 2: Valid tokens for both doctor and health_worker successfully authenticate.")


def test_role_enforcement_for_clinical_review():
    """
    Test 3: Doctor role enforcement on review queue and review submission.
    - Health worker -> 403 Forbidden.
    - Doctor -> Permitted.
    """
    print("\n--- Test 3: Clinical Review Role Enforcement ---")
    client, doctor, health_worker, patient, screening = setup_test_environment()

    hw_token = create_access_token(subject=health_worker.id, role=health_worker.role)
    doc_token = create_access_token(subject=doctor.id, role=doctor.role)

    # 1. Health worker attempting to access review queue -> 403
    resp_queue_hw = client.get("/api/review/queue", headers={"Authorization": f"Bearer {hw_token}"})
    assert resp_queue_hw.status_code == 403, f"Expected 403 for health_worker on review queue, got {resp_queue_hw.status_code}"
    assert "Operation restricted to doctors" in resp_queue_hw.text

    # 2. Health worker attempting to submit clinical review -> 403
    payload = {
        "decision": "confirmed",
        "final_grade_left": 2,
        "final_grade_right": 1,
        "final_referable": True,
        "notes": "Unauthorized review attempt"
    }
    resp_sub_hw = client.post(
        f"/api/screenings/{screening.id}/review",
        json=payload,
        headers={"Authorization": f"Bearer {hw_token}"}
    )
    assert resp_sub_hw.status_code == 403, f"Expected 403 for health_worker on submit review, got {resp_sub_hw.status_code}"
    assert "Operation restricted to doctors" in resp_sub_hw.text

    # 3. Doctor accessing review queue -> 200 OK
    resp_queue_doc = client.get("/api/review/queue", headers={"Authorization": f"Bearer {doc_token}"})
    assert resp_queue_doc.status_code == 200, f"Expected 200 for doctor on review queue, got {resp_queue_doc.status_code}"

    # 4. Doctor submitting clinical review -> 200 OK
    resp_sub_doc = client.post(
        f"/api/screenings/{screening.id}/review",
        json=payload,
        headers={"Authorization": f"Bearer {doc_token}"}
    )
    assert resp_sub_doc.status_code == 200, f"Expected 200 for doctor submit review, got {resp_sub_doc.status_code}"
    assert "reviewed_at" in resp_sub_doc.json()

    print("[PASS] Test 3: Doctor role strictly enforced on review endpoints (403 for health worker, 200 for doctor).")


def test_protected_endpoint_coverage():
    """
    Test 4: Verify authentication is enforced across all 14 newly protected clinical routes:
    - Patients (4): GET /api/patients, GET /api/patients/{id}, POST /api/patients, DELETE /api/patients/{id}
    - Screenings (3): GET /api/screenings, GET /api/screenings/{id}, POST /api/screenings/{id}/upload
    - Analysis (2): POST /api/screenings/{id}/assess-quality, POST /api/screenings/{id}/analyze
    - Reports (2): GET /api/reports/{id}, POST /api/reports/{id}/generate
    - Longitudinal (2): GET /api/screenings/{id}/comparison, GET /api/patients/{id}/timeline
    - Analytics (1): GET /api/analytics/summary
    And verify pre-existing authenticated clinical routes remain protected:
    - Screenings (1): POST /api/screenings
    - Longitudinal (1): POST /api/screenings/{id}/compare
    """
    print("\n--- Test 4: Protected Endpoint Coverage ---")
    client, doctor, health_worker, patient, screening = setup_test_environment()

    token = create_access_token(subject=health_worker.id, role=health_worker.role)
    auth_header = {"Authorization": f"Bearer {token}"}

    # Exactly 14 newly protected clinical operations across all 7 target routers
    newly_protected_routes = [
        # Patients (4)
        ("GET", "/api/patients", None),
        ("GET", f"/api/patients/{patient.id}", None),
        ("POST", "/api/patients", {"name": "Test Unauth Patient", "age": 45, "sex": "Male"}),
        ("DELETE", f"/api/patients/{patient.id}", None),
        # Screenings (3)
        ("GET", "/api/screenings", None),
        ("GET", f"/api/screenings/{screening.id}", None),
        ("POST", f"/api/screenings/{screening.id}/upload", None),
        # Analysis (2)
        ("POST", f"/api/screenings/{screening.id}/assess-quality", {"eye": "left"}),
        ("POST", f"/api/screenings/{screening.id}/analyze", {"eye": "left"}),
        # Reports (2)
        ("GET", f"/api/reports/{screening.id}", None),
        ("POST", f"/api/reports/{screening.id}/generate", None),
        # Longitudinal (2)
        ("GET", f"/api/screenings/{screening.id}/comparison", None),
        ("GET", f"/api/patients/{patient.id}/timeline", None),
        # Analytics (1)
        ("GET", "/api/analytics/summary", None),
    ]
    assert len(newly_protected_routes) == 14, f"Expected 14 newly protected routes, got {len(newly_protected_routes)}"

    # Pre-existing authenticated routes that must remain protected
    pre_existing_authenticated_routes = [
        ("POST", "/api/screenings", {"patient_id": patient.id}),
        ("POST", f"/api/screenings/{screening.id}/compare", None),
    ]

    for method, path, body in newly_protected_routes + pre_existing_authenticated_routes:
        # Request WITHOUT authentication
        if method == "GET":
            unauth_resp = client.get(path)
        elif method == "POST":
            unauth_resp = client.post(path, json=body or {})
        elif method == "DELETE":
            unauth_resp = client.delete(path)
        else:
            raise ValueError(f"Unsupported HTTP method: {method}")

        assert unauth_resp.status_code == 401, (
            f"FAILED: Endpoint {method} {path} did NOT require authentication! Status: {unauth_resp.status_code}"
        )

    # Verify authenticated requests reach endpoint (status != 401)
    auth_patients = client.get("/api/patients", headers=auth_header)
    assert auth_patients.status_code == 200

    auth_patient = client.get(f"/api/patients/{patient.id}", headers=auth_header)
    assert auth_patient.status_code == 200

    auth_screenings = client.get("/api/screenings", headers=auth_header)
    assert auth_screenings.status_code == 200

    auth_screening = client.get(f"/api/screenings/{screening.id}", headers=auth_header)
    assert auth_screening.status_code == 200

    auth_timeline = client.get(f"/api/patients/{patient.id}/timeline", headers=auth_header)
    assert auth_timeline.status_code == 200

    auth_comparison = client.get(f"/api/screenings/{screening.id}/comparison", headers=auth_header)
    assert auth_comparison.status_code == 200

    auth_analytics = client.get("/api/analytics/summary", headers=auth_header)
    assert auth_analytics.status_code == 200

    print("[PASS] Test 4: All 14 newly protected clinical routes and 2 pre-existing routes strictly enforce authentication.")


def test_pdf_report_api_protection():
    """
    Test 5: Verify the report API requires authentication and does not accept unauthenticated GETs.
    """
    print("\n--- Test 5: Report PDF API Protection ---")
    client, doctor, health_worker, patient, screening = setup_test_environment()

    # Unauthenticated GET /api/reports/{screening_id} must return 401
    resp = client.get(f"/api/reports/{screening.id}")
    assert resp.status_code == 401, f"Expected 401 on /api/reports/{screening.id}, got {resp.status_code}"

    # Authenticated request reaches the endpoint handler
    token = create_access_token(subject=doctor.id, role=doctor.role)
    resp_auth = client.get(f"/api/reports/{screening.id}", headers={"Authorization": f"Bearer {token}"})
    # Will be 200/302 or 500/AttributeError if report buffer service is mock, but must NOT be 401!
    assert resp_auth.status_code != 401, f"Authenticated request should not be 401, got {resp_auth.status_code}"

    print("[PASS] Test 5: Report PDF endpoint strictly enforces authentication.")


if __name__ == "__main__":
    test_authentication_dependency_enforcement()
    test_valid_authentication_for_roles()
    test_role_enforcement_for_clinical_review()
    test_protected_endpoint_coverage()
    test_pdf_report_api_protection()
    print("\nALL PHASE 4.6 AUTHENTICATION & ROLE PROTECTION TESTS PASSED SUCCESSFULLY!")
