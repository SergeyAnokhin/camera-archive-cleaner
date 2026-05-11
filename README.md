# Camera Snapshots Cleaner

Visual archive manager for surveillance camera snapshots and videos.
Dark-mode dashboard to navigate, inspect, and safely delete camera files stored on a NAS/SMB share.

---

## What's built (Stage 1 — Backend Foundation)

| File | Purpose |
|------|---------|
| `backend/cameras.yaml` | Camera config — IDs, names, paths to snapshot and video directories |
| `backend/config.py` | YAML parser → `Camera` dataclass |
| `backend/scanner.py` | Directory walker; extracts timestamps from filenames, falls back to mtime |
| `backend/database.py` | SQLite schema, upsert, aggregation queries |
| `backend/main.py` | FastAPI app — three endpoints below |
| `backend/requirements.txt` | `fastapi uvicorn[standard] pyyaml` |

### API endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/cameras` | List configured cameras (IDs + names) |
| `POST` | `/scan` | Scan directories, write metadata to SQLite. Optional `?camera_id=` to scan one camera. |
| `GET` | `/stats` | Aggregated stats. Params: `group_by` (total/camera/year/month/day), `camera_id`, `date_from`, `date_to` |

Swagger UI at **`http://localhost:8000/docs`**

### Database

SQLite (`backend/snapshots.db`). Table `files`:

```
id, camera_id, file_type (photo|video), file_path, file_size, timestamp (ISO-8601)
```

Indexes on `(camera_id, timestamp)` and `(camera_id, file_type, timestamp)` for fast heatmap queries.

### Filename timestamp patterns supported

| Pattern | Example |
|---------|---------|
| Foscam snapshots | `MDAlarm_20231127-200442.jpg` |
| Foscam records | `alarm_20231127_200437.mkv` |

Falls back to file `mtime` if no pattern matches.

---

## Getting started

```powershell
cd backend
pip install -r requirements.txt
# Edit cameras.yaml — set your real paths (local or UNC \\server\share\...)
uvicorn main:app --reload
# Open http://localhost:8000/docs
```

Run `POST /scan` once to index files, then `GET /stats` to see results.

---

## Real data tested

Camera **Foscam FI9805W** (`CameraArchive/Foscam/FI9805W_C4D6553DECE1/`):
- 1 327 photos (.jpg) + 378 videos (.mkv) = **1 705 files / 2.68 GB**
- Archive spans: November 2023 and November 2024

---

## Roadmap

| Stage | Status | Description |
|-------|--------|-------------|
| 1 — Backend | ✅ Done | FastAPI + SQLite, `/scan`, `/stats`, YAML config |
| 2 — Frontend | ⬜ Next | React dark-mode dashboard, heatmap navigation (year → month → day → hour) |
| 3 — Thumbnails | ⬜ | On-demand thumbnail generation and cache |
| 4 — Delete | ⬜ | Safe synchronized deletion of photos + paired videos |

---

## Architecture

```
cameras.yaml
    │
    ▼
config.py ──► scanner.py ──► database.py (SQLite)
                                  │
                                  ▼
                             main.py (FastAPI)
                                  │
                          ┌───────┴────────┐
                     /scan             /stats
                                  /cameras
```

File access model: backend reads network paths as local directories.
SMB mounting and authentication are handled by the OS — no SMB library needed.
