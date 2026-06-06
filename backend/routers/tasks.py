"""Task queue endpoints.

GET  /tasks            — list all tasks
POST /tasks            — create a task
GET  /tasks/metrics    — CPU/RAM from compute service
PUT  /tasks/reorder    — reorder tasks [{id, order_index}]
DELETE /tasks/{id}     — delete a task (must not be running)
PUT  /tasks/{id}/pause   — request pause (running → pausing)
PUT  /tasks/{id}/resume  — resume (paused/failed → queued)
PUT  /tasks/{id}/cancel  — cancel any non-finished task
"""
import json
import logging
import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import compute_client
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
    return d


@router.get("")
def list_tasks():
    with get_connection() as conn:
        return [_row_to_dict(r) for r in get_all_tasks(conn)]


class CreateTaskRequest(BaseModel):
    type: str
    params: dict
    label: Optional[str] = None


@router.post("")
def create_new_task(req: CreateTaskRequest):
    if req.type not in {"video_thumbnails", "openvino", "gemini", "claude"}:
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


class ReorderRequest(BaseModel):
    order: list[dict]


@router.put("/reorder")
def reorder_task_list(req: ReorderRequest):
    with get_connection() as conn:
        reorder_tasks(conn, req.order)
    return {"ok": True}


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
