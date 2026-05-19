# API Reference

FastAPI backend on port `8000`. Swagger UI: `http://localhost:8000/docs`.

All filter parameters (`camera_id`, `date_from`, `date_to`) are optional — omitting them covers all cameras and all time.

---

## Cameras & scanning

| Method | Path | Description |
|---|---|---|
| `GET` | `/cameras` | List cameras from `cameras.yaml` — id, name, paths |
| `POST` | `/scan` | Scan directories and update the DB. `?camera_id=` scans one camera; omit to scan all |

---

## Statistics

| Method | Path | Description |
|---|---|---|
| `GET` | `/stats` | Aggregated stats. `group_by`: `total` / `camera` / `year` / `month` / `day` / `hour`. Optional: `camera_id`, `date_from`, `date_to` |
| `GET` | `/distribution` | 60 buckets (one per minute) for a date range. Used by HourViewer distribution chart |

---

## Files & previews

| Method | Path | Description |
|---|---|---|
| `GET` | `/files` | Paginated file list. Params: `camera_id`, `date_from`, `date_to`, `page`, `page_size` |
| `GET` | `/previews` | N uniformly-sampled photo `file_id`s for a period. Used to populate thumbnail strips in heatmap cells |
| `GET` | `/media/{file_id}` | Serve the original file (photo or video) with the correct MIME type |

---

## Thumbnails

All thumbnail endpoints generate and cache on first request.

| Method | Path | Description |
|---|---|---|
| `GET` | `/thumbnail/{file_id}` | Basic 256×256 JPEG thumbnail |
| `GET` | `/diff_thumbnail/{file_id}` | Motion Diff: delta from page mean. Params: `page_ids` (comma-separated), `threshold` (0–255, default 20) |
| `GET` | `/diff_zoom_thumbnail/{file_id}` | Diff Zoom: crop to the most active 1/9 tile. Same params |
| `GET` | `/erosion_thumbnail/{file_id}` | Erosion/MOG2: morphological erosion. Same params |
| `GET` | `/motion_thumbnail/{file_id}` | One of 4 motion modes: `neon_mask` / `mhi` / `bounding_boxes` / `motion_stacking`. Params: `page_ids`, `threshold`, `mode` |

---

## Deletion

| Method | Path | Request body | Description |
|---|---|---|---|
| `POST` | `/delete/preview` | `{"file_ids": [...]}` | Preview: selected files + auto-matched paired videos (±5 s) |
| `POST` | `/delete/confirm` | `{"file_ids": [...]}` | Physically delete files from disk and DB. Also removes thumbnails |
| `POST` | `/delete/preview_range` | `{"camera_id": ..., "date_from": ..., "date_to": ...}` | Preview all files in a date range |
| `POST` | `/delete/by_range` | same fields | Delete all files in a date range |

---

## AI analysis

| Method | Path | Description |
|---|---|---|
| `POST` | `/gemini_analyze` | Analyse images with Gemini — free-text response. Body: `file_ids`, `prompt`, `model`, `api_key` |
| `POST` | `/gemini_analyze_batch` | Gemini analysis with structured JSON response; results saved to `ai_analysis` table |
| `POST` | `/claude_analyze_batch` | Claude analysis with structured JSON response; results saved to `ai_analysis` table |
| `GET` | `/ai_analysis` | Fetch saved AI results. Param: `file_ids` comma-separated |
| `GET` | `/ai_objects_summary` | Unique object keywords detected by AI for a date range. Optional: `camera_id`, `date_from`, `date_to` |

---

## Maintenance

| Method | Path | Description |
|---|---|---|
| `DELETE` | `/database` | Delete all file records from DB (does not touch files on disk) |
| `DELETE` | `/thumbnails` | Delete basic thumbnails (disk + DB) |
| `DELETE` | `/diff_thumbnails` | Delete diff thumbnails |
| `DELETE` | `/erosion_thumbnails` | Delete erosion thumbnails |
| `DELETE` | `/diff_zoom_thumbnails` | Delete diff-zoom thumbnails |
| `DELETE` | `/motion_thumbnails` | Delete motion thumbnails |
| `DELETE` | `/all_thumbnails` | Delete all thumbnails of all types |
| `GET` | `/storage_info` | DB size and all thumbnail cache sizes in bytes |
