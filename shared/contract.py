"""API contract shared by the main backend and the compute-service.

Both sides import these models so the request/response shapes can never drift.
"""
from pydantic import BaseModel

# Video preview modes understood by the compute-service.
VIDEO_THUMB_MODES = ("first_frame", "last_frame", "four_frames", "max_change_gif", "four_frames_gif", "max_change_4_gif")


class DetectRequest(BaseModel):
    """Object-detection request. `path` is the file path as stored in the main
    backend's DB; the compute-service may remap its root prefix (see config.py)."""
    path: str
    model: str = "yolov8n"
    confidence: float = 0.25
    classes: list[int] | None = None  # COCO class IDs to detect; None = all 80
    draw: bool = True


class DetectResponse(BaseModel):
    """`objects` lists every detected class (Russian). `annotated_jpeg_b64` is the
    bounding-box JPEG (base64) — present iff draw=True."""
    objects: list[str]
    annotated_jpeg_b64: str | None = None
    elapsed_ms: int = 0


class VideoThumbnailRequest(BaseModel):
    """Video-thumbnail request. Response is binary image/jpeg or image/gif."""
    path: str
    mode: str
