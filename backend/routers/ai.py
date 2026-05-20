"""AI image-analysis endpoints: Google Gemini, Anthropic Claude, local OpenVINO/YOLO.

Endpoints: /gemini_analyze, /gemini_analyze_batch, /claude_analyze_batch,
/openvino_analyze_batch, /openvino_analyze_range, /ai_analysis, /ai_objects_summary.
"""
import logging
import time
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from ai_pricing import CLAUDE_PRICING, GEMINI_PRICING
from database import (
    get_ai_analysis_by_file_ids,
    get_connection,
    get_file_by_id,
    save_ai_analysis,
)
from yolo_detect import COCO_TO_RUSSIAN, load_yolo

router = APIRouter()
logger = logging.getLogger("api")


class GeminiAnalyzeRequest(BaseModel):
    file_ids: list[int]
    prompt: str
    model: str
    api_key: str


@router.post("/gemini_analyze", summary="Analyze images with Google Gemini AI")
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


@router.post("/gemini_analyze_batch", summary="Structured analysis + save to DB")
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


class ClaudeAnalyzeRequest(BaseModel):
    file_ids: list[int]
    prompt: str
    model: str
    api_key: str


@router.post("/claude_analyze_batch", summary="Structured analysis via Anthropic Claude + save to DB")
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


class OpenVinoAnalyzeRequest(BaseModel):
    file_ids:   list[int]
    model_name: str   = "yolov8n"
    confidence: float = 0.25


@router.post("/openvino_analyze_batch", summary="Local object detection via YOLO / OpenVINO (no API key)")
def openvino_analyze_batch(req: OpenVinoAnalyzeRequest):
    from PIL import Image as PILImage

    yolo = load_yolo(req.model_name)

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
                        ru = COCO_TO_RUSSIAN.get(en, en)
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


@router.post("/openvino_analyze_range", summary="Local object detection for all photos in a date range")
def openvino_analyze_range(req: OpenVinoRangeRequest):
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id FROM files WHERE camera_id=? AND timestamp>=? AND timestamp<=? AND file_type='photo' ORDER BY timestamp",
            (req.camera_id, req.date_from, req.date_to),
        ).fetchall()
    file_ids = [r[0] for r in rows]
    if not file_ids:
        return {"elapsed_ms": 0, "images_used": 0, "saved_count": 0, "results": {}}
    inner = OpenVinoAnalyzeRequest(file_ids=file_ids, model_name=req.model_name, confidence=req.confidence)
    return openvino_analyze_batch(inner)


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
