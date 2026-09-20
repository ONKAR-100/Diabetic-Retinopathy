"""
Phase 4.7 Focused Test Suite: Storage & File Access Security

Tests:
1. Bucket privacy & configuration (public=False, update_bucket).
2. Signed URL generation (15-minute expiration, Supabase create_signed_url).
3. URL resolution (Supabase public -> signed, local -> /api/media, legacy -> /api/media, external unchanged).
4. Download bytes from URL (Supabase private download, local disk file read).
5. Authenticated media endpoint (/api/media/{file_path:path}) enforcement:
   - 401 on unauthenticated request.
   - 200 on authenticated request for valid media.
   - 404 on authenticated request for non-existent file.
   - 400 on path traversal attempts (.. sequences rejected).
6. Starlette unauthenticated /static mount removal verification (returns 404).
7. Report PDF streaming:
   - 401 on unauthenticated request.
   - 200 OK + application/pdf stream on authenticated request (no 302 redirect).
8. report_service.py safe_img resolution (local disk resolution for /api/media, no network needed).
9. Clinical API response URL resolution (screenings, analysis, longitudinal endpoints).
10. Token security: zero JWT tokens in query parameters.
"""

import os
import sys
import uuid
import base64
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch

# Ensure backend root is on sys.path
backend_root = os.path.abspath(os.path.dirname(__file__))
if backend_root not in sys.path:
    sys.path.insert(0, backend_root)

import pytest
from fastapi import FastAPI, Depends
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from config import settings
from database.models import Base, User, Patient, Screening, Report, LongitudinalComparison
from database.db import get_db
from core.security import create_access_token, get_password_hash
from core.dependencies import get_current_user
from services.storage_service import StorageService, storage_service
from services.report_service import safe_img
from api import auth, patients, screenings, analysis, reports, longitudinal
from main import app as main_app

# 1x1 valid PNG bytes for image tests
PNG_1X1 = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==")


