"""gdrive_upload task — upload a camera's photos/videos (by date range) to a Google Drive folder.

Idempotent: the target folder's file names are listed once at start and every
file already present is skipped, so re-running the task with the same folder
only uploads files that appeared since the last run. File list comes from the
`files` table ordered by timestamp, so resume_from slicing stays consistent.
"""
import asyncio
import logging
import time
from pathlib import Path

import httpx

import google_api
import google_oauth
from database import get_connection

from task_executors.common import (
    PROGRESS_INTERVAL, SpeedTracker, append_log, mark_completed,
    pause_if_requested, write_progress,
)

logger = logging.getLogger("api")


def _list_files(camera_id: str, file_type: str, date_from: str, date_to: str) -> list:
    q = ("SELECT id, file_path FROM files "
         "WHERE camera_id=? AND timestamp>=? AND timestamp<=?")
    args = [camera_id, date_from, date_to]
    if file_type in ("photo", "video"):
        q += " AND file_type=?"
        args.append(file_type)
    q += " ORDER BY timestamp"
    with get_connection() as conn:
        return conn.execute(q, args).fetchall()


async def run(task_id: str, params: dict, resume_from: int) -> None:
    camera_id    = params["camera_id"]
    file_type    = params.get("file_type", "both")  # photo | video | both
    drive_folder = params["drive_folder"]
    date_from    = params.get("date_from", "0000-01-01")
    date_to      = params.get("date_to", "9999-12-31")

    rows = await asyncio.to_thread(_list_files, camera_id, file_type, date_from, date_to)
    total = len(rows)
    to_process = rows[resume_from:]
    await asyncio.to_thread(write_progress, task_id, resume_from, total, None, None, None, None)

    folder_id = await asyncio.to_thread(google_api.drive_find_or_create_folder, drive_folder)
    existing = await asyncio.to_thread(google_api.drive_list_filenames, folder_id)
    await asyncio.to_thread(append_log, task_id,
                            f"{total} files in range, {len(existing)} already in Drive folder "
                            f"'{drive_folder}'")

    tracker = SpeedTracker(300)
    processed = 0
    uploaded = skipped = 0
    error_count = 0
    max_errors = params.get("max_errors", None)
    last_save = time.time()

    for row in to_process:
        file_id, file_path = row["id"], row["file_path"]
        if await pause_if_requested(task_id, resume_from + processed, total, file_path):
            return

        name = Path(file_path).name
        if name in existing:
            skipped += 1
        else:
            try:
                await asyncio.to_thread(google_api.drive_upload_file, folder_id, file_path)
                existing.add(name)
                uploaded += 1
                await asyncio.to_thread(append_log, task_id, f"Uploaded: {name}")
            except google_oauth.NotConnected:
                raise
            except (httpx.TransportError, httpx.TimeoutException) as e:
                # Network problem — pause so the task survives outages and restarts
                await asyncio.to_thread(write_progress, task_id, resume_from + processed,
                                        total, file_id, file_path, None, None)
                with get_connection() as conn:
                    conn.execute("UPDATE tasks SET status='paused', error_message=? WHERE id=?",
                                 (str(e)[:500], task_id))
                logger.warning("⏸ Task %s paused — Drive unreachable: %s", task_id[:8], e)
                return
            except Exception as e:
                await asyncio.to_thread(append_log, task_id, f"ERROR {name}: {e}")
                error_count += 1
                if max_errors and error_count >= max_errors:
                    await asyncio.to_thread(write_progress, task_id, resume_from + processed,
                                            total, file_id, file_path, None, None)
                    raise Exception(f"Too many errors ({error_count}), task stopped. "
                                    f"Last file: {file_path}")

        processed += 1
        current = resume_from + processed
        tracker.record(current)
        speed = tracker.speed()
        eta = int((total - current) / speed) if speed and speed > 0 else None

        if time.time() - last_save >= PROGRESS_INTERVAL:
            await asyncio.to_thread(write_progress, task_id, current, total,
                                    file_id, file_path, speed, eta)
            last_save = time.time()

    await asyncio.to_thread(append_log, task_id,
                            f"Done: {uploaded} uploaded, {skipped} already in Drive")
    mark_completed(task_id, resume_from + processed, total)
    logger.info("✅ Task %s (gdrive_upload) done: %d uploaded, %d skipped",
                task_id[:8], uploaded, skipped)
