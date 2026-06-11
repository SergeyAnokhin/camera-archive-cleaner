"""Maintenance actions: clear DB records, clear thumbnail caches (per-type and all), storage usage."""
import logging
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Query

from database import DB_PATH, delete_all_thumbnails, get_connection
from thumbnails import THUMB_DIR
from diff_thumbnails import DIFF_THUMB_DIR
from erosion_thumbnails import EROSION_THUMB_DIR
from compute_cache import OV_THUMB_DIR, VID_THUMB_DIR

router = APIRouter()
logger = logging.getLogger("api")


def _filter_file_ids(camera_id: Optional[str] = None,
                     date_from: Optional[str] = None,
                     date_to: Optional[str] = None) -> list[int]:
    conds, params = [], []
    if camera_id:
        conds.append("camera_id=?"); params.append(camera_id)
    if date_from:
        conds.append("timestamp>=?"); params.append(date_from)
    if date_to:
        conds.append("timestamp<=?"); params.append(date_to)
    where = ("WHERE " + " AND ".join(conds)) if conds else ""
    with get_connection() as conn:
        rows = conn.execute(f"SELECT id FROM files {where}", params).fetchall()
    return [r["id"] for r in rows]


def _clear_dir_all(d: Path) -> tuple[int, int]:
    count, size = 0, 0
    if d.exists():
        for f in d.iterdir():
            if f.is_file():
                size += f.stat().st_size
                f.unlink()
                count += 1
    return count, size


def _clear_dir_by_ids_prefix(d: Path, file_ids: list[int]) -> int:
    """Delete files whose name starts with '{file_id}_' (video cache: {file_id}_{mode}.ext)."""
    count = 0
    if not d.exists() or not file_ids:
        return 0
    for fid in file_ids:
        for f in d.glob(f"{fid}_*"):
            if f.is_file():
                f.unlink()
                count += 1
    return count


def _clear_dir_by_ids_suffix(d: Path, file_ids: list[int]) -> int:
    """Delete files whose name ends with '_{file_id}.jpg' (motion/diff caches: {key}_{file_id}.jpg)."""
    count = 0
    if not d.exists() or not file_ids:
        return 0
    for fid in file_ids:
        for f in d.glob(f"*_{fid}.jpg"):
            if f.is_file():
                f.unlink()
                count += 1
    return count


@router.delete("/database", summary="Delete scanned file records (optionally by camera / date range)")
def clear_database(camera_id: Optional[str] = Query(default=None),
                   date_from: Optional[str] = Query(default=None),
                   date_to: Optional[str] = Query(default=None)):
    conds, params = [], []
    if camera_id:
        conds.append("camera_id=?"); params.append(camera_id)
    if date_from:
        conds.append("timestamp>=?"); params.append(date_from)
    if date_to:
        conds.append("timestamp<=?"); params.append(date_to)
    where = ("WHERE " + " AND ".join(conds)) if conds else ""
    logger.info("🧹 Очистка базы данных%s", f" (камера: {camera_id})" if camera_id else "")
    with get_connection() as conn:
        conn.execute(f"DELETE FROM files {where}", params)
    return {"deleted": True}


@router.post("/database/vacuum", summary="Compact the SQLite database (VACUUM)")
def vacuum_database():
    logger.info("🗜️ VACUUM базы данных…")
    with get_connection() as conn:
        conn.execute("VACUUM")
    logger.info("   └─ VACUUM завершён")
    return {"ok": True}


