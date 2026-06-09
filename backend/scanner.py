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

_LOG_EVERY = 1000
_COMMIT_EVERY = 5000  # release the write lock periodically during large scans

# Patterns that encode timestamp in filename.
# Each pattern must have named groups: year, month, day, hour, minute, second.
_FILENAME_PATTERNS = [
    # MDAlarm_20231127-200442.jpg  (Foscam snapshots)
    re.compile(r"(?P<year>\d{4})(?P<month>\d{2})(?P<day>\d{2})-(?P<hour>\d{2})(?P<minute>\d{2})(?P<second>\d{2})"),
    # alarm_20231127_200437.mkv  (Foscam records)
    re.compile(r"(?P<year>\d{4})(?P<month>\d{2})(?P<day>\d{2})_(?P<hour>\d{2})(?P<minute>\d{2})(?P<second>\d{2})"),
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

    logger.info("[%s] Starting scan: %s", camera.id, camera.name)
    count = 0
    count += _scan_dir(conn, camera.id, camera.path_snapshots, "photo")
    count += _scan_dir(conn, camera.id, camera.path_videos, "video")
    logger.info("[%s] Scan complete: %d files total", camera.id, count)
    return count


def _scan_dir(conn: sqlite3.Connection, camera_id: str,
              directory: str, file_type: str) -> int:
    path = Path(directory)
    if not path.exists():
        logger.warning("[%s] Directory not found, skipping: %s", camera_id, directory)
        return 0

    extensions = PHOTO_EXTENSIONS if file_type == "photo" else VIDEO_EXTENSIONS
    count = 0

    for file in path.rglob("*"):
        if not file.is_file():
            continue
        if file.suffix.lower() not in extensions:
            continue

        dt = _timestamp_from_filename(file.name)
        if dt is None:
            dt = datetime.fromtimestamp(file.stat().st_mtime, tz=timezone.utc)

        upsert_file(conn, camera_id, file_type, str(file), file.stat().st_size, dt.isoformat())
        count += 1

        if count % _COMMIT_EVERY == 0:
            conn.commit()

        if count % _LOG_EVERY == 0:
            logger.info("[%s] %ss processed: %d", camera_id, file_type, count)

    logger.info("[%s] %s scan done: %d files", camera_id, file_type, count)
    return count
