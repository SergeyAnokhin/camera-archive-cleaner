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
    result = [{"id": c.id, "name": c.name, "path": c.path} for c in cameras]
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
