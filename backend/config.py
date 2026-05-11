from dataclasses import dataclass
from pathlib import Path
import yaml

CONFIG_PATH = Path(__file__).parent / "cameras.yaml"


@dataclass
class Camera:
    id: str
    name: str
    path_snapshots: str
    path_videos: str


def load_cameras(path: Path = CONFIG_PATH) -> list[Camera]:
    with open(path, encoding="utf-8") as f:
        data = yaml.safe_load(f)
    return [
        Camera(
            id=cam["id"],
            name=cam["name"],
            path_snapshots=cam["path_snapshots"],
            path_videos=cam["path_videos"],
        )
        for cam in data["cameras"]
    ]
