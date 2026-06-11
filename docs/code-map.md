# Code Map

Map of all project files — what each file contains and what it is responsible for.
For the *grouped* view (subsystems, dependencies, extraction seams) see [`subsystems.md`](subsystems.md).

---

## Backend (`backend/`)

| File | Role |
|---|---|
| [`main.py`](../backend/main.py) | FastAPI app factory — CORS, global exception handler, startup hook, mounts the routers. No endpoint logic |
| [`logging_setup.py`](../backend/logging_setup.py) | Logging config: ANSI colours, TRACE/DEBUG/INFO levels, custom formatter, uvicorn access filter. `RingBufferHandler` keeps last N lines in memory + flushes to `backend.log`. `configure_logging(cfg)` / `get_log_config()` / `get_log_tail(n)` — live level changes via `/logging/config` API |
| [`api_helpers.py`](../backend/api_helpers.py) | Shared router helpers: `fmt_range()` (log date ranges), `row_to_dict()` (stats-row → dict) |
| [`ai_pricing.py`](../backend/ai_pricing.py) | Per-million-token USD pricing tables for Gemini and Claude models |
| [`compute_client.py`](../backend/compute_client.py) | HTTP client for the optional compute-service (`detect`, `video_thumbnail`, `convert_video`, `health`). Strips `CAMERA_ROOT` prefix from all paths before sending (so compute can apply its own root). Raises `ComputeDisabled` / `ComputeUnavailable`. Timeouts: detect 120 s, thumbnail 120 s, convert 7200 s |
| [`compute_config.py`](../backend/compute_config.py) | Compute-service routing config — `off` / `local` / `remote`, persisted in `compute_config.json` |
| [`compute_cache.py`](../backend/compute_cache.py) | Disk-cache paths for OpenVINO bbox JPEGs and video thumbnails. `OV_THUMB_VERSION` — bump to invalidate the bbox cache |
| [`task_runner.py`](../backend/task_runner.py) | Background asyncio loop — picks queued tasks and dispatches to `task_executors/` by type (registry `EXECUTORS`). Owns global pause and stuck-task reset; per-type logic lives in the executors (see table below) |
| [`database.py`](../backend/database.py) | SQLite: table schema + migrations, all SQL queries. Tables: `files`, `thumbnails`, `ai_analysis`, `object_detection`, `video_previews`, `tasks` (has `log_tail TEXT` for video_convert/file_organizer logs), `tuning_sessions`. `append_task_log()` stores last 300 log lines per task |
| [`scanner.py`](../backend/scanner.py) | Directory walker; parses timestamps from filenames; writes to DB. `SCANNER_SKIP_DIRS = {"organized"}` — directories with this name are never indexed (used by `file_organizer` task) |
| [`config.py`](../backend/config.py) | Parses `cameras.yaml` → `Camera(id, name, path)`. `path` = `CAMERA_ROOT` env var + relative path from yaml. **When changing `Camera` fields, also update:** `routers/catalog.py` (serialises to JSON), `scanner.py` (reads `camera.path`), `compute_client.py` (strips root), `DeleteConfirmModal.jsx` (displays `camera.path`). |
| [`thumbnails.py`](../backend/thumbnails.py) | Basic 256×256 JPEG thumbnails (Pillow). Cache in `thumbnails_cache/`. Used by `/thumbnail/{id}` |
| [`diff_thumbnails.py`](../backend/diff_thumbnails.py) | Motion Diff thumbnails: per-pixel delta from page mean (numpy). Cache in `diff_thumbnails_cache/` |
| [`erosion_thumbnails.py`](../backend/erosion_thumbnails.py) | Erosion thumbnails: MOG2 + morphological erosion. Cache in `erosion_thumbnails_cache/` |
| [`motion_thumbnails.py`](../backend/motion_thumbnails.py) | Thumbnails for 4 motion modes: neon_mask, mhi, bounding_boxes, motion_stacking. Cache in `motion_thumbnails_cache/` |
| [`diff_zoom_thumbnails.py`](../backend/diff_zoom_thumbnails.py) | Diff Zoom thumbnails: crop to most active 1/9 tile. Cache in `diff_zoom_thumbnails_cache/` |
| `cameras.yaml` | **Single source of truth** for camera config. Stores relative paths (e.g. `FoscamHut`); `CAMERA_ROOT` is prepended at runtime. CI auto-injects this file into `deploy/helm/.../values.yaml` `camerasConfig` on every push — **do not edit `camerasConfig` directly**. |
| `snapshots.db` | SQLite database (auto-created on startup) |

