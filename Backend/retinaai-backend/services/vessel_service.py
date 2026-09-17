import os
import cv2
import numpy as np
import torch
import segmentation_models_pytorch as smp
from dataclasses import dataclass
import zipfile

@dataclass
class VesselResult:
    binary_mask: np.ndarray
    overlay_bgr: np.ndarray
    vessel_density: float

def apply_clahe_lab(bgr_img: np.ndarray, clip_limit: float = 2.0, tile_grid_size: tuple = (8, 8)) -> np.ndarray:
    """Enhances local vascular contrast across the Luminance channel using CLAHE."""
    lab = cv2.cvtColor(bgr_img, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=tile_grid_size)
    l_eq = clahe.apply(l)
    enhanced_lab = cv2.merge((l_eq, a, b))
    return cv2.cvtColor(enhanced_lab, cv2.COLOR_LAB2BGR)

class VesselService:
    def __init__(self):
        self.model = None
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.threshold = 0.50
        self.image_size = 512

    def load(self, model_path: str):
        try:
            temp_path = model_path
            # If directory, we need to create a zip checkpoint
            if os.path.isdir(model_path):
                temp_zip = model_path + "_temp.pt"
                with zipfile.ZipFile(temp_zip, 'w', zipfile.ZIP_DEFLATED) as zf:
                    for root, _, files in os.walk(model_path):
                        for file in files:
                            abs_path = os.path.join(root, file)
                            rel_path = os.path.relpath(abs_path, model_path)
                            zf.write(abs_path, f"archive/{rel_path}")
                temp_path = temp_zip

            checkpoint = torch.load(temp_path, map_location=self.device, weights_only=False)
            
            # Setup architecture based on inference.py format
            encoder = checkpoint.get("encoder", "resnet34")
            in_channels = checkpoint.get("in_channels", 3)
            classes = checkpoint.get("classes", 1)
            training_cfg = checkpoint.get("training_config", {})
            self.threshold = float(checkpoint.get("threshold", training_cfg.get("threshold", 0.50)))
            self.image_size = int(checkpoint.get("image_size", 512))

            model = smp.Unet(
                encoder_name=encoder,
                encoder_weights=None,
                in_channels=in_channels,
                classes=classes,
                activation=None,
            )
            
            import torch.nn as nn
            model.segmentation_head = nn.Sequential(
                nn.Dropout2d(p=checkpoint.get("dropout", 0.2)),
                model.segmentation_head[0],
            )
            
            if "model_state_dict" in checkpoint:
                model.load_state_dict(checkpoint["model_state_dict"], strict=True)
            else:
                model.load_state_dict(checkpoint, strict=True)

            model.to(self.device)
            model.eval()
            self.model = model
            
        except Exception as e:
            print(f"Error loading vessel model: {e}")
            self.model = None

    def predict(self, image_bgr: np.ndarray) -> VesselResult:
        orig_h, orig_w = image_bgr.shape[:2]

        if self.model is None:
            binary_mask_full = np.zeros((orig_h, orig_w), dtype=np.uint8)
            return VesselResult(binary_mask_full, image_bgr.copy(), 0.0)

        # Enhance local microvascular contrast using CLAHE prior to downsampling
        clahe_bgr = apply_clahe_lab(image_bgr)
        rgb = cv2.cvtColor(clahe_bgr, cv2.COLOR_BGR2RGB)
        resized = cv2.resize(rgb, (self.image_size, self.image_size))

        # Preprocess
        mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
        std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
        image = resized.astype(np.float32) / 255.0
        image = (image - mean) / std
        tensor = torch.from_numpy(image.transpose(2, 0, 1)).float().unsqueeze(0).to(self.device)

        with torch.no_grad():
            logits = self.model(tensor)
            probability = torch.sigmoid(logits)[0, 0].cpu().numpy()

        # Bilinear upsample continuous probability map to full original resolution
        # to eliminate 8-pixel blocky stair-stepping and preserve thin microvascular branches
        prob_full = cv2.resize(probability, (orig_w, orig_h), interpolation=cv2.INTER_LINEAR)
        binary_mask_full = (prob_full >= self.threshold).astype(np.uint8) * 255

        # Calculate exact coverage percentage at native full resolution
        vessel_density = float(np.sum(binary_mask_full > 0) / (orig_w * orig_h))

        # Build clean visual overlay at native resolution
        overlay_bgr_full = image_bgr.copy().astype(np.float32)
        cyan_layer = np.zeros_like(overlay_bgr_full)
        cyan_layer[binary_mask_full > 0] = [220, 220, 0]  # Cyan in BGR

        mask_bool = binary_mask_full > 0
        if np.any(mask_bool):
            overlay_bgr_full[mask_bool] = 0.55 * overlay_bgr_full[mask_bool] + 0.45 * cyan_layer[mask_bool]
        overlay_bgr_full = np.clip(overlay_bgr_full, 0, 255).astype(np.uint8)

        return VesselResult(
            binary_mask=binary_mask_full,
            overlay_bgr=overlay_bgr_full,
            vessel_density=vessel_density
        )
