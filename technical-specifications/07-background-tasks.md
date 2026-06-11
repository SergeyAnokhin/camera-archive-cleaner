# 07 — Background Task Queue

Long-running jobs (pre-generating video previews, batch AI/detection over date
ranges, video re-encoding, file organizing) run as **persistent queued tasks**
instead of blocking API calls.

## 1. Queue semantics

- Tasks are persisted server-side and **survive restarts**. On startup, any
  task found mid-run is reset to `paused` for manual resumption — never
  silently restarted.
- A single background worker processes **one task at a time**, in queue order.
- The queue order is user-editable (drag-and-drop reorder in the UI).
- A **global pause** switch stops the worker from picking up the next task.

### Task lifecycle

```
queued ──► running ──► completed
              │ ──► pausing ──► paused ──► queued (resume)
              │ ──► failed ──► queued (resume / skip)
              └──► cancelled
```

| Action | Allowed when | Effect |
|--------|--------------|--------|
| pause | running | Graceful: stop after the current file |
| resume | paused, failed | Re-queue; processing continues from the saved progress offset |
| skip | paused, failed | Advance past the current (failing) file, then re-queue |
| cancel | any unfinished | Terminal |
| delete | any not running | Remove from the queue |

### Progress reporting

Each task tracks: files processed / total, the file currently being processed
(path + a preview thumbnail reference), processing speed (files/s), ETA, and
on failure an error message. Progress is persisted periodically so it doubles
as the **resume offset**.

## 2. Task types

Six types. Each takes a camera + date range (or equivalent file filter) and
processes matching files one by one.

| Type | What it does | Key parameters |
|------|--------------|----------------|
| **Video previews** | Pre-generate video preview images/animations for a range, so browsing is instant later | preview mode (part 04 §2) |
| **Local detection** | Run object detection over every photo in a range, saving results | model, confidence |
| **Cloud analysis ×2** (one per provider) | Per-photo cloud analysis over a range, saving results | model, prompt; optional inter-request delay for rate limiting |
| **Video conversion** | Re-encode videos via ffmpeg (e.g. to H.265) writing a new file next to the original with a suffix | filename pattern, output suffix, codec, quality (CRF), encoder preset, **dry-run** |
| **File organizer** | Move loose files from a camera's root into `YYYY/MM/DD` folders under a dedicated output directory | source filter pattern, output folder name, date-extraction rule, **dry-run** |

Notes:

- Conversion and organizing are the destructive/long types: they support
  **dry-run** (log what would happen, change nothing) and keep a **per-task
  log tail** (reference: last 300 lines) viewable live in the UI, with
  dry-run/error/skip lines highlighted.
- The conversion-output suffix doubles as an idempotency guard: files already
  carrying the suffix are excluded from matching.
- The organizer's output directory is excluded from scanning (part 02 §3).
- Detection, preview generation, and conversion are delegated to the compute
  facility (part 05 §4); conversion needs a long timeout (hours). The
  organizer is pure file moves and runs on the main backend.

## 3. Creating tasks (UI)

A "New task" dialog offers the six types as cards, then type-specific
parameters:

- camera + date range (defaults: current month start → now);
- a read-only summary of the relevant **global settings** that the task will
  use (preview mode, detection model/confidence, cloud model) — these are
  changed only in Settings;
- for conversion/organizer: their specific fields plus a **live estimate of
  the number of matching files** before the task is created (computed from
  the index for conversion; from a shallow directory listing for the
  organizer);
- dry-run toggle where applicable.

Tasks can also be created from other screens ("send to tasks" from heatmap
cell selection and from the AI analysis modals).

## 4. Task screen

- Lists all tasks (cards) with type icon, label, status badge, progress bar,
  speed/ETA, current-file thumbnail, per-task action buttons, a logs button
  for log-bearing types, and an amber "dry-run" tag.
- Auto-refreshes by polling (reference: every 3 s).
- Header shows **compute machine metrics** (CPU %, RAM) and the compute
  routing mode, plus the global pause toggle.
- Completed analysis tasks allow **jumping back** to the corresponding place
  in the heatmap/hour viewer to inspect results.
