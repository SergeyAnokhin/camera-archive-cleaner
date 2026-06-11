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
from database import get_combined_analysis_by_file_ids, get_connection

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
    video_thumb_mode: Optional[str] = None


@router.post("/openvino_analyze_range", summary="Local object detection for all photos in a date range")
def openvino_analyze_range(req: OpenVinoRangeRequest):
    try:
        return openvino.analyze_range(req.camera_id, req.date_from, req.date_to,
                                      req.model_name, req.confidence, req.classes,
                                      req.video_thumb_mode)
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
        return get_combined_analysis_by_file_ids(conn, ids)


@router.get("/ai_analysis_in_range", summary="AI analysis results with timestamps for a date range")
def get_ai_analysis_in_range(
    camera_id: str = Query(...),
    date_from: str = Query(...),
    date_to: str = Query(...),
    provider: str = Query(default="openvino"),
    limit: int = Query(default=200, ge=1, le=5000),
):
    with get_connection() as conn:
        if provider == "openvino":
            stats_row = conn.execute("""
                SELECT COUNT(*) AS total, SUM(0) AS input_tokens, SUM(0) AS output_tokens,
                       SUM(0.0) AS cost_usd, SUM(od.elapsed_ms) AS elapsed_ms
                FROM object_detection od
                JOIN files f ON od.file_id = f.id
                WHERE f.camera_id = ? AND f.timestamp >= ? AND f.timestamp <= ?
                  AND f.file_type = 'photo'
            """, (camera_id, date_from, date_to)).fetchone()
            rows = conn.execute("""
                SELECT od.file_id, f.timestamp, od.objects, od.model
                FROM object_detection od
                JOIN files f ON od.file_id = f.id
                WHERE f.camera_id = ? AND f.timestamp >= ? AND f.timestamp <= ?
                  AND f.file_type = 'photo'
                ORDER BY f.timestamp DESC
                LIMIT ?
            """, (camera_id, date_from, date_to, limit)).fetchall()
        else:
            stats_row = conn.execute("""
                SELECT COUNT(*) AS total,
                       SUM(aa.input_tokens) AS input_tokens, SUM(aa.output_tokens) AS output_tokens,
                       SUM(aa.cost_usd) AS cost_usd, SUM(aa.elapsed_ms) AS elapsed_ms
                FROM ai_analysis aa
                JOIN files f ON aa.file_id = f.id
                WHERE f.camera_id = ? AND f.timestamp >= ? AND f.timestamp <= ?
                  AND aa.provider = ? AND f.file_type = 'photo'
            """, (camera_id, date_from, date_to, provider)).fetchone()
            rows = conn.execute("""
                SELECT aa.file_id, f.timestamp, aa.objects, aa.model
                FROM ai_analysis aa
                JOIN files f ON aa.file_id = f.id
                WHERE f.camera_id = ? AND f.timestamp >= ? AND f.timestamp <= ?
                  AND aa.provider = ? AND f.file_type = 'photo'
                ORDER BY f.timestamp DESC
                LIMIT ?
            """, (camera_id, date_from, date_to, provider, limit)).fetchall()
    total_count = stats_row["total"] or 0
    # Re-sort the limited slice back to ascending order for display
    results = sorted(
        [{"file_id": r["file_id"], "timestamp": r["timestamp"],
          "objects": r["objects"], "model": r["model"]}
         for r in rows],
        key=lambda x: x["timestamp"],
    )
    stats = {
        "input_tokens":   int(stats_row["input_tokens"]  or 0),
        "output_tokens":  int(stats_row["output_tokens"] or 0),
        "cost_usd":       float(stats_row["cost_usd"]    or 0.0),
        "elapsed_ms":     int(stats_row["elapsed_ms"]    or 0),
        "analyzed_count": total_count,
    }
    return {"results": results, "stats": stats, "total_count": total_count}


@router.get("/ai_objects_summary", summary="Unique AI-detected objects for a date range")
def ai_objects_summary(
    camera_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
):
    conds = ["objects IS NOT NULL", "objects != ''"]
    params: list = []
    if camera_id is not None:
        conds.append("f.camera_id = ?")
        params.append(camera_id)
    if date_from:
        conds.append("f.timestamp >= ?")
        params.append(date_from)
    if date_to:
        conds.append("f.timestamp <= ?")
        params.append(date_to)
    where = "WHERE " + " AND ".join(conds)

    with get_connection() as conn:
        rows_ai = conn.execute(
            f"SELECT aa.objects FROM ai_analysis aa JOIN files f ON aa.file_id=f.id {where}",
            params,
        ).fetchall()
        rows_det = conn.execute(
            f"SELECT od.objects FROM object_detection od JOIN files f ON od.file_id=f.id {where}",
            params,
        ).fetchall()

    counts: dict = {}
    for row in rows_ai + rows_det:
        for obj in (row[0] or "").split():
            low = obj.lower()
            if low not in counts:
                counts[low] = [obj, 0]
            counts[low][1] += 1
    sorted_objs = sorted(counts.values(), key=lambda x: -x[1])
    return {"objects": [o[0] for o in sorted_objs]}
