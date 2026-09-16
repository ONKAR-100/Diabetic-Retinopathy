import cv2
import numpy as np
import torch
import torch.nn.functional as F
from typing import Optional
from dataclasses import dataclass
from services.dr_service import preprocess_fundus, image_to_tensor
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt


@dataclass
class GradCAMResult:
    heatmap_bgr: np.ndarray
    overlay_bgr: np.ndarray


# ──────────────────────────────────────────────────────────────────────────────
# GradCAM class — matches notebook Section 21 exactly
# ──────────────────────────────────────────────────────────────────────────────

class GradCAM:
    def __init__(self, model, target_layer):
        self.model = model
        self.target_layer = target_layer
        self.activations = None
        self.gradients = None

        self.forward_handle = target_layer.register_forward_hook(self.save_activation)
        self.backward_handle = target_layer.register_full_backward_hook(self.save_gradient)

    def save_activation(self, module, input, output):
        self.activations = output.detach()

    def save_gradient(self, module, grad_input, grad_output):
        if grad_output and grad_output[0] is not None:
            self.gradients = grad_output[0].detach()

    def generate(self, input_tensor, target_class):
        self.activations = None
        self.gradients = None
        self.model.zero_grad(set_to_none=True)

        # NOTE: Do NOT wrap in torch.no_grad() — Grad-CAM needs gradients
        logits = self.model(input_tensor)
        target_score = logits[0, target_class]
        target_score.backward()

        if self.activations is None or self.gradients is None:
            return None

        # Global-average-pool gradients over spatial dims
        weights = torch.mean(self.gradients, dim=(2, 3), keepdim=True)
        # Weighted sum of feature maps
        cam = torch.sum(weights * self.activations, dim=1, keepdim=True)
        # Positive contributions only (ReLU)
        cam = F.relu(cam)
        # Upsample to model input resolution (300×300)
        cam = F.interpolate(cam, size=(300, 300), mode="bilinear", align_corners=False)
        cam = cam[0, 0]

        # Normalize 0→1
        cam_min = cam.min()
        cam_max = cam.max()
        cam = (cam - cam_min) / (cam_max - cam_min + 1e-8)

        return cam.cpu().numpy()

    def remove_hooks(self):
        self.forward_handle.remove()
        self.backward_handle.remove()


# ──────────────────────────────────────────────────────────────────────────────
# Retina mask — extract the circular retinal field from an image
# Uses the same gray > 10 threshold as crop_black_border() in the notebook
# ──────────────────────────────────────────────────────────────────────────────

def extract_retina_mask(image_bgr: np.ndarray) -> np.ndarray:
    """
    Returns a binary uint8 mask (same H×W as image_bgr) where 255 = retinal
    tissue and 0 = dark background.

    Steps:
        1. Grayscale threshold (>10) to detect non-black region
        2. Morphological closing to fill small holes
        3. Keep the largest connected component (the retina disc)
    """
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    _, mask = cv2.threshold(gray, 10, 255, cv2.THRESH_BINARY)

    # Close small gaps
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)

    # Keep only the largest blob (the retina)
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    if num_labels > 1:
        # Component 0 is background; find the largest foreground component
        areas = stats[1:, cv2.CC_STAT_AREA]
        largest = int(np.argmax(areas)) + 1
        mask = np.where(labels == largest, np.uint8(255), np.uint8(0))

    return mask


# ──────────────────────────────────────────────────────────────────────────────
# Heatmap helpers — match notebook Sections 23 & 24
# ──────────────────────────────────────────────────────────────────────────────

def create_heatmap(cam: np.ndarray, retina_mask: Optional[np.ndarray] = None) -> np.ndarray:
    """
    Convert a normalized [0,1] CAM array into an RGB jet colormap image.

    If retina_mask is supplied, background pixels are zeroed out in the CAM
    BEFORE colorizing so they stay black (no halo around the retina).
    """
    cam_masked = cam.copy()
    if retina_mask is not None:
        # Scale mask to [0,1] float and zero background in the CAM
        m = (retina_mask > 127).astype(np.float32)
        # Resize mask to match CAM resolution
        if m.shape != cam_masked.shape:
            m = cv2.resize(m, (cam_masked.shape[1], cam_masked.shape[0]),
                           interpolation=cv2.INTER_NEAREST)
        cam_masked = cam_masked * m

    # Gaussian blur for a smooth heatmap (notebook uses matplotlib's bilinear
    # display; we need to do it explicitly for file output)
    cam_smooth = cv2.GaussianBlur(cam_masked, (0, 0), sigmaX=8, sigmaY=8)

    heatmap_rgba = plt.cm.jet(cam_smooth)
    heatmap_rgb = (heatmap_rgba[..., :3] * 255.0).astype(np.uint8)

    # Black out background pixels in the heatmap as well
    if retina_mask is not None:
        m_uint8 = cv2.resize(retina_mask, (heatmap_rgb.shape[1], heatmap_rgb.shape[0]),
                             interpolation=cv2.INTER_NEAREST)
        heatmap_rgb[m_uint8 == 0] = 0

    return heatmap_rgb


