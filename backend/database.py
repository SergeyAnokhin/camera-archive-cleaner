import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "snapshots.db"


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    with get_connection() as conn:
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


def delete_camera_files(conn: sqlite3.Connection, camera_id: str) -> int:
    cursor = conn.execute("DELETE FROM files WHERE camera_id = ?", (camera_id,))
    return cursor.rowcount


def upsert_file(conn: sqlite3.Connection, camera_id: str, file_type: str,
                file_path: str, file_size: int, timestamp: str) -> None:
    conn.execute(
        """
        INSERT INTO files (camera_id, file_type, file_path, file_size, timestamp)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(file_path) DO UPDATE SET
            camera_id = excluded.camera_id,
            file_size = excluded.file_size,
            timestamp = excluded.timestamp
        """,
        (camera_id, file_type, file_path, file_size, timestamp),
    )


def _where(camera_id: str | None, date_from: str | None,
           date_to: str | None) -> tuple[str, list]:
    conditions, params = [], []
    if camera_id:
        conditions.append("camera_id = ?")
        params.append(camera_id)
    if date_from:
        conditions.append("timestamp >= ?")
        params.append(date_from)
    if date_to:
        conditions.append("timestamp <= ?")
        params.append(date_to)
    clause = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    return clause, params


def get_stats_total(conn: sqlite3.Connection, camera_id: str | None = None,
                    date_from: str | None = None, date_to: str | None = None):
    where, params = _where(camera_id, date_from, date_to)
    return conn.execute(
        f"""
        SELECT
            SUM(file_size)                                         AS total_size_bytes,
            SUM(CASE WHEN file_type='photo' THEN 1 ELSE 0 END)    AS photo_count,
            SUM(CASE WHEN file_type='video' THEN 1 ELSE 0 END)    AS video_count
        FROM files {where}
        """,
        params,
    ).fetchone()


def get_stats_by_camera(conn: sqlite3.Connection,
                        date_from: str | None = None, date_to: str | None = None):
    where, params = _where(None, date_from, date_to)
    return conn.execute(
        f"""
        SELECT
            camera_id,
            SUM(file_size)                                         AS total_size_bytes,
            SUM(CASE WHEN file_type='photo' THEN 1 ELSE 0 END)    AS photo_count,
            SUM(CASE WHEN file_type='video' THEN 1 ELSE 0 END)    AS video_count
        FROM files {where}
        GROUP BY camera_id
        """,
        params,
    ).fetchall()


def get_stats_grouped(conn: sqlite3.Connection, group_by: str,
                      camera_id: str | None = None,
                      date_from: str | None = None, date_to: str | None = None):
    fmt = {"year": "%Y", "month": "%Y-%m", "day": "%Y-%m-%d", "hour": "%H"}[group_by]
    where, params = _where(camera_id, date_from, date_to)
    return conn.execute(
        f"""
        SELECT
            strftime('{fmt}', timestamp)                           AS period,
            SUM(file_size)                                         AS total_size_bytes,
            SUM(CASE WHEN file_type='photo' THEN 1 ELSE 0 END)    AS photo_count,
            SUM(CASE WHEN file_type='video' THEN 1 ELSE 0 END)    AS video_count
        FROM files {where}
        GROUP BY period
        ORDER BY period
        """,
        params,
    ).fetchall()


# ---------------------------------------------------------------------------
# Stage 3: files + thumbnails
# ---------------------------------------------------------------------------

def get_files_paginated(conn: sqlite3.Connection, camera_id: str | None,
                        date_from: str | None, date_to: str | None,
                        page: int, page_size: int) -> tuple:
    where, params = _where(camera_id, date_from, date_to)
    total = conn.execute(
        f"SELECT COUNT(*) AS n FROM files {where}", params
    ).fetchone()["n"]
    offset = (page - 1) * page_size
    rows = conn.execute(
        f"""
        SELECT id, file_type, file_path, file_size, timestamp
        FROM files {where}
        ORDER BY timestamp ASC
        LIMIT ? OFFSET ?
        """,
        params + [page_size, offset],
    ).fetchall()
    return rows, total


