# Settings & Server Synchronization

All user UI preferences, thresholds, and view configuration are synchronized with the server's `backend/settings.json` file. The browser's `localStorage` acts as a local cache for immediate access.

> [!IMPORTANT]
> **API Keys Security**: To protect credentials, the Gemini and Claude API keys (`gemini_api_key` and `claude_api_key`) are kept **strictly on the frontend** in the browser's `localStorage`. They are never uploaded or saved to the server.

To inspect or clear the cached settings manually: browser DevTools → Application → Local Storage → `http://localhost:5173`.

**Sync direction on page load** (`App.jsx`, mount effect): `GET /settings` is called once.
- If the server has any settings saved → they **overwrite** this browser's local values (server wins).
- If the server is empty → this browser's current local values are pushed up via `POST /settings` (first browser to load seeds the server).

Every subsequent save (Tools modal, General tab) also calls `POST /settings`, so the
**last browser to save wins** for any two browsers that edit settings independently —
there is no merge. This makes the server a convenience mirror for opening the same
camera archive from a second browser/device, not a source of truth to resolve conflicts.


---

## UI settings (Tools modal → General tab)

Keys and defaults are defined in [`tools/settingsConfig.js`](../frontend/src/components/tools/settingsConfig.js); each Tools tab is its own component under [`tools/`](../frontend/src/components/tools/).

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
| `video_preview_mode` | `none` | — | Preview mode for video cards: `none` (camera icon), `first_frame`, `last_frame`, `four_frames` (2×2 JPEG grid), `max_change_gif` (2-frame GIF), `four_frames_gif` (4-frame GIF evenly spaced), `max_change_4_gif` (4-frame GIF max-change). Thumbnail generated and cached by `/video_thumbnail` |

---

## Per-mode parameters (HourViewer, set via mode settings panel)

Each visualization mode stores its own threshold independently.  
Key pattern: `mode_params_<mode_key>` (JSON object).

| localStorage key | Example value | Description |
|---|---|---|
| `mode_params_motion_diff` | `{"threshold":20}` | Motion highlight threshold |
| `mode_params_openvino_detection` | `{"confidence":25}` | OpenVINO confidence % (10–80). Written by Tools → AI tab (Detection section) and OpenVinoAnalysisModal. Read-only in AiModePanel and CellSelBar |

Initial value for motion modes is taken from `diff_threshold` (the global default). OpenVINO defaults to 25.

---

## Active view mode

| localStorage key | Default | Description |
|---|---|---|
| `hour_view_mode` | `normal` | Currently selected view mode key in HourViewer |

---

## AI settings (Tools modal → AI tab → Google Gemini / Claude Anthropic sections)

The AI tab is a single component, [`tools/AiTab.jsx`](../frontend/src/components/tools/AiTab.jsx),
with three sections: **Detection**, **Google Gemini**, **Claude Anthropic**.
(There is no separate Detection tab — it was merged in; `TAB_ALIASES` in
`ToolsModal.jsx` still maps the old `detection` deep-link id to `ai`.)

| localStorage key | Default | Description |
|---|---|---|
| `gemini_api_key` | `''` | Google AI Studio API key. Sent to the backend only as part of the analysis request body |
| `gemini_model` | `gemini-3.1-flash-lite` | Selected Gemini model |
| `gemini_structured_prompt` | (long template) | Prompt template for batch analysis. `{n}` is replaced with the image count at run time |
| `claude_api_key` | `''` | Anthropic API key. Sent to the backend only as part of the analysis request body |
| `claude_model` | `claude-haiku-4-5-20251001` | Selected Claude model |

---

## Detection settings (Tools modal → AI tab → Detection section)

| localStorage key | Default | Description |
|---|---|---|
| `openvino_model` | `yolov8n` | Selected YOLO model. Options: `yolov8n`, `yolov8s`, `yolov8m`. Written **only** by the AI tab's Detection section. `AiModePanel` and `CellSelBar` display this value read-only |
| `mode_params_openvino_detection` | `{"confidence":25}` | OpenVINO confidence % (10–80). Written by the AI tab's Detection section and `OpenVinoAnalysisModal`. Read-only in `AiModePanel` and `CellSelBar` |
| `detection_classes` | `[0,14,15,16,24,26]` (JSON array of COCO class IDs) | Which YOLO classes the model is allowed to detect — passed as the `classes=` inference param so other classes are skipped entirely. UI: 80-class emoji checklist in the Detection section (All / None / Defaults). Class list lives in [`frontend/src/cocoClasses.js`](../frontend/src/cocoClasses.js). Empty/unset → detect all 80 |

---

## Compute service settings (Tools modal → Compute tab)

These keys **cache** the server-side compute-service config (source of truth:
`backend/compute_config.json`). The frontend reads them synchronously to hide
heavy view modes; they are refreshed from the backend on each page load and
whenever the Compute tab saves. See [`compute-service.md`](compute-service.md).

| localStorage key | Default | Description |
|---|---|---|
| `compute_mode` | (mirrored, `kubernetes` for a fresh config) | `off` / `kubernetes` / `local` / `remote` — mirrors `VALID_MODES` in [`compute_config.py`](../backend/compute_config.py). Not defaulted in the frontend: written verbatim from the backend's `cfg.mode` by [`main.jsx`](../frontend/src/main.jsx) on page load and by `ComputeTab` on save. When `off`, view modes flagged `needsCompute` are hidden in the HourViewer |
| `compute_mode_ui` | `''` | **UI-level label only, distinct from `compute_mode`.** Holds `browser` for an auto-detected browser-local service — the backend mode in that case is `remote`. Written only by `ComputeTab`; never sent to the backend |
| `compute_remote_url` | `''` | Base URL of the remote compute-service (used when mode is `local` or `remote`; `kubernetes` uses a fixed in-cluster DNS name) |

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

Top-level groups: `ui`, `hour_view`, `motion_modes`, `google_ai`, `claude_ai`.
`api_key` fields are emitted as a placeholder comment, never the real key.
The writer is `exportSettingsYaml()` in
[`settingsIO.js`](../frontend/src/components/tools/settingsIO.js) — read it for
the exact shape, and see [`snapshots-settings.example.yaml`](../snapshots-settings.example.yaml)
for a full sample file.

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
| Default values, ranges, key names | [`tools/settingsConfig.js`](../frontend/src/components/tools/settingsConfig.js) |
| A specific tab's UI / change handlers | [`tools/`](../frontend/src/components/tools/) — one component per tab (`GeneralTab.jsx`, `HourViewTab.jsx`, …) |
| YAML export / import logic | [`tools/settingsIO.js`](../frontend/src/components/tools/settingsIO.js) |
| Per-mode threshold defaults | [`frontend/src/components/HourViewer.jsx`](../frontend/src/components/HourViewer.jsx) — `buildInitialModeParams()` |
| Navigation state persistence | [`frontend/src/components/navUtils.js`](../frontend/src/components/navUtils.js) — `NAV_STATE_KEY`, `loadNavState`/`saveNavState` |
| AI request stats tracking | [`frontend/src/components/HourViewer.jsx`](../frontend/src/components/HourViewer.jsx) — `recordAiRequest()`, `getAiRequestStats()` |
