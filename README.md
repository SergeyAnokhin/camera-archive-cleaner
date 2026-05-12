# Camera Snapshots Cleaner

Visual archive manager for surveillance camera snapshots and videos.
Dark-mode dashboard to navigate, inspect, and safely delete camera files stored on a NAS/SMB share.

---

## Roadmap

| Stage | Status | Description |
|-------|--------|-------------|
| 1 — Backend | ✅ Done | FastAPI + SQLite, `/scan`, `/stats`, YAML config |
| 2 — Frontend | ✅ Done | React dark-mode dashboard, heatmap drill-down (year → month → day → hour) |
| 3 — Thumbnails & Viewer | ✅ Done | On-demand previews, HourViewer with pagination, distribution chart, hover zoom |
| 4 — Delete | ⬜ | Safe synchronized deletion of photos + paired videos |

---

## How to run

**Backend** (terminal 1):
```powershell
cd backend
pip install -r requirements.txt
# Edit cameras.yaml — set camera IDs, names, and paths (local or UNC \\server\share\...)
uvicorn main:app --reload --port 8000
```

**Frontend** (terminal 2):
```powershell
cd frontend
npm install
npm run dev
# Open http://localhost:5173
```

Swagger UI at **`http://localhost:8000/docs`**

---

## Stage 1 — Backend Foundation

| File | Purpose |
|------|---------|
| `backend/cameras.yaml` | Camera config — IDs, names, paths to snapshot and video directories |
| `backend/config.py` | YAML parser → `Camera` dataclass |
| `backend/scanner.py` | Directory walker; extracts timestamps from filenames, falls back to mtime |
| `backend/database.py` | SQLite schema, upsert, aggregation queries |
| `backend/main.py` | FastAPI app — endpoints below |
| `backend/requirements.txt` | `fastapi uvicorn[standard] pyyaml Pillow` |

### API endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/cameras` | List configured cameras (IDs + names) |
| `POST` | `/scan` | Scan directories, write metadata to SQLite. Optional `?camera_id=` to scan one camera. Clears existing records for that camera before rescanning. |
| `GET` | `/stats` | Aggregated stats. `group_by`: total / camera / year / month / day / **hour**. Optional `camera_id`, `date_from`, `date_to`. |

### Database

SQLite (`backend/snapshots.db`). Table `files`:

```
id, camera_id, file_type (photo|video), file_path, file_size, timestamp (ISO-8601)
```

Table `thumbnails` (added in Stage 3):

```
id, file_id → files.id (CASCADE DELETE), thumb_path
```

Indexes on `(camera_id, timestamp)` and `(camera_id, file_type, timestamp)` for fast heatmap queries.

### Filename timestamp patterns supported

| Pattern | Example |
|---------|---------|
| Foscam snapshots | `MDAlarm_20231127-200442.jpg` |
| Foscam records | `alarm_20231127_200437.mkv` |

Falls back to file `mtime` if no pattern matches.

### Scan behaviour

- **Clear before rescan:** each scan deletes all existing DB records for that `camera_id`, then re-indexes from disk.
- **Progress logging:** every 1 000 files processed a log line appears in the backend console.
- **Inaccessible directory:** logs a `WARNING` and moves on — the scan doesn't crash.

### cameras.yaml format

```yaml
cameras:
  - id: "foscam_for_testing"
    name: "Foscam for testing"
    path_snapshots: "C:\\path\\to\\local\\snap"
    path_videos:    "C:\\path\\to\\local\\record"
  - id: "foscam_fi9805w"
    name: "Foscam FI9805W"
    path_snapshots: "\\\\192.168.1.99\\Camera\\Foscam\\snap"
    path_videos:    "\\\\192.168.1.99\\Camera\\Foscam\\record"
```

Paths can be local Windows paths or UNC shares (`\\server\share\...`). SMB mounting is handled by the OS.

---

## Stage 2 — Frontend

| File | Purpose |
|------|---------|
| `frontend/index.html` | Entry point; loads MDI icon font from CDN |
| `frontend/vite.config.js` | Vite config; proxies `/api/*` → `http://localhost:8000` |
| `frontend/src/api.js` | All backend calls |
| `frontend/src/App.jsx` | Root component; owns all state and drill-down logic |
| `frontend/src/styles/variables.css` | CSS custom properties — Home Assistant dark palette + heatmap intensity scale |
| `frontend/src/components/Header.jsx` | Sticky top bar with total GB / photo count / video count |
| `frontend/src/components/CameraSelector.jsx` | Horizontal pill buttons to filter by camera |
| `frontend/src/components/DrilldownBreadcrumb.jsx` | Navigation path: All Years / 2024 / Nov / 16 |
| `frontend/src/components/HeatmapGrid.jsx` | CSS grid of colored cells; skeleton loading state |
| `frontend/src/components/HeatmapCell.jsx` | Single cell — color intensity, tooltip, corner count badges, thumbnail strip |
| `frontend/src/components/StatsBar.jsx` | Recharts bar chart below the heatmap (size per period) |
| `frontend/src/components/ScanButton.jsx` | Triggers `/scan`, shows spinner, refreshes data on completion |
| `frontend/src/components/ToolsModal.jsx` | Settings modal (font size, preview counts, zoom, clear actions) |

