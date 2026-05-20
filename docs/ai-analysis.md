# AI Analysis — Architecture & Reference

How the AI image analysis feature works: from API request to stored results to on-screen display.

---

## Overview

The app supports two types of AI analysis:

- **Cloud AI** (Gemini, Claude) — sends photos to an external API, receives a natural-language description + object list per photo. Requires an API key and internet access.
- **Local AI** (OpenVINO) — runs YOLOv8 object detection on the local machine, no API key or internet required. Detects objects from the COCO 80-class vocabulary (people, animals, vehicles, etc.) and draws bounding boxes.

Results from all providers are stored in the same `ai_analysis` table and displayed as icons on photo cards and heatmap cells.

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
| `openvino_detection` | OpenVINO Detection | ✓ | [`viewModes/openvinoMode.js`](../frontend/src/components/viewModes/openvinoMode.js) — reads `excluded` from localStorage via `getExcludedParam()` and passes it as a URL param |
| `openvino_bbox` | OpenVINO Boxes | — | [`viewModes/openvinoBboxMode.js`](../frontend/src/components/viewModes/openvinoBboxMode.js) — same as above but without `isAiMode`; reads confidence from `openvino_confidence` localStorage key |

Modes with `isAiMode: true`:
- Replace the normal mode-settings panel with `AiModePanel` (model selector + confidence slider for openvino + Run button + stats)
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
                    save_ai_analysis() → ai_analysis table
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
- Shared CSS: [`frontend/src/components/GeminiAnalysisModal.css`](../frontend/src/components/GeminiAnalysisModal.css)

---

## Backend endpoints

### `POST /gemini_analyze_batch`

[`backend/main.py`](../backend/main.py) — `gemini_analyze_batch()`

1. Loads photo files from DB by `file_ids`
2. Reads each file from disk with Pillow, resizes to 1024 × 1024
3. Sends all images + prompt in a single `client.models.generate_content()` call (`google-genai` SDK)
4. Parses JSON response → `{ scene, images: [{ description, objects }] }`
5. Saves each result via `save_ai_analysis()` (UPSERT on `file_id`)
6. Returns: `{ elapsed_ms, images_used, input_tokens, output_tokens, total_tokens, cost_usd, saved_count, parsed, raw_text }`

### `POST /claude_analyze_batch`

[`backend/main.py`](../backend/main.py) — `claude_analyze_batch()`

Same flow, but converts images to base64 JPEG and sends via `anthropic` SDK (`client.messages.create()`).

### `POST /openvino_analyze_batch`

[`backend/main.py`](../backend/main.py) — `openvino_analyze_batch()`

Request: `{ file_ids, model_name, confidence }`

1. Loads YOLOv8 model lazily via `_load_yolo()` — tries `backend/models/{model}_openvino_model/` first, falls back to `.pt` download
2. Runs detection on each photo at the given confidence threshold
3. Maps COCO English class names → Russian via `_COCO_TO_RUSSIAN` dict
4. Saves each result via `save_ai_analysis()` with `provider='openvino'`, empty `scene_description`/`image_description`
5. Returns: `{ elapsed_ms, images_used, saved_count, results: { file_id: [ru_word, ...] } }`

Objects are stored as Russian words so they match the existing `AI_ICON_MAP` in `aiHelpers.js`.

### `POST /openvino_analyze_range`

[`backend/main.py`](../backend/main.py) — `openvino_analyze_range()`

Request: `{ camera_id, date_from, date_to, model_name, confidence }`

Fetches all photo `file_id`s for the given camera and date range from the DB, then delegates to `openvino_analyze_batch()`. Used by the heatmap **CellSelBar** "Analyze" button to process all photos in selected cells without entering each hour individually.

Returns the same shape as `/openvino_analyze_batch`.

---

### `GET /openvino_thumbnail/{file_id}?model=yolov8n&confidence=0.25&excluded=стул,bench`

[`backend/routers/thumbnails_api.py`](../backend/routers/thumbnails_api.py) — `get_openvino_thumbnail()`

Returns a JPEG with bounding boxes drawn by YOLO's built-in `.plot()` renderer:
- Colored rectangle per detected object (automatic distinct color per class)
- Label: `person 0.87`, `cat 0.62` etc. (COCO English name + confidence)
- Output resized to max 640 × 640 px

**`excluded` param** (comma-separated, Russian or English labels): boxes for those classes are NOT drawn. Objects are still detected and saved to the DB — only the visual overlay is suppressed. Uses `excluded_to_en()` in `yolo_detect.py` to convert Russian → COCO English before filtering.

**On cache miss:** runs YOLO, draws filtered boxes, saves JPEG, and **also calls `save_ai_analysis()`** to persist ALL detected objects (including excluded ones — frontend filters them for display).

Cache key: `sha256("v1:{file_id}:{model}:{conf:.2f}:{sorted_excluded_en}")[:16].jpg`  
Directory: `backend/openvino_thumbnails_cache/` — included in `DELETE /all_thumbnails` cleanup.

### `GET /ai_analysis?file_ids=1,2,3`

