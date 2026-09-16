import cv2
import numpy as np
import torch
import albumentations as A
from albumentations.pytorch import ToTensorV2
from pathlib import Path
from dataclasses import dataclass
from typing import Optional, List, Tuple
import segmentation_models_pytorch as smp

@dataclass
class LesionCategory:
    name: str
    detected: bool
    confidence: float
    count: Optional[int]
    mask_path: Optional[str]

@dataclass
class LesionResult:
    microaneurysm: LesionCategory
    exudate: LesionCategory
    hemorrhage: LesionCategory
    neovascularization: LesionCategory
    overlay_bgr: Optional[np.ndarray]

def crop_black_border(img_bgr: np.ndarray) -> Tuple[int, int, int, int]:
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    _, threshold = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    n_labels, labels, stats, _ = cv2.connectedComponentsWithStats(threshold, 8)
    if n_labels <= 1:
        return 0, 0, img_bgr.shape[1], img_bgr.shape[0]
    largest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    x = int(stats[largest, cv2.CC_STAT_LEFT])
    y = int(stats[largest, cv2.CC_STAT_TOP])
    w = int(stats[largest, cv2.CC_STAT_WIDTH])
    h = int(stats[largest, cv2.CC_STAT_HEIGHT])
    return x, y, w, h

class LesionService:
    def __init__(self):
        self.models = []
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.mean = (0.485, 0.456, 0.406)
        self.std = (0.229, 0.224, 0.225)
        self.patch_size = 512
        # Expected class mapping: 0: Bg, 1: MA, 2: Hemorrhage, 3: Hard Exudates, 4: Soft Exudates, 5: OD
        self.class_colors = {
            1: (255, 0, 0),    # Blue in BGR
            2: (0, 140, 255),  # Orange in BGR
            3: (0, 255, 255),  # Yellow in BGR
            4: (255, 200, 0),  # Cyan in BGR
        }
        
    def load(self, checkpoint_path: str):
        path = Path(checkpoint_path)
        if not path.is_file():
            print(f"Lesion model not found at {path}. Plugin inactive.")
            self.models = []
            return
            
        try:
            bundle = torch.load(path, map_location="cpu", weights_only=True)
        except Exception:
            bundle = torch.load(path, map_location="cpu", weights_only=False)
            
        config = bundle["config"]
        states = bundle["model_states"]
        self.patch_size = int(config.get("patch_size", config.get("img_size", 512)))
        self.mean = bundle.get("mean", self.mean)
        self.std = bundle.get("std", self.std)
        
        self.models = []
        for state in states:
            model = smp.Unet(
                encoder_name=config["encoder_name"],
                encoder_weights=None,
                in_channels=3,
                classes=int(config["num_classes"]),
                activation=None,
            )
            model.load_state_dict(state, strict=True)
            model.to(self.device)
            model.eval()
            self.models.append(model)
            
        print(f"Lesion Model loaded successfully ({len(self.models)}-fold ensemble)")

    def is_available(self) -> bool:
        return len(self.models) > 0

    def predict(self, image_bgr: np.ndarray) -> Optional[LesionResult]:
        if not self.is_available():
            return None

        orig_h, orig_w = image_bgr.shape[:2]
        x, y, w, h = crop_black_border(image_bgr)
        if w < 10 or h < 10:
            x, y, w, h = 0, 0, orig_w, orig_h

        cropped = image_bgr[y:y + h, x:x + w]
        resized = cv2.resize(cropped, (self.patch_size, self.patch_size), interpolation=cv2.INTER_AREA)
        rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB)

        transform = A.Compose([
            A.Normalize(mean=tuple(self.mean), std=tuple(self.std)),
            ToTensorV2(),
        ])
        tensor = transform(image=rgb)["image"].unsqueeze(0).to(self.device)

        probability_sum = None
        with torch.no_grad():
            for model in self.models:
                logits = model(tensor)
                probs = torch.softmax(logits, dim=1)
                probability_sum = probs if probability_sum is None else probability_sum + probs

        avg_probs = probability_sum / len(self.models)
        pred_small = torch.argmax(avg_probs, dim=1).squeeze(0).cpu().numpy().astype(np.uint8)

        pred_crop = cv2.resize(pred_small, (w, h), interpolation=cv2.INTER_NEAREST)
        pred_full = np.zeros((orig_h, orig_w), dtype=np.uint8)
        pred_full[y:y + h, x:x + w] = pred_crop

        # Calculate counts and generate overlay
        overlay = image_bgr.copy()
        
        def count_blobs(binary_mask):
            num_labels, _, _, _ = cv2.connectedComponentsWithStats(binary_mask, connectivity=8)
            return max(0, num_labels - 1)
            
        # 1: MA, 2: Hemorrhage, 3: Hard Exudates, 4: Soft Exudates
        ma_mask = (pred_full == 1).astype(np.uint8) * 255
        hem_mask = (pred_full == 2).astype(np.uint8) * 255
        hard_ex_mask = (pred_full == 3).astype(np.uint8) * 255
        soft_ex_mask = (pred_full == 4).astype(np.uint8) * 255
        
        exudate_mask = cv2.bitwise_or(hard_ex_mask, soft_ex_mask)
        
        c_ma = count_blobs(ma_mask)
        c_hem = count_blobs(hem_mask)
        c_ex = count_blobs(exudate_mask)
        
        # Build overlay
        for class_id, color_bgr in self.class_colors.items():
            class_mask = (pred_full == class_id)
            overlay[class_mask] = overlay[class_mask] * 0.4 + np.array(color_bgr) * 0.6
            
        return LesionResult(
            microaneurysm=LesionCategory("Microaneurysm", c_ma > 0, 0.9 if c_ma > 0 else 0.0, c_ma, None),
            exudate=LesionCategory("Exudate", c_ex > 0, 0.9 if c_ex > 0 else 0.0, c_ex, None),
            hemorrhage=LesionCategory("Hemorrhage", c_hem > 0, 0.9 if c_hem > 0 else 0.0, c_hem, None),
            neovascularization=LesionCategory("Neovascularization", False, 0.0, 0, None),
            overlay_bgr=overlay
        )
