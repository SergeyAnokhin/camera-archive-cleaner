"""Rules: docs/ai-analysis.md — AI responses may arrive wrapped in ``` fences
and must still parse; cost = tokens/1M × per-million price; structured
{scene, images} responses are persisted one row per file."""
import json

from ai_providers.common import compute_cost, parse_json_response, save_structured
from ai_pricing import GEMINI_PRICING
from database import upsert_file


# ── parse_json_response ────────────────────────────────────────────────────────

def test_parse_plain_json():
    assert parse_json_response('{"scene": "yard"}') == {"scene": "yard"}


def test_parse_json_with_language_fence():
    raw = '```json\n{"scene": "yard", "images": []}\n```'
    assert parse_json_response(raw) == {"scene": "yard", "images": []}


def test_parse_json_with_bare_fence():
    raw = '```\n{"a": 1}\n```'
    assert parse_json_response(raw) == {"a": 1}


def test_parse_invalid_returns_none():
    assert parse_json_response("not json at all") is None
    assert parse_json_response(None) is None
    assert parse_json_response("") is None


# ── compute_cost ───────────────────────────────────────────────────────────────

def test_cost_formula_per_million_tokens():
    pricing = {"m": {"input": 2.0, "output": 10.0}}
    # 500k in + 100k out → 0.5×2 + 0.1×10 = 2.0 USD
    assert compute_cost("m", 500_000, 100_000, pricing) == 2.0


def test_cost_unknown_model_is_zero():
    assert compute_cost("no-such-model", 1_000_000, 1_000_000, GEMINI_PRICING) == 0.0


def test_real_pricing_table_shape():
    # every pricing entry must expose input/output per-million rates
    for table_model, p in GEMINI_PRICING.items():
        assert set(p) == {"input", "output"}, table_model


# ── save_structured ────────────────────────────────────────────────────────────

def _insert_photos(conn, n):
    rows = []
    for i in range(n):
        upsert_file(conn, "cam1", "photo", f"/t/save_structured_{i}.jpg", 100, "2024-01-01T00:00:00+00:00")
    conn.commit()
    for r in conn.execute("SELECT * FROM files ORDER BY id"):
        rows.append(r)
    return rows


def test_save_structured_one_row_per_file(db_conn):
    rows = _insert_photos(db_conn, 2)
    parsed = {
        "scene": "backyard",
        "images": [
            {"description": "a cat", "objects": ["cat", "fence"]},
            {"description": "empty", "objects": []},
        ],
    }
    saved = save_structured(parsed, rows, "gemini", "gemini-2.5-flash")
    assert saved == 2

    got = db_conn.execute(
        "SELECT objects, image_description, scene_description FROM ai_analysis ORDER BY file_id"
    ).fetchall()
    assert len(got) == 2
    assert got[0]["objects"] == "cat fence"
    assert got[0]["scene_description"] == "backyard"


def test_save_structured_rejects_malformed(db_conn):
    rows = _insert_photos(db_conn, 1)
    assert save_structured({"scene": "x"}, rows, "gemini", "m") == 0  # no images key
    assert save_structured(None, rows, "gemini", "m") == 0
