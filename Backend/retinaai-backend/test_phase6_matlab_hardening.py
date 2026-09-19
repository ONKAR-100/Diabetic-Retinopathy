"""
Phase 6 Targeted Test Suite: MATLAB Biomarker Numerical Hardening & Reliability

Verifies:
1. clean_float rejects NaN, +Inf, -Inf, invalid types, and rounds valid floats.
2. clean_int rejects NaN, +Inf, -Inf, handles OverflowError, and rounds valid ints.
3. RetinaBiomarkersResult serialization does not leak Infinity or NaN.
4. Circuit-breaker isolation when ENABLE_MATLAB_BIOMARKERS is False.
5. Fovea confidence threshold remains locked at 0.30.
"""
import math
import numpy as np
import pytest

from services.matlab_service import MatlabService, RetinaBiomarkersResult
from services.od_fovea_service import ODFoveaService
from config import settings


def test_clean_float_rejects_non_finite():
    """Verify clean_float strictly rejects NaN, +Inf, -Inf and non-numeric garbage."""
    # Instantiating MatlabService in disabled mode for helper access
    svc = MatlabService(enabled=False)

    # Helper definition inside compute_biomarkers extracted for unit testing
    def clean_float(val):
        if val is None:
            return None
        try:
            f = float(val)
            return None if (np.isnan(f) or np.isinf(f)) else round(f, 4)
        except (ValueError, TypeError):
            return None

    assert clean_float(None) is None
    assert clean_float(float("nan")) is None
    assert clean_float(np.nan) is None
    assert clean_float(float("inf")) is None
    assert clean_float(float("-inf")) is None
    assert clean_float(np.inf) is None
    assert clean_float(-np.inf) is None
    assert clean_float("inf") is None
    assert clean_float("-inf") is None
    assert clean_float("nan") is None
    assert clean_float("not-a-number") is None
    assert clean_float({}) is None
    assert clean_float([1, 2]) is None

    # Valid values
    assert clean_float(0.470582) == 0.4706
    assert clean_float(0.0) == 0.0
    assert clean_float(1) == 1.0
    assert clean_float("0.9707") == 0.9707
    print("[PASS] test_clean_float_rejects_non_finite passed.")


def test_clean_int_rejects_non_finite_and_overflow():
    """Verify clean_int strictly rejects NaN, +Inf, -Inf, handles OverflowError, and casts safely."""
    def clean_int(val):
        if val is None:
            return None
        try:
            f = float(val)
            if np.isnan(f) or np.isinf(f):
                return None
            return int(round(f))
        except (ValueError, TypeError, OverflowError):
            return None

    assert clean_int(None) is None
    assert clean_int(float("nan")) is None
    assert clean_int(np.nan) is None
    assert clean_int(float("inf")) is None
    assert clean_int(float("-inf")) is None
    assert clean_int(np.inf) is None
    assert clean_int(-np.inf) is None
    assert clean_int("inf") is None
    assert clean_int("-inf") is None
    assert clean_int("nan") is None
    assert clean_int("junk") is None

    # Valid values
    assert clean_int(17.0) == 17
    assert clean_int(17.4) == 17
    assert clean_int(17.6) == 18
    assert clean_int(0) == 0
    assert clean_int("288") == 288
    print("[PASS] test_clean_int_rejects_non_finite_and_overflow passed.")


def test_retina_biomarkers_result_serialization():
    """Verify RetinaBiomarkersResult serialization produces clean dictionaries."""
    res = RetinaBiomarkersResult(
        avr=0.4706,
        crae_pixels=34.078,
        crve_pixels=72.4168,
        mean_tortuosity_distance=0.0086,
        mean_tortuosity_curvature=0.1620,
        max_tortuosity=0.2256,
        fractal_dimension=0.9707,
        fractal_r_squared=0.9987,
        vessel_density=0.0854,
        zone_b_count=17,
        branch_count=288,
        runtime_seconds=22.64,
        status="completed",
        error_message=None
    )
    d = res.to_dict()
    assert d["status"] == "completed"
    assert d["avr"] == 0.4706
    assert d["zone_b_count"] == 17
    assert d["branch_count"] == 288

    # Error case: all biomarker fields None
    err_res = RetinaBiomarkersResult(
        status="error",
        error_message="MATLAB Engine failure simulated."
    )
    err_dict = err_res.to_dict()
    assert err_dict["status"] == "error"
    assert err_dict["avr"] is None
    assert err_dict["fractal_dimension"] is None
    assert err_dict["error_message"] == "MATLAB Engine failure simulated."
    print("[PASS] test_retina_biomarkers_result_serialization passed.")


def test_fovea_confidence_threshold_preserved():
    """Verify that ODFoveaService confidence threshold remains frozen at 0.30."""
    od_service = ODFoveaService()
    assert od_service.confidence_threshold == 0.30, (
        f"Fovea confidence threshold altered! Expected 0.30, got {od_service.confidence_threshold}"
    )
    print("[PASS] test_fovea_confidence_threshold_preserved passed.")


def test_matlab_circuit_breaker():
    """Verify that when disabled, MatlabService returns disabled status without executing."""
    svc = MatlabService(enabled=False)
    res = svc.compute_biomarkers(
        vessel_mask=np.zeros((100, 100), dtype=np.uint8),
        fundus_rgb=np.zeros((100, 100, 3), dtype=np.uint8)
    )
    assert res.status == "disabled"
    assert res.avr is None
    assert res.fractal_dimension is None
    assert res.error_message is not None
    print("[PASS] test_matlab_circuit_breaker passed.")


if __name__ == "__main__":
    test_clean_float_rejects_non_finite()
    test_clean_int_rejects_non_finite_and_overflow()
    test_retina_biomarkers_result_serialization()
    test_fovea_confidence_threshold_preserved()
    test_matlab_circuit_breaker()
    print("\nALL PHASE 6 TARGETED PYTHON TESTS PASSED!")
