"""Task queue endpoints.

GET  /tasks                  — list all tasks
POST /tasks                  — create a task
GET  /tasks/metrics          — CPU/RAM from compute service
GET  /tasks/estimate_files   — count files matching video_convert/file_organizer filter
PUT  /tasks/reorder          — reorder tasks [{id, order_index}]
DELETE /tasks/{id}           — delete a task (must not be running)
PUT  /tasks/{id}/pause       — request pause (running → pausing)
PUT  /tasks/{id}/resume      — resume (paused/failed → queued)
PUT  /tasks/{id}/cancel      — cancel any non-finished task
"""
import fnmatch
import json
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import compute_client
import task_runner
from compute_config import load_config
from database import (
    get_connection, get_all_tasks, get_task, create_task,
    update_task_status, delete_task, reorder_tasks,
)

router = APIRouter(prefix="/tasks")
logger = logging.getLogger("api")


def _row_to_dict(row) -> dict:
    d = dict(row)
    try:
        d["params"] = json.loads(d.get("params") or "{}")
    except Exception:
        d["params"] = {}
    d.pop("log_tail", None)  # fetched separately via /tasks/{id}/logs
    return d


@router.get("")
def list_tasks():
    with get_connection() as conn:
        tasks = [_row_to_dict(r) for r in get_all_tasks(conn)]
    return {"tasks": tasks, "global_paused": task_runner.get_global_paused()}


class CreateTaskRequest(BaseModel):
    type: str
    params: dict
    label: Optional[str] = None


ALLOWED_TASK_TYPES = {"video_thumbnails", "openvino", "gemini", "claude",
                      "video_convert", "file_organizer",
                      "gmail_download", "gdrive_upload"}


@router.post("")
def create_new_task(req: CreateTaskRequest):
    if req.type not in ALLOWED_TASK_TYPES:
        raise HTTPException(status_code=400, detail=f"Unknown task type: {req.type}")

    params = dict(req.params)
    if req.label:
        params["label"] = req.label

    task_id = str(uuid.uuid4())
    params_json = json.dumps(params)

    with get_connection() as conn:
        row = conn.execute("SELECT COALESCE(MAX(order_index), -1) AS m FROM tasks").fetchone()
        order_index = row["m"] + 1
        create_task(conn, task_id, req.type, params_json, order_index)
        task = get_task(conn, task_id)

    return _row_to_dict(task)


@router.get("/metrics")
def get_metrics():
    cfg = load_config()
    try:
        data = compute_client.metrics()
        return {"compute_available": True, "compute_mode": cfg["mode"], **data}
    except (compute_client.ComputeDisabled, compute_client.ComputeUnavailable):
        return {
            "compute_available": False,
            "compute_mode": cfg["mode"],
            "cpu_percent": None,
            "memory_total": None,
            "memory_used": None,
            "memory_percent": None,
        }


@router.get("/estimate_files")
def estimate_task_files(
    camera_id: str,
    task_type: str,
    input_pattern: str = "*",
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    output_suffix: Optional[str] = None,
):
    """Count files that would be processed by video_convert or file_organizer."""
    if task_type == "video_convert":
        # Fast path: query the database (already indexed, no filesystem walk)
        q = ("SELECT file_path FROM files WHERE camera_id=? AND file_type='video'"
             + (" AND timestamp>=?" if date_from else "")
             + (" AND timestamp<=?" if date_to else ""))
        args = [camera_id] + ([date_from] if date_from else []) + ([date_to] if date_to else [])
        with get_connection() as conn:
            rows = conn.execute(q, args).fetchall()
        suffix = output_suffix or ""
        count = sum(
            1 for r in rows
            if fnmatch.fnmatch(Path(r["file_path"]).name.lower(), input_pattern.lower())
            and not (suffix and Path(r["file_path"]).stem.endswith(suffix))
        )
        return {"file_count": count}

    elif task_type == "file_organizer":
        # file_organizer only touches root-level files — iterdir is non-recursive and fast
        from config import load_cameras
        cameras_map = {c.id: c for c in load_cameras()}
        camera = cameras_map.get(camera_id)
        if not camera:
            raise HTTPException(status_code=404, detail=f"Camera not found: {camera_id}")
        root = Path(camera.path)
        if not root.exists():
            return {"file_count": 0}
        def _parse_dt(s):
            if not s:
                return None
            dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        dt_from = _parse_dt(date_from)
        dt_to   = _parse_dt(date_to)
        count = 0
        for f in root.iterdir():
            if not f.is_file():
                continue
            if not fnmatch.fnmatch(f.name.lower(), input_pattern.lower()):
                continue
            if dt_from or dt_to:
                mtime = datetime.fromtimestamp(f.stat().st_mtime, tz=timezone.utc)
                if dt_from and mtime < dt_from:
                    continue
                if dt_to and mtime > dt_to:
                    continue
            count += 1
        return {"file_count": count}

    else:
        raise HTTPException(status_code=400, detail=f"estimate_files not supported for: {task_type}")


