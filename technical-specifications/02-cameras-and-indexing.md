# 02 — Cameras, Storage Access, and the File Index

## 1. Camera registry

Cameras are defined in an **external configuration file** (no code change to
add a camera). Each camera has:

| Field | Meaning |
|-------|---------|
| `id` | Stable machine identifier, used in all queries and stored with every indexed file |
| `name` | Human-readable display name |
| `path` | Directory subtree containing this camera's files, **relative** to a configurable storage root |

The **storage root** is supplied per machine (environment-level setting), so
the same camera configuration works regardless of where the share is mounted
(`\\nas\Camera` on one machine, `/camera` on another). The effective absolute
path of a camera is `storage_root + relative path`.

The system must expose the camera list (ids, names, paths) to the UI, which
renders a camera selector. Exactly one camera is active at a time for
navigation; statistics queries also support "all cameras".

## 2. Storage access

- The backend accesses camera files as **ordinary local paths**. Mounting and
  authentication for network shares are delegated to the operating system.
- Both local paths and UNC paths must work.
- The archive layout under a camera's directory is arbitrary (vendor-defined
  folder nesting); the scanner walks the whole subtree.

## 3. Scanning

Scanning (re)builds the file index for a camera. Requirements:

- Triggered **only by explicit user action** (a "Rescan" control in the UI, or
  an API call). No background watching.
- Scope: one camera, or all cameras.
- A scan **fully replaces** the camera's existing index entries (delete +
  re-insert), so files removed from disk disappear from the index.
- The scanner classifies each file as `photo` or `video` by extension.
- Directories named for organizer output (see part 07, file-organizer task)
  must be **skipped** so that organized copies are not re-indexed as fresh
  footage. The reference implementation skips any directory named `organized`.
- Scanning a 100k-file archive must not block other API operations and should
  report progress in logs; the UI shows a busy state and refreshes statistics
  when done.

### Capture-timestamp extraction

The capture timestamp is parsed from the filename when it matches a known
pattern; otherwise the file's modification time (mtime) is used.

Patterns that must be supported (extensible list):

| Pattern | Example | Source |
|---------|---------|--------|
| `MDAlarm_YYYYMMDD-HHMMSS.jpg` | `MDAlarm_20231127-200442.jpg` | Foscam snapshot |
| `alarm_YYYYMMDD_HHMMSS.mkv` | `alarm_20231127_200437.mkv` | Foscam recording |

Timestamps are stored in ISO-8601 local time.

## 4. The file index

The index is the system's source of truth for browsing. One record per file:

| Attribute | Notes |
|-----------|-------|
| unique id | Assigned by the system; all other features reference files by this id |
| camera id | From the registry |
| file type | `photo` or `video` |
| full path | Unique — rescans must not duplicate records |
| size in bytes | For statistics and deletion previews |
| capture timestamp | ISO-8601; the basis of all time grouping |

All derived data (cached thumbnails, AI results, video-preview records) is
keyed by file id and **must be deleted automatically when the file record is
deleted** (cascading cleanup), so the index never holds orphaned artifacts.

## 5. Queries the index must answer efficiently

These power the heatmap and hour viewer (see parts 03–04); all of them accept
optional filters `camera`, `date_from`, `date_to`:

1. **Aggregated statistics** grouped by `total`, `camera`, `year`, `month`,
   `day`, or `hour`: per group — photo count, video count, total size.
2. **Paginated file listing** ordered by capture timestamp (page number + page
   size), returning id, type, path, size, timestamp.
3. **Per-minute distribution**: for a given range (typically one hour), 60
   buckets with the number of files captured in each minute.
4. **Uniform sampling**: N photo ids spread evenly across a period (used for
   the preview strips inside heatmap cells).
5. **Original media retrieval**: stream any indexed file by id with the
   correct content type (used for full-size viewing, video playback, and
   downloads).

Grouped statistics over the full archive must return in interactive time
(sub-second for ~100k files in the reference implementation); design the index
with the appropriate composite lookups for (camera, timestamp) and
(camera, type, timestamp) access paths.

## 6. Basic thumbnails

Every photo can be served as a small preview image (reference: 256×256 JPEG,
aspect-preserving). Thumbnails are generated lazily on first request, cached,
and reused. Old basic thumbnails may be expired automatically (reference: 30
days) and can be purged manually (part 06).
