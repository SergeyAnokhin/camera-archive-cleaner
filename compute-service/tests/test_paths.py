"""Rule: docs/compute-service.md — the compute-service reconstructs absolute
paths by prepending its own CAMERA_ROOT to the relative path sent by the
backend (mirror of backend's _to_relative)."""
from pathlib import Path

from config import to_absolute


def test_prepends_camera_root():
    assert Path(to_absolute("Foscam/FI9805W/snap.jpg")) == \
        Path(r"C:\csc_test_camera_root") / "Foscam" / "FI9805W" / "snap.jpg"


def test_roundtrip_with_backend_contract():
    # backend sends a relative path; the absolute path must stay under CAMERA_ROOT
    abs_path = Path(to_absolute("cam/img.jpg"))
    assert abs_path.is_relative_to(Path(r"C:\csc_test_camera_root"))
