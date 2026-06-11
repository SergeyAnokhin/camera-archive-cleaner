# 01 — Overview

## 1. Purpose

The system is a **visual archive manager for surveillance-camera snapshots and
video recordings** stored on a file share (NAS/SMB or local disk).

Motion-triggered cameras produce thousands of small files per day. Most of them
are noise — rain, wind, insects, lighting changes. The product solves three
problems:

1. **Orientation** — let the user understand *when* activity happened across
   months of archive, without opening files one by one. This is done with a
   colour-intensity heatmap that drills down Year → Month → Day → Hour.
2. **Inspection** — let the user review the frames of a specific hour quickly,
   with visual aids that highlight motion and with AI-detected object labels
   (people, animals, vehicles) shown as icons.
3. **Safe cleanup** — let the user delete uninteresting files from disk in
   bulk, with an explicit preview of everything that will be removed and with
   automatic pairing of photos to their corresponding video recordings.

Secondary capabilities: long-running batch jobs (pre-generating previews,
running AI analysis over date ranges, re-encoding videos, organizing files into
date folders) and a benchmarking tool that finds the best detection model and
confidence threshold for the user's own footage.

## 2. Users and context

- A single user (home owner / administrator), on a desktop browser, on the
  local network. There is no authentication, no multi-tenancy, and no public
  exposure requirement.
- Archives are large (thousands to hundreds of thousands of files) and live on
  a network share. The system must never modify archive files except through
  the explicit deletion and organizing features.
- The UI is a **dark-theme dashboard** in the spirit of smart-home panels.
  The UI language of the reference product is Russian; this is a presentation
  choice, not a functional requirement.

## 3. Feature summary

| Area | Capability |
|------|-----------|
| Indexing | Register cameras via configuration; scan their directories on demand; build a searchable index of photos and videos with timestamps extracted from filenames |
| Heatmap | Hierarchical drill-down with per-cell intensity, photo/video counts, embedded preview thumbnails, AI object icons, "viewed" markers, uniformity warnings |
| Hour viewer | Paginated chronological grid of an hour's media; multiple visualization modes (plain, motion-difference, background-subtraction); full-screen lightbox; in-app video playback; per-minute distribution chart |
| Motion analysis | Server-side image processing that highlights what changed between frames, tunable by a sensitivity threshold, cached |
| AI analysis | Cloud vision models (two interchangeable providers) producing per-photo descriptions + object lists; local object detection (no internet) producing object lists + annotated images; results stored and displayed as icons everywhere |
| Deletion | Preview-then-confirm deletion of selected files, whole hours, or date ranges; automatic photo↔video pairing; index and derived artifacts cleaned up together |
| Task queue | Persistent, restartable queue of long-running jobs with progress, speed/ETA, pause/resume/cancel/reorder, dry-run for destructive types, per-task logs |
| Model tuning | Upload reference images, define ground truth, automatically search for the best detection model + confidence (golden-section search maximizing F1) |
| Settings | All preferences client-side, immediately applied, exportable/importable as YAML |
| Compute offloading | Heavy computation (detection, video processing) can be disabled, run locally, or delegated to another machine — switchable at runtime from the UI, with graceful degradation when off |

## 4. Glossary

| Term | Meaning |
|------|---------|
| **Camera** | A configured source: an identifier, a display name, and a directory subtree containing its files |
| **Snapshot / photo** | A still image file produced by a camera (e.g. JPEG) |
| **Video** | A video recording file produced by a camera (e.g. MKV/MP4) |
| **File index** | The system's database of known files: camera, type, path, size, capture timestamp |
| **Capture timestamp** | The moment the file was recorded — parsed from the filename when possible, otherwise the file's modification time |
| **Heatmap level** | One of: *years overview*, *year* (12 months), *month* (days), *day* (24 hours) |
| **Cell** | One period at the current heatmap level (a month, a day, or an hour) |
| **Hour viewer** | The screen showing all media of one selected hour |
| **View mode** | A per-photo rendering style in the hour viewer (normal, motion-highlight, detection boxes, …) |
| **Page** | One pagination window of the hour viewer; motion algorithms operate on the photos of the current page |
| **Provider** | An AI analysis backend: one of the two cloud vision services, or the local detector |
| **Local detection** | Object detection executed on the user's own hardware against the 80-class COCO vocabulary, in one of three model sizes (small/medium/large trade-off between speed and accuracy) |
| **Compute routing** | The off / local / remote switch controlling where heavy computation runs |
| **Task** | A persistent background job processed by the queue |
| **Dry-run** | Task execution that logs what *would* happen without changing anything |
| **Ground truth** | Hand-corrected object labels for uploaded reference images, used to score detection accuracy |

## 5. General requirements

- **Read-mostly safety.** Browsing never mutates the archive. Only two
  features write to camera storage: deletion (always preview + confirm) and
  the file-organizer task (supports dry-run).
- **Manual synchronization.** There is no filesystem watcher. The index is
  updated only when the user explicitly triggers a rescan.
- **Graceful degradation.** If heavy-compute capability is off or unreachable,
  the features that need it (local detection, video previews, video
  conversion) are hidden or fail with a clear "unavailable" response — the
  rest of the product keeps working.
- **Caching of derived images.** Every server-generated image (thumbnails,
  motion renders, annotated detection images, video previews) is computed at
  most once for a given input + parameter combination and served from cache
  afterwards. Caches are inspectable (total size) and clearable from the UI.
- **Responsiveness.** The heatmap and hour viewer must stay interactive over
  archives of 100k+ files; statistics queries are aggregations over the index,
  never filesystem walks.
- **State location.** Server-side state is the file index, analysis results,
  task queue, tuning sessions, derived-image caches, and the compute-routing
  choice. All *user preferences* live client-side (per browser profile) — see
  part 09.
- **Single-command startup** for local use: one command starts everything
  needed for the full feature set on a developer/operator machine.
