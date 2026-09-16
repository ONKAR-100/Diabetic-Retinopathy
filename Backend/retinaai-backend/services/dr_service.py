import json
import cv2
import numpy as np
import torch
import torch.nn.functional as F
from dataclasses import dataclass
from typing import List, Optional
import timm
from config import settings


@dataclass
class DRResult:
    grade: int
    grade_name: str
    class_probabilities: List[float]
    confidence_raw: float
    referable: bool


# ── Preprocessing (matches Part 3/4 notebook exactly) ────────────────────────

def crop_black_border(image):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    mask = (gray > 10).astype(np.uint8)
    coords = cv2.findNonZero(mask)
    if coords is None:
        return image
    x, y, w, h = cv2.boundingRect(coords)
    pad_x = int(0.02 * w)
    pad_y = int(0.02 * h)
    x1 = max(0, x - pad_x)
    y1 = max(0, y - pad_y)
    x2 = min(image.shape[1], x + w + pad_x)
    y2 = min(image.shape[0], y + h + pad_y)
    cropped = image[y1:y2, x1:x2]
    if cropped.shape[0] < 50 or cropped.shape[1] < 50:
        return image
    return cropped


def graham_illumination_correction(image, sigma_ratio=0.30):
    h, w = image.shape[:2]
    sigma = max(h, w) * sigma_ratio
    kernel_size = int(max(3, round(sigma * 6)))
    if kernel_size % 2 == 0:
        kernel_size += 1
    background = cv2.GaussianBlur(image, (kernel_size, kernel_size), sigmaX=sigma, sigmaY=sigma)
    background = background.astype(np.float32) + 1.0
    image_float = image.astype(np.float32) + 1.0
    corrected = image_float / background
    corrected *= 128.0
    return np.clip(corrected, 0, 255).astype(np.uint8)


def apply_lab_clahe(image, clip_limit=2.0, tile_grid=(8, 8)):
    lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
    l_channel, a_channel, b_channel = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=tile_grid)
    l_channel = clahe.apply(l_channel)
    enhanced = cv2.merge([l_channel, a_channel, b_channel])
    return cv2.cvtColor(enhanced, cv2.COLOR_LAB2BGR)


def preprocess_fundus(image_bgr: np.ndarray, output_size: int = 300) -> np.ndarray:
    """Full preprocessing pipeline matching the Part 3 notebook."""
    image = crop_black_border(image_bgr)
    image = cv2.resize(image, (512, 512), interpolation=cv2.INTER_AREA)
    image = graham_illumination_correction(image)
    image = apply_lab_clahe(image)
    image = cv2.resize(image, (output_size, output_size), interpolation=cv2.INTER_AREA)
    return cv2.cvtColor(image, cv2.COLOR_BGR2RGB)


def image_to_tensor(processed_rgb: np.ndarray, mean: np.ndarray, std: np.ndarray, device) -> torch.Tensor:
    image = processed_rgb.astype(np.float32) / 255.0
    image = np.transpose(image, (2, 0, 1))
    tensor = torch.from_numpy(image).float().unsqueeze(0).to(device)
    mean_t = torch.tensor(mean, dtype=torch.float32, device=device).view(1, 3, 1, 1)
    std_t = torch.tensor(std, dtype=torch.float32, device=device).view(1, 3, 1, 1)
    return (tensor - mean_t) / std_t


# ── DR Service ────────────────────────────────────────────────────────────────