### Drill-down navigation

```
All Years  →  Months (within a year)  →  Days (within a month)  →  Hours (within a day)  →  HourViewer
```

Each level calls `GET /stats?group_by={year|month|day|hour}` with appropriate `date_from`/`date_to`. Color intensity (0–9 blue steps) is computed relative to the maximum value visible in the current view.

### Design

- Dark theme matching Home Assistant: `#111827` background, `#1f2937` cards, `#0ea5e9` accent blue
- MDI icons via `@mdi/font` CDN
- Recharts for the bar chart; no other UI library

---

## Stage 3 — Thumbnails & Archive Viewer

### New backend files

| File | Purpose |
|------|---------|
| `backend/thumbnails.py` | Pillow-based thumbnail generator. Opens source image → `thumbnail(256×256)` → saves JPEG to `thumbnails_cache/`. Returns cached path on repeat calls. |

### New & updated API endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/files` | Paginated chronological file list for a time range. Params: `camera_id`, `date_from`, `date_to`, `page`, `page_size`. |
| `GET` | `/thumbnail/{file_id}` | Returns a JPEG thumbnail for a photo, generating and caching it on first request. |
| `GET` | `/media/{file_id}` | Serves the original file (photo or video) with the correct MIME type. Used for full-size photo lightbox and video playback. |
| `GET` | `/previews` | Returns up to N uniformly-sampled photo `file_id`s for a time range. Used to populate thumbnail strips inside heatmap cells. |
| `GET` | `/distribution` | Returns per-minute file counts (60 buckets) for a time range. Used by the HourViewer distribution chart. |
| `DELETE` | `/thumbnails` | Deletes all cached thumbnail files from disk and clears the `thumbnails` DB table. |

### Uniform sampling algorithm

When requesting N representative photos from a period containing M total photos:

```python
# Returns N evenly-spaced indices across the sorted file list
indices = [round(M * (2*i + 1) / (2*N)) for i in range(N)]
```

If `M ≤ N`, all photos are returned.

### New frontend components

**`HourViewer.jsx`** — opens when clicking on an hour cell. Contains:

- **Header** with back button, hour label, inline pagination controls (`‹‹ ‹ N/M › ››`), and total file count
- **Distribution chart** — 60 vertical bars (one per minute of the hour), all loaded for the full hour regardless of current page. A sliding highlight rectangle shows which minutes are visible on the current page. Clicking anywhere on the chart jumps to the corresponding page.
- **File grid** — `auto-fill minmax(140px)` CSS grid
  - Photos: thumbnail image with hover zoom (configurable scale, spring easing); click opens full-size lightbox
  - Videos: MDI icon card; click opens a modal with HTML5 player + "Open externally" + "Download" buttons (for formats like MKV that browsers can't decode natively)
- **No bottom pagination** — all navigation via the header controls or the distribution chart

### Heatmap cell enhancements

- **Corner count badges**: photo count (top-left, `🖼 n`) and video count (top-right, `🎬 n`). Counts ≥ 1 000 are abbreviated: `1.7k`, `10k`.
- **Thumbnail strip**: up to N uniformly-sampled photo thumbnails shown inside each cell at year/month/day/hour level. N is configurable. Each thumbnail has rounded corners and a subtle accent-blue border.

### Settings (Tools modal)

| Setting | Key | Default | Description |
|---------|-----|---------|-------------|
| Font size | `font-base` | 15 px | Global font size slider (12–22 px) |
| Previews per cell | `previews_per_cell` | 3 | Thumbnails inside each heatmap cell (0 = disabled, max 10) |
| Hour view page size | `hour_page_size` | 50 | Files per page in HourViewer (10–200) |
| Hover zoom | `hover_zoom` | 1.5× | Photo zoom on mouse hover in HourViewer (1× = disabled, max 3×) |

All settings persist to `localStorage` and take effect immediately via `CustomEvent` dispatch.

---

## Real data tested

| Camera | Local ID | Files | Size |
|--------|----------|-------|------|
| Foscam FI9805W (local copy) | `foscam_for_testing` | 1 705 | 2.68 GB |
| Foscam FI9805W (SMB / NAS) | `foscam_fi9805w` | scanned on demand | — |
| Foscam Hut (SMB / NAS) | `foscamHut` | scanned on demand | — |

---

## Architecture

```
cameras.yaml
    │
    ▼
config.py ──► scanner.py ──► database.py (SQLite: snapshots.db)
                                  │
                                  ▼
                        thumbnails.py (Pillow cache)
                                  │
                             main.py (FastAPI :8000)
                                  │
              ┌──────────┬────────┼────────────┬────────────┐
           /cameras   /scan   /stats        /files      /thumbnail
                                          /previews   /distribution
                                          /media
                                  ▲
                             Vite proxy
                                  │
                    ┌─────────────┴──────────────────┐
                 App.jsx                        HourViewer.jsx
              HeatmapGrid / HeatmapCell         DistributionChart
              ToolsModal (settings)             PhotoCard / VideoCard
```
