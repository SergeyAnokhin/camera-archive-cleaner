import logging
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from config import Camera
from database import delete_camera_files, upsert_file

logger = logging.getLogger(__name__)

PHOTO_EXTENSIONS = {".jpg", ".jpeg", ".png"}
VIDEO_EXTENSIONS = {".mp4", ".avi", ".mkv", ".mov"}

SCANNER_SKIP_DIRS = {"organized"}

_LOG_EVERY = 1000
_COMMIT_EVERY = 5000  # release the write lock periodically during large scans

# Patterns that encode timestamp in filename.
# Each pattern must have named groups: year, month, day, hour, minute, second.
_FILENAME_PATTERNS = [
    # MDAlarm_20231127-200442.jpg  (Foscam snapshots)
    re.compile(r"(?P<year>\d{4})(?P<month>\d{2})(?P<day>\d{2})-(?P<hour>\d{2})(?P<minute>\d{2})(?P<second>\d{2})"),
    # alarm_20231127_200437.mkv  (Foscam records)
    re.compile(r"(?P<year>\d{4})(?P<month>\d{2})(?P<day>\d{2})_(?P<hour>\d{2})(?P<minute>\d{2})(?P<second>\d{2})"),
    # 01_20260615193146049.jpg  (Reolink — channel_YYYYMMDDHHMMSS[ms])
    re.compile(r"_(?P<year>\d{4})(?P<month>\d{2})(?P<day>\d{2})(?P<hour>\d{2})(?P<minute>\d{2})(?P<second>\d{2})\d*"),
]


def _timestamp_from_filename(name: str) -> datetime | None:
    for pattern in _FILENAME_PATTERNS:
        m = pattern.search(name)
        if m:
            try:
                return datetime(
                    int(m["year"]), int(m["month"]), int(m["day"]),
                    int(m["hour"]), int(m["minute"]), int(m["second"]),
                    tzinfo=timezone.utc,
                )
            except ValueError:
                continue
    return None


def scan_camera(conn: sqlite3.Connection, camera: Camera) -> int:
    deleted = delete_camera_files(conn, camera.id)
    if deleted:
        logger.info("[%s] Cleared %d old records before scan", camera.id, deleted)

    logger.info("[%s] Starting scan: %s at %s", camera.id, camera.name, camera.path)

    root = Path(camera.path)
    if not root.exists():
        logger.warning("[%s] Directory not found, skipping: %s", camera.id, camera.path)
        return 0

    count = 0
    photos = 0
    videos = 0

    for file in _iter_files(root):
        ext = file.suffix.lower()
        if ext in PHOTO_EXTENSIONS:
            file_type = "photo"
            photos += 1
        elif ext in VIDEO_EXTENSIONS:
            file_type = "video"
            videos += 1
        else:
            continue

        dt = _timestamp_from_filename(file.name)
        if dt is None:
            dt = datetime.fromtimestamp(file.stat().st_mtime, tz=timezone.utc)

        upsert_file(conn, camera.id, file_type, str(file), file.stat().st_size, dt.isoformat())
        count += 1

        if count % _COMMIT_EVERY == 0:
            conn.commit()

        if count % _LOG_EVERY == 0:
            logger.info("[%s] processed: %d (photos: %d, videos: %d)", camera.id, count, photos, videos)

    logger.info("[%s] Scan complete: %d files total (photos: %d, videos: %d)", camera.id, count, photos, videos)
    return count


def _iter_files(root: Path):
    """Yield all files under root, skipping SCANNER_SKIP_DIRS directories."""
    try:
        for entry in root.iterdir():
            if entry.is_dir():
                if entry.name not in SCANNER_SKIP_DIRS:
                    yield from _iter_files(entry)
            elif entry.is_file():
                yield entry
    except PermissionError:
        pass
