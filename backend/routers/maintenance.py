"""Maintenance actions: clear DB records, clear thumbnail caches (per-type and all), storage usage."""
import logging
from pathlib import Path

from fastapi import APIRouter

from database import DB_PATH, delete_all_thumbnails, get_connection
from thumbnails import THUMB_DIR
from diff_thumbnails import DIFF_THUMB_DIR
from erosion_thumbnails import EROSION_THUMB_DIR
from motion_thumbnails import MOTION_THUMB_DIR
from diff_zoom_thumbnails import DIFF_ZOOM_THUMB_DIR
from yolo_detect import OV_THUMB_DIR
from video_thumbnails import VID_THUMB_DIR

router = APIRouter()
logger = logging.getLogger("api")


@router.delete("/database", summary="Delete all scanned file records")
def clear_database():
    logger.info("🧹 Очистка базы данных (все записи файлов)")
    with get_connection() as conn:
        conn.execute("DELETE FROM files")
    logger.info("   └─ база данных очищена")
    return {"deleted": True}


@router.delete("/thumbnails", summary="Delete all cached thumbnail files")
def clear_thumbnails():
    logger.info("🧹 Очистка кэша миниатюр")
    deleted_files = 0
    if THUMB_DIR.exists():
        for f in THUMB_DIR.iterdir():
            if f.is_file():
                f.unlink()
                deleted_files += 1
    with get_connection() as conn:
        deleted_rows = delete_all_thumbnails(conn)
    logger.info("   └─ миниатюры очищены → %d файлов, %d записей в БД", deleted_files, deleted_rows)
    return {"deleted_files": deleted_files, "deleted_rows": deleted_rows}


@router.delete("/diff_thumbnails", summary="Delete all cached diff thumbnail files")
def clear_diff_thumbnails():
    logger.info("🧹 Очистка кэша diff-миниатюр")
    deleted_files = 0
    if DIFF_THUMB_DIR.exists():
        for f in DIFF_THUMB_DIR.iterdir():
            if f.is_file():
                f.unlink()
                deleted_files += 1
    logger.info("   └─ diff-миниатюры очищены → %d файлов", deleted_files)
    return {"deleted_files": deleted_files}


@router.delete("/erosion_thumbnails", summary="Delete all cached erosion thumbnail files")
def clear_erosion_thumbnails():
    logger.info("🧹 Очистка кэша erosion-миниатюр")
    deleted_files = 0
    if EROSION_THUMB_DIR.exists():
        for f in EROSION_THUMB_DIR.iterdir():
            if f.is_file():
                f.unlink()
                deleted_files += 1
    logger.info("   └─ erosion-миниатюры очищены → %d файлов", deleted_files)
    return {"deleted_files": deleted_files}


@router.delete("/diff_zoom_thumbnails", summary="Delete all cached diff zoom thumbnail files")
def clear_diff_zoom_thumbnails():
    logger.info("🧹 Очистка кэша diff-zoom-миниатюр")
    deleted_files = 0
    if DIFF_ZOOM_THUMB_DIR.exists():
        for f in DIFF_ZOOM_THUMB_DIR.iterdir():
            if f.is_file():
                f.unlink()
                deleted_files += 1
    logger.info("   └─ diff-zoom-миниатюры очищены → %d файлов", deleted_files)
    return {"deleted_files": deleted_files}


@router.delete("/motion_thumbnails", summary="Delete all cached motion thumbnail files")
def clear_motion_thumbnails():
    logger.info("🧹 Очистка кэша motion-миниатюр")
    deleted_files = 0
    if MOTION_THUMB_DIR.exists():
        for f in MOTION_THUMB_DIR.iterdir():
            if f.is_file():
                f.unlink()
                deleted_files += 1
    logger.info("   └─ motion-миниатюры очищены → %d файлов", deleted_files)
    return {"deleted_files": deleted_files}


@router.delete("/all_thumbnails", summary="Delete all cached thumbnail files (all types)")
def clear_all_thumbnails():
    logger.info("🧹 Очистка всех кэшей миниатюр")

    def _clear_dir(d: Path) -> tuple[int, int]:
        count, size = 0, 0
        if d.exists():
            for f in d.iterdir():
                if f.is_file():
                    size += f.stat().st_size
                    f.unlink()
                    count += 1
        return count, size

    basic_files, basic_bytes     = _clear_dir(THUMB_DIR)
    diff_files, diff_bytes       = _clear_dir(DIFF_THUMB_DIR)
    dzoom_files, dzoom_bytes     = _clear_dir(DIFF_ZOOM_THUMB_DIR)
    erosion_files, erosion_bytes = _clear_dir(EROSION_THUMB_DIR)
    motion_files, motion_bytes   = _clear_dir(MOTION_THUMB_DIR)
    ov_files, ov_bytes           = _clear_dir(OV_THUMB_DIR)
    vid_files, vid_bytes         = _clear_dir(VID_THUMB_DIR)

    with get_connection() as conn:
        delete_all_thumbnails(conn)

    total_files = basic_files + diff_files + dzoom_files + erosion_files + motion_files + ov_files + vid_files
    total_bytes = basic_bytes + diff_bytes + dzoom_bytes + erosion_bytes + motion_bytes + ov_bytes + vid_bytes

    logger.info("   └─ все миниатюры очищены → %d файлов, %d байт", total_files, total_bytes)
    return {
        "types": {
            "basic":    {"deleted_files": basic_files,   "freed_bytes": basic_bytes},
            "diff":     {"deleted_files": diff_files,    "freed_bytes": diff_bytes},
            "diff_zoom":{"deleted_files": dzoom_files,   "freed_bytes": dzoom_bytes},
            "erosion":  {"deleted_files": erosion_files, "freed_bytes": erosion_bytes},
            "motion":   {"deleted_files": motion_files,  "freed_bytes": motion_bytes},
            "openvino": {"deleted_files": ov_files,      "freed_bytes": ov_bytes},
            "video":    {"deleted_files": vid_files,     "freed_bytes": vid_bytes},
        },
        "total_files": total_files,
        "freed_bytes": total_bytes,
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
