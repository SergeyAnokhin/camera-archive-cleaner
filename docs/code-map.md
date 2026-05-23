# Code Map

Map of all project files — what each file contains and what it is responsible for.
For the *grouped* view (subsystems, dependencies, extraction seams) see [`subsystems.md`](subsystems.md).

---

## Backend (`backend/`)

| File | Role |
|---|---|
| [`main.py`](../backend/main.py) | FastAPI app factory — CORS, global exception handler, startup hook, mounts the routers. No endpoint logic |
| [`logging_setup.py`](../backend/logging_setup.py) | Logging config: ANSI colours, TRACE/DEBUG/INFO levels, custom formatter, uvicorn access filter. Configures the root logger on import |
| [`api_helpers.py`](../backend/api_helpers.py) | Shared router helpers: `fmt_range()` (log date ranges), `row_to_dict()` (stats-row → dict) |
| [`ai_pricing.py`](../backend/ai_pricing.py) | Per-million-token USD pricing tables for Gemini and Claude models |
| [`compute_client.py`](../backend/compute_client.py) | HTTP client for the optional compute-service (`detect`, `video_thumbnail`, `health`). Raises `ComputeDisabled` / `ComputeUnavailable` |
| [`compute_config.py`](../backend/compute_config.py) | Compute-service routing config — `off` / `local` / `remote`, persisted in `compute_config.json` |
| [`compute_cache.py`](../backend/compute_cache.py) | Disk-cache paths for OpenVINO bbox JPEGs and video thumbnails. `OV_THUMB_VERSION` — bump to invalidate the bbox cache |
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
| [`thumbnails_api.py`](../backend/routers/thumbnails_api.py) | `/thumbnail`, `/diff_thumbnail`, `/diff_zoom_thumbnail`, `/erosion_thumbnail`, `/motion_thumbnail`, `/openvino_thumbnail`, `/video_thumbnail`. The 4 page-context diff endpoints share `_parse_page_ids()` + `_page_thumbnail_response()` helpers |
| [`media.py`](../backend/routers/media.py) | `/media/{file_id}` — serves the original photo/video file with the correct MIME type |
| [`delete.py`](../backend/routers/delete.py) | `/delete/preview`, `/delete/confirm`, `/delete/preview_range`, `/delete/by_range`. Runs its own inline SQL (not via `database.py`) |
| [`maintenance.py`](../backend/routers/maintenance.py) | `/database`, per-type `/*_thumbnails`, `/all_thumbnails`, `/storage_info` |
| [`ai.py`](../backend/routers/ai.py) | `/gemini_analyze`, `/gemini_analyze_batch`, `/claude_analyze_batch`, `/openvino_analyze_batch`, `/openvino_analyze_range`, `/ai_analysis`, `/ai_objects_summary`. Thin layer — request models + delegation; provider logic lives in `ai_providers/` |
| [`compute.py`](../backend/routers/compute.py) | `/compute/config` (GET/PUT), `/compute/status` — routing config for the compute-service |

### AI providers (`backend/ai_providers/`)

Provider-specific image-analysis logic, called by `routers/ai.py`.

| File | Role |
|---|---|
| [`common.py`](../backend/ai_providers/common.py) | Shared helpers: load photos as PIL images, strip ``` fences + parse JSON, compute USD cost, save structured `{scene, images}` results to DB |
| [`gemini.py`](../backend/ai_providers/gemini.py) | Google Gemini — `analyze()` (free-form) and `analyze_batch()` (structured + save) |
| [`claude.py`](../backend/ai_providers/claude.py) | Anthropic Claude — `analyze_batch()` (base64 JPEG → messages API) |
| [`openvino.py`](../backend/ai_providers/openvino.py) | `analyze_batch()` / `analyze_range()` — delegates detection to the compute-service, owns the DB read/write |

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

routers/ ──► compute_client.py ──HTTP──► compute-service (:8001)
```

---

## Compute-service (`compute-service/`)

Optional stateless service for heavy compute. Full architecture: [`compute-service.md`](compute-service.md).

| File | Role |
|---|---|
| [`app.py`](../compute-service/app.py) | FastAPI app on :8001 — `/health`, `/detect`, `/video/thumbnail` |
| [`detection.py`](../compute-service/detection.py) | YOLO model loading + object detection |
| [`video.py`](../compute-service/video.py) | Video thumbnail generation (first/last frame, 2×2 grid, max-change GIF) |
| [`config.py`](../compute-service/config.py) | Path-remap config (env vars `COMPUTE_PATH_REMAP_FROM` / `_TO`) |

