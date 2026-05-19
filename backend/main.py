import logging
import re
import time
from datetime import datetime
from pathlib import Path
from typing import Literal, Optional

# ── ANSI codes ────────────────────────────────────────────────────────────────
_R   = "\033[0m"
_DIM = "\033[2m"
_B   = "\033[1m"
_CYAN          = "\033[36m"
_BRIGHT_CYAN   = "\033[96m"
_GREEN         = "\033[32m"
_YELLOW        = "\033[33m"
_BRIGHT_YELLOW = "\033[93m"
_RED           = "\033[31m"
_BRIGHT_BLUE   = "\033[94m"
_GRAY          = "\033[90m"

# Уровень TRACE — ниже DEBUG; используется для thumbnail-запросов
TRACE = 5
logging.addLevelName(TRACE, "TRACE")

_HIGHLIGHT_RE = re.compile(
    r"(камера=)(\S+)"         # camera=<name>
    r"|\b(\d+(?:\.\d+)?)\b"  # numbers
)
_IP_RE = re.compile(r'^\d+\.\d+\.\d+\.\d+:\d+ - ')      # "127.0.0.1:12345 - "
_THUMB_RE = re.compile(r'"(?:GET|HEAD) /(?:diff_)?thumbnail/')


def _colorize_msg(msg: str) -> str:
    def _sub(m: re.Match) -> str:
        if m.group(1):
            return f"{m.group(1)}{_BRIGHT_CYAN}{m.group(2)}{_R}"
        return f"{_BRIGHT_YELLOW}{m.group(3)}{_R}"
    return _HIGHLIGHT_RE.sub(_sub, msg)


class _ColorFmt(logging.Formatter):
    _LEVEL_STYLE = {
        TRACE:            _DIM + _GRAY,
        logging.DEBUG:    _DIM + _GRAY,
        logging.INFO:     _GREEN,
        logging.WARNING:  _YELLOW,
        logging.ERROR:    _RED,
        logging.CRITICAL: _B + _RED,
    }

    def format(self, record: logging.LogRecord) -> str:
        ts = self.formatTime(record, "%H:%M:%S")
        lc = self._LEVEL_STYLE.get(record.levelno, "")
        lv = f"{record.levelname:<8}"
        msg = record.getMessage()

        if record.name == "api":
            msg = _colorize_msg(msg)
            name_part = f"{_BRIGHT_BLUE}{_B}api{_R}"
        elif record.name == "uvicorn.access":
            msg = _IP_RE.sub("", msg)   # убираем IP
            msg = f"{_DIM}{msg}{_R}"
            name_part = f"{_DIM}http{_R}"
        else:
            name_part = f"{_DIM}{record.name}{_R}"
            msg = f"{_DIM}{msg}{_R}"

        return f"{_CYAN}{ts}{_R}  {lc}{lv}{_R}  {name_part}: {msg}"


class _AccessFilter(logging.Filter):
    """thumbnail → TRACE (скрыт при root=DEBUG); остальное → DEBUG."""
    def filter(self, record: logging.LogRecord) -> bool:
        if _THUMB_RE.search(record.getMessage()):
            record.levelno, record.levelname = TRACE, "TRACE"
        else:
            record.levelno, record.levelname = logging.DEBUG, "DEBUG"
        return True


_handler = logging.StreamHandler()
_handler.setFormatter(_ColorFmt())
_handler.setLevel(TRACE)  # хендлер принимает всё; уровень фильтрует root

logging.root.handlers = [_handler]
# ↓ главный рычаг: DEBUG — видны http-запросы; INFO — только наши логи
logging.root.setLevel(logging.DEBUG)

logger = logging.getLogger("api")

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

from config import load_cameras
from database import (
    DB_PATH,
    delete_all_thumbnails,
    get_ai_analysis_by_file_ids,
    get_connection,
    get_file_by_id,
    get_files_paginated,
    get_hour_distribution,
    get_sampled_photo_ids,
    get_stats_by_camera,
    get_stats_grouped,
    get_stats_total,
    init_db,
    pop_old_basic_thumbnails,
    save_ai_analysis,
)
from thumbnails import THUMB_DIR, get_or_create_thumbnail
from diff_thumbnails import DIFF_THUMB_DIR, get_or_create_diff_thumbnail
from erosion_thumbnails import EROSION_THUMB_DIR, get_or_create_erosion_thumbnail
from motion_thumbnails import MOTION_THUMB_DIR, get_or_create_motion_thumbnail, VALID_MODES as MOTION_VALID_MODES
from diff_zoom_thumbnails import DIFF_ZOOM_THUMB_DIR, get_or_create_diff_zoom_thumbnail
from scanner import scan_camera

app = FastAPI(title="Camera Snapshots Cleaner", version="1.0.0")

_THUMB_CACHE_HEADERS = {"Cache-Control": "public, max-age=604800"}

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    init_db()
    # Убираем uvicorn-хендлеры (у них свой формат) — пускаем через наш root
    for _n in ("uvicorn", "uvicorn.access", "uvicorn.error"):
        _lg = logging.getLogger(_n)
        _lg.handlers.clear()
        _lg.propagate = True
    logging.getLogger("uvicorn.access").addFilter(_AccessFilter())


# ---------------------------------------------------------------------------
# /cameras
# ---------------------------------------------------------------------------

@app.get("/cameras", summary="List all configured cameras")
def list_cameras():
    cameras = load_cameras()
    result = [{"id": c.id, "name": c.name, "path_snapshots": c.path_snapshots, "path_videos": c.path_videos} for c in cameras]
    logger.info("📷 Список камер → %d камер: %s", len(result), [c["id"] for c in result])
    return result


# ---------------------------------------------------------------------------
# /scan
# ---------------------------------------------------------------------------

@app.post("/scan", summary="Scan camera directories and update the database")
def scan(
    camera_id: str | None = Query(
        default=None,
        description="Camera ID to scan. Leave empty to scan **all** cameras. "
                    "Use GET /cameras to see available IDs.",
    ),
):
    cameras = load_cameras()
    cameras_by_id = {c.id: c for c in cameras}

    if camera_id is not None and camera_id not in cameras_by_id:
        raise HTTPException(
            status_code=404,
            detail=f"Camera '{camera_id}' not found. "
                   f"Available: {list(cameras_by_id.keys())}",
        )

    targets = [cameras_by_id[camera_id]] if camera_id else cameras
    logger.info("🔍 Сканирование: %s", camera_id or f"все камеры ({len(targets)} шт.)")

    start = time.monotonic()
    total_files = 0
    with get_connection() as conn:
        for camera in targets:
            total_files += scan_camera(conn, camera)

    duration = round(time.monotonic() - start, 2)
    logger.info("✅ Сканирование завершено → %d файлов за %.1f с", total_files, duration)
    return {
        "scanned_cameras": len(targets),
        "total_files_found": total_files,
        "duration_seconds": duration,
    }


