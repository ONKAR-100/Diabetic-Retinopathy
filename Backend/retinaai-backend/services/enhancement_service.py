import cv2
import numpy as np

class EnhancementService:
    def enhance(self, image_bgr: np.ndarray) -> np.ndarray:
        # 1. Detect retinal ROI
        gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
        _, mask = cv2.threshold(gray, 7, 255, cv2.THRESH_BINARY)
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((7, 7), np.uint8))
        
        # 2. Convert to LAB color space
        lab = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        
        # 3. Apply CLAHE to L channel
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))
        cl = clahe.apply(l)
        
        # 4. Apply Gaussian bilateral filter for denoising on L
        cl = cv2.bilateralFilter(cl, 9, 75, 75)
        
        # Merge back
        limg = cv2.merge((cl, a, b))
        
        # 6. Convert back to BGR
        enhanced = cv2.cvtColor(limg, cv2.COLOR_LAB2BGR)
        
        # Apply mask
        enhanced = cv2.bitwise_and(enhanced, enhanced, mask=mask)
        
        return enhanced
