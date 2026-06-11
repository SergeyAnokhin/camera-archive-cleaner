# AI Analysis — Architecture & Reference

How the AI image analysis feature works: from API request to stored results to on-screen display.

---

## Overview

The app supports two types of AI analysis:

- **Cloud AI** (Gemini, Claude) — sends photos to an external API, receives a natural-language description + object list per photo. Requires an API key and internet access.
- **Local AI** (OpenVINO) — runs YOLOv8 object detection on the local machine, no API key or internet required. Detects objects from the COCO 80-class vocabulary (people, animals, vehicles, etc.) and draws bounding boxes.

Results are stored in two separate tables: cloud AI (Gemini/Claude) in `ai_analysis`, local detection (OpenVINO) in `object_detection`. Both are displayed as icons on photo cards and heatmap cells.

---

## Supported providers

| Provider | Key in DB | localStorage (API key) | localStorage (model) |
|----------|-----------|------------------------|----------------------|
| Google Gemini | `gemini` | `gemini_api_key` | `gemini_model` |
| Anthropic Claude | `claude` | `claude_api_key` | `claude_model` |
| OpenVINO (local) | `openvino` | — | `openvino_model` |

OpenVINO stores two separate confidence values:
- `openvino_confidence` (float, default `0.25`) in localStorage — used by `OpenVinoAnalysisModal` (the "Run" button)
- `confidence` mode param (integer %, default `25`) in React `modeParams` state — used by the `AiModePanel` slider and the bbox thumbnail URL

---

## View modes

| Mode key | Label | `isAiMode` | File |
|----------|-------|-----------|------|
| `gemini_analysis` | Gemini Analysis | ✓ | [`viewModes/geminiMode.js`](../frontend/src/components/viewModes/geminiMode.js) |
| `claude_analysis` | Claude Analysis | ✓ | [`viewModes/claudeMode.js`](../frontend/src/components/viewModes/claudeMode.js) |
| `openvino_detection` | OpenVINO Detection | ✓ | [`viewModes/openvinoMode.js`](../frontend/src/components/viewModes/openvinoMode.js) — calls `/openvino_thumbnail` with model + confidence + classes params |

Modes with `isAiMode: true`:
- Replace the normal mode-settings panel with `AiModePanel` (read-only model label + confidence display for openvino + Run button + stats)
- Enable the per-card hover description tooltip

**OpenVINO Detection** combines visualization and analysis in one mode:
- `getImageUrl` returns `/openvino_thumbnail/{file_id}?model=…&confidence=…` — boxes drawn on the photo
- `params: [{ key: 'confidence', min: 10, max: 80, default: 25 }]` — confidence shown as a slider in `AiModePanel`; changing it immediately changes the thumbnail URL, forcing a new cached image to be requested
- Model selector in `AiModePanel` calls `onParamChange('_refresh', Date.now())` on change to force photo URL re-render (since model is stored in localStorage, not React state)

Mode registration: [`frontend/src/components/viewModes/index.js`](../frontend/src/components/viewModes/index.js)

---

## How icons reach the UI

### Cloud AI (Gemini / Claude) — explicit Run

```
User clicks Run in AiModePanel
    │
    ├─ provider === 'gemini' ──► GeminiAnalysisModal.jsx
    │                              POST /gemini_analyze_batch
    │                              saves to ai_analysis
    │
    └─ provider === 'claude' ──► ClaudeAnalysisModal.jsx
                                   POST /claude_analyze_batch
                                   saves to ai_analysis
    │
    └─ onComplete() ──► recordAiRequest(provider)
                    └─► reloadAiAnalysis()  ← icons appear
```

### OpenVINO — automatic on thumbnail load

```
User switches to OpenVINO Detection mode
    │
    ▼ (for each photo visible on page)
GET /openvino_thumbnail/{file_id}?model=…&confidence=…
    │
    ├─ cache hit  → return cached JPEG  (no DB write)
    │
    └─ cache miss → run YOLO
                    draw bounding boxes  (results[0].plot())
                    save JPEG to openvino_thumbnails_cache/
                    save_object_detection() → object_detection table
                    return JPEG
    │
    ▼ (PhotoCard.onLoad fires)
debounce 1.5 s after last image load
    │
    ▼
reloadAiAnalysis()  ← one DB read covers all loaded photos
    │
    ▼
icons appear: top-left corner of each photo card
              + hour / day / month cells in HeatmapCell
```

