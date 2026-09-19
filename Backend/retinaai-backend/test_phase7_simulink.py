"""
Phase 7 Focused Test Suite: Simulink Computational State-Space Modeling,
Canonical Normalization Contract v1.0.0, Database Persistence, and Fault Isolation.

Tests:
1. test_normalization_contract_v1:
   - Verifies exact canonical normalization v1.0.0 formulas and clamping.
2. test_normalization_reliability_weighting:
   - Verifies R^2 reliability weighting gates noisy fractal inputs.
3. test_normalization_rejects_invalid_inputs:
   - Verifies ValueError is raised for missing, NaN, Inf, and negative inputs.
4. test_simulink_service_reference_case:
   - Verifies 0455d569_left reference values match expected outputs.
5. test_simulink_service_zero_case:
   - Verifies baseline zero input yields expected analytical resting states.
6. test_simulink_service_saturated_case:
   - Verifies extreme inputs are strictly bounded to 1.0 without divergence.
7. test_simulink_service_invalid_input_isolation:
   - Verifies invalid input returns status='invalid_input' without exception.
8. test_simulink_service_disabled_mode:
   - Verifies disabled service returns status='disabled'.
9. test_database_persistence_and_relationships:
   - Verifies RetinalSimulation ORM instantiation, field persistence, and relationships.
10. test_database_cascade_delete:
    - Verifies deleting Patient or Screening cascade-deletes associated RetinalSimulation records.
"""
import os
import sys
import uuid
import pytest
from datetime import datetime, timezone
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

backend_root = os.path.abspath(os.path.dirname(__file__))
if backend_root not in sys.path:
    sys.path.insert(0, backend_root)

from database.models import Base, Patient, Screening, RetinalSimulation
from services.simulink_service import (
    SimulinkService,
    SimulinkSimulationResult,
    normalize_contract_v1,
    MODEL_NAME,
    MODEL_VERSION,
    SIMULATION_VERSION,
    CONTRACT_VERSION
)


@pytest.fixture
def in_memory_db():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


# ─────────────────────────────────────────────────────────────────────────────
# 1. Normalization Contract Tests
# ─────────────────────────────────────────────────────────────────────────────

def test_normalization_contract_v1():
    """Verify exact canonical normalization v1.0.0 arithmetic."""
    raw = {
        "vessel_density": 0.10,
        "branch_count": 250,
        "zone_b_count": 15,
        "mean_tortuosity_distance": 0.02,
        "mean_tortuosity_curvature": 0.15,
        "fractal_dimension": 1.025,
        "fractal_r_squared": 0.95,
    }
    raw_snap, norm = normalize_contract_v1(raw)

    assert norm["u_dens"] == pytest.approx(0.50, abs=1e-5)
    assert norm["u_branch"] == pytest.approx(0.50, abs=1e-5)
    assert norm["u_zb"] == pytest.approx(0.50, abs=1e-5)
    assert norm["u_taud"] == pytest.approx(0.50, abs=1e-5)
    assert norm["u_tauc"] == pytest.approx(0.50, abs=1e-5)
    assert norm["u_df_raw"] == pytest.approx(0.50, abs=1e-5)
    assert norm["w_fit"] == pytest.approx(0.50, abs=1e-5)
    assert norm["u_df_star"] == pytest.approx(0.50, abs=1e-5)


def test_normalization_reliability_weighting():
    """Verify that low R^2 pulls u_df_star towards 0.50 prior."""
    # R^2 <= 0.90 -> w_fit = 0 -> u_df_star = 0.50 regardless of noisy D_f
    noisy_low_fit = {
        "vessel_density": 0.08,
        "branch_count": 200,
        "zone_b_count": 10,
        "mean_tortuosity_distance": 0.01,
        "mean_tortuosity_curvature": 0.10,
        "fractal_dimension": 1.20,  # High D_f
        "fractal_r_squared": 0.85,  # Poor fit
    }
    _, norm = normalize_contract_v1(noisy_low_fit)
    assert norm["w_fit"] == 0.0
    assert norm["u_df_raw"] == 1.0
    assert norm["u_df_star"] == 0.50  # Gated to prior


