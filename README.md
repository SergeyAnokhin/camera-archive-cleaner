# Camera Snapshots Cleaner

Visual archive manager for surveillance camera snapshots and videos.
Dark-mode dashboard to navigate, inspect, and safely delete camera files stored on a NAS/SMB share.

---

## Roadmap

| Stage | Status | Description |
|-------|--------|-------------|
| 1 — Backend | ✅ Done | FastAPI + SQLite, `/scan`, `/stats`, YAML config |
| 2 — Frontend | ✅ Done | React dark-mode dashboard, heatmap drill-down (year → month → day → hour) |
| 3 — Thumbnails | ⬜ | On-demand thumbnail generation and cache |
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
| `backend/requirements.txt` | `fastapi uvicorn[standard] pyyaml` |

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

Indexes on `(camera_id, timestamp)` and `(camera_id, file_type, timestamp)` for fast heatmap queries.

### Filename timestamp patterns supported

| Pattern | Example |
|---------|---------|
| Foscam snapshots | `MDAlarm_20231127-200442.jpg` |
| Foscam records | `alarm_20231127_200437.mkv` |

Falls back to file `mtime` if no pattern matches.

### Scan behaviour

- **Clear before rescan:** each scan deletes all existing DB records for that `camera_id`, then re-indexes from disk. This ensures renamed cameras, re-pathed cameras, or a camera moved from local to SMB all get clean data.
- **Progress logging:** every 1 000 files processed a log line appears in the backend console, e.g. `[foscam_fi9805w] photos processed: 1000`.
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
| `frontend/src/api.js` | All backend calls (`getCameras`, `triggerScan`, `getStatsTotal`, `getStatsGrouped`) |
| `frontend/src/App.jsx` | Root component; owns all state and drill-down logic |
| `frontend/src/styles/variables.css` | CSS custom properties — Home Assistant dark palette + heatmap intensity scale |
| `frontend/src/components/Header.jsx` | Sticky top bar with total GB / photo count / video count |
| `frontend/src/components/CameraSelector.jsx` | Horizontal pill buttons to filter by camera |
| `frontend/src/components/DrilldownBreadcrumb.jsx` | Navigation path: All Years / 2024 / Nov / 16 |
| `frontend/src/components/HeatmapGrid.jsx` | CSS grid of colored cells; skeleton loading state |
| `frontend/src/components/HeatmapCell.jsx` | Single cell — color intensity from `--heat-0` to `--heat-9`; tooltip with size + counts |
| `frontend/src/components/StatsBar.jsx` | Recharts bar chart below the heatmap (size per period) |
| `frontend/src/components/ScanButton.jsx` | Triggers `/scan`, shows spinner, refreshes data on completion |

### Drill-down navigation

```
All Years  →  Months (within a year)  →  Days (within a month)  →  Hours (within a day)
```

Each level calls `GET /stats?group_by={year|month|day|hour}` with appropriate `date_from`/`date_to`. Color intensity (0–9 blue steps) is computed relative to the maximum value visible in the current view.

### Design

- Dark theme matching Home Assistant: `#111827` background, `#1f2937` cards, `#0ea5e9` accent blue
- MDI icons (`mdi-cctv`, `mdi-database`, `mdi-camera`, `mdi-video`, etc.) via `@mdi/font`
- Recharts for the bar chart; no other UI library

---

## Real data tested

| Camera | Local ID | Files | Size |
|--------|----------|-------|------|
| Foscam FI9805W (local copy) | `foscam_for_testing` | 1 705 | 2.68 GB |
| Foscam FI9805W (SMB / NAS) | `foscam_fi9805w` | scanned on demand | — |

Archive spans: November 2023 and November 2024.

---

## Architecture

```
cameras.yaml
    │
    ▼
config.py ──► scanner.py ──► database.py (SQLite: snapshots.db)
                                  │
                                  ▼
                             main.py (FastAPI :8000)
                                  │
                    ┌─────────────┼──────────────┐
               /cameras        /scan           /stats
                                  ▲
                             Vite proxy
                                  │
                        frontend (:5173)
                        App.jsx / HeatmapGrid / ...
```
