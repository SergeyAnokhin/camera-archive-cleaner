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

import collections
import json
import logging
import re
import threading
import time

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel
from starlette.exceptions import HTTPException as StarletteHTTPException

from shared.contract import (DetectRequest, DetectResponse,
                             VideoThumbnailRequest,
                             VideoConvertRequest, VideoConvertResponse)

import config
import detection
import video

try:
    import psutil as _psutil
except ImportError:
    _psutil = None

# ── Logging setup ──────────────────────────────────────────────────────────────
TRACE = 5
logging.addLevelName(TRACE, "TRACE")

_LEVEL_MAP: dict[str, int] = {
    "TRACE":    TRACE,
    "DEBUG":    logging.DEBUG,
    "INFO":     logging.INFO,
    "WARNING":  logging.WARNING,
    "ERROR":    logging.ERROR,
    "CRITICAL": logging.CRITICAL,
}
_LEVEL_NAME_MAP: dict[int, str] = {v: k for k, v in _LEVEL_MAP.items()}

_HERE = Path(__file__).parent
_CONFIG_FILE = _HERE / "logging_config.json"
_LOG_FILE    = _HERE / "compute.log"


def _load_config() -> dict:
    if _CONFIG_FILE.exists():
        try:
            data = json.loads(_CONFIG_FILE.read_text(encoding="utf-8"))
            level = data.get("level", "INFO")
            if level not in _LEVEL_MAP:
                level = "INFO"
            return {"level": level, "file_max_lines": int(data.get("file_max_lines", 200))}
        except Exception:
            pass
    return {"level": "INFO", "file_max_lines": 200}


def _save_config(cfg: dict):
    try:
        _CONFIG_FILE.write_text(json.dumps(cfg, indent=2), encoding="utf-8")
    except Exception:
        pass