# ---------------------------------------------------------------------------
# /stats
# ---------------------------------------------------------------------------

@app.get("/stats", summary="Get aggregated file statistics")
def stats(
    camera_id: str | None = Query(default=None),
    group_by: Literal["total", "camera", "year", "month", "day", "hour"] = Query(default="total"),
    date_from: datetime | None = Query(default=None, examples=["2023-11-27T00:00:00"]),
    date_to: datetime | None = Query(default=None, examples=["2024-11-30T23:59:59"]),
):
    cameras_by_id = {c.id: c.name for c in load_cameras()}

    if camera_id and camera_id not in cameras_by_id:
        raise HTTPException(status_code=404, detail=f"Camera '{camera_id}' not found.")

    dt_from = date_from.isoformat() if date_from else None
    dt_to = date_to.isoformat() if date_to else None

    cam_label = camera_id or "все"
    logger.info("📊 Статистика [%s] камера=%s %s", group_by, cam_label, _fmt_range(dt_from, dt_to))

    with get_connection() as conn:
        if group_by == "total":
            row = get_stats_total(conn, camera_id, dt_from, dt_to)
            result = _row_to_dict(row)
            logger.info("   └─ итог → фото=%d видео=%d размер=%.2f ГБ", result["photo_count"], result["video_count"], result["total_size_gb"])
            return result

        if group_by == "camera":
            rows = get_stats_by_camera(conn, dt_from, dt_to)
            items = [
                {
                    "camera_id": r["camera_id"],
                    "name": cameras_by_id.get(r["camera_id"], r["camera_id"]),
                    **_row_to_dict(r),
                }
                for r in rows
            ]
            totals_row = get_stats_total(conn, None, dt_from, dt_to)
            logger.info("   └─ по камерам → %d камер", len(items))
            return {"cameras": items, "totals": _row_to_dict(totals_row)}

        rows = get_stats_grouped(conn, group_by, camera_id, dt_from, dt_to)
        periods = [{"period": r["period"], **_row_to_dict(r)} for r in rows]
        logger.info("   └─ по %s → %d периодов", group_by, len(periods))
        return {
            "group_by": group_by,
            "camera_id": camera_id,
            "date_from": date_from,
            "date_to": date_to,
            "periods": periods,
        }


# ---------------------------------------------------------------------------
# /files — paginated chronological list for a period
# ---------------------------------------------------------------------------

@app.get("/files", summary="Paginated file list for a time range")
def get_files(
    camera_id: str | None = Query(default=None),
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=500),
):
    dt_from = date_from.isoformat() if date_from else None
    dt_to = date_to.isoformat() if date_to else None
    logger.info("📁 Файлы стр.%d (по %d) камера=%s %s", page, page_size, camera_id or "все", _fmt_range(dt_from, dt_to))
    with get_connection() as conn:
        rows, total = get_files_paginated(conn, camera_id, dt_from, dt_to, page, page_size)
        files = [
            {
                "id": r["id"],
                "file_type": r["file_type"],
                "timestamp": r["timestamp"],
                "file_path": r["file_path"],
                "file_size": r["file_size"],
            }
            for r in rows
        ]
    logger.info("   └─ всего %d, показано %d на стр.%d", total, len(files), page)
    return {"files": files, "total": total, "page": page, "page_size": page_size}


# ---------------------------------------------------------------------------
# /thumbnail/{file_id} — on-demand thumbnail generation
# ---------------------------------------------------------------------------

@app.get("/thumbnail/{file_id}", summary="Get or generate a thumbnail for a photo")
def get_thumbnail(file_id: int):
    with get_connection() as conn:
        file_row = get_file_by_id(conn, file_id)
        if file_row is None:
            raise HTTPException(status_code=404, detail="File not found")
        if file_row["file_type"] != "photo":
            raise HTTPException(status_code=400, detail="Thumbnails only available for photos")
        try:
            thumb_path = get_or_create_thumbnail(conn, file_id, file_row["file_path"])
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e))
    return FileResponse(str(thumb_path), media_type="image/jpeg", headers=_THUMB_CACHE_HEADERS)


# ---------------------------------------------------------------------------
# /diff_thumbnail/{file_id} — motion-diff thumbnail relative to page mean
# ---------------------------------------------------------------------------

@app.get("/diff_thumbnail/{file_id}", summary="Motion-diff thumbnail for a photo")
def get_diff_thumbnail(
    file_id: int,
    page_ids: str = Query(description="Comma-separated photo file IDs on the current page"),
    threshold: int = Query(default=20, ge=0, le=255),
):
    try:
        ids = [int(x) for x in page_ids.split(",") if x.strip()]
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid page_ids format")
    if not ids:
        raise HTTPException(status_code=400, detail="page_ids cannot be empty")

    with get_connection() as conn:
        file_row = get_file_by_id(conn, file_id)
        if file_row is None:
            raise HTTPException(status_code=404, detail="File not found")
        if file_row["file_type"] != "photo":
            raise HTTPException(status_code=400, detail="Diff thumbnails only available for photos")
        try:
            get_or_create_thumbnail(conn, file_id, file_row["file_path"])
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e))
        try:
            diff_path = get_or_create_diff_thumbnail(conn, file_id, ids, threshold)
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e))
    return FileResponse(str(diff_path), media_type="image/jpeg", headers=_THUMB_CACHE_HEADERS)


# ---------------------------------------------------------------------------
# /diff_zoom_thumbnail/{file_id} — motion-diff cropped to most-active 1/9 tile
# ---------------------------------------------------------------------------

@app.get("/diff_zoom_thumbnail/{file_id}", summary="Motion-diff zoom thumbnail (crop to hottest 1/9 tile)")
def get_diff_zoom_thumbnail(
    file_id: int,
    page_ids: str = Query(description="Comma-separated photo file IDs on the current page"),
    threshold: int = Query(default=20, ge=0, le=255),
):
    try:
        ids = [int(x) for x in page_ids.split(",") if x.strip()]
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid page_ids format")
    if not ids:
        raise HTTPException(status_code=400, detail="page_ids cannot be empty")

    with get_connection() as conn:
        file_row = get_file_by_id(conn, file_id)
        if file_row is None:
            raise HTTPException(status_code=404, detail="File not found")
        if file_row["file_type"] != "photo":
            raise HTTPException(status_code=400, detail="Diff zoom thumbnails only available for photos")
        try:
            get_or_create_thumbnail(conn, file_id, file_row["file_path"])
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e))
        try:
            zoom_path = get_or_create_diff_zoom_thumbnail(conn, file_id, ids, threshold)
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e))
    return FileResponse(str(zoom_path), media_type="image/jpeg", headers=_THUMB_CACHE_HEADERS)


