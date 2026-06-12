"""Test bootstrap: deterministic CAMERA_ROOT before importing config (read at
import time); repo root on sys.path for `shared`."""
import os
import sys
from pathlib import Path

_SERVICE = Path(__file__).resolve().parent.parent
_ROOT = _SERVICE.parent

os.environ["CAMERA_ROOT"] = r"C:\csc_test_camera_root"

for p in (str(_SERVICE), str(_ROOT)):
    if p not in sys.path:
        sys.path.insert(0, p)
