# AI Analysis — Architecture & Reference

How the AI image analysis feature works: from API request to stored results to on-screen display.

---

## Overview

The app can send camera snapshots to an external AI API (Google Gemini or Anthropic Claude), receive a structured description of each image, persist the results to SQLite, and display object icons on every view level (individual photo cards, hour/day/month cells in the heatmap).

---

## Supported providers

| Provider | Key in DB | localStorage key (API key) | localStorage key (model) |
|----------|-----------|---------------------------|--------------------------|
| Google Gemini | `gemini` | `gemini_api_key` | `gemini_model` |
| Anthropic Claude | `claude` | `claude_api_key` | `claude_model` |

Model lists and pricing are defined in:
- [`frontend/src/components/HourViewer.jsx`](../frontend/src/components/HourViewer.jsx) — `AI_PROVIDER_CONFIG` constant (used in the mode-settings panel)
- [`frontend/src/components/ToolsModal.jsx`](../frontend/src/components/ToolsModal.jsx) — `GEMINI_MODELS / GEMINI_PRICING`, `CLAUDE_MODELS / CLAUDE_PRICING` (used in the Settings tabs)

API keys and model choice are stored in `localStorage` only — they never reach the backend except as part of the analysis request body.

---

## View modes

Each provider has a dedicated **view mode** registered in the mode switcher:

| Mode key | Label | File |
|----------|-------|------|
| `gemini_analysis` | Gemini Analysis | [`frontend/src/components/viewModes/geminiMode.js`](../frontend/src/components/viewModes/geminiMode.js) |
| `claude_analysis` | Claude Analysis | [`frontend/src/components/viewModes/claudeMode.js`](../frontend/src/components/viewModes/claudeMode.js) |

Both modes set `isAiMode: true` and `aiProvider: 'gemini' | 'claude'`. This flag:
- Replaces the normal mode-settings panel with `AiModePanel` (model selector + Run button + stats)
- Enables the per-card hover description tooltip
- Is checked in `HeatmapCell` logic (no effect there — cells always show icons regardless of active mode)

Mode registration: [`frontend/src/components/viewModes/index.js`](../frontend/src/components/viewModes/index.js)

---

## Request flow — "Run" button

```
User clicks Run
    │
    ▼
AiModePanel (HourViewer.jsx)
    │  reads model from localStorage
    │  determines target file IDs (selected or all photos on page)
    │
    ├─ provider === 'gemini' ──► GeminiAnalysisModal.jsx
    │                               POST /gemini_analyze_batch
    │
    └─ provider === 'claude' ──► ClaudeAnalysisModal.jsx
                                    POST /claude_analyze_batch
```

### What the modals do

1. Show the editable structured prompt (pre-filled from localStorage template or fallback)
2. On submit: call the backend endpoint with `{ file_ids, prompt, model, api_key }`
3. Show stats on completion: elapsed time, token counts, cost, saved count
4. Call `onComplete()` → triggers `recordAiRequest(provider)` (localStorage stats) + `reloadAiAnalysis()` (refreshes icon map for current page)

**Modal files:**
- [`frontend/src/components/GeminiAnalysisModal.jsx`](../frontend/src/components/GeminiAnalysisModal.jsx)
- [`frontend/src/components/ClaudeAnalysisModal.jsx`](../frontend/src/components/ClaudeAnalysisModal.jsx)
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

Same flow, but:
- Converts images to base64 JPEG
- Sends as `image` content blocks via `anthropic` SDK (`client.messages.create()`)
- Same JSON response format expected

### `GET /ai_analysis?file_ids=1,2,3`

Returns saved analysis rows for the given file IDs. Called by `HourViewer` on every page change to populate the icon/tooltip map.

### `GET /ai_objects_summary?camera_id=&date_from=&date_to=`

Returns unique object words found across all `ai_analysis` rows for files in the given date range. Called by each `HeatmapCell` to show aggregate icons. Returns `{ objects: ["мужчина", "кошка", ...] }`.

