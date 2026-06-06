"""Google Gemini image analysis — free-form (/gemini_analyze) and structured batch."""
import logging
import time
from pathlib import Path

from fastapi import HTTPException

from ai_pricing import GEMINI_PRICING

from .common import (
    compute_cost,
    fetch_file_rows,
    open_thumbnails,
    parse_json_response,
    save_structured,
)

_SINGLE_PROMPT = (
    "Analyze this surveillance camera photo. Return JSON only (no markdown fences):\n"
    '{"description": "1-2 sentences about visible dynamic objects and activity", '
    '"objects": ["object1", "object2"]}\n'
    "Use Russian names: человек, мужчина, женщина, ребёнок, кошка, собака, машина, велосипед, etc."
)

logger = logging.getLogger("api")


def _generate(prompt, images, model, api_key):
    """Call Gemini with prompt + images. Returns (response, elapsed_ms)."""
    try:
        from google import genai
    except ImportError:
        raise HTTPException(status_code=500, detail="google-genai not installed. Run: pip install google-genai")
    try:
        client = genai.Client(api_key=api_key)
        t0 = time.time()
        response = client.models.generate_content(model=model, contents=[prompt] + images)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return response, int((time.time() - t0) * 1000)


def _usage(response):
    """Extract (input, output, total) token counts from a Gemini response."""
    m = response.usage_metadata
    return (
        (m.prompt_token_count or 0) if m else 0,
        (m.candidates_token_count or 0) if m else 0,
        (m.total_token_count or 0) if m else 0,
    )


def analyze(file_ids, prompt, model, api_key):
    """Free-form analysis — returns the raw response text plus token/cost stats."""
    rows = fetch_file_rows(file_ids)
    images, rows_used = open_thumbnails(rows)
    if not images:
        raise HTTPException(status_code=400, detail="No valid photo files found")

    logger.info("🤖 Gemini %s: %d изображений, prompt=%d символов", model, len(images), len(prompt))
    response, elapsed_ms = _generate(prompt, images, model, api_key)

    in_tok, out_tok, tot_tok = _usage(response)
    cost = compute_cost(model, in_tok, out_tok, GEMINI_PRICING)
    logger.info("   └─ %d токенов (in:%d out:%d), %.0f мс, $%.6f", tot_tok, in_tok, out_tok, elapsed_ms, cost)

    return {
        "text": response.text,
        "input_tokens": in_tok,
        "output_tokens": out_tok,
        "total_tokens": tot_tok,
        "cost_usd": cost,
        "elapsed_ms": elapsed_ms,
        "images_used": len(images),
        "filenames": [Path(r["file_path"]).name for r in rows_used],
    }


def analyze_single(file_id, model, api_key):
    """Analyze one photo and save result to DB. Returns True if saved."""
    from database import get_connection, save_ai_analysis
    rows = fetch_file_rows([file_id])
    images, rows_used = open_thumbnails(rows)
    if not images:
        return False
    response, elapsed_ms = _generate(_SINGLE_PROMPT, images, model, api_key)
    raw = response.text or ""
    parsed = parse_json_response(raw)
    description = parsed.get("description", "") if parsed else ""
    objects_str = " ".join(str(o) for o in parsed.get("objects", [])) if parsed else ""
    in_tok, out_tok, _ = _usage(response)
    cost = compute_cost(model, in_tok, out_tok, GEMINI_PRICING)
    with get_connection() as conn:
        save_ai_analysis(conn, rows_used[0]["id"], "gemini", model, "", description, objects_str,
                         input_tokens=in_tok, output_tokens=out_tok,
                         cost_usd=cost, elapsed_ms=elapsed_ms)
    return True


def analyze_batch(file_ids, prompt, model, api_key):
    """Structured analysis — expects a JSON response, saves results per file to DB."""
    rows = fetch_file_rows(file_ids)
    images, rows_used = open_thumbnails(rows)
    if not images:
        raise HTTPException(status_code=400, detail="No valid photo files found")

    logger.info("🤖 Gemini batch %s: %d изображений", model, len(images))
    response, elapsed_ms = _generate(prompt, images, model, api_key)

    raw_text = response.text or ""
    parsed = parse_json_response(raw_text)
    in_tok, out_tok, tot_tok = _usage(response)
    cost = compute_cost(model, in_tok, out_tok, GEMINI_PRICING)
    saved_count = save_structured(parsed, rows_used, "gemini", model)

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
