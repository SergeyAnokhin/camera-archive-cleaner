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
| [`compute_config.py`](../backend/compute_config.py) | Compute-service routing config — `off` / `local` / `remote`, persisted in `compute_config.json` (path respects `DATA_DIR` env var) |
| [`compute_cache.py`](../backend/compute_cache.py) | Disk-cache paths for OpenVINO bbox JPEGs and video thumbnails. Directories placed under `DATA_DIR` env var. `OV_THUMB_VERSION` — bump to invalidate the bbox cache |
| [`task_runner.py`](../backend/task_runner.py) | Background asyncio loop — picks queued tasks and dispatches to `task_executors/` by type (registry `EXECUTORS`). Owns global pause and stuck-task reset; per-type logic lives in the executors (see table below) |
| [`database.py`](../backend/database.py) | SQLite: table schema + migrations, all SQL queries. Tables: `files`, `thumbnails`, `ai_analysis`, `object_detection`, `video_previews`, `tasks`, `tuning_sessions`, `cameras`. On first start with empty `cameras` table, `_seed_default_cameras()` inserts the Demo Camera and a placeholder HA camera. |
| [`scanner.py`](../backend/scanner.py) | Directory walker; parses timestamps from filenames; writes to DB. `SCANNER_SKIP_DIRS = {"organized"}` — directories with this name are never indexed |
| [`config.py`](../backend/config.py) | Defines `Camera(id, name, path)` and `load_cameras()` which queries the database and appends `CAMERA_ROOT`. |
| [`settings_manager.py`](../backend/settings_manager.py) | Persists user settings (without credentials) to `settings.json` on the server |
| [`google_oauth.py`](../backend/google_oauth.py) | Google OAuth 2.0: client credentials + tokens in `DATA_DIR/google_oauth.json`, consent URL, code exchange, access-token refresh. See [`google-integration.md`](google-integration.md) |
| [`google_api.py`](../backend/google_api.py) | Sync REST client for Gmail + Drive (httpx): labels, message/attachment fetch, folder find-or-create, resumable upload. Pure helpers `extract_attachments()` / `split_drive_path()` |
| [`thumbnails.py`](../backend/thumbnails.py) | Basic 256×256 JPEG thumbnails (Pillow). Cache in `thumbnails_cache/` |
| [`diff_thumbnails.py`](../backend/diff_thumbnails.py) | Motion Diff thumbnails: per-pixel delta from page mean (numpy). Cache in `diff_thumbnails_cache/` |
| [`erosion_thumbnails.py`](../backend/erosion_thumbnails.py) | Erosion thumbnails: MOG2 + morphological erosion. Cache in `erosion_thumbnails_cache/` |
| `snapshots.db` | SQLite database (auto-created on startup). Path = `DATA_DIR/snapshots.db`; `DATA_DIR` env var defaults to `backend/` for local and K8s, set to `/data` for HA add-on |
| [`pytest.ini`](../backend/pytest.ini) | Pytest config: `tests/` dir, quiet output (`-q --tb=short`) |
| [`tests/`](../backend/tests/) | Unit tests for documented complex logic (timestamp parsing, ±5 s video matching, golden-section search, AI JSON/cost, path contract, SpeedTracker). See [`testing.md`](testing.md) |


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
| [`gmail_download.py`](../backend/task_executors/gmail_download.py) | `gmail_download` — save photo/video attachments from a Gmail label into the camera folder; skip-if-exists makes re-runs incremental |
| [`gdrive_upload.py`](../backend/task_executors/gdrive_upload.py) | `gdrive_upload` — upload camera photos/videos (date range) to a Google Drive folder; skips names already in the folder |

### Backend routers (`backend/routers/`)

Each file is a FastAPI `APIRouter` grouping endpoints by responsibility. All routers are mounted in `main.py`.

