"""Compute-service FastAPI app — stateless heavy compute (YOLO detection + video).

Runs on :8001. May live on a separate machine; it owns no database and no cache.
Input: a file path (root prefix optionally remapped — see config.py). Output:
detected objects + annotated JPEG, or a video-thumbnail image.
"""
import sys
from pathlib import Path

# Make the repo root importable so `shared` resolves regardless of cwd.
_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

import logging
import re
import time

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from starlette.exceptions import HTTPException as StarletteHTTPException

from shared.contract import DetectRequest, DetectResponse, VideoThumbnailRequest

import config
import detection
import video

try:
    import psutil as _psutil
except ImportError:
    _psutil = None

logging.basicConfig(level=logging.DEBUG, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("compute")

_SILENT_RE = re.compile(r'"(?:GET|HEAD) /(?:api/health|health|metrics)\b')


class _SilentFilter(logging.Filter):
    """Drop access-log lines for /health and /metrics polls."""
    def filter(self, record: logging.LogRecord) -> bool:
        return not _SILENT_RE.search(record.getMessage())


app = FastAPI(title="Camera Snapshots Compute Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    logging.getLogger("uvicorn.access").addFilter(_SilentFilter())


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    if exc.status_code == 404:
        logger.warning(
            "404 %s %s  client=%s  user-agent=%s  referer=%s",
            request.method, request.url.path,
            request.client.host if request.client else "?",
            request.headers.get("user-agent", "—"),
            request.headers.get("referer", "—"),
        )
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@app.get("/health", summary="Liveness + capabilities")
@app.get("/api/health", include_in_schema=False)
def health():
    return {"status": "ok", "capabilities": ["detect", "video"]}


@app.get("/metrics", summary="CPU and memory usage")
def metrics_endpoint():
    if _psutil is None:
        return {"cpu_percent": None, "memory_total": None, "memory_used": None, "memory_percent": None}
    cpu = _psutil.cpu_percent(interval=0.1)
    mem = _psutil.virtual_memory()
    return {
        "cpu_percent": round(cpu, 1),
        "memory_total": mem.total,
        "memory_used": mem.used,
        "memory_percent": round(mem.percent, 1),
    }


@app.post("/detect", response_model=DetectResponse, summary="Object detection (YOLO/OpenVINO)")
def detect_endpoint(req: DetectRequest):
    t_req = time.time()
    logger.debug("detect request  path=%s  model=%s  conf=%.2f  draw=%s  excluded=%s  classes=%s",
                 req.path, req.model, req.confidence, req.draw, req.excluded,
                 req.classes if req.classes is not None else "all-80")

    t_remap = time.time()
    path = config.remap_path(req.path)
    logger.debug("path remap  %.1f ms  %s -> %s", (time.time() - t_remap) * 1000, req.path, path)

    t_stat = time.time()
    p = Path(path)
    if not p.exists():
        raise HTTPException(status_code=404, detail=f"Image not found: {path}")
    file_size_kb = p.stat().st_size / 1024
    logger.debug("file stat  %.1f ms  size=%.1f KB", (time.time() - t_stat) * 1000, file_size_kb)

    try:
        objects, jpeg_b64, elapsed = detection.detect(
            path, req.model, req.confidence, req.excluded, req.draw, req.classes)
    except Exception as e:
        logger.error("Detection failed for %s: %s", path, e)
        raise HTTPException(status_code=500, detail=f"Detection error: {e}")

    total_ms = (time.time() - t_req) * 1000
    classes_label = f"{len(req.classes)}cls" if req.classes is not None else "all"
    objects_str = " ".join(objects) if objects else "—"
    logger.info("detect  %-30s  model=%-10s  conf=%.2f  classes=%-6s  [%s]  detect=%.0f ms  total=%.0f ms",
                p.name, req.model, req.confidence, classes_label, objects_str, elapsed, total_ms)
    return DetectResponse(objects=objects, annotated_jpeg_b64=jpeg_b64, elapsed_ms=elapsed)


@app.post("/video/thumbnail", summary="Video preview thumbnail (image/jpeg or image/gif)")
def video_endpoint(req: VideoThumbnailRequest):
    path = config.remap_path(req.path)
    t0 = time.time()
    try:
        data, content_type = video.make_video_thumbnail(path, req.mode)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Video thumbnail failed for %s: %s", path, e)
        raise HTTPException(status_code=500, detail=f"Video thumbnail error: {e}")
    logger.info("video   %-30s  mode=%-15s  %.2f s",
                Path(path).name, req.mode, time.time() - t0)
    return Response(content=data, media_type=content_type)
