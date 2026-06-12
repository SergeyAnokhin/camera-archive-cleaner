"""Rule: docs/tuning.md — per-model golden-section search maximises mean F1
over the confidence interval in 2 + iterations probes (cache reuse, no grid
sweep); the recommendation takes the highest F1 across models with ties
(±0.01) broken by fastest mean time."""
import asyncio
from types import SimpleNamespace

import pytest

import routers.tuning as tuning


@pytest.fixture()
def quiet_session(monkeypatch):
    """No-op the DB progress writes inside the benchmark loop."""
    monkeypatch.setattr(tuning, "_update_session", lambda *a, **k: None)


def _fake_detect(speed_by_model):
    """F1 landscape: perfect detection only for conf in [0.3, 0.6].
    Below — extra false positive, above — a missed object."""
    def detect(path, model, conf, *args, **kwargs):
        if conf < 0.3:
            objects = ["a", "b", "c"]   # fp → f1 = 0.8
        elif conf <= 0.6:
            objects = ["a", "b"]        # perfect → f1 = 1.0
        else:
            objects = ["a"]             # fn → f1 ≈ 0.67
        return SimpleNamespace(objects=objects, elapsed_ms=speed_by_model[model])
    return detect


def _run(monkeypatch, iterations=6, speed=None):
    speed = speed or {"yolov8n": 10, "yolov8s": 50, "yolov8m": 100}
    monkeypatch.setattr(tuning.compute_client, "detect", _fake_detect(speed))
    config = {"conf_from": 0.10, "conf_to": 0.80, "iterations": iterations}
    return asyncio.run(
        tuning._benchmark_logic("test-session", [("img_0", "fake.jpg")], {"img_0": ["a", "b"]}, config)
    )


def test_converges_to_optimal_plateau(monkeypatch, quiet_session):
    results = _run(monkeypatch)
    for model in tuning.MODELS:
        best = results["per_model"][model]["best"]
        assert best["f1"] == 1.0
        assert 0.3 <= best["conf"] <= 0.6


def test_probe_budget_is_2_plus_iterations(monkeypatch, quiet_session):
    iterations = 6
    results = _run(monkeypatch, iterations=iterations)
    for model in tuning.MODELS:
        # unique evaluations never exceed the documented 2 + iterations budget
        assert 2 <= results["per_model"][model]["evals"] <= 2 + iterations


def test_recommendation_tie_breaks_by_speed(monkeypatch, quiet_session):
    # all models reach f1=1.0 → the fastest one must win
    results = _run(monkeypatch, speed={"yolov8n": 10, "yolov8s": 50, "yolov8m": 100})
    assert results["recommended"]["model"] == "yolov8n"


def test_f1_math_with_false_positive():
    # precision 2/3, recall 1 → f1 = 0.8 — the landscape used above
    prec, rec = 2 / 3, 1.0
    assert round(2 * prec * rec / (prec + rec), 4) == 0.8
