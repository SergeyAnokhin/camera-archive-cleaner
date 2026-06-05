"""Tuning endpoints — YOLO model sensitivity benchmarking.

Workflow:
  POST   /tuning/sessions                      — create session, UPLOAD images (multipart)
  GET    /tuning/sessions/{id}/image/{img_id}  — serve an uploaded image
  POST   /tuning/sessions/{id}/autolabel       — run a chosen model to seed ground truth
  PUT    /tuning/sessions/{id}/ground_truth    — save corrected ground truth
  POST   /tuning/sessions/{id}/benchmark       — start per-model golden-section search (background)
  GET    /tuning/sessions/{id}                 — poll status + results
  DELETE /tuning/sessions/{id}                 — remove session + uploaded files

The benchmark runs an independent golden-section search per model: it maximises
mean F1 over the confidence interval, reusing one evaluation per refinement step,
so it converges in 2 + iterations probes per model instead of a full grid sweep.
"""
import asyncio
import json
import logging
import math
import shutil
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

import compute_client
from database import get_connection

logger = logging.getLogger("api")
router = APIRouter(prefix="/tuning", tags=["tuning"])

MODELS = ["yolov8n", "yolov8s", "yolov8m"]
GOLDEN = (math.sqrt(5) - 1) / 2  # ≈ 0.618
UPLOAD_ROOT = Path(__file__).resolve().parent.parent / "tuning_uploads"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _row_to_dict(row) -> dict:
    return dict(row) if row else {}


def _get_session_or_404(session_id: str) -> dict:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM tuning_sessions WHERE id = ?", (session_id,)
        ).fetchone()
    if not row:
        raise HTTPException(404, "Tuning session not found")
    return _row_to_dict(row)


def _update_session(session_id: str, **fields) -> None:
    if not fields:
        return
    sets = ", ".join(f"{k} = ?" for k in fields)
    with get_connection() as conn:
        conn.execute(
            f"UPDATE tuning_sessions SET {sets} WHERE id = ?",
            [*fields.values(), session_id],
        )


def _image_path(session_id: str, image: dict) -> Path:
    return UPLOAD_ROOT / session_id / image["file"]


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class AutolabelBody(BaseModel):
    model: str = "yolov8m"
    confidence: float = 0.4


class GroundTruthBody(BaseModel):
    ground_truth: dict[str, list[str]]


class BenchmarkBody(BaseModel):
    conf_from: float = 0.10
    conf_to: float = 0.80
    iterations: int = 6  # golden-section refinement steps per model


# ---------------------------------------------------------------------------
# Session CRUD + image upload
# ---------------------------------------------------------------------------

@router.get("/sessions")
def list_sessions():
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, name, status, images, progress_current, progress_total, "
            "error_message, created_at, completed_at "
            "FROM tuning_sessions ORDER BY created_at DESC"
        ).fetchall()
    result = []
    for row in rows:
        d = _row_to_dict(row)
        d["image_count"] = len(json.loads(d.pop("images", "[]")))
        result.append(d)
    return result


@router.post("/sessions")
async def create_session(
    name: str = Form(...),
    files: list[UploadFile] = File(...),
):
    if not name.strip():
        raise HTTPException(400, "Session name required")
    if not files:
        raise HTTPException(400, "At least one image required")

    session_id = str(uuid.uuid4())
    session_dir = UPLOAD_ROOT / session_id
    session_dir.mkdir(parents=True, exist_ok=True)

    images: list[dict] = []
    for i, up in enumerate(files):
        ext = Path(up.filename or "").suffix.lower() or ".jpg"
        img_id = f"img_{i}"
        stored = f"{img_id}{ext}"
        data = await up.read()
        (session_dir / stored).write_bytes(data)
        images.append({"id": img_id, "name": up.filename or stored, "file": stored})

    with get_connection() as conn:
        conn.execute(
            "INSERT INTO tuning_sessions (id, name, images, status) VALUES (?, ?, ?, 'setup')",
            (session_id, name.strip(), json.dumps(images)),
        )
    return _get_session_or_404(session_id)


