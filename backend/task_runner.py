"""Background task runner — processes the task queue one task at a time.

Tasks persist in SQLite. The runner picks the lowest-order queued task,
processes files one by one, and writes progress every ~5 seconds. Between
items it re-reads the task status to support pause and cancel.

On startup, tasks stuck in 'running'/'pausing' are reset to 'paused'.
"""
import asyncio
import fnmatch
import json
import logging
import random
import re
import shutil
import time
from collections import deque
from datetime import datetime, timezone
from pathlib import Path

import base64

import compute_client
from compute_cache import ov_cache_path, video_cache_path, OV_THUMB_DIR, VID_THUMB_DIR
from config import load_cameras
from database import (
    get_connection, save_object_detection, save_video_preview,
    update_task_progress, update_task_status, append_task_log,
)

logger = logging.getLogger("api")

_PROGRESS_INTERVAL = 5.0  # seconds between DB progress writes
_global_paused = False


class _SpeedTracker:
    """Sliding window speed tracker (items/sec).
    Keeps only events within the last `window_sec` seconds."""
    def __init__(self, window_sec: float):
        self._window = max(window_sec, 10.0)
        self._events: deque = deque()  # (abs_time, cumulative_count)

    def record(self, cumulative: int) -> None:
        now = time.time()
        self._events.append((now, cumulative))
        cutoff = now - self._window
        while len(self._events) > 1 and self._events[0][0] < cutoff:
            self._events.popleft()

    def speed(self) -> "float | None":
        if len(self._events) < 2:
            return None
        dt = self._events[-1][0] - self._events[0][0]
        dn = self._events[-1][1] - self._events[0][1]
        return dn / dt if dt >= 1.0 else None


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
        elif task_type == "video_convert":
            await _run_video_convert(task_id, params, resume_from)
        elif task_type == "file_organizer":
            await _run_file_organizer(task_id, params, resume_from)
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

    await asyncio.to_thread(_write_progress, task_id, resume_from, total, None, None, None, None)

    window_sec = float(params.get("eta_window_minutes", 5)) * 60
    tracker = _SpeedTracker(window_sec)
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

        if file_id in skip_set:
            processed += 1
            tracker.record(resume_from + processed)
            continue

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
        tracker.record(current)
        speed = tracker.speed()
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

    await asyncio.to_thread(_write_progress, task_id, resume_from, total, None, None, None, None)

    window_sec = float(params.get("eta_window_minutes", 5)) * 60
    tracker = _SpeedTracker(window_sec)
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

        if file_id in skip_set:
            processed += 1
            tracker.record(resume_from + processed)
            continue

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
        tracker.record(current)
        speed = tracker.speed()
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
                "SELECT aa.file_id FROM ai_analysis aa "
                "JOIN files f ON f.id=aa.file_id "
                "WHERE f.camera_id=? AND f.timestamp>=? AND f.timestamp<=? "
                "AND f.file_type='photo' AND aa.provider=?",
                (camera_id, date_from, date_to, provider),
            ).fetchall()
        skip_set = {r["file_id"] for r in existing}

    await asyncio.to_thread(_write_progress, task_id, resume_from, total, None, None, None, None)

    window_sec = float(params.get("eta_window_minutes", 5)) * 60
    tracker = _SpeedTracker(window_sec)
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

        if file_id in skip_set:
            processed += 1
            tracker.record(resume_from + processed)
            continue

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
        tracker.record(current)
        speed = tracker.speed()
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


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _parse_dt(s: str | None):
    """Parse ISO datetime string to timezone-aware datetime (UTC if no tz given)."""
    if not s:
        return None
    dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


# ---------------------------------------------------------------------------
# Log helper (sync, for asyncio.to_thread)
# ---------------------------------------------------------------------------

def _append_log(task_id: str, msg: str) -> None:
    ts = time.strftime("%H:%M:%S")
    line = f"[{ts}] {msg}"
    logger.info("Task %s: %s", task_id[:8], msg)
    with get_connection() as conn:
        append_task_log(conn, task_id, line)


# ---------------------------------------------------------------------------
# video_convert executor
# ---------------------------------------------------------------------------

