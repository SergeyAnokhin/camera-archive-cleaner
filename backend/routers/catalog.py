"""Camera catalog and directory scanning endpoints: /cameras, /scan."""
import logging
import time

from fastapi import APIRouter, HTTPException, Query

from config import load_cameras
from database import get_connection
from scanner import scan_camera

router = APIRouter()
logger = logging.getLogger("api")


@router.get("/cameras", summary="List all configured cameras")
def list_cameras():
    cameras = load_cameras()
    result = [{"id": c.id, "name": c.name, "path_snapshots": c.path_snapshots, "path_videos": c.path_videos} for c in cameras]
    logger.info("📷 Список камер → %d камер: %s", len(result), [c["id"] for c in result])
    return result


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
