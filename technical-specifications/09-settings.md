# 09 — User Settings

## 1. Persistence model

- All user preferences are stored **client-side, per browser profile**
  (reference: `localStorage`). Nothing preference-related is written to the
  server, with one deliberate exception: the **compute routing** choice
  (off/local/remote + URL) is server-side state, and the client only caches it
  for instant UI decisions.
- Settings changes take effect **immediately**, without a page reload.
- Settings are edited in a tabbed **Tools** dialog; model/confidence choices
  for AI are made *only* here — other screens display them read-only.

## 2. Settings catalogue

Values marked with a range are sliders; defaults are normative.

### General
| Setting | Default | Range |
|---------|---------|-------|
| Global font size | 15 px | 12–22 |
| Preview thumbnails per heatmap cell | 3 | 0–10 (0 = off) |

### Hour viewer
| Setting | Default | Range / values |
|---------|---------|----------------|
| Files per page | 50 | 10–200 |
| Minimum card width | 140 px | 80–400 |
| Hover zoom factor | 1.5 | 1.0–3.0 (1.0 = off) |
| Default motion threshold | 20 | 0–100 (seeds each motion mode's own remembered threshold) |
| Video preview mode | none | none / first frame / last frame / 2×2 grid / 2-frame GIF / 4-frame GIF / 4-frame max-change GIF |
| Active view mode | normal | remembered across sessions |

### Distribution-uniformity warnings (see part 04 §5)
| Setting | Default |
|---------|---------|
| Metric shown on hour cells | combined (of: AF / SE / BC / combined) |
| AF warn / alert | 40 / 65 |
| SE warn / alert | 55 / 80 |
| BC warn / alert | 40 / 65 |
| Combined warn / alert | 50 / 72 |

### Cloud AI (one tab per provider)
| Setting | Notes |
|---------|-------|
| API key | Stored client-side only; sent to the server inside each analysis request; **never exported** |
| Model | Provider's model list |
| Structured prompt template | Editable; `{n}` placeholder = image count; a built-in default template is used when empty |

### Local detection
| Setting | Default |
|---------|---------|
| Model | small (options: small / medium / large) |
| Confidence | 25 % (10–80) |
| Detected classes | person, bird, cat, dog, backpack, handbag — an 80-class checklist with All / None / Defaults shortcuts; empty = all classes |

### Compute
| Setting | Default |
|---------|---------|
| Routing mode | local (off / local / remote) |
| Remote URL | empty; with a "test connection" action that checks the entered URL before saving |

### Maintenance
Not preferences — the operations of part 06 §5 (clear index/caches, storage
report, date-range filter).

## 3. Client-side state that is *not* configuration

Kept client-side but excluded from export/import:

- navigation position (level, camera, period) — restored on reload;
- viewed-hours record and the cached "which periods have data" maps (part 03 §6);
- AI request timestamps for the rate statistics (last 25 h, self-pruning).

## 4. YAML export / import

All configuration settings can be exported to a single YAML file and imported
back.

**Export** downloads a commented, human-editable YAML grouped by area
(ui / hour view / motion modes / providers). API keys are replaced with a
placeholder comment.

**Import** must be lenient so old files always apply safely:

| Situation | Behaviour |
|-----------|-----------|
| API-key fields | Never imported |
| Missing key | Skipped, current value kept |
| Wrong type | Skipped |
| Number out of range | Clamped to the valid range |
| Unknown top-level keys | Ignored |
| YAML parse error | Error shown, nothing applied |

After a successful import all changed settings take effect immediately.