def test_normalization_rejects_invalid_inputs():
    """Verify strict gating on missing, non-finite, and negative inputs."""
    valid_base = {
        "vessel_density": 0.08,
        "branch_count": 200,
        "zone_b_count": 10,
        "mean_tortuosity_distance": 0.01,
        "mean_tortuosity_curvature": 0.10,
        "fractal_dimension": 0.97,
        "fractal_r_squared": 0.99,
    }

    # Missing field
    missing = valid_base.copy()
    del missing["branch_count"]
    with pytest.raises(ValueError, match="branch_count"):
        normalize_contract_v1(missing)

    # NaN input
    has_nan = valid_base.copy()
    has_nan["vessel_density"] = float("nan")
    with pytest.raises(ValueError, match="non-finite"):
        normalize_contract_v1(has_nan)

    # Inf input
    has_inf = valid_base.copy()
    has_inf["mean_tortuosity_curvature"] = float("inf")
    with pytest.raises(ValueError, match="non-finite"):
        normalize_contract_v1(has_inf)

    # Negative count
    neg = valid_base.copy()
    neg["branch_count"] = -5
    with pytest.raises(ValueError, match="out of range"):
        normalize_contract_v1(neg)


# ─────────────────────────────────────────────────────────────────────────────
# 2. Simulink Service Execution Tests (Live MATLAB / Simulink Engine)
# ─────────────────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def simulink_service_instance():
    """Initializes a shared SimulinkService for the test module."""
    svc = SimulinkService(enabled=True)
    return svc


def test_simulink_service_reference_case(simulink_service_instance):
    """Verify execution of the Phase 6 reference case (0455d569_left)."""
    ref_inputs = {
        "vessel_density": 0.0854,
        "branch_count": 288,
        "zone_b_count": 17,
        "mean_tortuosity_distance": 0.0086,
        "mean_tortuosity_curvature": 0.1620,
        "fractal_dimension": 0.9707,
        "fractal_r_squared": 0.9987,
    }
    result = simulink_service_instance.run_simulation(ref_inputs, eye="left")

    assert result.execution_status == "completed"
    assert result.error_message is None
    assert result.model_name == MODEL_NAME
    assert result.model_version == MODEL_VERSION
    assert result.contract_version == CONTRACT_VERSION

    # Check normalized inputs
    norm = result.normalized_inputs
    assert abs(norm["u_dens"] - 0.4270) < 1e-3
    assert abs(norm["u_branch"] - 0.5760) < 1e-3
    assert abs(norm["u_zb"] - 0.5667) < 1e-3
    assert abs(norm["u_taud"] - 0.2150) < 1e-3
    assert abs(norm["u_tauc"] - 0.5400) < 1e-3
    assert abs(norm["u_df_star"] - 0.3469) < 1e-3

    # Check terminal outputs
    out = result.output_state
    assert abs(out["structural_complexity_state"] - 0.4614) < 0.005
    assert abs(out["tortuosity_computational_state"] - 0.3450) < 0.005
    assert abs(out["vascular_bed_density_state"] - 0.4828) < 0.005
    assert abs(out["composite_retinal_computational_state"] - 0.4340) < 0.005

    # Check trajectory length
    traj = result.trajectory
    assert len(traj["theta"]) == 101
    assert len(traj["complexity_curve"]) == 101


def test_simulink_service_zero_case(simulink_service_instance):
    """Verify zero/baseline inputs settle to analytical equilibrium."""
    zero_inputs = {
        "vessel_density": 0.0,
        "branch_count": 0,
        "zone_b_count": 0,
        "mean_tortuosity_distance": 0.0,
        "mean_tortuosity_curvature": 0.0,
        "fractal_dimension": 0.85,
        "fractal_r_squared": 0.90,
    }
    result = simulink_service_instance.run_simulation(zero_inputs, eye="right")

    assert result.execution_status == "completed"
    out = result.output_state
    # Complexity: 0.25 * (1 - exp(-10)) = 0.249989
    assert abs(out["structural_complexity_state"] - 0.249989) < 1e-3
    assert out["tortuosity_computational_state"] < 1e-3
    assert out["vascular_bed_density_state"] < 1e-3
    assert abs(out["composite_retinal_computational_state"] - 0.144331) < 1e-3