# ---------------------------------------------------------------------------
# /erosion_thumbnail/{file_id} — MOG2 + morphological erosion thumbnail
# ---------------------------------------------------------------------------

@app.get("/erosion_thumbnail/{file_id}", summary="Erosion/MOG2 thumbnail for a photo")
def get_erosion_thumbnail(
    file_id: int,
    page_ids: str = Query(description="Comma-separated photo file IDs on the current page"),
    threshold: int = Query(default=20, ge=0, le=255),
):
    try:
        ids = [int(x) for x in page_ids.split(",") if x.strip()]
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid page_ids format")
    if not ids:
        raise HTTPException(status_code=400, detail="page_ids cannot be empty")

    with get_connection() as conn:
        file_row = get_file_by_id(conn, file_id)
        if file_row is None:
            raise HTTPException(status_code=404, detail="File not found")
        if file_row["file_type"] != "photo":
            raise HTTPException(status_code=400, detail="Erosion thumbnails only available for photos")
        try:
            get_or_create_thumbnail(conn, file_id, file_row["file_path"])
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e))
        try:
            erosion_path = get_or_create_erosion_thumbnail(conn, file_id, ids, threshold)
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e))
    return FileResponse(str(erosion_path), media_type="image/jpeg", headers=_THUMB_CACHE_HEADERS)


# ---------------------------------------------------------------------------
# /motion_thumbnail/{file_id} — neon_mask / mhi / bounding_boxes / motion_stacking
# ---------------------------------------------------------------------------

@app.get("/motion_thumbnail/{file_id}", summary="Motion visualization thumbnail (4 modes)")
def get_motion_thumbnail(
    file_id: int,
    page_ids: str = Query(description="Comma-separated photo file IDs on the current page"),
    threshold: int = Query(default=20, ge=0, le=255),
    mode: str = Query(default="neon_mask", description=f"One of: {sorted(MOTION_VALID_MODES)}"),
):
    if mode not in MOTION_VALID_MODES:
        raise HTTPException(status_code=400, detail=f"Invalid mode '{mode}'")
    try:
        ids = [int(x) for x in page_ids.split(",") if x.strip()]
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid page_ids format")
    if not ids:
        raise HTTPException(status_code=400, detail="page_ids cannot be empty")

    with get_connection() as conn:
        file_row = get_file_by_id(conn, file_id)
        if file_row is None:
            raise HTTPException(status_code=404, detail="File not found")
        if file_row["file_type"] != "photo":
            raise HTTPException(status_code=400, detail="Motion thumbnails only available for photos")
        try:
            get_or_create_thumbnail(conn, file_id, file_row["file_path"])
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e))
        try:
            motion_path = get_or_create_motion_thumbnail(conn, file_id, ids, threshold, mode)
        except (FileNotFoundError, ValueError) as e:
            raise HTTPException(status_code=404, detail=str(e))
    return FileResponse(str(motion_path), media_type="image/jpeg", headers=_THUMB_CACHE_HEADERS)


# ---------------------------------------------------------------------------
# /openvino_thumbnail/{file_id} — photo with YOLO bounding boxes
# ---------------------------------------------------------------------------

OV_THUMB_DIR = Path(__file__).parent / "openvino_thumbnails_cache"
_OV_THUMB_VERSION = "v1"


def _ov_cache_path(file_id: int, model: str, confidence: float) -> Path:
    import hashlib
    key = f"{_OV_THUMB_VERSION}:{file_id}:{model}:{confidence:.2f}"
    h = hashlib.sha256(key.encode()).hexdigest()[:16]
    return OV_THUMB_DIR / f"{h}.jpg"


@app.get("/openvino_thumbnail/{file_id}", summary="Photo with YOLO bounding boxes (OpenVINO detection)")
def get_openvino_thumbnail(
    file_id: int,
    model: str = Query(default="yolov8n"),
    confidence: float = Query(default=0.25, ge=0.05, le=0.95),
):
    from PIL import Image as PILImage

    cache_path = _ov_cache_path(file_id, model, confidence)
    if cache_path.exists():
        return FileResponse(str(cache_path), media_type="image/jpeg", headers=_THUMB_CACHE_HEADERS)

    with get_connection() as conn:
        file_row = get_file_by_id(conn, file_id)
    if file_row is None:
        raise HTTPException(status_code=404, detail="File not found")
    if file_row["file_type"] != "photo":
        raise HTTPException(status_code=400, detail="Only available for photos")

    src = Path(file_row["file_path"])
    if not src.exists():
        raise HTTPException(status_code=404, detail="Source file not found on disk")

    yolo = _load_yolo(model)
    try:
        img = PILImage.open(src).convert("RGB")
        results = yolo(img, conf=confidence, verbose=False)

        # Extract detected Russian object names for ai_analysis
        seen: set[str] = set()
        objects_ru: list[str] = []
        for cls_id in results[0].boxes.cls.tolist():
            en = yolo.names[int(cls_id)]
            ru = _COCO_TO_RUSSIAN.get(en, en)
            if ru not in seen:
                seen.add(ru)
                objects_ru.append(ru)

        # Draw bounding boxes (results[0].plot() returns BGR numpy array)
        annotated_bgr = results[0].plot(line_width=2, font_size=10)
        annotated_rgb = annotated_bgr[:, :, ::-1]   # BGR → RGB
        out_img = PILImage.fromarray(annotated_rgb)
        out_img.thumbnail((640, 640), PILImage.LANCZOS)
        OV_THUMB_DIR.mkdir(exist_ok=True)
        out_img.save(str(cache_path), format="JPEG", quality=88)

        # Save detected objects to ai_analysis so icons appear at all levels
        with get_connection() as conn:
            save_ai_analysis(conn, file_id, "openvino", model, "", "", " ".join(objects_ru))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Detection error: {e}")

    return FileResponse(str(cache_path), media_type="image/jpeg", headers=_THUMB_CACHE_HEADERS)


# ---------------------------------------------------------------------------
# /media/{file_id} — serve original file (photos and videos)
# ---------------------------------------------------------------------------

@app.get("/media/{file_id}", summary="Serve the original file")
def get_media(file_id: int):
    with get_connection() as conn:
        file_row = get_file_by_id(conn, file_id)
        if file_row is None:
            raise HTTPException(status_code=404, detail="File not found")
        src = Path(file_row["file_path"])
        if not src.exists():
            raise HTTPException(status_code=404, detail="Source file not found on disk")
    suffix = src.suffix.lower()
    mime_map = {
        ".mp4": "video/mp4",
        ".webm": "video/webm",
        ".mov": "video/quicktime",
        ".avi": "video/x-msvideo",
        ".mkv": "video/x-matroska",
    }
    media_type = mime_map.get(suffix, "application/octet-stream")
    return FileResponse(str(src), media_type=media_type)


