"""Local YOLO / OpenVINO object detection. Stateless — image path in, results out."""
import base64
import io
import logging
import time
from pathlib import Path

from shared.coco_names import COCO_TO_RUSSIAN, excluded_to_en

logger = logging.getLogger("compute")

_yolo_models: dict = {}


def load_yolo(model_name: str):
    """Load YOLO model lazily. Tries local OpenVINO export first, falls back to .pt."""
    if model_name not in _yolo_models:
        from ultralytics import YOLO
        ov_path = Path(__file__).parent / "models" / f"{model_name}_openvino_model"
        if ov_path.exists():
            logger.info("🔷 Loading OpenVINO model: %s", ov_path)
            _yolo_models[model_name] = YOLO(str(ov_path), task="detect")
        else:
            logger.info("🔷 Loading PyTorch model: %s.pt (tip: export with "
                        "`yolo export model=%s.pt format=openvino` for faster Intel CPU inference)",
                        model_name, model_name)
            _yolo_models[model_name] = YOLO(f"{model_name}.pt", task="detect")
    return _yolo_models[model_name]


def detect(image_path: str, model: str, confidence: float,
           excluded: list[str], draw: bool):
    """Run detection on one image.

    Returns (objects_ru, annotated_jpeg_b64_or_None, elapsed_ms).
    `objects_ru` lists every detected class. The annotated image (if draw=True)
    has excluded classes removed before the boxes are rendered.
    """
    from PIL import Image as PILImage

    yolo = load_yolo(model)
    t0 = time.time()
    img = PILImage.open(image_path).convert("RGB")
    results = yolo(img, conf=confidence, verbose=False)

    # All detected Russian object names (before excluded filtering).
    seen: set[str] = set()
    objects_ru: list[str] = []
    for cls_id in results[0].boxes.cls.tolist():
        en = yolo.names[int(cls_id)]
        ru = COCO_TO_RUSSIAN.get(en, en)
        if ru not in seen:
            seen.add(ru)
            objects_ru.append(ru)

    jpeg_b64 = None
    if draw:
        excluded_en = excluded_to_en(set(excluded))
        if excluded_en and len(results[0].boxes):
            keep = [
                yolo.names[int(cls_id)].lower() not in excluded_en
                for cls_id in results[0].boxes.cls.tolist()
            ]
            results[0].boxes = results[0].boxes[keep]
        annotated_bgr = results[0].plot(line_width=3, font_size=12)
        annotated_rgb = annotated_bgr[:, :, ::-1]  # BGR → RGB
        out_img = PILImage.fromarray(annotated_rgb)
        out_img.thumbnail((640, 640), PILImage.LANCZOS)
        buf = io.BytesIO()
        out_img.save(buf, format="JPEG", quality=88)
        jpeg_b64 = base64.b64encode(buf.getvalue()).decode()

    elapsed_ms = int((time.time() - t0) * 1000)
    return objects_ru, jpeg_b64, elapsed_ms
