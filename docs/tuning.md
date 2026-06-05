# Model Tuning

A dedicated screen for finding the **best YOLO model and per-model confidence
threshold** for your own photos. You upload a small set of reference images,
let a model auto-label them (then correct the labels by hand), and the backend
runs a **golden-section search per model** to locate the confidence that
maximises F1 — balancing accuracy against detection speed.

Opened from the **Tuning** button in the main toolbar (next to Tasks). The
screen is self-contained: it does not touch the `files` table or the camera
archive — it works only on images you upload into a tuning session.

---

## Workflow (3 steps)

```
1. Эталон (Ground truth)          2. Тест (Benchmark)            3. Результаты
   ─────────────────────          ──────────────────            ────────────
   upload N images          →     pick conf range + steps   →   F1 / speed charts
   run a model (default Medium)   golden-section search          per-model optimum
   correct the object labels      over all 3 YOLO models         recommendation
   save → ground truth            (background task)              search trace
```

1. **Эталон.** Upload 10–30 images. Choose a model (default `yolov8m` — the
   heaviest, most accurate) and a confidence, then **Детектировать** to seed
   labels. Add/remove object tags per image until the labels are correct. Save.
2. **Тест.** Set the confidence interval `[conf_from, conf_to]` and the number
   of golden-section refinement steps. Start — a background task evaluates every
   model.
3. **Результаты.** Two line charts (F1 vs threshold, time vs threshold), a table
   of each model's optimum, the overall recommendation, and a collapsible
   **search trace** showing how the interval narrowed.

---

## The search algorithm

The benchmark runs an **independent golden-section search for each model**
(`yolov8n`, `yolov8s`, `yolov8m`) — because each model has its own optimal
sensitivity. Golden-section search finds the maximum of a unimodal function over
an interval while **reusing one evaluation per step**, so it converges in
`2 + iterations` probes per model instead of a full grid sweep.

For a model, with interval `[a, b]` and golden ratio `φ = (√5 − 1)/2 ≈ 0.618`:

```
c = b − φ(b − a)        d = a + φ(b − a)
evaluate f(c), f(d)               # f = mean F1 over all images at that confidence
repeat `iterations` times:
    if f(c) ≥ f(d):  b = d;  d,f(d) = c,f(c);  c = b − φ(b−a);  evaluate f(c)
    else:            a = c;  c,f(c) = d,f(d);  d = a + φ(b−a);  evaluate f(d)
best = the probed confidence with the highest F1
```

Each evaluation `f(conf)` runs detection on every uploaded image at that
confidence and computes, against the ground truth:

| Metric | Definition |
|---|---|
| precision | `TP / (TP + FP)` |
| recall | `TP / (TP + FN)` |
| F1 | `2·P·R / (P + R)` (the value being maximised) |
| mean_time_ms | mean per-image detection time reported by the compute-service |

where TP/FP/FN compare the **set of object classes** detected vs. the ground
truth set for that image. A small per-confidence cache avoids recomputing the
reused golden-section point.

**Recommendation** = the model whose best F1 is highest (within 0.01), breaking
ties by the fastest `mean_time_ms`.

The **search trace** in the results (per model, the ordered list of probes with
their `[lo, hi]` interval and width) lets you verify the interval really did
shrink toward the optimum in few attempts.

---

## Backend

[`backend/routers/tuning.py`](../backend/routers/tuning.py) — all endpoints plus
the background benchmark. Detection is delegated to the existing
[`compute_client.detect()`](../backend/compute_client.py) (see
[`docs/compute-service.md`](compute-service.md)), so the **compute-service must
be enabled (local or remote)** for autolabel and benchmark to work.

Uploaded images are stored on disk under `backend/tuning_uploads/<session_id>/`
(gitignored) as `img_0.<ext>`, `img_1.<ext>`, … The session row keeps an
`images` JSON array `[{id, name, file}]`; ground truth and results are keyed by
image `id`.

> **Path note:** detection passes the on-disk upload path to the
> compute-service. In **local** compute mode this is read directly. A **remote**
> compute-service would need access to the same path, so tuning is intended for
> local compute mode.

### Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/tuning/sessions` | List sessions (with `image_count`, status, progress) |
| POST | `/tuning/sessions` | Create session — **multipart** (`name` + `files[]`) |
| GET | `/tuning/sessions/{id}` | Full session row (images, ground_truth, config, results) |
| DELETE | `/tuning/sessions/{id}` | Delete session + remove uploaded files |
| GET | `/tuning/sessions/{id}/image/{image_id}` | Serve an uploaded image |
| POST | `/tuning/sessions/{id}/autolabel` | Run `{model, confidence}` → seed ground truth |
| PUT | `/tuning/sessions/{id}/ground_truth` | Save corrected `{ground_truth}` |
| POST | `/tuning/sessions/{id}/benchmark` | Start search `{conf_from, conf_to, iterations}` (background) |

Benchmark progress is polled via `GET /tuning/sessions/{id}` (the frontend polls
every 2 s while `status == 'running'`). `progress_total = 3 × (2 + iterations) × n_images`.

### Status lifecycle

```
setup ──autolabel/save──► ready ──benchmark──► running ──► done
                                                  └──────► failed
```

---

## Database

Table `tuning_sessions` — see [`docs/database.md`](database.md#tuning_sessions--model-tuning).
It is standalone (no foreign keys to `files`); deleting a session also removes
its upload directory.

---

## Frontend

[`frontend/src/components/TuningScreen.jsx`](../frontend/src/components/TuningScreen.jsx)
— the whole screen in one file: a session sidebar plus the 3-step panel
(`NewSessionForm`, `GroundTruthStep`, `BenchmarkStep`, `ResultsStep`). Charts use
`recharts` (same dependency as `StatsBar`). API calls live in
[`frontend/src/api.js`](../frontend/src/api.js) (`createTuningSession`,
`getTuningImageUrl`, `runAutolabel`, `saveTuningGroundTruth`,
`startTuningBenchmark`, …). The screen is mounted from
[`App.jsx`](../frontend/src/App.jsx) behind the `showTuning` toggle.

---

## Related: download button

Unrelated to tuning but shipped alongside it: the full-screen photo lightbox in
[`PhotoCard.jsx`](../frontend/src/components/hour/PhotoCard.jsx) now has a
**Скачать** button that downloads the original via the existing `/media/{id}`
endpoint (using the browser `download` attribute — no new backend route).
