"""Rules: docs/ai-analysis.md — Gemini batch request is built as [prompt,
images...]; token counts come from usage_metadata (zeros when missing); the
structured JSON response is parsed and persisted one row per file.
The google-genai client is mocked — no real API calls."""
import json
import sys
import types
from types import SimpleNamespace

from PIL import Image

from ai_providers import gemini
from database import upsert_file


def _install_fake_genai(monkeypatch, response_text, in_tokens=1000, out_tokens=500):
    """Register a fake `google.genai` module; returns a dict capturing the request."""
    captured = {}

    class _Models:
        def generate_content(self, model, contents):
            captured["model"] = model
            captured["contents"] = contents
            return SimpleNamespace(
                text=response_text,
                usage_metadata=SimpleNamespace(
                    prompt_token_count=in_tokens,
                    candidates_token_count=out_tokens,
                    total_token_count=in_tokens + out_tokens,
                ),
            )

    class _Client:
        def __init__(self, api_key):
            captured["api_key"] = api_key
            self.models = _Models()

    fake_genai = types.ModuleType("google.genai")
    fake_genai.Client = _Client
    fake_google = types.ModuleType("google")
    fake_google.genai = fake_genai
    monkeypatch.setitem(sys.modules, "google", fake_google)
    monkeypatch.setitem(sys.modules, "google.genai", fake_genai)
    return captured


def _insert_photos(conn, tmp_path, n):
    """Create n tiny real JPEGs and index them; returns their file IDs."""
    ids = []
    for i in range(n):
        p = tmp_path / f"gemini_test_{i}.jpg"
        Image.new("RGB", (8, 8), (0, i * 40, 0)).save(p, "JPEG")
        upsert_file(conn, "cam1", "photo", str(p), 100, "2024-01-01T00:00:00+00:00")
    conn.commit()
    for r in conn.execute("SELECT id FROM files ORDER BY id"):
        ids.append(r["id"])
    return ids


def test_batch_request_prompt_then_images(db_conn, tmp_path, monkeypatch):
    response = json.dumps({
        "scene": "driveway",
        "images": [
            {"description": "a car", "objects": ["car"]},
            {"description": "empty", "objects": []},
        ],
    })
    captured = _install_fake_genai(monkeypatch, response)
    ids = _insert_photos(db_conn, tmp_path, 2)

    result = gemini.analyze_batch(ids, "describe these", "gemini-test-model", "key-1")

    assert captured["api_key"] == "key-1"
    assert captured["model"] == "gemini-test-model"
    # prompt first, then the PIL images in order
    assert captured["contents"][0] == "describe these"
    assert len(captured["contents"]) == 3

    assert result["saved_count"] == 2
    assert result["input_tokens"] == 1000 and result["output_tokens"] == 500
    got = db_conn.execute(
        "SELECT provider, objects FROM ai_analysis ORDER BY file_id"
    ).fetchall()
    assert len(got) == 2
    assert got[0]["provider"] == "gemini"
    assert got[0]["objects"] == "car"


def test_usage_missing_metadata_is_zero():
    assert gemini._usage(SimpleNamespace(usage_metadata=None)) == (0, 0, 0)


def test_usage_none_counts_are_zero():
    m = SimpleNamespace(prompt_token_count=None, candidates_token_count=None, total_token_count=None)
    assert gemini._usage(SimpleNamespace(usage_metadata=m)) == (0, 0, 0)
