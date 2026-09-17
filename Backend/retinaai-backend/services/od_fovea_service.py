from typing import Optional
import cv2
import numpy as np
import torch
import torch.nn as nn
import segmentation_models_pytorch as smp
from dataclasses import dataclass

@dataclass
class ODFoveaResult:
    optic_disc_x: Optional[float]
    optic_disc_y: Optional[float]
    optic_disc_confidence: float
    fovea_x: Optional[float]
    fovea_y: Optional[float]
    fovea_confidence: float
    overlay_bgr: np.ndarray

class ResUNet(nn.Module):
    def __init__(self):
        super().__init__()
        self.model = smp.Unet(
            encoder_name="resnet18",
            encoder_weights=None,
            in_channels=3,
            classes=2,
            activation=None,
            encoder_depth=4,
            decoder_channels=(128, 64, 32, 16),
            decoder_use_batchnorm=True,
            decoder_attention_type=None,
        )
        self.dropout = nn.Dropout2d(p=0.2)

    def forward(self, x):
        logits = self.model(x)
        if self.training:
            logits = self.dropout(logits)
        return logits

class ODFoveaService:
    def __init__(self):
        self.model = None
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.image_size = 512
        self.confidence_threshold = 0.30

    def load(self, checkpoint_path: str):
        try:
            checkpoint = torch.load(checkpoint_path, map_location=self.device, weights_only=False)
            self.model = ResUNet().to(self.device)
            if "model_state_dict" in checkpoint:
                self.model.load_state_dict(checkpoint["model_state_dict"], strict=True)
            else:
                self.model.load_state_dict(checkpoint, strict=True)
            self.model.eval()
        except Exception as e:
            print(f"Error loading OD/Fovea model: {e}")
            self.model = None

    def predict(self, image_bgr: np.ndarray) -> ODFoveaResult:
        orig_h, orig_w = image_bgr.shape[:2]
        
        if self.model is None:
            return ODFoveaResult(None, None, 0.0, None, None, 0.0, image_bgr)

        rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
        resized = cv2.resize(rgb, (self.image_size, self.image_size))
        
        mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
        std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
        image = resized.astype(np.float32) / 255.0
        image = (image - mean) / std
        tensor = torch.from_numpy(image.transpose(2, 0, 1)).float().unsqueeze(0).to(self.device)

        with torch.no_grad():
            logits = self.model(tensor)
            probs = torch.sigmoid(logits)[0].cpu().numpy()

        def decode_argmax(heatmap):
            y, x = np.unravel_index(np.argmax(heatmap), heatmap.shape)
            return float(x), float(y), float(heatmap[y, x])

        od_x_512, od_y_512, od_conf = decode_argmax(probs[0])
        fov_x_512, fov_y_512, fov_conf = decode_argmax(probs[1])

        od_valid = od_conf >= self.confidence_threshold
        fov_valid = fov_conf >= self.confidence_threshold

        od_mask = (probs[0] > self.confidence_threshold).astype(np.uint8) if od_valid else np.zeros((self.image_size, self.image_size), dtype=np.uint8)
        fov_mask = (probs[1] > self.confidence_threshold).astype(np.uint8) if fov_valid else np.zeros((self.image_size, self.image_size), dtype=np.uint8)
        
        # Resize masks back to original resolution before blending
        od_mask_full = cv2.resize(od_mask, (orig_w, orig_h), interpolation=cv2.INTER_NEAREST)
        fov_mask_full = cv2.resize(fov_mask, (orig_w, orig_h), interpolation=cv2.INTER_NEAREST)
        
        # Build overlay directly on the original image for crisp markers
        overlay = image_bgr.copy().astype(np.float32)
        color_layer = np.zeros_like(overlay)
        if od_valid:
            color_layer[od_mask_full > 0] = (0, 255, 0)     # Green OD (BGR)
        if fov_valid:
            color_layer[fov_mask_full > 0] = (19, 69, 139)  # Brown fovea (BGR)
        
        combined = (od_mask_full | fov_mask_full) > 0
        if np.any(combined):
            overlay[combined] = (1.0 - 0.4) * overlay[combined] + 0.4 * color_layer[combined]
        overlay_bgr = np.clip(overlay, 0, 255).astype(np.uint8)

        # Scale marker coordinates to original dimensions only if confident
        if od_valid:
            od_x_full = float(od_x_512 * orig_w / self.image_size)
            od_y_full = float(od_y_512 * orig_h / self.image_size)
            cv2.drawMarker(overlay_bgr, (int(round(od_x_full)), int(round(od_y_full))), (0, 255, 0), markerType=cv2.MARKER_CROSS, markerSize=20, thickness=2)
        else:
            od_x_full = None
            od_y_full = None

        if fov_valid:
            fov_x_full = float(fov_x_512 * orig_w / self.image_size)
            fov_y_full = float(fov_y_512 * orig_h / self.image_size)
            cv2.drawMarker(overlay_bgr, (int(round(fov_x_full)), int(round(fov_y_full))), (19, 69, 139), markerType=cv2.MARKER_CROSS, markerSize=20, thickness=2)
        else:
            fov_x_full = None
            fov_y_full = None

        return ODFoveaResult(
            optic_disc_x=od_x_full,
            optic_disc_y=od_y_full,
            optic_disc_confidence=od_conf,
            fovea_x=fov_x_full,
            fovea_y=fov_y_full,
            fovea_confidence=fov_conf,
            overlay_bgr=overlay_bgr
        )