# ---------------------------------------------------------------------------
# /distribution — 5-minute bucket counts for an hour
# ---------------------------------------------------------------------------

@app.get("/distribution", summary="5-minute file distribution within a time range")
def distribution(
    camera_id: str | None = Query(default=None),
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
):
    dt_from = date_from.isoformat() if date_from else None
    dt_to = date_to.isoformat() if date_to else None
    logger.info("📈 Распределение камера=%s %s", camera_id or "все", _fmt_range(dt_from, dt_to))
    with get_connection() as conn:
        rows = get_hour_distribution(conn, camera_id, dt_from, dt_to)
    by_bucket = {r["bucket"]: r for r in rows}
    buckets = [
        {
            "bucket": i,
            "minute_start": i,
            "total_count":       by_bucket[i]["total_count"]       if i in by_bucket else 0,
            "photo_count":       by_bucket[i]["photo_count"]       if i in by_bucket else 0,
            "video_count":       by_bucket[i]["video_count"]       if i in by_bucket else 0,
            "photo_size_bytes":  by_bucket[i]["photo_size_bytes"]  if i in by_bucket else 0,
            "video_size_bytes":  by_bucket[i]["video_size_bytes"]  if i in by_bucket else 0,
            "total_size_bytes":  by_bucket[i]["total_size_bytes"]  if i in by_bucket else 0,
        }
        for i in range(60)
    ]
    non_zero = sum(1 for b in buckets if b["total_count"] > 0)
    total_files = sum(b["total_count"] for b in buckets)
    logger.info("   └─ %d файлов в %d ненулевых минутах из 60", total_files, non_zero)
    return {"buckets": buckets}


# ---------------------------------------------------------------------------
# /previews — uniformly sampled photo IDs for a period
# ---------------------------------------------------------------------------

@app.get("/previews", summary="Uniformly sampled photo IDs for a time range")
def get_previews(
    camera_id: str | None = Query(default=None),
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
    count: int = Query(default=3, ge=1, le=20),
):
    dt_from = date_from.isoformat() if date_from else None
    dt_to = date_to.isoformat() if date_to else None
    with get_connection() as conn:
        file_ids = get_sampled_photo_ids(conn, camera_id, dt_from, dt_to, count)
    logger.info("🖼️  Превью камера=%s %s → %d/%d ID", camera_id or "все", _fmt_range(dt_from, dt_to), len(file_ids), count)
    return {"file_ids": file_ids}


# ---------------------------------------------------------------------------
# /delete — safe delete with video auto-matching
# ---------------------------------------------------------------------------

class PreviewRequest(BaseModel):
    file_ids: list[int]

class ConfirmRequest(BaseModel):
    file_ids: list[int]


@app.post("/delete/preview", summary="Preview files to delete, including auto-matched related videos")
def delete_preview(req: PreviewRequest):
    if not req.file_ids:
        raise HTTPException(status_code=400, detail="file_ids cannot be empty")
    logger.info("🗑️  Превью удаления: %d файлов", len(req.file_ids))

    with get_connection() as conn:
        placeholders = ",".join("?" * len(req.file_ids))
        rows = conn.execute(
            f"SELECT id, file_type, timestamp, camera_id, file_path FROM files WHERE id IN ({placeholders})",
            req.file_ids,
        ).fetchall()

        found_ids = {r["id"] for r in rows}
        missing = [i for i in req.file_ids if i not in found_ids]
        if missing:
            raise HTTPException(status_code=404, detail=f"File IDs not found: {missing}")

        selected = []
        photo_entries = []
        for r in rows:
            item = {"id": r["id"], "file_type": r["file_type"], "timestamp": r["timestamp"], "file_path": r["file_path"]}
            if r["file_type"] == "photo":
                item["thumb_url"] = f"/api/thumbnail/{r['id']}"
                photo_entries.append((r["camera_id"], r["timestamp"]))
            selected.append(item)

        # Auto-match related videos within ±5 seconds of any selected photo
        seen_ids = set(req.file_ids)
        related_videos = []
        for camera_id, ts in photo_entries:
            excl = ",".join("?" * len(seen_ids))
            video_rows = conn.execute(
                f"""
                SELECT id, file_type, timestamp, file_path
                FROM files
                WHERE camera_id = ?
                  AND file_type = 'video'
                  AND id NOT IN ({excl})
                  AND ABS((julianday(timestamp) - julianday(?)) * 86400.0) <= 5.0
                """,
                [camera_id] + list(seen_ids) + [ts],
            ).fetchall()
            for vr in video_rows:
                if vr["id"] not in seen_ids:
                    related_videos.append({
                        "id": vr["id"],
                        "file_type": "video",
                        "timestamp": vr["timestamp"],
                        "file_path": vr["file_path"],
                    })
                    seen_ids.add(vr["id"])

    logger.info("   └─ выбрано %d, связанных видео %d", len(selected), len(related_videos))
    return {"selected": selected, "related_videos": related_videos}


@app.post("/delete/confirm", summary="Physically delete files and remove DB records")
def delete_confirm(req: ConfirmRequest):
    if not req.file_ids:
        raise HTTPException(status_code=400, detail="file_ids cannot be empty")
    logger.info("❌ Удаление: %d файлов", len(req.file_ids))

    deleted = []
    failed = []
    photo_count = 0
    video_count = 0
    freed_bytes = 0
    thumbnails_deleted = 0

    with get_connection() as conn:
        placeholders = ",".join("?" * len(req.file_ids))
        rows = conn.execute(
            f"""
            SELECT f.id, f.file_type, f.file_size, f.file_path, t.thumb_path
            FROM files f
            LEFT JOIN thumbnails t ON t.file_id = f.id
            WHERE f.id IN ({placeholders})
            """,
            req.file_ids,
        ).fetchall()

        rows_by_id = {r["id"]: r for r in rows}
        ids_to_delete_from_db = []

        for row in rows:
            logger.info("   ├─ %s", row["file_path"])

        for file_id in req.file_ids:
            row = rows_by_id.get(file_id)
            if row is None:
                deleted.append(file_id)
                continue

            src = Path(row["file_path"])
            try:
                if src.exists():
                    freed_bytes += row["file_size"] or 0
                    src.unlink()
            except Exception as e:
                failed.append({"id": file_id, "reason": str(e)})
                continue

            if row["file_type"] == "photo":
                photo_count += 1
            else:
                video_count += 1

            if row["thumb_path"]:
                thumb = Path(row["thumb_path"])
                try:
                    if thumb.exists():
                        thumb.unlink()
                        thumbnails_deleted += 1
                except Exception:
                    pass

            ids_to_delete_from_db.append(file_id)
            deleted.append(file_id)

        if ids_to_delete_from_db:
            db_ph = ",".join("?" * len(ids_to_delete_from_db))
            conn.execute(f"DELETE FROM files WHERE id IN ({db_ph})", ids_to_delete_from_db)

        # Opportunistic cleanup: evict basic thumbnails older than 30 days
        old_paths = pop_old_basic_thumbnails(conn, days=30)
        for p in old_paths:
            try:
                Path(p).unlink(missing_ok=True)
                thumbnails_deleted += 1
            except Exception:
                pass

    logger.info(
        "   └─ удалено %d (фото %d, видео %d), ошибок %d, превьюшек %d, освобождено %d байт",
        len(deleted), photo_count, video_count, len(failed), thumbnails_deleted, freed_bytes,
    )
    return {
        "deleted": deleted,
        "failed": failed,
        "photo_count": photo_count,
        "video_count": video_count,
        "thumbnails_deleted": thumbnails_deleted,
        "freed_bytes": freed_bytes,
    }


