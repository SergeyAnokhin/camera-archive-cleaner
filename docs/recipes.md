# Change Recipes

Checklists for cross-cutting changes — the tasks that touch many files at once.
For *what each file does* see [`code-map.md`](code-map.md); this doc is the
*"which files do I touch to do X"* view.

Each recipe lists files in dependency order (backend → frontend → docs). Steps
marked **(docs)** keep the documentation in sync — see [`../CLAUDE.md`](../CLAUDE.md) §5.

---

## Add a new view mode

A server-side motion mode (like Erosion). Mode registry: [`viewModes/index.js`](../frontend/src/components/viewModes/index.js).

| # | File | What to add |
|---|---|---|
| 1 | `backend/<name>_thumbnails.py` | New generator `get_or_create_<name>_thumbnail(conn, file_id, page_file_ids, threshold)`; a `<NAME>_THUMB_DIR` cache-dir constant; a `_CACHE_VERSION` to bump when the algorithm changes |
| 2 | [`backend/routers/thumbnails_api.py`](../backend/routers/thumbnails_api.py) | New `GET /<name>_thumbnail/{file_id}` endpoint — reuse the `_parse_page_ids()` + `_page_thumbnail_response()` helpers |
| 3 | [`backend/routers/maintenance.py`](../backend/routers/maintenance.py) | New `DELETE /<name>_thumbnails`; also add the dir to `clear_all_thumbnails()` and `get_storage_info()` |
| 4 | [`frontend/src/api.js`](../frontend/src/api.js) | `get<Name>ThumbnailUrl(fileId, pageIds, threshold)` |
| 5 | `frontend/src/components/viewModes/<name>Mode.js` | Export `{ key, label, params, getImageUrl }` (copy [`erosionMode.js`](../frontend/src/components/viewModes/erosionMode.js)) |
| 6 | [`viewModes/index.js`](../frontend/src/components/viewModes/index.js) | `import` it and append to `VIEW_MODES` |
| 7 | **(docs)** [`visualization-modes.md`](visualization-modes.md) | New mode section + a row in the cache-management table |
| 8 | **(docs)** [`api.md`](api.md), [`code-map.md`](code-map.md) | New endpoint row; new backend + `viewModes/` file rows |

**AI mode variant:** add `isAiMode: true` and `aiProvider` to the mode object; add
`needsCompute: true` if it relies on the [compute-service](compute-service.md)
(so it auto-hides when compute is off). See [`ai-analysis.md`](ai-analysis.md).

---

## Add a new AI provider

Beside Gemini / Claude / OpenVINO. Provider logic lives in [`ai_providers/`](../backend/ai_providers/); no DB schema change — `ai_analysis.provider` is a free-text column.

| # | File | What to add |
|---|---|---|
| 1 | `backend/ai_providers/<provider>.py` | `analyze_batch(file_ids, prompt, model, api_key)` — use the shared helpers in [`common.py`](../backend/ai_providers/common.py) for image loading / JSON parsing / cost / `save_ai_analysis()` |
| 2 | [`ai_providers/__init__.py`](../backend/ai_providers/__init__.py) | Export the new module |
| 3 | [`backend/routers/ai.py`](../backend/routers/ai.py) | Request `BaseModel` + `POST /<provider>_analyze_batch` endpoint delegating to the provider |
| 4 | [`backend/ai_pricing.py`](../backend/ai_pricing.py) | Per-token pricing table (cloud providers only) |
| 5 | [`frontend/src/api.js`](../frontend/src/api.js) | `<provider>AnalyzeBatch()` client function |
| 6 | `frontend/src/components/viewModes/<provider>Mode.js` + [`index.js`](../frontend/src/components/viewModes/index.js) | Mode with `isAiMode: true`, `aiProvider: '<provider>'` |
| 7 | `frontend/src/components/<Provider>AnalysisModal.jsx` | Analysis modal (copy [`ClaudeAnalysisModal.jsx`](../frontend/src/components/ClaudeAnalysisModal.jsx)) |
| 8 | [`hour/AiModePanel.jsx`](../frontend/src/components/hour/AiModePanel.jsx) | Add the provider + its model list to `AI_PROVIDER_CONFIG` |
| 9 | `frontend/src/components/tools/<Provider>AiTab.jsx` | Settings tab; register it in [`ToolsModal.jsx`](../frontend/src/components/ToolsModal.jsx); add keys to [`tools/settingsConfig.js`](../frontend/src/components/tools/settingsConfig.js) |
| 10 | [`aiHelpers.js`](../frontend/src/aiHelpers.js) | Extend `OBJECT_EMOJI_DEFAULTS` if the provider returns new object words |
| 11 | **(docs)** [`ai-analysis.md`](ai-analysis.md), [`settings.md`](settings.md), [`code-map.md`](code-map.md) | New provider rows |

---

## Add a new API endpoint

| # | File | What to add |
|---|---|---|
| 1 | `backend/routers/<area>.py` | Add the endpoint to the router that matches its responsibility (see the [`code-map.md`](code-map.md) routers table). Create a new router file only for a genuinely new area |
| 2 | [`backend/main.py`](../backend/main.py) | Only if a new router file: `app.include_router(...)` + update the docstring endpoint map |
| 3 | [`backend/database.py`](../backend/database.py) | If the endpoint reads/writes the DB, add a query function here rather than inline SQL — see the seam rule in [`subsystems.md`](subsystems.md) |
| 4 | [`frontend/src/api.js`](../frontend/src/api.js) | Client function — the only frontend file that knows API URLs |
| 5 | **(docs)** [`api.md`](api.md), [`code-map.md`](code-map.md) | New endpoint row; new router row if a file was added |

---

## Add a new user setting

All settings live in browser `localStorage`. The full procedure — key naming,
defaults, the relevant Tools tab, YAML export/import — is already covered by the
**"Summary: where to look for each setting"** table at the bottom of
[`settings.md`](settings.md). Start there.
