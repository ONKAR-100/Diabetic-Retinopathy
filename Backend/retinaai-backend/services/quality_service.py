import cv2
import numpy as np
from typing import Tuple
from schemas.screening import QualityResult

class QualityService:
    BLUR_THRESH_GOOD = 0.12
    BLUR_THRESH_BORDER = 0.08
    DARK_THRESH = 25.0
    BRIGHT_THRESH = 235.0
    SAT_THRESH = 0.20

    def assess(self, image_bgr: np.ndarray) -> QualityResult:
        rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
        
        # 1. Retina localization
        gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
        gray = cv2.GaussianBlur(gray, (5, 5), 0)
        mask = (gray > 7).astype(np.uint8)
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((7, 7), np.uint8))
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8))
        
        ys, xs = np.where(mask > 0)
        if len(ys) < 500:
            return QualityResult(status="ungradable", reason="poor_framing_or_no_retina_detected", recapture_message="Retinal region is not adequately visible. Center the optic disc in the frame.", scores={"overall": 0})
            
        y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
        rgb_cropped = rgb[y0:y1 + 1, x0:x1 + 1]
        mask_cropped = mask[y0:y1 + 1, x0:x1 + 1]

        # Check geometry
        h = y1 - y0 + 1
        w = x1 - x0 + 1
        aspect = min(w, h) / max(w, h)
        r = max(w, h) / 2.0
        coverage = mask_cropped.sum() / (np.pi * r * r + 1e-6)
        if aspect < 0.6 or coverage < 0.35:
            return QualityResult(status="ungradable", reason="poor_framing_or_no_retina_detected", recapture_message="Retinal region is not adequately visible. Center the optic disc in the frame.", scores={"overall": 10})

        # 2. Exposure stats
        green = rgb_cropped[:, :, 1]
        vals = green[mask_cropped > 0]
        mean_g = float(vals.mean()) if len(vals) > 0 else 0
        sat_frac = float((vals > 250).mean()) if len(vals) > 0 else 0

        if mean_g < self.DARK_THRESH:
            return QualityResult(status="ungradable", reason="too_dark", recapture_message="Image is too dark. Increase illumination and ensure the camera flash is working.", scores={"overall": 20})
        if mean_g > self.BRIGHT_THRESH or sat_frac > self.SAT_THRESH:
            return QualityResult(status="ungradable", reason="overexposed_glare", recapture_message="Image is overexposed or has flash glare. Reduce brightness.", scores={"overall": 20})

        # 3. Sharpness
        f = np.fft.fftshift(np.fft.fft2(green * (mask_cropped > 0)))
        mag = np.abs(f)
        ch, cw = mag.shape
        cy, cx = ch // 2, cw // 2
        radius = min(ch, cw) // 8
        y, x = np.ogrid[:ch, :cw]
        low_mask = (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2
        high_energy = mag[~low_mask].sum()
        total_energy = mag.sum() + 1e-9
        sharp = float(high_energy / total_energy)

        scores = {"focus": sharp * 1000, "brightness": mean_g, "contrast": 100, "fov": coverage * 100, "overall": min(100, max(0, sharp * 1000))}

        if sharp < self.BLUR_THRESH_BORDER:
            return QualityResult(status="ungradable", reason="blurry_recapture_recommended", recapture_message="Image is not sufficiently focused. Clean the lens and stabilize the device.", scores=scores)
        elif sharp < self.BLUR_THRESH_GOOD:
            return QualityResult(status="borderline", reason=None, recapture_message=None, scores=scores)
        else:
            return QualityResult(status="good", reason=None, recapture_message=None, scores=scores)