**"Run" button for OpenVINO** (optional):
Opens `OpenVinoAnalysisModal` → `POST /openvino_analyze_batch` → saves to DB → calls `reloadAiAnalysis()`. Useful to bulk pre-save all photos on the page, e.g. after changing the confidence threshold so new results replace cached ones.

**Modal files:**
- [`frontend/src/components/GeminiAnalysisModal.jsx`](../frontend/src/components/GeminiAnalysisModal.jsx) — editable prompt, token stats, cost estimate
- [`frontend/src/components/ClaudeAnalysisModal.jsx`](../frontend/src/components/ClaudeAnalysisModal.jsx) — same format
- [`frontend/src/components/OpenVinoAnalysisModal.jsx`](../frontend/src/components/OpenVinoAnalysisModal.jsx) — confidence slider (reads `openvino_confidence` from localStorage), per-photo object list, ms/photo timing
- All three are built on [`aiModal/BaseAiModal.jsx`](../frontend/src/components/aiModal/BaseAiModal.jsx) (shell: Escape, header, run row, task submission); Gemini/Claude also share [`aiModal/StructuredAiResult.jsx`](../frontend/src/components/aiModal/StructuredAiResult.jsx) (stats row + scene/images rendering)
- Shared CSS: [`frontend/src/components/GeminiAnalysisModal.css`](../frontend/src/components/GeminiAnalysisModal.css)

---

## Backend endpoints

> Endpoints are declared in [`backend/routers/ai.py`](../backend/routers/ai.py) (request models + delegation only). The actual analysis logic lives in the [`backend/ai_providers/`](../backend/ai_providers/) package, with shared image-loading / JSON-parsing / cost / DB-save helpers in `ai_providers/common.py`.

### `POST /gemini_analyze_batch`

[`ai_providers/gemini.py`](../backend/ai_providers/gemini.py) — `analyze_batch()`

1. Loads photo files from DB by `file_ids`
2. Reads each file from disk with Pillow, resizes to 1024 × 1024
3. Sends all images + prompt in a single `client.models.generate_content()` call (`google-genai` SDK)
4. Parses JSON response → `{ scene, images: [{ description, objects }] }`
5. Saves each result via `save_ai_analysis()` (UPSERT on `file_id`)
6. Returns: `{ elapsed_ms, images_used, input_tokens, output_tokens, total_tokens, cost_usd, saved_count, parsed, raw_text }`

### `POST /claude_analyze_batch`

[`ai_providers/claude.py`](../backend/ai_providers/claude.py) — `analyze_batch()`

Same flow, but converts images to base64 JPEG and sends via `anthropic` SDK (`client.messages.create()`).

### `POST /openvino_analyze_batch`

[`ai_providers/openvino.py`](../backend/ai_providers/openvino.py) — `analyze_batch()`

Request: `{ file_ids, model_name, confidence }`

1. For each photo, calls the compute-service `POST /detect` (`draw=false`) — see [`compute-service.md`](compute-service.md)
2. The compute-service runs YOLOv8 detection and maps COCO English → Russian via `COCO_TO_RUSSIAN`
3. Saves each result via `save_object_detection()` to the `object_detection` table
4. Returns: `{ elapsed_ms, images_used, saved_count, results: { file_id: [ru_word, ...] } }`

Returns `503` if the compute-service is off or unreachable. Objects are stored as Russian words so they match the existing `AI_ICON_MAP` in `aiHelpers.js`.

### `POST /openvino_analyze_range`

[`ai_providers/openvino.py`](../backend/ai_providers/openvino.py) — `analyze_range()`

Request: `{ camera_id, date_from, date_to, model_name, confidence }`

Fetches all photo `file_id`s for the given camera and date range from the DB, then delegates to `openvino_analyze_batch()`. Used by the heatmap **CellSelBar** "Analyze" button to process all photos in selected cells without entering each hour individually.

Returns the same shape as `/openvino_analyze_batch`.

---

### `GET /openvino_thumbnail/{file_id}?model=yolov8n&confidence=0.25&classes=0,2,3`

