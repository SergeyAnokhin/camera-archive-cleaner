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
| `POST` | `/detect` | `{path, model, confidence, excluded, draw}` | `{objects, annotated_jpeg_b64, elapsed_ms}` |
| `POST` | `/video/thumbnail` | `{path, mode}` | binary `image/jpeg` or `image/gif` |

`/detect` returns **all** detected objects (Russian) plus, when `draw=true`, the
bounding-box JPEG (base64) with excluded classes removed — both in one call so a
single inference serves both the `/openvino_thumbnail` image and the
`ai_analysis` DB write. `/video/thumbnail` has no objects to return, so it
streams the image bytes directly.

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
| [`compute-service/app.py`](../compute-service/app.py) | FastAPI app — `/health`, `/detect`, `/video/thumbnail` |
| [`compute-service/detection.py`](../compute-service/detection.py) | YOLO model loading + detection (was `backend/yolo_detect.py`) |
| [`compute-service/video.py`](../compute-service/video.py) | Video thumbnail generation (was `backend/video_thumbnails.py`) |
| [`compute-service/config.py`](../compute-service/config.py) | Path-remap config (env driven) |
| [`shared/contract.py`](../shared/contract.py) | Pydantic API models — shared by both backends |
| [`shared/coco_names.py`](../shared/coco_names.py) | COCO→Russian map + `excluded_to_en` |
| [`backend/compute_client.py`](../backend/compute_client.py) | HTTP client used by the main backend |
| [`backend/compute_config.py`](../backend/compute_config.py) | Routing config (`compute_config.json`) |
| [`backend/compute_cache.py`](../backend/compute_cache.py) | Disk-cache paths for OpenVINO + video thumbnails |
| [`backend/routers/compute.py`](../backend/routers/compute.py) | `/compute/config`, `/compute/status` endpoints |

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