class RangeDeleteRequest(BaseModel):
    camera_id: str | None = None
    date_from: str
    date_to: str


@app.post("/delete/preview_range", summary="Preview files in a date range for deletion")
def delete_preview_range(req: RangeDeleteRequest):
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT id, file_type, timestamp, file_path
            FROM files
            WHERE (? IS NULL OR camera_id = ?)
              AND timestamp >= ?
              AND timestamp <= ?
            ORDER BY timestamp
            """,
            [req.camera_id, req.camera_id, req.date_from, req.date_to],
        ).fetchall()
    files = [
        {"id": r["id"], "file_type": r["file_type"], "timestamp": r["timestamp"], "file_path": r["file_path"]}
        for r in rows
    ]
    logger.info(
        "🗑️  Превью диапазона: камера=%s %s → %d файлов",
        req.camera_id or "все", _fmt_range(req.date_from, req.date_to), len(files),
    )
    return {"selected": files, "related_videos": []}


@app.post("/delete/by_range", summary="Delete all files in a date range")
def delete_by_range(req: RangeDeleteRequest):
    logger.info("❌ Удаление диапазона: камера=%s %s", req.camera_id or "все", _fmt_range(req.date_from, req.date_to))
    deleted_count = 0
    failed_count = 0
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT f.id, f.file_path, t.thumb_path
            FROM files f LEFT JOIN thumbnails t ON t.file_id = f.id
            WHERE (? IS NULL OR f.camera_id = ?)
              AND f.timestamp >= ?
              AND f.timestamp <= ?
            """,
            [req.camera_id, req.camera_id, req.date_from, req.date_to],
        ).fetchall()

        ids_ok = []
        for row in rows:
            src = Path(row["file_path"])
            try:
                if src.exists():
                    src.unlink()
            except Exception:
                failed_count += 1
                continue
            if row["thumb_path"]:
                try:
                    thumb = Path(row["thumb_path"])
                    if thumb.exists():
                        thumb.unlink()
                except Exception:
                    pass
            ids_ok.append(row["id"])
            deleted_count += 1

        if ids_ok:
            ph = ",".join("?" * len(ids_ok))
            conn.execute(f"DELETE FROM files WHERE id IN ({ph})", ids_ok)

    logger.info("   └─ удалено %d, ошибок %d", deleted_count, failed_count)
    return {"deleted_count": deleted_count, "failed_count": failed_count}


# ---------------------------------------------------------------------------
# /database  /thumbnails — maintenance actions
# ---------------------------------------------------------------------------

@app.delete("/database", summary="Delete all scanned file records")
def clear_database():
    logger.info("🧹 Очистка базы данных (все записи файлов)")
    with get_connection() as conn:
        conn.execute("DELETE FROM files")
    logger.info("   └─ база данных очищена")
    return {"deleted": True}


@app.delete("/thumbnails", summary="Delete all cached thumbnail files")
def clear_thumbnails():
    logger.info("🧹 Очистка кэша миниатюр")
    deleted_files = 0
    if THUMB_DIR.exists():
        for f in THUMB_DIR.iterdir():
            if f.is_file():
                f.unlink()
                deleted_files += 1
    with get_connection() as conn:
        deleted_rows = delete_all_thumbnails(conn)
    logger.info("   └─ миниатюры очищены → %d файлов, %d записей в БД", deleted_files, deleted_rows)
    return {"deleted_files": deleted_files, "deleted_rows": deleted_rows}


@app.delete("/diff_thumbnails", summary="Delete all cached diff thumbnail files")
def clear_diff_thumbnails():
    logger.info("🧹 Очистка кэша diff-миниатюр")
    deleted_files = 0
    if DIFF_THUMB_DIR.exists():
        for f in DIFF_THUMB_DIR.iterdir():
            if f.is_file():
                f.unlink()
                deleted_files += 1
    logger.info("   └─ diff-миниатюры очищены → %d файлов", deleted_files)
    return {"deleted_files": deleted_files}


@app.delete("/erosion_thumbnails", summary="Delete all cached erosion thumbnail files")
def clear_erosion_thumbnails():
    logger.info("🧹 Очистка кэша erosion-миниатюр")
    deleted_files = 0
    if EROSION_THUMB_DIR.exists():
        for f in EROSION_THUMB_DIR.iterdir():
            if f.is_file():
                f.unlink()
                deleted_files += 1
    logger.info("   └─ erosion-миниатюры очищены → %d файлов", deleted_files)
    return {"deleted_files": deleted_files}


@app.delete("/diff_zoom_thumbnails", summary="Delete all cached diff zoom thumbnail files")
def clear_diff_zoom_thumbnails():
    logger.info("🧹 Очистка кэша diff-zoom-миниатюр")
    deleted_files = 0
    if DIFF_ZOOM_THUMB_DIR.exists():
        for f in DIFF_ZOOM_THUMB_DIR.iterdir():
            if f.is_file():
                f.unlink()
                deleted_files += 1
    logger.info("   └─ diff-zoom-миниатюры очищены → %d файлов", deleted_files)
    return {"deleted_files": deleted_files}


@app.delete("/motion_thumbnails", summary="Delete all cached motion thumbnail files")
def clear_motion_thumbnails():
    logger.info("🧹 Очистка кэша motion-миниатюр")
    deleted_files = 0
    if MOTION_THUMB_DIR.exists():
        for f in MOTION_THUMB_DIR.iterdir():
            if f.is_file():
                f.unlink()
                deleted_files += 1
    logger.info("   └─ motion-миниатюры очищены → %d файлов", deleted_files)
    return {"deleted_files": deleted_files}