[`backend/routers/thumbnails_api.py`](../backend/routers/thumbnails_api.py) — `get_openvino_thumbnail()`

Returns a JPEG with bounding boxes drawn by YOLO's built-in `.plot()` renderer:
- Colored rectangle per detected object (automatic distinct color per class)
- Label: `person 0.87`, `cat 0.62` etc. (COCO English name + confidence)
- Output resized to max 640 × 640 px

**`classes` param** (comma-separated COCO class IDs; empty = all 80): restricts YOLO inference to only those classes.

**On cache miss:** the main backend calls the compute-service `POST /detect` (`draw=true`), writes the returned JPEG to the cache, and **also calls `save_object_detection()`** to persist detected objects in the `object_detection` table. Returns `503` if the compute-service is off/unreachable.

Cache key: `sha256("v5:{file_id}:{model}:{conf:.2f}:{sorted_classes}")[:16].jpg`  
Directory: `backend/openvino_thumbnails_cache/` — included in `DELETE /all_thumbnails` cleanup.

### `GET /ai_analysis?file_ids=1,2,3`

Returns merged results for the given file IDs. Queries both `ai_analysis` (Gemini/Claude) and `object_detection` (OpenVINO) and returns one entry per file:

```json
[{ "file_id": 42, "detection": {"model": "yolov8n", "objects": "человек машина", "analyzed_at": "…"}, "ai": {"provider": "gemini", "model": "…", "scene_description": "…", "image_description": "…", "objects": "…"} }]
```

Either `detection` or `ai` (or both) may be `null` if the photo hasn't been processed by that provider. Called by `HourViewer` on every page change to populate the icon/tooltip map.

### `GET /ai_objects_summary?camera_id=&date_from=&date_to=`

Returns unique object words across all `ai_analysis` rows for files in the given date range. Called by each `HeatmapCell` to show aggregate icons.

**API client functions:** [`frontend/src/api/analysis.js`](../frontend/src/api/analysis.js) (re-exported via `api.js`) — `geminiAnalyzeBatch`, `claudeAnalyzeBatch`, `openvinoAnalyzeBatch`, `getOpenVinoBboxThumbnailUrl`, `getAiAnalysis`, `getAiObjectsSummary`

---

## Database schema

Two tables in [`backend/database.py`](../backend/database.py); see [`docs/database.md`](database.md) for full column details.

| Table | Used for | UNIQUE key |
|---|---|---|
| `ai_analysis` | Gemini / Claude results | `file_id` — cloud provider overwrites on re-run |
| `object_detection` | OpenVINO / YOLO results | `file_id` — detection overwrites on re-run |

Both have `FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE`.

Running detection and cloud AI on the same photo no longer conflicts — each has its own row in its own table.

DB helpers: `save_ai_analysis()`, `save_object_detection()`, `get_combined_analysis_by_file_ids()` in [`backend/database.py`](../backend/database.py).

---

## Object vocabulary & emoji

Object words are short Russian (or English) keywords stored space-separated in `ai_analysis.objects`, e.g. `"человек кошка"`.

**[`frontend/src/aiHelpers.js`](../frontend/src/aiHelpers.js)**
- `resolveAiIcons(objectsStr)` — splits string, deduplicates by label, looks up emoji from `COCO_CLASSES` (both `en` and `ru` keys), returns `[{ emoji, label }]`. Unknown objects → `●`.

Emoji come from [`frontend/src/cocoClasses.js`](../frontend/src/cocoClasses.js) — the single authoritative source of all 80 COCO classes with emojis.

### COCO classes detected by OpenVINO — Russian translation

`shared/coco_names.py` → `COCO_TO_RUSSIAN` dict (23 entries mapped; unmapped classes fall back to English):

| COCO English | Russian word stored in DB |
|---|---|
| person | человек |
| bicycle | велосипед |
| car | машина |
| motorcycle | мотоцикл |
| airplane | самолёт |
| bus | автобус |
| train | поезд |
| truck | грузовик |
| boat | лодка |
| bird | птица |
| cat | кошка |
| dog | собака |
| horse | лошадь |
| sheep | овца |
| cow | корова |
| elephant | слон |
| bear | медведь |
| zebra | зебра |
| giraffe | жираф |
| backpack | рюкзак |
| umbrella | зонт |
| handbag | сумка |
| suitcase | чемодан |

