"""Rules: docs/ai-analysis.md — Claude batch request is built as base64 JPEG
image blocks followed by one text block with the prompt; the structured JSON
response is parsed and persisted one row per file with token/cost stats.
The Anthropic client is mocked — no real API calls."""
import base64
import json
import sys
import types
from types import SimpleNamespace

import pytest
from PIL import Image

from ai_providers import claude
from database import upsert_file


def _install_fake_anthropic(monkeypatch, response_text, in_tokens=1000, out_tokens=500):
    """Register a fake `anthropic` module; returns a dict capturing the request."""
    captured = {}

    class _Messages:
        def create(self, **kwargs):
            captured.update(kwargs)
            return SimpleNamespace(
                content=[SimpleNamespace(text=response_text)],
                usage=SimpleNamespace(input_tokens=in_tokens, output_tokens=out_tokens),
            )

    class _Anthropic:
        def __init__(self, api_key):
            captured["api_key"] = api_key
            self.messages = _Messages()

    module = types.ModuleType("anthropic")
    module.Anthropic = _Anthropic
    monkeypatch.setitem(sys.modules, "anthropic", module)
    return captured


def _insert_photos(conn, tmp_path, n):
    """Create n tiny real JPEGs and index them; returns their file IDs."""
    ids = []
    for i in range(n):
        p = tmp_path / f"claude_test_{i}.jpg"
        Image.new("RGB", (8, 8), (i * 40, 0, 0)).save(p, "JPEG")
        upsert_file(conn, "cam1", "photo", str(p), 100, "2024-01-01T00:00:00+00:00")
    conn.commit()
    for r in conn.execute("SELECT id FROM files ORDER BY id"):
        ids.append(r["id"])
    return ids


def test_batch_request_images_then_prompt(db_conn, tmp_path, monkeypatch):
    response = json.dumps({
        "scene": "yard",
        "images": [
            {"description": "a cat", "objects": ["cat"]},
            {"description": "empty", "objects": []},
        ],
    })
    captured = _install_fake_anthropic(monkeypatch, response)
    ids = _insert_photos(db_conn, tmp_path, 2)

    result = claude.analyze_batch(ids, "describe these", "claude-test-model", "sk-test")

    assert captured["api_key"] == "sk-test"
    assert captured["model"] == "claude-test-model"
    content = captured["messages"][0]["content"]
    # 2 image blocks first, text block with the prompt last
    assert [b["type"] for b in content] == ["image", "image", "text"]
    assert content[-1]["text"] == "describe these"
    for block in content[:2]:
        src = block["source"]
        assert src["type"] == "base64" and src["media_type"] == "image/jpeg"
        assert base64.b64decode(src["data"])[:2] == b"\xff\xd8"  # JPEG magic

    assert result["saved_count"] == 2
    assert result["input_tokens"] == 1000 and result["output_tokens"] == 500
    got = db_conn.execute(
        "SELECT provider, objects FROM ai_analysis ORDER BY file_id"
    ).fetchall()
    assert len(got) == 2
    assert got[0]["provider"] == "claude"
    assert got[0]["objects"] == "cat"


def test_batch_unparseable_response_saves_nothing(db_conn, tmp_path, monkeypatch):
    _install_fake_anthropic(monkeypatch, "sorry, I cannot help with that")
    ids = _insert_photos(db_conn, tmp_path, 1)
    result = claude.analyze_batch(ids, "p", "m", "k")
    assert result["parsed"] is None
    assert result["saved_count"] == 0


def test_batch_no_valid_photos_raises_400(db_conn, monkeypatch):
    from fastapi import HTTPException
    _install_fake_anthropic(monkeypatch, "{}")
    with pytest.raises(HTTPException) as exc:
        claude.analyze_batch([99999], "p", "m", "k")
    assert exc.value.status_code == 400
