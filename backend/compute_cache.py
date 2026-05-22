"""Disk-cache paths for compute-produced thumbnails.

The compute-service is stateless — the main backend owns every disk cache and
serves the cached JPEG/GIF to the browser. These helpers replace the cache
logic that used to live in yolo_detect.py and video_thumbnails.py.
"""
import hashlib
from pathlib import Path

OV_THUMB_DIR = Path(__file__).parent / "openvino_thumbnails_cache"
OV_THUMB_VERSION = "v3"  # bumped: cache key now uses raw excluded labels

VID_THUMB_DIR = Path(__file__).parent / "video_thumbnails_cache"


def ov_cache_path(file_id: int, model: str, confidence: float,
                  excluded: frozenset[str] = frozenset()) -> Path:
    """Cache path for an OpenVINO bounding-box JPEG."""
    excl_str = ",".join(sorted(excluded))
    key = f"{OV_THUMB_VERSION}:{file_id}:{model}:{confidence:.2f}:{excl_str}"
    h = hashlib.sha256(key.encode()).hexdigest()[:16]
    return OV_THUMB_DIR / f"{h}.jpg"


def video_cache_path(file_id: int, mode: str) -> Path:
    """Cache path for a video preview thumbnail."""
    ext = "gif" if mode == "max_change_gif" else "jpg"
    return VID_THUMB_DIR / f"{file_id}_{mode}.{ext}"
