import os
import sqlite3
from pathlib import Path

_data_dir = Path(os.getenv('DATA_DIR', str(Path(__file__).parent.parent)))
DB_PATH = _data_dir / "snapshots.db"


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys = ON")
    return conn
