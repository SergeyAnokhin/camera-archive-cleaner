# Database

SQLite database (`backend/snapshots.db`). Initialised on backend startup via [`backend/database.py`](../backend/database.py).

---

## Tables

### `files` — file index

Main table. Populated by the scanner on `/scan`. One row per file (photo or video).

| Column | Type | Description |
|---|---|---|
| `id` | INTEGER PK | Auto-increment |
| `camera_id` | TEXT | Camera ID from `cameras.yaml` |
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

### `ai_analysis` — AI analysis results

Results from all three AI providers (Gemini, Claude, OpenVINO). One row per file. Re-running any provider overwrites the existing row (`ON CONFLICT(file_id) DO UPDATE`).

| Column | Type | Description |
|---|---|---|
| `id` | INTEGER PK | Auto-increment |
| `file_id` | INTEGER UNIQUE | FK → `files.id` (CASCADE DELETE) |
| `provider` | TEXT | AI provider: `'gemini'`, `'claude'`, or `'openvino'` |
| `model` | TEXT | Model name (e.g. `gemini-2.5-flash`, `yolov8n`) |
| `analyzed_at` | TEXT | Analysis timestamp |
| `scene_description` | TEXT | Scene type (street, yard, parking, etc.). Empty for OpenVINO |
| `image_description` | TEXT | Detailed description of what is visible in the frame. Empty for OpenVINO |
| `objects` | TEXT | Space-separated list of detected object keywords |

**Index:** `idx_ai_analysis_file` — `(file_id)`.

---

## Cascade deletes

Deleting a row from `files` automatically removes related rows in `thumbnails` and `ai_analysis` (`ON DELETE CASCADE`).

```
files
  ├── thumbnails   (CASCADE DELETE)
  └── ai_analysis  (CASCADE DELETE)
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
/openvino_analyze_batch (POST)      │
/openvino_thumbnail/{id} (GET)      │
    │                               │
    ▼                               │
AI provider ──► save_ai_analysis() ──► ai_analysis
```

Cloud providers (Gemini/Claude) reach `ai_analysis` via the `ai_providers/` package; OpenVINO writes there both from `ai_providers/openvino.py` and as a side effect of the `/openvino_thumbnail` endpoint on cache miss.
