"""AI image-analysis HTTP endpoints.

Thin routing layer — provider logic lives in the ``ai_providers`` package.
Endpoints: /gemini_analyze, /gemini_analyze_batch, /claude_analyze_batch,
/openvino_analyze_batch, /openvino_analyze_range, /ai_analysis, /ai_objects_summary.
"""
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

import compute_client
from ai_providers import claude, gemini, openvino
from database import get_ai_analysis_by_file_ids, get_connection

router = APIRouter()
logger = logging.getLogger("api")


class GeminiAnalyzeRequest(BaseModel):
    file_ids: list[int]
    prompt: str
    model: str
    api_key: str


@router.post("/gemini_analyze", summary="Analyze images with Google Gemini AI")
def gemini_analyze(req: GeminiAnalyzeRequest):
    return gemini.analyze(req.file_ids, req.prompt, req.model, req.api_key)


@router.post("/gemini_analyze_batch", summary="Structured analysis + save to DB")
def gemini_analyze_batch(req: GeminiAnalyzeRequest):
    return gemini.analyze_batch(req.file_ids, req.prompt, req.model, req.api_key)


class ClaudeAnalyzeRequest(BaseModel):
    file_ids: list[int]
    prompt: str
    model: str
    api_key: str


@router.post("/claude_analyze_batch", summary="Structured analysis via Anthropic Claude + save to DB")
def claude_analyze_batch(req: ClaudeAnalyzeRequest):
    return claude.analyze_batch(req.file_ids, req.prompt, req.model, req.api_key)


class OpenVinoAnalyzeRequest(BaseModel):
    file_ids: list[int]
    model_name: str = "yolov8n"
    confidence: float = 0.25
    classes: Optional[list[int]] = None


@router.post("/openvino_analyze_batch", summary="Local object detection via YOLO / OpenVINO (no API key)")
def openvino_analyze_batch(req: OpenVinoAnalyzeRequest):
    try:
        return openvino.analyze_batch(req.file_ids, req.model_name, req.confidence, req.classes)
    except compute_client.ComputeDisabled:
        raise HTTPException(status_code=503, detail="Compute-service is disabled")
    except compute_client.ComputeUnavailable as e:
        raise HTTPException(status_code=503, detail=str(e))


class OpenVinoRangeRequest(BaseModel):
    camera_id: str
    date_from: str
    date_to: str
    model_name: str = "yolov8n"
    confidence: float = 0.25
    classes: Optional[list[int]] = None


@router.post("/openvino_analyze_range", summary="Local object detection for all photos in a date range")
def openvino_analyze_range(req: OpenVinoRangeRequest):
    try:
        return openvino.analyze_range(req.camera_id, req.date_from, req.date_to, req.model_name, req.confidence, req.classes)
    except compute_client.ComputeDisabled:
        raise HTTPException(status_code=503, detail="Compute-service is disabled")
    except compute_client.ComputeUnavailable as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.get("/ai_analysis", summary="Fetch saved AI analysis for given file IDs")
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


@router.get("/ai_objects_summary", summary="Unique AI-detected objects for a date range")
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
