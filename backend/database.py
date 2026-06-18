"""Backward-compatible facade for the DB layer.

The implementation lives in the `db/` package, split by domain. Import from
either `database` (this facade) or the specific `db.*` module. New queries should
be added to the matching `db/*.py` module and re-exported here.
"""

from db.connection import DB_PATH, get_connection
from db.schema import (
    init_db,
    init_cameras_table,
    init_ai_analysis_table,
    init_object_detection_table,
    init_video_previews_table,
    init_tasks_table,
    init_tuning_table,
)
from db.files import (
    delete_camera_files,
    upsert_file,
    get_stats_total,
    get_stats_by_camera,
    get_stats_grouped,
    get_files_paginated,
    get_file_by_id,
    get_sampled_photo_ids,
    get_thumbnail_path,
    save_thumbnail_path,
    pop_old_basic_thumbnails,
    get_hour_distribution,
    delete_all_thumbnails,
)
from db.ai import (
    save_object_detection,
    save_video_preview,
    save_ai_analysis,
    get_combined_analysis_by_file_ids,
)
from db.tasks import (
    append_task_log,
    get_all_tasks,
    get_task,
    create_task,
    update_task_status,
    update_task_progress,
    delete_task,
    reorder_tasks,
)
