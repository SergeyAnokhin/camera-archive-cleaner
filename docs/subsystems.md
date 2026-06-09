# Subsystems & Boundaries

Backend grouped into subsystems — what files belong to each, what it depends on, and where the seams are if a part is to be extracted into a standalone service (Docker, Home Assistant add-on, etc.).

For a flat per-file listing see [`code-map.md`](code-map.md). This doc is the *grouping* view.

---

## Subsystem map

| Subsystem | Files | Depends on | External libs |
|---|---|---|---|
| **HTTP layer** | `main.py`, `routers/*`, `api_helpers.py` | every other subsystem | fastapi, uvicorn |
| **Logging** | `logging_setup.py` | — (configures root logger on import) | — |
| **Config & scan** | `config.py`, `scanner.py`, `cameras.yaml` | Indexing/DB | pyyaml |
| **Indexing / DB** | `database.py`, `snapshots.db` | — (owns all SQL) | sqlite3 (stdlib) |
| **Thumbnail pipeline** | `thumbnails.py`, `diff_thumbnails.py`, `diff_zoom_thumbnails.py`, `erosion_thumbnails.py`, `motion_thumbnails.py` | Indexing/DB (cache paths) | Pillow, numpy, opencv |
| **Compute delegation** | `compute_client.py`, `compute_config.py`, `compute_cache.py`, `ai_providers/openvino.py`, `routers/compute.py` | Indexing/DB, compute-service | httpx |
| **Cloud AI** | `ai_providers/gemini.py`, `ai_providers/claude.py`, `ai_providers/common.py`, `ai_pricing.py` | Indexing/DB | google-genai, anthropic, Pillow |
| **Task queue** | `task_runner.py`, `routers/tasks.py` | Indexing/DB, Compute delegation | asyncio (stdlib) |
| **Compute-service** (separate process) | `compute-service/*` | `shared/` | ultralytics, openvino, opencv, Pillow |
| **Shared block** | `shared/*` | — | pydantic |

Rule of thumb: **`database.py` owns the table schema and the shared SQL helpers.** `config & scan`, `stats`, the thumbnail pipeline and `ai_providers` reach the DB only through its functions — that makes `database.py` the main seam to mock or replace.

The exception is [`routers/delete.py`](../backend/routers/delete.py), which runs its own inline SQL: the file-deletion `SELECT`/`DELETE` and the ±5 s video-matching `JOIN`. [`routers/ai.py`](../backend/routers/ai.py) (`/ai_objects_summary`), [`routers/maintenance.py`](../backend/routers/maintenance.py) (`DELETE FROM files`) and [`ai_providers/openvino.py`](../backend/ai_providers/openvino.py) each run one inline query as well. So when changing the DB schema, grep for raw SQL beyond `database.py` too.

---

## Object detection & video — the compute-service

The heavy subsystems (local YOLO detection, video thumbnail generation) **have
been extracted** into a standalone stateless service. Full architecture:
[`compute-service.md`](compute-service.md).

In short:

- `compute-service/` runs YOLO inference, video decoding, and **ffmpeg video
  conversion** (`POST /video/convert`). It owns no DB and no cache — it takes
  a file path + parameters and returns results.
- The main backend keeps the DB read/write and disk caches; it delegates only
  the compute step via [`compute_client.py`](../backend/compute_client.py).
  `video_convert` tasks are routed through `compute_client.convert_video()` with
  a 2-hour timeout; `file_organizer` tasks run entirely on the backend (cheap
  `shutil.move` calls — no compute delegation needed).
- `shared/` holds the API contract and the `COCO_TO_RUSSIAN` map — imported by
  both processes. `VideoConvertRequest` / `VideoConvertResponse` live in
  [`shared/contract.py`](../shared/contract.py).
- Routing (`off` / `local` / `remote`) lives in `backend/compute_config.json`.
- The scanner skips the `organized` folder (defined as `SCANNER_SKIP_DIRS` in
  [`scanner.py`](../backend/scanner.py)) so file-organizer output is never
  re-indexed as fresh snapshots.

**Cross-boundary contract to preserve:** `COCO_TO_RUSSIAN` in
[`shared/coco_names.py`](../shared/coco_names.py) must keep producing the same
Russian words — the frontend's `OBJECT_EMOJI_DEFAULTS` in
[`aiHelpers.js`](../frontend/src/aiHelpers.js) maps those exact words to emoji.
Change one side, change both.

---

## Notes for Docker / Home Assistant packaging

Current runtime config is **not** environment-driven — relevant before containerising:

| Config | Where it lives | Containerisation note |
|---|---|---|
| Camera IDs & paths | `backend/cameras.yaml` | Mount as a volume or template from env |
| Camera media (snapshots/videos) | UNC / local paths inside `cameras.yaml` | Must be reachable from the container (volume mount / SMB) |
| DB & all caches | `backend/*.db`, `backend/*_cache/` | Put on a persistent volume |
| OpenVINO models | `compute-service/models/` | Lives with the compute-service |
| Log level | hard-coded `logging.root.setLevel(...)` in `logging_setup.py` | No env override yet |
| Ports | backend `8000`, frontend `5173` (Vite proxy → `8000`) | Vite dev-proxy is dev-only; production needs a static build + reverse proxy |
| All user settings | browser `localStorage` (see [`settings.md`](settings.md)) | Per-browser — not portable with the container |

No env-var support exists today; adding it is a code change, not a docs change.