@router.delete("/thumbnails", summary="Delete cached basic thumbnail files")
def clear_thumbnails(camera_id: Optional[str] = Query(default=None),
                     date_from: Optional[str] = Query(default=None),
                     date_to: Optional[str] = Query(default=None)):
    logger.info("🧹 Очистка кэша миниатюр%s", f" (камера: {camera_id})" if camera_id else "")
    deleted_files = 0
    if camera_id or date_from or date_to:
        file_ids = _filter_file_ids(camera_id, date_from, date_to)
        for fid in file_ids:
            p = THUMB_DIR / f"{fid}.jpg"
            if p.is_file():
                p.unlink()
                deleted_files += 1
        if file_ids:
            with get_connection() as conn:
                placeholders = ",".join("?" * len(file_ids))
                deleted_rows = conn.execute(
                    f"DELETE FROM thumbnails WHERE file_id IN ({placeholders})", file_ids
                ).rowcount
        else:
            deleted_rows = 0
    else:
        if THUMB_DIR.exists():
            for f in THUMB_DIR.iterdir():
                if f.is_file():
                    f.unlink()
                    deleted_files += 1
        with get_connection() as conn:
            deleted_rows = delete_all_thumbnails(conn)
    logger.info("   └─ миниатюры очищены → %d файлов, %d записей в БД", deleted_files, deleted_rows)
    return {"deleted_files": deleted_files, "deleted_rows": deleted_rows}


@router.delete("/diff_thumbnails", summary="Delete cached diff thumbnail files")
def clear_diff_thumbnails(camera_id: Optional[str] = Query(default=None),
                          date_from: Optional[str] = Query(default=None),
                          date_to: Optional[str] = Query(default=None)):
    logger.info("🧹 Очистка кэша diff-миниатюр%s", f" (камера: {camera_id})" if camera_id else "")
    if camera_id or date_from or date_to:
        file_ids = _filter_file_ids(camera_id, date_from, date_to)
        deleted_files = _clear_dir_by_ids_suffix(DIFF_THUMB_DIR, file_ids)
    else:
        deleted_files, _ = _clear_dir_all(DIFF_THUMB_DIR)
    logger.info("   └─ diff-миниатюры очищены → %d файлов", deleted_files)
    return {"deleted_files": deleted_files}


@router.delete("/erosion_thumbnails", summary="Delete cached erosion thumbnail files")
def clear_erosion_thumbnails(camera_id: Optional[str] = Query(default=None),
                             date_from: Optional[str] = Query(default=None),
                             date_to: Optional[str] = Query(default=None)):
    logger.info("🧹 Очистка кэша erosion-миниатюр%s", f" (камера: {camera_id})" if camera_id else "")
    if camera_id or date_from or date_to:
        file_ids = _filter_file_ids(camera_id, date_from, date_to)
        deleted_files = _clear_dir_by_ids_suffix(EROSION_THUMB_DIR, file_ids)
    else:
        deleted_files, _ = _clear_dir_all(EROSION_THUMB_DIR)
    logger.info("   └─ erosion-миниатюры очищены → %d файлов", deleted_files)
    return {"deleted_files": deleted_files}


@router.delete("/video_thumbnails", summary="Delete cached video thumbnail files")
def clear_video_thumbnails(camera_id: Optional[str] = Query(default=None),
                           date_from: Optional[str] = Query(default=None),
                           date_to: Optional[str] = Query(default=None)):
    logger.info("🧹 Очистка кэша видео-превью%s", f" (камера: {camera_id})" if camera_id else "")
    if camera_id or date_from or date_to:
        file_ids = _filter_file_ids(camera_id, date_from, date_to)
        deleted_files = _clear_dir_by_ids_prefix(VID_THUMB_DIR, file_ids)
        if file_ids:
            with get_connection() as conn:
                ph = ",".join("?" * len(file_ids))
                conn.execute(f"DELETE FROM video_previews WHERE file_id IN ({ph})", file_ids)
    else:
        deleted_files, _ = _clear_dir_all(VID_THUMB_DIR)
        with get_connection() as conn:
            conn.execute("DELETE FROM video_previews")
    logger.info("   └─ видео-превью очищены → %d файлов", deleted_files)
    return {"deleted_files": deleted_files}


