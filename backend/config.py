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


def load_cameras(path: Path = CONFIG_PATH) -> list[Camera]:
    with open(path, encoding="utf-8") as f:
        data = yaml.safe_load(f)
    return [
        Camera(
            id=cam["id"],
            name=cam["name"],
            path=str(CAMERA_ROOT / cam["path"]),
        )
        for cam in data["cameras"]
    ]
