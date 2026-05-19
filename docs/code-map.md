# Code Map

Map of all project files — what each file contains and what it is responsible for.

---

## Backend (`backend/`)

| File | Role |
|---|---|
| [`main.py`](../backend/main.py) | FastAPI app. All HTTP endpoints, logging setup (ANSI colours, TRACE/DEBUG/INFO levels), CORS, startup hook |
| [`database.py`](../backend/database.py) | SQLite: table schema, all SQL queries (upsert, aggregations, pagination, AI analysis). The only file that touches the DB |
| [`scanner.py`](../backend/scanner.py) | Directory walker; parses timestamps from filenames (Foscam patterns + mtime fallback); writes to DB |
| [`config.py`](../backend/config.py) | Parses `cameras.yaml` → `Camera` dataclass (id, name, path_snapshots, path_videos) |
| [`thumbnails.py`](../backend/thumbnails.py) | Basic 256×256 JPEG thumbnails (Pillow). Cache in `thumbnails_cache/`. Used by `/thumbnail/{id}` |
| [`diff_thumbnails.py`](../backend/diff_thumbnails.py) | Motion Diff thumbnails: per-pixel delta from page mean (numpy). Cache in `diff_thumbnails_cache/` |
| [`erosion_thumbnails.py`](../backend/erosion_thumbnails.py) | Erosion thumbnails: MOG2 + morphological erosion. Cache in `erosion_thumbnails_cache/` |
| [`motion_thumbnails.py`](../backend/motion_thumbnails.py) | Thumbnails for 4 motion modes: neon_mask, mhi, bounding_boxes, motion_stacking. Cache in `motion_thumbnails_cache/` |
| [`diff_zoom_thumbnails.py`](../backend/diff_zoom_thumbnails.py) | Diff Zoom thumbnails: crop to most active 1/9 tile. Cache in `diff_zoom_thumbnails_cache/` |
| `cameras.yaml` | Camera config. Edit manually before running |
| `snapshots.db` | SQLite database (auto-created on startup) |

### Backend dependency graph

```
cameras.yaml
    │
    ▼
config.py ──► scanner.py ──► database.py
                                  ▲
thumbnails.py ───────────────────┤
diff_thumbnails.py ──────────────┤  (all called from main.py)
erosion_thumbnails.py ───────────┤
motion_thumbnails.py ────────────┤
diff_zoom_thumbnails.py ─────────┘
```

---

## Frontend (`frontend/src/`)

### Root files

| File | Role |
|---|---|
| [`App.jsx`](../frontend/src/App.jsx) | Root component. Owns all state: selected camera, drill-down level (year/month/day/hour), date range, delete mode. Orchestrates level transitions |
| [`api.js`](../frontend/src/api.js) | All HTTP calls to the backend. The only file that knows API URLs |
| [`aiHelpers.js`](../frontend/src/aiHelpers.js) | AI mode utilities: `AI_ICON_MAP`, `resolveAiIcons()` — maps object keywords to MDI icons |
| [`main.jsx`](../frontend/src/main.jsx) | React entry point. Mounts `<App />` |

### Components (`frontend/src/components/`)

| File | Role |
|---|---|
| [`HourViewer.jsx`](../frontend/src/components/HourViewer.jsx) | Hour viewer: photo/video grid with pagination, distribution chart (60 minute bars), keyboard navigation, AI analysis button |
| [`HeatmapGrid.jsx`](../frontend/src/components/HeatmapGrid.jsx) | CSS grid of heatmap cells. Skeleton loading state |
| [`HeatmapCell.jsx`](../frontend/src/components/HeatmapCell.jsx) | Single heatmap cell: intensity colour, photo/video count badges, thumbnail strip, AI icons, tooltip |
| [`GeminiAnalysisModal.jsx`](../frontend/src/components/GeminiAnalysisModal.jsx) | Gemini AI analysis modal: scene description, objects, token/cost/time stats |
| [`ClaudeAnalysisModal.jsx`](../frontend/src/components/ClaudeAnalysisModal.jsx) | Claude AI analysis modal (same structure as Gemini) |
| [`DeleteConfirmModal.jsx`](../frontend/src/components/DeleteConfirmModal.jsx) | Delete confirmation modal: file list with relative paths, paired video preview |
| [`ToolsModal.jsx`](../frontend/src/components/ToolsModal.jsx) | Settings modal (tabs): font size, previews per cell, zoom, cache clearing, Google AI / Claude AI config |
| [`Header.jsx`](../frontend/src/components/Header.jsx) | Top bar: total GB / photo count / video count |
| [`CameraSelector.jsx`](../frontend/src/components/CameraSelector.jsx) | Horizontal pill buttons for camera selection |
| [`DrilldownBreadcrumb.jsx`](../frontend/src/components/DrilldownBreadcrumb.jsx) | Navigation breadcrumb: All Years / 2024 / Nov / 16 |
| [`StatsBar.jsx`](../frontend/src/components/StatsBar.jsx) | Recharts bar chart below the heatmap (size per period) |
| [`ScanButton.jsx`](../frontend/src/components/ScanButton.jsx) | Scan button, spinner, data refresh on completion |
| [`ToolsButton.jsx`](../frontend/src/components/ToolsButton.jsx) | Button that opens ToolsModal |

### View modes (`frontend/src/components/viewModes/`)

Each file is one visualization mode. Exports a function that takes `file_id` and returns a thumbnail URL.

| File | Mode |
|---|---|
| [`normalMode.js`](../frontend/src/components/viewModes/normalMode.js) | Normal (basic thumbnail) |
| [`motionDiffMode.js`](../frontend/src/components/viewModes/motionDiffMode.js) | Motion Diff (per-pixel delta from page mean) |
| [`diffZoomMode.js`](../frontend/src/components/viewModes/diffZoomMode.js) | Diff Zoom (crop to motion area) |
| [`erosionMode.js`](../frontend/src/components/viewModes/erosionMode.js) | Erosion (morphological erosion) |
| [`neonMaskMode.js`](../frontend/src/components/viewModes/neonMaskMode.js) | Neon Mask (MOG2 mask in colour) |
| [`mhiMode.js`](../frontend/src/components/viewModes/mhiMode.js) | MHI — Motion History Image |
| [`boundingBoxesMode.js`](../frontend/src/components/viewModes/boundingBoxesMode.js) | Bounding Boxes (rectangles around detected objects) |
| [`motionStackingMode.js`](../frontend/src/components/viewModes/motionStackingMode.js) | Motion Stacking (accumulated motion heatmap) |
| [`geminiMode.js`](../frontend/src/components/viewModes/geminiMode.js) | Gemini AI (icon overlay from analysis results) |
| [`claudeMode.js`](../frontend/src/components/viewModes/claudeMode.js) | Claude AI (icon overlay from analysis results) |
| [`index.js`](../frontend/src/components/viewModes/index.js) | Mode registry — single import point for all modes |

### Styles

| File | Role |
|---|---|
| [`styles/variables.css`](../frontend/src/styles/variables.css) | CSS custom properties: dark palette (Home Assistant), heatmap intensity scale |
| [`styles/global.css`](../frontend/src/styles/global.css) | Global styles, reset |
| `*.css` (beside components) | Per-component styles |

### Frontend config files

| File | Role |
|---|---|
| [`vite.config.js`](../frontend/vite.config.js) | Vite: proxies `/api/*` → `http://localhost:8000` |
| [`package.json`](../frontend/package.json) | Dependencies: React, Recharts, Vite |
| [`index.html`](../frontend/index.html) | HTML entry point; loads MDI icons from CDN |
