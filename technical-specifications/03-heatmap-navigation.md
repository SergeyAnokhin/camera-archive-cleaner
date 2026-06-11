# 03 — Heatmap Navigation

The main screen. A grid of cells whose colour intensity reflects how much
footage exists in each period, with hierarchical drill-down.

## 1. Levels and drill-down

```
Years overview ──► Year (12 month cells) ──► Month (day cells) ──► Day (24 hour cells) ──► Hour viewer (part 04)
```

- Clicking a cell descends one level; a **breadcrumb** (e.g.
  `All years / 2024 / Nov / 16`) allows jumping back to any ancestor level.
- Clicking an hour cell opens the **hour viewer** (part 04).
- Empty cells (no files) are rendered but inert.
- The current navigation position (level, camera, period) is **persisted
  client-side and restored on reload**, so the user returns to where they were.

## 2. Screen layout

| Element | Content |
|---------|---------|
| Header | Archive totals for the selected scope: total size (GB), photo count, video count |
| Camera selector | One button per configured camera; switching cameras keeps the navigation level where possible |
| Breadcrumb | Current drill-down path |
| Heatmap grid | The cells of the current level |
| Statistics chart | Bar chart of total size per period at the current level |
| Rescan control | Triggers a scan (part 02) and refreshes the screen when it completes |
| Tools | Opens the settings dialog (part 09) |
| Tasks / Tuning | Open the task queue screen (part 07) and the model-tuning screen (part 08) |
| Keyboard hints | Footer strip listing the active shortcuts |

## 3. Cell content

Each non-empty cell shows:

1. **Intensity colour** — background colour scaled by the cell's file count
   relative to its siblings (classic heatmap shading).
2. **Count badges** — photo count and video count.
3. **Preview strip** — N small thumbnails sampled uniformly across the cell's
   period (N configurable 0–10, default 3; 0 disables the strip).
4. **AI object icons** — up to 5 deduplicated emoji representing object kinds
   detected anywhere in the cell's period (see part 05 §5). Cells refresh
   their icons after a batch analysis completes.
5. **Viewed-status strip** — a thin coloured edge indicating whether the user
   has already reviewed this period (see §6).
6. **Uniformity badge** (hour cells only) — a yellow/red warning when the
   hour's recordings are suspiciously evenly spread over the hour, which
   typically indicates wind/rain false triggers rather than a single event
   (metrics and thresholds in part 04 §5).
7. **Tooltip** — on hover: period, counts, size.

## 4. Keyboard navigation

The heatmap is fully keyboard-operable (shortcuts inactive while the hour
viewer or a modal is open):

| Key | Action |
|-----|--------|
| Arrow keys | Move cell focus within the grid |
| `Enter` | Drill into the focused cell |
| `Esc` | Go up one level / exit selection mode |
| `Space` | Toggle selection of the focused cell (enters selection mode) |
| `Ctrl+A` | Select all non-empty cells at the current level (enters selection mode) |

## 5. Cell selection mode (bulk operations)

Available at the **day level** (selecting hour cells) and the **month level**
(selecting day cells). Entered via a "Select" button, `Space`, or `Ctrl+A`;
exited via `Esc` or Cancel.

While active, clicking cells toggles them and a **selection toolbar** appears
with two rows:

**Row 1 — selection controls:** select All / None; live stats of the selection
(cell count, file count, total size); **Delete selected** (hour-level only —
deletes the files of all selected hours via the deletion flow of part 06);
Cancel.

**Row 2 — batch AI analysis:** provider dropdown (local detection / cloud
provider A / cloud provider B); read-only labels showing the globally
configured model (and confidence for local detection — these are changed only
in Settings, see part 09); an **Analyze (N)** button.

Batch analysis behaviour per provider:

- **Local detection** — runs detection over *every photo* in each selected
  cell's date range, cell by cell, showing `X/Y` progress.
- **Cloud providers** — take *one representative preview photo per selected
  cell*, bundle them into a single batch request (to control cost), and run
  one analysis call. Requires the provider's API key to be configured.

After completion, all affected cells must refresh their AI object icons.

Selection mode also allows sending the selected range to the **task queue**
instead of running interactively (part 07).

## 6. Viewed status

The system tracks which hours the user has opened, entirely client-side:

- Opening an hour in the hour viewer marks that hour as viewed for that
  camera.
- Every cell aggregates the status of its descendants into one of
  `none / partial / full`, displayed as a coloured strip (reference: amber =
  partial, green = full).
- Aggregation rule: descendants with **no data** are ignored; a period is
  `full` when all its data-bearing descendants are fully viewed, `partial`
  when at least one is viewed but not all. To make this computable without
  server calls, the client caches which child periods contain data as the
  user navigates.
