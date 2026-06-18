import sqlite3

from db.connection import get_connection


def init_cameras_table(conn: sqlite3.Connection) -> None:
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS cameras (
            id   TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            path TEXT NOT NULL
        );
    """)


_DEFAULT_CAMERAS = [
    ("demo",     "Demo Camera", "./demo_camera"),
    ("Camera1",  "Camera 1",    "Camera/Camera1"),
]


def _seed_default_cameras(conn: sqlite3.Connection) -> None:
    row = conn.execute("SELECT COUNT(*) AS count FROM cameras").fetchone()
    if row and row["count"] > 0:
        return
    conn.executemany(
        "INSERT OR IGNORE INTO cameras (id, name, path) VALUES (?, ?, ?)",
        _DEFAULT_CAMERAS,
    )
    conn.commit()
    import logging
    logging.getLogger("api").info("📷 Seeded %d default cameras", len(_DEFAULT_CAMERAS))


def _migrate_demo_camera_path(conn: sqlite3.Connection) -> None:
    """Fix demo camera seeded with wrong absolute path /demo_camera → ./demo_camera."""
    conn.execute(
        "UPDATE cameras SET path = './demo_camera' WHERE id = 'demo' AND path = '/demo_camera'"
    )
    conn.commit()


def init_db() -> None:
    with get_connection() as conn:
        init_cameras_table(conn)
        _seed_default_cameras(conn)
        _migrate_demo_camera_path(conn)
        init_ai_analysis_table(conn)
        init_object_detection_table(conn)
        init_video_previews_table(conn)
        init_tasks_table(conn)
        init_tuning_table(conn)
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS files (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                camera_id TEXT    NOT NULL,
                file_type TEXT    NOT NULL CHECK(file_type IN ('photo', 'video')),
                file_path TEXT    NOT NULL UNIQUE,
                file_size INTEGER NOT NULL,
                timestamp TEXT    NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_cam_ts
                ON files (camera_id, timestamp);

            CREATE INDEX IF NOT EXISTS idx_cam_type_ts
                ON files (camera_id, file_type, timestamp);

            CREATE TABLE IF NOT EXISTS thumbnails (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                file_id    INTEGER NOT NULL UNIQUE,
                thumb_path TEXT    NOT NULL,
                created_at TEXT    NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
            );
        """)
        # Migration: add created_at for existing databases that predate this column
        try:
            conn.execute(
                "ALTER TABLE thumbnails ADD COLUMN created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP"
            )
        except Exception:
            pass


def init_ai_analysis_table(conn: sqlite3.Connection) -> None:
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS ai_analysis (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            file_id           INTEGER NOT NULL UNIQUE,
            provider          TEXT    NOT NULL DEFAULT 'gemini',
            model             TEXT    NOT NULL,
            analyzed_at       TEXT    NOT NULL DEFAULT (datetime('now')),
            scene_description TEXT,
            image_description TEXT,
            objects           TEXT,
            input_tokens      INTEGER NOT NULL DEFAULT 0,
            output_tokens     INTEGER NOT NULL DEFAULT 0,
            cost_usd          REAL    NOT NULL DEFAULT 0.0,
            elapsed_ms        INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_ai_analysis_file ON ai_analysis(file_id);
    """)
    # Migrations for existing databases
    for col, defn in [
        ("input_tokens",  "INTEGER NOT NULL DEFAULT 0"),
        ("output_tokens", "INTEGER NOT NULL DEFAULT 0"),
        ("cost_usd",      "REAL    NOT NULL DEFAULT 0.0"),
        ("elapsed_ms",    "INTEGER NOT NULL DEFAULT 0"),
    ]:
        try:
            conn.execute(f"ALTER TABLE ai_analysis ADD COLUMN {col} {defn}")
        except Exception:
            pass


def init_object_detection_table(conn: sqlite3.Connection) -> None:
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS object_detection (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            file_id     INTEGER NOT NULL UNIQUE,
            model       TEXT    NOT NULL,
            objects     TEXT,
            elapsed_ms  INTEGER NOT NULL DEFAULT 0,
            analyzed_at TEXT    NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_obj_det_file ON object_detection(file_id);
    """)


def init_video_previews_table(conn: sqlite3.Connection) -> None:
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS video_previews (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            file_id    INTEGER NOT NULL UNIQUE,
            mode       TEXT    NOT NULL,
            thumb_path TEXT    NOT NULL,
            created_at TEXT    NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_vid_prev_file ON video_previews(file_id);
    """)


def init_tuning_table(conn: sqlite3.Connection) -> None:
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS tuning_sessions (
            id                TEXT    PRIMARY KEY,
            name              TEXT    NOT NULL,
            status            TEXT    NOT NULL DEFAULT 'setup',
            images            TEXT    NOT NULL DEFAULT '[]',
            ground_truth      TEXT    NOT NULL DEFAULT '{}',
            benchmark_config  TEXT    NOT NULL DEFAULT '{}',
            benchmark_results TEXT,
            progress_current  INTEGER NOT NULL DEFAULT 0,
            progress_total    INTEGER NOT NULL DEFAULT 0,
            error_message     TEXT,
            created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
            completed_at      TEXT
        );
    """)
    # Migration: rename earlier file_ids-based column to images
    try:
        conn.execute("ALTER TABLE tuning_sessions ADD COLUMN images TEXT NOT NULL DEFAULT '[]'")
    except Exception:
        pass


def init_tasks_table(conn: sqlite3.Connection) -> None:
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS tasks (
            id                TEXT    PRIMARY KEY,
            type              TEXT    NOT NULL,
            status            TEXT    NOT NULL DEFAULT 'queued',
            params            TEXT    NOT NULL DEFAULT '{}',
            order_index       INTEGER NOT NULL DEFAULT 0,
            progress_current  INTEGER NOT NULL DEFAULT 0,
            progress_total    INTEGER NOT NULL DEFAULT 0,
            current_file_id   INTEGER,
            current_file_path TEXT,
            speed_per_sec     REAL,
            eta_seconds       INTEGER,
            created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
            started_at        TEXT,
            completed_at      TEXT,
            error_message     TEXT,
            log_tail          TEXT
        );
    """)
    try:
        conn.execute("ALTER TABLE tasks ADD COLUMN log_tail TEXT")
    except Exception:
        pass
    try:
        conn.execute("ALTER TABLE tasks ADD COLUMN run_after TEXT")
    except Exception:
        pass
