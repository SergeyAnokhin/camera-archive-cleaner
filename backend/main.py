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
from fastapi.responses import FileResponse

from config import load_cameras
from database import (
    delete_all_thumbnails,
    get_connection,
    get_file_by_id,
    get_files_paginated,
    get_hour_distribution,
    get_sampled_photo_ids,
    get_stats_by_camera,
    get_stats_grouped,
    get_stats_total,
    init_db,
)
from thumbnails import THUMB_DIR, get_or_create_thumbnail
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
# /cameras
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
    camera_id: str | None = Query(default=None),
    group_by: Literal["total", "camera", "year", "month", "day", "hour"] = Query(default="total"),
    date_from: datetime | None = Query(default=None, examples=["2023-11-27T00:00:00"]),
    date_to: datetime | None = Query(default=None, examples=["2024-11-30T23:59:59"]),
):
    cameras_by_id = {c.id: c.name for c in load_cameras()}

    if camera_id and camera_id not in cameras_by_id:
        raise HTTPException(status_code=404, detail=f"Camera '{camera_id}' not found.")

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

        rows = get_stats_grouped(conn, group_by, camera_id, dt_from, dt_to)
        return {
            "group_by": group_by,
            "camera_id": camera_id,
            "date_from": date_from,
            "date_to": date_to,
            "periods": [{"period": r["period"], **_row_to_dict(r)} for r in rows],
        }


# ---------------------------------------------------------------------------
# /files — paginated chronological list for a period
# ---------------------------------------------------------------------------

@app.get("/files", summary="Paginated file list for a time range")
def get_files(
    camera_id: str | None = Query(default=None),
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=500),
):
    dt_from = date_from.isoformat() if date_from else None
    dt_to = date_to.isoformat() if date_to else None
    with get_connection() as conn:
        rows, total = get_files_paginated(conn, camera_id, dt_from, dt_to, page, page_size)
        files = [
            {
                "id": r["id"],
                "file_type": r["file_type"],
                "timestamp": r["timestamp"],
                "file_path": r["file_path"],
            }
            for r in rows
        ]
    return {"files": files, "total": total, "page": page, "page_size": page_size}


# ---------------------------------------------------------------------------
# /thumbnail/{file_id} — on-demand thumbnail generation
# ---------------------------------------------------------------------------

@app.get("/thumbnail/{file_id}", summary="Get or generate a thumbnail for a photo")
def get_thumbnail(file_id: int):
    with get_connection() as conn:
        file_row = get_file_by_id(conn, file_id)
        if file_row is None:
            raise HTTPException(status_code=404, detail="File not found")
        if file_row["file_type"] != "photo":
            raise HTTPException(status_code=400, detail="Thumbnails only available for photos")
        try:
            thumb_path = get_or_create_thumbnail(conn, file_id, file_row["file_path"])
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e))
    return FileResponse(str(thumb_path), media_type="image/jpeg")


# ---------------------------------------------------------------------------
# /media/{file_id} — serve original file (photos and videos)
# ---------------------------------------------------------------------------

@app.get("/media/{file_id}", summary="Serve the original file")
def get_media(file_id: int):
    with get_connection() as conn:
        file_row = get_file_by_id(conn, file_id)
        if file_row is None:
            raise HTTPException(status_code=404, detail="File not found")
        from pathlib import Path
        src = Path(file_row["file_path"])
        if not src.exists():
            raise HTTPException(status_code=404, detail="Source file not found on disk")
    suffix = src.suffix.lower()
    mime_map = {
        ".mp4": "video/mp4",
        ".webm": "video/webm",
        ".mov": "video/quicktime",
        ".avi": "video/x-msvideo",
        ".mkv": "video/x-matroska",
    }
    media_type = mime_map.get(suffix, "application/octet-stream")
    return FileResponse(str(src), media_type=media_type)


# ---------------------------------------------------------------------------
# /distribution — 5-minute bucket counts for an hour
# ---------------------------------------------------------------------------

@app.get("/distribution", summary="5-minute file distribution within a time range")
def distribution(
    camera_id: str | None = Query(default=None),
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
):
    dt_from = date_from.isoformat() if date_from else None
    dt_to = date_to.isoformat() if date_to else None
    with get_connection() as conn:
        rows = get_hour_distribution(conn, camera_id, dt_from, dt_to)
    by_bucket = {r["bucket"]: r for r in rows}
    buckets = [
        {
            "bucket": i,
            "minute_start": i,
            "total_count": by_bucket[i]["total_count"] if i in by_bucket else 0,
            "photo_count": by_bucket[i]["photo_count"] if i in by_bucket else 0,
            "video_count": by_bucket[i]["video_count"] if i in by_bucket else 0,
        }
        for i in range(60)
    ]
    return {"buckets": buckets}


# ---------------------------------------------------------------------------
# /previews — uniformly sampled photo IDs for a period
# ---------------------------------------------------------------------------

@app.get("/previews", summary="Uniformly sampled photo IDs for a time range")
def get_previews(
    camera_id: str | None = Query(default=None),
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
    count: int = Query(default=3, ge=1, le=20),
):
    dt_from = date_from.isoformat() if date_from else None
    dt_to = date_to.isoformat() if date_to else None
    with get_connection() as conn:
        file_ids = get_sampled_photo_ids(conn, camera_id, dt_from, dt_to, count)
    return {"file_ids": file_ids}


# ---------------------------------------------------------------------------
# /database  /thumbnails — maintenance actions
# ---------------------------------------------------------------------------

@app.delete("/database", summary="Delete all scanned file records")
def clear_database():
    with get_connection() as conn:
        conn.execute("DELETE FROM files")
    return {"deleted": True}


@app.delete("/thumbnails", summary="Delete all cached thumbnail files")
def clear_thumbnails():
    deleted_files = 0
    if THUMB_DIR.exists():
        for f in THUMB_DIR.iterdir():
            if f.is_file():
                f.unlink()
                deleted_files += 1
    with get_connection() as conn:
        deleted_rows = delete_all_thumbnails(conn)
    return {"deleted_files": deleted_files, "deleted_rows": deleted_rows}


def _row_to_dict(row) -> dict:
    size = row["total_size_bytes"] or 0
    return {
        "photo_count": row["photo_count"] or 0,
        "video_count": row["video_count"] or 0,
        "total_size_bytes": size,
        "total_size_gb": round(size / 1024 ** 3, 3),
    }