def test_simulink_service_saturated_case(simulink_service_instance):
    """Verify saturated inputs are strictly clamped to 1.0 without overflow."""
    sat_inputs = {
        "vessel_density": 0.40,
        "branch_count": 1000,
        "zone_b_count": 60,
        "mean_tortuosity_distance": 0.10,
        "mean_tortuosity_curvature": 0.80,
        "fractal_dimension": 1.50,
        "fractal_r_squared": 1.00,
    }
    result = simulink_service_instance.run_simulation(sat_inputs, eye="left")

    assert result.execution_status == "completed"
    out = result.output_state
    assert out["structural_complexity_state"] == pytest.approx(1.0, abs=1e-3)
    assert out["tortuosity_computational_state"] == pytest.approx(1.0, abs=1e-3)
    assert out["vascular_bed_density_state"] == pytest.approx(1.0, abs=1e-3)
    assert out["composite_retinal_computational_state"] == pytest.approx(1.0, abs=1e-3)


def test_simulink_service_invalid_input_isolation(simulink_service_instance):
    """Verify that invalid inputs return status='invalid_input' without exception."""
    res_empty = simulink_service_instance.run_simulation({})
    assert res_empty.execution_status == "invalid_input"
    assert "non-empty" in res_empty.error_message

    res_missing = simulink_service_instance.run_simulation({"vessel_density": 0.08})
    assert res_missing.execution_status == "invalid_input"
    assert "Missing required" in res_missing.error_message


def test_simulink_service_disabled_mode():
    """Verify circuit-breaker returns disabled status when service is disabled."""
    disabled_svc = SimulinkService(enabled=False)
    res = disabled_svc.run_simulation({"vessel_density": 0.08})
    assert res.execution_status == "disabled"
    assert "disabled" in res.error_message.lower()


# ─────────────────────────────────────────────────────────────────────────────
# 3. Database Persistence & Relationship Tests
# ─────────────────────────────────────────────────────────────────────────────

def test_database_persistence_and_relationships(in_memory_db):
    """Verify RetinalSimulation ORM storage, retrieval, and relationships."""
    # 1. Create Patient
    pat = Patient(
        id=str(uuid.uuid4()),
        patient_display_id="RTA-TEST-001",
        name="Simulation Test Patient",
        age=58,
        sex="F",
        diabetes_duration=10
    )
    in_memory_db.add(pat)
    in_memory_db.commit()

    # 2. Create Screening
    scr = Screening(
        id=str(uuid.uuid4()),
        screening_display_id="SCR-TEST-001",
        patient_id=pat.id,
        status="complete"
    )
    in_memory_db.add(scr)
    in_memory_db.commit()

    # 3. Create RetinalSimulation
    sim = RetinalSimulation(
        id=str(uuid.uuid4()),
        screening_id=scr.id,
        patient_id=pat.id,
        eye="left",
        model_name="retina_computational_state",
        model_version="1.0.0",
        simulation_version="1.0.0",
        input_snapshot={"vessel_density": 0.0854, "branch_count": 288},
        normalized_inputs={"u_dens": 0.427, "u_branch": 0.576},
        output_state={
            "structural_complexity_state": 0.4614,
            "tortuosity_computational_state": 0.3450,
            "vascular_bed_density_state": 0.4828,
            "composite_retinal_computational_state": 0.4340
        },
        trajectory={"theta": [0.0, 1.0], "complexity_curve": [0.0, 0.4]},
        execution_status="completed",
        runtime_seconds=0.25,
        created_at=datetime.now(timezone.utc).replace(tzinfo=None)
    )
    in_memory_db.add(sim)
    in_memory_db.commit()

    # Query back and verify
    queried = in_memory_db.query(RetinalSimulation).filter_by(id=sim.id).first()
    assert queried is not None
    assert queried.eye == "left"
    assert queried.execution_status == "completed"
    assert queried.output_state["structural_complexity_state"] == 0.4614
    assert queried.screening.id == scr.id
    assert queried.patient.id == pat.id
    assert len(scr.simulations) == 1
    assert len(pat.simulations) == 1


