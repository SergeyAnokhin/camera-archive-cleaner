"""Rule: docs/compute-service.md — the backend strips its CAMERA_ROOT prefix
from every path sent to the compute-service; the compute-service prepends its
own CAMERA_ROOT. Paths outside CAMERA_ROOT are sent as-is."""
from pathlib import Path

from compute_client import _to_relative

# conftest pins CAMERA_ROOT to this value before imports
ROOT = Path(r"C:\csc_test_camera_root")


def test_strips_camera_root_prefix():
    abs_path = str(ROOT / "Foscam" / "FI9805W" / "snap" / "MDAlarm_x.jpg")
    assert Path(_to_relative(abs_path)) == Path("Foscam/FI9805W/snap/MDAlarm_x.jpg")


def test_path_outside_root_unchanged():
    outside = r"D:\elsewhere\file.jpg"
    assert _to_relative(outside) == outside
