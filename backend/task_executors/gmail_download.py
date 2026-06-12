"""gmail_download task — save photo/video attachments from a Gmail label into the camera folder.

Idempotent: an attachment whose file name already exists on disk is skipped,
so re-running the task (or resuming after a restart/pause) only downloads new
files. Messages are processed oldest-first, so resume_from slicing stays
consistent when new mail arrives during the run.
"""
import asyncio
import base64
import logging
import os
import time
from pathlib import Path

import httpx

import google_api
import google_oauth
from config import load_cameras

from task_executors.common import (
    PROGRESS_INTERVAL, SpeedTracker, append_log, mark_completed, parse_dt,
    pause_if_requested, write_progress,
)

logger = logging.getLogger("api")


async def run(task_id: str, params: dict, resume_from: int) -> None:
    camera_id     = params["camera_id"]
    label_id      = params["label_id"]
    output_folder = params.get("output_folder", "")
    dt_from       = parse_dt(params.get("date_from"))
    dt_to         = parse_dt(params.get("date_to"))

    cameras_map = {c.id: c for c in load_cameras()}
    camera = cameras_map.get(camera_id)
    if not camera:
        raise ValueError(f"Camera not found: {camera_id}")

    dest_dir = Path(camera.path) / output_folder if output_folder else Path(camera.path)
    dest_dir.mkdir(parents=True, exist_ok=True)

    after  = int(dt_from.timestamp()) if dt_from else None
    before = int(dt_to.timestamp()) if dt_to else None

    ids = await asyncio.to_thread(google_api.gmail_list_message_ids, label_id, after, before)
    ids.reverse()  # Gmail returns newest first — process oldest first

    total = len(ids)
    to_process = ids[resume_from:]
    await asyncio.to_thread(write_progress, task_id, resume_from, total, None, None, None, None)
    await asyncio.to_thread(append_log, task_id,
                            f"{total} messages in label, starting from {resume_from}")

    tracker = SpeedTracker(300)
    processed = 0
    saved = skipped = 0
    error_count = 0
    max_errors = params.get("max_errors", None)
    last_save = time.time()
    last_path = None

    for msg_id in to_process:
        if await pause_if_requested(task_id, resume_from + processed, total, last_path):
            return

        try:
            msg = await asyncio.to_thread(google_api.gmail_get_message, msg_id)
            msg_ts = int(msg.get("internalDate", 0)) / 1000
            for att in google_api.extract_attachments(msg.get("payload", {})):
                name = Path(att["filename"]).name  # strip any path components
                dest = dest_dir / name
                if dest.exists():
                    skipped += 1
                    continue
                if att["attachment_id"]:
                    data = await asyncio.to_thread(
                        google_api.gmail_get_attachment, msg_id, att["attachment_id"])
                else:
                    data = base64.urlsafe_b64decode(att["data"])
                await asyncio.to_thread(dest.write_bytes, data)
                if msg_ts > 0:
                    os.utime(dest, (msg_ts, msg_ts))
                saved += 1
                last_path = str(dest)
                await asyncio.to_thread(append_log, task_id, f"Saved: {name}")
        except google_oauth.NotConnected:
            raise
        except (httpx.TransportError, httpx.TimeoutException) as e:
            # Network problem — pause so the task survives outages and restarts
            from database import get_connection
            await asyncio.to_thread(write_progress, task_id, resume_from + processed,
                                    total, None, last_path, None, None)
            with get_connection() as conn:
                conn.execute("UPDATE tasks SET status='paused', error_message=? WHERE id=?",
                             (str(e)[:500], task_id))
            logger.warning("⏸ Task %s paused — Gmail unreachable: %s", task_id[:8], e)
            return
        except Exception as e:
            await asyncio.to_thread(append_log, task_id, f"ERROR message {msg_id}: {e}")
            error_count += 1
            if max_errors and error_count >= max_errors:
                await asyncio.to_thread(write_progress, task_id, resume_from + processed,
                                        total, None, last_path, None, None)
                raise Exception(f"Too many errors ({error_count}), task stopped")

        processed += 1
        current = resume_from + processed
        tracker.record(current)
        speed = tracker.speed()
        eta = int((total - current) / speed) if speed and speed > 0 else None

        if time.time() - last_save >= PROGRESS_INTERVAL:
            await asyncio.to_thread(write_progress, task_id, current, total,
                                    None, last_path, speed, eta)
            last_save = time.time()

    await asyncio.to_thread(append_log, task_id,
                            f"Done: {saved} saved, {skipped} already existed")
    mark_completed(task_id, resume_from + processed, total)
    logger.info("✅ Task %s (gmail_download) done: %d messages, %d files saved",
                task_id[:8], processed, saved)