## Shared block (`shared/`)

Imported by both the main backend and the compute-service.

| File | Role |
|---|---|
| [`contract.py`](../shared/contract.py) | Pydantic API models: `DetectRequest`, `DetectResponse`, `VideoThumbnailRequest`; `VIDEO_THUMB_MODES` |
| [`coco_names.py`](../shared/coco_names.py) | `COCO_TO_RUSSIAN` map + `excluded_to_en()` |

---

## Frontend (`frontend/src/`)

### Root files

| File | Role |
|---|---|
| [`App.jsx`](../frontend/src/App.jsx) | Root component. Owns all state: selected camera, drill-down level (year/month/day/hour), date range, delete mode. Orchestrates level transitions |
| [`api.js`](../frontend/src/api.js) | All HTTP calls to the backend. The only file that knows API URLs |
| [`aiHelpers.js`](../frontend/src/aiHelpers.js) | AI display utilities: `OBJECT_EMOJI_DEFAULTS` (100+ label→emoji), `resolveAiIcons(str)` → `[{emoji,label}]`, `getExcludedObjects()` — reads `detection_excluded_objects` from localStorage |
| [`main.jsx`](../frontend/src/main.jsx) | React entry point. Mounts `<App />` |

### Components (`frontend/src/components/`)

| File | Role |
|---|---|
| [`HourViewer.jsx`](../frontend/src/components/HourViewer.jsx) | Hour viewer orchestrator: owns state and data loading, composes the `hour/` subcomponents. See the Hour viewer parts table below |
| [`HeatmapGrid.jsx`](../frontend/src/components/HeatmapGrid.jsx) | CSS grid of heatmap cells. Skeleton loading state |
| [`HeatmapCell.jsx`](../frontend/src/components/HeatmapCell.jsx) | Single heatmap cell: intensity colour, photo/video count badges, thumbnail strip, AI icons, tooltip. At `level='hour'` also fetches `/distribution` and shows a uniformity badge (yellow/red) |
| [`GeminiAnalysisModal.jsx`](../frontend/src/components/GeminiAnalysisModal.jsx) | Gemini AI analysis modal: scene description, objects, token/cost/time stats |
| [`ClaudeAnalysisModal.jsx`](../frontend/src/components/ClaudeAnalysisModal.jsx) | Claude AI analysis modal (same structure as Gemini) |
| [`OpenVinoAnalysisModal.jsx`](../frontend/src/components/OpenVinoAnalysisModal.jsx) | OpenVINO "Run" modal: confidence slider, per-photo object tags with emoji, ms/photo timing |
| [`DeleteConfirmModal.jsx`](../frontend/src/components/DeleteConfirmModal.jsx) | Delete confirmation modal: file list with relative paths, paired video preview |
| [`ToolsModal.jsx`](../frontend/src/components/ToolsModal.jsx) | Settings modal — thin shell: backdrop, tab bar, renders the active tab. The 6 tabs live in `tools/` (see table below) |
| [`CellSelBar.jsx`](../frontend/src/components/CellSelBar.jsx) | Heatmap cell-selection toolbar: bulk select, delete (hour level), and AI analysis across selected day/hour cells. Rendered by `App.jsx` in selection mode |
| [`navUtils.js`](../frontend/src/components/navUtils.js) | Heatmap navigation helpers: `LEVELS`, `GRID_COLS`, `dateRangeForPeriod`, `computeIntensity`, `formatBytes`, nav-state persistence |
| [`useHeatmapKeyboard.js`](../frontend/src/components/useHeatmapKeyboard.js) | Custom hook — arrow-key navigation + selection/delete shortcuts for the heatmap grid. Inactive while HourViewer is open |
| [`Header.jsx`](../frontend/src/components/Header.jsx) | Top bar: total GB / photo count / video count |
| [`CameraSelector.jsx`](../frontend/src/components/CameraSelector.jsx) | Horizontal pill buttons for camera selection |
| [`DrilldownBreadcrumb.jsx`](../frontend/src/components/DrilldownBreadcrumb.jsx) | Navigation breadcrumb: All Years / 2024 / Nov / 16 |
| [`StatsBar.jsx`](../frontend/src/components/StatsBar.jsx) | Recharts bar chart below the heatmap (size per period) |
| [`ScanButton.jsx`](../frontend/src/components/ScanButton.jsx) | Scan button, spinner, data refresh on completion |
| [`ToolsButton.jsx`](../frontend/src/components/ToolsButton.jsx) | Button that opens ToolsModal |

