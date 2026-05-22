"""Compute-service routing config — persisted server-side in compute_config.json.

mode: "off"    — heavy features disabled, heavy endpoints return 503
      "local"  — call the compute-service on localhost:8001
      "remote" — call the compute-service at remote_url
"""
import json
import logging
from pathlib import Path

logger = logging.getLogger("api")

_CONFIG_PATH = Path(__file__).parent / "compute_config.json"
_LOCAL_URL = "http://localhost:8001"
_DEFAULT = {"mode": "local", "remote_url": ""}
VALID_MODES = ("off", "local", "remote")


def load_config() -> dict:
    if _CONFIG_PATH.exists():
        try:
            data = json.loads(_CONFIG_PATH.read_text(encoding="utf-8"))
            return {**_DEFAULT, **data}
        except Exception as e:
            logger.warning("compute_config.json unreadable, using defaults: %s", e)
    return dict(_DEFAULT)


def save_config(mode: str, remote_url: str) -> dict:
    if mode not in VALID_MODES:
        raise ValueError(f"Invalid mode '{mode}'. Valid: {VALID_MODES}")
    cfg = {"mode": mode, "remote_url": remote_url or ""}
    _CONFIG_PATH.write_text(json.dumps(cfg, indent=2), encoding="utf-8")
    logger.info("⚙️  compute config saved: mode=%s url=%s", mode, remote_url or "—")
    return cfg


def effective_url() -> str | None:
    """Base URL to call, or None if compute is off / remote URL is missing."""
    cfg = load_config()
    if cfg["mode"] == "off":
        return None
    if cfg["mode"] == "local":
        return _LOCAL_URL
    return cfg["remote_url"].rstrip("/") or None
