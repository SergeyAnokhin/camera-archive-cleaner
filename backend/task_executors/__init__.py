"""Task executors — one module per task type, dispatched by task_runner.

Each module exposes `run(task_id, params, resume_from)` (the AI one also takes
`provider`). Shared loop helpers live in `common.py`.
"""
import functools

from task_executors import ai, file_organizer, openvino, video_convert, video_thumbnails

# task type → async executor(task_id, params, resume_from)
EXECUTORS = {
    "video_thumbnails": video_thumbnails.run,
    "openvino": openvino.run,
    "gemini": functools.partial(ai.run, provider="gemini"),
    "claude": functools.partial(ai.run, provider="claude"),
    "video_convert": video_convert.run,
    "file_organizer": file_organizer.run,
}
