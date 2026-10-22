# Hour viewer — selection presets ("Select without objects")

In selection mode the [`SelectionBar`](../frontend/src/components/hour/SelectionBar.jsx) has, besides **All** / **None**, one extra button per *preset*: it selects the photos of the current page in which the preset's objects were **not** detected, plus the videos recorded around them. Presets are user-defined in **Tools → View → Selection presets**. Defaults: **No objects** (any object counts) and **No person/animal** (person, bird, cat, dog, horse, sheep, cow, elephant, bear, zebra, giraffe).

---

## Rules (pinned by [`selectByObjects.test.js`](../frontend/src/components/hour/selectByObjects.test.js))

| Item | Selected when |
|---|---|
| Photo | It **was analysed** (has an `object_detection` row — YOLO result) **and** the row contains none of the preset's classes. Empty class list = any non-empty result counts as a hit |
| Photo, not analysed | Never selected — "not analysed" is not "nothing there". Counted in the button tooltip ("N photo(s) not analysed yet — skipped") |
| Video | Videos have no detection of their own. It follows the photos within **±30 s** (`VIDEO_MATCH_WINDOW_SEC`): selected only if at least one photo is near **and all** of them are analysed and clear |
| Video near a page edge | Skipped if it lies within 30 s of the first/last file of a page that has a neighbouring page (the paired photos may be on the other page) |

Only **YOLO detection** (`detection` in the `/ai_analysis` result) is used. Gemini/Claude results are ignored: they use a different, finer vocabulary (`мужчина`, `женщина`), so "no person" could not be decided reliably from them. Class names are matched by English **and** Russian COCO name ([`cocoClasses.js`](../frontend/src/cocoClasses.js)), as whole words (so `traffic light` works).

"No objects" is relative to what YOLO was **allowed to detect** (Tools → AI → "Objects to detect", default person + a few animals/bags). A car in the frame does not count if `car` was not enabled there.

The selection **replaces** the current one (like **All**). Scope is the **current page** — the same set `All` uses. Buttons show the live count and are disabled at 0; counts update when detection results load.

> **Delete interaction:** `/delete/preview` independently adds videos within ±5 s of any selected photo (shown as "related videos" in the confirm modal). A video kept by the rule above can still be pulled in that way if an empty photo lies within 5 s of it — check the modal before confirming.

## Data flow

```
Tools → View → Selection presets ──► localStorage `select_presets` (+ `select-presets-change` event, synced via settings.json)
                                          │
HourViewer: presetButtons (useMemo over files + aiAnalysisMap + page/totalPages)
   └─ selectFilesWithoutObjects(files, aiMap, preset.classes, {hasPrevPage, hasNextPage})
          └─► SelectionBar buttons (label + count)  ──click──► selectPreset() → selectedMap
```

## Files

| File | Role |
|---|---|
| [`hour/selectByObjects.js`](../frontend/src/components/hour/selectByObjects.js) | Pure logic: `selectFilesWithoutObjects()`, `VIDEO_MATCH_WINDOW_SEC` |
| [`tools/selectPresets.js`](../frontend/src/components/tools/selectPresets.js) | `loadSelectPresets()`, `saveSelectPresets()`, `sanitizePresets()` (used by settings import too) |
| [`tools/settingsConfig.js`](../frontend/src/components/tools/settingsConfig.js) | `SELECT_PRESETS_KEY`, `SELECT_PRESETS_DEFAULT` |
| [`tools/HourViewTab.jsx`](../frontend/src/components/tools/HourViewTab.jsx) | Presets editor (name, class checklist, add/delete/defaults) |
| [`hour/SelectionBar.jsx`](../frontend/src/components/hour/SelectionBar.jsx) | Renders the preset buttons |
| [`HourViewer.jsx`](../frontend/src/components/HourViewer.jsx) | Computes `presetButtons`, `selectPreset()` |