@app.delete("/all_thumbnails", summary="Delete all cached thumbnail files (all types)")
def clear_all_thumbnails():
    logger.info("🧹 Очистка всех кэшей миниатюр")

    def _clear_dir(d: Path) -> tuple[int, int]:
        count, size = 0, 0
        if d.exists():
            for f in d.iterdir():
                if f.is_file():
                    size += f.stat().st_size
                    f.unlink()
                    count += 1
        return count, size

    basic_files, basic_bytes     = _clear_dir(THUMB_DIR)
    diff_files, diff_bytes       = _clear_dir(DIFF_THUMB_DIR)
    dzoom_files, dzoom_bytes     = _clear_dir(DIFF_ZOOM_THUMB_DIR)
    erosion_files, erosion_bytes = _clear_dir(EROSION_THUMB_DIR)
    motion_files, motion_bytes   = _clear_dir(MOTION_THUMB_DIR)
    ov_files, ov_bytes           = _clear_dir(OV_THUMB_DIR)

    with get_connection() as conn:
        delete_all_thumbnails(conn)

    total_files = basic_files + diff_files + dzoom_files + erosion_files + motion_files + ov_files
    total_bytes = basic_bytes + diff_bytes + dzoom_bytes + erosion_bytes + motion_bytes + ov_bytes

    logger.info("   └─ все миниатюры очищены → %d файлов, %d байт", total_files, total_bytes)
    return {
        "types": {
            "basic":    {"deleted_files": basic_files,   "freed_bytes": basic_bytes},
            "diff":     {"deleted_files": diff_files,    "freed_bytes": diff_bytes},
            "diff_zoom":{"deleted_files": dzoom_files,   "freed_bytes": dzoom_bytes},
            "erosion":  {"deleted_files": erosion_files, "freed_bytes": erosion_bytes},
            "motion":   {"deleted_files": motion_files,  "freed_bytes": motion_bytes},
            "openvino": {"deleted_files": ov_files,      "freed_bytes": ov_bytes},
        },
        "total_files": total_files,
        "freed_bytes": total_bytes,
    }


@app.get("/storage_info", summary="Current storage usage: DB and thumbnail caches")
def get_storage_info():
    db_size = DB_PATH.stat().st_size if DB_PATH.exists() else 0

    thumb_dirs = [THUMB_DIR, DIFF_THUMB_DIR, DIFF_ZOOM_THUMB_DIR, EROSION_THUMB_DIR, MOTION_THUMB_DIR, OV_THUMB_DIR]
    thumb_size = 0
    for d in thumb_dirs:
        if d.exists():
            for f in d.iterdir():
                if f.is_file():
                    thumb_size += f.stat().st_size

    return {"db_size_bytes": db_size, "thumbnails_size_bytes": thumb_size}


# ---------------------------------------------------------------------------
# /gemini_analyze — Google AI image analysis
# ---------------------------------------------------------------------------

GEMINI_PRICING = {
    'gemini-3.1-flash-lite':    {'input': 0.25,  'output': 1.50},
    'gemini-2.5-flash-lite':    {'input': 0.10,  'output': 0.40},
    'gemini-2.5-flash':         {'input': 0.30,  'output': 2.50},
    'gemini-3.1-flash-preview': {'input': 0.50,  'output': 3.00},
    'gemini-2.5-pro':           {'input': 1.25,  'output': 10.00},
    'gemini-3.1-pro-preview':   {'input': 2.00,  'output': 12.00},
}


class GeminiAnalyzeRequest(BaseModel):
    file_ids: list[int]
    prompt: str
    model: str
    api_key: str


@app.post("/gemini_analyze", summary="Analyze images with Google Gemini AI")
def gemini_analyze(req: GeminiAnalyzeRequest):
    try:
        from google import genai
    except ImportError:
        raise HTTPException(status_code=500, detail="google-genai not installed. Run: pip install google-genai")

    from PIL import Image as PILImage

    with get_connection() as conn:
        file_rows = [get_file_by_id(conn, fid) for fid in req.file_ids]

    images = []
    filenames = []
    for row in file_rows:
        if row is None or row["file_type"] != "photo":
            continue
        try:
            img = PILImage.open(row["file_path"])
            img.thumbnail((1024, 1024), PILImage.LANCZOS)
            images.append(img)
            filenames.append(Path(row["file_path"]).name)
        except Exception as e:
            logger.warning("Gemini: не удалось открыть %s: %s", row["file_path"], e)

    if not images:
        raise HTTPException(status_code=400, detail="No valid photo files found")

    logger.info("🤖 Gemini %s: %d изображений, prompt=%d символов", req.model, len(images), len(req.prompt))

    try:
        client = genai.Client(api_key=req.api_key)
        t0 = time.time()
        response = client.models.generate_content(
            model=req.model,
            contents=[req.prompt] + images,
        )
        elapsed_ms = int((time.time() - t0) * 1000)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    in_tok  = (response.usage_metadata.prompt_token_count     or 0) if response.usage_metadata else 0
    out_tok = (response.usage_metadata.candidates_token_count or 0) if response.usage_metadata else 0
    tot_tok = (response.usage_metadata.total_token_count      or 0) if response.usage_metadata else 0

    cost = 0.0
    if req.model in GEMINI_PRICING:
        p = GEMINI_PRICING[req.model]
        cost = (in_tok / 1_000_000) * p["input"] + (out_tok / 1_000_000) * p["output"]

    logger.info("   └─ %d токенов (in:%d out:%d), %.0f мс, $%.6f", tot_tok, in_tok, out_tok, elapsed_ms, cost)

    return {
        "text": response.text,
        "input_tokens": in_tok,
        "output_tokens": out_tok,
        "total_tokens": tot_tok,
        "cost_usd": cost,
        "elapsed_ms": elapsed_ms,
        "images_used": len(images),
        "filenames": filenames,
    }


