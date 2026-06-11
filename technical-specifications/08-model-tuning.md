# 08 — Detection-Model Tuning

A self-contained screen that answers: *which detection model and which
confidence threshold work best on my footage?* It operates only on images the
user uploads into a tuning session — never on the camera archive.

## 1. Workflow

```
1. Ground truth                2. Benchmark                   3. Results
   upload 10–30 images    →    pick confidence range      →   F1 / speed charts
   auto-label with a model     + refinement steps             per-model optimum
   correct labels by hand      search runs in background      recommendation + trace
```

1. **Ground truth.** Create a named session by uploading reference images.
   Run a model of choice (default: the largest/most accurate) at a chosen
   confidence to **seed labels**, then add/remove object tags per image until
   they are correct, and save. Sessions are listed, reopenable, and deletable
   (deleting a session removes its uploaded images).
2. **Benchmark.** Choose a confidence interval `[from, to]` and a number of
   refinement iterations; start. The search runs in the background with live
   progress; the client polls the session.
3. **Results.** Two line charts (F1 vs confidence, mean detection time vs
   confidence) with one series per model; a table of each model's optimum;
   the overall recommendation; and a collapsible **search trace**.

Session lifecycle: `setup → ready → running → done | failed`.

## 2. The search algorithm

For **each available model independently** (each model has its own optimal
sensitivity), run a **golden-section search** over the confidence interval to
maximize mean F1. Golden-section search reuses one evaluation per step, so it
converges in `2 + iterations` probes per model instead of a grid sweep.

With interval `[a, b]` and `φ = (√5 − 1)/2 ≈ 0.618`:

```
c = b − φ(b − a);  d = a + φ(b − a);  evaluate f(c), f(d)
repeat `iterations` times:
    if f(c) ≥ f(d):  b = d;  d←c (reuse f(c));  c = b − φ(b−a);  evaluate f(c)
    else:            a = c;  c←d (reuse f(d));  d = a + φ(b−a);  evaluate f(d)
best = probed confidence with the highest F1
```

An evaluation `f(conf)` runs detection on **every uploaded image** at that
confidence and scores against ground truth by comparing the **sets of object
classes** per image:

| Metric | Definition |
|--------|-----------|
| precision | TP / (TP + FP) |
| recall | TP / (TP + FN) |
| **F1** | 2·P·R / (P + R) — the maximized value |
| mean time | mean per-image detection time |

Evaluations at an already-probed confidence are cached within the run.
`progress_total = models × (2 + iterations) × images`.

**Recommendation:** the model with the highest best-F1; models within 0.01 F1
of each other tie-break by fastest mean detection time.

**Search trace:** per model, the ordered list of probes with the `[lo, hi]`
interval and its width at each step — so the user can verify convergence.

## 3. Constraints

- Detection is executed through the same compute facility as everywhere else
  (part 05 §4), so tuning requires compute to be enabled. Because uploads
  live on the main backend's disk, tuning is intended for **local** compute
  routing.
- Benchmark progress and results are persisted with the session, so a
  completed benchmark remains viewable later.
