# Database

SQLite database (`backend/snapshots.db`). Initialised on backend startup via [`backend/database.py`](../backend/database.py).

---

## Tables

### `files` — file index

Main table. Populated by the scanner on `/scan`. One row per file (photo or video).

| Column | Type | Description |
|---|---|---|
| `id` | INTEGER PK | Auto-increment |
| `camera_id` | TEXT | Camera ID from the `cameras` table |
| `file_type` | TEXT | `'photo'` or `'video'` |
| `file_path` | TEXT UNIQUE | Full path to the file on disk |
| `file_size` | INTEGER | File size in bytes |
| `timestamp` | TEXT | Snapshot time in ISO-8601 (from filename or mtime) |

**Indexes:**
- `idx_cam_ts` — `(camera_id, timestamp)` — for heatmap queries
- `idx_cam_type_ts` — `(camera_id, file_type, timestamp)` — for type-filtered queries

**Scan behaviour:** before each `/scan` all records for that `camera_id` are deleted, then recreated (`DELETE` + `upsert`).

---

### `thumbnails` — thumbnail cache

Stores paths to generated thumbnails (256×256 JPEG). Generated lazily on first `/thumbnail/{file_id}` request.

| Column | Type | Description |
|---|---|---|
| `id` | INTEGER PK | Auto-increment |
| `file_id` | INTEGER UNIQUE | FK → `files.id` (CASCADE DELETE) |
| `thumb_path` | TEXT | Path to thumbnail file in `thumbnails_cache/` |
| `created_at` | TEXT | Creation time (used for auto-cleanup) |

Thumbnails older than 30 days are purged automatically via `pop_old_basic_thumbnails()`. All thumbnails can be cleared manually via `DELETE /thumbnails`.

---

### `ai_analysis` — Cloud AI analysis results (Gemini / Claude only)

Results from cloud providers only (Gemini, Claude). One row per file. Re-running any provider overwrites the existing row (`ON CONFLICT(file_id) DO UPDATE`).

> **Note:** OpenVINO/YOLO results are stored in `object_detection` (separate table). Running detection and cloud AI on the same photo no longer conflicts.

| Column | Type | Description |
|---|---|---|
| `id` | INTEGER PK | Auto-increment |
| `file_id` | INTEGER UNIQUE | FK → `files.id` (CASCADE DELETE) |
| `provider` | TEXT | AI provider: `'gemini'` or `'claude'` |
| `model` | TEXT | Model name (e.g. `gemini-2.5-flash`) |
| `analyzed_at` | TEXT | Analysis timestamp |
| `scene_description` | TEXT | Scene type (street, yard, parking, etc.) |
| `image_description` | TEXT | Detailed description of what is visible in the frame |
| `objects` | TEXT | Space-separated list of detected object keywords |
| `input_tokens` | INTEGER | Input tokens consumed |
| `output_tokens` | INTEGER | Output tokens consumed |
| `cost_usd` | REAL | Estimated cost in USD |
| `elapsed_ms` | INTEGER | Analysis time in milliseconds |

**Index:** `idx_ai_analysis_file` — `(file_id)`.

---

### `object_detection` — OpenVINO / YOLO detection results

One row per photo, written by OpenVINO detection (both batch endpoint and thumbnail cache miss). Separate from `ai_analysis` so detection and cloud AI coexist for the same photo.

| Column | Type | Description |
|---|---|---|
| `id` | INTEGER PK | Auto-increment |
| `file_id` | INTEGER UNIQUE | FK → `files.id` (CASCADE DELETE) |
| `model` | TEXT | YOLO model name (`yolov8n`, `yolov8s`, `yolov8m`) |
| `objects` | TEXT | Space-separated Russian/English object words |
| `elapsed_ms` | INTEGER | Detection time in milliseconds |
| `analyzed_at` | TEXT | Detection timestamp |

**Index:** `idx_obj_det_file` — `(file_id)`.

**Migration:** on first startup after this table is added, all rows with `provider='openvino'` are moved from `ai_analysis` to `object_detection` automatically.

---

### `video_previews` — video thumbnail cache records

One row per video file; tracks which preview mode was used so stale entries can be invalidated when the mode changes.

| Column | Type | Description |
|---|---|---|
| `id` | INTEGER PK | Auto-increment |
| `file_id` | INTEGER UNIQUE | FK → `files.id` (CASCADE DELETE) |
| `mode` | TEXT | Preview mode (`first_frame`, `four_frames`, `max_change_gif`, etc.) |
| `thumb_path` | TEXT | Path to the cached thumbnail file |
| `created_at` | TEXT | Generation timestamp |

**Index:** `idx_vid_prev_file` — `(file_id)`.