def test_database_cascade_delete(in_memory_db):
    """Verify that deleting a Screening cascades to its RetinalSimulation."""
    pat = Patient(
        id=str(uuid.uuid4()),
        patient_display_id="RTA-CASCADE-001",
        name="Cascade Test Patient",
        age=60,
        sex="M",
        diabetes_duration=5
    )
    in_memory_db.add(pat)
    in_memory_db.commit()

    scr = Screening(
        id=str(uuid.uuid4()),
        screening_display_id="SCR-CASCADE-001",
        patient_id=pat.id,
        status="complete"
    )
    in_memory_db.add(scr)
    in_memory_db.commit()

    sim = RetinalSimulation(
        id=str(uuid.uuid4()),
        screening_id=scr.id,
        patient_id=pat.id,
        eye="right",
        input_snapshot={"vessel_density": 0.08},
        normalized_inputs={"u_dens": 0.40},
        output_state={"structural_complexity_state": 0.40},
        trajectory={"theta": [0.0]},
        execution_status="completed"
    )
    in_memory_db.add(sim)
    in_memory_db.commit()

    sim_id = sim.id
    assert in_memory_db.query(RetinalSimulation).filter_by(id=sim_id).first() is not None

    # Delete Screening
    in_memory_db.delete(scr)
    in_memory_db.commit()

    # Verify RetinalSimulation was cascade-deleted
    assert in_memory_db.query(RetinalSimulation).filter_by(id=sim_id).first() is None


# ─────────────────────────────────────────────────────────────────────────────
# 4. FastAPI Simulation Endpoint Integration Tests
# ─────────────────────────────────────────────────────────────────────────────
from fastapi import FastAPI
from fastapi.testclient import TestClient
from core.security import create_access_token, get_password_hash
from database.db import get_db
from database.models import User
from api import simulation, auth, patients, screenings


@pytest.fixture
def test_app_and_client():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine, expire_on_commit=False)

    app = FastAPI(title="RetinaAI Simulation Test App")

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
    app.include_router(simulation.router, prefix="/api")

    db = Session()
    user = User(
        id=str(uuid.uuid4()),
        username="dr_sim_test",
        password_hash=get_password_hash("password123"),
        full_name="Dr. Simulink Tester",
        role="doctor",
        centre="Central Hospital"
    )
    db.add(user)
    db.commit()

    token = create_access_token(user.id, user.role)
    headers = {"Authorization": f"Bearer {token}"}

    client = TestClient(app)
    return client, headers, db, user


def test_simulation_auth_protection(test_app_and_client):
    """Verify simulation endpoints reject unauthenticated access (401)."""
    client, _, _, _ = test_app_and_client
    # POST without token
    r1 = client.post("/api/screenings/any-id/simulate", json={"eye": "both"})
    assert r1.status_code == 401

    # GET screening without token
    r2 = client.get("/api/screenings/any-id/simulation")
    assert r2.status_code == 401

    # GET patient without token
    r3 = client.get("/api/patients/any-id/simulation")
    assert r3.status_code == 401