All remaining COCO 80 classes (bench, chair, tv, laptop, cell phone, etc.) fall through as English — they have emoji in `cocoClasses.js`.

---

## OpenVINO model runtime

`load_yolo()` in [`compute-service/detection.py`](../compute-service/detection.py) picks the runtime per model name:

- **`compute-service/models/{model}_openvino_model/` exists** → loads the OpenVINO IR build (compiled for Intel AVX-512 / VNNI / AMX, 2–5× faster on Intel CPUs). Log: `🔷 Loading OpenVINO model: …`
- **otherwise** → downloads/loads the PyTorch `.pt` model. Log: `🔷 Loading PyTorch model: …`

Pre-export folders for `yolov8n`, `yolov8s`, `yolov8m` under `compute-service/models/`. To (re)export one:

```powershell
cd compute-service
python -c "from ultralytics import YOLO; YOLO('yolov8n.pt').export(format='openvino')"
Move-Item yolov8n_openvino_model models\   # final: compute-service/models/yolov8n_openvino_model/
```

Restart the compute-service afterwards. The export folder must be named exactly `{model}_openvino_model` and sit directly under `compute-service/models/` — `load_yolo()` builds that path from the model name.

---

## Prompt template (Cloud AI)

The structured prompt is a template with `{n}` placeholder (replaced with actual image count at run time).

**Single source of truth:** all prompt templates live in [`frontend/src/prompts.js`](../frontend/src/prompts.js) — `STRUCTURED_ANALYSIS_TEMPLATE` (Gemini + Claude structured), `GEMINI_FREEFORM_PROMPT` (non-structured Gemini), `CELL_ANALYSIS_PROMPT(n)` (heatmap CellSelBar batch).

**Stored in:** `localStorage` key `gemini_structured_prompt`
**Editable in:** Tools modal → Google AI tab → "Structured prompt template"
**Default if empty:** `STRUCTURED_ANALYSIS_TEMPLATE` from `prompts.js` (also the editable default exported as `GEMINI_DEFAULT_PROMPT` in `tools/settingsConfig.js`). Claude reuses the same template.

The prompt instructs the model to return strict JSON:
```json
{
  "scene": "one sentence about overall activity",
  "images": [
    { "description": "1-2 sentences about this frame", "objects": ["мужчина", "кошка"] }
  ]
}
```

---

## Batch analysis from the heatmap (CellSelBar)

Without opening a specific hour, the user can select multiple cells in the heatmap and run AI analysis on all of them at once.

### How to enter selection mode

| Action | Effect |
|--------|--------|
| Click **Select hours** / **Select days** button | Enter selection mode at hour or day level |
| `Space` on focused cell | Toggle that cell + enter selection mode |
| `Ctrl+A` | Enter selection mode and select all non-empty cells |
| Click a cell (in selection mode) | Toggle that cell |
| `Esc` | Exit selection mode |

Selection mode is available at:
- **`hour` level** (day view showing hour cells)
- **`day` level** (month view showing day cells)

### CellSelBar

When selection mode is active, the **CellSelBar** appears in [`frontend/src/App.jsx`](../frontend/src/App.jsx). It has two rows:

**Row 1 — selection controls:**
`All` · `None` · selected count/size stats · `Delete selected` (hour level only) · `Cancel`

**Row 2 — AI analysis panel:**
- **Provider dropdown**: OpenVINO Detection / Gemini Analysis / Claude Analysis
- **Model label** (read-only): shows current model from global settings (Tools modal) with a cog icon
- **Threshold label** (OpenVINO only): shows current confidence % from global settings (read-only)
- **Analyze (N)** button — runs analysis on all selected cells

### What "Analyze" does per provider

| Provider | Action |
|----------|--------|
| **OpenVINO** | Calls `POST /openvino_analyze_range` for each selected cell sequentially. Progress shown as `X/Y`. After all cells complete, increments `aiRefreshKey` to refresh cell icons |
| **Gemini** | Gets 1 preview photo per selected cell via `GET /previews`, bundles all IDs, calls `POST /gemini_analyze_batch`. Requires `gemini_api_key` in localStorage |
| **Claude** | Same as Gemini but via `POST /claude_analyze_batch`. Requires `claude_api_key` |

