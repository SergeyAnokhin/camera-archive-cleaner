"""Local image analysis via a self-hosted Ollama server (e.g. gemma3:4b).

Behaves like the cloud providers (loads thumbnails in the backend, returns the
same structured shape) but the model runs locally, so cost is always 0. A small
multimodal model handles ONE image per request far more reliably than a batch,
so we loop image-by-image with format=json and assemble the results into the
shared ``{scene, images:[...]}`` structure.
"""
import logging
import time

import httpx
from fastapi import HTTPException

from .common import (
    encode_jpeg,
    fetch_file_rows,
    open_thumbnails,
    parse_json_response,
    save_structured,
)

logger = logging.getLogger("api")

# The first request in a batch pays the model cold-load (~2-3 min on CPU for a
# 4B model); subsequent warm images are ~10-30 s each. Keep the per-image read
# timeout well above the cold-load time.
_TIMEOUT = 600.0
_LIST_TIMEOUT = 10.0
_PULL_TIMEOUT = 1800.0  # model downloads can take a while

# gemma3 splits images > ~896 px into multiple crops ("pan & scan"), which
# multiplies the (slow, CPU-bound) vision-encode cost. Cap below that.
_MAX_IMAGE_SIZE = (768, 768)


def _clean_url(base_url):
    url = (base_url or "").strip().rstrip("/")
    if not url:
        raise HTTPException(status_code=400, detail="Ollama base_url не задан")
    return url


def analyze_batch(file_ids, prompt, model, base_url):
    """Per-image analysis via Ollama. Saves results per file to DB. Cost = 0."""
    base_url = _clean_url(base_url)

    rows = fetch_file_rows(file_ids)
    images, rows_used = open_thumbnails(rows, max_size=_MAX_IMAGE_SIZE)
    if not images:
        raise HTTPException(status_code=400, detail="No valid photo files found")

    images_b64 = encode_jpeg(images)
    logger.info("🦙 Ollama batch %s @ %s: %d изображений", model, base_url, len(images_b64))

    t0 = time.time()
    img_results = []
    with httpx.Client(timeout=_TIMEOUT) as client:
        for b64 in images_b64:
            try:
                resp = client.post(f"{base_url}/api/chat", json={
                    "model": model,
                    "format": "json",
                    "stream": False,
                    "options": {"num_predict": 384},
                    "messages": [{"role": "user", "content": prompt, "images": [b64]}],
                })
                resp.raise_for_status()
            except httpx.HTTPError as e:
                raise HTTPException(status_code=503, detail=f"Ollama недоступен ({base_url}): {e}")
            content = resp.json().get("message", {}).get("content", "")
            parsed = parse_json_response(content) or {}
            img_results.append({
                "description": parsed.get("description", ""),
                "objects": parsed.get("objects", []),
            })

    elapsed_ms = int((time.time() - t0) * 1000)
    parsed = {"scene": "", "images": img_results}
    saved_count = save_structured(parsed, rows_used, "ollama", model)

    logger.info("   └─ %.0f мс, сохранено %d записей", elapsed_ms, saved_count)

    return {
        "raw_text": "",
        "parsed": parsed,
        "input_tokens": 0,
        "output_tokens": 0,
        "total_tokens": 0,
        "cost_usd": 0.0,
        "elapsed_ms": elapsed_ms,
        "images_used": len(images_b64),
        "saved_count": saved_count,
    }


def list_models(base_url):
    """Return the names of models installed on the Ollama server."""
    base_url = _clean_url(base_url)
    try:
        resp = httpx.get(f"{base_url}/api/tags", timeout=_LIST_TIMEOUT)
        resp.raise_for_status()
    except httpx.HTTPError as e:
        raise HTTPException(status_code=503, detail=f"Ollama недоступен ({base_url}): {e}")
    return [m["name"] for m in resp.json().get("models", [])]


def pull_model(base_url, name):
    """Pull (download) a model onto the Ollama server. Blocks until complete."""
    base_url = _clean_url(base_url)
    if not name:
        raise HTTPException(status_code=400, detail="Имя модели не задано")
    logger.info("🦙 Ollama pull %s @ %s", name, base_url)
    try:
        resp = httpx.post(f"{base_url}/api/pull",
                          json={"model": name, "stream": False}, timeout=_PULL_TIMEOUT)
        resp.raise_for_status()
    except httpx.HTTPError as e:
        raise HTTPException(status_code=503, detail=f"Ollama pull не удался ({base_url}): {e}")
    return {"status": resp.json().get("status", "ok"), "model": name}
