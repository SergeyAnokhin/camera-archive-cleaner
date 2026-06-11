"""Background task runner — processes the task queue one task at a time.

Tasks persist in SQLite. The runner picks the lowest-order queued task and
hands it to the matching executor in `task_executors/` (one module per task
type). Executors process files one by one, write progress every ~5 seconds,
and re-read the task status between items to support pause and cancel.

On startup, tasks stuck in 'running'/'pausing' are reset to 'paused'.
"""
import asyncio
import json
import logging
from datetime import datetime

from database import get_connection
from task_executors import EXECUTORS

logger = logging.getLogger("api")

_global_paused = False


def get_global_paused() -> bool:
    return _global_paused


def set_global_paused(value: bool) -> None:
    global _global_paused
    _global_paused = value


def init_runner_state() -> None:
    """Reset tasks stuck mid-run to 'paused' after a server restart."""
    with get_connection() as conn:
        conn.execute(
            "UPDATE tasks SET status='paused' WHERE status IN ('running', 'pausing')"
        )


def _in_time_window(current_hour: int, from_hour: int, to_hour: int) -> bool:
    """True if current_hour is within [from_hour, to_hour). Handles midnight wrap."""
    if from_hour == to_hour:
        return True  # no restriction
    if from_hour < to_hour:
        return from_hour <= current_hour < to_hour
    # Wraps midnight: e.g., 22..6 means 22,23,0,1,2,3,4,5
    return current_hour >= from_hour or current_hour < to_hour


async def task_loop() -> None:
    """Infinite async loop — picks queued tasks and executes them sequentially."""
    while True:
        try:
            if _global_paused:
                await asyncio.sleep(2)
                continue
            with get_connection() as conn:
                row = conn.execute(
                    "SELECT * FROM tasks WHERE status='queued' "
                    "ORDER BY order_index ASC, created_at ASC LIMIT 1"
                ).fetchone()
            if row:
                task = dict(row)
                params = json.loads(task.get("params") or "{}")
                from_h = params.get("active_from_hour")
                to_h = params.get("active_to_hour")
                if from_h is not None and to_h is not None:
                    now_h = datetime.now().hour
                    if not _in_time_window(now_h, int(from_h), int(to_h)):
                        logger.debug(
                            "Task %s outside time window (%s–%s), sleeping 60s",
                            task["id"][:8], from_h, to_h,
                        )
                        await asyncio.sleep(60)
                        continue
                await _execute_task(task)
            else:
                await asyncio.sleep(2)
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.error("Task runner error: %s", e, exc_info=True)
            await asyncio.sleep(5)


async def _execute_task(task: dict) -> None:
    task_id = task["id"]
    task_type = task["type"]
    params = json.loads(task["params"])
    resume_from = task["progress_current"]

    logger.info("▶ Task %s (%s) starting from %d", task_id[:8], task_type, resume_from)

    with get_connection() as conn:
        conn.execute(
            "UPDATE tasks SET status='running', "
            "started_at=COALESCE(started_at, datetime('now')) WHERE id=?",
            (task_id,),
        )

    try:
        executor = EXECUTORS.get(task_type)
        if executor is None:
            raise ValueError(f"Unknown task type: {task_type}")
        await executor(task_id, params, resume_from)
    except asyncio.CancelledError:
        raise
    except Exception as e:
        logger.error("Task %s failed: %s", task_id[:8], e, exc_info=True)
        with get_connection() as conn:
            conn.execute(
                "UPDATE tasks SET status='failed', completed_at=datetime('now'), "
                "error_message=? WHERE id=?",
                (str(e)[:500], task_id),
            )