### Task executors (`backend/task_executors/`)

One module per task type; each exposes `async run(task_id, params, resume_from)`. Registered in [`__init__.py`](../backend/task_executors/__init__.py) (`EXECUTORS` dict — add new task types there).

| File | Task type |
|---|---|
| [`common.py`](../backend/task_executors/common.py) | Shared loop helpers: `SpeedTracker`, `pause_if_requested()`, `write_progress()`, `mark_completed()`, `append_log()`, `parse_dt()` |
| [`video_thumbnails.py`](../backend/task_executors/video_thumbnails.py) | `video_thumbnails` — pre-generate video previews; also `pregen_video_thumbs_sync()` reused by openvino |
| [`openvino.py`](../backend/task_executors/openvino.py) | `openvino` — YOLO detection per photo via compute-service |
| [`ai.py`](../backend/task_executors/ai.py) | `gemini` / `claude` — per-photo cloud AI analysis with optional delays |
| [`video_convert.py`](../backend/task_executors/video_convert.py) | `video_convert` — ffmpeg re-encode via compute-service, dry-run support |
| [`file_organizer.py`](../backend/task_executors/file_organizer.py) | `file_organizer` — move files into YYYY/MM/DD folders, dry-run support |

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
| [`tasks.py`](../backend/routers/tasks.py) | `/tasks` CRUD + `/tasks/metrics` + `GET /tasks/{id}/logs` — task queue REST endpoints. `log_tail` is excluded from the list response; fetch separately via `/logs` |
| [`tuning.py`](../backend/routers/tuning.py) | `/tuning/sessions/*` — model tuning: image upload, autolabel, ground truth, background golden-section confidence search. See [`docs/tuning.md`](tuning.md) |
| [`logging_api.py`](../backend/routers/logging_api.py) | `/logging/config` (GET/PUT), `/logging/tail` — live log level + buffer control. `/logging/compute/*` — proxied equivalents for the compute-service |

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
| [`app.py`](../compute-service/app.py) | FastAPI app on :8001 — `/health`, `/detect`, `/video/thumbnail`, `/video/convert`. Also `/logging/config` (GET/PUT), `/logging/tail` — same live log-level API as the backend. `_RingBufferHandler` + `_SilentFilter` (drops `/health`/`/metrics`/`/logging` from access log) |
| [`detection.py`](../compute-service/detection.py) | YOLO model loading (lazy) + object detection. Prefers `models/<name>_openvino_model/` over `.pt` |
| [`video.py`](../compute-service/video.py) | Video thumbnail generation (first/last frame, 2×2 grid, max-change GIF) + `convert_video()` — runs ffmpeg (H.265/H.264, up to 2 h timeout) |
| [`config.py`](../compute-service/config.py) | `CAMERA_ROOT` env var (default `/camera`); `to_absolute(relative_path)` converts relative paths received from the backend to absolute. Set `CAMERA_ROOT=\\192.168.1.91\Camera` for local Windows dev. |
| [`export_models.py`](../compute-service/export_models.py) | **Build-time only** — exports yolov8n/s/m to OpenVINO IR; called by `Dockerfile RUN`, never at runtime |

## Shared block (`shared/`)

Imported by both the main backend and the compute-service.

