# Testing

Unit tests pin the **documented complex logic** of the project — not full coverage.
Every test file states the rule it verifies and the doc that defines it.
Run after every refactoring or change (see `CLAUDE.md` §6 — mandatory).

```powershell
npm test              # all three suites, from repo root
npm run test:backend  # backend only   (cd backend && python -m pytest)
npm run test:compute  # compute only   (cd compute-service && python -m pytest)
npm run test:frontend # frontend only  (cd frontend && npm test)
```

Output is intentionally minimal: pytest `-q --tb=short` (configured in each
`pytest.ini`), vitest `--reporter=dot`. Success → totals only; failure → test
name, file location, and the error.

---

## Backend (`backend/tests/`, pytest)

[`conftest.py`](../backend/tests/conftest.py) isolates every run: `DATA_DIR`
points to a fresh temp dir (so a throwaway `snapshots.db` is created there) and
`CAMERA_ROOT` is pinned to `C:\csc_test_camera_root` — both **before** any
backend module is imported, because both are read at import time. The real
database is never touched.

| Test file | Rule under test | Defined in |
|---|---|---|
| [`test_scanner_timestamps.py`](../backend/tests/test_scanner_timestamps.py) | Foscam snapshot/record filename patterns → UTC timestamp; unparseable name → `None` (mtime fallback) | `README.md` → Filename timestamp patterns |
| [`test_delete_video_matching.py`](../backend/tests/test_delete_video_matching.py) | `/delete/preview` auto-matches paired videos within **±5 s**, same camera only, no duplicates | [`api.md`](api.md) `/delete/preview` |
| [`test_tuning_golden_section.py`](../backend/tests/test_tuning_golden_section.py) | Golden-section search converges to max-F1 confidence in ≤ 2+iterations probes; recommendation = best F1, ties (±0.01) broken by speed | [`tuning.md`](tuning.md) |
| [`test_ai_common.py`](../backend/tests/test_ai_common.py) | ``` fence stripping before JSON parse; cost = tokens/1M × price; structured `{scene, images}` saved one row per file | [`ai-analysis.md`](ai-analysis.md) |
| [`test_compute_paths.py`](../backend/tests/test_compute_paths.py) | Backend strips `CAMERA_ROOT` prefix from paths sent to compute; foreign paths pass through | [`compute-service.md`](compute-service.md) |
| [`test_task_common.py`](../backend/tests/test_task_common.py) | `SpeedTracker` sliding-window items/sec (old events evicted, min 10 s window); `parse_dt` always tz-aware UTC | [`code-map.md`](code-map.md) task executors |
| [`test_google_api.py`](../backend/tests/test_google_api.py) | Gmail attachment extraction: nested MIME walk, image/video by MIME **or** extension (octet-stream `.jpg`), inline `body.data` parts; Drive path normalization | [`google-integration.md`](google-integration.md) |

## Compute-service (`compute-service/tests/`, pytest)

Same bootstrap idea: [`conftest.py`](../compute-service/tests/conftest.py) pins
`CAMERA_ROOT` before `config.py` is imported.

| Test file | Rule under test | Defined in |
|---|---|---|
| [`test_paths.py`](../compute-service/tests/test_paths.py) | `to_absolute()` prepends the service's own `CAMERA_ROOT` (mirror of the backend's strip) | [`compute-service.md`](compute-service.md) |
| [`test_video_letterbox.py`](../compute-service/tests/test_video_letterbox.py) | Thumbnail frames resized to exact target size, aspect preserved, black letterboxing — never stretched | [`compute-service.md`](compute-service.md) |

## Frontend (`frontend/src/**/*.test.js`, vitest)

Config: [`vitest.config.js`](../frontend/vitest.config.js) (node environment,
no jsdom). [`src/test-setup.js`](../frontend/src/test-setup.js) stubs
`localStorage` with an in-memory Map.

| Test file | Rule under test | Defined in |
|---|---|---|
| [`hourUtils.test.js`](../frontend/src/components/hour/hourUtils.test.js) | Uniformity metrics: AF = nActive/60×100, SE = H/log₂60×100, BC = blocks/12×100, combined = 0.40·AF+0.35·SE+0.25·BC; default warn/alert thresholds | [`settings.md`](settings.md) → Distribution uniformity |
| [`navUtils.test.js`](../frontend/src/components/navUtils.test.js) | Drill-down date ranges cover whole periods (leap-year February); intensity buckets 0–9 with 0 reserved for empty cells; `formatBytes` units | [`code-map.md`](code-map.md) navUtils |

---

## Adding tests

- Add a test when you implement or change **complex, documented logic** (formulas, matching rules, search algorithms, path contracts). Skip trivial code.
- Start the test file with a docstring/comment naming the rule and the doc that defines it, then add the file to the table above.
- Backend/compute: drop the file in the service's `tests/` dir — `conftest.py` handles isolation. Frontend: co-locate `*.test.js` next to the module.
