"""HTTP client for the optional compute-service (object detection + video).

The main backend keeps DB + cache; this client delegates only the heavy
computation. Routing (off / local / remote) lives in compute_config.py.
"""
import logging

import httpx

from compute_config import effective_url
from shared.contract import (DetectRequest, DetectResponse,
                             VideoThumbnailRequest,
                             VideoConvertRequest)

logger = logging.getLogger("api")

_DETECT_TIMEOUT   = 120.0
_VIDEO_TIMEOUT    = 120.0
_CONVERT_TIMEOUT  = 7200.0  # up to 2 h per file
_HEALTH_TIMEOUT   = 5.0


class ComputeDisabled(Exception):
    """Compute-service routing is set to 'off' (or remote URL is missing)."""


class ComputeUnavailable(Exception):
    """Compute-service is configured but could not be reached / returned an error."""


def _base_url() -> str:
    url = effective_url()
    if url is None:
        raise ComputeDisabled("Compute-service is disabled")
    return url


def detect(path: str, model: str, confidence: float,
           draw: bool = True, classes=None) -> DetectResponse:
    url = _base_url()
    req = DetectRequest(path=path, model=model, confidence=confidence,
                        classes=list(classes) if classes else None, draw=draw)
    try:
        resp = httpx.post(f"{url}/detect", json=req.model_dump(), timeout=_DETECT_TIMEOUT)
    except httpx.HTTPError as e:
        raise ComputeUnavailable(f"Compute-service unreachable at {url}: {e}")
    if resp.status_code != 200:
        raise ComputeUnavailable(f"Compute-service error {resp.status_code}: {resp.text}")
    return DetectResponse(**resp.json())


def video_thumbnail(path: str, mode: str) -> tuple[bytes, str]:
    url = _base_url()
    req = VideoThumbnailRequest(path=path, mode=mode)
    try:
        resp = httpx.post(f"{url}/video/thumbnail", json=req.model_dump(), timeout=_VIDEO_TIMEOUT)
    except httpx.HTTPError as e:
        raise ComputeUnavailable(f"Compute-service unreachable at {url}: {e}")
    if resp.status_code != 200:
        raise ComputeUnavailable(f"Compute-service error {resp.status_code}: {resp.text}")
    return resp.content, resp.headers.get("content-type", "image/jpeg")


def convert_video(src_path: str, dst_path: str, codec: str = "libx265",
                  crf: int = 30, preset: str = "medium") -> None:
    """Ask the compute-service to convert src_path → dst_path with ffmpeg.
    Raises ComputeDisabled, ComputeUnavailable, or RuntimeError on failure."""
    url = _base_url()
    req = VideoConvertRequest(src_path=src_path, dst_path=dst_path,
                              codec=codec, crf=crf, preset=preset)
    try:
        resp = httpx.post(f"{url}/video/convert", json=req.model_dump(),
                          timeout=_CONVERT_TIMEOUT)
    except httpx.HTTPError as e:
        raise ComputeUnavailable(f"Compute-service unreachable at {url}: {e}")
    if resp.status_code != 200:
        raise ComputeUnavailable(f"Compute-service error {resp.status_code}: {resp.text[:300]}")


def health() -> dict:
    """Ping the compute-service /health. Raises ComputeDisabled / ComputeUnavailable."""
    url = _base_url()
    try:
        resp = httpx.get(f"{url}/health", timeout=_HEALTH_TIMEOUT)
        resp.raise_for_status()
        return resp.json()
    except httpx.HTTPError as e:
        raise ComputeUnavailable(f"Compute-service unreachable at {url}: {e}")


def metrics() -> dict:
    """Fetch CPU/RAM usage from the compute-service. Raises ComputeDisabled / ComputeUnavailable."""
    url = _base_url()
    try:
        resp = httpx.get(f"{url}/metrics", timeout=_HEALTH_TIMEOUT)
        resp.raise_for_status()
        return resp.json()
    except httpx.HTTPError as e:
        raise ComputeUnavailable(f"Compute-service unreachable at {url}: {e}")
