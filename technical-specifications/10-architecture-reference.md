# 10 — Architecture Reference (Optional)

> **This part is intentionally separable.** Parts 01–09 specify behaviour;
> this part records how the *current* implementation realises it. Remove this
> file to hand the spec to a team that should design its own architecture.
> The code-level source of truth is the [`docs/`](../docs/) directory of the
> repository — where this file and `docs/` disagree, trust `docs/`.

## 1. Processes

Three runnable processes plus one shared code package, started together by
`npm start` (via `concurrently`):

| Block | Stack | Port | Role | State |
|---|---|---|---|---|
| Frontend | React + Vite | 5173 (dev) | Heatmap, hour viewer, tasks, tuning, settings | none (browser `localStorage`) |
| Main backend | Python, FastAPI, uvicorn | 8000 | DB, scanning, thumbnails/motion renders, cloud AI, deletion, task queue, tuning, **all disk caches**, routing to compute | owns SQLite DB + caches |
| Compute-service | Python, FastAPI | 8001 | YOLOv8/OpenVINO detection, video thumbnails, ffmpeg conversion | **stateless** |
| `shared/` | Pydantic models | — | API contract between the two backends + COCO→Russian map | — |

Vite dev server proxies `/api/*` → `:8000`. Image processing: Pillow, numpy,
OpenCV. Cloud SDKs: `google-genai`, `anthropic`. Detection: Ultralytics
YOLOv8 on the Intel OpenVINO runtime (pre-exported IR models under
`compute-service/models/`, fallback to PyTorch `.pt`). Charts: Recharts.
Icons: MDI from CDN.

## 2. Configuration & paths

- `backend/cameras.yaml` — camera registry (`id`, `name`, `path` relative to
  the root). Single source of truth; CI injects it into the Helm values.
- `CAMERA_ROOT` env var on **each** machine = mount point of the share
  (`\\192.168.1.99\Camera` on Windows, `/camera` in k8s). Only relative paths
  cross the backend↔compute boundary; each side prepends its own root.
- Compute routing is persisted in `backend/compute_config.json`
  (`{mode: off|local|remote, remote_url}`), edited via `GET/PUT
  /compute/config`; `GET /compute/status` pings the compute `/health`.

## 3. Database (SQLite, `backend/snapshots.db`)

| Table | Content | Key points |
|---|---|---|
| `files` | file index: camera_id, file_type, file_path (UNIQUE), file_size, timestamp | indexes on (camera_id, timestamp) and (camera_id, file_type, timestamp); scan = DELETE per camera + re-insert |
| `thumbnails` | basic-thumbnail cache records | 30-day auto-expiry |
| `ai_analysis` | cloud AI results (gemini/claude): scene/image descriptions, objects, tokens, cost_usd, elapsed_ms | UNIQUE(file_id), upsert on re-run |
| `object_detection` | local detection results: model, objects, elapsed_ms | separate table so detection and cloud AI coexist |
| `video_previews` | video-preview cache records incl. mode (for invalidation) | |
| `tasks` | task queue: type, status, params JSON, order_index, progress, speed/ETA, current file, error, `log_tail` (last 300 lines) | running→paused reset on startup |
| `tuning_sessions` | tuning: images JSON, ground_truth JSON, config, results, progress | standalone; uploads under `backend/tuning_uploads/<id>/` |

All file-derived tables cascade-delete with `files`.

## 4. HTTP API of the main backend (summary)

Full reference: [`docs/api.md`](../docs/api.md).