@app.post("/gemini_analyze_batch", summary="Structured analysis + save to DB")
def gemini_analyze_batch(req: GeminiAnalyzeRequest):
    """Like /gemini_analyze but expects a JSON response, saves results per-file to DB."""
    try:
        from google import genai
    except ImportError:
        raise HTTPException(status_code=500, detail="google-genai not installed. Run: pip install google-genai")

    import json
    from PIL import Image as PILImage

    with get_connection() as conn:
        file_rows = [get_file_by_id(conn, fid) for fid in req.file_ids]

    images, file_ids_used = [], []
    for row in file_rows:
        if row is None or row["file_type"] != "photo":
            continue
        try:
            img = PILImage.open(row["file_path"])
            img.thumbnail((1024, 1024), PILImage.LANCZOS)
            images.append(img)
            file_ids_used.append(row["id"])
        except Exception as e:
            logger.warning("Gemini batch: не удалось открыть %s: %s", row.get("file_path", "?"), e)

    if not images:
        raise HTTPException(status_code=400, detail="No valid photo files found")

    logger.info("🤖 Gemini batch %s: %d изображений", req.model, len(images))

    try:
        client = genai.Client(api_key=req.api_key)
        t0 = time.time()
        response = client.models.generate_content(
            model=req.model,
            contents=[req.prompt] + images,
        )
        elapsed_ms = int((time.time() - t0) * 1000)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    raw_text = response.text or ""

    # Strip optional markdown code fences
    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        cleaned = "\n".join(cleaned.split("\n")[1:])
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3].strip()

    parsed = None
    try:
        parsed = json.loads(cleaned)
    except Exception:
        pass

    in_tok  = (response.usage_metadata.prompt_token_count     or 0) if response.usage_metadata else 0
    out_tok = (response.usage_metadata.candidates_token_count or 0) if response.usage_metadata else 0
    tot_tok = (response.usage_metadata.total_token_count      or 0) if response.usage_metadata else 0

    cost = 0.0
    if req.model in GEMINI_PRICING:
        p = GEMINI_PRICING[req.model]
        cost = (in_tok / 1_000_000) * p["input"] + (out_tok / 1_000_000) * p["output"]

    saved_count = 0
    if parsed and "scene" in parsed and "images" in parsed:
        scene = parsed.get("scene", "")
        img_data = parsed.get("images", [])
        with get_connection() as conn:
            for i, fid in enumerate(file_ids_used):
                img_entry = img_data[i] if i < len(img_data) else {}
                description = img_entry.get("description", "")
                objects = img_entry.get("objects", [])
                objects_str = " ".join(str(o) for o in objects if o)
                save_ai_analysis(conn, fid, "gemini", req.model, scene, description, objects_str)
                saved_count += 1

    logger.info("   └─ %d токенов, %.0f мс, $%.6f, сохранено %d записей", tot_tok, elapsed_ms, cost, saved_count)

    return {
        "raw_text": raw_text,
        "parsed": parsed,
        "input_tokens": in_tok,
        "output_tokens": out_tok,
        "total_tokens": tot_tok,
        "cost_usd": cost,
        "elapsed_ms": elapsed_ms,
        "images_used": len(images),
        "saved_count": saved_count,
    }


CLAUDE_PRICING = {
    'claude-opus-4-7':            {'input': 15.00, 'output': 75.00},
    'claude-sonnet-4-6':          {'input':  3.00, 'output': 15.00},
    'claude-haiku-4-5-20251001':  {'input':  0.80, 'output':  4.00},
    'claude-3-5-sonnet-20241022': {'input':  3.00, 'output': 15.00},
    'claude-3-5-haiku-20241022':  {'input':  0.80, 'output':  4.00},
    'claude-3-opus-20240229':     {'input': 15.00, 'output': 75.00},
}


class ClaudeAnalyzeRequest(BaseModel):
    file_ids: list[int]
    prompt: str
    model: str
    api_key: str


@app.post("/claude_analyze_batch", summary="Structured analysis via Anthropic Claude + save to DB")
def claude_analyze_batch(req: ClaudeAnalyzeRequest):
    try:
        from anthropic import Anthropic
    except ImportError:
        raise HTTPException(status_code=500, detail="anthropic not installed. Run: pip install anthropic")

    import base64, io, json
    from PIL import Image as PILImage

    with get_connection() as conn:
        file_rows = [get_file_by_id(conn, fid) for fid in req.file_ids]

    images_b64, file_ids_used = [], []
    for row in file_rows:
        if row is None or row["file_type"] != "photo":
            continue
        try:
            img = PILImage.open(row["file_path"])
            img.thumbnail((1024, 1024), PILImage.LANCZOS)
            buf = io.BytesIO()
            img.convert("RGB").save(buf, format="JPEG", quality=85)
            images_b64.append(base64.b64encode(buf.getvalue()).decode())
            file_ids_used.append(row["id"])
        except Exception as e:
            logger.warning("Claude batch: не удалось открыть %s: %s", row.get("file_path", "?"), e)

    if not images_b64:
        raise HTTPException(status_code=400, detail="No valid photo files found")

    logger.info("🤖 Claude batch %s: %d изображений", req.model, len(images_b64))

    content = []
    for b64 in images_b64:
        content.append({"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": b64}})
    content.append({"type": "text", "text": req.prompt})

    try:
        client = Anthropic(api_key=req.api_key)
        t0 = time.time()
        response = client.messages.create(
            model=req.model,
            max_tokens=4096,
            messages=[{"role": "user", "content": content}],
        )
        elapsed_ms = int((time.time() - t0) * 1000)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    raw_text = response.content[0].text if response.content else ""

    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        cleaned = "\n".join(cleaned.split("\n")[1:])
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3].strip()

    parsed = None
    try:
        parsed = json.loads(cleaned)
    except Exception:
        pass

    in_tok  = response.usage.input_tokens
    out_tok = response.usage.output_tokens
    tot_tok = in_tok + out_tok

    cost = 0.0
    if req.model in CLAUDE_PRICING:
        p = CLAUDE_PRICING[req.model]
        cost = (in_tok / 1_000_000) * p["input"] + (out_tok / 1_000_000) * p["output"]

    saved_count = 0
    if parsed and "scene" in parsed and "images" in parsed:
        scene    = parsed.get("scene", "")
        img_data = parsed.get("images", [])
        with get_connection() as conn:
            for i, fid in enumerate(file_ids_used):
                entry        = img_data[i] if i < len(img_data) else {}
                description  = entry.get("description", "")
                objects_list = entry.get("objects", [])
                objects_str  = " ".join(str(o) for o in objects_list if o)
                save_ai_analysis(conn, fid, "claude", req.model, scene, description, objects_str)
                saved_count += 1

    logger.info("   └─ %d токенов (in:%d out:%d), %.0f мс, $%.6f, сохранено %d", tot_tok, in_tok, out_tok, elapsed_ms, cost, saved_count)

    return {
        "raw_text": raw_text,
        "parsed": parsed,
        "input_tokens": in_tok,
        "output_tokens": out_tok,
        "total_tokens": tot_tok,
        "cost_usd": cost,
        "elapsed_ms": elapsed_ms,
        "images_used": len(images_b64),
        "saved_count": saved_count,
    }


# ── OpenVINO / YOLO local detection ──────────────────────────────────────────