class ReorderRequest(BaseModel):
    order: list[dict]


@router.put("/reorder")
def reorder_task_list(req: ReorderRequest):
    with get_connection() as conn:
        reorder_tasks(conn, req.order)
    return {"ok": True}


@router.put("/pause_all")
def pause_all():
    task_runner.set_global_paused(True)
    logger.info("⏸ Global queue pause enabled")
    return {"ok": True, "global_paused": True}


@router.put("/resume_all")
def resume_all():
    task_runner.set_global_paused(False)
    logger.info("▶ Global queue pause cleared")
    return {"ok": True, "global_paused": False}


@router.get("/{task_id}/logs")
def get_task_logs(task_id: str):
    with get_connection() as conn:
        task = get_task(conn, task_id)
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        try:
            lines = json.loads(task["log_tail"] or "[]")
        except Exception:
            lines = []
    return {"task_id": task_id, "status": task["status"], "lines": lines}


@router.delete("/{task_id}")
def delete_task_endpoint(task_id: str):
    with get_connection() as conn:
        task = get_task(conn, task_id)
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        if task["status"] == "running":
            raise HTTPException(status_code=400, detail="Cannot delete a running task; pause it first")
        delete_task(conn, task_id)
    return {"ok": True}


@router.put("/{task_id}/pause")
def pause_task(task_id: str):
    with get_connection() as conn:
        task = get_task(conn, task_id)
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        if task["status"] != "running":
            raise HTTPException(status_code=400, detail="Task is not running")
        update_task_status(conn, task_id, "pausing")
    return {"ok": True}


@router.put("/{task_id}/resume")
def resume_task(task_id: str):
    with get_connection() as conn:
        task = get_task(conn, task_id)
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        if task["status"] not in ("paused", "failed"):
            raise HTTPException(
                status_code=400,
                detail=f"Cannot resume task with status '{task['status']}'",
            )
        update_task_status(conn, task_id, "queued")
    return {"ok": True}


@router.put("/{task_id}/skip")
def skip_task_file(task_id: str):
    """Skip the current failed file: increment progress_current by 1 and re-queue."""
    with get_connection() as conn:
        task = get_task(conn, task_id)
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        if task["status"] not in ("paused", "failed"):
            raise HTTPException(
                status_code=400,
                detail=f"Cannot skip task with status '{task['status']}'",
            )
        new_progress = (task["progress_current"] or 0) + 1
        conn.execute(
            "UPDATE tasks SET status='queued', error_message=NULL, "
            "progress_current=? WHERE id=?",
            (new_progress, task_id),
        )
    return {"ok": True}


@router.put("/{task_id}/run_now")
def run_task_now(task_id: str):
    """Clear run_after so a waiting repeating task executes on the next runner tick."""
    with get_connection() as conn:
        task = get_task(conn, task_id)
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        if task["status"] != "queued":
            raise HTTPException(status_code=400, detail="Task is not queued")
        conn.execute("UPDATE tasks SET run_after=NULL WHERE id=?", (task_id,))
    return {"ok": True}


@router.put("/{task_id}/cancel")
def cancel_task(task_id: str):
    with get_connection() as conn:
        task = get_task(conn, task_id)
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        if task["status"] in ("completed", "cancelled"):
            raise HTTPException(status_code=400, detail="Task is already finished")
        update_task_status(conn, task_id, "cancelled")
    return {"ok": True}
