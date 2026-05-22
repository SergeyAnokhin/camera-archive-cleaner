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
| **Thumbnail pipeline** | `thumbnails.py`, `diff_thumbnails.py`, `diff_zoom_thumbnails.py`, `erosion_thumbnails.py`, `motion_thumbnails.py`, `video_thumbnails.py` | Indexing/DB (cache paths) | Pillow, numpy, opencv |
| **Object detection** (local AI) | `yolo_detect.py`, `ai_providers/openvino.py` | Indexing/DB | ultralytics, openvino, Pillow |
| **Cloud AI** | `ai_providers/gemini.py`, `ai_providers/claude.py`, `ai_providers/common.py`, `ai_pricing.py` | Indexing/DB | google-genai, anthropic, Pillow |

Rule of thumb: **`database.py` is the only file that runs SQL.** Every other subsystem reaches the DB through its functions — that makes `database.py` the single seam to mock or replace.

---

## Object detection — extraction guide

This is the subsystem most likely to become a standalone service (GPU host, separate container, HA add-on). Its current shape:

### Files & endpoints

| Part | File | Role |
|---|---|---|
| Detection core | [`yolo_detect.py`](../backend/yolo_detect.py) | Model loading (`load_yolo`), `COCO_TO_RUSSIAN` map, bbox cache-path hashing. **No DB import — already pure.** |
| Batch / range logic | [`ai_providers/openvino.py`](../backend/ai_providers/openvino.py) | `analyze_batch()`, `analyze_range()` — runs YOLO, **reads file paths from DB, writes results to DB** |
| Analyse endpoints | [`routers/ai.py`](../backend/routers/ai.py) | `/openvino_analyze_batch`, `/openvino_analyze_range` — thin delegation to `openvino.py` |
| Bbox image endpoint | [`routers/thumbnails_api.py`](../backend/routers/thumbnails_api.py) | `/openvino_thumbnail` — runs YOLO, draws boxes, **also reads/writes DB** |
| Models / cache | `backend/models/`, `backend/openvino_thumbnails_cache/` | Pre-exported OpenVINO IR models; rendered bbox JPEGs |

### The seam to cut

The detection *algorithm* is already clean — `yolo_detect.py` has no DB dependency. The coupling lives in two places that mix detection with persistence:

```
ai_providers/openvino.py   ──imports──►  database  (get_connection, get_file_by_id, save_ai_analysis)
routers/thumbnails_api.py  ──imports──►  database  (same three)
                           ──imports──►  yolo_detect
```

Both do the same three steps: **(1) DB: file_id → file_path → (2) run YOLO → (3) DB: save detections.** To extract a service, keep steps 1 & 3 in the main app and move only step 2.

### What a standalone detection service needs

A minimal HTTP service would expose:

| In | Out |
|---|---|
| image (bytes or a path the service can read) + `model` + `confidence` + `excluded` | `{ objects: ["человек", …], boxes: [...] }` and/or an annotated JPEG |

It would own: `yolo_detect.py`, the YOLO-running bodies of `openvino.py` / `get_openvino_thumbnail`, `models/`, and `requirements.txt` lines `ultralytics` + `openvino`.
The main app would keep: DB access, then call the service over HTTP instead of `import openvino`.

**One cross-boundary contract to preserve:** `COCO_TO_RUSSIAN` in `yolo_detect.py` must keep producing the same Russian words — the frontend's `OBJECT_EMOJI_DEFAULTS` in [`aiHelpers.js`](../frontend/src/aiHelpers.js) maps those exact words to emoji. Change one side, change both.

---

## Notes for Docker / Home Assistant packaging

Current runtime config is **not** environment-driven — relevant before containerising:

| Config | Where it lives | Containerisation note |
|---|---|---|
| Camera IDs & paths | `backend/cameras.yaml` | Mount as a volume or template from env |
| Camera media (snapshots/videos) | UNC / local paths inside `cameras.yaml` | Must be reachable from the container (volume mount / SMB) |
| DB & all caches | `backend/*.db`, `backend/*_cache/`, `backend/models/` | Put on a persistent volume |
| Log level | hard-coded `logging.root.setLevel(...)` in `logging_setup.py` | No env override yet |
| Ports | backend `8000`, frontend `5173` (Vite proxy → `8000`) | Vite dev-proxy is dev-only; production needs a static build + reverse proxy |
| All user settings | browser `localStorage` (see [`settings.md`](settings.md)) | Per-browser — not portable with the container |

No env-var support exists today; adding it is a code change, not a docs change.
