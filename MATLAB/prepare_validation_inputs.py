import os
import sys
import time
import json
import cv2
import numpy as np

backend_dir = r"c:\GitHub Projects\Diabetic-Retinopathy\Backend\retinaai-backend"
sys.path.insert(0, backend_dir)

from services.od_fovea_service import ODFoveaService
from services.vessel_service import VesselService

upload_dir = r"c:\GitHub Projects\Diabetic-Retinopathy\Backend\retinaai-backend\static\uploads"
val_data_dir = r"c:\GitHub Projects\Diabetic-Retinopathy\MATLAB\validation_data"
masks_dir = os.path.join(val_data_dir, "masks")
os.makedirs(masks_dir, exist_ok=True)

od_model_path = r"c:\GitHub Projects\Diabetic-Retinopathy\Models\od_fovea_localization\best_fundus_localization_model.pth"
vessel_model_path = r"c:\GitHub Projects\Diabetic-Retinopathy\Models\vessel_extraction\Vessel_Model"

print("Loading PyTorch models...")
od_svc = ODFoveaService()
od_svc.load(od_model_path)

vessel_svc = VesselService()
vessel_svc.load(vessel_model_path)
print("Models loaded successfully.")

cohort = [
    {"id": "0455d569_left",  "filename": "0455d569-c262-48f1-b038-11c90c587ba2_left.jpg",  "eye": "left"},
    {"id": "600a91b1_right", "filename": "600a91b1-fdee-4d16-80c8-bcf5bcf52e29_right.jpg", "eye": "right"},
    {"id": "6f2667bf_left",  "filename": "6f2667bf-f9fa-4c0d-be79-aebb8d280ba0_left.jpg",  "eye": "left"},
    {"id": "6f2667bf_right", "filename": "6f2667bf-f9fa-4c0d-be79-aebb8d280ba0_right.jpg", "eye": "right"},
    {"id": "714a9ff2_left",  "filename": "714a9ff2-96f4-4384-898c-f8618d425f47_left.jpg",  "eye": "left"},
    {"id": "714a9ff2_right", "filename": "714a9ff2-96f4-4384-898c-f8618d425f47_right.jpg", "eye": "right"},
    {"id": "89192ce5_left",  "filename": "89192ce5-47ad-463a-8f38-7643dbab1f51_left.jpg",  "eye": "left"},
    {"id": "89192ce5_right", "filename": "89192ce5-47ad-463a-8f38-7643dbab1f51_right.jpg", "eye": "right"},
    {"id": "c0899a3c_left",  "filename": "c0899a3c-311f-4750-b729-68cfe86c52fa_left.jpg",  "eye": "left"},
    {"id": "ed9cfaad_right", "filename": "ed9cfaad-17d6-418f-bed3-6e4b1ff4812d_right.jpg", "eye": "right"}
]

manifest = []

for idx, item in enumerate(cohort, start=1):
    img_path = os.path.join(upload_dir, item["filename"])
    if not os.path.exists(img_path):
        print(f"[{idx}/10] ERROR: {img_path} not found!")
        continue

    print(f"[{idx}/10] Processing {item['id']} ({item['eye']})...")
    bgr = cv2.imread(img_path)
    h, w = bgr.shape[:2]

    t0 = time.time()
    # 1. Landmark prediction
    od_fov_res = od_svc.predict(bgr)

    # 2. Vessel segmentation inference
    v_res = vessel_svc.predict(bgr)
    py_runtime = time.time() - t0

    mask_filename = f"{item['id']}_mask.png"
    mask_path = os.path.join(masks_dir, mask_filename)
    cv2.imwrite(mask_path, v_res.binary_mask)

    entry = {
        "index": idx,
        "sample_id": item["id"],
        "eye": item["eye"],
        "image_path": img_path,
        "mask_path": mask_path,
        "width": w,
        "height": h,
        "od_x": od_fov_res.optic_disc_x,
        "od_y": od_fov_res.optic_disc_y,
        "od_conf": float(od_fov_res.optic_disc_confidence),
        "fovea_x": od_fov_res.fovea_x,
        "fovea_y": od_fov_res.fovea_y,
        "fovea_conf": float(od_fov_res.fovea_confidence),
        "fovea_gated": bool(od_fov_res.fovea_x is None),
        "py_vessel_density": float(v_res.vessel_density),
        "py_runtime_sec": round(py_runtime, 3)
    }
    manifest.append(entry)
    print(f"       OD: ({entry['od_x']}, {entry['od_y']}) [conf={entry['od_conf']:.3f}]")
    print(f"       Fovea: ({entry['fovea_x']}, {entry['fovea_y']}) [conf={entry['fovea_conf']:.3f}, gated={entry['fovea_gated']}]")
    print(f"       Vessel Density: {entry['py_vessel_density']*100:.2f}%, Python runtime: {py_runtime:.2f}s")

manifest_path = os.path.join(val_data_dir, "validation_manifest.json")
with open(manifest_path, "w") as f:
    json.dump(manifest, f, indent=2)

print(f"\nManifest successfully generated and saved to: {manifest_path}")
