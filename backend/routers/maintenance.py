"""Maintenance actions: clear DB records, clear thumbnail caches (per-type and all), storage usage."""
import logging
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Query

from database import DB_PATH, delete_all_thumbnails, get_connection
from thumbnails import THUMB_DIR
from diff_thumbnails import DIFF_THUMB_DIR
from erosion_thumbnails import EROSION_THUMB_DIR
from motion_thumbnails import MOTION_THUMB_DIR
from diff_zoom_thumbnails import DIFF_ZOOM_THUMB_DIR
from compute_cache import OV_THUMB_DIR, VID_THUMB_DIR

router = APIRouter()
logger = logging.getLogger("api")


def _camera_file_ids(camera_id: str) -> list[int]:
    with get_connection() as conn:
        rows = conn.execute("SELECT id FROM files WHERE camera_id=?", (camera_id,)).fetchall()
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


@router.delete("/database", summary="Delete scanned file records (optionally for one camera)")
def clear_database(camera_id: Optional[str] = Query(default=None)):
    if camera_id:
        logger.info("🧹 Очистка базы данных для камеры: %s", camera_id)
        with get_connection() as conn:
            conn.execute("DELETE FROM files WHERE camera_id=?", (camera_id,))
        logger.info("   └─ база данных очищена для камеры %s", camera_id)
    else:
        logger.info("🧹 Очистка базы данных (все записи файлов)")
        with get_connection() as conn:
            conn.execute("DELETE FROM files")
        logger.info("   └─ база данных очищена")
    return {"deleted": True}


@router.post("/database/vacuum", summary="Compact the SQLite database (VACUUM)")
def vacuum_database():
    logger.info("🗜️ VACUUM базы данных…")
    with get_connection() as conn:
        conn.execute("VACUUM")
    logger.info("   └─ VACUUM завершён")
    return {"ok": True}


@router.delete("/thumbnails", summary="Delete cached basic thumbnail files")
def clear_thumbnails(camera_id: Optional[str] = Query(default=None)):
    logger.info("🧹 Очистка кэша миниатюр%s", f" (камера: {camera_id})" if camera_id else "")
    deleted_files = 0
    if camera_id:
        file_ids = _camera_file_ids(camera_id)
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
def clear_diff_thumbnails(camera_id: Optional[str] = Query(default=None)):
    logger.info("🧹 Очистка кэша diff-миниатюр%s", f" (камера: {camera_id})" if camera_id else "")
    if camera_id:
        file_ids = _camera_file_ids(camera_id)
        deleted_files = _clear_dir_by_ids_suffix(DIFF_THUMB_DIR, file_ids)
    else:
        deleted_files, _ = _clear_dir_all(DIFF_THUMB_DIR)
    logger.info("   └─ diff-миниатюры очищены → %d файлов", deleted_files)
    return {"deleted_files": deleted_files}


@router.delete("/erosion_thumbnails", summary="Delete cached erosion thumbnail files")
def clear_erosion_thumbnails(camera_id: Optional[str] = Query(default=None)):
    logger.info("🧹 Очистка кэша erosion-миниатюр%s", f" (камера: {camera_id})" if camera_id else "")
    if camera_id:
        file_ids = _camera_file_ids(camera_id)
        deleted_files = _clear_dir_by_ids_suffix(EROSION_THUMB_DIR, file_ids)
    else:
        deleted_files, _ = _clear_dir_all(EROSION_THUMB_DIR)
    logger.info("   └─ erosion-миниатюры очищены → %d файлов", deleted_files)
    return {"deleted_files": deleted_files}


@router.delete("/diff_zoom_thumbnails", summary="Delete cached diff zoom thumbnail files")
def clear_diff_zoom_thumbnails(camera_id: Optional[str] = Query(default=None)):
    logger.info("🧹 Очистка кэша diff-zoom-миниатюр%s", f" (камера: {camera_id})" if camera_id else "")
    if camera_id:
        file_ids = _camera_file_ids(camera_id)
        deleted_files = _clear_dir_by_ids_suffix(DIFF_ZOOM_THUMB_DIR, file_ids)
    else:
        deleted_files, _ = _clear_dir_all(DIFF_ZOOM_THUMB_DIR)
    logger.info("   └─ diff-zoom-миниатюры очищены → %d файлов", deleted_files)
    return {"deleted_files": deleted_files}


@router.delete("/motion_thumbnails", summary="Delete cached motion thumbnail files")
def clear_motion_thumbnails(camera_id: Optional[str] = Query(default=None)):
    logger.info("🧹 Очистка кэша motion-миниатюр%s", f" (камера: {camera_id})" if camera_id else "")
    if camera_id:
        file_ids = _camera_file_ids(camera_id)
        deleted_files = _clear_dir_by_ids_suffix(MOTION_THUMB_DIR, file_ids)
    else:
        deleted_files, _ = _clear_dir_all(MOTION_THUMB_DIR)
    logger.info("   └─ motion-миниатюры очищены → %d файлов", deleted_files)
    return {"deleted_files": deleted_files}


@router.delete("/video_thumbnails", summary="Delete cached video thumbnail files")
def clear_video_thumbnails(camera_id: Optional[str] = Query(default=None)):
    logger.info("🧹 Очистка кэша видео-превью%s", f" (камера: {camera_id})" if camera_id else "")
    if camera_id:
        file_ids = _camera_file_ids(camera_id)
        deleted_files = _clear_dir_by_ids_prefix(VID_THUMB_DIR, file_ids)
    else:
        deleted_files, _ = _clear_dir_all(VID_THUMB_DIR)
    logger.info("   └─ видео-превью очищены → %d файлов", deleted_files)
    return {"deleted_files": deleted_files}


