# Settings & localStorage

All user settings are stored in the **browser's localStorage**. Nothing is written to the server or any file on disk. Settings persist across page reloads and browser restarts, but are tied to the browser profile — clearing browser data will reset them.

To inspect or clear them manually: browser DevTools → Application → Local Storage → `http://localhost:5173`.

---

## UI settings (Tools modal → General tab)

Defined in [`frontend/src/components/ToolsModal.jsx`](../frontend/src/components/ToolsModal.jsx).

| localStorage key | Default | Range | Description |
|---|---|---|---|
| `font-base` | `15` | 12–22 px | Global font size. Applied as CSS variable `--font-base` on `<html>` |
| `previews_per_cell` | `3` | 0–10 | Number of thumbnail previews inside each heatmap cell. `0` disables them |

---

## Hour viewer settings (Tools modal → Hour view tab)

| localStorage key | Default | Range | Description |
|---|---|---|---|
| `hour_page_size` | `50` | 10–200 | Files per page in HourViewer |
| `thumb_width` | `140` | 80–400 px | Minimum column width of photo cards in the grid |
| `hover_zoom` | `1.5` | 1.0–3.0 | Photo scale factor on mouse hover. `1.0` disables zoom |
| `diff_threshold` | `20` | 0–100 | Motion sensitivity threshold. Used as the default for all motion modes |
| `video_preview_mode` | `none` | — | Preview mode for video cards: `none` (camera icon), `first_frame`, `last_frame`, `four_frames` (2×2 grid), `max_change_gif` (animated GIF). Thumbnail generated and cached by `/video_thumbnail` |

---

## Per-mode parameters (HourViewer, set via mode settings panel)

Each visualization mode stores its own threshold independently.  
Key pattern: `mode_params_<mode_key>` (JSON object).

| localStorage key | Example value | Description |
|---|---|---|
| `mode_params_motion_diff` | `{"threshold":20}` | Motion Diff threshold |
| `mode_params_diff_zoom` | `{"threshold":20}` | Diff Zoom threshold |
| `mode_params_erosion` | `{"threshold":20}` | Erosion threshold |
| `mode_params_neon_mask` | `{"threshold":20}` | Neon Mask threshold |
| `mode_params_mhi` | `{"threshold":20}` | MHI threshold |
| `mode_params_bounding_boxes` | `{"threshold":20}` | Bounding Boxes threshold |
| `mode_params_motion_stacking` | `{"threshold":20}` | Motion Stacking threshold |
| `mode_params_openvino_detection` | `{"confidence":25}` | OpenVINO confidence % (10–80). Used for the AiModePanel slider and bbox thumbnail URL |

Initial value for motion modes is taken from `diff_threshold` (the global default). OpenVINO defaults to 25.

---

## Active view mode

| localStorage key | Default | Description |
|---|---|---|
| `hour_view_mode` | `normal` | Currently selected view mode key in HourViewer |

---

## Google AI settings (Tools modal → Google AI tab)

| localStorage key | Default | Description |
|---|---|---|
| `gemini_api_key` | `''` | Google AI Studio API key. Sent to the backend only as part of the analysis request body |
| `gemini_model` | `gemini-3.1-flash-lite` | Selected Gemini model |
| `gemini_structured_prompt` | (long template) | Prompt template for batch analysis. `{n}` is replaced with the image count at run time |

---

## Claude AI settings (Tools modal → Claude AI tab)

| localStorage key | Default | Description |
|---|---|---|
| `claude_api_key` | `''` | Anthropic API key. Sent to the backend only as part of the analysis request body |
| `claude_model` | `claude-haiku-4-5-20251001` | Selected Claude model |

---

## Detection settings (Tools modal → Detection tab)

| localStorage key | Default | Description |
|---|---|---|
| `mode_params_openvino` | `{"confidence":25}` | Default OpenVINO confidence % (10–80). Also used by AiModePanel slider. Written by both the Detection tab and the AiModePanel slider |
| `detection_excluded_objects` | `[]` (JSON array) | Labels to hide from emoji display and hover text. Backend also skips drawing boxes for these classes. E.g. `["стул","bench"]` |
| `detection_emoji_overrides` | `{}` (JSON object) | Custom emoji per label. Merged over `OBJECT_EMOJI_DEFAULTS` at display time. E.g. `{"машина":"🏎️"}` |

## OpenVINO (local AI) settings

> **Two places, one concept — don't confuse them:**
> - **Default threshold** → Tools modal → Detection tab → writes `mode_params_openvino` (JSON, integer %). This is only the starting value loaded when the hour viewer opens.
> - **Live threshold** → `AiModePanel` slider in HourViewer → reads and writes the same `mode_params_openvino.confidence` key in real time. The slider in the UI *is* the authoritative value while browsing; the Detection tab just sets its initial default.
> - **`openvino_confidence`** (float 0–1) is a *separate* key used only by `OpenVinoAnalysisModal` (the standalone "Run" modal). It is **not** the same as `mode_params_openvino.confidence`.