async def _run_video_convert(task_id: str, params: dict, resume_from: int) -> None:
    camera_id    = params["camera_id"]
    input_pat    = params.get("input_pattern", "*.mp4")
    out_suffix   = params.get("output_suffix", "_web")
    out_ext      = params.get("output_extension", "mp4").lstrip(".")
    codec        = params.get("codec", "libx265")
    crf          = int(params.get("crf", 30))
    preset       = params.get("preset", "medium")
    dry_run      = bool(params.get("dry_run", False))
    date_from_s  = params.get("date_from")
    date_to_s    = params.get("date_to")

    cameras_map = {c.id: c for c in load_cameras()}
    camera = cameras_map.get(camera_id)
    if not camera:
        raise ValueError(f"Camera not found: {camera_id}")

    root = Path(camera.path_videos)
    if not root.exists():
        raise ValueError(f"Videos directory not found: {root}")

    if not dry_run:
        try:
            compute_client._get_urls()  # fails fast if compute is disabled/not configured
        except compute_client.ComputeDisabled:
            raise RuntimeError(
                "Compute-service is disabled. Enable it in compute_config.json to use video_convert."
            )

    # Parse optional date filter (ensure timezone-aware for comparison with mtime)
    dt_from = _parse_dt(date_from_s)
    dt_to   = _parse_dt(date_to_s)

    # Collect matching source files (exclude already-converted outputs)
    all_files: list[Path] = []
    for f in root.rglob("*"):
        if not f.is_file():
            continue
        if not fnmatch.fnmatch(f.name.lower(), input_pat.lower()):
            continue
        if out_suffix and f.stem.endswith(out_suffix):
            continue
        if dt_from or dt_to:
            mtime = datetime.fromtimestamp(f.stat().st_mtime, tz=timezone.utc)
            if dt_from and mtime < dt_from:
                continue
            if dt_to and mtime > dt_to:
                continue
        all_files.append(f)

    all_files.sort(key=lambda p: p.stat().st_mtime)
    total = len(all_files)
    to_process = all_files[resume_from:]

    await asyncio.to_thread(_write_progress, task_id, resume_from, total, None, None, None, None)

    tracker  = _SpeedTracker(300)
    processed = 0
    last_save = time.time()

    prefix = "[DRY] " if dry_run else ""

    for f in to_process:
        status = await asyncio.to_thread(_read_status, task_id)
        if status in ("pausing", "cancelled"):
            current = resume_from + processed
            await asyncio.to_thread(_write_progress, task_id, current, total, None, str(f), None, None)
            with get_connection() as conn:
                conn.execute("UPDATE tasks SET status='paused' WHERE id=?", (task_id,))
            logger.info("⏸ Task %s paused at %d/%d", task_id[:8], current, total)
            return

        dst = f.parent / f"{f.stem}{out_suffix}.{out_ext}"
        rel = str(f.relative_to(root))

        if dst.exists():
            await asyncio.to_thread(_append_log, task_id, f"Skip (exists): {rel} → {dst.name}")
        elif dry_run:
            await asyncio.to_thread(_append_log, task_id,
                                    f"[DRY] Would convert: {rel} → {dst.name}")
        else:
            await asyncio.to_thread(_append_log, task_id, f"Converting: {rel} → {dst.name}")
            try:
                await asyncio.to_thread(
                    compute_client.convert_video, str(f), str(dst), codec, crf, preset
                )
                await asyncio.to_thread(_append_log, task_id, f"Done: {dst.name}")
            except (compute_client.ComputeDisabled, compute_client.ComputeUnavailable) as e:
                raise Exception(f"Compute service unavailable: {e}")
            except Exception as e:
                await asyncio.to_thread(_append_log, task_id, f"ERROR {rel}: {e}")

        processed += 1
        current = resume_from + processed
        tracker.record(current)
        speed = tracker.speed()
        eta = int((total - current) / speed) if speed and speed > 0 else None

        if time.time() - last_save >= _PROGRESS_INTERVAL:
            await asyncio.to_thread(_write_progress, task_id, current, total, None, str(f), speed, eta)
            last_save = time.time()

    final = resume_from + processed
    with get_connection() as conn:
        conn.execute(
            "UPDATE tasks SET status='completed', completed_at=datetime('now'), "
            "progress_current=?, progress_total=?, speed_per_sec=NULL, eta_seconds=NULL, "
            "current_file_id=NULL, current_file_path=NULL WHERE id=?",
            (final, total, task_id),
        )
    logger.info("✅ Task %s (video_convert%s) done: %d files", task_id[:8],
                " DRY" if dry_run else "", final)


# ---------------------------------------------------------------------------
# file_organizer executor
# ---------------------------------------------------------------------------

