"""Background task runner — processes the task queue one task at a time.

Tasks persist in SQLite. The runner picks the lowest-order queued task,
processes files one by one, and writes progress every ~5 seconds. Between
items it re-reads the task status to support pause and cancel.

On startup, tasks stuck in 'running'/'pausing' are reset to 'paused'.
"""
import asyncio
import json
import logging
import random
import time
from datetime import datetime

import base64

import compute_client
from compute_cache import ov_cache_path, video_cache_path, OV_THUMB_DIR, VID_THUMB_DIR
from database import (
    get_connection, save_object_detection, save_video_preview,
    update_task_progress, update_task_status,
)

logger = logging.getLogger("api")

_PROGRESS_INTERVAL = 5.0  # seconds between DB progress writes
_global_paused = False


def get_global_paused() -> bool:
    return _global_paused


def set_global_paused(value: bool) -> None:
    global _global_paused
    _global_paused = value


def init_runner_state() -> None:
    """Reset tasks stuck mid-run to 'paused' after a server restart."""
    with get_connection() as conn:
        conn.execute(
            "UPDATE tasks SET status='paused' WHERE status IN ('running', 'pausing')"
        )


def _in_time_window(current_hour: int, from_hour: int, to_hour: int) -> bool:
    """True if current_hour is within [from_hour, to_hour). Handles midnight wrap."""
    if from_hour == to_hour:
        return True  # no restriction
    if from_hour < to_hour:
        return from_hour <= current_hour < to_hour
    # Wraps midnight: e.g., 22..6 means 22,23,0,1,2,3,4,5
    return current_hour >= from_hour or current_hour < to_hour


async def task_loop() -> None:
    """Infinite async loop — picks queued tasks and executes them sequentially."""
    while True:
        try:
            if _global_paused:
                await asyncio.sleep(2)
                continue
            with get_connection() as conn:
                row = conn.execute(
                    "SELECT * FROM tasks WHERE status='queued' "
                    "ORDER BY order_index ASC, created_at ASC LIMIT 1"
                ).fetchone()
            if row:
                task = dict(row)
                params = json.loads(task.get("params") or "{}")
                from_h = params.get("active_from_hour")
                to_h = params.get("active_to_hour")
                if from_h is not None and to_h is not None:
                    now_h = datetime.now().hour
                    if not _in_time_window(now_h, int(from_h), int(to_h)):
                        logger.debug(
                            "Task %s outside time window (%s–%s), sleeping 60s",
                            task["id"][:8], from_h, to_h,
                        )
                        await asyncio.sleep(60)
                        continue
                await _execute_task(task)
            else:
                await asyncio.sleep(2)
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.error("Task runner error: %s", e, exc_info=True)
            await asyncio.sleep(5)


async def _execute_task(task: dict) -> None:
    task_id = task["id"]
    task_type = task["type"]
    params = json.loads(task["params"])
    resume_from = task["progress_current"]

    logger.info("▶ Task %s (%s) starting from %d", task_id[:8], task_type, resume_from)

    with get_connection() as conn:
        conn.execute(
            "UPDATE tasks SET status='running', "
            "started_at=COALESCE(started_at, datetime('now')) WHERE id=?",
            (task_id,),
        )

    try:
        if task_type == "video_thumbnails":
            await _run_video_thumbnails(task_id, params, resume_from)
        elif task_type == "openvino":
            await _run_openvino(task_id, params, resume_from)
        elif task_type == "gemini":
            await _run_ai(task_id, params, resume_from, "gemini")
        elif task_type == "claude":
            await _run_ai(task_id, params, resume_from, "claude")
        else:
            raise ValueError(f"Unknown task type: {task_type}")
    except asyncio.CancelledError:
        raise
    except Exception as e:
        logger.error("Task %s failed: %s", task_id[:8], e, exc_info=True)
        with get_connection() as conn:
            conn.execute(
                "UPDATE tasks SET status='failed', completed_at=datetime('now'), "
                "error_message=? WHERE id=?",
                (str(e)[:500], task_id),
            )


# ---------------------------------------------------------------------------
# Blocking helpers (run in asyncio.to_thread)
# ---------------------------------------------------------------------------

def _read_status(task_id: str) -> str:
    with get_connection() as conn:
        row = conn.execute("SELECT status FROM tasks WHERE id=?", (task_id,)).fetchone()
    return row["status"] if row else "cancelled"


def _write_progress(task_id: str, current: int, total: int,
                    file_id, file_path, speed, eta) -> None:
    with get_connection() as conn:
        update_task_progress(conn, task_id, current, total, file_id, file_path, speed, eta)


def _make_video_thumb(file_path: str, mode: str, cache_path) -> None:
    data, _ = compute_client.video_thumbnail(file_path, mode)
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_bytes(data)