| File | Endpoints |
|---|---|
| [`catalog.py`](../backend/routers/catalog.py) | `/cameras` (load from DB), `/cameras/config` (GET/PUT CRUD), `/cameras/check-path` (POST check), `/scan` |
| [`stats.py`](../backend/routers/stats.py) | `/stats`, `/files`, `/distribution`, `/previews` |
| [`thumbnails_api.py`](../backend/routers/thumbnails_api.py) | `/thumbnail`, `/diff_thumbnail`, `/erosion_thumbnail`, `/openvino_thumbnail`, `/video_thumbnail`. |
| [`media.py`](../backend/routers/media.py) | `/media/{file_id}` — serves the original photo/video file with the correct MIME type |
| [`delete.py`](../backend/routers/delete.py) | `/delete/preview`, `/delete/confirm`, `/delete/preview_range`, `/delete/by_range`. |
| [`maintenance.py`](../backend/routers/maintenance.py) | `/database`, per-type `/*_thumbnails` (except deleted), `/all_thumbnails`, `/storage_info` |
| [`ai.py`](../backend/routers/ai.py) | `/gemini_analyze`, `/gemini_analyze_batch`, `/claude_analyze_batch`, `/openvino_analyze_batch`, `/openvino_analyze_range`, `/ai_analysis`, `/ai_objects_summary`. |
| [`compute.py`](../backend/routers/compute.py) | `/compute/config` (GET/PUT), `/compute/status` |
| [`tasks.py`](../backend/routers/tasks.py) | `/tasks` CRUD + `/tasks/metrics` + `GET /tasks/{id}/logs` |
| [`tuning.py`](../backend/routers/tuning.py) | `/tuning/sessions/*` — model tuning |
| [`logging_api.py`](../backend/routers/logging_api.py) | `/logging/config` (GET/PUT), `/logging/tail` |
| [`settings.py`](../backend/routers/settings.py) | `/settings` (GET/PUT settings synchronization) |
| [`google.py`](../backend/routers/google.py) | `/google/auth/*` (status, credentials, url, disconnect), `/google/oauth/callback`, `/google/gmail/labels` |

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
snapshots.db (cameras)
    │
    ▼
config.py ──► scanner.py ──► database.py
                              ▲
thumbnails.py ───────────────────┤
diff_thumbnails.py ──────────────┤  (all called from routers/)
erosion_thumbnails.py ───────────┘

