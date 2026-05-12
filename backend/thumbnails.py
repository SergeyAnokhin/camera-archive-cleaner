import sqlite3
from pathlib import Path

from PIL import Image

from database import get_thumbnail_path, save_thumbnail_path

THUMB_DIR = Path(__file__).parent / "thumbnails_cache"
THUMB_SIZE = (256, 256)


def get_or_create_thumbnail(conn: sqlite3.Connection, file_id: int, file_path: str) -> Path:
    cached = get_thumbnail_path(conn, file_id)
    if cached:
        cached_path = Path(cached)
        if cached_path.exists():
            return cached_path

    src = Path(file_path)
    if not src.exists():
        raise FileNotFoundError(f"Source file not found: {file_path}")

    THUMB_DIR.mkdir(exist_ok=True)
    thumb_path = THUMB_DIR / f"{file_id}.jpg"

    with Image.open(src) as img:
        img.thumbnail(THUMB_SIZE)
        img.convert("RGB").save(thumb_path, "JPEG", quality=85, optimize=True)

    save_thumbnail_path(conn, file_id, str(thumb_path))
    return thumb_path
