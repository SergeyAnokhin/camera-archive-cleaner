# 06 — Safe Deletion and Maintenance

Deletion is the only browsing-screen feature that touches the archive, so it
is always a two-step **preview → confirm** flow.

## 1. Selecting what to delete

Entry points:

| Entry point | Scope |
|-------------|-------|
| Hour viewer, selection mode | Individually selected photos/videos |
| Hour viewer, focused card + `Delete` | A single file |
| Hour viewer, whole-page / whole-hour action | All files of the page or hour |
| Heatmap selection (hour level) | All files of the selected hour cells |
| Maintenance settings, date range | All files of a camera in `[from, to]` |

## 2. Photo↔video pairing

Cameras typically save an alarm photo and an alarm video for the same event a
few seconds apart. When the user deletes **photos**, the system must find each
photo's companion **video on the same camera whose capture timestamp is within
±5 seconds** and include it in the deletion preview as an auto-matched item.
This prevents orphaned videos of already-deleted events.

## 3. Preview

Before anything is removed, the user sees a confirmation dialog listing:

- every selected file and every auto-matched video — with its path shown
  **relative to the camera's directory** (the storage root and camera prefix
  are stripped for readability), type, and size;
- totals: file count and combined size.

The dialog must make auto-matched additions visually distinguishable. Nothing
is deleted until the user confirms. For date-range deletion the preview is
produced by a dedicated range-preview operation (same information).

## 4. Confirm (execution)

On confirmation the system, per file:

1. deletes the file from disk;
2. deletes its index record (which cascades to all derived data — analysis
   results, preview records);
3. deletes its cached derived images.

Files already missing from disk are treated as successfully deleted (the index
entry is still removed). The response reports how many files were deleted and
how much space was freed; the UI refreshes counts, cells, and the current
page.

## 5. Maintenance operations

Housekeeping for system-owned data (never touches camera files), available in
Settings → Maintenance:

| Operation | Effect |
|-----------|--------|
| Clear file index | Remove all index records (disk files untouched); a rescan rebuilds |
| Clear basic thumbnails | Delete the basic-thumbnail cache (disk + records) |
| Clear motion-render caches | Per type or all (diff, erosion, etc.) |
| Clear all derived images | Every cache of every type, including detection renders and video previews |
| Storage report | Sizes of the index and of every cache, in bytes |

All cleanup operations accept an optional **date-range filter** (auto-filled
from the selected camera's data range), so the user can clean derived data for
a period without wiping everything.