| localStorage key | Default | Description |
|---|---|---|
| `openvino_model` | `yolov8n` | Selected YOLO model. Options: `yolov8n`, `yolov8s`, `yolov8m`. Written by the AiModePanel dropdown and the heatmap CellSelBar |
| `openvino_confidence` | `0.25` | Float 0–1. Used **only** by `OpenVinoAnalysisModal` (the standalone "Run" button). Do not confuse with `mode_params_openvino.confidence` (integer %) used by AiModePanel |

---

## Distribution uniformity settings (Tools modal → Hour view tab)

Warns when recordings in an hour are suspiciously evenly spread (wind/rain false triggers).
Three metrics, each 0 = single concentrated event, 100 = recording every minute.

| localStorage key | Default | Description |
|---|---|---|
| `uniformity_method` | `combined` | Which metric shows in day-view hour cells: `combined`, `active`, `entropy`, `bc` |
| `uniformity_af_warn` | `40` | AF warn threshold (yellow badge) |
| `uniformity_af_alert` | `65` | AF alert threshold (red badge) |
| `uniformity_se_warn` | `55` | SE warn threshold |
| `uniformity_se_alert` | `80` | SE alert threshold |
| `uniformity_bc_warn` | `40` | BC warn threshold |
| `uniformity_bc_alert` | `65` | BC alert threshold |
| `uniformity_combined_warn` | `50` | Combined score warn threshold |
| `uniformity_combined_alert` | `72` | Combined score alert threshold |

**Three metrics computed by `computeUniformity()` in `hourUtils.js`:**

| Key | Label | Formula | 0 = … | 100 = … |
|---|---|---|---|---|
| `active` | AF | `nActive / 60 × 100` | 1 recording in 1 minute | every minute has a recording |
| `entropy` | SE | `H / log₂(60) × 100` | all in one minute (H=0) | perfectly uniform across hour |
| `bc` | BC | `activeBlocks / 12 × 100` | 1 of 12 five-minute blocks active | all 12 blocks active |

Combined score = `0.40×AF + 0.35×SE + 0.25×BC`.

Badges appear: in `DistributionChart` header (all three, always, green/yellow/red); in `HeatmapCell` at hour level (only selected method, only when warn or alert).

---

## Navigation state

| localStorage key | Description |
|---|---|
| `nav_state` | JSON object: current drill-down level, selected camera, date range. Restored on page reload so the user returns to where they were |

---

## AI request statistics (HourViewer, in-memory display only)

| localStorage key | Description |
|---|---|
| `ai_requests_gemini` | JSON array of Unix timestamps of Gemini analysis runs (last 25 h) |
| `ai_requests_claude` | JSON array of Unix timestamps of Claude analysis runs (last 25 h) |

Used to display "last minute / last 24 h" request counts in the AI mode panel. Entries older than 25 h are pruned automatically on each new request.

---

## Export / Import (Tools modal → General tab)

All settings can be saved to and loaded from a YAML file via the **Export YAML** / **Import YAML** buttons.

### Export

Downloads `snapshots-settings.yaml` to the browser's downloads folder. Contains all settings listed above except `nav_state` and `ai_requests_*` (those are session/stats state, not configuration).

Example output:
```yaml
# Camera Snapshots Cleaner — settings export
# Generated: 2026-05-19T10:30:00.000Z

ui:
  font_size: 15
  previews_per_cell: 3
hour_view:
  page_size: 50
  thumb_width: 140
  hover_zoom: 1.5
  diff_threshold: 20
  view_mode: normal
motion_modes:
  motion_diff:
    threshold: 20
  erosion:
    threshold: 25
  # ... other modes
google_ai:
  model: gemini-2.5-flash
  api_key: '# Get your key at aistudio.google.com'
  prompt: |
    Ты анализируешь {n} снимков...
claude_ai:
  model: claude-haiku-4-5-20251001
  api_key: '# Get your key at console.anthropic.com'
```

### Import

Reads a `.yaml` / `.yml` file and applies recognised settings. **Lenient by design:**
- `api_key` fields → **never imported** (always skipped to protect credentials)
- Missing keys → skipped, current value kept
- Wrong type (e.g. string instead of number) → skipped
- Out-of-range number → clamped to valid range
- YAML parse error → shows error message, nothing is applied
- Unknown top-level keys → ignored

This means old config files always work safely — only the keys that exist and are valid get applied.

After import, all settings take effect immediately without a page reload (UI dispatches `CustomEvent` for each changed setting).

---

## Summary: where to look for each setting

| If you want to change… | File |
|---|---|
| Default values, ranges, key names | [`frontend/src/components/ToolsModal.jsx`](../frontend/src/components/ToolsModal.jsx) |
| Per-mode threshold defaults | [`frontend/src/components/HourViewer.jsx`](../frontend/src/components/HourViewer.jsx) — `buildInitialModeParams()` |
| Navigation state persistence | [`frontend/src/App.jsx`](../frontend/src/App.jsx) — `NAV_STATE_KEY` |
| AI request stats tracking | [`frontend/src/components/HourViewer.jsx`](../frontend/src/components/HourViewer.jsx) — `recordAiRequest()`, `getAiRequestStats()` |
