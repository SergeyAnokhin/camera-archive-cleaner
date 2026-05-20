"""Safe-delete endpoints: per-file preview/confirm (with video auto-matching) and date-range delete."""
import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from api_helpers import fmt_range
from database import get_connection, pop_old_basic_thumbnails

router = APIRouter()
logger = logging.getLogger("api")


class PreviewRequest(BaseModel):
    file_ids: list[int]

class ConfirmRequest(BaseModel):
    file_ids: list[int]


@router.post("/delete/preview", summary="Preview files to delete, including auto-matched related videos")
def delete_preview(req: PreviewRequest):
    if not req.file_ids:
        raise HTTPException(status_code=400, detail="file_ids cannot be empty")
    logger.info("🗑️  Превью удаления: %d файлов", len(req.file_ids))

    with get_connection() as conn:
        placeholders = ",".join("?" * len(req.file_ids))
        rows = conn.execute(
            f"SELECT id, file_type, timestamp, camera_id, file_path FROM files WHERE id IN ({placeholders})",
            req.file_ids,
        ).fetchall()

        found_ids = {r["id"] for r in rows}
        missing = [i for i in req.file_ids if i not in found_ids]
        if missing:
            raise HTTPException(status_code=404, detail=f"File IDs not found: {missing}")

        selected = []
        photo_entries = []
        for r in rows:
            item = {"id": r["id"], "file_type": r["file_type"], "timestamp": r["timestamp"], "file_path": r["file_path"]}
            if r["file_type"] == "photo":
                item["thumb_url"] = f"/api/thumbnail/{r['id']}"
                photo_entries.append((r["camera_id"], r["timestamp"]))
            selected.append(item)

        # Auto-match related videos within ±5 seconds of any selected photo
        seen_ids = set(req.file_ids)
        related_videos = []
        for camera_id, ts in photo_entries:
            excl = ",".join("?" * len(seen_ids))
            video_rows = conn.execute(
                f"""
                SELECT id, file_type, timestamp, file_path
                FROM files
                WHERE camera_id = ?
                  AND file_type = 'video'
                  AND id NOT IN ({excl})
                  AND ABS((julianday(timestamp) - julianday(?)) * 86400.0) <= 5.0
                """,
                [camera_id] + list(seen_ids) + [ts],
            ).fetchall()
            for vr in video_rows:
                if vr["id"] not in seen_ids:
                    related_videos.append({
                        "id": vr["id"],
                        "file_type": "video",
                        "timestamp": vr["timestamp"],
                        "file_path": vr["file_path"],
                    })
                    seen_ids.add(vr["id"])

    logger.info("   └─ выбрано %d, связанных видео %d", len(selected), len(related_videos))
    return {"selected": selected, "related_videos": related_videos}


