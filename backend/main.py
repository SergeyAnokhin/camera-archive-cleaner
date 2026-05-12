import logging
import time
from datetime import datetime
from typing import Literal

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from config import load_cameras
from database import (
    get_connection,
    get_stats_by_camera,
    get_stats_grouped,
    get_stats_total,
    init_db,
)
from scanner import scan_camera

app = FastAPI(title="Camera Snapshots Cleaner", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    init_db()


# ---------------------------------------------------------------------------
# /cameras — list configured cameras (useful to look up valid camera IDs)
# ---------------------------------------------------------------------------

@app.get("/cameras", summary="List all configured cameras")
def list_cameras():
    cameras = load_cameras()
    return [{"id": c.id, "name": c.name} for c in cameras]


# ---------------------------------------------------------------------------
# /scan
# ---------------------------------------------------------------------------

@app.post("/scan", summary="Scan camera directories and update the database")
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

    start = time.monotonic()
    total_files = 0
    with get_connection() as conn:
        for camera in targets:
            total_files += scan_camera(conn, camera)

    return {
        "scanned_cameras": len(targets),
        "total_files_found": total_files,
        "duration_seconds": round(time.monotonic() - start, 2),
    }


# ---------------------------------------------------------------------------
# /stats
# ---------------------------------------------------------------------------

@app.get("/stats", summary="Get aggregated file statistics")
def stats(
    camera_id: str | None = Query(
        default=None,
        description="Filter by camera ID. Leave empty for all cameras. "
                    "Use GET /cameras to see available IDs.",
    ),
    group_by: Literal["total", "camera", "year", "month", "day", "hour"] = Query(
        default="total",
        description="Aggregation level.",
    ),
    date_from: datetime | None = Query(
        default=None,
        description="Start of time range (inclusive). Format: `YYYY-MM-DDTHH:MM:SS`",
        examples=["2023-11-27T00:00:00"],
    ),
    date_to: datetime | None = Query(
        default=None,
        description="End of time range (inclusive). Format: `YYYY-MM-DDTHH:MM:SS`",
        examples=["2024-11-30T23:59:59"],
    ),
):
    cameras_by_id = {c.id: c.name for c in load_cameras()}

    if camera_id and camera_id not in cameras_by_id:
        raise HTTPException(status_code=404, detail=f"Camera '{camera_id}' not found.")

    # Convert datetime to ISO string for SQLite comparison
    dt_from = date_from.isoformat() if date_from else None
    dt_to = date_to.isoformat() if date_to else None

    with get_connection() as conn:
        if group_by == "total":
            row = get_stats_total(conn, camera_id, dt_from, dt_to)
            return _row_to_dict(row)

        if group_by == "camera":
            rows = get_stats_by_camera(conn, dt_from, dt_to)
            items = [
                {
                    "camera_id": r["camera_id"],
                    "name": cameras_by_id.get(r["camera_id"], r["camera_id"]),
                    **_row_to_dict(r),
                }
                for r in rows
            ]
            totals_row = get_stats_total(conn, None, dt_from, dt_to)
            return {"cameras": items, "totals": _row_to_dict(totals_row)}

        # year / month / day / hour
        rows = get_stats_grouped(conn, group_by, camera_id, dt_from, dt_to)
        return {
            "group_by": group_by,
            "camera_id": camera_id,
            "date_from": date_from,
            "date_to": date_to,
            "periods": [{"period": r["period"], **_row_to_dict(r)} for r in rows],
        }


# ---------------------------------------------------------------------------
# /database  /thumbnails — maintenance actions
# ---------------------------------------------------------------------------

@app.delete("/database", summary="Delete all scanned file records")
def clear_database():
    with get_connection() as conn:
        conn.execute("DELETE FROM files")
    return {"deleted": True}


@app.delete("/thumbnails", summary="Delete all cached thumbnail files (Stage 3 stub)")
def clear_thumbnails():
    return {"deleted": 0, "message": "Thumbnails not yet implemented (Stage 3)"}


def _row_to_dict(row) -> dict:
    size = row["total_size_bytes"] or 0
    return {
        "photo_count": row["photo_count"] or 0,
        "video_count": row["video_count"] or 0,
        "total_size_bytes": size,
        "total_size_gb": round(size / 1024 ** 3, 3),
    }
