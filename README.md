# Camera Snapshots Cleaner

Visual archive manager for surveillance camera snapshots and videos.
Dark-mode dashboard to navigate, inspect, and safely delete camera files stored on a NAS/SMB share.

---

## How to run

**First time setup:**
```powershell
npm install          # root — installs concurrently (once)
cd backend && pip install -r requirements.txt
cd compute-service && pip install -r requirements.txt
cd frontend && npm install
# Edit backend/cameras.yaml — set camera IDs, names, and paths
```

**Start frontend + backend + compute-service (one command):**
```powershell
npm start
```
Frontend: http://localhost:5173 · Backend/Swagger: http://localhost:8000/docs · Compute-service: http://localhost:8001/docs  
Press **Ctrl+C** to stop all three.

The **compute-service** runs the heavy work (object detection, video thumbnails)
and is optional — see [`docs/compute-service.md`](docs/compute-service.md). It
can be disabled or moved to another machine in **Tools → Compute**.

---

**Or separately (two terminals):**

Backend:
```powershell
cd backend && uvicorn main:app --reload --port 8000
```
Compute-service:
```powershell
cd compute-service && uvicorn app:app --reload --port 8001
```
Frontend:
```powershell
cd frontend && npm run dev
```

Swagger UI at **`http://localhost:8000/docs`**

---

## Architecture

```
cameras.yaml
    │
    ▼
config.py ──► scanner.py ──► database.py  (SQLite: snapshots.db)
                                  ▲
   thumbnail pipeline ────────────┤   thumbnails / diff / diff_zoom /
                                  │   erosion / motion
   ai_providers/ ─────────────────┤   gemini · claude
   compute_client.py ─────────────┘   ──HTTP──► compute-service (:8001)
   task_runner.py (asyncio bg loop)  │              YOLO detection · video
                          routers/  (FastAPI APIRouters, grouped by area)
                                  │
                             main.py  (FastAPI :8000)
                                  │
                             Vite proxy
                                  │
                    App.jsx ── HeatmapGrid / HeatmapCell
                            └── HourViewer ── viewModes/
                            └── ToolsModal (settings, AI)
                            └── TasksScreen ── TaskCard / NewTaskModal
```

Subsystem grouping and extraction seams: [`docs/subsystems.md`](docs/subsystems.md).

---

## Documentation

| File | Description |
|------|-------------|
| [`docs/code-map.md`](docs/code-map.md) | Code map — all backend and frontend files, what each file does |
| [`docs/recipes.md`](docs/recipes.md) | Change recipes — which files to touch for cross-cutting tasks (add a view mode, AI provider, endpoint) |
| [`docs/subsystems.md`](docs/subsystems.md) | Backend grouped into subsystems: dependencies and seams |
| [`docs/compute-service.md`](docs/compute-service.md) | Optional compute-service: stateless detection + video backend, routing (off/local/remote), path remapping |
| [`docs/settings.md`](docs/settings.md) | All user settings: localStorage keys, defaults, ranges, where each is defined |
| [`docs/api.md`](docs/api.md) | All API endpoints with parameters and descriptions |
| [`docs/database.md`](docs/database.md) | SQLite schema: `files`, `thumbnails`, `ai_analysis`, `tasks` tables, cascades, data flow |
| [`docs/ai-analysis.md`](docs/ai-analysis.md) | AI analysis: Gemini, Claude & OpenVINO integration, DB schema, prompt format, icon display |
| [`docs/visualization-modes.md`](docs/visualization-modes.md) | All 12 view modes: Normal, Motion Diff, Erosion, OpenVINO Detection, etc. |
| [`docs/logging.md`](docs/logging.md) | Log levels, format, colours, how to configure |
| [`docs/deployment.md`](docs/deployment.md) | k3s deployment: Docker images, Helm chart, ArgoCD GitOps, SMB camera share, node pinning |

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