def create_overlay(base_rgb: np.ndarray, cam: np.ndarray,
                   retina_mask: Optional[np.ndarray] = None,
                   alpha: float = 0.45) -> np.ndarray:
    """
    Blend the jet heatmap onto base_rgb.

    base_rgb    — the original (or processed) RGB image at ANY resolution.
                  The CAM and mask are resized to match it before blending.
    cam         — normalized [0,1] array from GradCAM.generate()
    retina_mask — binary mask at the original image resolution
    alpha       — heatmap opacity (0 = invisible, 1 = heatmap only)
    """
    h, w = base_rgb.shape[:2]

    # ── Resize CAM to the base image resolution ───────────────────────────
    cam_resized = cv2.resize(cam, (w, h), interpolation=cv2.INTER_LINEAR)

    # ── Mask the CAM (zero background before colorizing) ─────────────────
    cam_masked = cam_resized.copy()
    if retina_mask is not None:
        m = (retina_mask > 127).astype(np.float32)
        m = cv2.resize(m, (w, h), interpolation=cv2.INTER_NEAREST)
        cam_masked = cam_masked * m

    # ── Smooth ────────────────────────────────────────────────────────────
    cam_smooth = cv2.GaussianBlur(cam_masked, (0, 0), sigmaX=max(3, int(min(h, w) * 0.02)),
                                  sigmaY=max(3, int(min(h, w) * 0.02)))

    # ── Colorize ──────────────────────────────────────────────────────────
    heatmap_rgba = plt.cm.jet(cam_smooth)
    heatmap_rgb = (heatmap_rgba[..., :3] * 255.0).astype(np.float32)

    # ── Blend ─────────────────────────────────────────────────────────────
    base = base_rgb.astype(np.float32)
    overlay = (1.0 - alpha) * base + alpha * heatmap_rgb

    # ── Restore black background ──────────────────────────────────────────
    if retina_mask is not None:
        m_uint8 = cv2.resize(retina_mask, (w, h), interpolation=cv2.INTER_NEAREST)
        # Where background: keep the original image (no heatmap tint)
        bg = m_uint8 == 0
        overlay[bg] = base[bg]

    return np.clip(overlay, 0, 255).astype(np.uint8)


# ──────────────────────────────────────────────────────────────────────────────
# Main service
# ──────────────────────────────────────────────────────────────────────────────

class GradCAMService:
    # Default normalization — overridden by the actual values from dr_service at runtime
    _DEFAULT_MEAN = np.array([0.44731683, 0.45017612, 0.45072937], dtype=np.float32)
    _DEFAULT_STD  = np.array([0.19789997, 0.2047193,  0.20049962], dtype=np.float32)

    def generate(self, image_bgr: np.ndarray, model, target_class: int, device,
                 mean: np.ndarray = None, std: np.ndarray = None) -> GradCAMResult:
        if model is None:
            return GradCAMResult(np.zeros_like(image_bgr), image_bgr)

        if mean is None:
            mean = self._DEFAULT_MEAN
        if std is None:
            std = self._DEFAULT_STD

        orig_h, orig_w = image_bgr.shape[:2]

        # ── 1. Extract retina mask from the ORIGINAL image ─────────────────
        retina_mask = extract_retina_mask(image_bgr)   # shape: (orig_h, orig_w)

        # ── 2. Preprocess for the model (→ 300×300 RGB) ───────────────────
        processed_rgb = preprocess_fundus(image_bgr, output_size=300)

        # ── 3. Build input tensor ─────────────────────────────────────────
        tensor = image_to_tensor(processed_rgb, mean, std, device)

        # ── 4. Attach GradCAM hooks and generate CAM ──────────────────────
        try:
            target_layer = model.conv_head
        except AttributeError:
            target_layer = list(model.children())[-2]

        gradcam = GradCAM(model, target_layer)
        cam = gradcam.generate(tensor, target_class)
        gradcam.remove_hooks()

        if cam is None:
            return GradCAMResult(np.zeros_like(image_bgr), image_bgr)

        # ── 5. Convert original BGR → RGB for overlay ─────────────────────
        original_rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)

        # ── 6. Build heatmap (CAM at 300×300 with mask at 300×300) ────────
        # Resize mask to 300×300 to match CAM for standalone heatmap image
        mask_300 = cv2.resize(retina_mask, (300, 300), interpolation=cv2.INTER_NEAREST)
        heatmap_rgb_300 = create_heatmap(cam, retina_mask=mask_300)
        # Upscale heatmap to original dims
        heatmap_rgb = cv2.resize(heatmap_rgb_300, (orig_w, orig_h), interpolation=cv2.INTER_LINEAR)

        # ── 7. Build overlay on the ORIGINAL image ────────────────────────
        overlay_rgb = create_overlay(
            base_rgb=original_rgb,
            cam=cam,
            retina_mask=retina_mask,   # at original resolution
            alpha=0.45,
        )

        # ── 8. Convert back to BGR for cv2.imwrite ────────────────────────
        overlay_bgr = cv2.cvtColor(overlay_rgb, cv2.COLOR_RGB2BGR)
        heatmap_bgr = cv2.cvtColor(heatmap_rgb, cv2.COLOR_RGB2BGR)

        return GradCAMResult(heatmap_bgr=heatmap_bgr, overlay_bgr=overlay_bgr)
