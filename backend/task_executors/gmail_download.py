"""gmail_download task — save photo/video attachments from a Gmail label into the camera folder.

Idempotent: an attachment whose file name already exists on disk is skipped,
so re-running the task (or resuming after a restart/pause) only downloads new
files. Messages are processed oldest-first, so resume_from slicing stays
consistent when new mail arrives during the run.

After each download the file is immediately inserted into the files table so it
is visible in the library without a full scan. If the email subject matches the
Reolink alarm pattern ("{EventType} Detected from {camera} at {datetime}") the
event type is also written to object_detection, as if OpenVINO had detected it.

Optional params:
  organize_by_date — if true, files are placed in YYYY/MM/DD subfolders.
                     The date is parsed from the subject "at YYYY/M/D H:MM:SS"
                     or falls back to the email internalDate.
"""
import asyncio
import base64
import logging
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx

import google_api
import google_oauth
from config import load_cameras
from database import get_connection, save_object_detection, upsert_file

from task_executors.common import (
    PROGRESS_INTERVAL, SpeedTracker, append_log, mark_completed, parse_dt,
    pause_if_requested, write_progress,
)

logger = logging.getLogger("api")

_SUBJECT_DT_RE = re.compile(r"at (\d{4})/(\d{1,2})/(\d{1,2}) (\d{1,2}):(\d{2}):(\d{2})")

_PHOTO_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
_VIDEO_EXTENSIONS = {".mp4", ".avi", ".mkv", ".mov", ".webm"}


def _get_msg_header(msg: dict, name: str) -> str:
    for h in msg.get("payload", {}).get("headers", []):
        if h["name"].lower() == name.lower():
            return h["value"]
    return ""


def _event_from_subject(subject: str, object_re: "re.Pattern | None") -> "str | None":
    """Return lowercase object label extracted by the user-supplied regex (group 1), or None."""
    if object_re is None:
        return None
    m = object_re.search(subject)
    if not m:
        return None
    try:
        return m.group(1).strip().lower()
    except IndexError:
        return None


def _dt_from_subject(subject: str) -> "datetime | None":
    m = _SUBJECT_DT_RE.search(subject)
    if not m:
        return None
    try:
        return datetime(int(m[1]), int(m[2]), int(m[3]), int(m[4]), int(m[5]), int(m[6]),
                        tzinfo=timezone.utc)
    except ValueError:
        return None


def _file_type(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    return "video" if ext in _VIDEO_EXTENSIONS else "photo"


def _dest_for(base_dir: Path, filename: str, dt: "datetime | None", organize: bool) -> Path:
    if not organize or dt is None:
        return base_dir / filename
    day_dir = base_dir / f"{dt.year:04d}" / f"{dt.month:02d}" / f"{dt.day:02d}"
    day_dir.mkdir(parents=True, exist_ok=True)
    return day_dir / filename


def _index_file(camera_id: str, dest: Path, dt: "datetime | None",
                event_obj: "str | None") -> "int | None":
    """Insert the file into the files table and optionally into object_detection.
    Returns the file's DB id (needed for thumbnail display in TaskCard)."""
    ts = (dt.isoformat() if dt
          else datetime.fromtimestamp(dest.stat().st_mtime, tz=timezone.utc).isoformat())
    ftype = _file_type(dest.name)
    with get_connection() as conn:
        upsert_file(conn, camera_id, ftype, str(dest), dest.stat().st_size, ts)
        row = conn.execute("SELECT id FROM files WHERE file_path = ?", (str(dest),)).fetchone()
        file_id = row["id"] if row else None
        if event_obj and ftype == "photo" and file_id:
            save_object_detection(conn, file_id, "reolink-alarm", event_obj)
    return file_id


async def run(task_id: str, params: dict, resume_from: int) -> None:
    camera_id     = params["camera_id"]
    label_id      = params["label_id"]
    output_folder = params.get("output_folder", "")
    dt_from       = parse_dt(params.get("date_from"))
    dt_to         = parse_dt(params.get("date_to"))
    organize      = bool(params.get("organize_by_date", False))
    obj_regex_str = params.get("subject_object_regex", "")
    try:
        object_re = re.compile(obj_regex_str, re.IGNORECASE) if obj_regex_str else None
    except re.error as e:
        raise ValueError(f"Invalid subject_object_regex: {e}")

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
    last_file_id = None

    for msg_id in to_process:
        if await pause_if_requested(task_id, resume_from + processed, total, last_path):
            return

        try:
            msg = await asyncio.to_thread(google_api.gmail_get_message, msg_id)
            msg_ts = int(msg.get("internalDate", 0)) / 1000
            subject = _get_msg_header(msg, "Subject")

            # Extract detected object via user-supplied regex (group 1 = object label)
            event_obj = _event_from_subject(subject, object_re)
            dt_subject = _dt_from_subject(subject)    # exact datetime if present
            dt_for_path = dt_subject
            if organize and dt_for_path is None and msg_ts > 0:
                dt_for_path = datetime.fromtimestamp(msg_ts, tz=timezone.utc)

            for att in google_api.extract_attachments(msg.get("payload", {})):
                name = Path(att["filename"]).name
                dest = _dest_for(dest_dir, name, dt_for_path, organize)
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
                fid = await asyncio.to_thread(_index_file, camera_id, dest, dt_subject, event_obj)
                saved += 1
                last_path = str(dest)
                last_file_id = fid
                log_line = f"Saved: {name}"
                if event_obj:
                    log_line += f" | detected: {event_obj}"
                await asyncio.to_thread(append_log, task_id, log_line)
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
                                    last_file_id, last_path, speed, eta)
            last_save = time.time()

    await asyncio.to_thread(append_log, task_id,
                            f"Done: {saved} saved, {skipped} already existed")
    mark_completed(task_id, resume_from + processed, total)
    logger.info("✅ Task %s (gmail_download) done: %d messages, %d files saved",
                task_id[:8], processed, saved)

    repeat_h = int(params.get("repeat_every_hours") or 0)
    if repeat_h > 0:
        with get_connection() as conn:
            conn.execute(
                "UPDATE tasks SET status='queued', progress_current=0, "
                "started_at=NULL, completed_at=NULL, log_tail='[]', "
                "run_after=datetime('now', ?) WHERE id=?",
                (f"+{repeat_h} hours", task_id),
            )
        logger.info("Task %s (gmail_download) scheduled for re-run in %d h", task_id[:8], repeat_h)