Returns saved analysis rows for the given file IDs. Called by `HourViewer` on every page change to populate the icon/tooltip map.

### `GET /ai_objects_summary?camera_id=&date_from=&date_to=`

Returns unique object words across all `ai_analysis` rows for files in the given date range. Called by each `HeatmapCell` to show aggregate icons.

**API client functions:** [`frontend/src/api.js`](../frontend/src/api.js) — `geminiAnalyzeBatch`, `claudeAnalyzeBatch`, `openvinoAnalyzeBatch`, `getOpenVinoBboxThumbnailUrl`, `getAiAnalysis`, `getAiObjectsSummary`

---

## Database schema

Table `ai_analysis` in [`backend/database.py`](../backend/database.py):

```sql
CREATE TABLE IF NOT EXISTS ai_analysis (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id           INTEGER NOT NULL UNIQUE,        -- one row per photo
    provider          TEXT    NOT NULL DEFAULT 'gemini',
    model             TEXT    NOT NULL,
    analyzed_at       TEXT    NOT NULL DEFAULT (datetime('now')),
    scene_description TEXT,   -- shared scene sentence (empty for OpenVINO)
    image_description TEXT,   -- per-image description (empty for OpenVINO)
    objects           TEXT,   -- space-separated object words
    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
);
```

**UPSERT rule:** `UNIQUE(file_id)` — whichever analysis ran last wins. Running any provider on the same photo overwrites the previous result.

DB helpers: `save_ai_analysis()`, `get_ai_analysis_by_file_ids()` in [`backend/database.py`](../backend/database.py).

---

## Object vocabulary & emoji

Object words are short Russian (or English) keywords stored space-separated in `ai_analysis.objects`, e.g. `"человек кошка"`.

**[`frontend/src/aiHelpers.js`](../frontend/src/aiHelpers.js)**
- `OBJECT_EMOJI_DEFAULTS` — maps keyword → emoji character (100+ entries: all 80 COCO classes in English + Russian translations)
- `resolveAiIcons(objectsStr)` — splits string, filters excluded objects, deduplicates by label, returns `[{ emoji, label }]`
- `getExcludedObjects()` — reads `detection_excluded_objects` from localStorage, returns a `Set<string>`

**Display:** emoji `<span>` with `title={label}` (native browser tooltip). Unknown objects → `●`.

### Emoji customization (user-configurable)

| localStorage key | Format | Description |
|---|---|---|
| `detection_excluded_objects` | JSON array of strings | Objects to hide from all display (emoji icons, hover text, page summary). Backend still saves them to DB. Backend also skips drawing their bounding boxes (passed as `excluded` query param to `/openvino_thumbnail`) |
| `detection_emoji_overrides` | JSON object `{label: emoji}` | Per-label emoji overrides. Merged on top of `OBJECT_EMOJI_DEFAULTS` at read time |

### COCO classes detected by OpenVINO — Russian translation

`yolo_detect.py` → `COCO_TO_RUSSIAN` dict (23 entries mapped; unmapped classes fall back to English):

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

All remaining COCO 80 classes (bench, chair, tv, laptop, cell phone, etc.) fall through as English — they have emoji in `OBJECT_EMOJI_DEFAULTS`.  
`RUSSIAN_TO_COCO` (reverse map) and `excluded_to_en()` live in `yolo_detect.py` — used to convert user-supplied excluded labels (Russian or English) to COCO English class names for box filtering.

---

## OpenVINO model export — step-by-step

The default flow downloads a PyTorch `.pt` model and runs inference through the Python runtime. Exporting to OpenVINO format compiles the network graph for a specific Intel CPU architecture, enabling 2–5× faster inference.

### Why it's faster

| Runtime | How it works |
|---------|-------------|
| PyTorch `.pt` | Generic Python, uses standard x86 instructions |
| OpenVINO `.xml` | Compiled C++ graph optimised for AVX-512 / VNNI / AMX — Intel-specific matrix math instructions that PyTorch doesn't always use |

Expected speedup depends on CPU generation:

| CPU | Speedup |
|-----|---------|
| Intel 12th gen+ (Alder Lake, Raptor Lake, Meteor Lake) | 3–5× |
| Intel 10th–11th gen | 2–3× |
| Intel 8th–9th gen | 1.5–2× |
| AMD / very old Intel | minimal |

### Export procedure

All commands run in the `backend/` directory.

**Step 1 — activate the same Python environment used by the backend:**

```powershell
cd C:\REPOS\camera-snapshots-cleaner-claude\backend
```

**Step 2 — export the model (one-time, takes ~20 seconds):**

```powershell
python -c "from ultralytics import YOLO; YOLO('yolov8n.pt').export(format='openvino')"
```

This downloads `yolov8n.pt` (~6 MB) if not already cached, then creates a folder `yolov8n_openvino_model/` in the current directory containing:

```
yolov8n_openvino_model/
  yolov8n.xml        ← model graph (human-readable XML)
  yolov8n.bin        ← model weights (binary, ~12 MB)
  metadata.yaml
```

**Step 3 — move the folder into `backend/models/`:**

