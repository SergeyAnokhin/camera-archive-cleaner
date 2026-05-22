"""Compute-service configuration — environment driven.

PATH_REMAP lets this service run on a different machine where the camera share
is mounted under a different root than the main backend's database has stored.
Only the leading prefix changes; the rest of the path is identical.

Default: identity (no remap) — works when both run on the same machine.

Env vars:
  COMPUTE_PATH_REMAP_FROM  prefix as stored in the main backend's DB
  COMPUTE_PATH_REMAP_TO    prefix as seen by this machine
"""
import os

PATH_REMAP_FROM = os.environ.get("COMPUTE_PATH_REMAP_FROM", "")
PATH_REMAP_TO = os.environ.get("COMPUTE_PATH_REMAP_TO", "")


def remap_path(path: str) -> str:
    """Swap the configured root prefix. Identity if PATH_REMAP_FROM is empty."""
    if PATH_REMAP_FROM and path.startswith(PATH_REMAP_FROM):
        return PATH_REMAP_TO + path[len(PATH_REMAP_FROM):]
    return path
