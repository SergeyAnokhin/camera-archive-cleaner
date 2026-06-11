# 05 — Motion Visualization, AI Analysis, and Object Detection

## 1. Motion-visualization algorithms

Server-side image processing producing an alternative rendering per photo.
All renders are cached; the cache identity includes the photo, the set of
photos on the current page, and the threshold.

### Motion diff
1. Load all photos of the current page.
2. Compute the per-pixel mean image across the page.
3. For each pixel of the target photo: `delta = max(|R−μ|, |G−μ|, |B−μ|)`.
4. Pixels with `delta ≥ threshold` keep their original brightness; all others
   are darkened (×0.15).

Threshold = minimum channel difference to count as "changed". Lower → noisier,
higher → only strong changes survive. Good for spotting frames that differ
from the hour's average; weak against global lighting changes.

### Erosion (background subtraction + morphology)
1. Downscale all page frames (reference: 160×120).
2. Run an adaptive background-subtraction model over the frames in
   chronological order (reference: MOG2 with `varThreshold = threshold`);
   take the foreground mask at the target frame.
3. **Erode** the mask with a small elliptical kernel (3×3) — removes spider
   webs, raindrops, single-pixel noise.
4. **Dilate** with a larger elliptical kernel (7×7) — restores the volume of
   real solid objects.
5. Drop contours below a minimum area (reference: 80 px²) — discards insects.
6. Render: grayscale original + neon-green foreground mask + bounding boxes
   around surviving contours.

Threshold = strictness of foreground detection. The recommended
general-purpose mode after Normal.

### Optional extra render styles
The reference backend also implements: crop-to-most-active-region (the 1/9
tile with the largest diff), pure neon mask, motion-history image, plain
bounding boxes, and motion stacking. They follow the same page-context +
threshold + caching contract.

## 2. Cloud AI analysis

Two interchangeable cloud vision providers (reference: Google Gemini and
Anthropic Claude). Adding a provider must be a localized change.

### Flow
1. The user opens an AI view mode (or selects heatmap cells) and presses
   **Analyze**. A modal shows the editable prompt, then progress, then
   results.
2. The client sends: the photo ids, the prompt, the chosen model, and the
   **user's API key** (keys are stored client-side only and travel inside the
   request; the server never persists them).
3. The server loads the photos, downsizes them (reference: max 1024×1024),
   and sends them with the prompt in **one batch request** to the provider.
4. The response is parsed as structured JSON; per-photo results are saved.
5. The client refreshes — icons appear on cards and cells.

### Structured prompt and response
A single prompt template (user-editable, with a `{n}` placeholder replaced by
the image count) instructs the model to return strict JSON:

```json
{
  "scene": "one sentence about the overall activity",
  "images": [
    { "description": "1–2 sentences about this frame",
      "objects": ["man", "cat"] }
  ]
}
```

`objects` is a list of short object keywords (the reference product uses
Russian keywords to match its icon vocabulary, §5).

### Stored result (per photo, one row per file — re-running overwrites)
provider, model, analysis timestamp, scene description, image description,
object keywords, input/output token counts, estimated cost (USD, computed from
a per-model price table), elapsed time.

### Usage statistics
The client tracks request timestamps per provider (client-side, last 25 h) and
displays "last minute / last 24 h" counts plus the tokens/cost/time of the
last run.

## 3. Local object detection

Object detection on the user's own hardware — no API key, no internet.

- **Vocabulary:** the 80 COCO classes.
- **Models:** three sizes (small / medium / large; reference: YOLOv8 n/s/m) —
  a speed-vs-accuracy trade-off chosen in Settings.
- **Confidence threshold:** 10–80 % (default 25 %), set in Settings.
- **Class whitelist:** the user can restrict detection to selected classes
  (default: person, bird, cat, dog, backpack, handbag); the restriction is
  applied *at inference time* so excluded classes are never reported.
- Detection results are stored **separately from cloud AI results**, so both
  can exist for the same photo. Per photo: model, object keywords, elapsed
  time, timestamp (one row per file; re-running overwrites).

### Detection view mode
Rendering a photo card in this mode returns the photo with **bounding boxes
drawn** (class label + confidence per box). On first render of a given
(photo, model, confidence, class-set) the server runs inference once, caches
the annotated image, **and saves the detected objects** — so icons appear from
simply browsing, without pressing Analyze. Subsequent renders are cache hits.

### Batch detection
- Over an explicit list of photos (the current page) via the Analyze button —
  useful to re-save results after changing the confidence.
- Over a whole date range (camera + from + to) — used by heatmap cell
  selection and by queue tasks.

Both return per-photo object lists and report elapsed time and saved count.

## 4. Compute offloading

All heavy computation — local detection, video preview generation, video
conversion — must be **delegable to a separate stateless compute facility**:

- Three routing modes, switchable at runtime from Settings: **off**,
  **local** (same machine), **remote** (another machine by URL). The routing
  choice is persisted server-side.
- The compute facility owns **no state**: it receives a file reference +
  parameters and returns results. The main backend keeps the index, all
  result storage, and all caches. This is what makes the facility relocatable.
- File references cross the boundary as **storage-root-relative paths**; each
  side resolves them against its own storage root (the two machines may mount
  the share differently).
- The facility exposes a health/capabilities check; Settings shows
  reachability and lets the user test a URL before saving.
- When routing is **off** or the facility is unreachable: dependent API
  operations fail with an explicit "unavailable" status, and the UI hides the
  dependent features (detection view mode, video previews).
- The facility also reports basic machine metrics (CPU %, memory) for display
  on the task-queue screen.

## 5. Object icons — the shared vocabulary

Detected objects are displayed as emoji icons in three places:

1. **Photo cards** — icon row (always visible once results exist), object
   labels on hover, full description tooltip in AI modes.
2. **Hour-viewer page summary** — the union of objects across the current
   page, shown in the AI panel.
3. **Heatmap cells** — up to 5 deduplicated icons aggregated over the cell's
   period, at every level. A dedicated query returns the unique object
   keywords for (camera, date range). Cells re-fetch after batch analyses.

There is a single mapping table: COCO class → localized keyword → emoji. The
keywords stored by detection and the keywords returned by the cloud prompt
must come from this same vocabulary, otherwise icons fail to resolve (unknown
keywords render as a generic dot). When fetched for display, cloud-AI and
detection results are **merged per file** (either, both, or none may exist).