### Tools modal tabs (`frontend/src/components/tools/`)

`ToolsModal.jsx` is a shell; each tab is a self-contained component that reads/writes its own settings.

| File | Role |
|---|---|
| [`settingsConfig.js`](../frontend/src/components/tools/settingsConfig.js) | All Tools constants: localStorage keys, defaults, ranges, model/option lists, pricing tables |
| [`settingsIO.js`](../frontend/src/components/tools/settingsIO.js) | `exportSettingsYaml()`, `applyImportedSettings()`, `initFontSize()`/`applyFontSize()` |
| [`SliderSetting.jsx`](../frontend/src/components/tools/SliderSetting.jsx) | Reusable labelled range-slider row used across tabs |
| [`GeneralTab.jsx`](../frontend/src/components/tools/GeneralTab.jsx) | Font size, previews per cell, YAML export/import |
| [`HourViewTab.jsx`](../frontend/src/components/tools/HourViewTab.jsx) | Page size, thumb width, hover zoom, diff threshold, video preview, uniformity thresholds |
| [`DetectionTab.jsx`](../frontend/src/components/tools/DetectionTab.jsx) | OpenVINO confidence, excluded objects, emoji overrides, default-emoji reference |
| [`GoogleAiTab.jsx`](../frontend/src/components/tools/GoogleAiTab.jsx) | Gemini API key, model, structured prompt template |
| [`ClaudeAiTab.jsx`](../frontend/src/components/tools/ClaudeAiTab.jsx) | Claude API key, model |
| [`ComputeTab.jsx`](../frontend/src/components/tools/ComputeTab.jsx) | Compute-service routing: off / local / remote + URL, test-connection status |
| [`MaintenanceTab.jsx`](../frontend/src/components/tools/MaintenanceTab.jsx) | Clear database, clear all thumbnails, storage info |

### Hour viewer parts (`frontend/src/components/hour/`)

`HourViewer.jsx` is split into focused files under `hour/`.

| File | Role |
|---|---|
| [`hourUtils.js`](../frontend/src/components/hour/hourUtils.js) | localStorage keys/defaults, formatters (`formatTime`, `formatBytes`), mode-param load/save, AI request rate tracking, `computeUniformity(buckets)` → AF/SE/BC metrics + per-metric levels |
| [`PhotoCard.jsx`](../frontend/src/components/hour/PhotoCard.jsx) | Single photo card: thumbnail, fullscreen lightbox, AI icons + description overlay |
| [`VideoCard.jsx`](../frontend/src/components/hour/VideoCard.jsx) | Single video card. Default (`video_preview_mode = none`): camera icon + timestamp, no image. With a preview mode set: fetches `/video_thumbnail` and shows a JPEG or animated GIF. Opens VideoModal on click |
| [`VideoModal.jsx`](../frontend/src/components/hour/VideoModal.jsx) | Fullscreen video player: Space = play/pause, ←/→ = skip ±1/5 duration, Escape = close, download, open externally, VLC fallback |
| [`DistributionChart.jsx`](../frontend/src/components/hour/DistributionChart.jsx) | 60-bar per-minute distribution chart; click a bar to jump to its page. Shows AF/SE/BC uniformity badges (green/yellow/red) in the header |
| [`SelectionBar.jsx`](../frontend/src/components/hour/SelectionBar.jsx) | Selection-mode toolbar: select all/none, selection stats, delete |
| [`ModeSettingsPanel.jsx`](../frontend/src/components/hour/ModeSettingsPanel.jsx) | Slider panel for non-AI view modes with tunable params (e.g. motion threshold) |
| [`AiModePanel.jsx`](../frontend/src/components/hour/AiModePanel.jsx) | AI mode panel: compact 2-row layout — label+model+run on row 1, threshold (OpenVINO)/stats/emojis on row 2. Exports `AI_PROVIDER_CONFIG` |
| [`useHourKeyboard.js`](../frontend/src/components/hour/useHourKeyboard.js) | Custom hook holding all keyboard handling: peek original, browse-mode keys, selection-mode keys |
| [`useHourDelete.js`](../frontend/src/components/hour/useHourDelete.js) | Custom hook holding all delete logic: per-file/whole-page delete (preview → confirm) and whole-hour delete. Owns the delete-related state + the two `DeleteConfirmModal` data sources |

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
| [`boundingBoxesMode.js`](../frontend/src/components/viewModes/boundingBoxesMode.js) | Bounding Boxes (motion-based rectangles, not YOLO) |
| [`openvinoMode.js`](../frontend/src/components/viewModes/openvinoMode.js) | OpenVINO Detection — `isAiMode`, calls `/openvino_thumbnail` with model+confidence+excluded params |
| [`openvinoBboxMode.js`](../frontend/src/components/viewModes/openvinoBboxMode.js) | OpenVINO Boxes — same URL as openvinoMode but without `isAiMode`, reads confidence from `openvino_confidence` key |
| [`motionStackingMode.js`](../frontend/src/components/viewModes/motionStackingMode.js) | Motion Stacking (accumulated motion heatmap) |
| [`geminiMode.js`](../frontend/src/components/viewModes/geminiMode.js) | Gemini AI (icon overlay from analysis results) |
| [`claudeMode.js`](../frontend/src/components/viewModes/claudeMode.js) | Claude AI (icon overlay from analysis results) |
| [`index.js`](../frontend/src/components/viewModes/index.js) | Mode registry — `VIEW_MODES`; `getEnabledViewModes()` hides `needsCompute` modes (OpenVINO) when the compute-service is off |