routers/ ──► compute_client.py ──HTTP──► compute-service (:8001)
```

---

## Compute-service (`compute-service/`)

Optional stateless service for heavy compute. Full architecture: [`compute-service.md`](compute-service.md).

| File | Role |
|---|---|
| [`app.py`](../compute-service/app.py) | FastAPI app on :8001 — `/health`, `/detect`, `/video/thumbnail`, `/video/convert`. Also `/logging/config` (GET/PUT), `/logging/tail` — same live log-level API as the backend. `_RingBufferHandler` + `_SilentFilter` (drops `/health`/`/metrics`/`/logging` from access log) |
| [`detection.py`](../compute-service/detection.py) | YOLO model loading (lazy) + object detection. Returns canonical English COCO class names. Prefers `models/<name>_openvino_model/` over `.pt` |
| [`video.py`](../compute-service/video.py) | Video thumbnail generation (first/last frame, 2×2 grid, max-change GIF) + `convert_video()` — runs ffmpeg (H.265/H.264, up to 2 h timeout) |
| [`config.py`](../compute-service/config.py) | `CAMERA_ROOT` env var (default `/camera`); `to_absolute(relative_path)` converts relative paths received from the backend to absolute. Set `CAMERA_ROOT=\\192.168.1.91\Camera` for local Windows dev. |
| [`export_models.py`](../compute-service/export_models.py) | **Build-time only** — exports yolov8n/s/m to OpenVINO IR; called by `Dockerfile RUN`, never at runtime |
| [`pytest.ini`](../compute-service/pytest.ini) + [`tests/`](../compute-service/tests/) | Unit tests: `to_absolute` path contract, thumbnail letterboxing. See [`testing.md`](testing.md) |

## Shared block (`shared/`)

Imported by both the main backend and the compute-service.

| File | Role |
|---|---|
| [`contract.py`](../shared/contract.py) | Pydantic API models: `DetectRequest/Response`, `VideoThumbnailRequest`, `VideoConvertRequest/Response` (src_path, dst_path, codec, crf, preset); `VIDEO_THUMB_MODES` |

---

## Frontend (`frontend/src/`)

### Root files

| File | Role |
|---|---|
| [`App.jsx`](../frontend/src/App.jsx) | Root component: camera + drill-down navigation state, layout, screen switching. Cell selection / task navigation / range delete live in hooks (`useCellSelection`, `useTaskNavigation`, `useRangeDelete` in `components/`) |
| [`api.js`](../frontend/src/api.js) | Barrel re-export of `src/api/` domain modules — import from here; **add new endpoints to the matching `api/*.js` module** (see table below) |
| [`aiHelpers.js`](../frontend/src/aiHelpers.js) | AI display utilities: `resolveAiIcons(str)` → `[{emoji,label}]` — builds lookup from `COCO_CLASSES` (both `en`/`ru` keys), always returns Russian display labels |
| [`cocoClasses.js`](../frontend/src/cocoClasses.js) | The 80 COCO classes (`{id, en, ru, emoji}`) in class-ID order + `DETECTION_CLASSES_DEFAULT`. Source for the Detection-tab class checklist; IDs flow to YOLO's `classes=` param |
| [`prompts.js`](../frontend/src/prompts.js) | Single source of truth for all AI prompt templates: `STRUCTURED_ANALYSIS_TEMPLATE` (Gemini + Claude), `GEMINI_FREEFORM_PROMPT`, `CELL_ANALYSIS_PROMPT(n)` (heatmap batch). `{n}` = image count |
| [`viewedStatus.js`](../frontend/src/viewedStatus.js) | Viewed-hour tracking, localStorage only (`viewed_hours_*`, `data_*` keys): `markHourViewed()`, per-level aggregation for the heatmap viewed strips, `hour-viewed-change` CustomEvent |
| [`main.jsx`](../frontend/src/main.jsx) | React entry point. Mounts `<App />` |
| [`test-setup.js`](../frontend/src/test-setup.js) | Vitest setup: in-memory `localStorage` stub (no jsdom). Tests are co-located `*.test.js` files (`components/navUtils.test.js`, `components/hour/hourUtils.test.js`). See [`testing.md`](testing.md) |

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
| [`settings.js`](../frontend/src/api/settings.js) | `/settings` GET/PUT (server-side settings sync) |
| [`google.js`](../frontend/src/api/google.js) | `/google/*` (auth status/credentials/url, disconnect, Gmail labels) + `googleRedirectUri()` |

### Components (`frontend/src/components/`)

| File | Role |
|---|---|
| [`HourViewer.jsx`](../frontend/src/components/HourViewer.jsx) | Hour viewer orchestrator: owns state and data loading, composes the `hour/` subcomponents. See the Hour viewer parts table below |
| [`HeatmapGrid.jsx`](../frontend/src/components/HeatmapGrid.jsx) | CSS grid of heatmap cells. Skeleton loading state |
| [`HeatmapCell.jsx`](../frontend/src/components/HeatmapCell.jsx) | Single heatmap cell: intensity colour, photo/video count badges, thumbnail strip, AI icons, tooltip. At `level='hour'` also fetches `/distribution` and shows a uniformity badge (yellow/red) |
| [`GeminiAnalysisModal.jsx`](../frontend/src/components/GeminiAnalysisModal.jsx) | Gemini AI analysis modal: prompt + token/cost stats. Built on `aiModal/BaseAiModal` |
| [`ClaudeAnalysisModal.jsx`](../frontend/src/components/ClaudeAnalysisModal.jsx) | Claude AI analysis modal (same structure as Gemini). Built on `aiModal/BaseAiModal` |
| [`OpenVinoAnalysisModal.jsx`](../frontend/src/components/OpenVinoAnalysisModal.jsx) | OpenVINO "Run" modal: confidence slider, per-photo object tags with emoji, ms/photo timing. Built on `aiModal/BaseAiModal` |
| [`aiModal/BaseAiModal.jsx`](../frontend/src/components/aiModal/BaseAiModal.jsx) | Shared AI-modal shell: backdrop + Escape, header, run row, "To tasks" submission, no-key deep-link button. New AI provider modals start here |
| [`aiModal/StructuredAiResult.jsx`](../frontend/src/components/aiModal/StructuredAiResult.jsx) | `AiStatsRow` (tokens/cost/time) + `StructuredResponse` (scene/images/raw) — shared by Gemini and Claude modals |
| [`DeleteConfirmModal.jsx`](../frontend/src/components/DeleteConfirmModal.jsx) | Delete confirmation modal: file list with relative paths (`toRelative()` finds `camera.path` as a substring, falling back to the camera folder name — `file_path` may be indexed under a different `CAMERA_ROOT`), paired video preview |
| [`HelpModal.jsx`](../frontend/src/components/HelpModal.jsx) | Help modal (toolbar Help button): cleanup workflow steps, hotkey list, uniformity-badge explanation |
| [`ToolsModal.jsx`](../frontend/src/components/ToolsModal.jsx) | Settings modal — thin shell: backdrop, tab bar, renders the active tab. 7 tabs: General, Cameras, View, AI, Compute, Google, Service. `TAB_ALIASES` maps old tab IDs (detection→ai, tasks/logging/maintenance→service) for deep-link compatibility |
| [`CellSelBar.jsx`](../frontend/src/components/CellSelBar.jsx) | Heatmap cell-selection toolbar: bulk select, delete (hour level), and AI analysis across selected day/hour cells. Rendered by `App.jsx` in selection mode |
| [`navUtils.js`](../frontend/src/components/navUtils.js) | Heatmap navigation helpers: `LEVELS`, `GRID_COLS`, `dateRangeForPeriod`, `computeIntensity`, `formatBytes`, nav-state persistence |
| [`useHeatmapKeyboard.js`](../frontend/src/components/useHeatmapKeyboard.js) | Custom hook — arrow-key navigation + selection/delete shortcuts for the heatmap grid. Inactive while HourViewer is open |
| [`useCellSelection.js`](../frontend/src/components/useCellSelection.js) | Custom hook — heatmap cell-selection state + actions: bulk hour delete, batch AI analysis, send-to-task. Feeds CellSelBar |
| [`useTaskNavigation.js`](../frontend/src/components/useTaskNavigation.js) | Custom hook — Tasks screen → heatmap/hour navigation, owns TaskResultsModal state |
| [`TaskResultsModal.jsx`](../frontend/src/components/TaskResultsModal.jsx) | Results modal for finished AI tasks (openvino/gemini/claude): per-photo object list, token/cost stats, click-through to the hour |
| [`useRangeDelete.js`](../frontend/src/components/useRangeDelete.js) | Custom hook — date-range delete preview → confirm flow, drives DeleteConfirmModal |
| [`KeyboardHints.jsx`](../frontend/src/components/KeyboardHints.jsx) | Footer strip of keyboard shortcuts under the heatmap |
| [`Header.jsx`](../frontend/src/components/Header.jsx) | Top bar: total GB / photo count / video count |
| [`CameraSelector.jsx`](../frontend/src/components/CameraSelector.jsx) | Horizontal pill buttons for camera selection |
| [`DrilldownBreadcrumb.jsx`](../frontend/src/components/DrilldownBreadcrumb.jsx) | Navigation breadcrumb: All Years / 2024 / Nov / 16 |
| [`StatsBar.jsx`](../frontend/src/components/StatsBar.jsx) | Recharts bar chart below the heatmap (size per period) |
| [`ScanButton.jsx`](../frontend/src/components/ScanButton.jsx) | Scan button, spinner, data refresh on completion |
| [`ToolsButton.jsx`](../frontend/src/components/ToolsButton.jsx) | Button that opens ToolsModal. Also listens for `open-tools` CustomEvent (`detail: {tab}`) to open to a specific tab |
| [`ServiceStatus.jsx`](../frontend/src/components/ServiceStatus.jsx) | Status chips in the header (Backend / Compute): up/down dot, CPU %, RAM usage. Polls `/api/services/status` every 5 s, paused while the tab is hidden |
| [`TasksScreen.jsx`](../frontend/src/components/TasksScreen.jsx) | Tasks screen — polls `/tasks` every 3 s, shows system metrics bar + task card list, hosts NewTaskModal |
| [`TuningScreen.jsx`](../frontend/src/components/TuningScreen.jsx) | Model tuning orchestrator: session sidebar + step switching. Steps live in `tuning/` (table below). See [`docs/tuning.md`](tuning.md) |
| [`TaskCard.jsx`](../frontend/src/components/TaskCard.jsx) | Task card: type icon, status badge, progress bar, speed/ETA, thumbnail, pause/resume/cancel buttons. Logs button (console icon) for `video_convert`/`file_organizer`/`gmail_download`/`gdrive_upload` types; dry-run amber tag |
| [`NewTaskModal.jsx`](../frontend/src/components/NewTaskModal.jsx) | Modal to create a task: type selector, camera/dates, AI scheduling, estimates, param assembly (`handleAdd`). Eight types: `video_thumbnails`, `openvino`, `gemini`, `claude`, `video_convert`, `file_organizer`, `gmail_download`, `gdrive_upload`. Per-type param panels live in `newTask/` (table below) |
| [`TaskLogsModal.jsx`](../frontend/src/components/TaskLogsModal.jsx) | Log viewer modal for log-enabled task types (see TaskCard). Polls `GET /tasks/{id}/logs` every 2 s while task is active; colour-codes DRY/ERROR/Skip lines. Header has a fullscreen toggle (⛶/⊡) that expands the modal to 98 vw × 96 vh |

### Tools modal tabs (`frontend/src/components/tools/`)

`ToolsModal.jsx` is a shell; each tab is a self-contained component that reads/writes its own settings.

| File | Role |
|---|---|
| [`settingsConfig.js`](../frontend/src/components/tools/settingsConfig.js) | All Tools constants: localStorage keys, defaults, ranges, model/option lists, pricing tables |
| [`settingsIO.js`](../frontend/src/components/tools/settingsIO.js) | `exportSettingsYaml()`, `applyImportedSettings()`, `initFontSize()`/`applyFontSize()` |
| [`SliderSetting.jsx`](../frontend/src/components/tools/SliderSetting.jsx) | Reusable labelled range-slider row used across tabs |
| [`GeneralTab.jsx`](../frontend/src/components/tools/GeneralTab.jsx) | Font size (2-col layout), YAML export/import |
| [`CamerasTab.jsx`](../frontend/src/components/tools/CamerasTab.jsx) | Full camera CRUD: add/edit/delete rows, inline path validation via `/cameras/check-path`, saves via `PUT /cameras/config` |
| [`TasksTab.jsx`](../frontend/src/components/tools/TasksTab.jsx) | Task settings: ETA window (minutes) and log tail lines |
| [`HourViewTab.jsx`](../frontend/src/components/tools/HourViewTab.jsx) | View tab: previews per cell, thumb width, hover zoom, diff threshold, page size, burst gap, video preview, uniformity (collapsible, with Low/Medium/High presets) |
| [`AiTab.jsx`](../frontend/src/components/tools/AiTab.jsx) | Combined AI tab: 3 sections — Detection (YOLO model, confidence, classes checklist), Google Gemini (API key, model, prompt), Claude Anthropic (API key, model) |
| [`ComputeTab.jsx`](../frontend/src/components/tools/ComputeTab.jsx) | Compute-service routing: off / local / remote + URL, test-connection status |
| [`GoogleTab.jsx`](../frontend/src/components/tools/GoogleTab.jsx) | Google account: OAuth client setup (redirect URI display, client id/secret), connect/disconnect with status polling. See [`google-integration.md`](google-integration.md) |
| [`ServiceTab.jsx`](../frontend/src/components/tools/ServiceTab.jsx) | Combined service tab: Tasks settings (ETA window, log tail lines), Logging (log level, buffer, live viewer), Maintenance (DB/thumbnail cleanup) |

> **Dead files:** `DetectionTab.jsx`, `LoggingTab.jsx`, `MaintenanceTab.jsx` are not imported anywhere — superseded by the merged `AiTab`/`ServiceTab`. Don't edit them; the live code is in the merged tabs.

### New Task modal parts (`frontend/src/components/newTask/`)

| File | Role |
|---|---|
| [`newTaskHelpers.js`](../frontend/src/components/newTask/newTaskHelpers.js) | Date input helpers, `isAiType`/`isDbType`, `readGlobalSettings()`, `TASK_TYPES` (type-selector cards), VC codec/preset lists |
| [`VideoConvertPanel.jsx`](../frontend/src/components/newTask/VideoConvertPanel.jsx) | `video_convert` params: pattern, suffix, codec, CRF, preset |
| [`FileOrganizerPanel.jsx`](../frontend/src/components/newTask/FileOrganizerPanel.jsx) | `file_organizer` params: source, pattern, output folder, date regex |
| [`GmailDownloadPanel.jsx`](../frontend/src/components/newTask/GmailDownloadPanel.jsx) | `gmail_download` params: Gmail label select, destination subfolder, email date filter |
| [`GDriveUploadPanel.jsx`](../frontend/src/components/newTask/GDriveUploadPanel.jsx) | `gdrive_upload` params: file type toggle, Drive folder path, date range + estimate |
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
| [`PhotoCard.jsx`](../frontend/src/components/hour/PhotoCard.jsx) | Single photo card: thumbnail, fullscreen lightbox (with download button → `/media/{id}`), AI icons + description overlay |
| [`Lightbox.jsx`](../frontend/src/components/hour/Lightbox.jsx) | Unified fullscreen photo/video lightbox: ←/→ + touch-swipe navigation, S/T downloads, video playback with VLC fallback |
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
| [`motionDiffMode.js`](../frontend/src/components/viewModes/motionDiffMode.js) | Motion highlight (per-pixel delta from page mean) |
| [`erosionMode.js`](../frontend/src/components/viewModes/erosionMode.js) | Motion (noise-filtered) — MOG2 + morphological erosion |
| [`openvinoMode.js`](../frontend/src/components/viewModes/openvinoMode.js) | Object detection (local) — `isAiMode`, calls `/openvino_thumbnail` with model+confidence+classes params |
| [`geminiMode.js`](../frontend/src/components/viewModes/geminiMode.js) | AI description (Gemini) — icon overlay from analysis results |
| [`claudeMode.js`](../frontend/src/components/viewModes/claudeMode.js) | AI description (Claude) — icon overlay from analysis results |
| [`index.js`](../frontend/src/components/viewModes/index.js) | Mode registry — `VIEW_MODES`; `getEnabledViewModes()` filters `needsCompute` modes for keyboard cycling; `getViewModesWithStatus()` returns all modes with `disabled`/`disabledHint` for the dropdown |


### Styles

| File | What it styles | Key class prefixes |
|---|---|---|
| [`styles/variables.css`](../frontend/src/styles/variables.css) | CSS custom properties; ≤640px media query shrinks `--gap-*` for narrow screens | `--font-base`, `--accent`, `--bg-*`, `--heatmap-*` |
| [`styles/global.css`](../frontend/src/styles/global.css) | Global reset, body, scrollbar, app shell layout + mobile rules (hides `.kb-hints` and `.btn-label` toolbar labels ≤640px) | `.app-main`, `.app-toolbar`, `.kb-hints`, `.btn-label` |
| [`components/HourViewer.css`](../frontend/src/components/HourViewer.css) | HourViewer shell + shared base classes (loaded first so `hour/*.css` can override) | `.hv-root`, `.hv-header`, `.hv-grid`, `.hv-card` base, `.hv-lightbox` base, `.hv-mode-settings` base, `.hv-select-btn`, pagination |
| `components/hour/*.css` | Co-located styles, one file per `hour/` component: `PhotoCard.css`, `VideoCard.css`, `VideoModal.css`, `DistributionChart.css`, `SelectionBar.css`, `AiModePanel.css`, `ModeSettingsPanel.css` | `.hv-card-photo`/`.hv-card-ai-*`, `.hv-card-video`/`.hv-video-*`, `.hv-video-modal-*`, `.hv-dist-*`, `.hv-sbar-*`, `.hv-ai-*`, `.hv-mode-param-*` |
| [`components/ToolsModal.css`](../frontend/src/components/ToolsModal.css) | Tools modal — shared by the shell and all `tools/` tabs | `.modal-*` |
| [`components/HeatmapCell.css`](../frontend/src/components/HeatmapCell.css) | Heatmap cell | `.cell-*` |
| [`components/DeleteConfirmModal.css`](../frontend/src/components/DeleteConfirmModal.css) | Delete confirmation modal | `.dcm-*` |
| Other `*.css` beside components | Styles scoped to that one component | — |

> **Responsive:** the app adapts to narrow screens (phones / vertical windows) via `@media (max-width: 640px)` queries co-located in each component's CSS file (HeatmapGrid → 1–2 columns, Header/TasksScreen wrap, modals → single column). The breakpoint is 640px everywhere. Mobile specifics: header is non-sticky with service chips collapsed to dot+name and stat chips to icon+value (Header.css), toolbar buttons are icon-only (global.css hides `.btn-label`), all keyboard-hint strips are hidden (`.kb-hints`, `.hv-kb-hints`, `.lb-hints`), Lightbox is full-bleed with touch-swipe navigation, NewTaskModal type cards become compact rows. Keep mobile blocks at the *end* of each CSS file — equal-specificity base rules defined later in the file would override them.

> **Search tip:** `.hv-*` classes are split per component. Photo card / AI overlays → `hour/PhotoCard.css`; video card → `hour/VideoCard.css`; video player → `hour/VideoModal.css`; `.hv-dist-*` → `hour/DistributionChart.css`; `.hv-sbar-*` → `hour/SelectionBar.css`; `.hv-ai-*` → `hour/AiModePanel.css`. Shared base classes (`.hv-card`, `.hv-lightbox`, `.hv-mode-settings`, header, grid, pagination) stay in `HourViewer.css`.

### Frontend config files

| File | Role |
|---|---|
| [`vite.config.js`](../frontend/vite.config.js) | Vite: `base: './'` (relative assets — required for HA ingress); dev proxy `/api/*` → `http://localhost:8000` |
| [`vitest.config.js`](../frontend/vitest.config.js) | Vitest: node environment, `src/**/*.test.js`, localStorage stub via `src/test-setup.js` |
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

### Home Assistant add-on

Third deployment target: HA OS / Supervised, exposed via HA ingress (no host port). Full docs: [`home-assistant-addon.md`](home-assistant-addon.md).

| File | Role |
|---|---|
| [`repository.yaml`](../repository.yaml) | HA add-on repository manifest (required by HA store) |
| [`camera-cleaner-addon/config.yaml`](../camera-cleaner-addon/config.yaml) | Add-on manifest: arch, ingress port 8099, `map: media:rw`, options `camera_root` + `compute_remote_url` |
| [`camera-cleaner-addon/build.yaml`](../camera-cleaner-addon/build.yaml) | Per-arch base images (`ghcr.io/home-assistant/{arch}-base-debian:bookworm`) |
| [`camera-cleaner-addon/Dockerfile`](../camera-cleaner-addon/Dockerfile) | Multi-stage: Node.js frontend build → HA Debian base with Python 3 + nginx. Build context = repo root: `docker build -f camera-cleaner-addon/Dockerfile .` |
| [`camera-cleaner-addon/run.sh`](../camera-cleaner-addon/run.sh) | Container ENTRYPOINT (bypasses s6-overlay): options.json → `CAMERA_ROOT`/`DATA_DIR=/data`, seeds compute config, starts nginx + uvicorn |
| [`camera-cleaner-addon/rootfs/etc/nginx/nginx.conf`](../camera-cleaner-addon/rootfs/etc/nginx/nginx.conf) | nginx: `allow 172.30.32.2; deny all` (ingress-only); serves SPA; `location /api/` proxies to uvicorn, stripping the prefix |
| `camera-cleaner-addon/rootfs/etc/services.d/`, `cont-init.d/` | **Not executed** — legacy s6 scripts from before the ENTRYPOINT override; the live logic is in `run.sh` |
| [`camera-cleaner-addon/DOCS.md`](../camera-cleaner-addon/DOCS.md) | User-facing add-on documentation shown in HA store |
| [`.github/workflows/addon-build.yml`](../.github/workflows/addon-build.yml) | CI: multi-arch (amd64+aarch64) image build and push to `ghcr.io` on `addon/v*` tag (manual tag push) |
| [`.github/workflows/release-addon.yml`](../.github/workflows/release-addon.yml) | CI: workflow_dispatch release — bumps `config.yaml`, commits, creates tag, then builds + pushes images |
