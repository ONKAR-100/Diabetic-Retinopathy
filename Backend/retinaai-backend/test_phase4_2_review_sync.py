"""
Phase 4.2 Focused Test Suite: Clinical Review Synchronization & Audit Trail Completeness

Tests:
1. Test 1: Review exists -> response contains persisted serialized Review (not None) with reviewer info, no secrets.
2. Test 2: No Review -> response contains review: None.
3. Test 3: Review update persistence -> latest review by reviewed_at is returned and reflected.
4. Test 4: Existing review endpoint compatibility -> submit_review updates review_status, links Review, and get_screening returns it.
5. Test 5: Live API Integration (when DATABASE_URL is configured) -> full end-to-end HTTP client test.
"""

import os
import sys
from datetime import datetime, timedelta
import uuid

# Ensure backend root is on sys.path
backend_root = os.path.abspath(os.path.dirname(__file__))
if backend_root not in sys.path:
    sys.path.insert(0, backend_root)

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from database.models import Base, Screening, Review, User, Patient
from api.screenings import map_screening_to_response, serialize_review, get_latest_review
from api.analysis import _screening_response
from api.review import submit_review
from schemas.review import ReviewCreate


def create_sqlite_session():
    """Creates an in-memory SQLite database session for unit testing."""
    engine = create_engine("sqlite:///:memory:", echo=False)
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    return Session()


def test_review_serialization_when_review_exists():
    """Test 1: When a review exists, serialized review is returned with reviewer name and no secrets."""
    print("\n--- Test 1: Review exists serialization ---")
    session = create_sqlite_session()

    doctor = User(
        id=str(uuid.uuid4()),
        username="dr_anita",
        password_hash="argon2$secret$hash",
        full_name="Dr. Anita Sharma",
        role="doctor",
        centre="Central Eye Clinic"
    )
    session.add(doctor)
    session.commit()

    patient = Patient(
        id=str(uuid.uuid4()),
        patient_display_id="PAT-402-001",
        name="Sunita Rao",
        age=56,
        sex="Female",
        diabetes_duration=10,
        previous_dr="None"
    )
    session.add(patient)
    session.commit()

    screening = Screening(
        id=str(uuid.uuid4()),
        screening_display_id="SCR-402-001",
        patient_id=patient.id,
        created_by=doctor.id,
        status="complete",
        review_status="reviewed",
        left_dr_grade=2,
        right_dr_grade=1,
        overall_referable=True,
        recommendation="Refer to ophthalmologist"
    )
    session.add(screening)
    session.commit()

    rev_time = datetime(2026, 9, 17, 10, 30, 0)
    review = Review(
        id=str(uuid.uuid4()),
        screening_id=screening.id,
        reviewer_id=doctor.id,
        decision="confirmed",
        final_grade_left=2,
        final_grade_right=1,
        final_referable=True,
        notes="[Pathway: Urgent Hospital Eye Service] [Priority: Immediate (within 2 weeks)] Verified microaneurysms.",
        reviewed_at=rev_time,
        review_duration_seconds=42.5
    )
    session.add(review)
    session.commit()

    # Refresh screening to load relationship
    session.refresh(screening)

    # Test map_screening_to_response
    resp = map_screening_to_response(screening)
    assert resp["review"] is not None, "FAILED: resp['review'] is None when Review exists!"
    rev_data = resp["review"]
    assert rev_data["id"] == review.id
    assert rev_data["reviewer_id"] == doctor.id
    assert rev_data["reviewer_name"] == "Dr. Anita Sharma"
    assert rev_data["decision"] == "confirmed"
    assert rev_data["final_grade_left"] == 2
    assert rev_data["final_grade_right"] == 1
    assert rev_data["final_referable"] is True
    assert "Urgent Hospital Eye Service" in rev_data["notes"]
    assert rev_data["review_duration_seconds"] == 42.5
    assert rev_data["reviewed_at"] == rev_time.isoformat()

    # Security check: verify no password_hash or secret credentials exposed
    assert "password" not in str(rev_data).lower(), "FAILED: password field leaked in review serialization!"
    assert "hash" not in str(rev_data).lower(), "FAILED: hash leaked in review serialization!"

    # Test _screening_response from analysis API
    analysis_resp = _screening_response(screening)
    assert analysis_resp["review"] is not None, "FAILED: analysis_resp['review'] is None!"
    assert analysis_resp["review"]["id"] == review.id
    assert analysis_resp["review"]["reviewer_name"] == "Dr. Anita Sharma"

    print("[PASS] Test 1: Review exists correctly serialized with reviewer details and zero secrets exposed.")


