"""Camera catalog and directory scanning endpoints: /cameras, /scan."""
import logging
import time
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from config import load_cameras
from database import get_connection
from scanner import scan_camera

router = APIRouter()
logger = logging.getLogger("api")


class CameraConfigItem(BaseModel):
    id: str
    name: str
    path: str


class CheckPathRequest(BaseModel):
    path: str


@router.get("/cameras/config", summary="Get raw camera configurations (relative paths)")
def get_cameras_config():
    with get_connection() as conn:
        rows = conn.execute("SELECT id, name, path FROM cameras").fetchall()
    return [{"id": r["id"], "name": r["name"], "path": r["path"]} for r in rows]


@router.put("/cameras/config", summary="Overwrite camera configurations in the database")
def put_cameras_config(req: list[CameraConfigItem]):
    seen_ids = set()
    for item in req:
        cid = item.id.strip()
        if not cid:
            raise HTTPException(status_code=400, detail="Camera ID cannot be empty")
        if cid in seen_ids:
            raise HTTPException(status_code=400, detail=f"Duplicate camera ID: '{cid}'")
        seen_ids.add(cid)
        if not item.name.strip():
            raise HTTPException(status_code=400, detail="Camera Name cannot be empty")
        if not item.path.strip():
            raise HTTPException(status_code=400, detail="Camera Path cannot be empty")
    
    with get_connection() as conn:
        conn.execute("DELETE FROM cameras")
        for item in req:
            conn.execute(
                "INSERT INTO cameras (id, name, path) VALUES (?, ?, ?)",
                (item.id.strip(), item.name.strip(), item.path.strip())
            )
    logger.info("📷 Cameras configuration updated: %s", [c.id for c in req])
    return {"ok": True}


@router.post("/cameras/check-path", summary="Check if camera relative path exists under CAMERA_ROOT")
def check_camera_path(req: CheckPathRequest):
    from config import CAMERA_ROOT
    abs_path = CAMERA_ROOT / req.path
    exists = abs_path.exists() and abs_path.is_dir()
    return {
        "exists": exists,
        "absolute_path": str(abs_path),
        "is_dir": abs_path.is_dir() if exists else False
    }



@router.get("/cameras", summary="List all configured cameras")
def list_cameras():
    cameras = load_cameras()
    result = [
        {
            "id": c.id,
            "name": c.name,
            "path": c.path,
            "path_exists": Path(c.path).is_dir(),
        }
        for c in cameras
    ]
    logger.debug("📷 Список камер → %d камер: %s", len(result), [c["id"] for c in result])
    return result


@router.get("/cameras/{camera_id}/date_range", summary="Min and max timestamps for a camera")
def camera_date_range(camera_id: str):
    with get_connection() as conn:
        row = conn.execute(
            "SELECT MIN(timestamp) AS min_ts, MAX(timestamp) AS max_ts FROM files WHERE camera_id = ?",
            (camera_id,),
        ).fetchone()
    if not row or not row["min_ts"]:
        return {"date_from": None, "date_to": None}
    return {"date_from": row["min_ts"], "date_to": row["max_ts"]}


@router.post("/scan", summary="Scan camera directories and update the database")
def scan(
    camera_id: str | None = Query(
        default=None,
        description="Camera ID to scan. Leave empty to scan **all** cameras. "
                    "Use GET /cameras to see available IDs.",
    ),
):
    cameras = load_cameras()
    cameras_by_id = {c.id: c for c in cameras}

    if camera_id is not None and camera_id not in cameras_by_id:
        raise HTTPException(
            status_code=404,
            detail=f"Camera '{camera_id}' not found. "
                   f"Available: {list(cameras_by_id.keys())}",
        )

    targets = [cameras_by_id[camera_id]] if camera_id else cameras
    logger.info("🔍 Сканирование: %s", camera_id or f"все камеры ({len(targets)} шт.)")

    start = time.monotonic()
    total_files = 0
    with get_connection() as conn:
        for camera in targets:
            total_files += scan_camera(conn, camera)

    duration = round(time.monotonic() - start, 2)
    logger.info("✅ Сканирование завершено → %d файлов за %.1f с", total_files, duration)
    return {
        "scanned_cameras": len(targets),
        "total_files_found": total_files,
        "duration_seconds": duration,
    }
