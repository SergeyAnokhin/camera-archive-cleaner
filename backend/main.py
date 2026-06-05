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

from database import init_db
import task_runner
from routers import ai, catalog, compute, delete, maintenance, media, stats, tasks, thumbnails_api, tuning

logger = logging.getLogger("api")

app = FastAPI(title="Camera Snapshots Cleaner", version="1.0.0")

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
    task_runner.init_runner_state()
    asyncio.create_task(task_runner.task_loop())
    # Убираем uvicorn-хендлеры (у них свой формат) — пускаем через наш root
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
