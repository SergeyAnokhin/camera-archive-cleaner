# Backend Logging

All logging configuration lives in one file: **[`backend/logging_setup.py`](../backend/logging_setup.py)**.
Importing this module configures the root logger as a side effect, so `main.py` imports it first, before any other import.

---

## Log levels

| Level | Value | What it captures |
|-------|-------|-----------------|
| `TRACE` | 5 | Requests to `/thumbnail/` and `/diff_thumbnail/` |
| `DEBUG` | 10 | HTTP requests to all other endpoints |
| `INFO` | 20 | Application logs (📁 📊 📈 …) |
| `WARNING` | 30 | Warnings (e.g. inaccessible directory during scan) |
| `ERROR` | 40 | Errors |

---

## Changing the log level

Find this line near the bottom of [`backend/logging_setup.py`](../backend/logging_setup.py):

```python
logging.root.setLevel(logging.DEBUG)
```

Replace with the desired level:

```python
logging.root.setLevel(logging.INFO)     # app logs only, no HTTP requests
logging.root.setLevel(logging.DEBUG)    # + HTTP requests (excluding thumbnails)
logging.root.setLevel(TRACE)            # everything, including thumbnail requests
logging.root.setLevel(logging.WARNING)  # warnings and errors only
```

`TRACE = 5` is a custom level declared in the same file. Only needed if you want to see the high-frequency thumbnail requests; usually not useful.

---

## Log line format

```
19:59:05  INFO     api:  📁 Files page 1 (40 per page) camera=foscamHut 2024-08-11T10:00–10:59
│         │        │     │
│         │        │     └── message (numbers and camera names are colour-highlighted)
│         │        └──────── source: "api" (app logs) or "http" (uvicorn access)
│         └───────────────── level: TRACE / DEBUG / INFO / WARNING / ERROR
└─────────────────────────── time HH:MM:SS
```

Continuation lines (query result) start with `└─`:

```
19:59:05  INFO     api:  📁 Files page 1 (40 per page) camera=foscamHut ...
19:59:05  INFO     api:     └─ total 158, showing 40 on page 1
```

---

## Colour scheme

| Element | Colour |
|---------|--------|
| Timestamp | Cyan |
| `INFO` | Green |
| `DEBUG` / `TRACE` | Dim grey |
| `WARNING` | Yellow |
| `ERROR` | Red |
| Source `api` | Bright blue bold |
| Source `http` | Grey |
| Numbers in message | Bright yellow |
| Camera name (`camera=…`) | Bright cyan |

Implemented in the `_ColorFmt` class ([`backend/logging_setup.py`](../backend/logging_setup.py)). ANSI codes are defined as constants `_R`, `_GREEN`, `_BRIGHT_CYAN`, etc. at the top of that file.

---

## Uvicorn log interception

Uvicorn adds its own handlers to `uvicorn`, `uvicorn.access`, and `uvicorn.error` loggers on startup. To route everything through our formatter, the `startup` event in [`backend/main.py`](../backend/main.py):

1. Clears uvicorn handlers: `_lg.handlers.clear()`
2. Enables propagation: `_lg.propagate = True` — records flow to our root handler
3. Attaches `AccessFilter` (from `logging_setup.py`) to `uvicorn.access`, which:
   - Downgrades HTTP request logs from `INFO` to `DEBUG`
   - Downgrades `/thumbnail/` and `/diff_thumbnail/` requests to `TRACE`

---

## Adding a new log line

```python
# At the start of a handler — what is being requested
logger.info("🔍 Description: param=%s", value)

# After getting the result — what was returned
logger.info("   └─ result: %d items", len(items))
```

Every module gets its logger with `logger = logging.getLogger("api")`. The name **must** be `"api"` — the formatter colours and labels lines by logger name, so any other name shows up as a dim non-`api` source.

Number highlighting is applied automatically by `_colorize_msg` for values that appear as standalone words (surrounded by `\b` word boundaries).

---

## Disable logging entirely

```python
logging.root.setLevel(logging.CRITICAL)
```

Or pass `--no-access-log` to uvicorn — this disables only HTTP access logs; app `api` logs remain active.
