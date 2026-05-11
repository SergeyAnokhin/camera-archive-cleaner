import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from config import Camera
from database import upsert_file

PHOTO_EXTENSIONS = {".jpg", ".jpeg", ".png"}
VIDEO_EXTENSIONS = {".mp4", ".avi", ".mkv", ".mov"}

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
    count = 0
    count += _scan_dir(conn, camera.id, camera.path_snapshots, "photo")
    count += _scan_dir(conn, camera.id, camera.path_videos, "video")
    return count


def _scan_dir(conn: sqlite3.Connection, camera_id: str,
              directory: str, file_type: str) -> int:
    path = Path(directory)
    if not path.exists():
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

    return count