# Maps COCO English class names → Russian keywords (matching aiHelpers.js vocabulary)
_COCO_TO_RUSSIAN: dict[str, str] = {
    'person':     'человек',
    'bicycle':    'велосипед',
    'car':        'машина',
    'motorcycle': 'мотоцикл',
    'airplane':   'самолёт',
    'bus':        'автобус',
    'train':      'поезд',
    'truck':      'грузовик',
    'boat':       'лодка',
    'bird':       'птица',
    'cat':        'кошка',
    'dog':        'собака',
    'horse':      'лошадь',
    'sheep':      'овца',
    'cow':        'корова',
    'elephant':   'слон',
    'bear':       'медведь',
    'zebra':      'зебра',
    'giraffe':    'жираф',
    'backpack':   'рюкзак',
    'umbrella':   'зонт',
    'handbag':    'сумка',
    'suitcase':   'чемодан',
}

_yolo_models: dict = {}


def _load_yolo(model_name: str):
    """Load YOLO model lazily. Tries local OpenVINO export first, falls back to .pt."""
    if model_name not in _yolo_models:
        try:
            from ultralytics import YOLO
        except ImportError:
            raise HTTPException(status_code=500, detail="ultralytics not installed. Run: pip install ultralytics openvino")
        ov_path = Path(__file__).parent / "models" / f"{model_name}_openvino_model"
        if ov_path.exists():
            logger.info("🔷 Loading OpenVINO model: %s", ov_path)
            _yolo_models[model_name] = YOLO(str(ov_path), task="detect")
        else:
            logger.info("🔷 Loading PyTorch model: %s.pt (tip: export with `yolo export model=%s.pt format=openvino` for faster Intel CPU inference)", model_name, model_name)
            _yolo_models[model_name] = YOLO(f"{model_name}.pt", task="detect")
    return _yolo_models[model_name]


class OpenVinoAnalyzeRequest(BaseModel):
    file_ids:   list[int]
    model_name: str   = "yolov8n"
    confidence: float = 0.25


@app.post("/openvino_analyze_batch", summary="Local object detection via YOLO / OpenVINO (no API key)")
def openvino_analyze_batch(req: OpenVinoAnalyzeRequest):
    from PIL import Image as PILImage

    yolo = _load_yolo(req.model_name)

    with get_connection() as conn:
        file_rows = [get_file_by_id(conn, fid) for fid in req.file_ids]

    t0 = time.time()
    results_out: dict[int, list[str]] = {}
    saved_count = 0
    images_used = 0

    with get_connection() as conn:
        for row in file_rows:
            if row is None or row["file_type"] != "photo":
                continue
            fid = row["id"]
            try:
                img = PILImage.open(row["file_path"]).convert("RGB")
                images_used += 1
                detections = yolo(img, conf=req.confidence, verbose=False)
                seen: set[str] = set()
                objects_ru: list[str] = []
                for det in detections:
                    for cls_id in det.boxes.cls.tolist():
                        en = yolo.names[int(cls_id)]
                        ru = _COCO_TO_RUSSIAN.get(en, en)
                        if ru not in seen:
                            seen.add(ru)
                            objects_ru.append(ru)
                objects_str = " ".join(objects_ru)
                save_ai_analysis(conn, fid, "openvino", req.model_name, "", "", objects_str)
                results_out[fid] = objects_ru
                saved_count += 1
            except Exception as e:
                logger.warning("OpenVINO: ошибка файла %s: %s", row.get("file_path", "?"), e)

    elapsed_ms = int((time.time() - t0) * 1000)
    logger.info("🔷 OpenVINO %s: %d фото, %.0f мс, сохранено %d", req.model_name, images_used, elapsed_ms, saved_count)

    return {
        "elapsed_ms": elapsed_ms,
        "images_used": images_used,
        "saved_count": saved_count,
        "results": {str(k): v for k, v in results_out.items()},
    }


class OpenVinoRangeRequest(BaseModel):
    camera_id:  str
    date_from:  str
    date_to:    str
    model_name: str   = "yolov8n"
    confidence: float = 0.25


@app.post("/openvino_analyze_range", summary="Local object detection for all photos in a date range")
def openvino_analyze_range(req: OpenVinoRangeRequest):
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id FROM files WHERE camera_id=? AND captured_at>=? AND captured_at<=? AND file_type='photo' ORDER BY captured_at",
            (req.camera_id, req.date_from, req.date_to),
        ).fetchall()
    file_ids = [r[0] for r in rows]
    if not file_ids:
        return {"elapsed_ms": 0, "images_used": 0, "saved_count": 0, "results": {}}
    inner = OpenVinoAnalyzeRequest(file_ids=file_ids, model_name=req.model_name, confidence=req.confidence)
    return openvino_analyze_batch(inner)


@app.get("/ai_analysis", summary="Fetch saved AI analysis for given file IDs")
def get_ai_analysis(file_ids: str = Query(..., description="Comma-separated file IDs")):
    try:
        ids = [int(x) for x in file_ids.split(",") if x.strip()]
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid file_ids")
    with get_connection() as conn:
        rows = get_ai_analysis_by_file_ids(conn, ids)
    return [
        {
            "file_id": r["file_id"],
            "provider": r["provider"],
            "model": r["model"],
            "analyzed_at": r["analyzed_at"],
            "scene_description": r["scene_description"],
            "image_description": r["image_description"],
            "objects": r["objects"],
        }
        for r in rows
    ]


@app.get("/ai_objects_summary", summary="Unique AI-detected objects for a date range")
def ai_objects_summary(
    camera_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
):
    q = """
        SELECT aa.objects
        FROM ai_analysis aa
        JOIN files f ON aa.file_id = f.id
        WHERE aa.objects IS NOT NULL AND aa.objects != ''
    """
    params: list = []
    if camera_id is not None:
        q += " AND f.camera_id = ?"
        params.append(camera_id)
    if date_from:
        q += " AND f.timestamp >= ?"
        params.append(date_from)
    if date_to:
        q += " AND f.timestamp <= ?"
        params.append(date_to)
    with get_connection() as conn:
        rows = conn.execute(q, params).fetchall()
    counts: dict = {}
    for row in rows:
        for obj in (row[0] or "").split():
            low = obj.lower()
            if low not in counts:
                counts[low] = [obj, 0]
            counts[low][1] += 1
    sorted_objs = sorted(counts.values(), key=lambda x: -x[1])
    return {"objects": [o[0] for o in sorted_objs]}


def _fmt_range(dt_from, dt_to) -> str:
    parts = []
    if dt_from:
        parts.append(f"с {dt_from[:16]}")
    if dt_to:
        parts.append(f"по {dt_to[:16]}")
    return " ".join(parts) if parts else "всё время"


def _row_to_dict(row) -> dict:
    size = row["total_size_bytes"] or 0
    return {
        "photo_count": row["photo_count"] or 0,
        "video_count": row["video_count"] or 0,
        "total_size_bytes": size,
        "total_size_gb": round(size / 1024 ** 3, 3),
    }