def get_file_by_id(conn: sqlite3.Connection, file_id: int):
    return conn.execute(
        "SELECT id, file_type, file_path, file_size, timestamp FROM files WHERE id = ?",
        (file_id,),
    ).fetchone()


def get_sampled_photo_ids(conn: sqlite3.Connection, camera_id: str | None,
                          date_from: str | None, date_to: str | None,
                          count: int) -> list[int]:
    conditions, params = [], []
    conditions.append("file_type = 'photo'")
    if camera_id:
        conditions.append("camera_id = ?")
        params.append(camera_id)
    if date_from:
        conditions.append("timestamp >= ?")
        params.append(date_from)
    if date_to:
        conditions.append("timestamp <= ?")
        params.append(date_to)
    where = "WHERE " + " AND ".join(conditions)
    rows = conn.execute(
        f"SELECT id FROM files {where} ORDER BY timestamp ASC", params
    ).fetchall()
    ids = [r["id"] for r in rows]
    return _uniform_sample(ids, count)


def _uniform_sample(items: list, count: int) -> list:
    total = len(items)
    if total == 0:
        return []
    if total <= count:
        return items
    return [items[round(total * (2 * i + 1) / (2 * count))] for i in range(count)]


def get_thumbnail_path(conn: sqlite3.Connection, file_id: int) -> str | None:
    row = conn.execute(
        "SELECT thumb_path FROM thumbnails WHERE file_id = ?", (file_id,)
    ).fetchone()
    return row["thumb_path"] if row else None


def save_thumbnail_path(conn: sqlite3.Connection, file_id: int, path: str) -> None:
    conn.execute(
        """
        INSERT INTO thumbnails (file_id, thumb_path, created_at) VALUES (?, ?, datetime('now'))
        ON CONFLICT(file_id) DO UPDATE SET
            thumb_path = excluded.thumb_path,
            created_at = datetime('now')
        """,
        (file_id, path),
    )


def pop_old_basic_thumbnails(conn: sqlite3.Connection, days: int = 30) -> list[str]:
    """Remove thumbnail DB rows older than `days` days. Returns disk paths to delete."""
    rows = conn.execute(
        "SELECT thumb_path FROM thumbnails WHERE created_at < datetime('now', ?)",
        (f"-{days} days",),
    ).fetchall()
    paths = [r["thumb_path"] for r in rows]
    if paths:
        conn.execute(
            "DELETE FROM thumbnails WHERE created_at < datetime('now', ?)",
            (f"-{days} days",),
        )
    return paths


def get_hour_distribution(conn: sqlite3.Connection, camera_id: str | None,
                          date_from: str | None, date_to: str | None) -> list:
    conditions, params = [], []
    if camera_id:
        conditions.append("camera_id = ?")
        params.append(camera_id)
    if date_from:
        conditions.append("timestamp >= ?")
        params.append(date_from)
    if date_to:
        conditions.append("timestamp <= ?")
        params.append(date_to)
    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    return conn.execute(
        f"""
        SELECT
            CAST(strftime('%M', timestamp) AS INTEGER)                          AS bucket,
            COUNT(*)                                                             AS total_count,
            SUM(CASE WHEN file_type='photo' THEN 1 ELSE 0 END)                  AS photo_count,
            SUM(CASE WHEN file_type='video' THEN 1 ELSE 0 END)                  AS video_count,
            SUM(CASE WHEN file_type='photo' THEN COALESCE(file_size,0) ELSE 0 END) AS photo_size_bytes,
            SUM(CASE WHEN file_type='video' THEN COALESCE(file_size,0) ELSE 0 END) AS video_size_bytes,
            SUM(COALESCE(file_size, 0))                                         AS total_size_bytes
        FROM files {where}
        GROUP BY bucket
        ORDER BY bucket
        """,
        params,
    ).fetchall()


def delete_all_thumbnails(conn: sqlite3.Connection) -> int:
    cursor = conn.execute("DELETE FROM thumbnails")
    return cursor.rowcount
