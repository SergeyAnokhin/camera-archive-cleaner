"""Local YOLO / OpenVINO object detection. Stateless — image path in, results out."""
import base64
import io
import logging
import time
from pathlib import Path



logger = logging.getLogger("compute")

_yolo_models: dict = {}


def load_yolo(model_name: str):
    """Load YOLO model lazily. Tries local OpenVINO export first, falls back to .pt."""
    if model_name not in _yolo_models:
        from ultralytics import YOLO
        ov_path = Path(__file__).parent / "models" / f"{model_name}_openvino_model"
        t0 = time.time()
        if ov_path.exists():
            logger.info("🔷 Loading OpenVINO model: %s", ov_path)
            _yolo_models[model_name] = YOLO(str(ov_path), task="detect")
        else:
            logger.info("🔷 Loading PyTorch model: %s.pt (tip: export with "
                        "`yolo export model=%s.pt format=openvino` for faster Intel CPU inference)",
                        model_name, model_name)
            _yolo_models[model_name] = YOLO(f"{model_name}.pt", task="detect")
        logger.info("🔷 Model %s ready in %.1f s", model_name, time.time() - t0)
    return _yolo_models[model_name]


def detect(image_path: str, model: str, confidence: float,
           draw: bool, classes: list[int] | None = None):
    """Run detection on one image.

    Returns (objects, annotated_jpeg_b64_or_None, elapsed_ms).
    `objects` lists every detected class using canonical English COCO names.
    `classes` restricts YOLO inference to the given COCO class IDs (None = all).
    """
    from PIL import Image as PILImage

    yolo = load_yolo(model)

    t0 = time.time()

    # --- stage 1: open image ---
    t_open = time.time()
    img = PILImage.open(image_path).convert("RGB")
    w, h = img.size
    logger.debug("  [1] image open+decode  %.1f ms  %dx%d", (time.time() - t_open) * 1000, w, h)

    # --- stage 2: YOLO inference ---
    t_infer = time.time()
    results = yolo(img, conf=confidence, classes=classes, verbose=False)
    n_boxes = len(results[0].boxes)
    logger.debug("  [2] YOLO inference     %.1f ms  boxes=%d", (time.time() - t_infer) * 1000, n_boxes)

    # --- stage 3: collect unique class names (canonical English) ---
    t_post = time.time()
    seen: set[str] = set()
    objects: list[str] = []
    for cls_id in results[0].boxes.cls.tolist():
        en = yolo.names[int(cls_id)]
        if en not in seen:
            seen.add(en)
            objects.append(en)
    logger.debug("  [3] name collect       %.1f ms  unique_classes=%d", (time.time() - t_post) * 1000, len(objects))

    # --- stage 4: draw + encode (only when draw=True) ---
    jpeg_b64 = None
    if draw:
        t_draw = time.time()
        annotated_bgr = results[0].plot(line_width=3, font_size=12)
        logger.debug("  [4a] plot boxes        %.1f ms", (time.time() - t_draw) * 1000)

        t_encode = time.time()
        annotated_rgb = annotated_bgr[:, :, ::-1]  # BGR → RGB
        out_img = PILImage.fromarray(annotated_rgb)
        out_img.thumbnail((640, 640), PILImage.LANCZOS)
        buf = io.BytesIO()
        out_img.save(buf, format="JPEG", quality=88)
        jpeg_b64 = base64.b64encode(buf.getvalue()).decode()
        jpeg_kb = len(buf.getvalue()) / 1024
        logger.debug("  [4b] JPEG encode       %.1f ms  jpeg=%.1f KB", (time.time() - t_encode) * 1000, jpeg_kb)

    elapsed_ms = int((time.time() - t0) * 1000)
    logger.debug("  [total detect]         %d ms", elapsed_ms)
    return objects, jpeg_b64, elapsed_ms
