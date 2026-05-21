"""Shared helpers for AI provider modules: file loading, JSON parsing, cost, persistence."""
import json
import logging

from database import get_connection, get_file_by_id, save_ai_analysis

logger = logging.getLogger("api")


def fetch_file_rows(file_ids):
    """Load DB rows for the given file IDs (order preserved, missing IDs become None)."""
    with get_connection() as conn:
        return [get_file_by_id(conn, fid) for fid in file_ids]


def open_thumbnails(file_rows, max_size=(1024, 1024)):
    """Open photo files as downscaled PIL images.

    Skips non-photo rows and unreadable files. Returns (images, rows_used) where
    rows_used lines up index-for-index with images.
    """
    from PIL import Image as PILImage

    images, rows_used = [], []
    for row in file_rows:
        if row is None or row["file_type"] != "photo":
            continue
        try:
            img = PILImage.open(row["file_path"])
            img.thumbnail(max_size, PILImage.LANCZOS)
            images.append(img)
            rows_used.append(row)
        except Exception as e:
            logger.warning("AI: не удалось открыть %s: %s", row["file_path"], e)
    return images, rows_used


def parse_json_response(raw_text):
    """Strip optional ``` markdown fences and parse JSON. Returns the value or None."""
    cleaned = (raw_text or "").strip()
    if cleaned.startswith("```"):
        cleaned = "\n".join(cleaned.split("\n")[1:])
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3].strip()
    try:
        return json.loads(cleaned)
    except Exception:
        return None


def compute_cost(model, in_tokens, out_tokens, pricing):
    """USD cost for a request given a per-million-token pricing table."""
    if model not in pricing:
        return 0.0
    p = pricing[model]
    return (in_tokens / 1_000_000) * p["input"] + (out_tokens / 1_000_000) * p["output"]


def save_structured(parsed, rows_used, provider, model):
    """Persist a ``{"scene": ..., "images": [...]}`` response per file. Returns saved count."""
    if not (parsed and "scene" in parsed and "images" in parsed):
        return 0
    scene = parsed.get("scene", "")
    img_data = parsed.get("images", [])
    saved = 0
    with get_connection() as conn:
        for i, row in enumerate(rows_used):
            entry = img_data[i] if i < len(img_data) else {}
            description = entry.get("description", "")
            objects = entry.get("objects", [])
            objects_str = " ".join(str(o) for o in objects if o)
            save_ai_analysis(conn, row["id"], provider, model, scene, description, objects_str)
            saved += 1
    return saved
