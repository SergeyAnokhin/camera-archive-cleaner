import os
from dataclasses import dataclass
from pathlib import Path
import yaml

CONFIG_PATH = Path(__file__).parent / "cameras.yaml"

# Set explicitly in the container (Helm: camera.smb.mountPath).
# Windows local dev: set CAMERA_ROOT=\\192.168.1.91\Camera before starting uvicorn.
CAMERA_ROOT = Path(os.environ.get("CAMERA_ROOT", "/camera"))


@dataclass
class Camera:
    id: str
    name: str
    path: str  # absolute path = CAMERA_ROOT / cameras.yaml relative path


def load_cameras(path=None) -> list[Camera]:
    from database import get_connection
    camera_root = CAMERA_ROOT
    with get_connection() as conn:
        rows = conn.execute("SELECT id, name, path FROM cameras").fetchall()
    return [
        Camera(
            id=row["id"],
            name=row["name"],
            path=str(camera_root / row["path"]),
        )
        for row in rows
    ]
