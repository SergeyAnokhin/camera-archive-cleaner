"""Aggregated statistics and file-listing endpoints: /stats, /files, /distribution, /previews."""
import logging
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, HTTPException, Query

from api_helpers import fmt_range, row_to_dict
from config import load_cameras
from database import (
    get_connection,
    get_files_paginated,
    get_hour_distribution,
    get_sampled_photo_ids,
    get_stats_by_camera,
    get_stats_grouped,
    get_stats_total,
)

router = APIRouter()
logger = logging.getLogger("api")


@router.get("/stats", summary="Get aggregated file statistics")
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

    cam_label = camera_id or "все"
    logger.info("📊 Статистика [%s] камера=%s %s", group_by, cam_label, fmt_range(dt_from, dt_to))

    with get_connection() as conn:
        if group_by == "total":
            row = get_stats_total(conn, camera_id, dt_from, dt_to)
            result = row_to_dict(row)
            logger.info("   └─ итог → фото=%d видео=%d размер=%.2f ГБ", result["photo_count"], result["video_count"], result["total_size_gb"])
            return result

        if group_by == "camera":
            rows = get_stats_by_camera(conn, dt_from, dt_to)
            items = [
                {
                    "camera_id": r["camera_id"],
                    "name": cameras_by_id.get(r["camera_id"], r["camera_id"]),
                    **row_to_dict(r),
                }
                for r in rows
            ]
            totals_row = get_stats_total(conn, None, dt_from, dt_to)
            logger.info("   └─ по камерам → %d камер", len(items))
            return {"cameras": items, "totals": row_to_dict(totals_row)}

        rows = get_stats_grouped(conn, group_by, camera_id, dt_from, dt_to)
        periods = [{"period": r["period"], **row_to_dict(r)} for r in rows]
        logger.info("   └─ по %s → %d периодов", group_by, len(periods))
        return {
            "group_by": group_by,
            "camera_id": camera_id,
            "date_from": date_from,
            "date_to": date_to,
            "periods": periods,
        }


@router.get("/files", summary="Paginated file list for a time range")
def get_files(
    camera_id: str | None = Query(default=None),
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=500),
):
    dt_from = date_from.isoformat() if date_from else None
    dt_to = date_to.isoformat() if date_to else None
    logger.info("📁 Файлы стр.%d (по %d) камера=%s %s", page, page_size, camera_id or "все", fmt_range(dt_from, dt_to))
    with get_connection() as conn:
        rows, total = get_files_paginated(conn, camera_id, dt_from, dt_to, page, page_size)
        files = [
            {
                "id": r["id"],
                "file_type": r["file_type"],
                "timestamp": r["timestamp"],
                "file_path": r["file_path"],
                "file_size": r["file_size"],
            }
            for r in rows
        ]
    logger.info("   └─ всего %d, показано %d на стр.%d", total, len(files), page)
    return {"files": files, "total": total, "page": page, "page_size": page_size}


@router.get("/distribution", summary="5-minute file distribution within a time range")
def distribution(
    camera_id: str | None = Query(default=None),
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
):
    dt_from = date_from.isoformat() if date_from else None
    dt_to = date_to.isoformat() if date_to else None
    logger.info("📈 Распределение камера=%s %s", camera_id or "все", fmt_range(dt_from, dt_to))
    with get_connection() as conn:
        rows = get_hour_distribution(conn, camera_id, dt_from, dt_to)
    by_bucket = {r["bucket"]: r for r in rows}
    buckets = [
        {
            "bucket": i,
            "minute_start": i,
            "total_count":       by_bucket[i]["total_count"]       if i in by_bucket else 0,
            "photo_count":       by_bucket[i]["photo_count"]       if i in by_bucket else 0,
            "video_count":       by_bucket[i]["video_count"]       if i in by_bucket else 0,
            "photo_size_bytes":  by_bucket[i]["photo_size_bytes"]  if i in by_bucket else 0,
            "video_size_bytes":  by_bucket[i]["video_size_bytes"]  if i in by_bucket else 0,
            "total_size_bytes":  by_bucket[i]["total_size_bytes"]  if i in by_bucket else 0,
        }
        for i in range(60)
    ]
    non_zero = sum(1 for b in buckets if b["total_count"] > 0)
    total_files = sum(b["total_count"] for b in buckets)
    logger.info("   └─ %d файлов в %d ненулевых минутах из 60", total_files, non_zero)
    return {"buckets": buckets}


@router.get("/previews", summary="Uniformly sampled photo IDs for a time range")
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
    logger.info("🖼️  Превью камера=%s %s → %d/%d ID", camera_id or "все", fmt_range(dt_from, dt_to), len(file_ids), count)
    return {"file_ids": file_ids}