@router.get("/sessions/{session_id}")
def get_session(session_id: str):
    return _get_session_or_404(session_id)


@router.delete("/sessions/{session_id}")
def delete_session(session_id: str):
    _get_session_or_404(session_id)
    with get_connection() as conn:
        conn.execute("DELETE FROM tuning_sessions WHERE id = ?", (session_id,))
    shutil.rmtree(UPLOAD_ROOT / session_id, ignore_errors=True)
    return {}


@router.get("/sessions/{session_id}/image/{image_id}")
def get_image(session_id: str, image_id: str):
    session = _get_session_or_404(session_id)
    images = json.loads(session["images"])
    image = next((im for im in images if im["id"] == image_id), None)
    if not image:
        raise HTTPException(404, "Image not found")
    path = _image_path(session_id, image)
    if not path.exists():
        raise HTTPException(404, "Image file missing on disk")
    return FileResponse(str(path))


# ---------------------------------------------------------------------------
# Ground truth (step 1)
# ---------------------------------------------------------------------------

@router.post("/sessions/{session_id}/autolabel")
def autolabel(session_id: str, body: AutolabelBody):
    """Run the chosen model on every image to seed ground truth labels."""
    session = _get_session_or_404(session_id)
    images = json.loads(session["images"])
    if not images:
        raise HTTPException(400, "No images in session")

    ground_truth: dict[str, list[str]] = {}
    for image in images:
        path = _image_path(session_id, image)
        try:
            result = compute_client.detect(str(path), body.model, body.confidence, [], False)
            ground_truth[image["id"]] = result.objects
        except Exception as e:
            logger.warning("Autolabel failed for %s: %s", image["id"], e)
            ground_truth[image["id"]] = []

    _update_session(session_id, ground_truth=json.dumps(ground_truth), status="ready")
    return {"ground_truth": ground_truth}


@router.put("/sessions/{session_id}/ground_truth")
def save_ground_truth(session_id: str, body: GroundTruthBody):
    _get_session_or_404(session_id)
    _update_session(session_id, ground_truth=json.dumps(body.ground_truth), status="ready")
    return {}


# ---------------------------------------------------------------------------
# Benchmark (step 2) — per-model golden-section search
# ---------------------------------------------------------------------------

@router.post("/sessions/{session_id}/benchmark")
async def start_benchmark(session_id: str, body: BenchmarkBody):
    session = _get_session_or_404(session_id)

    if session["status"] == "running":
        raise HTTPException(400, "Benchmark already running")
    ground_truth = json.loads(session.get("ground_truth") or "{}")
    if not ground_truth:
        raise HTTPException(400, "Run detection first to create ground truth labels")
    if body.conf_from >= body.conf_to:
        raise HTTPException(400, "conf_from must be < conf_to")

    images = json.loads(session["images"])
    image_infos = [
        (im["id"], str(_image_path(session_id, im)))
        for im in images
        if _image_path(session_id, im).exists()
    ]
    if not image_infos:
        raise HTTPException(400, "No valid image files found")

    iterations = max(1, body.iterations)
    config = {
        "conf_from": body.conf_from,
        "conf_to": body.conf_to,
        "iterations": iterations,
    }
    # 2 initial probes + one new probe per refinement step, for each model
    total_ops = len(MODELS) * (2 + iterations) * len(image_infos)

    _update_session(
        session_id,
        status="running",
        benchmark_config=json.dumps(config),
        benchmark_results=None,
        progress_current=0,
        progress_total=total_ops,
        error_message=None,
        completed_at=None,
    )

    asyncio.create_task(_run_benchmark(session_id, image_infos, ground_truth, config))
    return {"status": "started", "total_ops": total_ops}


