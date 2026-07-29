# Visualization Modes

The HourViewer offers 5 visualization modes for browsing camera archives. Mode 2 is a motion-analysis mode computed server-side and cached on disk. Modes 3–5 are AI / object-detection modes that send photos to an external API or run a local model.

Mode registry: [`viewModes/index.js`](../frontend/src/components/viewModes/index.js) — one file per mode.

---

## Shared controls

| Control | Where | Effect |
|---------|-------|--------|
| **Mode selector** | HourViewer header dropdown | Switch between the 5 modes |
| **Threshold slider** | Tools → Hour view | 0–100, default 20. Controls sensitivity of motion modes (see per-mode notes below) |
| **AI mode panel** | Appears below mode selector when an AI mode is active | Model selector, confidence slider (OpenVINO), Analyze button, usage stats |

---

## 1. Normal

**Key:** `normal` | **Cache:** none (direct thumbnail)

Shows the original JPEG thumbnail, resized to 256 × 256. No processing.

**When to use:** Quick scan, confirming what a snapshot contains.

---

## 2. Motion highlight

**Key:** `motion_diff` | **Cache:** `CACHE_BASE_DIR/diff/`

**Algorithm:**
1. Load all photo thumbnails on the current page as float32 numpy arrays.
2. Compute the per-pixel mean across the whole page.
3. For each pixel compute `delta = max(|R−μ|, |G−μ|, |B−μ|)`.
4. Pixels with `delta ≥ threshold` are kept at original brightness; the rest are darkened (×0.15).

**Threshold meaning:** Minimum channel delta to be considered "changed". Lower → more pixels highlighted (noisier). Higher → only large colour changes survive.

**Best for:** Quickly spotting frames that differ significantly from the hourly average — e.g. a person crossing a normally empty scene.

**Limitation:** Sensitive to global illumination changes (clouds, shadows). Does not distinguish object size.

---

## 3. AI description (Gemini)

**Key:** `gemini_analysis` | **Cache:** none (results stored in `ai_analysis` DB table) | **`isAiMode: true`**

Sends all photos on the current page to the Google Gemini API (or a selection if files are selected). Returns a natural-language description per photo plus a list of detected objects (Russian keywords). Results are saved to the DB and displayed as:
- Per-photo icon overlay and hover tooltip in HourViewer
- Aggregate icons in heatmap cells (day, month, year views)

**Panel controls:** Model selector (gemini-3.1-flash-lite / gemini-2.5-flash / gemini-2.5-pro), structured prompt editor, **Analyze** button, cost estimate and token stats after each run.

**Requires:** `gemini_api_key` in localStorage (set in Tools → AI tab).

---

## 4. AI description (Claude)

**Key:** `claude_analysis` | **Cache:** none (results in `ai_analysis` table) | **`isAiMode: true`**

Same flow as Gemini but uses the Anthropic Claude API. Sends photos as base64 JPEG.

**Panel controls:** Model selector (claude-haiku-4-5 / claude-sonnet-4-6 / claude-opus-4-7), **Analyze** button, token/cost stats.

**Requires:** `claude_api_key` in localStorage (set in Tools → AI tab).

---

## 5. Object detection (local)

**Key:** `openvino_detection` | **Cache:** `CACHE_BASE_DIR/openvino/` (bbox JPEG per file+model+confidence+classes) | **`isAiMode: true`**

Runs local YOLOv8 object detection using the Intel OpenVINO runtime (falls back to PyTorch if no exported model is found). No API key or internet connection required.

**How it works:**
- `getImageUrl()` returns `/openvino_thumbnail/{file_id}?model=…&confidence=…` — a JPEG with bounding boxes drawn by YOLO's `.plot()` renderer
- On **cache miss**: YOLO runs, bounding-box image is saved to disk, **and detected objects are also saved to `ai_analysis`** — icons appear automatically after load without clicking Analyze
- On **cache hit**: the cached JPEG is returned immediately (no DB write)

**Panel controls:** Model dropdown (YOLOv8n / YOLOv8s / YOLOv8m), confidence slider (10–80 %, default 25 %), **Analyze** button (bulk pre-save via `/openvino_analyze_batch` — useful after changing threshold to replace cached results)

**Model change:** Stored in `openvino_model` localStorage key. Changing the model triggers a forced URL re-render via `onParamChange('_refresh', timestamp)` so all photo cards request new bbox images.

**Runtime:** detection runs in the [compute-service](compute-service.md). If a `compute-service/models/{model}_openvino_model/` folder exists it is used (2–5× faster on Intel CPUs); otherwise the `.pt` PyTorch model is downloaded and used. See [`docs/ai-analysis.md`](ai-analysis.md#openvino-model-runtime) for how to export OpenVINO models.

---

---

## Cache management

All computed thumbnails are cached on disk to avoid re-processing. Every cache
lives under a single root, `CACHE_BASE_DIR` — defined in
[`compute_cache.py`](../backend/compute_cache.py) as `CACHE_DIR` env var →
falling back to `DATA_DIR/cache/` (i.e. `backend/cache/` in local dev). One
subdirectory per type:

Clear actions live in **Tools → Service → Maintenance → Thumbnail cache**
([`MaintenanceSection.jsx`](../frontend/src/components/tools/service/MaintenanceSection.jsx)),
each row scoped by the date range set at the top of that section:

| Subdirectory | Constant | Modes | Maintenance row |
|----------------|---|-------|-----------|
| `cache/basic/` | `THUMB_DIR` ([`thumbnails.py`](../backend/thumbnails.py)) | Normal | "Basic thumbnails" |
| `cache/diff/` | `DIFF_THUMB_DIR` ([`diff_thumbnails.py`](../backend/diff_thumbnails.py)) | Motion highlight | "Motion thumbnails" |
| `cache/openvino/` | `OV_THUMB_DIR` ([`compute_cache.py`](../backend/compute_cache.py)) | Object detection (local) | "Object detection (local)" — clears `object_detection` rows for the range; the bbox JPEGs only on a full (unscoped) clear |
| `cache/video/` | `VID_THUMB_DIR` ([`compute_cache.py`](../backend/compute_cache.py)) | Video previews (not a view mode) | "Video thumbnails" — also clears `video_previews` rows |

"All thumbnails" clears all four at once.

Cache keys include the sorted list of page photo IDs and the current threshold value, so changing either will generate new cached images.

> Keeping every cache under one root is what makes it safe to point `CACHE_DIR`
> at ephemeral storage (the HA add-on sets `CACHE_DIR=/tmp/camera-cleaner-cache`
> so caches stay out of HA backups). A new cache **must** hang off
> `CACHE_BASE_DIR` — a hard-coded path silently escapes that.

---

## Backend files

| File | Responsibility |
|------|---------------|
| `backend/thumbnails.py` | Resize + cache regular thumbnails (PIL) |
| `backend/diff_thumbnails.py` | Motion diff — numpy mean/delta |
| `backend/compute_cache.py` | Bbox cache paths (OpenVINO modes) — the JPEG itself is rendered by the compute-service |
| `compute-service/detection.py` | YOLO/OpenVINO model loading + detection — runs in the [compute-service](compute-service.md) |
