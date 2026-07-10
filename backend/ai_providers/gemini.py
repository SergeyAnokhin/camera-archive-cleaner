"""Google Gemini image analysis — structured batch (/gemini_analyze_batch)."""
import logging
import time

from fastapi import HTTPException

from ai_pricing import GEMINI_PRICING

from .common import (
    SINGLE_IMAGE_PROMPT,
    compute_cost,
    fetch_file_rows,
    open_thumbnails,
    parse_json_response,
    save_single_result,
    save_structured,
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


def analyze_single(file_id, model, api_key):
    """Analyze one photo and save result to DB. Returns True if saved."""
    rows = fetch_file_rows([file_id])
    images, rows_used = open_thumbnails(rows)
    if not images:
        return False
    response, elapsed_ms = _generate(SINGLE_IMAGE_PROMPT, images, model, api_key)
    in_tok, out_tok, _ = _usage(response)
    cost = compute_cost(model, in_tok, out_tok, GEMINI_PRICING)
    return save_single_result(rows_used[0]["id"], "gemini", model, response.text or "",
                              in_tok, out_tok, cost, elapsed_ms)


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
