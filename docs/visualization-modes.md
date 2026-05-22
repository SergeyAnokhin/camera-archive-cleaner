# Visualization Modes

The HourViewer offers 12 visualization modes for browsing camera snapshots. Modes 2–8 are motion-analysis modes computed server-side and cached on disk. Modes 9–12 are AI / object-detection modes that send photos to an external API or run a local model.

Mode registry: [`viewModes/index.js`](../frontend/src/components/viewModes/index.js) — one file per mode.

---

## Shared controls

| Control | Where | Effect |
|---------|-------|--------|
| **Mode selector** | HourViewer header dropdown | Switch between the 12 modes |
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

## 3. Diff Zoom

**Key:** `diff_zoom` | **Cache:** `backend/diff_zoom_thumbnails_cache/`

**Algorithm:** Same per-pixel delta as Motion diff, then the frame is split into a 3×3 grid and **cropped to the single tile with the most changed pixels** — the result is that tile scaled back up.

**Threshold meaning:** Same as Motion diff (minimum channel delta).

**Best for:** Inspecting small or distant motion that is hard to see in a full-frame thumbnail — the crop zooms straight onto the active region.

---

## 4. Erosion

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

## 5. Neon mask

**Key:** `neon_mask` | **Cache:** `backend/motion_thumbnails_cache/`

**Algorithm:** Same MOG2 + erode → dilate → contour-filter pipeline as Erosion.

**Difference from Erosion:** Renders **only the clean mask overlay** (neon green on grayscale), without bounding boxes. Gives a cleaner, less cluttered view of exactly which pixels are considered motion.

**Threshold meaning:** Same as Erosion (`varThreshold`).

**Best for:** Evaluating the quality of the mask itself — checking whether the pipeline is picking up the right pixels or leaking noise.

---

## 6. MHI trail

**Key:** `mhi` | **Cache:** `backend/motion_thumbnails_cache/`

**Algorithm — Motion History Image:**
1. Run the same MOG2 pipeline on all frames up to and including the target frame.
2. Build an MHI array: each pixel stores the *normalised time* of its last motion (0 = oldest frame seen, 1.0 = target frame).
3. Colorise with `COLORMAP_PLASMA`:
   - **Bright yellow / white** → motion in the target frame (newest).
   - **Orange / red** → motion in recent preceding frames.
   - **Dark purple / blue** → motion from older frames.
4. Pixels that never had motion remain as grayscale background.

**Threshold meaning:** `varThreshold` for MOG2 (same as Erosion).

**Best for:** Understanding the *direction and trajectory* of motion. A person walking left to right leaves a colour trail from purple (left) to yellow (right).

---

## 7. Bounding boxes

**Key:** `bounding_boxes` | **Cache:** `backend/motion_thumbnails_cache/`

**Algorithm:** Same MOG2 pipeline as Erosion. After contour filtering:
- Renders the **original colour frame** (not grayscale).
- Draws `cv2.rectangle` around each significant contour.
- Box colour is determined by contour area at 160 × 120 scale:
  - **Green** → area < 300 px² (small object, e.g. cat, distant person)
  - **Orange** → 300 – 800 px² (medium object, e.g. nearby person)
  - **Red** → ≥ 800 px² (large object, e.g. vehicle, very close person)
- Area label in pixels printed above each box.

**Threshold meaning:** `varThreshold` for MOG2.

**Best for:** Quick triage. The colour-coded boxes answer "how large / significant is the moving object?" at a glance, without any AI.

---

## 8. Motion stacking

**Key:** `motion_stacking` | **Cache:** `backend/motion_thumbnails_cache/`

**Algorithm:**
1. Run the full MOG2 pipeline on **all** page frames (not just up to target).
2. Accumulate motion: each pixel's value = number of frames in which it was detected as motion.
3. Normalise accumulator to 0–255 and apply `COLORMAP_JET`:
   - **Blue** → moved in few frames (transient, possibly noise).
   - **Green / yellow** → moved in several frames (sustained motion path).
   - **Red** → moved in many frames (high-traffic zone or persistent object).
4. Alpha-blend the heatmap onto the **grayscale target frame** (background 35%, heatmap 85%).

**Threshold meaning:** `varThreshold` for MOG2.

**Best for:** Identifying *where* activity is concentrated across the whole page window (≈ 30–40 min). Red zones indicate paths that were crossed repeatedly. Useful for spotting an intruder's entry point or an animal's regular route.

