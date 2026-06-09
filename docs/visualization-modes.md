# Visualization Modes

The HourViewer offers 6 visualization modes for browsing camera snapshots. Modes 2–3 are motion-analysis modes computed server-side and cached on disk. Modes 4–6 are AI / object-detection modes that send photos to an external API or run a local model.

Mode registry: [`viewModes/index.js`](../frontend/src/components/viewModes/index.js) — one file per mode.

---

## Shared controls

| Control | Where | Effect |
|---------|-------|--------|
| **Mode selector** | HourViewer header dropdown | Switch between the 6 modes |
| **Threshold slider** | Tools → Hour view | 0–100, default 20. Controls sensitivity of motion modes (see per-mode notes below) |
| **AI mode panel** | Appears below mode selector when an AI mode is active | Model selector, confidence slider (OpenVINO), Analyze button, usage stats |

---

## 1. Normal

**Key:** `normal` | **Cache:** none (direct thumbnail)

Shows the original JPEG thumbnail, resized to 256 × 256. No processing.

**When to use:** Quick scan, confirming what a snapshot contains.

---

## 2. Motion diff

**Key:** `motion_diff` | **Cache:** `backend/diff_thumbnails_cache/`

**Algorithm:**
1. Load all photo thumbnails on the current page as float32 numpy arrays.
2. Compute the per-pixel mean across the whole page.
3. For each pixel compute `delta = max(|R−μ|, |G−μ|, |B−μ|)`.
4. Pixels with `delta ≥ threshold` are kept at original brightness; the rest are darkened (×0.15).

**Threshold meaning:** Minimum channel delta to be considered "changed". Lower → more pixels highlighted (noisier). Higher → only large colour changes survive.

**Best for:** Quickly spotting frames that differ significantly from the hourly average — e.g. a person crossing a normally empty scene.

**Limitation:** Sensitive to global illumination changes (clouds, shadows). Does not distinguish object size.

---

## 3. Erosion

**Key:** `erosion` | **Cache:** `backend/erosion_thumbnails_cache/`

**Algorithm (MOG2 + morphological pipeline):**
1. Downscale all page frames to 160 × 120.
2. Feed frames through `cv2.createBackgroundSubtractorMOG2` in sorted order (`varThreshold = threshold`).
3. Capture the foreground mask at the target frame.
4. **Erode** with a 3 × 3 elliptical kernel → removes thin spider webs and isolated raindrops.
5. **Dilate** with a 7 × 7 elliptical kernel → restores the volume of real solid objects.
6. `findContours` + area filter (≥ 80 px²) → discards small insects and branch tips.
7. Render: grayscale target + **neon-green mask** + **bounding boxes**.

**Threshold meaning:** `varThreshold` for MOG2. Higher → stricter foreground detection, fewer false positives from slow lighting drift.

**Best for:** General-purpose noise rejection. Good first choice after Normal.

---

## 4. Gemini Analysis

**Key:** `gemini_analysis` | **Cache:** none (results stored in `ai_analysis` DB table) | **`isAiMode: true`**

Sends all photos on the current page to the Google Gemini API (or a selection if files are selected). Returns a natural-language description per photo plus a list of detected objects (Russian keywords). Results are saved to the DB and displayed as:
- Per-photo icon overlay and hover tooltip in HourViewer
- Aggregate icons in heatmap cells (day, month, year views)

**Panel controls:** Model selector (gemini-3.1-flash-lite / gemini-2.5-flash / gemini-2.5-pro), structured prompt editor, **Analyze** button, cost estimate and token stats after each run.

**Requires:** `gemini_api_key` in localStorage (set in Tools → Google AI tab).

---

## 5. Claude Analysis

**Key:** `claude_analysis` | **Cache:** none (results in `ai_analysis` table) | **`isAiMode: true`**

Same flow as Gemini but uses the Anthropic Claude API. Sends photos as base64 JPEG.

**Panel controls:** Model selector (claude-haiku-4-5 / claude-sonnet-4-6 / claude-opus-4-7), **Analyze** button, token/cost stats.

**Requires:** `claude_api_key` in localStorage (set in Tools → Claude AI tab).

---

## 6. OpenVINO Detection

**Key:** `openvino_detection` | **Cache:** `backend/openvino_thumbnails_cache/` (bbox JPEG per file+model+confidence) | **`isAiMode: true`**

Runs local YOLOv8 object detection using the Intel OpenVINO runtime (falls back to PyTorch if no exported model is found). No API key or internet connection required.

**How it works:**
- `getImageUrl()` returns `/openvino_thumbnail/{file_id}?model=…&confidence=…` — a JPEG with bounding boxes drawn by YOLO's `.plot()` renderer
- On **cache miss**: YOLO runs, bounding-box image is saved to disk, **and detected objects are also saved to `ai_analysis`** — icons appear automatically after load without clicking Analyze
- On **cache hit**: the cached JPEG is returned immediately (no DB write)

**Panel controls:** Model dropdown (YOLOv8n / YOLOv8s / YOLOv8m), confidence slider (10–80 %, default 25 %), **Analyze** button (bulk pre-save via `/openvino_analyze_batch` — useful after changing threshold to replace cached results)

**Model change:** Stored in `openvino_model` localStorage key. Changing the model triggers a forced URL re-render via `onParamChange('_refresh', timestamp)` so all photo cards request new bbox images.

**Runtime:** detection runs in the [compute-service](compute-service.md). If a `compute-service/models/{model}_openvino_model/` folder exists it is used (2–5× faster on Intel CPUs); otherwise the `.pt` PyTorch model is downloaded and used. See [`docs/ai-analysis.md`](ai-analysis.md#openvino-model-runtime) for how to export OpenVINO models.

---

## Tuning guide

| Symptom | Adjustment |
|---------|-----------|
| Rain / spider web still visible | Raise threshold (stricter MOG2) |
| Real objects disappear | Lower threshold |
| Too many tiny boxes | Increase `MIN_CONTOUR_AREA` constant in `erosion_thumbnails.py` |

---

## Cache management

All computed thumbnails are cached on disk to avoid re-processing.

| Cache directory | Modes | Clear via |
|----------------|-------|-----------|
| `backend/thumbnails_cache/` | Normal | Tools → Maintenance → Clear thumbnails |
| `backend/diff_thumbnails_cache/` | Motion diff | Tools → Maintenance → Clear motion thumbnails |
| `backend/erosion_thumbnails_cache/` | Erosion | Tools → Maintenance → Clear motion thumbnails |
| `backend/openvino_thumbnails_cache/` | OpenVINO Detection | Tools → Maintenance → Clear all thumbnails |

Cache keys include the sorted list of page photo IDs and the current threshold value, so changing either will generate new cached images.

---

## Backend files

| File | Responsibility |
|------|---------------|
| `backend/thumbnails.py` | Resize + cache regular thumbnails (PIL) |
| `backend/diff_thumbnails.py` | Motion diff — numpy mean/delta |
| `backend/erosion_thumbnails.py` | MOG2 + erode/dilate + neon overlay + boxes |
| `backend/compute_cache.py` | Bbox cache paths (OpenVINO modes) — the JPEG itself is rendered by the compute-service |
| `compute-service/detection.py` | YOLO/OpenVINO model loading + detection — runs in the [compute-service](compute-service.md) |
