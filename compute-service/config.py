"""Compute-service configuration.

The backend strips its CAMERA_ROOT before sending paths; this service
prepends its own CAMERA_ROOT to reconstruct the absolute path.
Both services are configured with the same value in Kubernetes
(camera.smb.mountPath in values.yaml), so no path transformation is needed.

Set CAMERA_ROOT explicitly in the container environment (Helm injects it).
Windows local dev: set CAMERA_ROOT=\\\\192.168.1.91\\Camera
"""
import logging
import os
from pathlib import Path

logger = logging.getLogger("compute")

# Set explicitly in the container (Helm: camera.smb.mountPath).
# Windows local dev: set CAMERA_ROOT=\\192.168.1.91\Camera
CAMERA_ROOT = Path(os.environ.get("CAMERA_ROOT", "/camera"))


def to_absolute(relative_path: str) -> str:
    """Reconstruct the absolute path from a relative path sent by the backend."""
    return str(CAMERA_ROOT / relative_path)


def log_config() -> None:
    logger.info("CAMERA_ROOT: %s", CAMERA_ROOT)
