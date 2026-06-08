"""On-demand thumbnail generation.

Endpoints: /thumbnail, /diff_thumbnail, /diff_zoom_thumbnail, /erosion_thumbnail,
/motion_thumbnail, /openvino_thumbnail, /video_thumbnail.
Serving original files lives in `routers/media.py`.
"""
import base64

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse

import compute_client
from compute_cache import OV_THUMB_DIR, VID_THUMB_DIR, ov_cache_path, video_cache_path
from database import get_connection, get_file_by_id, save_ai_analysis
from shared.contract import VIDEO_THUMB_MODES
from thumbnails import get_or_create_thumbnail
from diff_thumbnails import get_or_create_diff_thumbnail
from erosion_thumbnails import get_or_create_erosion_thumbnail
from motion_thumbnails import get_or_create_motion_thumbnail, VALID_MODES as MOTION_VALID_MODES
from diff_zoom_thumbnails import get_or_create_diff_zoom_thumbnail

router = APIRouter()

_THUMB_CACHE_HEADERS = {"Cache-Control": "public, max-age=604800"}


def _parse_page_ids(page_ids: str) -> list[int]:
    """Parse the comma-separated `page_ids` query param into a non-empty int list."""
    try:
        ids = [int(x) for x in page_ids.split(",") if x.strip()]
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid page_ids format")
    if not ids:
        raise HTTPException(status_code=400, detail="page_ids cannot be empty")
    return ids


def _page_thumbnail_response(file_id: int, kind: str, build) -> FileResponse:
    """Shared flow for the page-context motion thumbnails (diff / diff_zoom / erosion / motion).

    Validates the file is a photo, ensures the base thumbnail exists, then runs
    `build(conn)` to get or create the mode-specific thumbnail.
    """
    with get_connection() as conn:
        file_row = get_file_by_id(conn, file_id)
        if file_row is None:
            raise HTTPException(status_code=404, detail="File not found")
        if file_row["file_type"] != "photo":
            raise HTTPException(status_code=400, detail=f"{kind} thumbnails only available for photos")
        try:
            get_or_create_thumbnail(conn, file_id, file_row["file_path"])
            path = build(conn)
        except (FileNotFoundError, ValueError) as e:
            raise HTTPException(status_code=404, detail=str(e))
    return FileResponse(str(path), media_type="image/jpeg", headers=_THUMB_CACHE_HEADERS)


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
    ids = _parse_page_ids(page_ids)
    return _page_thumbnail_response(
        file_id, "Diff",
        lambda conn: get_or_create_diff_thumbnail(conn, file_id, ids, threshold),
    )


@router.get("/diff_zoom_thumbnail/{file_id}", summary="Motion-diff zoom thumbnail (crop to hottest 1/9 tile)")
def get_diff_zoom_thumbnail(
    file_id: int,
    page_ids: str = Query(description="Comma-separated photo file IDs on the current page"),
    threshold: int = Query(default=20, ge=0, le=255),
):
    ids = _parse_page_ids(page_ids)
    return _page_thumbnail_response(
        file_id, "Diff zoom",
        lambda conn: get_or_create_diff_zoom_thumbnail(conn, file_id, ids, threshold),
    )


@router.get("/erosion_thumbnail/{file_id}", summary="Erosion/MOG2 thumbnail for a photo")
def get_erosion_thumbnail(
    file_id: int,
    page_ids: str = Query(description="Comma-separated photo file IDs on the current page"),
    threshold: int = Query(default=20, ge=0, le=255),
):
    ids = _parse_page_ids(page_ids)
    return _page_thumbnail_response(
        file_id, "Erosion",
        lambda conn: get_or_create_erosion_thumbnail(conn, file_id, ids, threshold),
    )


@router.get("/motion_thumbnail/{file_id}", summary="Motion visualization thumbnail (4 modes)")
def get_motion_thumbnail(
    file_id: int,
    page_ids: str = Query(description="Comma-separated photo file IDs on the current page"),
    threshold: int = Query(default=20, ge=0, le=255),
    mode: str = Query(default="neon_mask", description=f"One of: {sorted(MOTION_VALID_MODES)}"),
):
    if mode not in MOTION_VALID_MODES:
        raise HTTPException(status_code=400, detail=f"Invalid mode '{mode}'")
    ids = _parse_page_ids(page_ids)
    return _page_thumbnail_response(
        file_id, "Motion",
        lambda conn: get_or_create_motion_thumbnail(conn, file_id, ids, threshold, mode),
    )


@router.get("/openvino_thumbnail/{file_id}", summary="Photo with YOLO bounding boxes (OpenVINO detection)")
def get_openvino_thumbnail(
    file_id: int,
    model: str = Query(default="yolov8n"),
    confidence: float = Query(default=0.25, ge=0.05, le=0.95),
    classes: str = Query(default=""),   # comma-separated COCO class IDs (empty = all)
):
    class_ids = tuple(int(c) for c in classes.split(',') if c.strip()) or None

    cache_path = ov_cache_path(file_id, model, confidence, class_ids)
    if cache_path.exists():
        return FileResponse(str(cache_path), media_type="image/jpeg", headers=_THUMB_CACHE_HEADERS)

    with get_connection() as conn:
        file_row = get_file_by_id(conn, file_id)
    if file_row is None:
        raise HTTPException(status_code=404, detail="File not found")
    if file_row["file_type"] != "photo":
        raise HTTPException(status_code=400, detail="Only available for photos")

    try:
        result = compute_client.detect(
            file_row["file_path"], model, confidence, draw=True, classes=class_ids)
    except compute_client.ComputeDisabled:
        raise HTTPException(status_code=503, detail="Compute-service is disabled")
    except compute_client.ComputeUnavailable as e:
        raise HTTPException(status_code=503, detail=str(e))

    if not result.annotated_jpeg_b64:
        raise HTTPException(status_code=500, detail="Compute-service returned no image")

    OV_THUMB_DIR.mkdir(exist_ok=True)
    cache_path.write_bytes(base64.b64decode(result.annotated_jpeg_b64))

    with get_connection() as conn:
        save_ai_analysis(conn, file_id, "openvino", model, "", "", " ".join(result.objects))

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

    cache_path = video_cache_path(file_id, mode)
    media_type = "image/gif" if mode.endswith("_gif") else "image/jpeg"
    if cache_path.exists():
        return FileResponse(str(cache_path), media_type=media_type, headers=_THUMB_CACHE_HEADERS)

    try:
        data, media_type = compute_client.video_thumbnail(file_row["file_path"], mode)
    except compute_client.ComputeDisabled:
        raise HTTPException(status_code=503, detail="Compute-service is disabled")
    except compute_client.ComputeUnavailable as e:
        raise HTTPException(status_code=503, detail=str(e))

    VID_THUMB_DIR.mkdir(exist_ok=True)
    cache_path.write_bytes(data)
    return FileResponse(str(cache_path), media_type=media_type, headers=_THUMB_CACHE_HEADERS)
