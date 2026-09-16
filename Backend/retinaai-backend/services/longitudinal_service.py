import cv2
import numpy as np
import os
import math
from typing import Optional, Dict, Any
from dataclasses import dataclass
from config import settings

GRADE_NAMES = {
    0: "No DR",
    1: "Mild NPDR",
    2: "Moderate NPDR",
    3: "Severe NPDR",
    4: "Proliferative DR",
}

MIN_MATCHES = 15
MIN_INLIER_RATIO = 0.30
PROB_CHANGE_THRESHOLD = 15.0  # percentage points
VESSEL_DENSITY_THRESHOLD = 0.05


def _euclidean_dist(x1, y1, x2, y2):
    if any(v is None for v in [x1, y1, x2, y2]):
        return None
    return round(math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2), 2)


def _register_images(prev_bgr: np.ndarray, curr_bgr: np.ndarray, eye: str, screening_id: str) -> Dict[str, Any]:
    """Run ORB+RANSAC homography registration between previous and current eye images.
    Returns a dict with: status, quality, transform, diff_overlay_path
    """
    # Resize both to same size for fair comparison
    h, w = 512, 512
    prev_resized = cv2.resize(prev_bgr, (w, h))
    curr_resized = cv2.resize(curr_bgr, (w, h))

    prev_gray = cv2.cvtColor(prev_resized, cv2.COLOR_BGR2GRAY)
    curr_gray = cv2.cvtColor(curr_resized, cv2.COLOR_BGR2GRAY)

    orb = cv2.ORB_create(nfeatures=1000)
    kp1, des1 = orb.detectAndCompute(prev_gray, None)
    kp2, des2 = orb.detectAndCompute(curr_gray, None)

    if des1 is None or des2 is None or len(kp1) < MIN_MATCHES or len(kp2) < MIN_MATCHES:
        return {"status": "failed", "quality": 0.0, "transform": None, "diff_overlay_path": None}

    bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=False)
    raw_matches = bf.knnMatch(des1, des2, k=2)

    # Ratio test (Lowe)
    good = [m for m, n in raw_matches if m.distance < 0.75 * n.distance]

    if len(good) < MIN_MATCHES:
        return {"status": "failed", "quality": 0.0, "transform": None, "diff_overlay_path": None}

    src_pts = np.float32([kp1[m.queryIdx].pt for m in good]).reshape(-1, 1, 2)
    dst_pts = np.float32([kp2[m.trainIdx].pt for m in good]).reshape(-1, 1, 2)

    H, mask = cv2.findHomography(src_pts, dst_pts, cv2.RANSAC, 5.0)

    if H is None or mask is None:
        return {"status": "failed", "quality": 0.0, "transform": None, "diff_overlay_path": None}

    inlier_ratio = float(mask.ravel().sum()) / len(good)

    if inlier_ratio < MIN_INLIER_RATIO:
        return {"status": "failed", "quality": round(inlier_ratio, 3), "transform": None, "diff_overlay_path": None}

    # Warp previous image to align with current
    aligned_prev = cv2.warpPerspective(prev_resized, H, (w, h))

    # Compute colourised absolute difference
    diff = cv2.absdiff(curr_resized, aligned_prev)
    diff_gray = cv2.cvtColor(diff, cv2.COLOR_BGR2GRAY)
    diff_colourised = cv2.applyColorMap(diff_gray, cv2.COLORMAP_JET)
    # Blend with current image for context
    diff_overlay = cv2.addWeighted(curr_resized, 0.55, diff_colourised, 0.45, 0)

    # Save diff overlay
    res_dir = os.path.join(settings.RESULT_DIR, screening_id)
    os.makedirs(res_dir, exist_ok=True)
    diff_path = os.path.join(res_dir, f"{eye}_longitudinal_diff.jpg")
    cv2.imwrite(diff_path, diff_overlay)
    diff_url = "/" + diff_path.replace("\\", "/")

    return {
        "status": "success",
        "quality": round(inlier_ratio, 3),
        "transform": H.tolist(),
        "diff_overlay_path": diff_url,
    }


def _compare_probs(prev_probs, curr_probs):
    """Convert raw probabilities [0-1 floats] to percentage points and compute delta.
    Returns (prev_pct_list, curr_pct_list, delta_list)
    """
    if not prev_probs or not curr_probs:
        return None, None, None
    prev_pct = [round(p * 100, 1) for p in prev_probs]
    curr_pct = [round(p * 100, 1) for p in curr_probs]
    delta = [round(curr_pct[i] - prev_pct[i], 1) for i in range(min(len(prev_pct), len(curr_pct)))]
    return prev_pct, curr_pct, delta


