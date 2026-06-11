"""video_convert task — re-encode videos via the compute-service (ffmpeg). Supports dry-run."""
import asyncio
import fnmatch
import logging
import time
from pathlib import Path

import compute_client
from config import load_cameras
from database import get_connection

from task_executors.common import (
    PROGRESS_INTERVAL, SpeedTracker, append_log, mark_completed, pause_if_requested,
    write_progress,
)

logger = logging.getLogger("api")


async def run(task_id: str, params: dict, resume_from: int) -> None:
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

    root = Path(camera.path)
    if not root.exists():
        raise ValueError(f"Videos directory not found: {root}")

    if not dry_run:
        try:
            compute_client._get_urls()  # fails fast if compute is disabled/not configured
        except compute_client.ComputeDisabled:
            raise RuntimeError(
                "Compute-service is disabled. Enable it in compute_config.json to use video_convert."
            )

    # ── Query DB for matching video files (fast, already indexed) ────────────
    date_info = f" [{date_from_s or ''}–{date_to_s or ''}]" if (date_from_s or date_to_s) else ""
    await asyncio.to_thread(append_log, task_id,
        f"Querying DB: camera={camera_id} pattern={input_pat!r}{date_info}…")

    q = ("SELECT file_path FROM files WHERE camera_id=? AND file_type='video'"
         + (" AND timestamp>=?" if date_from_s else "")
         + (" AND timestamp<=?" if date_to_s else "")
         + " ORDER BY timestamp")
    db_args = [camera_id] + ([date_from_s] if date_from_s else []) + ([date_to_s] if date_to_s else [])
    with get_connection() as conn:
        db_rows = conn.execute(q, db_args).fetchall()

    all_files: list[Path] = [
        Path(row["file_path"])
        for row in db_rows
        if fnmatch.fnmatch(Path(row["file_path"]).name.lower(), input_pat.lower())
        and not (out_suffix and Path(row["file_path"]).stem.endswith(out_suffix))
    ]

    resume_msg = f", resuming from #{resume_from}" if resume_from else ""
    await asyncio.to_thread(append_log, task_id,
        f"DB returned {len(db_rows)} video(s), {len(all_files)} match filters{resume_msg}")
    logger.debug("VC %s: DB query done — %d/%d files match pattern=%r suffix_excl=%r",
                 task_id[:8], len(all_files), len(db_rows), input_pat, out_suffix)

    total = len(all_files)
    to_process = all_files[resume_from:]

    await asyncio.to_thread(write_progress, task_id, resume_from, total, None, None, None, None)

    tracker  = SpeedTracker(300)
    processed = 0
    last_save = time.time()

    for f in to_process:
        if await pause_if_requested(task_id, resume_from + processed, total, str(f)):
            return

        dst = f.parent / f"{f.stem}{out_suffix}.{out_ext}"
        rel = str(f.relative_to(root))

        if dst.exists():
            await asyncio.to_thread(append_log, task_id, f"Skip (exists): {rel} → {dst.name}")
        elif dry_run:
            await asyncio.to_thread(append_log, task_id,
                                    f"[DRY] Would convert: {rel} → {dst.name}")
        else:
            await asyncio.to_thread(append_log, task_id, f"Converting: {rel} → {dst.name}")
            try:
                await asyncio.to_thread(
                    compute_client.convert_video, str(f), str(dst), codec, crf, preset
                )
                await asyncio.to_thread(append_log, task_id, f"Done: {dst.name}")
            except (compute_client.ComputeDisabled, compute_client.ComputeUnavailable) as e:
                raise Exception(f"Compute service unavailable: {e}")
            except Exception as e:
                await asyncio.to_thread(append_log, task_id, f"ERROR {rel}: {e}")

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
    logger.info("✅ Task %s (video_convert%s) done: %d files", task_id[:8],
                " DRY" if dry_run else "", final)
