import os
from dataclasses import dataclass
from pathlib import Path

# Set explicitly in the container (Helm: camera.smb.mountPath).
# Windows local dev: set CAMERA_ROOT=\\192.168.1.91\Camera before starting uvicorn.
CAMERA_ROOT = Path(os.environ.get("CAMERA_ROOT", "/camera"))

# Backend directory — used to resolve "./" paths (demo/built-in data).
_BACKEND_DIR = Path(__file__).parent


@dataclass
class Camera:
    id: str
    name: str
    path: str  # absolute path


def _resolve_path(rel: str) -> str:
    """Resolve a stored camera path to an absolute path.

    Paths starting with "./" or ".\\" are relative to the backend directory
    (used for bundled demo data that ships with the code).
    All other paths are relative to CAMERA_ROOT.
    """
    if rel.startswith("./") or rel.startswith(".\\"):
        return str(_BACKEND_DIR / rel[2:])
    return str(CAMERA_ROOT / rel)


def load_cameras(path=None) -> list[Camera]:
    from database import get_connection
    with get_connection() as conn:
        rows = conn.execute("SELECT id, name, path FROM cameras").fetchall()
    return [
        Camera(id=row["id"], name=row["name"], path=_resolve_path(row["path"]))
        for row in rows
    ]
