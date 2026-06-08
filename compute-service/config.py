"""Compute-service configuration — environment driven, with optional compute.env file.

PATH_REMAP lets this service run on a different machine where the camera share
is mounted under a different root than the main backend's database has stored.
Only the leading prefix changes; the rest of the path is identical.

Config priority (highest first):
  1. Environment variables (COMPUTE_PATH_REMAP_FROM / COMPUTE_PATH_REMAP_TO)
  2. compute.env file next to this file (KEY=VALUE, one per line, # comments ok)
  3. Empty string defaults (identity / no remap)

The compute.env file avoids MSYS2/Git Bash automatic path conversion,
which silently rewrites values like /camera → C:/camera in env vars.

Example compute.env:
  COMPUTE_PATH_REMAP_FROM=/camera
  COMPUTE_PATH_REMAP_TO=\\\\192.168.1.91\\Camera
"""
import logging
import os
from pathlib import Path

logger = logging.getLogger("compute")

_ENV_FILE = Path(__file__).parent / "compute.env"


def _load_env_file() -> dict:
    """Parse KEY=VALUE lines from compute.env, skipping blanks and # comments."""
    if not _ENV_FILE.exists():
        return {}
    result = {}
    for line in _ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        result[key.strip()] = val.strip()
    return result


_file_cfg = _load_env_file()


def _get(key: str) -> str:
    """Read from env (priority) or compute.env file, falling back to ''."""
    return os.environ.get(key) or _file_cfg.get(key, "")


PATH_REMAP_FROM = _get("COMPUTE_PATH_REMAP_FROM")
PATH_REMAP_TO   = _get("COMPUTE_PATH_REMAP_TO")


def remap_path(path: str) -> str:
    """Swap the configured root prefix. Identity if PATH_REMAP_FROM is empty."""
    if PATH_REMAP_FROM and path.startswith(PATH_REMAP_FROM):
        return PATH_REMAP_TO + path[len(PATH_REMAP_FROM):]
    return path


def log_config() -> None:
    """Log the active remap config so startup output shows what was loaded."""
    source = "env" if os.environ.get("COMPUTE_PATH_REMAP_FROM") else (
             "compute.env" if _file_cfg.get("COMPUTE_PATH_REMAP_FROM") else "default")
    if PATH_REMAP_FROM:
        logger.info("⚙️  path remap (%s): %r → %r", source, PATH_REMAP_FROM, PATH_REMAP_TO)
    else:
        logger.info("⚙️  path remap: disabled (identity) — source=%s", source)