### Styles

| File | What it styles | Key class prefixes |
|---|---|---|
| [`styles/variables.css`](../frontend/src/styles/variables.css) | CSS custom properties | `--font-base`, `--accent`, `--bg-*`, `--heatmap-*` |
| [`styles/global.css`](../frontend/src/styles/global.css) | Global reset, body, scrollbar | — |
| [`components/HourViewer.css`](../frontend/src/components/HourViewer.css) | HourViewer shell + shared base classes (loaded first so `hour/*.css` can override) | `.hv-root`, `.hv-header`, `.hv-grid`, `.hv-card` base, `.hv-lightbox` base, `.hv-mode-settings` base, `.hv-select-btn`, pagination |
| `components/hour/*.css` | Co-located styles, one file per `hour/` component: `PhotoCard.css`, `VideoCard.css`, `VideoModal.css`, `DistributionChart.css`, `SelectionBar.css`, `AiModePanel.css`, `ModeSettingsPanel.css` | `.hv-card-photo`/`.hv-card-ai-*`, `.hv-card-video`/`.hv-video-*`, `.hv-video-modal-*`, `.hv-dist-*`, `.hv-sbar-*`, `.hv-ai-*`, `.hv-mode-param-*` |
| [`components/ToolsModal.css`](../frontend/src/components/ToolsModal.css) | Tools modal — shared by the shell and all `tools/` tabs | `.modal-*` |
| [`components/HeatmapCell.css`](../frontend/src/components/HeatmapCell.css) | Heatmap cell | `.cell-*` |
| [`components/DeleteConfirmModal.css`](../frontend/src/components/DeleteConfirmModal.css) | Delete confirmation modal | `.dcm-*` |
| Other `*.css` beside components | Styles scoped to that one component | — |

> **Search tip:** `.hv-*` classes are split per component. Photo card / AI overlays → `hour/PhotoCard.css`; video card → `hour/VideoCard.css`; video player → `hour/VideoModal.css`; `.hv-dist-*` → `hour/DistributionChart.css`; `.hv-sbar-*` → `hour/SelectionBar.css`; `.hv-ai-*` → `hour/AiModePanel.css`. Shared base classes (`.hv-card`, `.hv-lightbox`, `.hv-mode-settings`, header, grid, pagination) stay in `HourViewer.css`.

### Frontend config files

| File | Role |
|---|---|
| [`vite.config.js`](../frontend/vite.config.js) | Vite: proxies `/api/*` → `http://localhost:8000` |
| [`package.json`](../frontend/package.json) | Dependencies: React, Recharts, Vite |
| [`index.html`](../frontend/index.html) | HTML entry point; loads MDI icons from CDN |
