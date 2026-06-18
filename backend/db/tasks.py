import json
import sqlite3


def append_task_log(conn: sqlite3.Connection, task_id: str, line: str,
                    max_lines: int = 300) -> None:
    row = conn.execute("SELECT log_tail FROM tasks WHERE id=?", (task_id,)).fetchone()
    existing = json.loads(row["log_tail"] or "[]") if row else []
    existing.append(line)
    if len(existing) > max_lines:
        existing = existing[-max_lines:]
    conn.execute("UPDATE tasks SET log_tail=? WHERE id=?",
                 (json.dumps(existing), task_id))


def get_all_tasks(conn: sqlite3.Connection) -> list:
    return conn.execute(
        "SELECT * FROM tasks ORDER BY order_index ASC, created_at ASC"
    ).fetchall()


def get_task(conn: sqlite3.Connection, task_id: str):
    return conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()


def create_task(conn: sqlite3.Connection, task_id: str, task_type: str,
                params_json: str, order_index: int) -> None:
    conn.execute(
        "INSERT INTO tasks (id, type, params, order_index) VALUES (?, ?, ?, ?)",
        (task_id, task_type, params_json, order_index),
    )


def update_task_status(conn: sqlite3.Connection, task_id: str, status: str) -> None:
    conn.execute("UPDATE tasks SET status = ? WHERE id = ?", (status, task_id))


def update_task_progress(conn: sqlite3.Connection, task_id: str, current: int, total: int,
                         file_id, file_path: str | None,
                         speed: float | None, eta: int | None) -> None:
    conn.execute(
        """UPDATE tasks SET progress_current=?, progress_total=?, current_file_id=?,
           current_file_path=?, speed_per_sec=?, eta_seconds=? WHERE id=?""",
        (current, total, file_id, file_path, speed, eta, task_id),
    )


def delete_task(conn: sqlite3.Connection, task_id: str) -> None:
    conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))


def reorder_tasks(conn: sqlite3.Connection, order_list: list[dict]) -> None:
    for item in order_list:
        conn.execute(
            "UPDATE tasks SET order_index = ? WHERE id = ?",
            (item["order_index"], item["id"]),
        )