| File | Role |
|---|---|
| [`contract.py`](../shared/contract.py) | Pydantic API models: `DetectRequest/Response`, `VideoThumbnailRequest`, `VideoConvertRequest/Response` (src_path, dst_path, codec, crf, preset); `VIDEO_THUMB_MODES` |
| [`coco_names.py`](../shared/coco_names.py) | `COCO_TO_RUSSIAN` map (23 entries used by compute-service to translate YOLO outputs) |

---

## Frontend (`frontend/src/`)

### Root files

| File | Role |
|---|---|
| [`App.jsx`](../frontend/src/App.jsx) | Root component: camera + drill-down navigation state, layout, screen switching. Cell selection / task navigation / range delete live in hooks (`useCellSelection`, `useTaskNavigation`, `useRangeDelete` in `components/`) |
| [`api.js`](../frontend/src/api.js) | Barrel re-export of `src/api/` domain modules — import from here; **add new endpoints to the matching `api/*.js` module** (see table below) |
| [`aiHelpers.js`](../frontend/src/aiHelpers.js) | AI display utilities: `resolveAiIcons(str)` → `[{emoji,label}]` — builds emoji lookup from `COCO_CLASSES` (both `en` and `ru` keys) |
| [`cocoClasses.js`](../frontend/src/cocoClasses.js) | The 80 COCO classes (`{id, en, ru, emoji}`) in class-ID order + `DETECTION_CLASSES_DEFAULT`. Source for the Detection-tab class checklist; IDs flow to YOLO's `classes=` param |
| [`prompts.js`](../frontend/src/prompts.js) | Single source of truth for all AI prompt templates: `STRUCTURED_ANALYSIS_TEMPLATE` (Gemini + Claude), `GEMINI_FREEFORM_PROMPT`, `CELL_ANALYSIS_PROMPT(n)` (heatmap batch). `{n}` = image count |
| [`main.jsx`](../frontend/src/main.jsx) | React entry point. Mounts `<App />` |

### API client (`frontend/src/api/`)

HTTP calls to the backend, split by domain. `api.js` re-exports everything, so components import from `'../api.js'`.

| File | Endpoints |
|---|---|
| [`http.js`](../frontend/src/api/http.js) | Shared helpers: `BASE`, `get`/`post`/`del`, `buildQuery`, `sendJson`/`postJson`/`putJson` |
| [`catalog.js`](../frontend/src/api/catalog.js) | `/cameras`, `/scan` |
| [`files.js`](../frontend/src/api/files.js) | `/stats`, `/files`, `/previews`, `/distribution`, thumbnail/media URL builders |
| [`maintenance.js`](../frontend/src/api/maintenance.js) | `/database`, `/*_thumbnails`, `/storage_info` |
| [`deleteApi.js`](../frontend/src/api/deleteApi.js) | `/delete/*` |
| [`analysis.js`](../frontend/src/api/analysis.js) | Gemini/Claude/OpenVINO analyze calls, `/ai_analysis*`, COCO class helpers |
| [`compute.js`](../frontend/src/api/compute.js) | `/compute/*`, `/services/status` |
| [`tasks.js`](../frontend/src/api/tasks.js) | `/tasks` CRUD, metrics, logs, `estimate_files`, `getTaskMaxErrors()` |
| [`tuning.js`](../frontend/src/api/tuning.js) | `/tuning/sessions/*` |

### Components (`frontend/src/components/`)