def _detect_and_save(file_id: int, file_path: str, model_name: str, confidence: float,
                     classes=None, classes_tuple=None) -> None:
    result = compute_client.detect(file_path, model_name, confidence, draw=True, classes=classes)
    with get_connection() as conn:
        save_object_detection(conn, file_id, model_name, " ".join(result.objects))
    if result.annotated_jpeg_b64:
        cache_path = ov_cache_path(file_id, model_name, confidence, classes_tuple)
        OV_THUMB_DIR.mkdir(exist_ok=True)
        cache_path.write_bytes(base64.b64decode(result.annotated_jpeg_b64))


def _gemini_single(file_id: int, model: str, api_key: str) -> None:
    from ai_providers.gemini import analyze_single
    analyze_single(file_id, model, api_key)


def _claude_single(file_id: int, model: str, api_key: str) -> None:
    from ai_providers.claude import analyze_single
    analyze_single(file_id, model, api_key)


# ---------------------------------------------------------------------------
# Task executors
# ---------------------------------------------------------------------------

async def _run_video_thumbnails(task_id: str, params: dict, resume_from: int) -> None:
    camera_id = params["camera_id"]
    date_from = params["date_from"]
    date_to = params["date_to"]
    mode = params.get("thumb_mode", "four_frames")

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

    await asyncio.to_thread(_write_progress, task_id, resume_from, total, None, None, None, None)

    t_start = time.time()
    processed = 0
    error_count = 0
    max_errors = params.get("max_errors", None)
    last_save = time.time()

    for row in rows:
        status = await asyncio.to_thread(_read_status, task_id)
        if status in ("pausing", "cancelled"):
            current = resume_from + processed
            await asyncio.to_thread(_write_progress, task_id, current, total, None, None, None, None)
            with get_connection() as conn:
                conn.execute("UPDATE tasks SET status='paused' WHERE id=?", (task_id,))
            logger.info("⏸ Task %s paused at %d/%d", task_id[:8], current, total)
            return

        file_id = row["id"]
        file_path = row["file_path"]
        cache_path = video_cache_path(file_id, mode)

        if not cache_path.exists():
            try:
                await asyncio.to_thread(_make_video_thumb, file_path, mode, cache_path)
            except (compute_client.ComputeDisabled, compute_client.ComputeUnavailable) as e:
                raise Exception(f"Compute service unavailable: {e}")
            except Exception as e:
                logger.warning("Video thumb error %s: %s", file_path, e)
                error_count += 1
                if max_errors and error_count >= max_errors:
                    current = resume_from + processed
                    await asyncio.to_thread(_write_progress, task_id, current, total,
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
        elapsed = time.time() - t_start
        speed = processed / elapsed if elapsed > 0.1 else None
        remaining = total - current
        eta = int(remaining / speed) if speed and speed > 0 else None

        if time.time() - last_save >= _PROGRESS_INTERVAL:
            await asyncio.to_thread(_write_progress, task_id, current, total,
                                    file_id, file_path, speed, eta)
            last_save = time.time()

    final = resume_from + processed
    with get_connection() as conn:
        conn.execute(
            "UPDATE tasks SET status='completed', completed_at=datetime('now'), "
            "progress_current=?, progress_total=?, speed_per_sec=NULL, eta_seconds=NULL, "
            "current_file_id=NULL, current_file_path=NULL WHERE id=?",
            (final, total, task_id),
        )
    logger.info("✅ Task %s done (%d videos)", task_id[:8], final)


async def _run_openvino(task_id: str, params: dict, resume_from: int) -> None:
    camera_id = params["camera_id"]
    date_from = params["date_from"]
    date_to = params["date_to"]
    model_name = params.get("model_name", "yolov8n")
    confidence = params.get("confidence", 0.25)
    classes = params.get("classes", None)
    video_thumb_mode = params.get("video_thumb_mode")
    classes_tuple = tuple(sorted(classes)) if classes else None

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

    await asyncio.to_thread(_write_progress, task_id, resume_from, total, None, None, None, None)

    t_start = time.time()
    processed = 0
    error_count = 0
    max_errors = params.get("max_errors", None)
    last_save = time.time()

    for row in rows:
        status = await asyncio.to_thread(_read_status, task_id)
        if status in ("pausing", "cancelled"):
            current = resume_from + processed
            await asyncio.to_thread(_write_progress, task_id, current, total, None, None, None, None)
            with get_connection() as conn:
                conn.execute("UPDATE tasks SET status='paused' WHERE id=?", (task_id,))
            logger.info("⏸ Task %s paused at %d/%d", task_id[:8], current, total)
            return

        file_id = row["id"]
        file_path = row["file_path"]

        try:
            await asyncio.to_thread(_detect_and_save, file_id, file_path, model_name, confidence,
                                    classes, classes_tuple)
        except (compute_client.ComputeDisabled, compute_client.ComputeUnavailable) as e:
            raise Exception(f"Compute service unavailable: {e}")
        except Exception as e:
            logger.warning("OpenVINO error %s: %s", file_path, e)
            error_count += 1
            if max_errors and error_count >= max_errors:
                current = resume_from + processed
                await asyncio.to_thread(_write_progress, task_id, current, total,
                                        file_id, file_path, None, None)
                raise Exception(
                    f"Слишком много ошибок ({error_count}), задача остановлена. "
                    f"Последний файл: {file_path}"
                )

        processed += 1
        current = resume_from + processed
        elapsed = time.time() - t_start
        speed = processed / elapsed if elapsed > 0.1 else None
        remaining = total - current
        eta = int(remaining / speed) if speed and speed > 0 else None

        if time.time() - last_save >= _PROGRESS_INTERVAL:
            await asyncio.to_thread(_write_progress, task_id, current, total,
                                    file_id, file_path, speed, eta)
            last_save = time.time()

    final = resume_from + processed

    if video_thumb_mode and video_thumb_mode != "none":
        await asyncio.to_thread(_pregen_video_thumbs_sync, camera_id, date_from, date_to, video_thumb_mode)

    with get_connection() as conn:
        conn.execute(
            "UPDATE tasks SET status='completed', completed_at=datetime('now'), "
            "progress_current=?, progress_total=?, speed_per_sec=NULL, eta_seconds=NULL, "
            "current_file_id=NULL, current_file_path=NULL WHERE id=?",
            (final, total, task_id),
        )
    logger.info("✅ Task %s done (%d photos)", task_id[:8], final)


def _pregen_video_thumbs_sync(camera_id, date_from, date_to, mode):
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


async def _run_ai(task_id: str, params: dict, resume_from: int, provider: str) -> None:
    """Generic per-file AI analysis runner (Gemini or Claude)."""
    camera_id = params["camera_id"]
    date_from = params["date_from"]
    date_to = params["date_to"]
    model = params["model"]
    api_key = params["api_key"]
    delay_min = float(params.get("delay_min_sec", 0))
    delay_max = float(params.get("delay_max_sec", 0))

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

    await asyncio.to_thread(_write_progress, task_id, resume_from, total, None, None, None, None)

    t_start = time.time()
    processed = 0
    error_count = 0
    max_errors = params.get("max_errors", None)
    last_save = time.time()
    fn = _gemini_single if provider == "gemini" else _claude_single

    for i, row in enumerate(rows):
        status = await asyncio.to_thread(_read_status, task_id)
        if status in ("pausing", "cancelled"):
            current = resume_from + processed
            await asyncio.to_thread(_write_progress, task_id, current, total, None, None, None, None)
            with get_connection() as conn:
                conn.execute("UPDATE tasks SET status='paused' WHERE id=?", (task_id,))
            logger.info("⏸ Task %s paused at %d/%d", task_id[:8], current, total)
            return

        file_id = row["id"]
        file_path = row["file_path"]

        try:
            await asyncio.to_thread(fn, file_id, model, api_key)
        except Exception as e:
            logger.warning("AI(%s) task %s error on %s: %s", provider, task_id[:8], file_path, e)
            error_count += 1
            if max_errors and error_count >= max_errors:
                current = resume_from + processed
                await asyncio.to_thread(_write_progress, task_id, current, total,
                                        file_id, file_path, None, None)
                raise Exception(
                    f"Слишком много ошибок ({error_count}), задача остановлена. "
                    f"Последний файл: {file_path}"
                )

        processed += 1
        current = resume_from + processed
        elapsed = time.time() - t_start
        speed = processed / elapsed if elapsed > 0.1 else None
        remaining = total - current
        eta = int(remaining / speed) if speed and speed > 0 else None

        if time.time() - last_save >= _PROGRESS_INTERVAL:
            await asyncio.to_thread(_write_progress, task_id, current, total,
                                    file_id, file_path, speed, eta)
            last_save = time.time()

        # Random delay between requests (not after the last one)
        if delay_max > 0 and i < len(rows) - 1:
            delay = random.uniform(max(0.0, delay_min), delay_max)
            if delay > 0:
                await asyncio.sleep(delay)

    final = resume_from + processed
    with get_connection() as conn:
        conn.execute(
            "UPDATE tasks SET status='completed', completed_at=datetime('now'), "
            "progress_current=?, progress_total=?, speed_per_sec=NULL, eta_seconds=NULL, "
            "current_file_id=NULL, current_file_path=NULL WHERE id=?",
            (final, total, task_id),
        )
    logger.info("✅ AI(%s) task %s done (%d photos)", provider, task_id[:8], final)