@router.post("/delete/confirm", summary="Physically delete files and remove DB records")
def delete_confirm(req: ConfirmRequest):
    if not req.file_ids:
        raise HTTPException(status_code=400, detail="file_ids cannot be empty")
    logger.info("❌ Удаление: %d файлов", len(req.file_ids))

    deleted = []
    failed = []
    photo_count = 0
    video_count = 0
    freed_bytes = 0
    thumbnails_deleted = 0

    with get_connection() as conn:
        placeholders = ",".join("?" * len(req.file_ids))
        rows = conn.execute(
            f"""
            SELECT f.id, f.file_type, f.file_size, f.file_path, t.thumb_path
            FROM files f
            LEFT JOIN thumbnails t ON t.file_id = f.id
            WHERE f.id IN ({placeholders})
            """,
            req.file_ids,
        ).fetchall()

        rows_by_id = {r["id"]: r for r in rows}
        ids_to_delete_from_db = []

        for row in rows:
            logger.info("   ├─ %s", row["file_path"])

        for file_id in req.file_ids:
            row = rows_by_id.get(file_id)
            if row is None:
                deleted.append(file_id)
                continue

            src = Path(row["file_path"])
            try:
                if src.exists():
                    freed_bytes += row["file_size"] or 0
                    src.unlink()
            except Exception as e:
                failed.append({"id": file_id, "reason": str(e)})
                continue

            if row["file_type"] == "photo":
                photo_count += 1
            else:
                video_count += 1

            if row["thumb_path"]:
                thumb = Path(row["thumb_path"])
                try:
                    if thumb.exists():
                        thumb.unlink()
                        thumbnails_deleted += 1
                except Exception:
                    pass

            ids_to_delete_from_db.append(file_id)
            deleted.append(file_id)

        if ids_to_delete_from_db:
            db_ph = ",".join("?" * len(ids_to_delete_from_db))
            conn.execute(f"DELETE FROM files WHERE id IN ({db_ph})", ids_to_delete_from_db)

        # Opportunistic cleanup: evict basic thumbnails older than 30 days
        old_paths = pop_old_basic_thumbnails(conn, days=30)
        for p in old_paths:
            try:
                Path(p).unlink(missing_ok=True)
                thumbnails_deleted += 1
            except Exception:
                pass

    logger.info(
        "   └─ удалено %d (фото %d, видео %d), ошибок %d, превьюшек %d, освобождено %d байт",
        len(deleted), photo_count, video_count, len(failed), thumbnails_deleted, freed_bytes,
    )
    return {
        "deleted": deleted,
        "failed": failed,
        "photo_count": photo_count,
        "video_count": video_count,
        "thumbnails_deleted": thumbnails_deleted,
        "freed_bytes": freed_bytes,
    }


class RangeDeleteRequest(BaseModel):
    camera_id: str | None = None
    date_from: str
    date_to: str


@router.post("/delete/preview_range", summary="Preview files in a date range for deletion")
def delete_preview_range(req: RangeDeleteRequest):
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT id, file_type, timestamp, file_path
            FROM files
            WHERE (? IS NULL OR camera_id = ?)
              AND timestamp >= ?
              AND timestamp <= ?
            ORDER BY timestamp
            """,
            [req.camera_id, req.camera_id, req.date_from, req.date_to],
        ).fetchall()
    files = [
        {"id": r["id"], "file_type": r["file_type"], "timestamp": r["timestamp"], "file_path": r["file_path"]}
        for r in rows
    ]
    logger.info(
        "🗑️  Превью диапазона: камера=%s %s → %d файлов",
        req.camera_id or "все", fmt_range(req.date_from, req.date_to), len(files),
    )
    return {"selected": files, "related_videos": []}


@router.post("/delete/by_range", summary="Delete all files in a date range")
def delete_by_range(req: RangeDeleteRequest):
    logger.info("❌ Удаление диапазона: камера=%s %s", req.camera_id or "все", fmt_range(req.date_from, req.date_to))
    deleted_count = 0
    failed_count = 0
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT f.id, f.file_path, t.thumb_path
            FROM files f LEFT JOIN thumbnails t ON t.file_id = f.id
            WHERE (? IS NULL OR f.camera_id = ?)
              AND f.timestamp >= ?
              AND f.timestamp <= ?
            """,
            [req.camera_id, req.camera_id, req.date_from, req.date_to],
        ).fetchall()

        ids_ok = []
        for row in rows:
            src = Path(row["file_path"])
            try:
                if src.exists():
                    src.unlink()
            except Exception:
                failed_count += 1
                continue
            if row["thumb_path"]:
                try:
                    thumb = Path(row["thumb_path"])
                    if thumb.exists():
                        thumb.unlink()
                except Exception:
                    pass
            ids_ok.append(row["id"])
            deleted_count += 1

        if ids_ok:
            ph = ",".join("?" * len(ids_ok))
            conn.execute(f"DELETE FROM files WHERE id IN ({ph})", ids_ok)

    logger.info("   └─ удалено %d, ошибок %d", deleted_count, failed_count)
    return {"deleted_count": deleted_count, "failed_count": failed_count}
