import cv2
import os
import time
import numpy as np
from concurrent.futures import ThreadPoolExecutor
from config import settings
from typing import Dict, Any

from services.storage_service import storage_service


class PipelineService:
    def __init__(self, quality_service, enhancement_service, dr_service, gradcam_service, vessel_service, od_fovea_service, lesion_service, calibration_service):
        self.quality = quality_service
        self.enhancement = enhancement_service
        self.dr = dr_service
        self.gradcam = gradcam_service
        self.vessel = vessel_service
        self.od_fovea = od_fovea_service
        self.lesion = lesion_service
        self.calibration = calibration_service

    def run(self, image_bgr: np.ndarray, eye: str, screening_id: str) -> Dict[str, Any]:
        start = time.time()

        # Quality
        qual_res = self.quality.assess(image_bgr)
        if qual_res.status == 'ungradable':
            return {
                "status": "needs_recapture",
                "quality": qual_res
            }

        enhanced_bgr = image_bgr
        if qual_res.status == 'borderline':
            enhanced_bgr = self.enhancement.enhance(image_bgr)
            qual_res2 = self.quality.assess(enhanced_bgr)
            if qual_res2.status == 'ungradable':
                return {
                    "status": "needs_recapture",
                    "quality": qual_res2
                }

        # Parallel inference
        with ThreadPoolExecutor(max_workers=3) as ex:
            fut_dr = ex.submit(self.dr.predict, enhanced_bgr)
            fut_vessel = ex.submit(self.vessel.predict, enhanced_bgr)
            fut_odfov = ex.submit(self.od_fovea.predict, enhanced_bgr)

            dr_result = fut_dr.result()
            vessel_result = fut_vessel.result()
            odfov_result = fut_odfov.result()

        # GradCAM — use the model and normalization from dr_service
        gradcam_result = self.gradcam.generate(
            enhanced_bgr,
            self.dr.get_primary_model(),
            dr_result.grade,
            self.dr.device,
            mean=self.dr.mean,
            std=self.dr.std,
        )

        lesion_result = self.lesion.predict(enhanced_bgr)
        calibrated_conf = self.calibration.calibrate(dr_result.class_probabilities)

        # ── Upload result images to Supabase Storage ─────────────────────────
        bucket = settings.STORAGE_BUCKET_RESULTS

        def upload_img(img: np.ndarray, suffix: str) -> str:
            """Encode and upload an OpenCV image to Supabase Storage."""
            storage_path = f"{screening_id}/{eye}_{suffix}"
            return storage_service.upload_cv2_image(img, bucket, storage_path)

        gradcam_url     = upload_img(gradcam_result.overlay_bgr,     "gradcam_overlay.jpg")
        vessel_overlay  = upload_img(vessel_result.overlay_bgr,      "vessel_overlay.jpg")
        vessel_mask     = upload_img(vessel_result.binary_mask,       "vessel_mask.png")
        od_fovea_url    = upload_img(odfov_result.overlay_bgr,       "od_fovea_overlay.jpg")

        lesion_overlay_url = None
        if lesion_result and lesion_result.overlay_bgr is not None:
            lesion_overlay_url = upload_img(lesion_result.overlay_bgr, "lesion_overlay.jpg")
            lesion_result.overlay_bgr = None  # Don't carry large array further

        elapsed = time.time() - start

        return {
            "status": "complete",
            "quality": qual_res,
            "dr": dr_result,
            "gradcam_url": gradcam_url,
            "vessel_overlay_url": vessel_overlay,
            "vessel_mask_url": vessel_mask,
            "od_fovea_overlay_url": od_fovea_url,
            "lesion_overlay_url": lesion_overlay_url,
            "od_x": odfov_result.optic_disc_x,
            "od_y": odfov_result.optic_disc_y,
            "od_confidence": odfov_result.optic_disc_confidence,
            "fovea_x": odfov_result.fovea_x,
            "fovea_y": odfov_result.fovea_y,
            "fovea_confidence": odfov_result.fovea_confidence,
            "lesion": lesion_result,
            "calibrated_confidence": calibrated_conf,
            "referable": dr_result.referable,
            "pipeline_time": elapsed
        }
