"""openvino task — local YOLO object detection for photos via the compute-service."""
import asyncio
import base64
import logging
import time

import compute_client
from compute_cache import ov_cache_path, OV_THUMB_DIR
from database import get_connection, save_object_detection

from task_executors.common import (
    PROGRESS_INTERVAL, SpeedTracker, mark_completed, pause_if_requested,
    pause_on_compute_unavailable, write_progress,
)
from task_executors.video_thumbnails import pregen_video_thumbs_sync

logger = logging.getLogger("api")

# Same default as DETECTION_CLASSES_DEFAULT in cocoClasses.js
# Used when no classes are baked into the task params (old tasks)
_CLASSES_DEFAULT = [0, 14, 15, 16, 24, 26]  # person, bird, cat, dog, backpack, handbag


def _detect_and_save(file_id: int, file_path: str, model_name: str, confidence: float,
                     classes=None, classes_tuple=None) -> None:
    result = compute_client.detect(file_path, model_name, confidence, draw=True, classes=classes)
    with get_connection() as conn:
        save_object_detection(conn, file_id, model_name, " ".join(result.objects))
    if result.annotated_jpeg_b64:
        cache_path = ov_cache_path(file_id, model_name, confidence, classes_tuple)
        OV_THUMB_DIR.mkdir(exist_ok=True)
        cache_path.write_bytes(base64.b64decode(result.annotated_jpeg_b64))


async def run(task_id: str, params: dict, resume_from: int) -> None:
    camera_id = params["camera_id"]
    date_from = params["date_from"]
    date_to = params["date_to"]
    model_name = params.get("model_name", "yolov8n")
    confidence = params.get("confidence", 0.25)
    classes = params.get("classes") or _CLASSES_DEFAULT
    video_thumb_mode = params.get("video_thumb_mode")
    classes_tuple = tuple(sorted(classes)) if classes else None
    reprocess_existing = params.get("reprocess_existing", False)

    with get_connection() as conn:
        total = conn.execute(
            "SELECT COUNT(*) AS n FROM files "
            "WHERE camera_id=? AND timestamp>=? AND timestamp<=? AND file_type='photo'",
            (camera_id, date_from, date_to),
        ).fetchone()["n"]
        rows = conn.execute(
            "SELECT id, file_path FROM files "
            "WHERE camera_id=? AND timestamp>=? AND timestamp<=? AND file_type='photo' "
            "ORDER BY timestamp LIMIT -1 OFFSET ?",
            (camera_id, date_from, date_to, resume_from),
        ).fetchall()

    skip_set: set = set()
    if not reprocess_existing:
        with get_connection() as conn:
            existing = conn.execute(
                "SELECT od.file_id FROM object_detection od "
                "JOIN files f ON f.id=od.file_id "
                "WHERE f.camera_id=? AND f.timestamp>=? AND f.timestamp<=? AND f.file_type='photo'",
                (camera_id, date_from, date_to),
            ).fetchall()
        skip_set = {r["file_id"] for r in existing}

    await asyncio.to_thread(write_progress, task_id, resume_from, total, None, None, None, None)

    window_sec = float(params.get("eta_window_minutes", 5)) * 60
    tracker = SpeedTracker(window_sec)
    processed = 0
    error_count = 0
    max_errors = params.get("max_errors", None)
    last_save = time.time()

    for row in rows:
        if await pause_if_requested(task_id, resume_from + processed, total):
            return

        file_id = row["id"]
        file_path = row["file_path"]

        if file_id in skip_set:
            processed += 1
            tracker.record(resume_from + processed)
            continue

        try:
            await asyncio.to_thread(_detect_and_save, file_id, file_path, model_name, confidence,
                                    classes, classes_tuple)
        except compute_client.ComputeDisabled as e:
            raise Exception(f"Compute service is disabled: {e}")
        except compute_client.ComputeUnavailable as e:
            await pause_on_compute_unavailable(task_id, e, resume_from + processed,
                                               total, file_id, file_path)
            return
        except Exception as e:
            logger.warning("OpenVINO error %s: %s", file_path, e)
            error_count += 1
            if max_errors and error_count >= max_errors:
                current = resume_from + processed
                await asyncio.to_thread(write_progress, task_id, current, total,
                                        file_id, file_path, None, None)
                raise Exception(
                    f"Слишком много ошибок ({error_count}), задача остановлена. "
                    f"Последний файл: {file_path}"
                )

        processed += 1
        current = resume_from + processed
        tracker.record(current)
        speed = tracker.speed()
        remaining = total - current
        eta = int(remaining / speed) if speed and speed > 0 else None

        if time.time() - last_save >= PROGRESS_INTERVAL:
            await asyncio.to_thread(write_progress, task_id, current, total,
                                    file_id, file_path, speed, eta)
            last_save = time.time()

    final = resume_from + processed

    if video_thumb_mode and video_thumb_mode != "none":
        try:
            await asyncio.to_thread(pregen_video_thumbs_sync, camera_id, date_from, date_to, video_thumb_mode)
        except compute_client.ComputeUnavailable as e:
            logger.warning("Task %s: video thumbnails skipped — compute unavailable: %s", task_id[:8], e)

    mark_completed(task_id, final, total)
    logger.info("✅ Task %s done (%d photos)", task_id[:8], final)
