"""Camera catalog and directory scanning endpoints: /cameras, /scan, /camera_root, /media_dirs."""
import logging
import os
import time
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

import config
import settings_manager
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
    abs_path = config.CAMERA_ROOT / req.path
    exists = abs_path.exists() and abs_path.is_dir()
    return {
        "exists": exists,
        "absolute_path": str(abs_path),
        "is_dir": abs_path.is_dir() if exists else False
    }


class CameraRootRequest(BaseModel):
    camera_root: str


@router.get("/camera_root", summary="Get current CAMERA_ROOT value and its source")
def get_camera_root():
    srv = settings_manager.load_server_config()
    return {
        "camera_root": str(config.CAMERA_ROOT),
        "from_server_config": "camera_root" in srv,
        "from_env": bool(os.environ.get("CAMERA_ROOT")),
    }


@router.put("/camera_root", summary="Set CAMERA_ROOT (persisted to server_config.json, takes effect immediately)")
def put_camera_root(req: CameraRootRequest):
    new_root = req.camera_root.strip()
    if not new_root:
        raise HTTPException(status_code=400, detail="camera_root cannot be empty")
    config.set_camera_root(new_root)
    srv = settings_manager.load_server_config()
    srv["camera_root"] = new_root
    settings_manager.save_server_config(srv)
    logger.info("📁 CAMERA_ROOT updated to: %s", new_root)
    return {"camera_root": new_root, "ok": True}


@router.get("/media_dirs", summary="List subdirectories of /media for camera root selection")
def get_media_dirs():
    """Returns the subdirs of /media so the UI can offer a dropdown for camera_root selection."""
    media = Path("/media")
    if not media.exists() or not media.is_dir():
        return {"exists": False, "path": "/media", "dirs": []}
    dirs = sorted(
        p.name for p in media.iterdir()
        if p.is_dir() and not p.name.startswith(".")
    )
    return {"exists": True, "path": str(media), "dirs": dirs}


@router.get("/camera_root/subdirs", summary="List immediate subdirectories of CAMERA_ROOT for camera path selection")
def get_camera_root_subdirs():
    """Returns immediate subdirs of CAMERA_ROOT so the UI can offer a directory picker for camera paths."""
    root = config.CAMERA_ROOT
    if not root.exists() or not root.is_dir():
        return {"exists": False, "path": str(root), "dirs": []}
    dirs = sorted(
        p.name for p in root.iterdir()
        if p.is_dir() and not p.name.startswith(".")
    )
    return {"exists": True, "path": str(root), "dirs": dirs}



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
