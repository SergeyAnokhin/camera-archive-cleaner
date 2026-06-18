"""SQLite access layer, split by domain.

- `connection` — `DB_PATH` + `get_connection()`
- `schema`     — table creation + migrations (`init_db()` and per-table `init_*`)
- `files`      — files, stats and basic-thumbnail queries
- `ai`         — analysis result tables (object_detection, video_previews, ai_analysis)
- `tasks`      — persistent task queue

The top-level `database` module re-exports everything here for backward compatibility.
"""