async def _run_file_organizer(task_id: str, params: dict, resume_from: int) -> None:
    camera_id     = params["camera_id"]
    source_type   = params.get("source_type", "snapshots")
    input_pat     = params.get("input_pattern", "*.jpg")
    output_folder = params.get("output_folder", "organized")
    date_regex    = params.get("date_regex", r"(\d{4})(\d{2})(\d{2})")
    dry_run       = bool(params.get("dry_run", False))
    dt_from       = _parse_dt(params.get("date_from"))
    dt_to         = _parse_dt(params.get("date_to"))

    cameras_map = {c.id: c for c in load_cameras()}
    camera = cameras_map.get(camera_id)
    if not camera:
        raise ValueError(f"Camera not found: {camera_id}")

    root = Path(camera.path_snapshots if source_type == "snapshots" else camera.path_videos)
    if not root.exists():
        raise ValueError(f"Directory not found: {root}")

    output_dir = root / output_folder

    # Validate regex early
    try:
        compiled_re = re.compile(date_regex)
    except re.error as e:
        raise ValueError(f"Invalid date_regex: {e}")

    # Scan only root-level files (output_folder subdir is excluded naturally)
    all_files: list[Path] = []
    for f in root.iterdir():
        if not f.is_file():
            continue
        if not fnmatch.fnmatch(f.name.lower(), input_pat.lower()):
            continue
        if dt_from or dt_to:
            mtime = datetime.fromtimestamp(f.stat().st_mtime, tz=timezone.utc)
            if dt_from and mtime < dt_from:
                continue
            if dt_to and mtime > dt_to:
                continue
        all_files.append(f)

    all_files.sort(key=lambda p: p.name)
    total = len(all_files)
    to_process = all_files[resume_from:]

    await asyncio.to_thread(_write_progress, task_id, resume_from, total, None, None, None, None)

    if not dry_run:
        output_dir.mkdir(parents=True, exist_ok=True)

    tracker  = _SpeedTracker(300)
    processed = 0
    last_save = time.time()

    for f in to_process:
        status = await asyncio.to_thread(_read_status, task_id)
        if status in ("pausing", "cancelled"):
            current = resume_from + processed
            await asyncio.to_thread(_write_progress, task_id, current, total, None, str(f), None, None)
            with get_connection() as conn:
                conn.execute("UPDATE tasks SET status='paused' WHERE id=?", (task_id,))
            logger.info("⏸ Task %s paused at %d/%d", task_id[:8], current, total)
            return

        m = compiled_re.search(f.name)
        if not m or len(m.groups()) < 3:
            await asyncio.to_thread(_append_log, task_id, f"Skip (no date match): {f.name}")
        else:
            year, month, day = m.group(1), m.group(2), m.group(3)
            dest_dir = output_dir / year / month / day
            dest     = dest_dir / f.name

            if dest.exists():
                await asyncio.to_thread(_append_log, task_id, f"Skip (exists): {f.name}")
            elif dry_run:
                await asyncio.to_thread(_append_log, task_id,
                                        f"[DRY] Would move: {f.name} → "
                                        f"{output_folder}/{year}/{month}/{day}/")
            else:
                try:
                    dest_dir.mkdir(parents=True, exist_ok=True)
                    shutil.move(str(f), str(dest))
                    await asyncio.to_thread(_append_log, task_id,
                                            f"Moved: {f.name} → "
                                            f"{output_folder}/{year}/{month}/{day}/")
                except Exception as e:
                    await asyncio.to_thread(_append_log, task_id, f"ERROR {f.name}: {e}")

        processed += 1
        current = resume_from + processed
        tracker.record(current)
        speed = tracker.speed()
        eta = int((total - current) / speed) if speed and speed > 0 else None

        if time.time() - last_save >= _PROGRESS_INTERVAL:
            await asyncio.to_thread(_write_progress, task_id, current, total, None, str(f), speed, eta)
            last_save = time.time()

    final = resume_from + processed
    with get_connection() as conn:
        conn.execute(
            "UPDATE tasks SET status='completed', completed_at=datetime('now'), "
            "progress_current=?, progress_total=?, speed_per_sec=NULL, eta_seconds=NULL, "
            "current_file_id=NULL, current_file_path=NULL WHERE id=?",
            (final, total, task_id),
        )
    logger.info("✅ Task %s (file_organizer%s) done: %d files", task_id[:8],
                " DRY" if dry_run else "", final)