class DRService:
    def __init__(self):
        self.model: Optional[torch.nn.Module] = None
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.mean = np.array([0.44731683, 0.45017612, 0.45072937], dtype=np.float32)
        self.std = np.array([0.19789997, 0.2047193,  0.20049962], dtype=np.float32)
        self.input_size = 300
        self.referable_threshold = 0.425
        self.use_tta = True  # horizontal flip TTA (matches notebook)
        self.class_names = ['No DR', 'Mild DR', 'Moderate DR', 'Severe DR', 'Proliferative DR']

    def load(self, checkpoint_path: str):
        """
        Load the single best_efficientnet_b2.pth checkpoint exactly as
        the Part 3 notebook does.  Normalization is read from
        normalization_stats.json next to the model.
        """
        try:
            # ── Load normalization stats from JSON (same as notebook) ──────
            norm_path = settings.DR_NORM_PATH
            try:
                with open(norm_path, "r", encoding="utf-8") as f:
                    norm = json.load(f)
                self.mean = np.array(norm["mean"], dtype=np.float32)
                self.std  = np.array(norm["std"],  dtype=np.float32)
                print(f"  Normalization loaded from {norm_path}")
                print(f"  Mean: {self.mean}  Std: {self.std}")
            except Exception as e:
                print(f"  Warning: could not load normalization JSON ({e}). Using defaults.")

            # ── Create same EfficientNet-B2 as Part 2/3 training ──────────
            self.model = timm.create_model(
                "efficientnet_b2",
                pretrained=False,
                num_classes=5,
                drop_rate=0.30,
                drop_path_rate=0.20,
            )

            # ── Load checkpoint ───────────────────────────────────────────
            checkpoint = torch.load(checkpoint_path, map_location="cpu")

            if isinstance(checkpoint, dict):
                if "model_state_dict" in checkpoint:
                    state_dict = checkpoint["model_state_dict"]
                    print("  Using key: model_state_dict")
                elif "ema_state_dict" in checkpoint:
                    state_dict = checkpoint["ema_state_dict"]
                    print("  Using key: ema_state_dict")
                elif "state_dict" in checkpoint:
                    state_dict = checkpoint["state_dict"]
                    print("  Using key: state_dict")
                else:
                    state_dict = checkpoint
                    print("  Using raw checkpoint dict as state_dict")
            else:
                state_dict = checkpoint

            # Remove DataParallel "module." prefix if present
            clean_state_dict = {
                (k[len("module."):] if k.startswith("module.") else k): v
                for k, v in state_dict.items()
            }

            missing, unexpected = self.model.load_state_dict(clean_state_dict, strict=False)
            if missing:
                print(f"  ⚠ Missing keys ({len(missing)}): {missing[:3]}")
            if unexpected:
                print(f"  ⚠ Unexpected keys ({len(unexpected)}): {unexpected[:3]}")

            self.model = self.model.to(self.device)
            self.model.eval()
            print("DR Model loaded successfully (single EfficientNet-B2)")

        except Exception as e:
            print(f"Error loading DR model: {e}")
            import traceback
            traceback.print_exc()
            self.model = None

    def predict(self, image_bgr: np.ndarray) -> DRResult:
        if self.model is None:
            return DRResult(0, "Model Not Loaded", [0.2] * 5, 0.2, False)

        processed_rgb = preprocess_fundus(image_bgr, output_size=self.input_size)
        tensor = image_to_tensor(processed_rgb, self.mean, self.std, self.device)

        all_probs = []
        with torch.no_grad():
            # Normal pass
            logits = self.model(tensor)
            all_probs.append(torch.softmax(logits, dim=1)[0].cpu().numpy())

            if self.use_tta:
                # Horizontal flip TTA (matches notebook)
                flipped = torch.flip(tensor, dims=[3])
                logits_f = self.model(flipped)
                all_probs.append(torch.softmax(logits_f, dim=1)[0].cpu().numpy())

        probs = np.mean(all_probs, axis=0)

        grade = int(np.argmax(probs))
        confidence_raw = float(probs[grade])

        # Use tuned threshold on referable probability (grades 2+)
        referable_prob = float(probs[2] + probs[3] + probs[4])
        referable = referable_prob >= self.referable_threshold

        return DRResult(
            grade=grade,
            grade_name=self.class_names[grade],
            class_probabilities=probs.tolist(),
            confidence_raw=confidence_raw,
            referable=referable,
        )

    def get_primary_model(self) -> Optional[torch.nn.Module]:
        """Return the loaded model — used by GradCAMService."""
        return self.model
