"""FastAPI application factory.

Wires together the routers; the actual endpoints live in the `routers/` package.
HTTP endpoints are split by responsibility:
  catalog        — /cameras, /scan
  stats          — /stats, /files, /distribution, /previews
  thumbnails_api — /thumbnail, /diff_*, /erosion_*, /motion_*, /openvino_thumbnail, /video_thumbnail
  media          — /media
  delete         — /delete/*
  maintenance    — /database, /*_thumbnails, /storage_info
  ai             — /gemini_*, /claude_*, /openvino_analyze_*, /ai_*
  compute        — /compute/config, /compute/status
  tasks          — /tasks (task queue)
  google         — /google/auth/*, /google/oauth/callback, /google/gmail/labels
"""
import asyncio
import sys
from pathlib import Path

# Make the repo root importable so the `shared` block resolves regardless of cwd.
_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

# Importing logging_setup configures the root logger as a side effect — keep it first.
from logging_setup import AccessFilter

import logging
import traceback

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import config
import settings_manager
from database import init_db, get_connection
import task_runner
from routers import ai, catalog, compute, delete, google, logging_api, maintenance, media, stats, tasks, thumbnails_api, tuning, settings

logger = logging.getLogger("api")

app = FastAPI(title="Camera Archive Cleaner", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    tb = traceback.format_exc()
    logger.error("Unhandled exception on %s:\n%s", request.url.path, tb)
    return JSONResponse(status_code=500, content={"detail": str(exc), "traceback": tb})


@app.on_event("startup")
async def startup():
    init_db()

    # Apply camera_root from server_config.json if set in-app (overrides env var)
    srv = settings_manager.load_server_config()
    if "camera_root" in srv:
        config.set_camera_root(srv["camera_root"])
        logger.info("📁 CAMERA_ROOT loaded from server config: %s", srv["camera_root"])

    # Auto-scan demo camera on first launch (0 files in DB)
    try:
        from config import load_cameras
        from scanner import scan_camera
        with get_connection() as conn:
            row = conn.execute("SELECT COUNT(*) AS cnt FROM files WHERE camera_id = 'demo'").fetchone()
            if row and row["cnt"] == 0:
                cams = {c.id: c for c in load_cameras()}
                if "demo" in cams:
                    scan_camera(conn, cams["demo"])
                    logger.info("🎬 Demo camera auto-scanned on first launch")
    except Exception as e:
        logger.warning("Demo camera auto-scan failed: %s", e)

    task_runner.init_runner_state()
    asyncio.create_task(task_runner.task_loop())
    # Remove uvicorn handlers (у них свой формат) — пускаем через наш root
    for _n in ("uvicorn", "uvicorn.access", "uvicorn.error"):
        _lg = logging.getLogger(_n)
        _lg.handlers.clear()
        _lg.propagate = True
    logging.getLogger("uvicorn.access").addFilter(AccessFilter())



app.include_router(catalog.router)
app.include_router(stats.router)
app.include_router(thumbnails_api.router)
app.include_router(media.router)
app.include_router(delete.router)
app.include_router(maintenance.router)
app.include_router(ai.router)
app.include_router(compute.router)
app.include_router(tasks.router)
app.include_router(tuning.router)
app.include_router(logging_api.router)
app.include_router(settings.router)
app.include_router(google.router)