def test_simulate_endpoint_missing_biomarkers(test_app_and_client):
    """Verify 400 Bad Request when screening has no computed biomarkers."""
    client, headers, db, user = test_app_and_client

    pat = Patient(id=str(uuid.uuid4()), patient_display_id="RTA-SIM-001", name="No BM Patient")
    db.add(pat)
    scr = Screening(
        id=str(uuid.uuid4()),
        screening_display_id="SCR-SIM-001",
        patient_id=pat.id,
        status="complete"
        # No left_biomarkers or right_biomarkers
    )
    db.add(scr)
    db.commit()

    resp = client.post(f"/api/screenings/{scr.id}/simulate", json={"eye": "both"}, headers=headers)
    assert resp.status_code == 400
    assert "no completed Phase 6 biomarkers" in resp.json()["detail"]


def test_simulate_endpoint_success_and_query(test_app_and_client):
    """Verify successful end-to-end simulation trigger, persistence, and queries."""
    client, headers, db, user = test_app_and_client

    pat = Patient(id=str(uuid.uuid4()), patient_display_id="RTA-SIM-002", name="Simulink Patient")
    db.add(pat)

    ref_bm = {
        "vessel_density": 0.0854,
        "branch_count": 288,
        "zone_b_count": 17,
        "mean_tortuosity_distance": 0.0086,
        "mean_tortuosity_curvature": 0.1620,
        "fractal_dimension": 0.9707,
        "fractal_r_squared": 0.9987,
    }

    scr = Screening(
        id=str(uuid.uuid4()),
        screening_display_id="SCR-SIM-002",
        patient_id=pat.id,
        status="complete",
        left_biomarkers=ref_bm
    )
    db.add(scr)
    db.commit()

    # 1. Trigger Simulation via POST /api/screenings/{id}/simulate
    resp = client.post(f"/api/screenings/{scr.screening_display_id}/simulate", json={"eye": "left"}, headers=headers)
    assert resp.status_code == 200
    data = resp.json()

    assert data["has_simulation"] is True
    assert data["screening_id"] == scr.id
    assert data["screening_display_id"] == "SCR-SIM-002"
    assert data["patient_id"] == pat.id

    left_sim = data["left"]
    assert left_sim is not None
    assert left_sim["eye"] == "left"
    assert left_sim["execution_status"] == "completed"
    assert left_sim["model_name"] == MODEL_NAME
    assert left_sim["model_version"] == MODEL_VERSION
    assert left_sim["contract_version"] == CONTRACT_VERSION
    assert "Research/computational" in left_sim["scientific_disclaimer"]

    # Verify output state matches expected values
    out_st = left_sim["output_state"]
    assert abs(out_st["structural_complexity_state"] - 0.4614) < 0.005
    assert abs(out_st["tortuosity_computational_state"] - 0.3450) < 0.005
    assert abs(out_st["vascular_bed_density_state"] - 0.4828) < 0.005
    assert abs(out_st["composite_retinal_computational_state"] - 0.4340) < 0.005

    # Verify trajectory
    assert len(left_sim["trajectory"]["theta"]) == 101

    # 2. Query via GET /api/screenings/{id}/simulation
    resp_get = client.get(f"/api/screenings/{scr.id}/simulation", headers=headers)
    assert resp_get.status_code == 200
    data_get = resp_get.json()
    assert data_get["has_simulation"] is True
    assert data_get["left"]["output_state"]["structural_complexity_state"] == out_st["structural_complexity_state"]

    # 3. Query via GET /api/patients/{id}/simulation
    resp_pat = client.get(f"/api/patients/{pat.patient_display_id}/simulation", headers=headers)
    assert resp_pat.status_code == 200
    data_pat = resp_pat.json()
    assert data_pat["has_simulation"] is True
    assert data_pat["left"]["output_state"]["composite_retinal_computational_state"] == out_st["composite_retinal_computational_state"]


def test_simulation_not_found_returns_404(test_app_and_client):
    """Verify 404 for nonexistent screening or patient."""
    client, headers, _, _ = test_app_and_client
    r1 = client.get("/api/screenings/NONEXISTENT-SCR/simulation", headers=headers)
    assert r1.status_code == 404

    r2 = client.get("/api/patients/NONEXISTENT-PAT/simulation", headers=headers)
    assert r2.status_code == 404