| Group | Endpoints |
|---|---|
| Catalog | `GET /cameras`, `POST /scan` |
| Stats | `GET /stats` (group_by total/camera/year/month/day/hour), `GET /distribution` (60 buckets), `GET /files`, `GET /previews`, `GET /media/{id}` |
| Thumbnails | `GET /thumbnail/{id}`, `/diff_thumbnail/{id}`, `/erosion_thumbnail/{id}`, `/diff_zoom_thumbnail/{id}`, `/motion_thumbnail/{id}` (4 modes), `/openvino_thumbnail/{id}` (model+confidence+classes), `/video_thumbnail/{id}` (6 modes) |
| Deletion | `POST /delete/preview`, `/delete/confirm`, `/delete/preview_range`, `/delete/by_range` |
| AI | `POST /gemini_analyze`, `/gemini_analyze_batch`, `/claude_analyze_batch`, `/openvino_analyze_batch`, `/openvino_analyze_range`; `GET /ai_analysis` (merged per-file), `GET /ai_objects_summary` |
| Compute | `GET/PUT /compute/config`, `GET /compute/status` |
| Tasks | `GET/POST /tasks`, `GET /tasks/metrics`, `GET /tasks/estimate_files`, `PUT /tasks/reorder`, `PUT /tasks/pause_all|resume_all`, per-task `pause/resume/skip/cancel`, `DELETE /tasks/{id}`, `GET /tasks/{id}/logs` |
| Tuning | `GET/POST /tuning/sessions`, `GET/DELETE /tuning/sessions/{id}`, image serving, `POST …/autolabel`, `PUT …/ground_truth`, `POST …/benchmark` |
| Maintenance | `DELETE /database`, `DELETE /*_thumbnails`, `DELETE /all_thumbnails`, `GET /storage_info` |

Compute-service API: `GET /health`, `GET /metrics` (psutil), `POST /detect`
(path, model, confidence, classes, draw → objects + optional annotated JPEG
b64), `POST /video/thumbnail` (streams JPEG/GIF), `POST /video/convert`
(ffmpeg, 2 h timeout).

## 5. Disk caches (all under `backend/`)

`thumbnails_cache/`, `diff_thumbnails_cache/`, `diff_zoom_thumbnails_cache/`,
`erosion_thumbnails_cache/`, `motion_thumbnails_cache/`,
`openvino_thumbnails_cache/` (key: hash of version+file+model+conf+classes),
`video_thumbnails_cache/`. Page-context renders key on sorted page ids +
threshold.

## 6. Frontend structure (high level)

`App.jsx` owns navigation/selection state; `HeatmapGrid`/`HeatmapCell` render
cells; `HourViewer` + `hour/*` components and a `viewModes/` registry (one
module per mode, `isAiMode` / `needsCompute` flags) drive the hour screen;
`ToolsModal` + `tools/*` one-component-per-tab for settings
(`settingsConfig.js` holds every key/default); `TasksScreen`/`TaskCard`/
`NewTaskModal`; `TuningScreen` + `tuning/*` steps. API calls live in
`src/api/*` domain modules re-exported through `api.js`. The COCO
class→Russian→emoji vocabulary is `cocoClasses.js` (frontend) +
`shared/coco_names.py` (backends) — change both together. localStorage keys
are catalogued in [`docs/settings.md`](../docs/settings.md).

## 7. Background execution

`task_runner.py` — an asyncio loop in the backend process — picks queued
tasks and dispatches to `task_executors/<type>.py` (registry pattern; six
executors). The tuning benchmark runs as a FastAPI background task, separate
from the queue.

## 8. Deployment

Local dev: `npm start`. Production: three Docker images (frontend = static
nginx build), Helm chart (`deploy/helm/camera-cleaner/`) on k3s, ArgoCD
auto-sync, GitHub Actions CI building images to GHCR and bumping the chart
tags. Camera share mounted via SMB CSI; state (DB + caches) on a PVC; the
compute Docker image bakes pre-exported OpenVINO models at build time. The
compute-service can instead run bare on a separate Windows machine (UNC
`CAMERA_ROOT`, firewall port 8001) with the backend pointed at it via the
`remote` routing mode. Details: [`docs/deployment.md`](../docs/deployment.md)
and [`docs/compute-service.md`](../docs/compute-service.md).
