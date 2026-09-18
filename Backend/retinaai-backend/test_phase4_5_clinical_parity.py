"""
Phase 4.5 Focused Test Suite: Historical Biomarker Visibility & Longitudinal Clinical Ground-Truth Parity

Tests:
1. Test 1: Reviewed Grade Precedence
   - Verify longitudinal comparison prioritizes clinician authoritative final grades
     over raw AI Screening grades when a review is present.
   - Verify left and right eyes resolve independently without cross-over.
2. Test 2: Unreviewed Fallback
   - Verify previous screening without reviews safely falls back to Screening AI grades.
3. Test 3: Review Without Usable Final Grade Fallback
   - Verify fallback to AI grades when final grades are null/missing or flagged.
   - Verify mixed scenario (one eye has clinician final grade, other eye has null final grade).
4. Test 4: Analysis API Response Contract
   - Verify _screening_response includes previous_screening_id matching the Screening record.
"""

import os
import sys
import uuid
from datetime import datetime, timedelta

# Ensure backend root is on sys.path
backend_root = os.path.abspath(os.path.dirname(__file__))
if backend_root not in sys.path:
    sys.path.insert(0, backend_root)

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from database.models import Base, Patient, Screening, Review, User
from services.longitudinal_service import run_longitudinal_comparison, _get_effective_previous_grade
from api.analysis import _screening_response


def create_sqlite_session():
    """Creates an in-memory SQLite database session for unit testing."""
    engine = create_engine("sqlite:///:memory:", echo=False)
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    return Session()


def test_reviewed_grade_precedence():
    """
    TEST 1 — REVIEWED GRADE PRECEDENCE
    Create a previous Screening with known AI grades.
    Create the corresponding Review using actual valid decision ('modified' / 'confirmed')
    and final-grade fields.
    Verify longitudinal comparison uses the clinician final grades when authoritative.
    Verify both left and right eyes independently.
    """
    print("\n--- Test 1: Reviewed Grade Precedence ---")
    session = create_sqlite_session()

    doctor = User(
        id=str(uuid.uuid4()),
        username="dr_sharma",
        full_name="Dr. Anita Sharma",
        role="doctor"
    )
    patient = Patient(
        id=str(uuid.uuid4()),
        patient_display_id="PAT-405-001",
        name="Ramesh Kumar",
        age=58,
        sex="Male"
    )
    session.add_all([doctor, patient])
    session.commit()

    # Previous screening: AI detected Grade 1 (Left) and Grade 0 (Right)
    scr_prev = Screening(
        id=str(uuid.uuid4()),
        screening_display_id="SCR-PREV-001",
        patient_id=patient.id,
        status="complete",
        review_status="reviewed",
        left_dr_grade=1,
        right_dr_grade=0,
        left_vessel_density=0.150,
        right_vessel_density=0.155,
        created_at=datetime.utcnow() - timedelta(days=180)
    )
    session.add(scr_prev)
    session.commit()

    # Clinician review: clinician reclassified Left to Grade 3 (Severe NPDR) and Right to Grade 2 (Moderate NPDR)
    rev = Review(
        id=str(uuid.uuid4()),
        screening_id=scr_prev.id,
        reviewer_id=doctor.id,
        decision="modified",
        final_grade_left=3,
        final_grade_right=2,
        final_referable=True,
        notes="Clinician corrected DR grades based on venous beading in OS and IRMA in OD.",
        reviewed_at=datetime.utcnow() - timedelta(days=170),
        review_duration_seconds=65.0
    )
    session.add(rev)
    session.commit()
    session.refresh(scr_prev)

    # Verify helper directly
    assert _get_effective_previous_grade(scr_prev, "left") == 3, "Expected clinician modified grade 3 for left eye"
    assert _get_effective_previous_grade(scr_prev, "right") == 2, "Expected clinician modified grade 2 for right eye"

    # Current screening: AI detected Grade 3 (Left) and Grade 2 (Right)
    scr_curr = Screening(
        id=str(uuid.uuid4()),
        screening_display_id="SCR-CURR-001",
        patient_id=patient.id,
        status="complete",
        review_status="pending",
        left_dr_grade=3,
        right_dr_grade=2,
        left_vessel_density=0.148,
        right_vessel_density=0.152,
        created_at=datetime.utcnow(),
        previous_screening_id=scr_prev.id
    )
    session.add(scr_curr)
    session.commit()

    # Run longitudinal comparison
    result = run_longitudinal_comparison(scr_curr, scr_prev, session)

    # Previous grades MUST reflect clinician ground truth (3 and 2), NOT AI grades (1 and 0)
    assert result["left_grade_prev"] == 3, f"Expected left_grade_prev == 3, got {result['left_grade_prev']}"
    assert result["right_grade_prev"] == 2, f"Expected right_grade_prev == 2, got {result['right_grade_prev']}"

    # Current grades MUST remain raw Screening AI grades (never modified)
    assert result["left_grade_curr"] == 3, f"Expected left_grade_curr == 3, got {result['left_grade_curr']}"
    assert result["right_grade_curr"] == 2, f"Expected right_grade_curr == 2, got {result['right_grade_curr']}"

    # Because both eyes match the previous clinician grades (3->3 and 2->2), progression should be stable, not worsening
    assert result["progression_status"] == "stable", f"Expected stable progression, got {result['progression_status']}"

    print("[PASS] Test 1: Reviewed grade precedence correctly uses clinician ground truth for previous visit.")


