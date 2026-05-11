import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "snapshots.db"


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
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
        """)


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
