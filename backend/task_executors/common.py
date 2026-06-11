"""Shared helpers for task executors.

Every executor follows the same skeleton: build a file list, loop over it,
check pause/cancel between items (`pause_if_requested`), write progress every
~5 s, and finish with `mark_completed`. Blocking helpers are sync — call them
via `asyncio.to_thread`.
"""
import asyncio
import logging
import time
from collections import deque
from datetime import datetime, timezone

from database import get_connection, update_task_progress, append_task_log

logger = logging.getLogger("api")

PROGRESS_INTERVAL = 5.0  # seconds between DB progress writes


class SpeedTracker:
    """Sliding window speed tracker (items/sec).
    Keeps only events within the last `window_sec` seconds."""
    def __init__(self, window_sec: float):
        self._window = max(window_sec, 10.0)
        self._events: deque = deque()  # (abs_time, cumulative_count)

    def record(self, cumulative: int) -> None:
        now = time.time()
        self._events.append((now, cumulative))
        cutoff = now - self._window
        while len(self._events) > 1 and self._events[0][0] < cutoff:
            self._events.popleft()

    def speed(self) -> "float | None":
        if len(self._events) < 2:
            return None
        dt = self._events[-1][0] - self._events[0][0]
        dn = self._events[-1][1] - self._events[0][1]
        return dn / dt if dt >= 1.0 else None


def read_status(task_id: str) -> str:
    with get_connection() as conn:
        row = conn.execute("SELECT status FROM tasks WHERE id=?", (task_id,)).fetchone()
    return row["status"] if row else "cancelled"


def write_progress(task_id: str, current: int, total: int,
                   file_id, file_path, speed, eta) -> None:
    with get_connection() as conn:
        update_task_progress(conn, task_id, current, total, file_id, file_path, speed, eta)


def append_log(task_id: str, msg: str) -> None:
    ts = time.strftime("%H:%M:%S")
    line = f"[{ts}] {msg}"
    logger.info("Task %s: %s", task_id[:8], msg)
    with get_connection() as conn:
        append_task_log(conn, task_id, line)


def parse_dt(s: "str | None"):
    """Parse ISO datetime string to timezone-aware datetime (UTC if no tz given)."""
    if not s:
        return None
    dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


async def pause_if_requested(task_id: str, current: int, total: int,
                             file_path: "str | None" = None) -> bool:
    """Between-items pause/cancel check. Returns True if the executor must stop.

    On 'pausing'/'cancelled' writes final progress, flips status to 'paused'.
    """
    status = await asyncio.to_thread(read_status, task_id)
    if status not in ("pausing", "cancelled"):
        return False
    await asyncio.to_thread(write_progress, task_id, current, total, None, file_path, None, None)
    with get_connection() as conn:
        conn.execute("UPDATE tasks SET status='paused' WHERE id=?", (task_id,))
    logger.info("⏸ Task %s paused at %d/%d", task_id[:8], current, total)
    return True


def mark_completed(task_id: str, final: int, total: int) -> None:
    with get_connection() as conn:
        conn.execute(
            "UPDATE tasks SET status='completed', completed_at=datetime('now'), "
            "progress_current=?, progress_total=?, speed_per_sec=NULL, eta_seconds=NULL, "
            "current_file_id=NULL, current_file_path=NULL WHERE id=?",
            (final, total, task_id),
        )
