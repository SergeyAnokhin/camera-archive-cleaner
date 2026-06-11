"""file_organizer task — move root-level files into year/month/day folders. Supports dry-run."""
import asyncio
import fnmatch
import logging
import re
import shutil
import time
from datetime import datetime, timezone
from pathlib import Path

from config import load_cameras

from task_executors.common import (
    PROGRESS_INTERVAL, SpeedTracker, append_log, mark_completed, parse_dt,
    pause_if_requested, write_progress,
)

logger = logging.getLogger("api")


async def run(task_id: str, params: dict, resume_from: int) -> None:
    camera_id     = params["camera_id"]
    source_type   = params.get("source_type", "snapshots")
    input_pat     = params.get("input_pattern", "*.jpg")
    output_folder = params.get("output_folder", "organized")
    date_regex    = params.get("date_regex", r"(\d{4})(\d{2})(\d{2})")
    dry_run       = bool(params.get("dry_run", False))
    dt_from       = parse_dt(params.get("date_from"))
    dt_to         = parse_dt(params.get("date_to"))

    cameras_map = {c.id: c for c in load_cameras()}
    camera = cameras_map.get(camera_id)
    if not camera:
        raise ValueError(f"Camera not found: {camera_id}")

    root = Path(camera.path)
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

    await asyncio.to_thread(write_progress, task_id, resume_from, total, None, None, None, None)

    if not dry_run:
        output_dir.mkdir(parents=True, exist_ok=True)

    tracker  = SpeedTracker(300)
    processed = 0
    last_save = time.time()

    for f in to_process:
        if await pause_if_requested(task_id, resume_from + processed, total, str(f)):
            return

        m = compiled_re.search(f.name)
        if not m or len(m.groups()) < 3:
            await asyncio.to_thread(append_log, task_id, f"Skip (no date match): {f.name}")
        else:
            year, month, day = m.group(1), m.group(2), m.group(3)
            dest_dir = output_dir / year / month / day
            dest     = dest_dir / f.name

            if dest.exists():
                await asyncio.to_thread(append_log, task_id, f"Skip (exists): {f.name}")
            elif dry_run:
                await asyncio.to_thread(append_log, task_id,
                                        f"[DRY] Would move: {f.name} → "
                                        f"{output_folder}/{year}/{month}/{day}/")
            else:
                try:
                    dest_dir.mkdir(parents=True, exist_ok=True)
                    shutil.move(str(f), str(dest))
                    await asyncio.to_thread(append_log, task_id,
                                            f"Moved: {f.name} → "
                                            f"{output_folder}/{year}/{month}/{day}/")
                except Exception as e:
                    await asyncio.to_thread(append_log, task_id, f"ERROR {f.name}: {e}")

        processed += 1
        current = resume_from + processed
        tracker.record(current)
        speed = tracker.speed()
        eta = int((total - current) / speed) if speed and speed > 0 else None

        if time.time() - last_save >= PROGRESS_INTERVAL:
            await asyncio.to_thread(write_progress, task_id, current, total, None, str(f), speed, eta)
            last_save = time.time()

    final = resume_from + processed
    mark_completed(task_id, final, total)
    logger.info("✅ Task %s (file_organizer%s) done: %d files", task_id[:8],
                " DRY" if dry_run else "", final)
