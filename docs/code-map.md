# Code Map

Map of all project files — what each file contains and what it is responsible for.

---

## Backend (`backend/`)

| File | Role |
|---|---|
| [`main.py`](../backend/main.py) | FastAPI app factory — CORS, global exception handler, startup hook, mounts the routers. No endpoint logic |
| [`logging_setup.py`](../backend/logging_setup.py) | Logging config: ANSI colours, TRACE/DEBUG/INFO levels, custom formatter, uvicorn access filter. Configures the root logger on import |
| [`api_helpers.py`](../backend/api_helpers.py) | Shared router helpers: `fmt_range()` (log date ranges), `row_to_dict()` (stats-row → dict) |
| [`ai_pricing.py`](../backend/ai_pricing.py) | Per-million-token USD pricing tables for Gemini and Claude models |
| [`yolo_detect.py`](../backend/yolo_detect.py) | Local YOLO/OpenVINO detection: lazy model loading, COCO→Russian names, OpenVINO thumbnail cache paths |
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

### Backend routers (`backend/routers/`)

Each file is a FastAPI `APIRouter` grouping endpoints by responsibility. All routers are mounted in `main.py`.

| File | Endpoints |
|---|---|
| [`catalog.py`](../backend/routers/catalog.py) | `/cameras`, `/scan` |
| [`stats.py`](../backend/routers/stats.py) | `/stats`, `/files`, `/distribution`, `/previews` |
| [`thumbnails_api.py`](../backend/routers/thumbnails_api.py) | `/thumbnail`, `/diff_thumbnail`, `/diff_zoom_thumbnail`, `/erosion_thumbnail`, `/motion_thumbnail`, `/openvino_thumbnail`, `/media` |
| [`delete.py`](../backend/routers/delete.py) | `/delete/preview`, `/delete/confirm`, `/delete/preview_range`, `/delete/by_range` |
| [`maintenance.py`](../backend/routers/maintenance.py) | `/database`, per-type `/*_thumbnails`, `/all_thumbnails`, `/storage_info` |
| [`ai.py`](../backend/routers/ai.py) | `/gemini_analyze`, `/gemini_analyze_batch`, `/claude_analyze_batch`, `/openvino_analyze_batch`, `/openvino_analyze_range`, `/ai_analysis`, `/ai_objects_summary` |

### Backend dependency graph

```
cameras.yaml
    │
    ▼
config.py ──► scanner.py ──► database.py
                                  ▲
thumbnails.py ───────────────────┤
diff_thumbnails.py ──────────────┤  (all called from routers/)
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
| [`HourViewer.jsx`](../frontend/src/components/HourViewer.jsx) | Hour viewer orchestrator: owns state and data loading, composes the `hour/` subcomponents. See the Hour viewer parts table below |
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

### Hour viewer parts (`frontend/src/components/hour/`)

`HourViewer.jsx` is split into focused files under `hour/`.

| File | Role |
|---|---|
| [`hourUtils.js`](../frontend/src/components/hour/hourUtils.js) | localStorage keys/defaults, formatters (`formatTime`, `formatBytes`), mode-param load/save, AI request rate tracking |
| [`PhotoCard.jsx`](../frontend/src/components/hour/PhotoCard.jsx) | Single photo card: thumbnail, fullscreen lightbox, AI icons + description overlay |
| [`VideoCard.jsx`](../frontend/src/components/hour/VideoCard.jsx) | Single video card; opens VideoModal on click |
| [`VideoModal.jsx`](../frontend/src/components/hour/VideoModal.jsx) | Fullscreen video player: download, open externally, VLC fallback for unsupported formats |
| [`DistributionChart.jsx`](../frontend/src/components/hour/DistributionChart.jsx) | 60-bar per-minute distribution chart; click a bar to jump to its page |
| [`SelectionBar.jsx`](../frontend/src/components/hour/SelectionBar.jsx) | Selection-mode toolbar: select all/none, selection stats, delete |
| [`ModeSettingsPanel.jsx`](../frontend/src/components/hour/ModeSettingsPanel.jsx) | Slider panel for non-AI view modes with tunable params (e.g. motion threshold) |
| [`AiModePanel.jsx`](../frontend/src/components/hour/AiModePanel.jsx) | AI mode panel: provider/model selectors, run button, request stats (`AI_PROVIDER_CONFIG`) |
| [`useHourKeyboard.js`](../frontend/src/components/hour/useHourKeyboard.js) | Custom hook holding all keyboard handling: peek original, browse-mode keys, selection-mode keys |

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
