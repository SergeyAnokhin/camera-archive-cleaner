"""Anthropic Claude image analysis — structured batch (/claude_analyze_batch)."""
import base64
import io
import logging
import time

from fastapi import HTTPException

from ai_pricing import CLAUDE_PRICING

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


def _encode_jpeg(images):
    """Encode PIL images as base64 JPEG strings for the Claude messages API."""
    encoded = []
    for img in images:
        buf = io.BytesIO()
        img.convert("RGB").save(buf, format="JPEG", quality=85)
        encoded.append(base64.b64encode(buf.getvalue()).decode())
    return encoded


def analyze_single(file_id, model, api_key):
    """Analyze one photo and save result to DB. Returns True if saved."""
    try:
        from anthropic import Anthropic
    except ImportError:
        raise RuntimeError("anthropic not installed. Run: pip install anthropic")
    rows = fetch_file_rows([file_id])
    images, rows_used = open_thumbnails(rows)
    if not images:
        return False
    images_b64 = _encode_jpeg(images)
    content = [
        {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": b64}}
        for b64 in images_b64
    ]
    content.append({"type": "text", "text": SINGLE_IMAGE_PROMPT})
    client = Anthropic(api_key=api_key)
    t0 = time.time()
    response = client.messages.create(
        model=model,
        max_tokens=1024,
        messages=[{"role": "user", "content": content}],
    )
    elapsed_ms = int((time.time() - t0) * 1000)
    raw = response.content[0].text if response.content else ""
    in_tok = response.usage.input_tokens if response.usage else 0
    out_tok = response.usage.output_tokens if response.usage else 0
    cost = compute_cost(model, in_tok, out_tok, CLAUDE_PRICING)
    return save_single_result(rows_used[0]["id"], "claude", model, raw,
                              in_tok, out_tok, cost, elapsed_ms)


def analyze_batch(file_ids, prompt, model, api_key):
    """Structured analysis — expects a JSON response, saves results per file to DB."""
    try:
        from anthropic import Anthropic
    except ImportError:
        raise HTTPException(status_code=500, detail="anthropic not installed. Run: pip install anthropic")

    rows = fetch_file_rows(file_ids)
    images, rows_used = open_thumbnails(rows)
    if not images:
        raise HTTPException(status_code=400, detail="No valid photo files found")

    images_b64 = _encode_jpeg(images)
    logger.info("🤖 Claude batch %s: %d изображений", model, len(images_b64))

    content = [
        {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": b64}}
        for b64 in images_b64
    ]
    content.append({"type": "text", "text": prompt})

    try:
        client = Anthropic(api_key=api_key)
        t0 = time.time()
        response = client.messages.create(
            model=model,
            max_tokens=4096,
            messages=[{"role": "user", "content": content}],
        )
        elapsed_ms = int((time.time() - t0) * 1000)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    raw_text = response.content[0].text if response.content else ""
    parsed = parse_json_response(raw_text)

    in_tok = response.usage.input_tokens
    out_tok = response.usage.output_tokens
    tot_tok = in_tok + out_tok
    cost = compute_cost(model, in_tok, out_tok, CLAUDE_PRICING)
    saved_count = save_structured(parsed, rows_used, "claude", model)

    logger.info(
        "   └─ %d токенов (in:%d out:%d), %.0f мс, $%.6f, сохранено %d",
        tot_tok, in_tok, out_tok, elapsed_ms, cost, saved_count,
    )

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