@router.delete("/openvino_thumbnails", summary="Delete OpenVINO detection results and bbox thumbnails")
def clear_openvino_thumbnails(camera_id: Optional[str] = Query(default=None),
                              date_from: Optional[str] = Query(default=None),
                              date_to: Optional[str] = Query(default=None)):
    """
    Clears object_detection records (and disk cache for global run).
    With date range: clears by file_ids matching the range; disk cache (content-addressed) only on global run.
    """
    logger.info("🧹 Очистка OpenVINO данных%s", f" (камера: {camera_id})" if camera_id else "")
    deleted_files = 0
    if camera_id or date_from or date_to:
        file_ids = _filter_file_ids(camera_id, date_from, date_to)
        deleted_rows = 0
        if file_ids:
            with get_connection() as conn:
                ph = ",".join("?" * len(file_ids))
                deleted_rows = conn.execute(
                    f"DELETE FROM object_detection WHERE file_id IN ({ph})", file_ids
                ).rowcount
        logger.info("   └─ OpenVINO данные очищены → %d записей", deleted_rows)
    else:
        with get_connection() as conn:
            deleted_rows = conn.execute("DELETE FROM object_detection").rowcount
        deleted_files, _ = _clear_dir_all(OV_THUMB_DIR)
        logger.info("   └─ OpenVINO данные очищены → %d файлов, %d записей", deleted_files, deleted_rows)
    return {"deleted_files": deleted_files, "deleted_rows": deleted_rows}


@router.delete("/all_thumbnails", summary="Delete all cached thumbnail files (all types)")
def clear_all_thumbnails(camera_id: Optional[str] = Query(default=None),
                         date_from: Optional[str] = Query(default=None),
                         date_to: Optional[str] = Query(default=None)):
    logger.info("🧹 Очистка всех кэшей миниатюр%s", f" (камера: {camera_id})" if camera_id else "")

    if camera_id or date_from or date_to:
        file_ids = _filter_file_ids(camera_id, date_from, date_to)
        basic_files = 0
        for fid in file_ids:
            p = THUMB_DIR / f"{fid}.jpg"
            if p.is_file():
                p.unlink()
                basic_files += 1
        if file_ids:
            with get_connection() as conn:
                ph = ",".join("?" * len(file_ids))
                conn.execute(f"DELETE FROM thumbnails WHERE file_id IN ({ph})", file_ids)
                conn.execute(f"DELETE FROM object_detection WHERE file_id IN ({ph})", file_ids)
                conn.execute(f"DELETE FROM video_previews WHERE file_id IN ({ph})", file_ids)

        diff_files    = _clear_dir_by_ids_suffix(DIFF_THUMB_DIR,      file_ids)
        erosion_files = _clear_dir_by_ids_suffix(EROSION_THUMB_DIR,    file_ids)
        vid_files     = _clear_dir_by_ids_prefix(VID_THUMB_DIR,        file_ids)
        ov_files      = 0
    else:
        basic_files, _    = _clear_dir_all(THUMB_DIR)
        diff_files, _     = _clear_dir_all(DIFF_THUMB_DIR)
        erosion_files, _  = _clear_dir_all(EROSION_THUMB_DIR)
        ov_files, _       = _clear_dir_all(OV_THUMB_DIR)
        vid_files, _      = _clear_dir_all(VID_THUMB_DIR)

        with get_connection() as conn:
            delete_all_thumbnails(conn)
            conn.execute("DELETE FROM object_detection")
            conn.execute("DELETE FROM video_previews")

    total_files = basic_files + diff_files + erosion_files + ov_files + vid_files
    logger.info("   └─ все миниатюры очищены → %d файлов", total_files)
    return {
        "types": {
            "basic":    {"deleted_files": basic_files},
            "diff":     {"deleted_files": diff_files},
            "erosion":  {"deleted_files": erosion_files},
            "openvino": {"deleted_files": ov_files},
            "video":    {"deleted_files": vid_files},
        },
        "total_files": total_files,
        "freed_bytes": 0,
    }


@router.get("/storage_info", summary="Current storage usage: DB and thumbnail caches")
def get_storage_info():
    db_size = DB_PATH.stat().st_size if DB_PATH.exists() else 0

    thumb_dirs = [THUMB_DIR, DIFF_THUMB_DIR, EROSION_THUMB_DIR, OV_THUMB_DIR, VID_THUMB_DIR]
    thumb_size = 0
    for d in thumb_dirs:
        if d.exists():
            for f in d.iterdir():
                if f.is_file():
                    thumb_size += f.stat().st_size

    return {"db_size_bytes": db_size, "thumbnails_size_bytes": thumb_size}
