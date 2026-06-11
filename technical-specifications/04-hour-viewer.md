# 04 — Hour Viewer

Opened by clicking an hour cell. Shows every photo and video captured in that
hour as a chronological, paginated grid of cards.

## 1. Layout

| Element | Content |
|---------|---------|
| Header | Camera + hour being viewed, close control |
| Mode selector | Dropdown of the available view modes (§3) |
| Mode panel | Below the selector: parameter slider(s) for motion modes, or the AI panel for AI modes (part 05) |
| Distribution chart | 60 bars — one per minute of the hour — showing how many files were captured in each minute; clicking a bar jumps to the page containing that minute. Header shows the three uniformity badges (§5) |
| Media grid | Photo and video cards in capture order; column width and page size configurable |
| Pagination | Page controls; page size configurable 10–200 (default 50) |
| Selection bar | When file-selection mode is active: select all/none, selection stats, delete (part 06) |

Opening the viewer marks the hour as viewed (part 03 §6).

## 2. Cards

### Photo card
- Shows the photo rendered by the **current view mode** (§3).
- Hover: optional zoom (configurable factor 1.0–3.0; 1.0 disables).
- Overlays: capture time; AI object emoji icons (top corner, always visible
  once results exist); on hover, the detected-object labels; in AI modes, a
  tooltip with the AI description and model name (part 05 §5).
- Click: opens the **lightbox** — a full-screen view of the original image
  with: previous/next navigation (`←`/`→`), download of the original, save
  shortcuts (`S` = original, `T` = current preview rendering), `Esc` to close.

### Video card
- Default rendering is a placeholder (camera icon + timestamp) — videos are
  *not* decoded unless the user enables previews.
- With a **video preview mode** enabled (global setting), the card shows a
  generated preview. Required modes:
  | Mode | Content |
  |------|---------|
  | `first_frame` / `last_frame` | Single still |
  | `four_frames` | 2×2 grid of 4 evenly spaced stills |
  | `max_change_gif` | 2-frame animation: first frame → frame with the largest change |
  | `four_frames_gif` | 4-frame animation, evenly spaced |
  | `max_change_4_gif` | 4-frame animation: first → max-change-from-first → max-change-from-last → last |
  Previews are generated server-side on first request and cached per
  (video, mode); a stale cache entry is regenerated when the mode changes.
  Preview generation is heavy compute — when compute routing is *off*, video
  cards fall back to the placeholder.
- Click: opens the **video player** — full-screen in-app playback with
  `Space` play/pause, `←`/`→` seek (small/large steps), download, an
  open-in-external-player fallback, `Esc` to close.

## 3. View modes

A view mode defines how photo cards are rendered. Modes are registered in a
single list so new modes can be added uniformly. Modes that require heavy
compute are hidden when compute routing is off.

| Mode | Kind | Description |
|------|------|-------------|
| **Normal** | plain | The unmodified thumbnail |
| **Motion diff** | motion | Highlights pixels that differ from the page average (algorithm in part 05 §1) |
| **Erosion** | motion | Background-subtraction pipeline with noise removal, neon mask + bounding boxes (part 05 §1) |
| **Local detection** | AI | Photo with detection bounding boxes drawn; auto-saves detected objects (part 05 §3) |
| **Cloud provider A / B** | AI | Normal thumbnail + analysis results overlay; analysis launched manually (part 05 §2) |

Additional motion render styles exist server-side without a UI mode in the
reference product (zoom-to-most-active-region crop; neon mask; motion-history
image; bounding boxes; motion stacking). Treat them as optional extensions:
the architecture must make adding a new mode a matter of registering one
renderer + one UI entry.

**Motion-mode parameters.** Motion modes expose a sensitivity **threshold
slider** (0–100, default 20). Each mode remembers its own threshold; the
global default seeds them. Changing the threshold re-renders the page (new
server-side renders are generated and cached for the new value).

**Page context.** Motion algorithms compare each photo against the *other
photos of the current page*, so the rendered image for a given photo depends
on (photo, page composition, threshold) — all three are part of the cache
identity.

## 4. Keyboard shortcuts (browse mode)

| Key | Action |
|-----|--------|
| `←`/`→` | Previous / next page (and prev/next photo inside the lightbox) |
| `↑`/`↓` | Move card focus |
| `Space` | Toggle selection of the focused card / play-pause in the player |
| `Delete` | Delete the focused/selected files (preview + confirm, part 06) |
| `Esc` | Close lightbox/player → exit selection → close the hour viewer |

A "peek" key shows the original (Normal) rendering while held, regardless of
the active mode.

## 5. Distribution-uniformity warnings

Purpose: flag hours where recordings are spread evenly across the whole hour —
the signature of weather-induced false triggers — as opposed to one
concentrated event.

From the 60 per-minute buckets, compute three scores, each normalized 0–100
(0 = one concentrated burst, 100 = recording every minute):

| Key | Name | Formula |
|-----|------|---------|
| AF | Active fraction | `active_minutes / 60 × 100` |
| SE | Spread entropy | `H / log₂(60) × 100`, H = Shannon entropy of the bucket distribution |
| BC | Block coverage | `active 5-minute blocks / 12 × 100` |

Combined score = `0.40·AF + 0.35·SE + 0.25·BC`.

Each metric has configurable warn/alert thresholds (defaults in part 09).
Display: all three badges (green/yellow/red) in the distribution-chart header;
on hour cells in the heatmap, a single badge for the user-chosen metric, shown
only at warn level or above.
