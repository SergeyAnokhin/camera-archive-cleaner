# Subsystems & Boundaries

Backend grouped into subsystems — what files belong to each, what it depends on, and where the seams are if a part is to be extracted into a standalone service (Docker, Home Assistant add-on, etc.).

For a flat per-file listing see [`code-map.md`](code-map.md). This doc is the *grouping* view.

---

## Subsystem map

| Subsystem | Files | Depends on | External libs |
|---|---|---|---|
| **HTTP layer** | `main.py`, `routers/*`, `api_helpers.py` | every other subsystem | fastapi, uvicorn |
| **Logging** | `logging_setup.py` | — (configures root logger on import) | — |
| **Config & scan** | `config.py`, `scanner.py` | Indexing/DB | env `CAMERA_ROOT` |
| **Indexing / DB** | `database.py`, `snapshots.db` (incl. `cameras` table) | — (owns all SQL) | sqlite3 (stdlib) |
| **Thumbnail pipeline** | `thumbnails.py`, `diff_thumbnails.py` | Indexing/DB (cache paths) | Pillow, numpy |
| **Compute delegation** | `compute_client.py`, `compute_config.py`, `compute_cache.py`, `ai_providers/openvino.py`, `routers/compute.py` | Indexing/DB, compute-service | httpx |
| **Cloud AI** | `ai_providers/gemini.py`, `ai_providers/claude.py`, `ai_providers/common.py`, `ai_pricing.py` | Indexing/DB | google-genai, anthropic, Pillow |
| **Task queue** | `task_runner.py`, `task_executors/*`, `routers/tasks.py` | Indexing/DB, Compute delegation | asyncio (stdlib) |
| **Compute-service** (separate process) | `compute-service/*` | `shared/` | ultralytics, openvino, opencv, Pillow |
| **Shared block** | `shared/*` | — | pydantic |

Rule of thumb: **`database.py` owns the table schema and the shared SQL helpers.** `config & scan`, `stats`, the thumbnail pipeline and `ai_providers` reach the DB only through its functions — that makes `database.py` the main seam to mock or replace.

The exception is [`routers/delete.py`](../backend/routers/delete.py), which runs its own inline SQL: the file-deletion `SELECT`/`DELETE` and the ±5 s video-matching `JOIN`. [`routers/ai.py`](../backend/routers/ai.py) (`/ai_objects_summary`), [`routers/maintenance.py`](../backend/routers/maintenance.py) (`DELETE FROM files`) and [`ai_providers/openvino.py`](../backend/ai_providers/openvino.py) each run one inline query as well. So when changing the DB schema, grep for raw SQL beyond `database.py` too.

**When changing `Camera` dataclass fields** (`config.py`), update all consumers:
- `backend/routers/catalog.py` — serialises Camera to JSON for `/cameras`
- `backend/scanner.py` — reads `camera.path`
- `backend/compute_client.py` — strips `CAMERA_ROOT` from `camera.path`
- `frontend/src/components/DeleteConfirmModal.jsx` — displays `camera.path`

**When changing camera configuration** — the camera configuration is stored in the `cameras` table of `snapshots.db` and managed via the UI (Tools → Cameras). On first startup with an empty table, two default cameras are seeded by `_seed_default_cameras()` in `database.py`. At runtime, the `CAMERA_ROOT` env var is prepended to the camera relative path to get the absolute media path.

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
- `shared/` holds the API contract and nothing else — `contract.py` is its only
  module, imported by both processes. `VideoConvertRequest` /
  `VideoConvertResponse` live in [`shared/contract.py`](../shared/contract.py).
- Routing (`off` / `kubernetes` / `local` / `remote`; `kubernetes` is the default)
  lives in `backend/compute_config.json` — see
  [`compute-service.md`](compute-service.md#routing-modes).
- The scanner skips the `organized` folder (defined as `SCANNER_SKIP_DIRS` in
  [`scanner.py`](../backend/scanner.py)) so file-organizer output is never
  re-indexed as fresh snapshots.

**Cross-boundary contract to preserve:** [`detection.py`](../compute-service/detection.py)
returns **canonical English COCO class names** (from `yolo.names`), and the backend
stores them verbatim — there is no translation step anywhere on the server. The
frontend's [`aiHelpers.js`](../frontend/src/aiHelpers.js) builds its emoji/label
lookup from the `en` **and** `ru` keys in
[`cocoClasses.js`](../frontend/src/cocoClasses.js) (the `ru` keys resolve cloud-AI
output, which is Russian). If a class-name spelling changes on one side, it must
change on the other — those two files are the entire contract.

---

## Notes for Docker / Home Assistant packaging

Runtime config is environment-driven — the knobs that matter when containerising:

| Config | Where it lives | Containerisation note |
|---|---|---|
| Camera IDs & relative paths | SQLite DB (`cameras` table) | CRUD via UI (Tools → Cameras); `CAMERA_ROOT` (env var, or in-app setting persisted to `server_config.json`) is prepended at runtime |
| Camera media (snapshots/videos) | Under `CAMERA_ROOT` | Must be reachable from the container (volume mount / SMB) |
| DB + server-side JSON configs | `DATA_DIR` env var (default `backend/`): `snapshots.db`, `settings.json`, `server_config.json`, `compute_config.json`, `google_oauth.json` | Put on a persistent volume (`/data` in the HA add-on) |
| Thumbnail caches | `CACHE_DIR` env var → [`compute_cache.py`](../backend/compute_cache.py) (default `backend/cache/`) | Persistent volume, or accept regeneration |
| OpenVINO models | `compute-service/models/` | Baked into the compute image at build time (`export_models.py`) |
| Log level | Live via `/logging/config` API; defaults in `logging_setup.py` | No restart needed |
| Ports | backend `8000`, compute `8001`, frontend `5173` (Vite dev proxy) | In containers the frontend is a static nginx build; `/api` is routed by the Ingress / add-on nginx |
| User settings | browser `localStorage`, mirrored to server `settings.json` via `/settings` (API keys stripped) | Portable across browsers via the server mirror |
