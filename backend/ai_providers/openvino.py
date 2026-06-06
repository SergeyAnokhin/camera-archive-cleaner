"""Local object detection via the compute-service — saves Russian labels to DB.

The YOLO/OpenVINO inference itself runs in the compute-service; this module
owns the DB read (file paths) and DB write (detected objects).
"""
import base64
import logging
import time

import compute_client
from compute_cache import ov_cache_path, video_cache_path, OV_THUMB_DIR, VID_THUMB_DIR
from database import get_connection, get_file_by_id, save_ai_analysis

logger = logging.getLogger("api")


def analyze_batch(file_ids, model_name="yolov8n", confidence=0.25, classes=None):
    """Detect objects in the given photo files, save Russian object labels to DB.

    Also caches the bounding-box JPEG so the HourViewer thumbnail endpoint
    returns it from disk without calling the compute-service again.
    """
    with get_connection() as conn:
        file_rows = [get_file_by_id(conn, fid) for fid in file_ids]

    classes_tuple = tuple(sorted(classes)) if classes else None
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
                result = compute_client.detect(
                    row["file_path"], model_name, confidence, draw=True,
                    classes=classes)
                images_used += 1
                save_ai_analysis(conn, fid, "openvino", model_name, "", "",
                                 " ".join(result.objects))
                results_out[fid] = result.objects
                saved_count += 1

                if result.annotated_jpeg_b64:
                    cache_path = ov_cache_path(fid, model_name, confidence, classes_tuple)
                    OV_THUMB_DIR.mkdir(exist_ok=True)
                    cache_path.write_bytes(base64.b64decode(result.annotated_jpeg_b64))

            except (compute_client.ComputeDisabled, compute_client.ComputeUnavailable):
                raise
            except Exception as e:
                logger.warning("OpenVINO: ошибка файла %s: %s", row["file_path"], e)

    elapsed_ms = int((time.time() - t0) * 1000)
    logger.info("🔷 OpenVINO %s: %d фото, %.0f мс, сохранено %d",
                model_name, images_used, elapsed_ms, saved_count)

    return {
        "elapsed_ms": elapsed_ms,
        "images_used": images_used,
        "saved_count": saved_count,
        "results": {str(k): v for k, v in results_out.items()},
    }


def analyze_range(camera_id, date_from, date_to, model_name="yolov8n", confidence=0.25,
                  classes=None, video_thumb_mode=None):
    """Run detection over every photo in a camera/date-range window.

    If video_thumb_mode is set (and not 'none'), also pre-generates video
    thumbnails for all video files in the same date range.
    """
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id FROM files WHERE camera_id=? AND timestamp>=? AND timestamp<=? "
            "AND file_type='photo' ORDER BY timestamp",
            (camera_id, date_from, date_to),
        ).fetchall()
    file_ids = [r[0] for r in rows]
    result = {"elapsed_ms": 0, "images_used": 0, "saved_count": 0, "results": {}}
    if file_ids:
        result = analyze_batch(file_ids, model_name, confidence, classes)

    if video_thumb_mode and video_thumb_mode != "none":
        _pregen_video_thumbs(camera_id, date_from, date_to, video_thumb_mode)

    return result


def _pregen_video_thumbs(camera_id, date_from, date_to, mode):
    """Pre-generate and cache video thumbnails for all video files in range."""
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, file_path FROM files "
            "WHERE camera_id=? AND timestamp>=? AND timestamp<=? AND file_type='video' "
            "ORDER BY timestamp",
            (camera_id, date_from, date_to),
        ).fetchall()

    generated = 0
    for row in rows:
        cache_path = video_cache_path(row["id"], mode)
        if cache_path.exists():
            continue
        try:
            data, _ = compute_client.video_thumbnail(row["file_path"], mode)
            VID_THUMB_DIR.mkdir(exist_ok=True)
            cache_path.write_bytes(data)
            generated += 1
        except (compute_client.ComputeDisabled, compute_client.ComputeUnavailable):
            raise
        except Exception as e:
            logger.warning("Video thumb error %s: %s", row["file_path"], e)

    if generated:
        logger.info("🎬 Video thumbnails (%s): %d сгенерировано", mode, generated)