---

### `tasks` — task queue

Persistent queue for long-running compute jobs (video thumbnails, OpenVINO batch detection). One row per task; status survives server restarts.

| Column | Type | Description |
|---|---|---|
| `id` | TEXT PK | UUID |
| `type` | TEXT | One of: `video_thumbnails`, `openvino`, `gemini`, `claude`, `video_convert`, `file_organizer`, `gmail_download`, `gdrive_upload` |
| `status` | TEXT | `queued` → `running` → `completed` / (`pausing` → `paused`) / `failed` / `cancelled` |
| `params` | TEXT | JSON blob — per-type keys (camera, date range, mode/model + type-specific); see [api.md → Tasks](api.md#tasks) |
| `order_index` | INTEGER | Sort order for the queue |
| `progress_current` | INTEGER | Files processed so far (saved periodically; used as resume offset) |
| `progress_total` | INTEGER | Total files in range |
| `current_file_id` | INTEGER | FK → `files(id)` — last processed file (for thumbnail preview, nullable) |
| `current_file_path` | TEXT | Path of the current file being processed |
| `speed_per_sec` | REAL | Processing rate (files/s) |
| `eta_seconds` | INTEGER | Estimated seconds remaining |
| `created_at` / `started_at` / `completed_at` | TEXT | Timestamps |
| `error_message` | TEXT | Set on failure |
| `log_tail` | TEXT | JSON array of the last N log lines (served by `GET /tasks/{id}/logs`) |
| `run_after` | TEXT | If set (ISO time), the runner skips this task until then. Used by **repeating** tasks; `PUT /tasks/{id}/run_now` clears it |

On server startup, any task left in `running`/`pausing` state is reset to `paused` so the user can resume manually.

**Repeating tasks:** when a `gmail_download` task with `repeat_every_hours > 0` completes, it re-queues itself and sets `run_after = now + N hours`; the runner picks it up again once that time passes. **Run now** (`/tasks/{id}/run_now`) clears `run_after` to execute on the next tick.

---

### `tuning_sessions` — model tuning

Standalone table for the [model tuning screen](tuning.md). One row per tuning
session. **No foreign keys to `files`** — tuning works on user-uploaded images
stored under `backend/tuning_uploads/<session_id>/`, not the camera archive.

| Column | Type | Description |
|---|---|---|
| `id` | TEXT PK | UUID |
| `name` | TEXT | User-given session name |
| `status` | TEXT | `setup` → `ready` → `running` → `done` / `failed` |
| `images` | TEXT | JSON array `[{id, name, file}]` of uploaded images |
| `ground_truth` | TEXT | JSON `{image_id: [objects]}` — the corrected reference labels |
| `benchmark_config` | TEXT | JSON `{conf_from, conf_to, iterations}` |
| `benchmark_results` | TEXT | JSON `{per_model, recommended}` (null until done) |
| `progress_current` / `progress_total` | INTEGER | Benchmark progress (detections done / total) |
| `error_message` | TEXT | Set on failure |
| `created_at` / `completed_at` | TEXT | Timestamps |

Deleting a session row also removes its `tuning_uploads/<id>/` directory (handled
in the router, not by SQLite).

---

## Cascade deletes

Deleting a row from `files` automatically removes related rows in all dependent tables (`ON DELETE CASCADE`).

```
files
  ├── thumbnails       (CASCADE DELETE)
  ├── ai_analysis      (CASCADE DELETE)
  ├── object_detection (CASCADE DELETE)
  └── video_previews   (CASCADE DELETE)
```

---

## Data flow

```
/scan (POST)
    │
    ▼
scanner.py ──► upsert_file() ──► files
                                    │
/thumbnail/{id} (GET)               │
    │                               │
    ▼                               │
thumbnails.py ──► save_thumbnail_path() ──► thumbnails
                                    │
/gemini_analyze_batch (POST)        │
/claude_analyze_batch (POST)        │
    │                               │
    ▼                               │
AI provider ──► save_ai_analysis() ──► ai_analysis (Gemini/Claude only)

/openvino_analyze_batch (POST)      │
/openvino_thumbnail/{id} (GET)      │
    │                               │
    ▼                               │
openvino.py ──► save_object_detection() ──► object_detection

/video_thumbnail/{id} (GET)         │
task_runner.py (video_thumbnails)   │
    │                               │
    ▼                               │
thumbnails_api.py ──► save_video_preview() ──► video_previews
```

`/ai_analysis?file_ids=…` returns a **merged** response — one entry per file combining both tables: `{file_id, detection: {model, objects, analyzed_at}|null, ai: {provider, model, ...}|null}`.
