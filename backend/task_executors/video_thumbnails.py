"""video_thumbnails task — pre-generate video preview thumbnails via the compute-service."""
import asyncio
import logging
import time

import compute_client
from compute_cache import video_cache_path, VID_THUMB_DIR
from database import get_connection, save_video_preview

from task_executors.common import (
    PROGRESS_INTERVAL, SpeedTracker, mark_completed, pause_if_requested,
    pause_on_compute_unavailable, write_progress,
)

logger = logging.getLogger("api")


def _make_video_thumb(file_path: str, mode: str, cache_path) -> None:
    data, _ = compute_client.video_thumbnail(file_path, mode)
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_bytes(data)


def pregen_video_thumbs_sync(camera_id, date_from, date_to, mode):
    """Pre-generate and cache video thumbnails for all video files in range (sync, for asyncio.to_thread)."""
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


async def run(task_id: str, params: dict, resume_from: int) -> None:
    camera_id = params["camera_id"]
    date_from = params["date_from"]
    date_to = params["date_to"]
    mode = params.get("thumb_mode", "four_frames")
    reprocess_existing = params.get("reprocess_existing", False)

    with get_connection() as conn:
        total = conn.execute(
            "SELECT COUNT(*) AS n FROM files "
            "WHERE camera_id=? AND timestamp>=? AND timestamp<=? AND file_type='video'",
            (camera_id, date_from, date_to),
        ).fetchone()["n"]
        rows = conn.execute(
            "SELECT id, file_path FROM files "
            "WHERE camera_id=? AND timestamp>=? AND timestamp<=? AND file_type='video' "
            "ORDER BY timestamp LIMIT -1 OFFSET ?",
            (camera_id, date_from, date_to, resume_from),
        ).fetchall()

    skip_set: set = set()
    if not reprocess_existing:
        with get_connection() as conn:
            existing = conn.execute(
                "SELECT vp.file_id FROM video_previews vp "
                "JOIN files f ON f.id=vp.file_id "
                "WHERE f.camera_id=? AND f.timestamp>=? AND f.timestamp<=? "
                "AND f.file_type='video' AND vp.mode=?",
                (camera_id, date_from, date_to, mode),
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

        cache_path = video_cache_path(file_id, mode)

        if not cache_path.exists():
            try:
                await asyncio.to_thread(_make_video_thumb, file_path, mode, cache_path)
            except compute_client.ComputeDisabled as e:
                raise Exception(f"Compute service is disabled: {e}")
            except compute_client.ComputeUnavailable as e:
                await pause_on_compute_unavailable(task_id, e, resume_from + processed,
                                                   total, file_id, file_path)
                return
            except Exception as e:
                logger.warning("Video thumb error %s: %s", file_path, e)
                error_count += 1
                if max_errors and error_count >= max_errors:
                    current = resume_from + processed
                    await asyncio.to_thread(write_progress, task_id, current, total,
                                            file_id, file_path, None, None)
                    raise Exception(
                        f"Слишком много ошибок ({error_count}), задача остановлена. "
                        f"Последний файл: {file_path}"
                    )

        if cache_path.exists():
            with get_connection() as conn:
                save_video_preview(conn, file_id, mode, str(cache_path))

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
    mark_completed(task_id, final, total)
    logger.info("✅ Task %s done (%d videos)", task_id[:8], final)
