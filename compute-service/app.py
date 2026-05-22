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

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from shared.contract import DetectRequest, DetectResponse, VideoThumbnailRequest

import config
import detection
import video

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("compute")

app = FastAPI(title="Camera Snapshots Compute Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", summary="Liveness + capabilities")
def health():
    return {"status": "ok", "capabilities": ["detect", "video"]}


@app.post("/detect", response_model=DetectResponse, summary="Object detection (YOLO/OpenVINO)")
def detect_endpoint(req: DetectRequest):
    path = config.remap_path(req.path)
    if not Path(path).exists():
        raise HTTPException(status_code=404, detail=f"Image not found: {path}")
    try:
        objects, jpeg_b64, elapsed = detection.detect(
            path, req.model, req.confidence, req.excluded, req.draw)
    except Exception as e:
        logger.error("Detection failed for %s: %s", path, e)
        raise HTTPException(status_code=500, detail=f"Detection error: {e}")
    return DetectResponse(objects=objects, annotated_jpeg_b64=jpeg_b64, elapsed_ms=elapsed)


@app.post("/video/thumbnail", summary="Video preview thumbnail (image/jpeg or image/gif)")
def video_endpoint(req: VideoThumbnailRequest):
    path = config.remap_path(req.path)
    try:
        data, content_type = video.make_video_thumbnail(path, req.mode)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Video thumbnail failed for %s: %s", path, e)
        raise HTTPException(status_code=500, detail=f"Video thumbnail error: {e}")
    return Response(content=data, media_type=content_type)
