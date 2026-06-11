"""gemini / claude tasks — per-photo cloud AI analysis with optional request delays."""
import asyncio
import logging
import random
import time

from database import get_connection

from task_executors.common import (
    PROGRESS_INTERVAL, SpeedTracker, mark_completed, pause_if_requested, write_progress,
)

logger = logging.getLogger("api")


def _gemini_single(file_id: int, model: str, api_key: str) -> None:
    from ai_providers.gemini import analyze_single
    analyze_single(file_id, model, api_key)


def _claude_single(file_id: int, model: str, api_key: str) -> None:
    from ai_providers.claude import analyze_single
    analyze_single(file_id, model, api_key)


async def run(task_id: str, params: dict, resume_from: int, provider: str) -> None:
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

    await asyncio.to_thread(write_progress, task_id, resume_from, total, None, None, None, None)

    window_sec = float(params.get("eta_window_minutes", 5)) * 60
    tracker = SpeedTracker(window_sec)
    processed = 0
    error_count = 0
    max_errors = params.get("max_errors", None)
    last_save = time.time()
    fn = _gemini_single if provider == "gemini" else _claude_single

    for i, row in enumerate(rows):
        if await pause_if_requested(task_id, resume_from + processed, total):
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

        # Random delay between requests (not after the last one)
        if delay_max > 0 and i < len(rows) - 1:
            delay = random.uniform(max(0.0, delay_min), delay_max)
            if delay > 0:
                await asyncio.sleep(delay)

    final = resume_from + processed
    mark_completed(task_id, final, total)
    logger.info("✅ AI(%s) task %s done (%d photos)", provider, task_id[:8], final)
