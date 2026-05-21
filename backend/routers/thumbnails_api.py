"""On-demand thumbnail generation and original-file serving.

Endpoints: /thumbnail, /diff_thumbnail, /diff_zoom_thumbnail, /erosion_thumbnail,
/motion_thumbnail, /openvino_thumbnail, /video_thumbnail, /media.
"""
import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse

from database import get_connection, get_file_by_id, save_ai_analysis
from thumbnails import get_or_create_thumbnail
from diff_thumbnails import get_or_create_diff_thumbnail
from erosion_thumbnails import get_or_create_erosion_thumbnail
from motion_thumbnails import get_or_create_motion_thumbnail, VALID_MODES as MOTION_VALID_MODES
from diff_zoom_thumbnails import get_or_create_diff_zoom_thumbnail
from yolo_detect import COCO_TO_RUSSIAN, OV_THUMB_DIR, load_yolo, ov_cache_path, excluded_to_en
from video_thumbnails import get_or_create_video_thumbnail, VALID_MODES as VIDEO_THUMB_MODES

router = APIRouter()
logger = logging.getLogger("api")

_THUMB_CACHE_HEADERS = {"Cache-Control": "public, max-age=604800"}


@router.get("/thumbnail/{file_id}", summary="Get or generate a thumbnail for a photo")
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


@router.get("/diff_thumbnail/{file_id}", summary="Motion-diff thumbnail for a photo")
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


@router.get("/diff_zoom_thumbnail/{file_id}", summary="Motion-diff zoom thumbnail (crop to hottest 1/9 tile)")
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


@router.get("/erosion_thumbnail/{file_id}", summary="Erosion/MOG2 thumbnail for a photo")
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


@router.get("/motion_thumbnail/{file_id}", summary="Motion visualization thumbnail (4 modes)")
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


@router.get("/openvino_thumbnail/{file_id}", summary="Photo with YOLO bounding boxes (OpenVINO detection)")
def get_openvino_thumbnail(
    file_id: int,
    model: str = Query(default="yolov8n"),
    confidence: float = Query(default=0.25, ge=0.05, le=0.95),
    excluded: str = Query(default=""),  # comma-separated Russian/English labels
):
    from PIL import Image as PILImage

    excluded_labels = frozenset(e.strip().lower() for e in excluded.split(',') if e.strip())
    excluded_en     = frozenset(excluded_to_en(set(excluded_labels)))

    cache_path = ov_cache_path(file_id, model, confidence, excluded_en)
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

    yolo = load_yolo(model)
    try:
        img = PILImage.open(src).convert("RGB")
        results = yolo(img, conf=confidence, verbose=False)

        # Extract ALL detected Russian object names for ai_analysis (save before filtering)
        seen: set[str] = set()
        objects_ru: list[str] = []
        for cls_id in results[0].boxes.cls.tolist():
            en = yolo.names[int(cls_id)]
            ru = COCO_TO_RUSSIAN.get(en, en)
            if ru not in seen:
                seen.add(ru)
                objects_ru.append(ru)

        # Filter out excluded classes from bounding boxes before drawing
        if excluded_en and len(results[0].boxes):
            keep = [
                yolo.names[int(cls_id)].lower() not in excluded_en
                for cls_id in results[0].boxes.cls.tolist()
            ]
            results[0].boxes = results[0].boxes[keep]

        # Draw bounding boxes (results[0].plot() returns BGR numpy array)
        annotated_bgr = results[0].plot(line_width=3, font_size=12)
        annotated_rgb = annotated_bgr[:, :, ::-1]   # BGR → RGB
        out_img = PILImage.fromarray(annotated_rgb)
        out_img.thumbnail((640, 640), PILImage.LANCZOS)
        OV_THUMB_DIR.mkdir(exist_ok=True)
        out_img.save(str(cache_path), format="JPEG", quality=88)

        # Save ALL detected objects to ai_analysis (including excluded — icons/display filters them)
        with get_connection() as conn:
            save_ai_analysis(conn, file_id, "openvino", model, "", "", " ".join(objects_ru))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Detection error: {e}")

    return FileResponse(str(cache_path), media_type="image/jpeg", headers=_THUMB_CACHE_HEADERS)


@router.get("/video_thumbnail/{file_id}", summary="Get or generate a video preview thumbnail")
def get_video_thumbnail(
    file_id: int,
    mode: str = Query(default="first_frame", description=f"Preview mode: {', '.join(VIDEO_THUMB_MODES)}"),
):
    if mode not in VIDEO_THUMB_MODES:
        raise HTTPException(status_code=400, detail=f"Invalid mode. Choose one of: {', '.join(VIDEO_THUMB_MODES)}")
    with get_connection() as conn:
        file_row = get_file_by_id(conn, file_id)
        if file_row is None:
            raise HTTPException(status_code=404, detail="File not found")
        if file_row["file_type"] != "video":
            raise HTTPException(status_code=400, detail="video_thumbnail only available for video files")
    try:
        thumb_path = get_or_create_video_thumbnail(file_id, file_row["file_path"], mode)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error("[video_thumbnail] file_id=%d mode=%s error=%s", file_id, mode, e)
        raise HTTPException(status_code=500, detail=f"Thumbnail error: {e}")
    media_type = "image/gif" if mode == "max_change_gif" else "image/jpeg"
    return FileResponse(str(thumb_path), media_type=media_type, headers=_THUMB_CACHE_HEADERS)


@router.get("/media/{file_id}", summary="Serve the original file")
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
