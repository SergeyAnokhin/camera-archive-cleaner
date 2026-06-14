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
              │  1. DB: file_id → file_path        │  prepend own CAMERA_ROOT
              │     strip CAMERA_ROOT prefix       │  read file
              │  4. write disk cache               │
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

## Path handling (`CAMERA_ROOT`)

Both services use a single env var, `CAMERA_ROOT` — the root under which the
camera share is mounted **on that machine**. The main backend strips its
`CAMERA_ROOT` prefix before sending a path
([`backend/compute_client.py`](../backend/compute_client.py)); the
compute-service prepends its own
([`compute-service/config.py`](../compute-service/config.py) →
`to_absolute()`). So only **relative** paths cross the wire, and each side can
mount the share wherever it likes.

| Machine | Example `CAMERA_ROOT` |
|---|---|
| k3s pod (Helm `camera.smb.mountPath`) | `/camera` (default) |
| Windows local dev | `\\192.168.1.91\Camera` |

---

## Files

| File | Role |
|---|---|
| [`compute-service/app.py`](../compute-service/app.py) | FastAPI app — `/health`, `/detect`, `/video/thumbnail`. Logs elapsed time for every request |
| [`compute-service/detection.py`](../compute-service/detection.py) | YOLO model loading (lazy, cached) + detection. Logs model load time and per-image inference time |
| [`compute-service/video.py`](../compute-service/video.py) | Video thumbnail generation (was `backend/video_thumbnails.py`) |
| [`compute-service/config.py`](../compute-service/config.py) | `CAMERA_ROOT` env var + `to_absolute()` |
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
# root under which the camera share is mounted on THIS machine:
$env:CAMERA_ROOT = "\\192.168.1.91\Camera"
uvicorn app:app --host 0.0.0.0 --port 8001
```

Then set **Tools → Compute → Удалённо** with that machine's URL. Exported
OpenVINO models go in `compute-service/models/` (see
[`docs/ai-analysis.md`](ai-analysis.md#openvino-model-runtime)).

---

## Running on a separate Windows machine (no Docker, no k3s)

This is the recommended path when you have a powerful Windows PC and want the
k3s cluster's backend pod to offload detection work to it.

### Step 1 — Install Python and dependencies

```powershell
# Python 3.11 or 3.12 recommended. Check:
python --version

# Clone or copy the repo onto this machine. Then:
cd C:\path\to\camera-archive-cleaner\compute-service
pip install -r requirements.txt
```

> **CPU-only torch** — `requirements.txt` installs the CPU build. If CUDA is
> available and you want GPU acceleration, replace the torch line:
> ```
> pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121
> ```

### Step 2 — Export OpenVINO models (once)

Speeds up inference 2–5× on Intel CPUs. Skip if you only want the PyTorch path.

```powershell
cd C:\path\to\camera-archive-cleaner\compute-service
python -c "from ultralytics import YOLO; YOLO('yolov8n.pt').export(format='openvino')"
python -c "from ultralytics import YOLO; YOLO('yolov8s.pt').export(format='openvino')"
python -c "from ultralytics import YOLO; YOLO('yolov8m.pt').export(format='openvino')"
New-Item -ItemType Directory -Force models
Move-Item yolov8n_openvino_model models\
Move-Item yolov8s_openvino_model models\
Move-Item yolov8m_openvino_model models\
```

### Step 3 — Set `CAMERA_ROOT`

The backend sends **relative** paths (e.g. `Foscam/snap/file.jpg`); the
compute-service prepends its own `CAMERA_ROOT`. Set it to the root under which
**this Windows machine** can open the camera share — usually the UNC path:

PowerShell:
```powershell
$env:CAMERA_ROOT = "\\192.168.1.91\Camera"
```

Bash (Git Bash / MSYS2 — use single quotes so backslashes are literal):
```bash
export CAMERA_ROOT='\\192.168.1.91\Camera'
```

The Windows machine accesses the NAS directly via UNC — no need to mount the
share as a drive letter. The reconstructed path looks like
`\\192.168.1.91\Camera\Foscam\snap\file.jpg` which Windows opens natively.

### Step 4 — Open Windows Firewall

The k3s backend needs to reach port 8001 on this machine.

```powershell
# Run in an elevated (Administrator) PowerShell:
New-NetFirewallRule `
  -DisplayName "Camera Compute Service" `
  -Direction Inbound `
  -Protocol TCP `
  -LocalPort 8001 `
  -Action Allow
```

Verify from another machine: `curl http://<windows-ip>:8001/health`

### Step 5 — Start the compute-service

PowerShell:
```powershell
cd C:\path\to\camera-archive-cleaner\compute-service

$env:CAMERA_ROOT = "\\192.168.1.91\Camera"

uvicorn app:app --host 0.0.0.0 --port 8001
```

Bash (Git Bash / MSYS2 — single quotes so backslashes are literal):
```bash
cd /c/path/to/camera-archive-cleaner/compute-service

export CAMERA_ROOT='\\192.168.1.91\Camera'

uvicorn app:app --host 0.0.0.0 --port 8001
```

`--host 0.0.0.0` makes it listen on all interfaces (not just localhost).
Leave this terminal open. The service starts and logs model load times.

### Step 6 — Point the backend to this machine

**If the backend is running locally (dev mode):**  
Open **Tools → Compute → Удалённо**, enter `http://<windows-ip>:8001`, click
**Сохранить**. The **Проверить связь** button tests the URL you entered *before*
saving — no need to save first.

**If the backend is running in k3s:**  
Edit `deploy/helm/camera-cleaner/values.yaml` — update the initContainer seed
in `backend.computeConfigSeed` (or the `compute_config.json` PVC entry) to:

```json
{"mode": "remote", "remote_url": "http://192.168.1.x:8001"}
```

where `192.168.1.x` is the Windows machine's LAN IP. The backend pod will call
that address directly. Make sure the k3s node(s) can reach that IP — they are
on the same LAN, so no extra routing is normally needed. Confirm with:

```bash
# curl нет в python:slim — используй wget:
kubectl -n camera-cleaner exec deploy/camera-cleaner-backend -- \
  wget -qO- http://192.168.1.x:8001/health
```

---

## Running via Docker (standalone, no k3s)

Use this if you want to avoid installing Python and dependencies locally, but
still run the compute-service outside of k3s (e.g. `docker run` on the Windows
machine using Docker Desktop).

### Build the image

Build from the **repo root** (the Dockerfile needs `shared/`):

```bash
docker build -f compute-service/Dockerfile -t camera-compute .
```

Build takes ~4–5 min the first time (downloads + exports YOLO models). The
resulting image contains the OpenVINO IR models baked in.

### Run

```bash
docker run -d \
  --name camera-compute \
  -p 8001:8001 \
  -e CAMERA_ROOT="/camera" \
  -v //192.168.1.99/Camera:/camera:ro \
  camera-compute
```

> On Windows with Docker Desktop, use `//server/share` (forward-slash) for
> volume mounts. `CAMERA_ROOT` is the path **inside the container** where the
> share is mounted (`/camera` here — also the default).

Expose port 8001, open the Windows Firewall rule (Step 4 above), and point the
backend to `http://<windows-ip>:8001` as in Step 6.
