"""HTTP client for the optional compute-service (object detection + video).

The main backend keeps DB + cache; this client delegates only the heavy
computation. Routing (off / local / remote) lives in compute_config.py.

Multiple URLs are supported (remote_urls list in compute_config.json). At
runtime, the last known-good URL is tried first; on failure the next URL in
the list is tried. ComputeUnavailable is raised only when all URLs fail.
"""
import logging
from typing import Callable, TypeVar

import httpx

import compute_config
from shared.contract import (DetectRequest, DetectResponse,
                             VideoThumbnailRequest,
                             VideoConvertRequest)

logger = logging.getLogger("api")

_DETECT_TIMEOUT   = 120.0
_VIDEO_TIMEOUT    = 120.0
_CONVERT_TIMEOUT  = 7200.0  # up to 2 h per file
_HEALTH_TIMEOUT   = 5.0

# In-memory last-known-good URL. Reset on process restart (intentional — stale
# URLs discovered after a restart should be re-validated).
_last_good_url: str | None = None

T = TypeVar("T")


class ComputeDisabled(Exception):
    """Compute-service routing is set to 'off' (or no URL is configured)."""


class ComputeUnavailable(Exception):
    """Compute-service is configured but could not be reached / returned an error."""


def _get_urls() -> list[str]:
    """Return list of URLs to try. Raises ComputeDisabled if service is off / no URLs."""
    urls = compute_config.effective_urls()
    if not urls:
        raise ComputeDisabled("Compute-service is disabled or no URL configured")
    return urls


def _base_url() -> str:
    """Return first configured URL. Raises ComputeDisabled if off (backward compat)."""
    return _get_urls()[0]


def get_active_url() -> str | None:
    """Return the last URL that successfully responded, or the first configured URL."""
    if _last_good_url:
        return _last_good_url
    try:
        return _get_urls()[0]
    except ComputeDisabled:
        return None


def _request_with_failover(fn: Callable[[str], T]) -> T:
    """Try fn(url) for each configured URL in order (last-good-first).
    Updates _last_good_url on success. Raises ComputeUnavailable if all fail."""
    global _last_good_url
    urls = _get_urls()  # may raise ComputeDisabled

    # Fast-path: try last known-good URL first
    ordered = list(urls)
    if _last_good_url and _last_good_url in ordered:
        idx = ordered.index(_last_good_url)
        if idx > 0:
            ordered = [_last_good_url] + ordered[:idx] + ordered[idx + 1:]

    last_err: Exception | None = None
    for url in ordered:
        try:
            result = fn(url)
            _last_good_url = url
            return result
        except ComputeUnavailable as e:
            last_err = e
            if len(ordered) > 1:
                logger.warning("compute URL %s failed, trying next: %s", url, e)
            continue

    raise ComputeUnavailable(
        f"All {len(ordered)} compute URL(s) failed. Last error: {last_err}"
    )


def detect(path: str, model: str, confidence: float,
           draw: bool = True, classes=None) -> DetectResponse:
    req = DetectRequest(path=path, model=model, confidence=confidence,
                        classes=list(classes) if classes else None, draw=draw)

    def _do(url):
        try:
            resp = httpx.post(f"{url}/detect", json=req.model_dump(), timeout=_DETECT_TIMEOUT)
        except httpx.HTTPError as e:
            raise ComputeUnavailable(f"Compute-service unreachable at {url}: {e}")
        if resp.status_code != 200:
            raise ComputeUnavailable(f"Compute-service error {resp.status_code}: {resp.text}")
        return DetectResponse(**resp.json())

    return _request_with_failover(_do)


def video_thumbnail(path: str, mode: str) -> tuple[bytes, str]:
    req = VideoThumbnailRequest(path=path, mode=mode)

    def _do(url):
        try:
            resp = httpx.post(f"{url}/video/thumbnail", json=req.model_dump(),
                              timeout=_VIDEO_TIMEOUT)
        except httpx.HTTPError as e:
            raise ComputeUnavailable(f"Compute-service unreachable at {url}: {e}")
        if resp.status_code != 200:
            raise ComputeUnavailable(f"Compute-service error {resp.status_code}: {resp.text}")
        return resp.content, resp.headers.get("content-type", "image/jpeg")

    return _request_with_failover(_do)


def convert_video(src_path: str, dst_path: str, codec: str = "libx265",
                  crf: int = 30, preset: str = "medium") -> None:
    """Ask the compute-service to convert src_path → dst_path with ffmpeg.
    Raises ComputeDisabled, ComputeUnavailable, or RuntimeError on failure."""
    req = VideoConvertRequest(src_path=src_path, dst_path=dst_path,
                              codec=codec, crf=crf, preset=preset)

    def _do(url):
        try:
            resp = httpx.post(f"{url}/video/convert", json=req.model_dump(),
                              timeout=_CONVERT_TIMEOUT)
        except httpx.HTTPError as e:
            raise ComputeUnavailable(f"Compute-service unreachable at {url}: {e}")
        if resp.status_code != 200:
            raise ComputeUnavailable(f"Compute-service error {resp.status_code}: {resp.text[:300]}")

    return _request_with_failover(_do)


def health() -> dict:
    """Ping the compute-service /health. Raises ComputeDisabled / ComputeUnavailable."""
    def _do(url):
        try:
            resp = httpx.get(f"{url}/health", timeout=_HEALTH_TIMEOUT)
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPError as e:
            raise ComputeUnavailable(f"Compute-service unreachable at {url}: {e}")

    return _request_with_failover(_do)


def metrics() -> dict:
    """Fetch CPU/RAM usage from the compute-service. Raises ComputeDisabled / ComputeUnavailable."""
    def _do(url):
        try:
            resp = httpx.get(f"{url}/metrics", timeout=_HEALTH_TIMEOUT)
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPError as e:
            raise ComputeUnavailable(f"Compute-service unreachable at {url}: {e}")

    return _request_with_failover(_do)
