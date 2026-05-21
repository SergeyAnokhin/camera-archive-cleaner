"""Local YOLO / OpenVINO object detection — no API key required."""
import logging
import time

from database import get_connection, get_file_by_id, save_ai_analysis
from yolo_detect import COCO_TO_RUSSIAN, load_yolo

logger = logging.getLogger("api")


def analyze_batch(file_ids, model_name="yolov8n", confidence=0.25):
    """Detect objects in the given photo files, save Russian object labels to DB."""
    from PIL import Image as PILImage

    yolo = load_yolo(model_name)

    with get_connection() as conn:
        file_rows = [get_file_by_id(conn, fid) for fid in file_ids]

    t0 = time.time()
    results_out: dict[int, list[str]] = {}
    saved_count = 0
    images_used = 0

    with get_connection() as conn:
        for row in file_rows:
            if row is None or row["file_type"] != "photo":
                continue
            fid = row["id"]
            try:
                img = PILImage.open(row["file_path"]).convert("RGB")
                images_used += 1
                detections = yolo(img, conf=confidence, verbose=False)
                seen: set[str] = set()
                objects_ru: list[str] = []
                for det in detections:
                    for cls_id in det.boxes.cls.tolist():
                        en = yolo.names[int(cls_id)]
                        ru = COCO_TO_RUSSIAN.get(en, en)
                        if ru not in seen:
                            seen.add(ru)
                            objects_ru.append(ru)
                objects_str = " ".join(objects_ru)
                save_ai_analysis(conn, fid, "openvino", model_name, "", "", objects_str)
                results_out[fid] = objects_ru
                saved_count += 1
            except Exception as e:
                logger.warning("OpenVINO: ошибка файла %s: %s", row["file_path"], e)

    elapsed_ms = int((time.time() - t0) * 1000)
    logger.info("🔷 OpenVINO %s: %d фото, %.0f мс, сохранено %d", model_name, images_used, elapsed_ms, saved_count)

    return {
        "elapsed_ms": elapsed_ms,
        "images_used": images_used,
        "saved_count": saved_count,
        "results": {str(k): v for k, v in results_out.items()},
    }


def analyze_range(camera_id, date_from, date_to, model_name="yolov8n", confidence=0.25):
    """Run detection over every photo in a camera/date-range window."""
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id FROM files WHERE camera_id=? AND timestamp>=? AND timestamp<=? "
            "AND file_type='photo' ORDER BY timestamp",
            (camera_id, date_from, date_to),
        ).fetchall()
    file_ids = [r[0] for r in rows]
    if not file_ids:
        return {"elapsed_ms": 0, "images_used": 0, "saved_count": 0, "results": {}}
    return analyze_batch(file_ids, model_name, confidence)