| File | Role |
|---|---|
| [`HourViewer.jsx`](../frontend/src/components/HourViewer.jsx) | Hour viewer orchestrator: owns state and data loading, composes the `hour/` subcomponents. See the Hour viewer parts table below |
| [`HeatmapGrid.jsx`](../frontend/src/components/HeatmapGrid.jsx) | CSS grid of heatmap cells. Skeleton loading state |
| [`HeatmapCell.jsx`](../frontend/src/components/HeatmapCell.jsx) | Single heatmap cell: intensity colour, photo/video count badges, thumbnail strip, AI icons, tooltip. At `level='hour'` also fetches `/distribution` and shows a uniformity badge (yellow/red) |
| [`GeminiAnalysisModal.jsx`](../frontend/src/components/GeminiAnalysisModal.jsx) | Gemini AI analysis modal: prompt + token/cost stats. Built on `aiModal/BaseAiModal` |
| [`ClaudeAnalysisModal.jsx`](../frontend/src/components/ClaudeAnalysisModal.jsx) | Claude AI analysis modal (same structure as Gemini). Built on `aiModal/BaseAiModal` |
| [`OpenVinoAnalysisModal.jsx`](../frontend/src/components/OpenVinoAnalysisModal.jsx) | OpenVINO "Run" modal: confidence slider, per-photo object tags with emoji, ms/photo timing. Built on `aiModal/BaseAiModal` |
| [`aiModal/BaseAiModal.jsx`](../frontend/src/components/aiModal/BaseAiModal.jsx) | Shared AI-modal shell: backdrop + Escape, header, run row, "В задачи" task submission. New AI provider modals start here |
| [`aiModal/StructuredAiResult.jsx`](../frontend/src/components/aiModal/StructuredAiResult.jsx) | `AiStatsRow` (tokens/cost/time) + `StructuredResponse` (scene/images/raw) — shared by Gemini and Claude modals |
| [`DeleteConfirmModal.jsx`](../frontend/src/components/DeleteConfirmModal.jsx) | Delete confirmation modal: file list with relative paths (strips `camera.path` prefix), paired video preview |
| [`ToolsModal.jsx`](../frontend/src/components/ToolsModal.jsx) | Settings modal — thin shell: backdrop, tab bar, renders the active tab. The 8 tabs live in `tools/` (see table below) |
| [`CellSelBar.jsx`](../frontend/src/components/CellSelBar.jsx) | Heatmap cell-selection toolbar: bulk select, delete (hour level), and AI analysis across selected day/hour cells. Rendered by `App.jsx` in selection mode |
| [`navUtils.js`](../frontend/src/components/navUtils.js) | Heatmap navigation helpers: `LEVELS`, `GRID_COLS`, `dateRangeForPeriod`, `computeIntensity`, `formatBytes`, nav-state persistence |
| [`useHeatmapKeyboard.js`](../frontend/src/components/useHeatmapKeyboard.js) | Custom hook — arrow-key navigation + selection/delete shortcuts for the heatmap grid. Inactive while HourViewer is open |
| [`useCellSelection.js`](../frontend/src/components/useCellSelection.js) | Custom hook — heatmap cell-selection state + actions: bulk hour delete, batch AI analysis, send-to-task. Feeds CellSelBar |
| [`useTaskNavigation.js`](../frontend/src/components/useTaskNavigation.js) | Custom hook — Tasks screen → heatmap/hour navigation, owns TaskResultsModal state |
| [`useRangeDelete.js`](../frontend/src/components/useRangeDelete.js) | Custom hook — date-range delete preview → confirm flow, drives DeleteConfirmModal |
| [`KeyboardHints.jsx`](../frontend/src/components/KeyboardHints.jsx) | Footer strip of keyboard shortcuts under the heatmap |
| [`Header.jsx`](../frontend/src/components/Header.jsx) | Top bar: total GB / photo count / video count |
| [`CameraSelector.jsx`](../frontend/src/components/CameraSelector.jsx) | Horizontal pill buttons for camera selection |
| [`DrilldownBreadcrumb.jsx`](../frontend/src/components/DrilldownBreadcrumb.jsx) | Navigation breadcrumb: All Years / 2024 / Nov / 16 |
| [`StatsBar.jsx`](../frontend/src/components/StatsBar.jsx) | Recharts bar chart below the heatmap (size per period) |
| [`ScanButton.jsx`](../frontend/src/components/ScanButton.jsx) | Scan button, spinner, data refresh on completion |
| [`ToolsButton.jsx`](../frontend/src/components/ToolsButton.jsx) | Button that opens ToolsModal |
| [`TasksScreen.jsx`](../frontend/src/components/TasksScreen.jsx) | Tasks screen — polls `/tasks` every 3 s, shows system metrics bar + task card list, hosts NewTaskModal |
| [`TuningScreen.jsx`](../frontend/src/components/TuningScreen.jsx) | Model tuning orchestrator: session sidebar + step switching. Steps live in `tuning/` (table below). See [`docs/tuning.md`](tuning.md) |
| [`TaskCard.jsx`](../frontend/src/components/TaskCard.jsx) | Task card: type icon, status badge, progress bar, speed/ETA, thumbnail, pause/resume/cancel buttons. Logs button (console icon) for `video_convert`/`file_organizer` types; dry-run amber tag |
| [`NewTaskModal.jsx`](../frontend/src/components/NewTaskModal.jsx) | Modal to create a task: type selector, camera/dates, AI scheduling, estimates, param assembly (`handleAdd`). Six types: `video_thumbnails`, `openvino`, `gemini`, `claude`, `video_convert`, `file_organizer`. VC/FO param panels live in `newTask/` (table below) |
| [`TaskLogsModal.jsx`](../frontend/src/components/TaskLogsModal.jsx) | Log viewer modal for `video_convert` and `file_organizer` tasks. Polls `GET /tasks/{id}/logs` every 2 s while task is active; colour-codes DRY/ERROR/Skip lines. Header has a fullscreen toggle (⛶/⊡) that expands the modal to 98 vw × 96 vh |