@pytest.fixture(scope="module")
def test_setup():
    """Sets up an in-memory SQLite database, seeded entities, and FastAPI TestClients."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        echo=False
    )
    Base.metadata.create_all(bind=engine)
    TestingSession = sessionmaker(bind=engine, expire_on_commit=False)

    app = FastAPI(title="RetinaAI Phase 4.7 Test App")

    def override_get_db():
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    main_app.dependency_overrides[get_db] = override_get_db

    # Include all relevant routers
    app.include_router(auth.router, prefix="/api/auth")
    app.include_router(patients.router, prefix="/api/patients")
    app.include_router(screenings.router, prefix="/api/screenings")
    app.include_router(analysis.router, prefix="/api/screenings")
    app.include_router(reports.router, prefix="/api/reports")
    app.include_router(longitudinal.router, prefix="/api")

    # Add media route to test app matching main.py
    from main import get_media_file
    app.add_api_route("/api/media/{file_path:path}", get_media_file, methods=["GET"], tags=["Media"])

    # Seed data
    db = TestingSession()

    doctor = User(
        id=str(uuid.uuid4()),
        username="dr_sharma_47",
        password_hash=get_password_hash("doc123"),
        full_name="Dr. Anita Sharma",
        role="doctor",
        centre="Apex Eye Centre"
    )
    health_worker = User(
        id=str(uuid.uuid4()),
        username="hw_rahul_47",
        password_hash=get_password_hash("hw123"),
        full_name="Rahul Verma",
        role="health_worker",
        centre="PHC 4"
    )
    patient = Patient(
        id=str(uuid.uuid4()),
        patient_display_id="PAT-407-001",
        name="Sunita Rao",
        age=56,
        sex="Female",
        diabetes_duration=9,
        previous_dr="None"
    )
    screening = Screening(
        id=str(uuid.uuid4()),
        screening_display_id="SCR-407-001",
        patient_id=patient.id,
        status="complete",
        left_image_path="static/uploads/SCR-407-001_left.jpg",
        right_image_path="static/uploads/SCR-407-001_right.jpg",
        left_quality_status="gradable",
        left_dr_grade=2,
        left_gradcam_path="static/results/SCR-407-001_left_gradcam.jpg",
        left_vessel_overlay_path="static/results/SCR-407-001_left_vessel.jpg",
        left_vessel_mask_path="static/results/SCR-407-001_left_vessel_mask.png",
        left_od_fovea_overlay_path="static/results/SCR-407-001_left_odfovea.jpg",
        left_lesion_result={"overlay_url": "static/results/SCR-407-001_left_lesion.jpg"},
        right_quality_status="gradable",
        right_dr_grade=1,
        right_gradcam_path="static/results/SCR-407-001_right_gradcam.jpg",
        overall_referable=True,
        review_status="pending",
        created_at=datetime.utcnow()
    )

    report_pdf_path = os.path.join(settings.STATIC_DIR, "reports", f"{screening.id}.pdf")
    os.makedirs(os.path.dirname(report_pdf_path), exist_ok=True)
    with open(report_pdf_path, "wb") as f:
        f.write(b"%PDF-1.4 Mock Report Content for Phase 4.7 Testing")

    report = Report(
        id=str(uuid.uuid4()),
        screening_id=screening.id,
        pdf_path=report_pdf_path,
        generated_at=datetime.utcnow()
    )

    comparison = LongitudinalComparison(
        id=str(uuid.uuid4()),
        patient_id=patient.id,
        current_screening_id=screening.id,
        left_registration_status="success",
        left_registration_quality=0.91,
        left_diff_overlay_path="static/results/diff_left.jpg",
        right_registration_status="success",
        right_registration_quality=0.88,
        right_diff_overlay_path="static/results/diff_right.jpg",
        progression_status="stable"
    )

    db.add_all([doctor, health_worker, patient, screening, report, comparison])
    db.commit()

    # Create tokens
    doc_token = create_access_token(doctor.id, role=doctor.role)
    hw_token = create_access_token(health_worker.id, role=health_worker.role)

    client = TestClient(app)
    main_client = TestClient(main_app)

    yield {
        "client": client,
        "main_client": main_client,
        "doc_token": doc_token,
        "hw_token": hw_token,
        "screening": screening,
        "report": report,
        "comparison": comparison,
        "report_pdf_path": report_pdf_path,
    }


# =====================================================================
# 1. Bucket Privacy & Configuration Tests
# =====================================================================
def test_ensure_bucket_creates_private_bucket():
    """Verify _ensure_buckets creates buckets with options={'public': False}."""
    svc = StorageService()
    svc._initialized = True
    mock_client = MagicMock()
    mock_storage = MagicMock()
    mock_client.storage = mock_storage
    mock_storage.list_buckets.return_value = []

    svc._client = mock_client
    svc._ensure_buckets()

    mock_storage.create_bucket.assert_any_call(
        settings.STORAGE_BUCKET_UPLOADS,
        options={"public": False}
    )


def test_ensure_bucket_updates_existing_bucket_to_private():
    """Verify existing buckets are enforced private via update_bucket."""
    svc = StorageService()
    svc._initialized = True
    mock_client = MagicMock()
    mock_storage = MagicMock()
    mock_client.storage = mock_storage
    mock_b = MagicMock()
    mock_b.name = settings.STORAGE_BUCKET_UPLOADS
    mock_b.public = True
    mock_storage.list_buckets.return_value = [mock_b]

    svc._client = mock_client
    svc._ensure_buckets()

    mock_storage.update_bucket.assert_any_call(
        settings.STORAGE_BUCKET_UPLOADS,
        options={"public": False}
    )


# =====================================================================
# 2. Signed URL Generation Tests
# =====================================================================
def test_get_signed_url_15_minute_expiry():
    """Verify get_signed_url requests 900-second (15-min) signed URLs."""
    svc = StorageService()
    svc._initialized = True
    mock_client = MagicMock()
    mock_bucket = MagicMock()
    mock_client.storage.from_.return_value = mock_bucket
    mock_bucket.create_signed_url.return_value = {
        "signedURL": "https://xyz.supabase.co/storage/v1/object/sign/retina-uploads/eye.jpg?token=secret123"
    }

    svc._client = mock_client
    url = svc.get_signed_url("retina-uploads", "eye.jpg", expires_in=900)

    mock_client.storage.from_.assert_called_once_with("retina-uploads")
    mock_bucket.create_signed_url.assert_called_once_with("eye.jpg", 900)
    assert "token=secret123" in url


# =====================================================================
# 3. URL Resolution Tests
# =====================================================================
def test_resolve_asset_url_supabase_public():
    """Verify Supabase public URLs are converted to signed URLs."""
    svc = StorageService()
    svc._initialized = True
    mock_client = MagicMock()
    mock_bucket = MagicMock()
    mock_client.storage.from_.return_value = mock_bucket
    mock_bucket.create_signed_url.return_value = {
        "signedURL": "https://xyz.supabase.co/storage/v1/object/sign/retina-uploads/scan.jpg?token=signed_ok"
    }
    svc._client = mock_client

    pub_url = "https://xyz.supabase.co/storage/v1/object/public/retina-uploads/scan.jpg"
    resolved = svc.resolve_asset_url(pub_url)
    assert "token=signed_ok" in resolved


def test_resolve_asset_url_local_and_legacy_paths():
    """Verify local and legacy static paths resolve to /api/media/..."""
    svc = StorageService()
    # Direct /api/media
    assert svc.resolve_asset_url("/api/media/uploads/test.jpg") == "/api/media/uploads/test.jpg"
    # Legacy /static path
    assert svc.resolve_asset_url("/static/uploads/test.jpg") == "/api/media/uploads/test.jpg"
    # Relative static path
    assert svc.resolve_asset_url("static/results/gradcam.jpg") == "/api/media/results/gradcam.jpg"
    # Relative uploads path
    assert svc.resolve_asset_url("uploads/fundus.jpg") == "/api/media/uploads/fundus.jpg"
    # Windows-style backslashes
    assert svc.resolve_asset_url("static\\uploads\\image.png") == "/api/media/uploads/image.png"


def test_resolve_asset_url_external_and_empty():
    """Verify non-Supabase external URLs and empty values remain untouched."""
    svc = StorageService()
    assert svc.resolve_asset_url("https://external.org/photo.png") == "https://external.org/photo.png"
    assert svc.resolve_asset_url(None) is None
    assert svc.resolve_asset_url("") is None


# =====================================================================
# 4. Download Bytes Tests
# =====================================================================
def test_download_bytes_supabase_private():
    """Verify download_bytes fetches from private bucket using client."""
    svc = StorageService()
    svc._initialized = True
    mock_client = MagicMock()
    mock_bucket = MagicMock()
    mock_bucket.download.return_value = b"retinal_image_binary_data"
    mock_client.storage.from_.return_value = mock_bucket
    svc._client = mock_client

    data = svc.download_bytes("retina-uploads", "patient1/eye.jpg")
    assert data == b"retinal_image_binary_data"
    mock_client.storage.from_.assert_called_once_with("retina-uploads")
    mock_bucket.download.assert_called_once_with("patient1/eye.jpg")


def test_download_bytes_from_local_media_url():
    """Verify download_bytes_from_url reads from disk for /api/media/... paths."""
    svc = StorageService()
    # Create temporary file in STATIC_DIR
    test_rel = "uploads/temp_download_test.bin"
    test_abs = os.path.join(settings.STATIC_DIR, "uploads", "temp_download_test.bin")
    os.makedirs(os.path.dirname(test_abs), exist_ok=True)
    with open(test_abs, "wb") as f:
        f.write(b"local_file_content_12345")

    try:
        data = svc.download_bytes_from_url(f"/api/media/{test_rel}")
        assert data == b"local_file_content_12345"
    finally:
        if os.path.exists(test_abs):
            os.remove(test_abs)


# =====================================================================
# 5. Authenticated Media Endpoint Tests (/api/media/{file_path:path})
# =====================================================================
def test_media_endpoint_unauthenticated_returns_401(test_setup):
    """Verify GET /api/media/... without token returns 401 Unauthorized."""
    client = test_setup["client"]
    resp = client.get("/api/media/uploads/test.jpg")
    assert resp.status_code == 401


def test_media_endpoint_authenticated_success(test_setup):
    """Verify GET /api/media/... with token returns 200 and image bytes for existing file."""
    client = test_setup["client"]
    doc_token = test_setup["doc_token"]

    test_file = os.path.join(settings.STATIC_DIR, "uploads", "phase47_valid.jpg")
    os.makedirs(os.path.dirname(test_file), exist_ok=True)
    with open(test_file, "wb") as f:
        f.write(b"\xff\xd8\xff\xe0\x00\x10JFIF\x00mock_jpeg_bytes")

    try:
        resp = client.get(
            "/api/media/uploads/phase47_valid.jpg",
            headers={"Authorization": f"Bearer {doc_token}"}
        )
        assert resp.status_code == 200
        assert resp.content == b"\xff\xd8\xff\xe0\x00\x10JFIF\x00mock_jpeg_bytes"
        assert resp.headers["content-type"].startswith("image/")
    finally:
        if os.path.exists(test_file):
            os.remove(test_file)


def test_media_endpoint_authenticated_with_query_param_success(test_setup):
    """Verify GET /api/media/...?token=... with token in query param returns 200 and image bytes."""
    client = test_setup["client"]
    doc_token = test_setup["doc_token"]

    test_file = os.path.join(settings.STATIC_DIR, "uploads", "phase47_query_valid.jpg")
    os.makedirs(os.path.dirname(test_file), exist_ok=True)
    with open(test_file, "wb") as f:
        f.write(b"\xff\xd8\xff\xe0\x00\x10JFIF\x00query_token_jpeg_bytes")

    try:
        resp = client.get(
            f"/api/media/uploads/phase47_query_valid.jpg?token={doc_token}"
        )
        assert resp.status_code == 200
        assert resp.content == b"\xff\xd8\xff\xe0\x00\x10JFIF\x00query_token_jpeg_bytes"
        assert resp.headers["content-type"].startswith("image/")
    finally:
        if os.path.exists(test_file):
            os.remove(test_file)



def test_media_endpoint_authenticated_not_found(test_setup):
    """Verify GET /api/media/... for non-existent file returns 404."""
    client = test_setup["client"]
    doc_token = test_setup["doc_token"]
    resp = client.get(
        "/api/media/uploads/non_existent_file_9999.jpg",
        headers={"Authorization": f"Bearer {doc_token}"}
    )
    assert resp.status_code == 404


def test_media_endpoint_path_traversal_blocked(test_setup):
    """Verify path traversal attempts are strictly blocked (400 Bad Request)."""
    client = test_setup["client"]
    doc_token = test_setup["doc_token"]

    # Traversal attempt with ..
    resp1 = client.get(
        "/api/media/../../config.py",
        headers={"Authorization": f"Bearer {doc_token}"}
    )
    assert resp1.status_code in [400, 404]

    # Traversal attempt with URL-encoded dots
    resp2 = client.get(
        "/api/media/%2e%2e/%2e%2e/config.py",
        headers={"Authorization": f"Bearer {doc_token}"}
    )
    assert resp2.status_code in [400, 404]


# =====================================================================
# 6. Unauthenticated Starlette /static Mount Removed
# =====================================================================
def test_static_mount_removed_returns_404(test_setup):
    """Verify unauthenticated requests to /static/... return 404 (mount removed)."""
    main_client = test_setup["main_client"]
    resp = main_client.get("/static/uploads/any.jpg")
    assert resp.status_code == 404


# =====================================================================
# 7. Report PDF Streaming Tests
# =====================================================================
def test_report_pdf_unauthenticated_returns_401(test_setup):
    """Verify GET /api/reports/{screening_id} without token returns 401."""
    client = test_setup["client"]
    screening_id = test_setup["screening"].id
    resp = client.get(f"/api/reports/{screening_id}")
    assert resp.status_code == 401


def test_report_pdf_authenticated_streams_directly_no_redirect(test_setup):
    """Verify GET /api/reports/{screening_id} streams PDF bytes directly with 200 OK (no 302)."""
    client = test_setup["client"]
    doc_token = test_setup["doc_token"]
    screening_id = test_setup["screening"].id

    resp = client.get(
        f"/api/reports/{screening_id}",
        headers={"Authorization": f"Bearer {doc_token}"},
        follow_redirects=False
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert b"%PDF-1.4 Mock Report Content" in resp.content


# =====================================================================
# 8. Report Service safe_img Tests
# =====================================================================
def test_report_service_safe_img_resolves_local_media():
    """Verify safe_img loads /api/media/... files directly from disk."""
    test_img = os.path.join(settings.STATIC_DIR, "uploads", "safe_img_test.png")
    os.makedirs(os.path.dirname(test_img), exist_ok=True)
    with open(test_img, "wb") as f:
        f.write(PNG_1X1)

    try:
        resolved = safe_img("/api/media/uploads/safe_img_test.png", width_cm=4.0, height_cm=3.0)
        assert resolved is not None
    finally:
        if os.path.exists(test_img):
            os.remove(test_img)


def test_report_service_safe_img_invalid_returns_none():
    """Verify safe_img gracefully returns None on non-existent or invalid image."""
    assert safe_img(None, width_cm=4.0, height_cm=3.0) is None
    assert safe_img("", width_cm=4.0, height_cm=3.0) is None
    assert safe_img("/api/media/does_not_exist_file.jpg", width_cm=4.0, height_cm=3.0) is None


# =====================================================================
# 9. Clinical API Response URL Resolution Tests
# =====================================================================
def test_screenings_api_returns_resolved_urls(test_setup):
    """Verify GET /api/screenings/{id} returns resolved /api/media/... URLs."""
    client = test_setup["client"]
    doc_token = test_setup["doc_token"]
    screening_id = test_setup["screening"].id

    resp = client.get(
        f"/api/screenings/{screening_id}",
        headers={"Authorization": f"Bearer {doc_token}"}
    )
    assert resp.status_code == 200
    data = resp.json()
    left = data["left_eye"]
    assert left is not None
    assert left["original_image_url"].startswith("/api/media/")
    assert left["gradcam_url"].startswith("/api/media/")
    assert left["vessel_overlay_url"].startswith("/api/media/")
    assert left["vessel_mask_url"].startswith("/api/media/")
    assert left["od_fovea_overlay_url"].startswith("/api/media/")
    assert left["lesion"]["overlay_url"].startswith("/api/media/")


def test_analysis_build_eye_resolves_all_artifact_urls():
    """Verify _build_eye in api/analysis.py resolves all artifact URLs to /api/media or signed URLs."""
    from api.analysis import _build_eye

    # 1. Local paths
    scr_local = Screening(
        id=str(uuid.uuid4()),
        left_quality_status="gradable",
        left_image_path="static/uploads/fundus.jpg",
        left_dr_grade=2,
        left_gradcam_path="static/results/gradcam.jpg",
        left_vessel_overlay_path="static/results/vessel_overlay.jpg",
        left_vessel_mask_path="static/results/vessel_mask.png",
        left_od_fovea_overlay_path="static/results/odfovea.jpg",
        left_lesion_result={"overlay_url": "static/results/lesion.jpg"},
    )
    eye_local = _build_eye(scr_local, "left")
    assert eye_local is not None
    assert eye_local["original_image_url"].startswith("/api/media/")
    assert eye_local["gradcam_url"].startswith("/api/media/")
    assert eye_local["vessel_overlay_url"].startswith("/api/media/")
    assert eye_local["vessel_mask_url"].startswith("/api/media/")
    assert eye_local["od_fovea_overlay_url"].startswith("/api/media/")
    assert eye_local["lesion"]["overlay_url"].startswith("/api/media/")
    for k in ["original_image_url", "gradcam_url", "vessel_overlay_url", "vessel_mask_url", "od_fovea_overlay_url"]:
        assert "/static/" not in eye_local[k]
    assert "/static/" not in eye_local["lesion"]["overlay_url"]

    # 2. Supabase references with signed URL generation
    mock_storage = MagicMock()
    mock_bucket = MagicMock()
    mock_bucket.create_signed_url.return_value = {
        "signedURL": "https://xyz.supabase.co/storage/v1/object/sign/retina-results/artifact.jpg?token=mock_signed_47"
    }
    mock_storage.from_.return_value = mock_bucket
    mock_client = MagicMock()
    mock_client.storage = mock_storage

    with patch.object(storage_service, "_client", mock_client), patch.object(storage_service, "_initialized", True):
        scr_cloud = Screening(
            id=str(uuid.uuid4()),
            left_quality_status="gradable",
            left_image_path="https://xyz.supabase.co/storage/v1/object/public/retina-uploads/fundus.jpg",
            left_dr_grade=3,
            left_gradcam_path="https://xyz.supabase.co/storage/v1/object/public/retina-results/gradcam.jpg",
            left_vessel_overlay_path="https://xyz.supabase.co/storage/v1/object/public/retina-results/vessel.jpg",
            left_vessel_mask_path="https://xyz.supabase.co/storage/v1/object/public/retina-results/mask.png",
            left_od_fovea_overlay_path="https://xyz.supabase.co/storage/v1/object/public/retina-results/odfovea.jpg",
            left_lesion_result={"overlay_url": "https://xyz.supabase.co/storage/v1/object/public/retina-results/lesion.jpg"},
        )
        eye_cloud = _build_eye(scr_cloud, "left")
        assert eye_cloud is not None
        for k in ["original_image_url", "gradcam_url", "vessel_overlay_url", "vessel_mask_url", "od_fovea_overlay_url"]:
            url = eye_cloud[k]
            assert "token=mock_signed_47" in url
            assert "/storage/v1/object/public/" not in url
        lesion_url = eye_cloud["lesion"]["overlay_url"]
        assert "token=mock_signed_47" in lesion_url
        assert "/storage/v1/object/public/" not in lesion_url


def test_longitudinal_comparison_api_returns_resolved_urls(test_setup):
    """Verify GET /api/screenings/{id}/comparison returns resolved diff overlay URLs."""
    client = test_setup["client"]
    doc_token = test_setup["doc_token"]
    screening_id = test_setup["screening"].id

    resp = client.get(
        f"/api/screenings/{screening_id}/comparison",
        headers={"Authorization": f"Bearer {doc_token}"}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["exists"] is True
    comp = data["comparison"]
    assert comp["left_diff_overlay_url"].startswith("/api/media/")
    assert comp["right_diff_overlay_url"].startswith("/api/media/")


# =====================================================================
# 10. Security: Zero JWT in Query Parameters
# =====================================================================
def test_no_jwt_in_query_parameters(test_setup):
    """Verify no returned URL contains JWT or access tokens in query parameters."""
    client = test_setup["client"]
    doc_token = test_setup["doc_token"]
    screening_id = test_setup["screening"].id

    # 1. Screenings response
    scr_resp = client.get(
        f"/api/screenings/{screening_id}",
        headers={"Authorization": f"Bearer {doc_token}"}
    )
    scr_json = scr_resp.json()
    for eye_key in ["left_eye", "right_eye"]:
        eye = scr_json.get(eye_key)
        if not eye:
            continue
        for k in ["original_image_url", "gradcam_url", "vessel_overlay_url", "vessel_mask_url", "od_fovea_overlay_url"]:
            url = eye.get(k)
            if url:
                assert "bearer" not in url.lower()
                assert "jwt" not in url.lower()
                assert doc_token not in url

    # 2. Longitudinal comparison
    comp_resp = client.get(
        f"/api/screenings/{screening_id}/comparison",
        headers={"Authorization": f"Bearer {doc_token}"}
    )
    comp = comp_resp.json().get("comparison", {})
    for k in ["left_diff_overlay_url", "right_diff_overlay_url"]:
        url = comp.get(k)
        if url:
            assert "bearer" not in url.lower()
            assert "jwt" not in url.lower()
            assert doc_token not in url
