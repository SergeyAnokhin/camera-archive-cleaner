"""Generic JSON file store under DATA_DIR — shared by settings_manager.py,
compute_config.py and google_oauth.py, each of which owns one file and its
own domain logic (defaults, credential stripping, backward-compat)."""
import json
import logging
import os
from pathlib import Path

logger = logging.getLogger("api")

DATA_DIR = Path(os.getenv("DATA_DIR", str(Path(__file__).parent)))


def load_json(filename: str) -> dict:
    """Load a JSON file from DATA_DIR. Returns {} if missing/unreadable."""
    path = DATA_DIR / filename
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception as e:
            logger.warning("%s unreadable: %s", filename, e)
    return {}


def save_json(filename: str, data: dict) -> None:
    """Write a dict to a JSON file in DATA_DIR."""
    path = DATA_DIR / filename
    try:
        path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    except Exception as e:
        logger.error("Failed to save %s: %s", filename, e)
        raise
