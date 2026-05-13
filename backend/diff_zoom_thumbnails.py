import hashlib
import sqlite3
from pathlib import Path

import numpy as np
from PIL import Image

from database import get_thumbnail_path

DIFF_ZOOM_THUMB_DIR = Path(__file__).parent / "diff_zoom_thumbnails_cache"
RESIZE = (256, 256)
ZOOM = 3  # window = 1/ZOOM of image dimensions


def _cache_key(page_file_ids: list[int], threshold: int) -> str:
    ids_str = ",".join(str(i) for i in sorted(page_file_ids))
    return hashlib.sha256(f"{ids_str}:{threshold}".encode()).hexdigest()[:16]


def get_or_create_diff_zoom_thumbnail(
    conn: sqlite3.Connection,
    file_id: int,
    page_file_ids: list[int],
    threshold: int,
) -> Path:
    DIFF_ZOOM_THUMB_DIR.mkdir(exist_ok=True)
    key = _cache_key(page_file_ids, threshold)
    cache_path = DIFF_ZOOM_THUMB_DIR / f"{key}_{file_id}.jpg"
    if cache_path.exists():
        return cache_path

    arrays: list[np.ndarray] = []
    target_idx: int | None = None

    for fid in sorted(page_file_ids):
        thumb_path_str = get_thumbnail_path(conn, fid)
        if not thumb_path_str:
            continue
        p = Path(thumb_path_str)
        if not p.exists():
            continue
        with Image.open(p) as img:
            arr = np.array(img.convert("RGB").resize(RESIZE), dtype=np.float32)
        if fid == file_id:
            target_idx = len(arrays)
        arrays.append(arr)

    if not arrays or target_idx is None:
        raise FileNotFoundError(f"Thumbnail not found for file {file_id}")

    mean = np.mean(arrays, axis=0)
    target = arrays[target_idx]
    delta = np.max(np.abs(target - mean), axis=2)  # (H, W)

    H, W = delta.shape
    wh = H // ZOOM
    ww = W // ZOOM

    # Sliding window max via 2D integral image — pure numpy, O(H×W)
    mask = (delta >= threshold).astype(np.float32)
    integral = np.zeros((H + 1, W + 1), dtype=np.float32)
    integral[1:, 1:] = mask.cumsum(axis=0).cumsum(axis=1)

    # window sums for all valid top-left positions at once
    scores = (
        integral[wh:, ww:]
        - integral[:-wh, ww:]
        - integral[wh:, :-ww]
        + integral[:-wh, :-ww]
    )
    idx = int(np.argmax(scores))
    best_y = idx // scores.shape[1]
    best_x = idx % scores.shape[1]

    crop = target[best_y:best_y + wh, best_x:best_x + ww].clip(0, 255).astype(np.uint8)

    Image.fromarray(crop).save(cache_path, "JPEG", quality=85, optimize=True)
    return cache_path