class _PlainFmt(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        ts = self.formatTime(record, "%H:%M:%S")
        lv = f"{record.levelname:<8}"
        return f"{ts}  {lv}  {record.name}: {record.getMessage()}"


class _RingBufferHandler(logging.Handler):
    """Keeps last max_lines records in memory; flushes to file every 10 s."""
    def __init__(self, max_lines: int = 200, filepath: Path | None = None):
        super().__init__(TRACE)
        self._buf: collections.deque[str] = collections.deque(maxlen=max_lines)
        self._filepath = filepath
        self._lock = threading.Lock()
        self._dirty = False
        self._fmt = _PlainFmt()
        threading.Thread(target=self._flush_loop, daemon=True).start()

    def _flush_loop(self):
        while True:
            time.sleep(10)
            self._flush()

    def emit(self, record: logging.LogRecord):
        try:
            line = self._fmt.format(record)
        except Exception:
            line = record.getMessage()
        with self._lock:
            self._buf.append(line)
            self._dirty = True

    def get_tail(self, n: int | None = None) -> list[str]:
        with self._lock:
            lines = list(self._buf)
        return lines[-n:] if (n is not None and n < len(lines)) else lines

    @property
    def max_lines(self) -> int:
        return self._buf.maxlen or 0

    def set_max_lines(self, n: int):
        with self._lock:
            self._buf = collections.deque(self._buf, maxlen=n)

    def _flush(self):
        if not self._filepath or not self._dirty:
            return
        with self._lock:
            content = '\n'.join(self._buf)
            self._dirty = False
        try:
            self._filepath.write_text(content + '\n', encoding='utf-8')
        except Exception:
            pass


_cfg = _load_config()

# Console handler (simple format, matches existing style)
_console_handler = logging.StreamHandler()
_console_handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
_console_handler.setLevel(TRACE)

_ring_buffer = _RingBufferHandler(max_lines=_cfg["file_max_lines"], filepath=_LOG_FILE)

logging.root.handlers = [_console_handler, _ring_buffer]
logging.root.setLevel(_LEVEL_MAP[_cfg["level"]])

logger = logging.getLogger("compute")

_SILENT_RE = re.compile(r'"(?:GET|HEAD) /(?:api/health|health|metrics|logging)\b')


class _SilentFilter(logging.Filter):
    """Drop access-log lines for health, metrics and logging polls."""
    def filter(self, record: logging.LogRecord) -> bool:
        return not _SILENT_RE.search(record.getMessage())


def get_log_config() -> dict:
    return {
        "level": _LEVEL_NAME_MAP.get(logging.root.level, "INFO"),
        "file_max_lines": _ring_buffer.max_lines,
    }


def configure_logging(cfg: dict):
    level_name = cfg.get("level", "INFO")
    level = _LEVEL_MAP.get(level_name, logging.INFO)
    max_lines = max(50, int(cfg.get("file_max_lines", 200)))
    logging.root.setLevel(level)
    _ring_buffer.set_max_lines(max_lines)
    _save_config({"level": level_name, "file_max_lines": max_lines})
    logger.info("Log config updated: level=%s  file_max_lines=%d", level_name, max_lines)


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
    config.log_config()


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    if exc.status_code == 404:
        logger.warning(
            "404 %s %s  detail=%r  client=%s  user-agent=%s",
            request.method, request.url.path,
            exc.detail,
            request.client.host if request.client else "?",
            request.headers.get("user-agent", "—"),
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
    logger.debug("detect request  path=%s  model=%s  conf=%.2f  draw=%s  classes=%s",
                 req.path, req.model, req.confidence, req.draw,
                 req.classes if req.classes is not None else "all-80")

    t_remap = time.time()
    path = config.to_absolute(req.path)
    logger.debug("path remap  %.1f ms  %s -> %s", (time.time() - t_remap) * 1000, req.path, path)

    t_stat = time.time()
    p = Path(path)
    if not p.exists():
        raise HTTPException(status_code=404, detail=f"Image not found: {path}")
    file_size_kb = p.stat().st_size / 1024
    logger.debug("file stat  %.1f ms  size=%.1f KB", (time.time() - t_stat) * 1000, file_size_kb)

    try:
        objects, jpeg_b64, elapsed = detection.detect(
            path, req.model, req.confidence, req.draw, req.classes)
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
    path = config.to_absolute(req.path)
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


@app.post("/video/convert", response_model=VideoConvertResponse,
          summary="Convert a video file with ffmpeg (H.265/H.264)")
def video_convert_endpoint(req: VideoConvertRequest):
    if not video.ffmpeg_available():
        raise HTTPException(status_code=503, detail="ffmpeg not found on PATH")
    src = config.to_absolute(req.src_path)
    dst = config.to_absolute(req.dst_path)
    if not Path(src).exists():
        raise HTTPException(status_code=404, detail=f"Source not found: {src}")
    try:
        elapsed_ms = video.convert_video(src, dst, req.codec, req.crf, req.preset)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.error("Video convert failed %s → %s: %s", src, dst, e)
        raise HTTPException(status_code=500, detail=f"Conversion error: {e}")
    logger.info("convert %-30s  codec=%-8s  crf=%d  preset=%-10s  %.2f s",
                Path(src).name, req.codec, req.crf, req.preset, elapsed_ms / 1000)
    return VideoConvertResponse(ok=True, elapsed_ms=elapsed_ms)


# ── Logging API ────────────────────────────────────────────────────────────────

class _LogConfigUpdate(BaseModel):
    level: str = "INFO"
    file_max_lines: int = 200


@app.get("/logging/config", summary="Get compute log config")
def logging_config_get():
    return get_log_config()


@app.put("/logging/config", summary="Update compute log level and buffer size (live)")
def logging_config_put(req: _LogConfigUpdate):
    configure_logging({"level": req.level, "file_max_lines": req.file_max_lines})
    return get_log_config()


@app.get("/logging/tail", summary="Return last N lines from compute log buffer")
def logging_tail(n: int = Query(200, ge=1, le=5000)):
    lines = _ring_buffer.get_tail(n)
    return {"lines": lines, "total": len(lines)}
