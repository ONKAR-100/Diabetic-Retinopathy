"""
Phase 2 Python-MATLAB Engine End-to-End Integration Test
Verifies:
1. PipelineService.run() with MATLAB biomarkers enabled (live MATLAB engine call)
2. Biomarkers structure, values, and consistency with Phase 1.5 benchmarks
3. Graceful degradation / circuit breaker with ENABLE_MATLAB_BIOMARKERS = False
4. Response mapping in _build_eye and map_screening_to_response
"""
import os
import sys
import cv2
import json

# Ensure backend root is on sys.path
backend_root = os.path.abspath(os.path.dirname(__file__))
if backend_root not in sys.path:
    sys.path.insert(0, backend_root)

from config import settings
from models_loader.loaders import pipeline_service, matlab_service, load_all_models
from database.models import Screening
from api.analysis import _build_eye
from api.screenings import map_screening_to_response

TEST_IMAGE_PATH = os.path.join(
    backend_root,
    "static", "uploads", "0455d569-c262-48f1-b038-11c90c587ba2_left.jpg"
)

def run_tests():
    print("=" * 70)
    print("PHASE 2 INTEGRATION VERIFICATION")
    print("=" * 70)
    
    # Load PyTorch models
    print("\n--- Initializing AI Models ---")
    load_all_models()
    
    assert os.path.exists(TEST_IMAGE_PATH), f"Test image not found: {TEST_IMAGE_PATH}"
    bgr = cv2.imread(TEST_IMAGE_PATH)
    assert bgr is not None, "Failed to read test image with cv2"
    print(f"[OK] Test image loaded: {TEST_IMAGE_PATH} ({bgr.shape[1]}x{bgr.shape[0]})")
    
    # -------------------------------------------------------------
    # Test 1: Full Pipeline Run with MATLAB Biomarkers Enabled
    # -------------------------------------------------------------
    print("\n--- Test 1: Full Pipeline Run with MATLAB Enabled ---")
    settings.ENABLE_MATLAB_BIOMARKERS = True
    
    result = pipeline_service.run(
        image_bgr=bgr,
        eye="left",
        screening_id="test-phase2-screening",
        image_path=TEST_IMAGE_PATH
    )
    
    assert result["status"] == "complete", f"Pipeline failed: {result}"
    print(f"[OK] Pipeline status: {result['status']} in {result['pipeline_time']:.2f}s")
    print(f"[OK] DR Grade: {result['dr'].grade}, referable: {result['referable']}")
    print(f"[OK] Vessel density: {result['vessel_density']:.4f}")
    od_str = f"({result['od_x']:.1f}, {result['od_y']:.1f})" if result['od_x'] is not None else "None"
    fov_str = f"({result['fovea_x']:.1f}, {result['fovea_y']:.1f})" if result['fovea_x'] is not None else "None (Gated/Suppressed)"
    print(f"[OK] Optic Disc: {od_str} conf={result['od_confidence']:.3f}")
    print(f"[OK] Fovea: {fov_str} conf={result['fovea_confidence']:.3f}")
    
    bm = result.get("biomarkers")
    assert bm is not None, "Biomarkers dictionary is None!"
    print("\n[OK] MATLAB Biomarkers Output:")
    print(f"     AVR:                     {bm['avr']} (top-level: {result['avr']})")
    print(f"     CRAE:                    {bm['crae_pixels']} px (top-level: {result['crae']})")
    print(f"     CRVE:                    {bm['crve_pixels']} px (top-level: {result['crve']})")
    print(f"     Tortuosity (Distance):   {bm['mean_tortuosity_distance']} (top-level: {result['vessel_tortuosity']})")
    print(f"     Tortuosity (Curvature):  {bm['mean_tortuosity_curvature']}")
    print(f"     Fractal Dimension (Df):  {bm['fractal_dimension']} (top-level: {result['fractal_dimension']})")
    print(f"     Fractal R^2:             {bm['fractal_r_squared']}")
    print(f"     Branch Count:            {bm['branch_count']}")
    print(f"     Zone B Vessel Count:     {bm['zone_b_count']}")
    print(f"     Execution Time (MATLAB): {bm['runtime_seconds']:.3f}s")
    
    # Assert benchmark consistency
    assert bm['avr'] is not None and 0.40 <= bm['avr'] <= 0.55, f"Unexpected AVR: {bm['avr']}"
    assert bm['fractal_dimension'] is not None and 0.90 <= bm['fractal_dimension'] <= 1.10, f"Unexpected Df: {bm['fractal_dimension']}"
    assert bm['fractal_r_squared'] is not None and bm['fractal_r_squared'] >= 0.99, f"Unexpected R2: {bm['fractal_r_squared']}"
    assert bm['zone_b_count'] == 17, f"Expected 17 Zone B vessels, got {bm['zone_b_count']}"
    assert bm['branch_count'] is not None and bm['branch_count'] > 0, f"Expected positive branch count, got {bm['branch_count']}"
    print("[PASS] Benchmark values match Phase 1.5 within tolerance.")

    # -------------------------------------------------------------
    # Test 2: Circuit Breaker / Feature Flag Disabled
    # -------------------------------------------------------------
    print("\n--- Test 2: Circuit Breaker / Disabled Flag ---")
    settings.ENABLE_MATLAB_BIOMARKERS = False
    
    result_disabled = pipeline_service.run(
        image_bgr=bgr,
        eye="left",
        screening_id="test-phase2-disabled",
        image_path=TEST_IMAGE_PATH
    )
    
    assert result_disabled["status"] == "complete"
    assert result_disabled["biomarkers"] is None, "Biomarkers should be None when flag is disabled"
    assert result_disabled["avr"] is None
    assert result_disabled["vessel_tortuosity"] is None
    assert result_disabled["fractal_dimension"] is None
    assert result_disabled["dr"].grade is not None
    print("[PASS] Core pipeline successfully operates independently when MATLAB is disabled.")
    
    # Restore flag
    settings.ENABLE_MATLAB_BIOMARKERS = True

    # -------------------------------------------------------------
    # Test 3: Response Building and Database Model Mapping
    # -------------------------------------------------------------
    print("\n--- Test 3: Response Building & Database Mapping ---")
    import uuid
    from datetime import datetime
    mock_screening = Screening(
        id=str(uuid.uuid4()),
        screening_display_id="SCR-PHASE2-TEST",
        status="complete",
        created_at=datetime.utcnow(),
        analyzed_at=datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S'),
        pipeline_time_seconds=result["pipeline_time"],
        previous_screening_id=None,
        overall_referable=result["referable"],
        recommendation="Routine annual screening recommended.",
        review_status="not_required",
        patient=None,
        left_dr_grade=result["dr"].grade,
        left_quality_status="good",
        left_quality_scores={"overall": 0.95},
        left_quality_reason=None,
        left_image_path=TEST_IMAGE_PATH,
        left_class_probabilities=result["dr"].class_probabilities,
        left_confidence_raw=result["dr"].confidence_raw,
        left_confidence_calibrated=result["calibrated_confidence"],
        left_referable=result["referable"],
        left_gradcam_path=result["gradcam_url"],
        left_vessel_overlay_path=result["vessel_overlay_url"],
        left_vessel_mask_path=result["vessel_mask_url"],
        left_vessel_density=result["vessel_density"],
        left_od_fovea_overlay_path=result["od_fovea_overlay_url"],
        left_od_x=result["od_x"],
        left_od_y=result["od_y"],
        left_od_confidence=result["od_confidence"],
        left_fovea_x=result["fovea_x"],
        left_fovea_y=result["fovea_y"],
        left_fovea_confidence=result["fovea_confidence"],
        left_lesion_result=None,
        left_biomarkers=bm,
        left_avr=result["avr"],
        left_tortuosity=result["vessel_tortuosity"],
        left_fractal_dim=result["fractal_dimension"],
        right_quality_status=None,
    )
    
    # Test _build_eye
    eye_dict = _build_eye(mock_screening, "left")
    assert eye_dict["biomarkers"] is not None
    assert eye_dict["avr"] == result["avr"]
    assert eye_dict["vessel_tortuosity"] == result["vessel_tortuosity"]
    assert eye_dict["fractal_dimension"] == result["fractal_dimension"]
    print("[PASS] _build_eye successfully includes biomarker fields.")
    
    # Test map_screening_to_response
    resp_dict = map_screening_to_response(mock_screening)
    assert resp_dict["left_eye"]["biomarkers"] is not None
    assert resp_dict["left_eye"]["avr"] == result["avr"]
    assert resp_dict["left_eye"]["vessel_tortuosity"] == result["vessel_tortuosity"]
    assert resp_dict["left_eye"]["fractal_dimension"] == result["fractal_dimension"]
    print("[PASS] map_screening_to_response successfully includes biomarker fields.")

    # -------------------------------------------------------------
    # Test 4: Live /api/screenings/{id}/analyze Endpoint Verification
    # -------------------------------------------------------------
    print("\n--- Test 4: Live /api/screenings/{id}/analyze Verification ---", flush=True)
    from fastapi.testclient import TestClient
    from main import app
    from database.db import SessionLocal
    from database.models import Patient, LongitudinalComparison
    
    db_session = SessionLocal()
    patient = db_session.query(Patient).first()
    patient_id = patient.id if patient else None
    
    test_scr_id = str(uuid.uuid4())
    live_test_screening = Screening(
        id=test_scr_id,
        screening_display_id=f"SCR-LIVE-{test_scr_id[:8]}",
        patient_id=patient_id,
        status="uploaded",
        left_image_path=TEST_IMAGE_PATH,
        right_image_path=None,
        created_at=datetime.utcnow()
    )
    db_session.add(live_test_screening)
    db_session.commit()
    
    try:
        client = TestClient(app)
        api_res = client.post(f"/api/screenings/{test_scr_id}/analyze", json={"eye": "left"})
        assert api_res.status_code == 200, f"API returned error: {api_res.status_code} - {api_res.text}"
        payload = api_res.json()
        
        assert payload["status"] == "complete", f"Screening status is {payload['status']}"
        left_eye = payload.get("left_eye")
        assert left_eye is not None, "left_eye missing from response payload"
        
        # Verify biomarker fields returned in response
        assert left_eye.get("biomarkers") is not None, "biomarkers is None in left_eye response"
        assert left_eye.get("avr") is not None, "avr is None in left_eye response"
        assert left_eye.get("vessel_tortuosity") is not None, "vessel_tortuosity is None in left_eye response"
        assert left_eye.get("fractal_dimension") is not None, "fractal_dimension is None in left_eye response"
        
        bm_res = left_eye["biomarkers"]
        print(f"[OK] Live API returned AVR: {bm_res.get('avr')}, Zone B Count: {bm_res.get('zone_b_count')}, Branch Count: {bm_res.get('branch_count')}", flush=True)
        print(f"[OK] Live API returned Df: {bm_res.get('fractal_dimension')} (R2={bm_res.get('fractal_r_squared')})", flush=True)
        
        # Verify persistence in actual PostgreSQL database
        db_session.refresh(live_test_screening)
        assert live_test_screening.left_biomarkers is not None, "left_biomarkers was not persisted to PostgreSQL"
        assert live_test_screening.left_avr is not None, "left_avr was not persisted to PostgreSQL"
        assert live_test_screening.left_tortuosity is not None, "left_tortuosity was not persisted to PostgreSQL"
        assert live_test_screening.left_fractal_dim is not None, "left_fractal_dim was not persisted to PostgreSQL"
        print("[PASS] Successfully verified persistence to PostgreSQL database columns.", flush=True)
        print("[PASS] Live /api/screenings/{id}/analyze endpoint returned 200 with full biomarker payload.", flush=True)
        
    finally:
        # Clean up longitudinal comparisons and test row from DB
        try:
            db_session.query(LongitudinalComparison).filter(
                (LongitudinalComparison.current_screening_id == test_scr_id) |
                (LongitudinalComparison.previous_screening_id == test_scr_id)
            ).delete(synchronize_session=False)
            db_session.delete(live_test_screening)
            db_session.commit()
        except Exception:
            db_session.rollback()
        finally:
            db_session.close()
    
    print("\n" + "=" * 70)
    print("ALL PHASE 2 INTEGRATION TESTS PASSED SUCCESSFULLY!")
    print("=" * 70)

if __name__ == "__main__":
    run_tests()