def test_review_serialization_when_no_review():
    """Test 2: When no review exists, review field is strictly None."""
    print("\n--- Test 2: No Review serialization ---")
    session = create_sqlite_session()

    patient = Patient(
        id=str(uuid.uuid4()),
        patient_display_id="PAT-402-002",
        name="Ramesh Patel",
        age=62,
        sex="Male",
        diabetes_duration=15,
        previous_dr="None"
    )
    session.add(patient)
    session.commit()

    screening = Screening(
        id=str(uuid.uuid4()),
        screening_display_id="SCR-402-002",
        patient_id=patient.id,
        status="uploaded",
        review_status="pending"
    )
    session.add(screening)
    session.commit()
    session.refresh(screening)

    # Test map_screening_to_response
    resp = map_screening_to_response(screening)
    assert resp["review"] is None, f"FAILED: resp['review'] should be None, got: {resp['review']}"

    # Test _screening_response from analysis API
    analysis_resp = _screening_response(screening)
    assert analysis_resp["review"] is None, f"FAILED: analysis_resp['review'] should be None, got: {analysis_resp['review']}"

    # Test serialize_review helper directly
    assert serialize_review(None) is None
    assert get_latest_review(screening) is None

    print("[PASS] Test 2: No Review strictly returns review: None.")


def test_review_update_persistence():
    """Test 3: Multiple/updated reviews return the latest review by reviewed_at."""
    print("\n--- Test 3: Review update persistence / Latest review ---")
    session = create_sqlite_session()

    doctor1 = User(
        id=str(uuid.uuid4()),
        username="dr_jain",
        full_name="Dr. Vikram Jain",
        role="doctor"
    )
    doctor2 = User(
        id=str(uuid.uuid4()),
        username="dr_mehta",
        full_name="Dr. Priya Mehta",
        role="doctor"
    )
    session.add_all([doctor1, doctor2])
    session.commit()

    patient = Patient(
        id=str(uuid.uuid4()),
        patient_display_id="PAT-402-003",
        name="Leela Devi",
        age=48,
        sex="Female"
    )
    session.add(patient)
    session.commit()

    screening = Screening(
        id=str(uuid.uuid4()),
        screening_display_id="SCR-402-003",
        patient_id=patient.id,
        status="complete",
        review_status="reviewed"
    )
    session.add(screening)
    session.commit()

    # Initial review by Dr. Jain
    t1 = datetime(2026, 9, 15, 9, 0, 0)
    rev1 = Review(
        id=str(uuid.uuid4()),
        screening_id=screening.id,
        reviewer_id=doctor1.id,
        decision="confirmed",
        final_grade_left=1,
        final_grade_right=1,
        final_referable=False,
        notes="Initial review: mild NPDR",
        reviewed_at=t1,
        review_duration_seconds=30.0
    )
    session.add(rev1)
    session.commit()

    # Subsequent updated review by Dr. Mehta
    t2 = datetime(2026, 9, 17, 14, 0, 0)
    rev2 = Review(
        id=str(uuid.uuid4()),
        screening_id=screening.id,
        reviewer_id=doctor2.id,
        decision="modified",
        final_grade_left=2,
        final_grade_right=1,
        final_referable=True,
        notes="Updated review: reclassified left eye to moderate NPDR.",
        reviewed_at=t2,
        review_duration_seconds=55.0
    )
    session.add(rev2)
    session.commit()

    session.refresh(screening)
    latest = get_latest_review(screening)
    assert latest is not None
    assert latest.id == rev2.id
    assert latest.reviewer_id == doctor2.id

    resp = map_screening_to_response(screening)
    assert resp["review"]["id"] == rev2.id
    assert resp["review"]["reviewer_name"] == "Dr. Priya Mehta"
    assert resp["review"]["decision"] == "modified"
    assert resp["review"]["final_referable"] is True
    assert "reclassified" in resp["review"]["notes"]

    print("[PASS] Test 3: Multiple/updated reviews correctly resolve to the latest review.")


def test_existing_review_endpoint_workflow():
    """Test 4: submit_review router logic creates Review, sets reviewed status, and links correctly."""
    print("\n--- Test 4: Existing review router workflow compatibility ---")
    session = create_sqlite_session()

    doctor = User(
        id=str(uuid.uuid4()),
        username="dr_sharma",
        full_name="Dr. Anita Sharma",
        role="doctor"
    )
    session.add(doctor)
    session.commit()

    patient = Patient(
        id=str(uuid.uuid4()),
        patient_display_id="PAT-402-004",
        name="Amitabh Sen",
        age=52,
        sex="Male"
    )
    session.add(patient)
    session.commit()

    screening = Screening(
        id=str(uuid.uuid4()),
        screening_display_id="SCR-402-004",
        patient_id=patient.id,
        status="uploaded",
        review_status="pending"
    )
    session.add(screening)
    session.commit()

    # Verify initially review is None
    init_resp = map_screening_to_response(screening)
    assert init_resp["review_status"] == "pending"
    assert init_resp["review"] is None

    # Call submit_review endpoint handler directly
    req = ReviewCreate(
        decision="confirmed",
        final_grade_left=2,
        final_grade_right=1,
        final_referable=True,
        notes="[Pathway: Urgent Hospital Eye Service] [Priority: Immediate (within 2 weeks)] Verified.",
        review_duration_seconds=45.0
    )
    created_rev = submit_review(
        id=screening.id,
        req=req,
        db=session,
        user=doctor
    )

    assert created_rev is not None
    assert created_rev.id is not None
    assert created_rev.screening_id == screening.id
    assert created_rev.reviewer_id == doctor.id

    # Refresh screening and verify review_status changed to 'reviewed'
    session.refresh(screening)
    assert screening.review_status == "reviewed"

    # Now verify map_screening_to_response reflects the submitted review!
    updated_resp = map_screening_to_response(screening)
    assert updated_resp["review_status"] == "reviewed"
    assert updated_resp["review"] is not None
    assert updated_resp["review"]["id"] == created_rev.id
    assert updated_resp["review"]["reviewer_name"] == "Dr. Anita Sharma"
    assert updated_resp["review"]["decision"] == "confirmed"

    print("[PASS] Test 4: submit_review workflow creates review and synchronizes with screening responses.")