---

## 9. Gemini Analysis

**Key:** `gemini_analysis` | **Cache:** none (results stored in `ai_analysis` DB table) | **`isAiMode: true`**

Sends all photos on the current page to the Google Gemini API (or a selection if files are selected). Returns a natural-language description per photo plus a list of detected objects (Russian keywords). Results are saved to the DB and displayed as:
- Per-photo icon overlay and hover tooltip in HourViewer
- Aggregate icons in heatmap cells (day, month, year views)

**Panel controls:** Model selector (gemini-3.1-flash-lite / gemini-2.5-flash / gemini-2.5-pro), structured prompt editor, **Analyze** button, cost estimate and token stats after each run.

**Requires:** `gemini_api_key` in localStorage (set in Tools → Google AI tab).

---

## 10. Claude Analysis

**Key:** `claude_analysis` | **Cache:** none (results in `ai_analysis` table) | **`isAiMode: true`**

Same flow as Gemini but uses the Anthropic Claude API. Sends photos as base64 JPEG.

**Panel controls:** Model selector (claude-haiku-4-5 / claude-sonnet-4-6 / claude-opus-4-7), **Analyze** button, token/cost stats.

**Requires:** `claude_api_key` in localStorage (set in Tools → Claude AI tab).

---

## 11. OpenVINO Detection

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

## 12. OpenVINO Boxes

**Key:** `openvino_bbox` | **Cache:** `backend/openvino_thumbnails_cache/` (shared with OpenVINO Detection)

Same bounding-box image as OpenVINO Detection — same `/openvino_thumbnail` endpoint — but **not** an AI mode (`isAiMode` is unset): no model selector, no Run button, no hover description tooltip. Confidence is read from the `openvino_confidence` localStorage key instead of the mode-params slider.

**Best for:** a plain box overlay when you only want the visual and not the analysis panel.

---

## Tuning guide

| Symptom | Adjustment |
|---------|-----------|
| Rain / spider web still visible | Raise threshold (stricter MOG2) |
| Real objects disappear | Lower threshold |
| Too many tiny boxes | Increase `MIN_CONTOUR_AREA` constant in `erosion_thumbnails.py` / `motion_thumbnails.py` |
| MHI trail too short | Lower threshold so more frames register motion |
| Motion stacking shows everything red | Normal for active cameras; use Bounding boxes mode to inspect individual frames |

---

## Cache management

All computed thumbnails are cached on disk to avoid re-processing.

| Cache directory | Modes | Clear via |
|----------------|-------|-----------|
| `backend/thumbnails_cache/` | Normal | Tools → Maintenance → Clear thumbnails |
| `backend/diff_thumbnails_cache/` | Motion diff | Tools → Maintenance → Clear diff thumbnails |
| `backend/diff_zoom_thumbnails_cache/` | Diff Zoom | Tools → Maintenance → Clear diff-zoom thumbnails |
| `backend/erosion_thumbnails_cache/` | Erosion | Tools → Maintenance → Clear erosion thumbnails |
| `backend/motion_thumbnails_cache/` | Neon mask, MHI trail, Bounding boxes, Motion stacking | Tools → Maintenance → Clear motion thumbnails |
| `backend/openvino_thumbnails_cache/` | OpenVINO Detection, OpenVINO Boxes | Tools → Maintenance → Clear all thumbnails |

Cache keys include the sorted list of page photo IDs and the current threshold value, so changing either will generate new cached images.

---

## Backend files

| File | Responsibility |
|------|---------------|
| `backend/thumbnails.py` | Resize + cache regular thumbnails (PIL) |
| `backend/diff_thumbnails.py` | Motion diff — numpy mean/delta |
| `backend/diff_zoom_thumbnails.py` | Diff Zoom — diff + crop to hottest 1/9 tile |
| `backend/erosion_thumbnails.py` | MOG2 + erode/dilate + neon overlay + boxes |
| `backend/motion_thumbnails.py` | Shared MOG2 pipeline + 4 visualization renderers |
| `backend/compute_cache.py` | Bbox cache paths (OpenVINO modes) — the JPEG itself is rendered by the compute-service |
| `compute-service/detection.py` | YOLO/OpenVINO model loading + detection — runs in the [compute-service](compute-service.md) |
