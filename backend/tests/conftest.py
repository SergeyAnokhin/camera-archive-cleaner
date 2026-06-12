"""Test bootstrap: isolated DATA_DIR + deterministic CAMERA_ROOT before any
backend module is imported (both are read at import time)."""
import os
import sys
import tempfile
from pathlib import Path

_BACKEND = Path(__file__).resolve().parent.parent
_ROOT = _BACKEND.parent

os.environ["DATA_DIR"] = tempfile.mkdtemp(prefix="csc_test_")
os.environ["CAMERA_ROOT"] = r"C:\csc_test_camera_root"

for p in (str(_BACKEND), str(_ROOT)):
    if p not in sys.path:
        sys.path.insert(0, p)

import pytest  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def _init_db():
    import database
    database.init_db()


@pytest.fixture()
def db_conn():
    """Connection to the temp test DB with the files table wiped."""
    import database
    with database.get_connection() as conn:
        conn.execute("DELETE FROM files")
        conn.execute("DELETE FROM ai_analysis")
        conn.commit()
        yield conn