### Tools modal tabs (`frontend/src/components/tools/`)

`ToolsModal.jsx` is a shell; each tab is a self-contained component that reads/writes its own settings.

| File | Role |
|---|---|
| [`settingsConfig.js`](../frontend/src/components/tools/settingsConfig.js) | All Tools constants: localStorage keys, defaults, ranges, model/option lists, pricing tables |
| [`settingsIO.js`](../frontend/src/components/tools/settingsIO.js) | `exportSettingsYaml()`, `applyImportedSettings()`, `initFontSize()`/`applyFontSize()` |
| [`SliderSetting.jsx`](../frontend/src/components/tools/SliderSetting.jsx) | Reusable labelled range-slider row used across tabs |
| [`GeneralTab.jsx`](../frontend/src/components/tools/GeneralTab.jsx) | Font size (2-col layout), YAML export/import |
| [`HourViewTab.jsx`](../frontend/src/components/tools/HourViewTab.jsx) | View tab: previews per cell, thumb width, hover zoom, diff threshold, page size, burst gap, video preview, uniformity (2-col layout for sliders) |
| [`DetectionTab.jsx`](../frontend/src/components/tools/DetectionTab.jsx) | YOLO model selector (`openvino_model`), OpenVINO confidence slider, detected-classes checklist (80 COCO objects → `detection_classes`) |
| [`AiTab.jsx`](../frontend/src/components/tools/AiTab.jsx) | Combined AI tab: Google Gemini (API key, model, prompt) + Claude Anthropic (API key, model) with provider section headers |
| [`TasksTab.jsx`](../frontend/src/components/tools/TasksTab.jsx) | Task settings: ETA window, log tail lines |
| [`ComputeTab.jsx`](../frontend/src/components/tools/ComputeTab.jsx) | Compute-service routing: off / local / remote + URL, test-connection status |
| [`LoggingTab.jsx`](../frontend/src/components/tools/LoggingTab.jsx) | Dynamic log-level control for backend and compute (TRACE/DEBUG/INFO/WARNING/ERROR). Buffer size sliders, live log viewer with auto-refresh. Calls `/logging/*` and `/logging/compute/*` |
| [`MaintenanceTab.jsx`](../frontend/src/components/tools/MaintenanceTab.jsx) | Clear database, clear all thumbnails, storage info. Date-range picker (auto-filled from camera's range) — all cleanup operations filter to the selected range |

### New Task modal parts (`frontend/src/components/newTask/`)

| File | Role |
|---|---|
| [`newTaskHelpers.js`](../frontend/src/components/newTask/newTaskHelpers.js) | Date input helpers, `isAiType`/`isDbType`, `readGlobalSettings()`, `TASK_TYPES` (type-selector cards), VC codec/preset lists |
| [`VideoConvertPanel.jsx`](../frontend/src/components/newTask/VideoConvertPanel.jsx) | `video_convert` params: pattern, suffix, codec, CRF, preset |
| [`FileOrganizerPanel.jsx`](../frontend/src/components/newTask/FileOrganizerPanel.jsx) | `file_organizer` params: source, pattern, output folder, date regex |
| [`MtimeFilterSection.jsx`](../frontend/src/components/newTask/MtimeFilterSection.jsx) | Shared mtime date filter + live file-count estimate |
| [`DryRunSection.jsx`](../frontend/src/components/newTask/DryRunSection.jsx) | Shared dry-run toggle |

### Tuning screen parts (`frontend/src/components/tuning/`)

| File | Role |
|---|---|
| [`tuningShared.jsx`](../frontend/src/components/tuning/tuningShared.jsx) | Model/status constants, inline styles `S`, tiny components (`Err`, `Tag`, `ProgressBar`) |
| [`NewSessionForm.jsx`](../frontend/src/components/tuning/NewSessionForm.jsx) | Upload images + create session |
| [`GroundTruthStep.jsx`](../frontend/src/components/tuning/GroundTruthStep.jsx) | Step 1: autolabel + manual object tags per image |
| [`BenchmarkStep.jsx`](../frontend/src/components/tuning/BenchmarkStep.jsx) | Step 2: golden-section search config + progress |
| [`ResultsStep.jsx`](../frontend/src/components/tuning/ResultsStep.jsx) | Step 3: recommendation, F1/speed charts, per-model table, search trace |

### Hour viewer parts (`frontend/src/components/hour/`)

`HourViewer.jsx` is split into focused files under `hour/`.

| File | Role |
|---|---|
| [`hourUtils.js`](../frontend/src/components/hour/hourUtils.js) | localStorage keys/defaults, formatters (`formatTime`, `formatBytes`), mode-param load/save, AI request rate tracking, `computeUniformity(buckets)` → AF/SE/BC metrics + per-metric levels |
| [`PhotoCard.jsx`](../frontend/src/components/hour/PhotoCard.jsx) | Single photo card: thumbnail, fullscreen lightbox (with a **Скачать**/download button → `/media/{id}`), AI icons + description overlay |
| [`VideoCard.jsx`](../frontend/src/components/hour/VideoCard.jsx) | Single video card. Default (`video_preview_mode = none`): camera icon + timestamp, no image. With a preview mode set: fetches `/video_thumbnail` and shows a JPEG or animated GIF. Opens VideoModal on click |
| [`VideoModal.jsx`](../frontend/src/components/hour/VideoModal.jsx) | Fullscreen video player: Space = play/pause, ←/→ = skip ±1/5 duration, Escape = close, download, open externally, VLC fallback |
| [`DistributionChart.jsx`](../frontend/src/components/hour/DistributionChart.jsx) | 60-bar per-minute distribution chart; click a bar to jump to its page. Shows AF/SE/BC uniformity badges (green/yellow/red) in the header |
| [`SelectionBar.jsx`](../frontend/src/components/hour/SelectionBar.jsx) | Selection-mode toolbar: select all/none, selection stats, delete |
| [`ModeSettingsPanel.jsx`](../frontend/src/components/hour/ModeSettingsPanel.jsx) | Slider panel for non-AI view modes with tunable params (e.g. motion threshold) |
| [`AiModePanel.jsx`](../frontend/src/components/hour/AiModePanel.jsx) | AI mode panel: compact 2-row layout — label + read-only model label + run on row 1, threshold display (OpenVINO)/stats/emojis on row 2. Exports `AI_PROVIDER_CONFIG` |
| [`useHourKeyboard.js`](../frontend/src/components/hour/useHourKeyboard.js) | Custom hook holding all keyboard handling: peek original, browse-mode keys, selection-mode keys |
| [`useHourDelete.js`](../frontend/src/components/hour/useHourDelete.js) | Custom hook holding all delete logic: per-file/whole-page delete (preview → confirm) and whole-hour delete. Owns the delete-related state + the two `DeleteConfirmModal` data sources |

### View modes (`frontend/src/components/viewModes/`)

Each file is one visualization mode. Exports a function that takes `file_id` and returns a thumbnail URL.

| File | Mode |
|---|---|
| [`normalMode.js`](../frontend/src/components/viewModes/normalMode.js) | Normal (basic thumbnail) |
| [`motionDiffMode.js`](../frontend/src/components/viewModes/motionDiffMode.js) | Motion Diff (per-pixel delta from page mean) |
| [`erosionMode.js`](../frontend/src/components/viewModes/erosionMode.js) | Erosion (morphological erosion) |
| [`openvinoMode.js`](../frontend/src/components/viewModes/openvinoMode.js) | OpenVINO Detection — `isAiMode`, calls `/openvino_thumbnail` with model+confidence+classes params |
| [`geminiMode.js`](../frontend/src/components/viewModes/geminiMode.js) | Gemini AI (icon overlay from analysis results) |
| [`claudeMode.js`](../frontend/src/components/viewModes/claudeMode.js) | Claude AI (icon overlay from analysis results) |
| [`index.js`](../frontend/src/components/viewModes/index.js) | Mode registry — `VIEW_MODES`; `getEnabledViewModes()` hides `needsCompute` modes (OpenVINO) when the compute-service is off |

> The backend also serves thumbnail styles with **no frontend mode**: `/diff_zoom_thumbnail` and `/motion_thumbnail` (neon_mask, mhi, bounding_boxes, motion_stacking). Backend-only — adding a UI mode for them means creating a `viewModes/*.js` file and registering it in `index.js`.

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

---

## Deployment (k3s + ArgoCD + Helm)

Containerisation + GitOps deploy. Full architecture and rationale: [`deployment.md`](deployment.md).

| File | Role |
|---|---|
| [`backend/Dockerfile`](../backend/Dockerfile) | Backend image (:8000). Build context = repo root (needs `shared/`) |
| [`compute-service/Dockerfile`](../compute-service/Dockerfile) | Compute image (:8001). CPU-only torch; runs `export_models.py` at build time to bake all 3 OpenVINO models in. Context = repo root |
| [`frontend/Dockerfile`](../frontend/Dockerfile) | Vite build → nginx static image |
| [`frontend/nginx.conf`](../frontend/nginx.conf) | nginx: serves the SPA with `index.html` fallback (no `/api` proxy — the Ingress routes it) |
| [`.dockerignore`](../.dockerignore) | Keeps `node_modules`, caches, DB, `*.pt` out of the build context |
| [`deploy/helm/camera-cleaner/`](../deploy/helm/camera-cleaner/) | Helm chart: 3 Deployments+Services, state PVC (subPath mounts), SMB PV/PVC, cameras ConfigMap, Traefik Ingress + StripPrefix middleware. Tags in `values.yaml` are rewritten by CI |
| [`deploy/argocd/application.yaml`](../deploy/argocd/application.yaml) | ArgoCD Application — auto-sync from `deploy/helm/camera-cleaner` |
| [`.github/workflows/build.yml`](../.github/workflows/build.yml) | CI: build+push 3 images to GHCR by git SHA, `yq`-bump tags in `values.yaml`, commit back |
