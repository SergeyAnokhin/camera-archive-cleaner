"""
Runs once at Docker image build time.

Downloads yolov8n/s/m PyTorch weights, exports each to OpenVINO IR format,
moves the result into models/<name>_openvino_model/, then removes the .pt
file to keep the image lean.

detection.py checks for models/<name>_openvino_model/ at runtime and uses it
when found, so no code changes are needed there.
"""
from ultralytics import YOLO
import shutil
import os

os.makedirs("models", exist_ok=True)

for name in ["yolov8n", "yolov8s", "yolov8m"]:
    print(f"\n── Exporting {name} → OpenVINO IR ──────────────────")
    YOLO(f"{name}.pt").export(format="openvino")

    src = f"{name}_openvino_model"
    dst = f"models/{name}_openvino_model"
    shutil.move(src, dst)
    print(f"✓ saved to {dst}")

    # Remove the .pt weight to keep the image lean.
    pt_path = f"{name}.pt"
    if os.path.exists(pt_path):
        os.remove(pt_path)
        print(f"  removed {pt_path}")

print("\n✓ All OpenVINO exports complete.")
