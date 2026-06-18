import sqlite3


def save_object_detection(conn: sqlite3.Connection, file_id: int, model: str,
                          objects: str, elapsed_ms: int = 0) -> None:
    conn.execute(
        """
        INSERT INTO object_detection (file_id, model, objects, elapsed_ms, analyzed_at)
        VALUES (?, ?, ?, ?, datetime('now'))
        ON CONFLICT(file_id) DO UPDATE SET
            model      = excluded.model,
            objects    = excluded.objects,
            elapsed_ms = excluded.elapsed_ms,
            analyzed_at = excluded.analyzed_at
        """,
        (file_id, model, objects, elapsed_ms),
    )


def save_video_preview(conn: sqlite3.Connection, file_id: int, mode: str, thumb_path: str) -> None:
    conn.execute(
        """
        INSERT INTO video_previews (file_id, mode, thumb_path, created_at)
        VALUES (?, ?, ?, datetime('now'))
        ON CONFLICT(file_id) DO UPDATE SET
            mode       = excluded.mode,
            thumb_path = excluded.thumb_path,
            created_at = excluded.created_at
        """,
        (file_id, mode, thumb_path),
    )


def save_ai_analysis(conn: sqlite3.Connection, file_id: int, provider: str, model: str,
                     scene_description: str, image_description: str, objects: str,
                     input_tokens: int = 0, output_tokens: int = 0,
                     cost_usd: float = 0.0, elapsed_ms: int = 0) -> None:
    conn.execute(
        """
        INSERT INTO ai_analysis (file_id, provider, model, analyzed_at,
                                 scene_description, image_description, objects,
                                 input_tokens, output_tokens, cost_usd, elapsed_ms)
        VALUES (?, ?, ?, datetime('now'), ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(file_id) DO UPDATE SET
            provider          = excluded.provider,
            model             = excluded.model,
            analyzed_at       = excluded.analyzed_at,
            scene_description = excluded.scene_description,
            image_description = excluded.image_description,
            objects           = excluded.objects,
            input_tokens      = excluded.input_tokens,
            output_tokens     = excluded.output_tokens,
            cost_usd          = excluded.cost_usd,
            elapsed_ms        = excluded.elapsed_ms
        """,
        (file_id, provider, model, scene_description, image_description, objects,
         input_tokens, output_tokens, cost_usd, elapsed_ms),
    )


def get_combined_analysis_by_file_ids(conn: sqlite3.Connection, file_ids: list[int]) -> list:
    """Return merged detection + AI analysis records, one dict per file_id."""
    if not file_ids:
        return []
    ph = ",".join("?" * len(file_ids))
    ai_rows = {
        r["file_id"]: r for r in conn.execute(
            f"SELECT file_id, provider, model, analyzed_at, "
            f"scene_description, image_description, objects "
            f"FROM ai_analysis WHERE file_id IN ({ph})",
            file_ids,
        ).fetchall()
    }
    det_rows = {
        r["file_id"]: r for r in conn.execute(
            f"SELECT file_id, model, objects, analyzed_at "
            f"FROM object_detection WHERE file_id IN ({ph})",
            file_ids,
        ).fetchall()
    }
    all_ids = set(ai_rows) | set(det_rows)
    result = []
    for fid in all_ids:
        ai = ai_rows.get(fid)
        det = det_rows.get(fid)
        result.append({
            "file_id": fid,
            "detection": {
                "model": det["model"],
                "objects": det["objects"],
                "analyzed_at": det["analyzed_at"],
            } if det else None,
            "ai": {
                "provider": ai["provider"],
                "model": ai["model"],
                "analyzed_at": ai["analyzed_at"],
                "scene_description": ai["scene_description"],
                "image_description": ai["image_description"],
                "objects": ai["objects"],
            } if ai else None,
        })
    return result