def test_unreviewed_fallback():
    """
    TEST 2 — UNREVIEWED FALLBACK
    Create a previous Screening with known AI grades and no Review.
    Verify longitudinal comparison uses the Screening AI grades.
    """
    print("\n--- Test 2: Unreviewed Fallback ---")
    session = create_sqlite_session()

    patient = Patient(
        id=str(uuid.uuid4()),
        patient_display_id="PAT-405-002",
        name="Meera Sen",
        age=61,
        sex="Female"
    )
    session.add(patient)
    session.commit()

    # Previous screening without any Review
    scr_prev = Screening(
        id=str(uuid.uuid4()),
        screening_display_id="SCR-PREV-002",
        patient_id=patient.id,
        status="complete",
        review_status="pending",
        left_dr_grade=2,
        right_dr_grade=1,
        left_vessel_density=0.160,
        right_vessel_density=0.165,
        created_at=datetime.utcnow() - timedelta(days=200)
    )
    session.add(scr_prev)
    session.commit()
    session.refresh(scr_prev)

    # Verify helper directly
    assert _get_effective_previous_grade(scr_prev, "left") == 2
    assert _get_effective_previous_grade(scr_prev, "right") == 1

    # Current screening
    scr_curr = Screening(
        id=str(uuid.uuid4()),
        screening_display_id="SCR-CURR-002",
        patient_id=patient.id,
        status="complete",
        review_status="pending",
        left_dr_grade=3,
        right_dr_grade=1,
        left_vessel_density=0.155,
        right_vessel_density=0.162,
        created_at=datetime.utcnow(),
        previous_screening_id=scr_prev.id
    )
    session.add(scr_curr)
    session.commit()

    result = run_longitudinal_comparison(scr_curr, scr_prev, session)

    assert result["left_grade_prev"] == 2, f"Expected left_grade_prev == 2, got {result['left_grade_prev']}"
    assert result["right_grade_prev"] == 1, f"Expected right_grade_prev == 1, got {result['right_grade_prev']}"
    assert result["left_grade_curr"] == 3
    assert result["right_grade_curr"] == 1

    print("[PASS] Test 2: Unreviewed screening safely falls back to raw AI grades.")


