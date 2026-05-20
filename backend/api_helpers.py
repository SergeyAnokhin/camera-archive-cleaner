"""Small shared helpers for API routers: log range formatting and stats-row mapping."""


def fmt_range(dt_from, dt_to) -> str:
    parts = []
    if dt_from:
        parts.append(f"с {dt_from[:16]}")
    if dt_to:
        parts.append(f"по {dt_to[:16]}")
    return " ".join(parts) if parts else "всё время"


def row_to_dict(row) -> dict:
    size = row["total_size_bytes"] or 0
    return {
        "photo_count": row["photo_count"] or 0,
        "video_count": row["video_count"] or 0,
        "total_size_bytes": size,
        "total_size_gb": round(size / 1024 ** 3, 3),
    }