def _grade_name(g):
    if g is None:
        return "Unknown"
    return GRADE_NAMES.get(g, f"Grade {g}")


def run_longitudinal_comparison(
    current_screening,
    previous_screening,
    db_session,
) -> Dict[str, Any]:
    """
    Main entry point. Called after a screening is marked 'complete'.
    Returns a dict ready to be saved as a LongitudinalComparison record.

    If previous_screening is None, this is a baseline examination.
    NEVER crashes the outer workflow -- any exception results in 'indeterminate'.
    """
    patient_id = current_screening.patient_id
    curr_id = current_screening.id
    prev_id = previous_screening.id if previous_screening else None

    # BASELINE (first valid exam)
    if previous_screening is None:
        curr_lg = current_screening.left_dr_grade
        curr_rg = current_screening.right_dr_grade
        grade_str = _grade_name(
            max(g for g in [curr_lg, curr_rg] if g is not None)
            if any(g is not None for g in [curr_lg, curr_rg])
            else None
        )
        return {
            "patient_id": patient_id,
            "previous_screening_id": None,
            "current_screening_id": curr_id,
            "left_registration_status": "no_prev_image",
            "right_registration_status": "no_prev_image",
            "left_grade_curr": curr_lg,
            "right_grade_curr": curr_rg,
            "left_prob_curr": [round(p * 100, 1) for p in (current_screening.left_class_probabilities or [])],
            "right_prob_curr": [round(p * 100, 1) for p in (current_screening.right_class_probabilities or [])],
            "progression_status": "baseline",
            "supporting_evidence": [f"First valid retinal examination recorded \u00b7 {grade_str}"],
            "recommendation": (
                "This is the patient's baseline retinal examination. "
                "Future screenings will be compared against this record."
            ),
            "ai_explanation": (
                f"This is the patient's first valid AI-screened retinal examination. "
                f"The AI-assisted DR classification result is {grade_str}. "
                f"This examination has been recorded as the longitudinal baseline for future comparison."
            ),
        }

    # COMPARISON AGAINST PREVIOUS EXAM
    result = {
        "patient_id": patient_id,
        "previous_screening_id": prev_id,
        "current_screening_id": curr_id,
    }

    # Per-eye comparison and image registration
    for eye in ["left", "right"]:
        # 1. Always extract DR grades from the screenings
        result[f"{eye}_grade_prev"] = getattr(previous_screening, f"{eye}_dr_grade")
        result[f"{eye}_grade_curr"] = getattr(current_screening, f"{eye}_dr_grade")

        # 2. Always extract probabilities (convert to percentages)
        prev_p, curr_p, _ = _compare_probs(
            getattr(previous_screening, f"{eye}_class_probabilities"),
            getattr(current_screening, f"{eye}_class_probabilities")
        )
        result[f"{eye}_prob_prev"] = prev_p
        result[f"{eye}_prob_curr"] = curr_p

        # 3. Always extract structural parameters
        result[f"{eye}_vessel_density_prev"] = getattr(previous_screening, f"{eye}_vessel_density")
        result[f"{eye}_vessel_density_curr"] = getattr(current_screening, f"{eye}_vessel_density")
        result[f"{eye}_od_distance"] = _euclidean_dist(
            getattr(previous_screening, f"{eye}_od_x"), getattr(previous_screening, f"{eye}_od_y"),
            getattr(current_screening, f"{eye}_od_x"), getattr(current_screening, f"{eye}_od_y")
        )
        result[f"{eye}_fovea_distance"] = _euclidean_dist(
            getattr(previous_screening, f"{eye}_fovea_x"), getattr(previous_screening, f"{eye}_fovea_y"),
            getattr(current_screening, f"{eye}_fovea_x"), getattr(current_screening, f"{eye}_fovea_y")
        )

        # 4. Attempt image registration if images are present and readable
        curr_path = getattr(current_screening, f"{eye}_image_path")
        prev_path = getattr(previous_screening, f"{eye}_image_path")
        curr_quality = getattr(current_screening, f"{eye}_quality_status")
        prev_quality = getattr(previous_screening, f"{eye}_quality_status")

        if not curr_path or not prev_path:
            result[f"{eye}_registration_status"] = "no_prev_image" if not prev_path else "skipped"
            result[f"{eye}_registration_quality"] = None
            result[f"{eye}_registration_transform"] = None
            result[f"{eye}_diff_overlay_path"] = None
            continue

        if curr_quality == "ungradable" or prev_quality == "ungradable":
            result[f"{eye}_registration_status"] = "skipped"
            result[f"{eye}_registration_quality"] = None
            result[f"{eye}_registration_transform"] = None
            result[f"{eye}_diff_overlay_path"] = None
            continue

        curr_bgr = cv2.imread(curr_path) if os.path.exists(curr_path) else None
        prev_bgr = cv2.imread(prev_path) if os.path.exists(prev_path) else None

        if curr_bgr is None or prev_bgr is None:
            result[f"{eye}_registration_status"] = "failed"
            result[f"{eye}_registration_quality"] = 0.0
            result[f"{eye}_registration_transform"] = None
            result[f"{eye}_diff_overlay_path"] = None
            continue

        try:
            reg = _register_images(prev_bgr, curr_bgr, eye, curr_id)
        except Exception as exc:
            reg = {"status": "failed", "quality": 0.0, "transform": None, "diff_overlay_path": None}

        result[f"{eye}_registration_status"] = reg["status"]
        result[f"{eye}_registration_quality"] = reg["quality"]
        result[f"{eye}_registration_transform"] = reg["transform"]
        result[f"{eye}_diff_overlay_path"] = reg["diff_overlay_path"]

    # Lesion comparison -- placeholder (modular, populated when lesion models expose delta)
    result["lesion_comparison"] = None

    # EVIDENCE ENGINE
    evidence = []
    factors_worsening = 0
    factors_improvement = 0
    registration_available = False
    any_registration_success = False

    for eye in ["left", "right"]:
        reg_status = result.get(f"{eye}_registration_status")
        if reg_status in ("success", "skipped", "no_prev_image"):
            registration_available = True
        if reg_status == "success":
            any_registration_success = True

    for eye in ["left", "right"]:
        g_prev = result.get(f"{eye}_grade_prev")
        g_curr = result.get(f"{eye}_grade_curr")
        prob_prev = result.get(f"{eye}_prob_prev")
        prob_curr = result.get(f"{eye}_prob_curr")
        vd_prev = result.get(f"{eye}_vessel_density_prev")
        vd_curr = result.get(f"{eye}_vessel_density_curr")
        reg_status = result.get(f"{eye}_registration_status")
        eye_label = "OS (Left)" if eye == "left" else "OD (Right)"

        if g_prev is not None and g_curr is not None:
            delta_g = g_curr - g_prev
            if delta_g > 0:
                factors_worsening += 2
                evidence.append(
                    f"{eye_label}: DR grade increased from Grade {g_prev} "
                    f"({_grade_name(g_prev)}) to Grade {g_curr} ({_grade_name(g_curr)})"
                )
            elif delta_g < 0:
                factors_improvement += 2
                evidence.append(
                    f"{eye_label}: DR grade decreased from Grade {g_prev} "
                    f"({_grade_name(g_prev)}) to Grade {g_curr} ({_grade_name(g_curr)})"
                )
            else:
                evidence.append(f"{eye_label}: DR grade unchanged at Grade {g_curr} ({_grade_name(g_curr)})")

        if prob_prev and prob_curr and len(prob_prev) == 5 and len(prob_curr) == 5:
            # Look at the worst-class probability shift
            max_grade = (
                max(g for g in [result.get(f"{eye}_grade_prev"), result.get(f"{eye}_grade_curr")] if g is not None)
                if any(g is not None for g in [result.get(f"{eye}_grade_prev"), result.get(f"{eye}_grade_curr")])
                else 1
            )
            delta_worst = prob_curr[max_grade] - prob_prev[max_grade]
            if abs(delta_worst) >= PROB_CHANGE_THRESHOLD:
                sign = "+" if delta_worst > 0 else ""
                arrow = "\u2192"
                evidence.append(
                    f"{eye_label}: Grade {max_grade} probability shifted {sign}{delta_worst:.1f} pp "
                    f"({prob_prev[max_grade]:.1f}% {arrow} {prob_curr[max_grade]:.1f}%)"
                )
                if delta_worst > 0:
                    factors_worsening += 1
                else:
                    factors_improvement += 1

        if vd_prev is not None and vd_curr is not None:
            vd_delta = vd_curr - vd_prev
            if abs(vd_delta) >= VESSEL_DENSITY_THRESHOLD:
                direction = "decreased" if vd_delta < 0 else "increased"
                arrow = "\u2192"
                evidence.append(
                    f"{eye_label}: Vessel density {direction} ({vd_prev:.3f} {arrow} {vd_curr:.3f})"
                )
                if vd_delta < 0:
                    factors_worsening += 1

        if reg_status == "success" and any_registration_success:
            reg_q = result.get(f"{eye}_registration_quality", 0.0)
            evidence.append(f"{eye_label}: Image registration successful (alignment quality: {reg_q:.0%})")
        elif reg_status == "failed":
            evidence.append(
                f"{eye_label}: Image registration not reliable -- positional comparison skipped for this eye"
            )

    # Add structural notes
    for eye in ["left", "right"]:
        eye_label = "OS (Left)" if eye == "left" else "OD (Right)"
        od_d = result.get(f"{eye}_od_distance")
        fov_d = result.get(f"{eye}_fovea_distance")
        if od_d is not None and od_d > 50:
            evidence.append(
                f"{eye_label}: Optic disc centroid shifted {od_d:.0f}px "
                f"-- may reflect acquisition angle variation"
            )
        if fov_d is not None and fov_d > 50:
            evidence.append(
                f"{eye_label}: Fovea centroid shifted {fov_d:.0f}px "
                f"-- may reflect acquisition angle variation"
            )

    evidence.append("Lesion comparison: Not yet available (pending model expansion)")

    # Determine overall registration quality
    all_failed = all(
        result.get(f"{eye}_registration_status") == "failed"
        for eye in ["left", "right"]
        if result.get(f"{eye}_grade_prev") is not None
    )

    # PROGRESSION STATUS
    if all_failed and not any(result.get(f"{eye}_grade_prev") is None for eye in ["left", "right"]):
        # Both eyes tried and failed registration
        progression_status = "indeterminate"
        recommendation = (
            "Reliable longitudinal comparison could not be performed -- retinal images could not be sufficiently "
            "aligned. Current screening result remains available. Clinical review recommended."
        )
        ai_explanation = (
            "The AI-assisted image registration process could not reliably align the previous and current retinal "
            "images. This may be due to differences in camera positioning, field of view, or image quality between "
            "examinations. As a result, a longitudinal comparison cannot be reported with confidence. "
            "The AI-assisted DR classification result for the current examination remains available for review."
        )
    elif factors_worsening >= 2:
        progression_status = "possible_worsening"
        recommendation = (
            "AI-assisted assessment suggests possible worsening compared to the previous examination. "
            "Ophthalmologist review is recommended."
        )
        ai_explanation = _build_explanation("possible worsening", evidence)
    elif factors_improvement >= 2:
        progression_status = "possible_improvement"
        recommendation = (
            "AI-assisted assessment suggests possible improvement compared to the previous examination. "
            "Continue monitoring per clinical protocol."
        )
        ai_explanation = _build_explanation("possible improvement", evidence)
    else:
        progression_status = "stable"
        recommendation = (
            "AI-assisted assessment shows no significant change compared to the previous examination. "
            "Continue scheduled monitoring."
        )
        ai_explanation = _build_explanation("no significant change", evidence)

    result["progression_status"] = progression_status
    result["supporting_evidence"] = evidence
    result["recommendation"] = recommendation
    result["ai_explanation"] = ai_explanation

    return result


def _build_explanation(conclusion: str, evidence: list) -> str:
    """Generate a cautious, structured plain-language explanation from evidence list."""
    bullet = "\u2022"
    lines = []
    lines.append(
        f"AI-assisted longitudinal assessment suggests {conclusion} compared with the previous examination. "
        "This is an automated rule-based summary -- it is not a clinical diagnosis. "
        "All findings require ophthalmologist review before clinical action is taken."
    )
    if evidence:
        lines.append("Supporting evidence from the AI screening system:")
        for e in evidence:
            lines.append(f"  {bullet} {e}")
    lines.append(
        "Note: GradCAM visualisations represent regions that influenced the AI model prediction and do NOT represent "
        "exact lesion locations. Lesion comparison is not yet available and will be enabled in a future update."
    )
    return "\n".join(lines)