def test_review_without_usable_final_grade():
    """
    TEST 3 — REVIEW WITHOUT USABLE FINAL GRADE
    In our data model, Review.final_grade_left and Review.final_grade_right are nullable=True.
    Verify fallback to Screening AI grades when:
    Case A: Review decision is 'flagged' with null final grades.
    Case B: Review decision is 'modified' but has a null final grade for one eye.
    """
    print("\n--- Test 3: Review Without Usable Final Grade Fallback ---")
    session = create_sqlite_session()

    doctor = User(
        id=str(uuid.uuid4()),
        username="dr_verma",
        full_name="Dr. Rajiv Verma",
        role="doctor"
    )
    patient = Patient(
        id=str(uuid.uuid4()),
        patient_display_id="PAT-405-003",
        name="Anand Joshi",
        age=52,
        sex="Male"
    )
    session.add_all([doctor, patient])
    session.commit()

    # Case A: Review is flagged, no final grades provided
    scr_prev_a = Screening(
        id=str(uuid.uuid4()),
        screening_display_id="SCR-PREV-003A",
        patient_id=patient.id,
        status="complete",
        review_status="reviewed",
        left_dr_grade=1,
        right_dr_grade=0,
        left_vessel_density=0.150,
        right_vessel_density=0.152,
        created_at=datetime.utcnow() - timedelta(days=120)
    )
    session.add(scr_prev_a)
    session.commit()

    rev_flagged = Review(
        id=str(uuid.uuid4()),
        screening_id=scr_prev_a.id,
        reviewer_id=doctor.id,
        decision="flagged",
        final_grade_left=None,
        final_grade_right=None,
        final_referable=None,
        notes="Media opacity, flagged for expert over-read.",
        reviewed_at=datetime.utcnow() - timedelta(days=110)
    )
    session.add(rev_flagged)
    session.commit()
    session.refresh(scr_prev_a)

    # Fallback to AI grades
    assert _get_effective_previous_grade(scr_prev_a, "left") == 1
    assert _get_effective_previous_grade(scr_prev_a, "right") == 0

    # Case B: Review is modified, but one eye is null (ungradable image)
    scr_prev_b = Screening(
        id=str(uuid.uuid4()),
        screening_display_id="SCR-PREV-003B",
        patient_id=patient.id,
        status="complete",
        review_status="reviewed",
        left_dr_grade=2,
        right_dr_grade=1,
        left_vessel_density=0.150,
        right_vessel_density=0.152,
        created_at=datetime.utcnow() - timedelta(days=150)
    )
    session.add(scr_prev_b)
    session.commit()

    rev_partial = Review(
        id=str(uuid.uuid4()),
        screening_id=scr_prev_b.id,
        reviewer_id=doctor.id,
        decision="modified",
        final_grade_left=None,  # Left eye ungradable / no change
        final_grade_right=3,   # Right eye modified to Grade 3
        final_referable=True,
        notes="Left eye poor quality; right eye reclassified to severe NPDR.",
        reviewed_at=datetime.utcnow() - timedelta(days=140)
    )
    session.add(rev_partial)
    session.commit()
    session.refresh(scr_prev_b)

    # Left eye falls back to AI grade 2, right eye uses clinician final grade 3
    assert _get_effective_previous_grade(scr_prev_b, "left") == 2
    assert _get_effective_previous_grade(scr_prev_b, "right") == 3

    # Longitudinal comparison with partial review
    scr_curr_b = Screening(
        id=str(uuid.uuid4()),
        screening_display_id="SCR-CURR-003B",
        patient_id=patient.id,
        status="complete",
        review_status="pending",
        left_dr_grade=2,
        right_dr_grade=3,
        created_at=datetime.utcnow(),
        previous_screening_id=scr_prev_b.id
    )
    session.add(scr_curr_b)
    session.commit()

    result_b = run_longitudinal_comparison(scr_curr_b, scr_prev_b, session)
    assert result_b["left_grade_prev"] == 2, "Left eye must fall back to AI grade 2"
    assert result_b["right_grade_prev"] == 3, "Right eye must use clinician modified grade 3"

    print("[PASS] Test 3: Null or unfinalized review grades safely fall back to AI grades independently.")


def test_analysis_response_contract():
    """
    TEST 4 — ANALYSIS RESPONSE CONTRACT
    Verify _screening_response includes previous_screening_id and that
    the value matches the Screening record (both when populated and when None).
    """
    print("\n--- Test 4: Analysis Response Contract ---")
    session = create_sqlite_session()

    patient = Patient(
        id=str(uuid.uuid4()),
        patient_display_id="PAT-405-004",
        name="Kiran Patel",
        age=45,
        sex="Male"
    )
    session.add(patient)
    session.commit()

    # Screening with previous_screening_id populated
    prev_id = str(uuid.uuid4())
    scr_with_prev = Screening(
        id=str(uuid.uuid4()),
        screening_display_id="SCR-405-004A",
        patient_id=patient.id,
        status="complete",
        review_status="pending",
        previous_screening_id=prev_id
    )
    session.add(scr_with_prev)
    session.commit()
    session.refresh(scr_with_prev)

    resp_a = _screening_response(scr_with_prev)
    assert "previous_screening_id" in resp_a, "Missing previous_screening_id in _screening_response"
    assert resp_a["previous_screening_id"] == prev_id, (
        f"Expected previous_screening_id == {prev_id}, got {resp_a['previous_screening_id']}"
    )

    # Screening without previous_screening_id (baseline)
    scr_baseline = Screening(
        id=str(uuid.uuid4()),
        screening_display_id="SCR-405-004B",
        patient_id=patient.id,
        status="complete",
        review_status="pending",
        previous_screening_id=None
    )
    session.add(scr_baseline)
    session.commit()
    session.refresh(scr_baseline)

    resp_b = _screening_response(scr_baseline)
    assert "previous_screening_id" in resp_b, "Missing previous_screening_id in _screening_response"
    assert resp_b["previous_screening_id"] is None, (
        f"Expected previous_screening_id is None, got {resp_b['previous_screening_id']}"
    )

    print("[PASS] Test 4: Analysis API _screening_response includes previous_screening_id correctly.")


if __name__ == "__main__":
    test_reviewed_grade_precedence()
    test_unreviewed_fallback()
    test_review_without_usable_final_grade()
    test_analysis_response_contract()
    print("\nALL PHASE 4.5 TESTS PASSED SUCCESSFULLY!")
