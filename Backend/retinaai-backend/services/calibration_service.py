import numpy as np
from typing import List

class CalibrationService:
    """Temperature scaling for calibrated confidence.
    T=1.5 initial estimate.
    """
    TEMPERATURE = 1.5
    
    def calibrate(self, raw_probabilities: List[float]) -> float:
        if not raw_probabilities or len(raw_probabilities) == 0:
            return 0.0
        logits = np.log(np.array(raw_probabilities) + 1e-9)
        scaled = logits / self.TEMPERATURE
        exp_s = np.exp(scaled - scaled.max())
        calibrated_probs = exp_s / exp_s.sum()
        return float(calibrated_probs.max())
