"""Rule: docs/visualization-modes.md#cache-management + docs/deployment.md —
every thumbnail cache is a subdirectory of the single CACHE_BASE_DIR root, which
is driven by the CACHE_DIR env var (falling back to DATA_DIR/cache).

This is what lets the deployments point all caches somewhere else with one knob:
the Helm chart mounts one subPath and sets CACHE_DIR; the HA add-on sets
CACHE_DIR=/tmp/... to keep caches out of backups. A cache that hard-codes its
path escapes that mount and is silently lost on restart — this test pins the
contract so a new cache dir cannot regress it.
"""
import os
from pathlib import Path

import compute_cache
from diff_thumbnails import DIFF_THUMB_DIR
from thumbnails import THUMB_DIR

# Every cache dir the backend owns, with the name docs refer to it by.
ALL_CACHE_DIRS = {
    "basic": THUMB_DIR,
    "diff": DIFF_THUMB_DIR,
    "openvino": compute_cache.OV_THUMB_DIR,
    "video": compute_cache.VID_THUMB_DIR,
}


def test_every_cache_dir_is_under_cache_base_dir():
    for name, path in ALL_CACHE_DIRS.items():
        assert path.parent == compute_cache.CACHE_BASE_DIR, (
            f"{name} cache ({path}) is not a direct child of CACHE_BASE_DIR "
            f"({compute_cache.CACHE_BASE_DIR}) — it would escape the CACHE_DIR mount"
        )


def test_cache_dir_names_are_the_documented_ones():
    assert {p.name for p in ALL_CACHE_DIRS.values()} == set(ALL_CACHE_DIRS)


def test_cache_base_dir_defaults_under_data_dir():
    # conftest sets DATA_DIR and leaves CACHE_DIR unset.
    assert "CACHE_DIR" not in os.environ
    assert compute_cache.CACHE_BASE_DIR == Path(os.environ["DATA_DIR"]) / "cache"


def test_cache_dir_env_var_overrides_the_root(monkeypatch):
    monkeypatch.setenv("CACHE_DIR", str(Path("/tmp/camera-cleaner-cache")))
    import importlib

    reloaded = importlib.reload(compute_cache)
    try:
        assert reloaded.CACHE_BASE_DIR == Path("/tmp/camera-cleaner-cache")
        assert reloaded.OV_THUMB_DIR.parent == reloaded.CACHE_BASE_DIR
        assert reloaded.VID_THUMB_DIR.parent == reloaded.CACHE_BASE_DIR
    finally:
        # Other tests import these module-level constants — restore the original.
        monkeypatch.delenv("CACHE_DIR")
        importlib.reload(compute_cache)


def test_ov_cache_path_is_stable_and_key_sensitive():
    a = compute_cache.ov_cache_path(1, "yolov8n", 0.25, (0, 2))
    assert a == compute_cache.ov_cache_path(1, "yolov8n", 0.25, (2, 0)), \
        "classes must be order-insensitive — it is sorted into the key"
    assert a != compute_cache.ov_cache_path(1, "yolov8n", 0.30, (0, 2))
    assert a != compute_cache.ov_cache_path(1, "yolov8n", 0.25, None)
    assert a.parent == compute_cache.OV_THUMB_DIR


def test_video_cache_path_extension_follows_mode():
    assert compute_cache.video_cache_path(7, "first_frame").suffix == ".jpg"
    assert compute_cache.video_cache_path(7, "max_change_gif").suffix == ".gif"