@router.delete("/openvino_thumbnails", summary="Delete OpenVINO detection thumbnails and analysis results")
def clear_openvino_thumbnails(camera_id: Optional[str] = Query(default=None)):
    """
    Clears OpenVINO detection results from ai_analysis table.
    When camera_id is given: clears ai_analysis for that camera only; disk cache is unchanged
    (OV thumbnails use content-addressed hashes that can't be filtered by camera).
    When camera_id is omitted: clears all ai_analysis rows + all OV disk cache files.
    """
    logger.info("🧹 Очистка OpenVINO данных%s", f" (камера: {camera_id})" if camera_id else "")
    if camera_id:
        file_ids = _camera_file_ids(camera_id)
        deleted_rows = 0
        if file_ids:
            with get_connection() as conn:
                placeholders = ",".join("?" * len(file_ids))
                deleted_rows = conn.execute(
                    f"DELETE FROM ai_analysis WHERE file_id IN ({placeholders}) AND provider='openvino'",
                    file_ids,
                ).rowcount
        deleted_files = 0
        logger.info("   └─ OpenVINO данные очищены для камеры %s → %d записей", camera_id, deleted_rows)
    else:
        with get_connection() as conn:
            deleted_rows = conn.execute("DELETE FROM ai_analysis WHERE provider='openvino'").rowcount
        deleted_files, _ = _clear_dir_all(OV_THUMB_DIR)
        logger.info("   └─ OpenVINO данные очищены → %d файлов, %d записей", deleted_files, deleted_rows)
    return {"deleted_files": deleted_files, "deleted_rows": deleted_rows}


@router.delete("/all_thumbnails", summary="Delete all cached thumbnail files (all types)")
def clear_all_thumbnails(camera_id: Optional[str] = Query(default=None)):
    logger.info("🧹 Очистка всех кэшей миниатюр%s", f" (камера: {camera_id})" if camera_id else "")

    if camera_id:
        file_ids = _camera_file_ids(camera_id)
        basic_files = 0
        for fid in file_ids:
            p = THUMB_DIR / f"{fid}.jpg"
            if p.is_file():
                p.unlink()
                basic_files += 1
        if file_ids:
            with get_connection() as conn:
                placeholders = ",".join("?" * len(file_ids))
                conn.execute(f"DELETE FROM thumbnails WHERE file_id IN ({placeholders})", file_ids)

        diff_files    = _clear_dir_by_ids_suffix(DIFF_THUMB_DIR,      file_ids)
        dzoom_files   = _clear_dir_by_ids_suffix(DIFF_ZOOM_THUMB_DIR,  file_ids)
        erosion_files = _clear_dir_by_ids_suffix(EROSION_THUMB_DIR,    file_ids)
        motion_files  = _clear_dir_by_ids_suffix(MOTION_THUMB_DIR,     file_ids)
        vid_files     = _clear_dir_by_ids_prefix(VID_THUMB_DIR,        file_ids)
        ov_files      = 0  # hash-based, can't filter by camera; cleared on global run

        # Clear ai_analysis for this camera
        if file_ids:
            with get_connection() as conn:
                placeholders = ",".join("?" * len(file_ids))
                conn.execute(
                    f"DELETE FROM ai_analysis WHERE file_id IN ({placeholders}) AND provider='openvino'",
                    file_ids,
                )
    else:
        basic_files, _    = _clear_dir_all(THUMB_DIR)
        diff_files, _     = _clear_dir_all(DIFF_THUMB_DIR)
        dzoom_files, _    = _clear_dir_all(DIFF_ZOOM_THUMB_DIR)
        erosion_files, _  = _clear_dir_all(EROSION_THUMB_DIR)
        motion_files, _   = _clear_dir_all(MOTION_THUMB_DIR)
        ov_files, _       = _clear_dir_all(OV_THUMB_DIR)
        vid_files, _      = _clear_dir_all(VID_THUMB_DIR)

        with get_connection() as conn:
            delete_all_thumbnails(conn)

    total_files = basic_files + diff_files + dzoom_files + erosion_files + motion_files + ov_files + vid_files
    logger.info("   └─ все миниатюры очищены → %d файлов", total_files)
    return {
        "types": {
            "basic":    {"deleted_files": basic_files},
            "diff":     {"deleted_files": diff_files},
            "diff_zoom":{"deleted_files": dzoom_files},
            "erosion":  {"deleted_files": erosion_files},
            "motion":   {"deleted_files": motion_files},
            "openvino": {"deleted_files": ov_files},
            "video":    {"deleted_files": vid_files},
        },
        "total_files": total_files,
        "freed_bytes": 0,
    }


@router.get("/storage_info", summary="Current storage usage: DB and thumbnail caches")
def get_storage_info():
    db_size = DB_PATH.stat().st_size if DB_PATH.exists() else 0

    thumb_dirs = [THUMB_DIR, DIFF_THUMB_DIR, DIFF_ZOOM_THUMB_DIR, EROSION_THUMB_DIR, MOTION_THUMB_DIR, OV_THUMB_DIR, VID_THUMB_DIR]
    thumb_size = 0
    for d in thumb_dirs:
        if d.exists():
            for f in d.iterdir():
                if f.is_file():
                    thumb_size += f.stat().st_size

    return {"db_size_bytes": db_size, "thumbnails_size_bytes": thumb_size}
