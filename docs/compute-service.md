# Compute Service

The **compute-service** is an optional, stateless backend that runs the
resource-heavy work — local object detection (YOLO/OpenVINO) and video
thumbnail generation. It exists so the heavy CPU/memory load and the large
`ultralytics` + `torch` dependency tree can be moved off the main backend, and
optionally onto a separate machine. The main backend keeps the database and all
disk caches; the compute-service owns no state — it takes a file path plus
parameters and returns results.

When the compute-service is disabled, the main backend's heavy endpoints return
`503` and the frontend hides the heavy view modes.

---

## Three blocks

| Block | Path | Role | Heavy deps |
|---|---|---|---|
| Main backend | [`backend/`](../backend/) | DB, scanning, light thumbnails, diff/MOG2 modes, cloud AI, **all disk caches**, routing to the compute-service | — |
| Compute-service | [`compute-service/`](../compute-service/) | YOLO detection + video thumbnails. Stateless — no DB, no cache | `ultralytics`, `openvino`, `opencv` |
| Shared block | [`shared/`](../shared/) | API contract + COCO→Russian map — imported by both backends | — |

The shared block is deliberately tiny and dependency-light so it can sit on
both machines as an ordinary folder. [`shared/contract.py`](../shared/contract.py)
holds the Pydantic request/response models (so the two sides can never drift);
[`shared/coco_names.py`](../shared/coco_names.py) holds `COCO_TO_RUSSIAN` — the
cross-boundary contract with the frontend's `OBJECT_EMOJI_DEFAULTS`.

---

## Routing modes

Config is persisted server-side in `backend/compute_config.json`, edited via
**Tools → Compute** in the UI (`GET`/`PUT /compute/config`).

| Mode | Effective URL | Behaviour |
|---|---|---|
| `off` | — | Heavy endpoints return `503`; OpenVINO view modes and video previews hidden in the UI |
| `local` | `http://localhost:8001` | Calls the compute-service running on the same machine |
| `remote` | `remote_url` | Calls the compute-service on another machine |

`local` and `remote` differ only in the URL. The compute-service process is the
same in both cases — `npm start` always launches it locally; for `remote` you
run it yourself on the other machine.

---

## Request flow

```
browser ──► main backend (:8000) ──────────────► compute-service (:8001)
              │  1. DB: file_id → file_path        │  remap path prefix
              │  4. write disk cache               │  read file
              │  5. DB: save detected objects      │  run YOLO / decode video
              │                                    │  return objects + JPEG/GIF
              ◄────────────────────────────────────┘
            FileResponse (cached JPEG/GIF)
```

Steps 1, 4, 5 (DB + cache) always stay in the main backend. Only step "run" is
delegated. This is what keeps the compute-service stateless and relocatable.

---

## Compute-service API

FastAPI app on port `8001` — [`compute-service/app.py`](../compute-service/app.py).

| Method | Path | In | Out |
|---|---|---|---|
| `GET` | `/health` | — | `{status, capabilities}` |
| `POST` | `/detect` | `{path, model, confidence, classes, draw}` | `{objects, annotated_jpeg_b64, elapsed_ms}` |
| `POST` | `/video/thumbnail` | `{path, mode}` | binary `image/jpeg` or `image/gif` |

`classes` (optional list of COCO class IDs) restricts the YOLO inference — the model only looks for those classes, so others never appear in `objects`. `/detect` returns all detected objects (Russian) plus, when `draw=true`, the bounding-box JPEG (base64) — both in one call so a single inference serves both the `/openvino_thumbnail` image and the `ai_analysis` DB write. `/video/thumbnail` streams the image bytes directly.

---

## Path remapping

The compute-service receives the file path **as stored in the main backend's
DB**. When it runs on another machine, the camera share may be mounted under a
different root. [`compute-service/config.py`](../compute-service/config.py)
swaps the leading prefix:

| Env var | Meaning |
|---|---|
| `COMPUTE_PATH_REMAP_FROM` | Prefix as stored in the main backend's DB |
| `COMPUTE_PATH_REMAP_TO` | Prefix as seen by the compute-service machine |

Only the leading prefix changes; the rest of the path is identical. Default:
both empty → identity (no remap), which is correct when both run on the same
machine.

---

## Files

| File | Role |
|---|---|
| [`compute-service/app.py`](../compute-service/app.py) | FastAPI app — `/health`, `/detect`, `/video/thumbnail`. Logs elapsed time for every request |
| [`compute-service/detection.py`](../compute-service/detection.py) | YOLO model loading (lazy, cached) + detection. Logs model load time and per-image inference time |
| [`compute-service/video.py`](../compute-service/video.py) | Video thumbnail generation (was `backend/video_thumbnails.py`) |
| [`compute-service/config.py`](../compute-service/config.py) | Path-remap config (env driven) |
| [`compute-service/export_models.py`](../compute-service/export_models.py) | **Build-time only** — downloads yolov8n/s/m `.pt` weights, exports each to OpenVINO IR (`models/<name>_openvino_model/`), removes the `.pt` files. Run by the Dockerfile `RUN` step; never executed at runtime |
| [`shared/contract.py`](../shared/contract.py) | Pydantic API models — shared by both backends |
| [`shared/coco_names.py`](../shared/coco_names.py) | `COCO_TO_RUSSIAN` map (23 entries; others fall back to English) |
| [`backend/compute_client.py`](../backend/compute_client.py) | HTTP client used by the main backend |
| [`backend/compute_config.py`](../backend/compute_config.py) | Routing config (`compute_config.json`) |
| [`backend/compute_cache.py`](../backend/compute_cache.py) | Disk-cache paths for OpenVINO + video thumbnails |
| [`backend/routers/compute.py`](../backend/routers/compute.py) | `/compute/config`, `/compute/status` endpoints |

---

## OpenVINO model export

`detection.py` checks for `models/<name>_openvino_model/` at startup and, when
found, loads the OpenVINO IR model instead of raw PyTorch — typically 2–5×
faster on Intel CPUs. The OpenVINO IR format is portable; CPU-specific
optimisation happens automatically in the OpenVINO Runtime at load time.

**In Docker (k3s):** [`export_models.py`](../compute-service/export_models.py) runs
inside the Dockerfile `RUN` step — all three models are exported and baked into
the image. Build time increases ~4–5 min (one-time per image build). The `.pt`
files are deleted afterwards to keep the image lean.

**Locally:** export once manually then the files persist in `compute-service/models/`
(git-ignored):
```powershell
cd compute-service
python -c "from ultralytics import YOLO; YOLO('yolov8n.pt').export(format='openvino')"
mkdir models -ErrorAction SilentlyContinue
Move-Item yolov8n_openvino_model models\
```

**Log lines to confirm which path is taken:**
```
🔷 Loading OpenVINO model: .../models/yolov8n_openvino_model   ← fast path
🔷 Loading PyTorch model: yolov8n.pt (tip: export ...)         ← slow path
🔷 Model yolov8n ready in 3.4 s                                ← either path
```

---

## Running

`npm start` launches all three processes (main backend, compute-service,
frontend). To run the compute-service alone on a separate machine:

```powershell
cd compute-service
pip install -r requirements.txt
# optional path remap:
$env:COMPUTE_PATH_REMAP_FROM = "\\192.168.1.99\Camera"
$env:COMPUTE_PATH_REMAP_TO   = "/mnt/camera"
uvicorn app:app --host 0.0.0.0 --port 8001
```

Then set **Tools → Compute → Удалённо** with that machine's URL. Exported
OpenVINO models go in `compute-service/models/` (see
[`docs/ai-analysis.md`](ai-analysis.md#openvino-model-runtime)).