**API client functions:** [`frontend/src/api.js`](../frontend/src/api.js) — `claudeAnalyzeBatch`, `geminiAnalyzeBatch`, `getAiAnalysis`, `getAiObjectsSummary`

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
    scene_description TEXT,   -- shared scene sentence
    image_description TEXT,   -- per-image description
    objects           TEXT,   -- space-separated object words
    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
);
```

**UPSERT rule:** `UNIQUE(file_id)` — whichever analysis ran last wins. `provider`, `model`, and `analyzed_at` record which run produced the current data. Running Gemini after Claude (or vice versa) on the same photo will overwrite the previous result.

DB helpers: `save_ai_analysis()`, `get_ai_analysis_by_file_ids()` in [`backend/database.py`](../backend/database.py).

---

## Object vocabulary & icons

Object words are short Russian (or English) keywords stored space-separated in `ai_analysis.objects`, e.g. `"мужчина кошка дождь"`.

The icon map and deduplication logic live in a **shared helper** used by both HourViewer and HeatmapCell:

**[`frontend/src/aiHelpers.js`](../frontend/src/aiHelpers.js)**
- `AI_ICON_MAP` — maps keyword → `{ mdi: 'mdi-xxx', color: '#rrggbb' }`
- `resolveAiIcons(objectsStr)` — splits string, looks up icons, deduplicates by MDI class

### People keywords

| Word | Icon | Color |
|------|------|-------|
| `мужчина` | `mdi-human-male` | blue `#60a5fa` |
| `женщина` | `mdi-human-female` | pink `#f9a8d4` |
| `ребёнок` / `мальчик` | `mdi-human-child` | cyan / blue |
| `девочка` | `mdi-human-child` | pink |
| `человек` | `mdi-account` | blue (fallback if gender unknown) |

### Animal keywords

| Word | Icon |
|------|------|
| `кошка` / `кот` | `mdi-cat` |
| `собака` | `mdi-dog` |
| `птица` | `mdi-bird` |
| `курица` | `mdi-bird` (yellow) |
| `кролик` | `mdi-rabbit` |
| `лиса` | `mdi-fox` |
| `конь` / `лошадь` | `mdi-horse` |
| `корова` | `mdi-cow` |
| `белка` / `ёж` | `mdi-paw` |

---

## Prompt template

The structured prompt is a template with `{n}` placeholder (replaced with actual image count at run time).

**Stored in:** `localStorage` key `gemini_structured_prompt`  
**Editable in:** Tools modal → Google AI tab → "Structured prompt template"  
**Fallback if empty:** `FALLBACK_STRUCTURED_TEMPLATE` constant in `GeminiAnalysisModal.jsx`

Claude uses the same prompt structure, defined as `CLAUDE_STRUCTURED_TEMPLATE` in `ClaudeAnalysisModal.jsx`. (No separate settings tab for Claude prompt yet — edit directly in the modal before running.)

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

## Display — where icons appear

### HourViewer — per-photo card

**File:** [`frontend/src/components/HourViewer.jsx`](../frontend/src/components/HourViewer.jsx) — `PhotoCard` component

- AI data loaded on every page change via `getAiAnalysis(pagePhotoIds)` → stored in `aiAnalysisMap` (Map keyed by `file_id`)
- **Icons overlay** (top-left corner): always visible in all modes
- **Hover description tooltip** (bottom of card): visible only when `mode.isAiMode === true`; click to expand/collapse full text
- CSS: [`frontend/src/components/HourViewer.css`](../frontend/src/components/HourViewer.css) — `.hv-card-ai-icons`, `.hv-card-ai-desc`

### HeatmapCell — day/hour/month cells

**File:** [`frontend/src/components/HeatmapCell.jsx`](../frontend/src/components/HeatmapCell.jsx)

- Calls `getAiObjectsSummary(cameraId, dateFrom, dateTo)` on mount (same lazy pattern as thumbnail previews)
- Shows up to 5 deduplicated icons below the thumbnail strip
- CSS: [`frontend/src/components/HeatmapCell.css`](../frontend/src/components/HeatmapCell.css) — `.cell-ai-icons`

---

## Request statistics

Tracked purely in `localStorage` — no backend storage.

**Functions in** `HourViewer.jsx`:
- `recordAiRequest(provider)` — appends timestamp, prunes entries older than 25h
- `getAiRequestStats(provider)` — returns `{ lastMinute, last24h }` counts

Displayed in `AiModePanel` after each completed analysis. Counts reset if you clear browser storage.

---

## Settings (Tools modal)

**File:** [`frontend/src/components/ToolsModal.jsx`](../frontend/src/components/ToolsModal.jsx)

| Tab | Setting | localStorage key |
|-----|---------|-----------------|
| Google AI | API key | `gemini_api_key` |
| Google AI | Model | `gemini_model` |
| Google AI | Structured prompt template | `gemini_structured_prompt` |
| Claude AI | API key | `claude_api_key` |
| Claude AI | Model | `claude_model` |
