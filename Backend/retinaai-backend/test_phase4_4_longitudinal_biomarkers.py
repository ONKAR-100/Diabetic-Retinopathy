"""
Phase 4.4 Focused Test Suite: Longitudinal Retinal Biomarker Persistence & Comparison

Tests:
1. Test 1: Baseline examination (no previous visit) -> progression_status="baseline",
   all _prev biomarker fields are None, current biomarker fields populated if present.
2. Test 2: Bilateral pairwise comparison with known values -> LongitudinalComparison
   correctly extracts and persists previous/current values for both eyes.
3. Test 3: Missing biomarker resilience -> missing values remain None, no fabricated zeroes,
   no crashes when one screening or one eye lacks biomarkers.
4. Test 4: API serialization -> _serialize_comparison exposes all new biomarker fields
   alongside existing vessel-density fields.
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

from database.models import Base, Patient, Screening, LongitudinalComparison, User
from services.longitudinal_service import run_longitudinal_comparison
from api.longitudinal import _serialize_comparison, _run_and_save_comparison


def create_sqlite_session():
    """Creates an in-memory SQLite database session for unit testing."""
    engine = create_engine("sqlite:///:memory:", echo=False)
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    return Session()


def test_baseline_examination():
    """Test 1: Baseline screening with no previous visit."""
    print("\n--- Test 1: Baseline Examination (No Previous Visit) ---")
    session = create_sqlite_session()

    patient = Patient(
        id=str(uuid.uuid4()),
        patient_display_id="PAT-404-001",
        name="Sunita Rao",
        age=56,
        sex="Female"
    )
    session.add(patient)
    session.commit()

    scr1 = Screening(
        id=str(uuid.uuid4()),
        screening_display_id="SCR-404-001",
        patient_id=patient.id,
        status="complete",
        left_dr_grade=1,
        right_dr_grade=0,
        left_vessel_density=0.145,
        right_vessel_density=0.150,
        left_avr=0.5201,
        right_avr=0.5402,
        left_tortuosity=0.0125,
        right_tortuosity=0.0118,
        left_fractal_dim=1.2150,
        right_fractal_dim=1.2340,
        created_at=datetime.utcnow() - timedelta(days=180)
    )
    session.add(scr1)
    session.commit()

    # Run comparison with previous_screening=None
    result = run_longitudinal_comparison(scr1, None, session)

    assert result["progression_status"] == "baseline", f"Expected baseline, got {result['progression_status']}"
    assert result["previous_screening_id"] is None

    # Verify all _prev fields are None
    for eye in ["left", "right"]:
        for metric in ["avr", "tortuosity", "fractal_dim"]:
            val_prev = result.get(f"{eye}_{metric}_prev")
            assert val_prev is None, f"Expected {eye}_{metric}_prev to be None, got {val_prev}"

    # Verify curr fields populated
    assert result["left_avr_curr"] == 0.5201
    assert result["right_avr_curr"] == 0.5402
    assert result["left_tortuosity_curr"] == 0.0125
    assert result["right_tortuosity_curr"] == 0.0118
    assert result["left_fractal_dim_curr"] == 1.2150
    assert result["right_fractal_dim_curr"] == 1.2340

    print("[PASS] Test 1: Baseline comparison preserves baseline progression status and handles biomarkers safely.")


def test_bilateral_pairwise_comparison():
    """Test 2: Pairwise comparison with known biomarker values for both eyes."""
    print("\n--- Test 2: Bilateral Pairwise Comparison with Known Biomarkers ---")
    session = create_sqlite_session()

    patient = Patient(
        id=str(uuid.uuid4()),
        patient_display_id="PAT-404-002",
        name="Ramesh Kumar",
        age=62,
        sex="Male"
    )
    session.add(patient)
    session.commit()

    scr1 = Screening(
        id=str(uuid.uuid4()),
        screening_display_id="SCR-404-002A",
        patient_id=patient.id,
        status="complete",
        left_dr_grade=0,
        right_dr_grade=0,
        left_vessel_density=0.145,
        right_vessel_density=0.152,
        left_avr=0.5000,
        right_avr=0.5500,
        left_tortuosity=0.0100,
        right_tortuosity=0.0120,
        left_fractal_dim=1.2000,
        right_fractal_dim=1.2500,
        created_at=datetime.utcnow() - timedelta(days=365)
    )
    session.add(scr1)
    session.commit()

    scr2 = Screening(
        id=str(uuid.uuid4()),
        screening_display_id="SCR-404-002B",
        patient_id=patient.id,
        status="complete",
        left_dr_grade=0,
        right_dr_grade=0,
        left_vessel_density=0.142,
        right_vessel_density=0.150,
        left_avr=0.4800,
        right_avr=0.5300,
        left_tortuosity=0.0110,
        right_tortuosity=0.0130,
        left_fractal_dim=1.1800,
        right_fractal_dim=1.2300,
        created_at=datetime.utcnow()
    )
    session.add(scr2)
    session.commit()

    comp = _run_and_save_comparison(scr2.id, session)

    assert comp is not None
    assert comp.current_screening_id == scr2.id
    assert comp.previous_screening_id == scr1.id

    # Verify Left Eye (OS) values
    assert comp.left_vessel_density_prev == 0.145
    assert comp.left_vessel_density_curr == 0.142
    assert comp.left_avr_prev == 0.5000
    assert comp.left_avr_curr == 0.4800
    assert comp.left_tortuosity_prev == 0.0100
    assert comp.left_tortuosity_curr == 0.0110
    assert comp.left_fractal_dim_prev == 1.2000
    assert comp.left_fractal_dim_curr == 1.1800

    # Verify Right Eye (OD) values
    assert comp.right_vessel_density_prev == 0.152
    assert comp.right_vessel_density_curr == 0.150
    assert comp.right_avr_prev == 0.5500
    assert comp.right_avr_curr == 0.5300
    assert comp.right_tortuosity_prev == 0.0120
    assert comp.right_tortuosity_curr == 0.0130
    assert comp.right_fractal_dim_prev == 1.2500
    assert comp.right_fractal_dim_curr == 1.2300

    print("[PASS] Test 2: Bilateral comparison accurately extracts and persists all 12 biomarker comparison columns.")


def test_missing_biomarker_resilience():
    """Test 3: Resilience to missing biomarkers across examinations and eyes."""
    print("\n--- Test 3: Missing Biomarkers and None-Handling Resilience ---")
    session = create_sqlite_session()

    patient = Patient(
        id=str(uuid.uuid4()),
        patient_display_id="PAT-404-003",
        name="Ananya Sen",
        age=48,
        sex="Female"
    )
    session.add(patient)
    session.commit()

    # Legacy screening with NO AVR, tortuosity, or fractal dimension
    scr1 = Screening(
        id=str(uuid.uuid4()),
        screening_display_id="SCR-404-003A",
        patient_id=patient.id,
        status="complete",
        left_dr_grade=0,
        right_dr_grade=0,
        left_vessel_density=0.140,
        right_vessel_density=0.145,
        left_avr=None,
        right_avr=None,
        left_tortuosity=None,
        right_tortuosity=None,
        left_fractal_dim=None,
        right_fractal_dim=None,
        created_at=datetime.utcnow() - timedelta(days=200)
    )
    session.add(scr1)
    session.commit()

    # Current screening with left eye biomarkers present, right eye missing (e.g. ungradable)
    scr2 = Screening(
        id=str(uuid.uuid4()),
        screening_display_id="SCR-404-003B",
        patient_id=patient.id,
        status="complete",
        left_dr_grade=0,
        right_dr_grade=0,
        left_vessel_density=0.142,
        right_vessel_density=None,
        left_avr=0.5120,
        right_avr=None,
        left_tortuosity=0.0115,
        right_tortuosity=None,
        left_fractal_dim=1.2050,
        right_fractal_dim=None,
        created_at=datetime.utcnow()
    )
    session.add(scr2)
    session.commit()

    comp = _run_and_save_comparison(scr2.id, session)

    assert comp is not None

    # Previous had None -> must be None, NOT 0.0
    assert comp.left_avr_prev is None
    assert comp.right_avr_prev is None
    assert comp.left_tortuosity_prev is None
    assert comp.right_tortuosity_prev is None
    assert comp.left_fractal_dim_prev is None
    assert comp.right_fractal_dim_prev is None

    # Current left has values
    assert comp.left_avr_curr == 0.5120
    assert comp.left_tortuosity_curr == 0.0115
    assert comp.left_fractal_dim_curr == 1.2050

    # Current right is None -> must remain None, NOT copied from left
    assert comp.right_avr_curr is None
    assert comp.right_tortuosity_curr is None
    assert comp.right_fractal_dim_curr is None

    print("[PASS] Test 3: Missing values remain None with zero cross-eye leakage or fabricated values.")


def test_api_serialization():
    """Test 4: API serialization of LongitudinalComparison."""
    print("\n--- Test 4: API Serialization of Biomarker Fields ---")

    comp = LongitudinalComparison(
        id="comp-404-test",
        patient_id="pat-404-test",
        previous_screening_id="scr-prev",
        current_screening_id="scr-curr",
        left_vessel_density_prev=0.145,
        left_vessel_density_curr=0.140,
        right_vessel_density_prev=0.150,
        right_vessel_density_curr=0.148,
        left_avr_prev=0.5200,
        left_avr_curr=0.4900,
        right_avr_prev=0.5400,
        right_avr_curr=0.5350,
        left_tortuosity_prev=0.0120,
        left_tortuosity_curr=0.0135,
        right_tortuosity_prev=0.0110,
        right_tortuosity_curr=0.0112,
        left_fractal_dim_prev=1.2200,
        left_fractal_dim_curr=1.2050,
        right_fractal_dim_prev=1.2400,
        right_fractal_dim_curr=1.2380,
        progression_status="stable",
        supporting_evidence=["OS (Left): DR grade unchanged at Grade 0"],
        created_at=datetime.utcnow()
    )

    serialized = _serialize_comparison(comp)

    assert serialized is not None
    # Existing vessel density
    assert serialized["left_vessel_density_prev"] == 0.145
    assert serialized["left_vessel_density_curr"] == 0.140
    assert serialized["right_vessel_density_prev"] == 0.150
    assert serialized["right_vessel_density_curr"] == 0.148

    # New biomarker fields
    assert serialized["left_avr_prev"] == 0.5200
    assert serialized["left_avr_curr"] == 0.4900
    assert serialized["right_avr_prev"] == 0.5400
    assert serialized["right_avr_curr"] == 0.5350

    assert serialized["left_tortuosity_prev"] == 0.0120
    assert serialized["left_tortuosity_curr"] == 0.0135
    assert serialized["right_tortuosity_prev"] == 0.0110
    assert serialized["right_tortuosity_curr"] == 0.0112

    assert serialized["left_fractal_dim_prev"] == 1.2200
    assert serialized["left_fractal_dim_curr"] == 1.2050
    assert serialized["right_fractal_dim_prev"] == 1.2400
    assert serialized["right_fractal_dim_curr"] == 1.2380

    print("[PASS] Test 4: _serialize_comparison outputs all 12 biomarker fields correctly with backward compatibility.")


def run_all_tests():
    print("=" * 70)
    print("PHASE 4.4 LONGITUDINAL BIOMARKER PERSISTENCE & COMPARISON TEST SUITE")
    print("=" * 70)

    test_baseline_examination()
    test_bilateral_pairwise_comparison()
    test_missing_biomarker_resilience()
    test_api_serialization()

    print("\n" + "=" * 70)
    print("ALL PHASE 4.4 TESTS COMPLETED SUCCESSFULLY!")
    print("=" * 70)


if __name__ == "__main__":
    run_all_tests()