def test_live_database_review_sync():
    """Test 5: Live Database & HTTP API Integration test via TestClient."""
    print("\n--- Test 5: Live Database / API Integration ---")
    try:
        from database.db import engine
        with engine.connect() as conn:
            pass
    except Exception as e:
        print(f"[SKIP] Live database connection unavailable: {e}. Skipping live PostgreSQL test.")
        return

    from fastapi.testclient import TestClient
    from main import app
    from database.db import SessionLocal

    db = SessionLocal()
    client = TestClient(app)

    test_scr_id = str(uuid.uuid4())
    test_user_id = str(uuid.uuid4())
    test_pat_id = str(uuid.uuid4())

    try:
        # Create test user
        test_user = User(
            id=test_user_id,
            username=f"test_doc_{test_user_id[:8]}",
            password_hash="test_secret_hash",
            full_name="Dr. Automated Test",
            role="doctor"
        )
        db.add(test_user)

        # Create test patient
        test_patient = Patient(
            id=test_pat_id,
            patient_display_id=f"PAT-LIVE-{test_pat_id[:8]}",
            name="Live Test Patient",
            age=50,
            sex="Female"
        )
        db.add(test_patient)

        # Create test screening
        test_screening = Screening(
            id=test_scr_id,
            screening_display_id=f"SCR-LIVE-{test_scr_id[:8]}",
            patient_id=test_pat_id,
            status="complete",
            review_status="pending"
        )
        db.add(test_screening)
        db.commit()

        # Step A: Query GET /api/screenings/{id} before review -> review should be None
        res1 = client.get(f"/api/screenings/{test_scr_id}")
        assert res1.status_code == 200, f"GET screening failed: {res1.text}"
        body1 = res1.json()
        assert body1["review_status"] == "pending"
        assert body1["review"] is None, f"Expected review: None, got: {body1['review']}"

        # Step B: Insert a review record into the live database
        test_review = Review(
            id=str(uuid.uuid4()),
            screening_id=test_scr_id,
            reviewer_id=test_user_id,
            decision="confirmed",
            final_grade_left=2,
            final_grade_right=0,
            final_referable=True,
            notes="Audit verified live database synchronization.",
            reviewed_at=datetime.utcnow(),
            review_duration_seconds=35.0
        )
        test_screening.review_status = "reviewed"
        db.add(test_review)
        db.commit()

        # Step C: Query GET /api/screenings/{id} after review -> review must be populated!
        res2 = client.get(f"/api/screenings/{test_scr_id}")
        assert res2.status_code == 200, f"GET screening failed: {res2.text}"
        body2 = res2.json()
        assert body2["review_status"] == "reviewed"
        assert body2["review"] is not None, "FAILED: review is None after live review insert!"
        assert body2["review"]["id"] == test_review.id
        assert body2["review"]["reviewer_name"] == "Dr. Automated Test"
        assert body2["review"]["decision"] == "confirmed"
        assert "password" not in str(body2["review"]).lower()

        print("[PASS] Test 5: Live Database review synchronization verified via HTTP API.")

    finally:
        # Cleanup
        try:
            db.query(Review).filter(Review.screening_id == test_scr_id).delete()
            db.query(Screening).filter(Screening.id == test_scr_id).delete()
            db.query(Patient).filter(Patient.id == test_pat_id).delete()
            db.query(User).filter(User.id == test_user_id).delete()
            db.commit()
        except Exception as e:
            db.rollback()
            print(f"[WARN] Cleanup error in Test 5: {e}")
        finally:
            db.close()


def run_all():
    print("=" * 70)
    print("PHASE 4.2 CLINICAL REVIEW SYNCHRONIZATION TEST SUITE")
    print("=" * 70)

    test_review_serialization_when_review_exists()
    test_review_serialization_when_no_review()
    test_review_update_persistence()
    test_existing_review_endpoint_workflow()
    test_live_database_review_sync()

    print("\n" + "=" * 70)
    print("ALL PHASE 4.2 TESTS COMPLETED SUCCESSFULLY!")
    print("=" * 70)


if __name__ == "__main__":
    run_all()