async def _run_benchmark(session_id, image_infos, ground_truth, config) -> None:
    try:
        results = await _benchmark_logic(session_id, image_infos, ground_truth, config)
        _update_session(
            session_id,
            status="done",
            benchmark_results=json.dumps(results),
            completed_at=datetime.utcnow().isoformat(),
        )
        logger.info("Benchmark %s completed", session_id[:8])
    except Exception as e:
        logger.error("Benchmark %s failed: %s", session_id[:8], e, exc_info=True)
        _update_session(session_id, status="failed", error_message=str(e)[:500])


def _mean(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


async def _benchmark_logic(session_id, image_infos, ground_truth, config) -> dict:
    loop = asyncio.get_running_loop()
    conf_from = config["conf_from"]
    conf_to = config["conf_to"]
    n_iter = config["iterations"]

    progress = 0
    per_model: dict[str, dict] = {}

    for model in MODELS:
        cache: dict[float, dict] = {}
        probes: list[dict] = []

        async def evaluate(conf: float, lo: float, hi: float) -> dict:
            nonlocal progress
            key = round(conf, 3)
            if key not in cache:
                stats = []
                for image_id, path in image_infos:
                    try:
                        det = await loop.run_in_executor(
                            None,
                            lambda p=path, c=key: compute_client.detect(p, model, c, [], False),
                        )
                        detected = set(det.objects)
                        gt = set(ground_truth.get(image_id, []))
                        tp = len(gt & detected)
                        fp = len(detected - gt)
                        fn = len(gt - detected)
                        prec = tp / (tp + fp) if (tp + fp) else (1.0 if not gt else 0.0)
                        rec = tp / (tp + fn) if (tp + fn) else 1.0
                        f1 = 2 * prec * rec / (prec + rec) if (prec + rec) else 0.0
                        stats.append((prec, rec, f1, det.elapsed_ms))
                    except Exception as e:
                        logger.warning("Detect failed %s/%s conf=%.3f: %s", image_id, model, key, e)
                        stats.append((0.0, 0.0, 0.0, 0))
                    progress += 1
                cache[key] = {
                    "conf": key,
                    "f1": round(_mean([s[2] for s in stats]), 4),
                    "precision": round(_mean([s[0] for s in stats]), 4),
                    "recall": round(_mean([s[1] for s in stats]), 4),
                    "mean_time_ms": round(_mean([s[3] for s in stats])),
                }
                _update_session(session_id, progress_current=progress)

            base = cache[key]
            probes.append({**base, "lo": round(lo, 3), "hi": round(hi, 3)})
            return base

        # Golden-section search maximising F1 on [conf_from, conf_to]
        a, b = conf_from, conf_to
        c = b - GOLDEN * (b - a)
        d = a + GOLDEN * (b - a)
        rc = await evaluate(c, a, b)
        rd = await evaluate(d, a, b)

        for _ in range(n_iter):
            if rc["f1"] >= rd["f1"]:
                b = d
                d, rd = c, rc
                c = b - GOLDEN * (b - a)
                rc = await evaluate(c, a, b)
            else:
                a = c
                c, rc = d, rd
                d = a + GOLDEN * (b - a)
                rd = await evaluate(d, a, b)

        best = max(cache.values(), key=lambda p: (p["f1"], -p["mean_time_ms"]))
        per_model[model] = {
            "probes": probes,
            "best": best,
            "evals": len(cache),
            "final_range": [round(a, 3), round(b, 3)],
        }

    # Recommendation: highest F1 across models' best, tie-break fastest
    candidates = [{"model": m, **per_model[m]["best"]} for m in MODELS]
    max_f1 = max(c["f1"] for c in candidates)
    top = [c for c in candidates if c["f1"] >= max_f1 - 0.01]
    recommended = min(top, key=lambda c: c["mean_time_ms"])

    return {"per_model": per_model, "recommended": recommended}
