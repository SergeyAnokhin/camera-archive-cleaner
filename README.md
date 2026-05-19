# Camera Snapshots Cleaner

Visual archive manager for surveillance camera snapshots and videos.
Dark-mode dashboard to navigate, inspect, and safely delete camera files stored on a NAS/SMB share.

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

## Architecture

```
cameras.yaml
    │
    ▼
config.py ──► scanner.py ──► database.py (SQLite: snapshots.db)
                                  │
                    thumbnails.py / diff_thumbnails.py
                    erosion_thumbnails.py / motion_thumbnails.py
                    diff_zoom_thumbnails.py
                                  │
                             main.py (FastAPI :8000)
                                  │
                             Vite proxy
                                  │
                    App.jsx ── HeatmapGrid / HeatmapCell
                            └── HourViewer ── viewModes/
                            └── ToolsModal (settings, AI)
```

---

## Documentation

| File | Description |
|------|-------------|
| [`docs/code-map.md`](docs/code-map.md) | Code map — all backend and frontend files, what each file does |
| [`docs/api.md`](docs/api.md) | All API endpoints with parameters and descriptions |
| [`docs/database.md`](docs/database.md) | SQLite schema: `files`, `thumbnails`, `ai_analysis` tables, cascades, data flow |
| [`docs/ai-analysis.md`](docs/ai-analysis.md) | AI analysis: Gemini & Claude integration, DB schema, prompt format, icon display |
| [`docs/visualization-modes.md`](docs/visualization-modes.md) | All 9 view modes: Normal, Motion Diff, Erosion, etc. |
| [`docs/logging.md`](docs/logging.md) | Log levels, format, colours, how to configure |

---

## cameras.yaml format

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

Paths can be local Windows paths or UNC shares (`\\server\share\...`).

---

## Filename timestamp patterns supported

| Pattern | Example |
|---------|---------|
| Foscam snapshots | `MDAlarm_20231127-200442.jpg` |
| Foscam records | `alarm_20231127_200437.mkv` |

Falls back to file `mtime` if no pattern matches.
