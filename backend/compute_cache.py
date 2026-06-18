"""Disk-cache paths for compute-produced thumbnails.

The compute-service is stateless — the main backend owns every disk cache and
serves the cached JPEG/GIF to the browser. These helpers replace the cache
logic that used to live in yolo_detect.py and video_thumbnails.py.
"""
import hashlib
import os
from pathlib import Path

# All regeneratable caches live under CACHE_BASE_DIR so they stay in one place
# and are excluded from HA backups.
# In the HA add-on run.sh sets CACHE_DIR=/tmp/camera-cleaner-cache (not /data).
# In local dev CACHE_DIR is unset → defaults to backend/cache/.
_data_dir = Path(os.getenv('DATA_DIR', str(Path(__file__).parent)))
CACHE_BASE_DIR = Path(os.getenv('CACHE_DIR', str(_data_dir / "cache")))

OV_THUMB_DIR = CACHE_BASE_DIR / "openvino"
OV_THUMB_VERSION = "v5"  # bumped: removed excluded-objects from cache key

VID_THUMB_DIR = CACHE_BASE_DIR / "video"


def ov_cache_path(file_id: int, model: str, confidence: float,
                  classes: tuple[int, ...] | None = None) -> Path:
    """Cache path for an OpenVINO bounding-box JPEG."""
    cls_str = ",".join(str(c) for c in sorted(classes)) if classes else ""
    key = f"{OV_THUMB_VERSION}:{file_id}:{model}:{confidence:.2f}:{cls_str}"
    h = hashlib.sha256(key.encode()).hexdigest()[:16]
    return OV_THUMB_DIR / f"{h}.jpg"


def video_cache_path(file_id: int, mode: str) -> Path:
    """Cache path for a video preview thumbnail."""
    ext = "gif" if mode.endswith("_gif") else "jpg"
    return VID_THUMB_DIR / f"{file_id}_{mode}.{ext}"