### Icon refresh after analysis (`aiRefreshKey`)

After `handleAnalyzeCells()` completes, App.jsx increments `aiRefreshKey` (integer state). This is passed as a prop through `HeatmapGrid` → `HeatmapCell`, where it is included in the `useEffect` dependency array for `getAiObjectsSummary`. Each affected cell re-fetches its AI object summary and re-renders icons.

---

## Display — where icons appear

### HourViewer — per-photo card

**File:** [`frontend/src/components/hour/PhotoCard.jsx`](../frontend/src/components/hour/PhotoCard.jsx)

- AI data loaded on every page change via `getAiAnalysis(pagePhotoIds)` → stored in `aiAnalysisMap` (Map keyed by `file_id`) in `HourViewer.jsx`
- **Emoji icons overlay** (top-left corner, `.hv-card-ai-icons`): always visible in all modes; each emoji has `title={label}` browser tooltip
- **Objects hover text** (`.hv-card-objects-hover`): appears on mouse hover, shows `emoji label` pairs joined by spaces; resolved via `resolveAiIcons()`
- **Hover description tooltip** (bottom of card, `.hv-card-ai-desc`): visible only when `mode.isAiMode === true`; shows `image_description`, object tags, model name
- **OpenVINO auto-refresh**: each `PhotoCard` fires `onImageLoad()` when its bbox thumbnail loads → debounced 1.5 s → single `reloadAiAnalysis()` call refreshes the map after the last image settles

### HourViewer — page-level objects summary (AiModePanel)

**File:** [`frontend/src/components/hour/AiModePanel.jsx`](../frontend/src/components/hour/AiModePanel.jsx)

Below the Run button, when at least one photo on the current page has been analysed, a row of emoji appears (`.hv-ai-page-objects`). These are the unique detected objects aggregated across **all photos on the current page** from `aiAnalysisMap`. Resolved via `resolveAiIcons()`. Each emoji has a `title` tooltip with the Russian/English label.

### HeatmapCell — day/hour/month cells

**File:** [`frontend/src/components/HeatmapCell.jsx`](../frontend/src/components/HeatmapCell.jsx)

- Calls `getAiObjectsSummary(cameraId, dateFrom, dateTo)` on mount
- Shows up to 5 deduplicated icons below the thumbnail strip

---

## Request statistics

Tracked purely in `localStorage` — no backend storage.

**Functions in** `HourViewer.jsx`:
- `recordAiRequest(provider)` — appends timestamp, prunes entries older than 25h
- `getAiRequestStats(provider)` — returns `{ lastMinute, last24h }` counts

Displayed in `AiModePanel` after each completed analysis.

---

## Settings (Tools modal)

**Files:** [`tools/DetectionTab.jsx`](../frontend/src/components/tools/DetectionTab.jsx), [`tools/GoogleAiTab.jsx`](../frontend/src/components/tools/GoogleAiTab.jsx), [`tools/ClaudeAiTab.jsx`](../frontend/src/components/tools/ClaudeAiTab.jsx) — keys/defaults in [`tools/settingsConfig.js`](../frontend/src/components/tools/settingsConfig.js)

| Tab | Setting | localStorage key |
|-----|---------|-----------------|
| **Detection** | YOLO model | `openvino_model` (default `yolov8n`; options: `yolov8n/s/m`) |
| **Detection** | Default OpenVINO confidence | `mode_params_openvino_detection` → `{confidence: N}` (integer %) |
| **Detection** | Detected YOLO classes (80-class checklist) | `detection_classes` (JSON array of COCO class IDs) |
| Google AI | API key | `gemini_api_key` |
| Google AI | Model | `gemini_model` |
| Google AI | Prompt template | `gemini_structured_prompt` |
| Claude AI | API key | `claude_api_key` |
| Claude AI | Model | `claude_model` |

**Model selection is centralised in the Tools modal only.** `AiModePanel` and `CellSelBar` show the active model as a read-only label. `NewTaskModal` reads model/mode from localStorage and shows a read-only summary for the selected task type.