```powershell
mkdir models -ErrorAction SilentlyContinue
Move-Item yolov8n_openvino_model models\
```

Final path must be exactly:
```
backend/
  models/
    yolov8n_openvino_model/
      yolov8n.xml
      yolov8n.bin
      metadata.yaml
```

**Step 4 — restart the backend.**

On the next request the log will show:

```
🔷 Loading OpenVINO model: ...\backend\models\yolov8n_openvino_model
```

instead of:

```
🔷 Loading PyTorch model: yolov8n.pt (tip: export with ...)
```

### Exporting yolov8s or yolov8m

Same procedure, just change the model name:

```powershell
python -c "from ultralytics import YOLO; YOLO('yolov8s.pt').export(format='openvino')"
Move-Item yolov8s_openvino_model models\

python -c "from ultralytics import YOLO; YOLO('yolov8m.pt').export(format='openvino')"
Move-Item yolov8m_openvino_model models\
```

The backend selects the right folder automatically based on the model chosen in the UI.

### Verifying speedup

Run this in the `backend/` directory — it compares 10 inference runs with both runtimes:

```python
# save as benchmark.py, run: python benchmark.py <path-to-any-photo.jpg>
import sys, time
from pathlib import Path
from PIL import Image
from ultralytics import YOLO

img = Image.open(sys.argv[1]).convert("RGB")

# PyTorch
m1 = YOLO("yolov8n.pt")
m1(img, verbose=False)          # warm-up
t = time.time()
for _ in range(10): m1(img, verbose=False)
print(f"PyTorch:  {(time.time()-t)/10*1000:.0f} ms/photo")

# OpenVINO
ov = Path("models/yolov8n_openvino_model")
if ov.exists():
    m2 = YOLO(str(ov))
    m2(img, verbose=False)      # warm-up
    t = time.time()
    for _ in range(10): m2(img, verbose=False)
    print(f"OpenVINO: {(time.time()-t)/10*1000:.0f} ms/photo")
else:
    print("OpenVINO model not found — run export first")
```

```powershell
python benchmark.py "C:\path\to\any\photo.jpg"
```

Typical output on Intel i7-12700:
```
PyTorch:  1840 ms/photo
OpenVINO:  390 ms/photo
```

---

## Prompt template (Cloud AI)

The structured prompt is a template with `{n}` placeholder (replaced with actual image count at run time).

**Stored in:** `localStorage` key `gemini_structured_prompt`
**Editable in:** Tools modal → Google AI tab → "Structured prompt template"
**Fallback if empty:** `FALLBACK_STRUCTURED_TEMPLATE` constant in `GeminiAnalysisModal.jsx`

Claude uses `CLAUDE_STRUCTURED_TEMPLATE` in `ClaudeAnalysisModal.jsx`.

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
- **Model dropdown**: provider-specific models (same list as HourViewer's AiModePanel)
- **Threshold slider** (OpenVINO only): 10–80 %, default 25 %
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
- **Objects hover text** (`.hv-card-objects-hover`): appears on mouse hover, shows `emoji label` pairs joined by spaces; filtered via `resolveAiIcons()` (respects excluded list)
- **Hover description tooltip** (bottom of card, `.hv-card-ai-desc`): visible only when `mode.isAiMode === true`; shows `image_description`, object tags, model name
- **OpenVINO auto-refresh**: each `PhotoCard` fires `onImageLoad()` when its bbox thumbnail loads → debounced 1.5 s → single `reloadAiAnalysis()` call refreshes the map after the last image settles

### HourViewer — page-level objects summary (AiModePanel)

**File:** [`frontend/src/components/hour/AiModePanel.jsx`](../frontend/src/components/hour/AiModePanel.jsx)

Below the Run button, when at least one photo on the current page has been analysed, a row of emoji appears (`.hv-ai-page-objects`). These are the unique detected objects aggregated across **all photos on the current page** from `aiAnalysisMap`. Filtered via `resolveAiIcons()` (excluded objects are hidden). Each emoji has a `title` tooltip with the Russian/English label.

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

**File:** [`frontend/src/components/ToolsModal.jsx`](../frontend/src/components/ToolsModal.jsx)

| Tab | Setting | localStorage key |
|-----|---------|-----------------|
| **Detection** | Default OpenVINO confidence | `mode_params_openvino` → `{confidence: N}` (integer %) |
| **Detection** | Excluded objects (comma-separated) | `detection_excluded_objects` (JSON array) |
| **Detection** | Emoji overrides (`label = emoji` per line) | `detection_emoji_overrides` (JSON object) |
| Google AI | API key | `gemini_api_key` |
| Google AI | Model | `gemini_model` |
| Google AI | Prompt template | `gemini_structured_prompt` |
| Claude AI | API key | `claude_api_key` |
| Claude AI | Model | `claude_model` |

OpenVINO model is set inline via the AiModePanel model dropdown (writes `openvino_model`).  
`openvino_confidence` (float) is written only by `OpenVinoAnalysisModal` (the "Run" modal) — the AiModePanel slider uses `modeParams.confidence` (integer %) from `mode_params_openvino` instead.
