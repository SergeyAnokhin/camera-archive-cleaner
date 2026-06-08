"""Compute-service routing config — persisted server-side in compute_config.json.

mode: "off"        — heavy features disabled, heavy endpoints return 503
      "kubernetes" — call the compute-service via cluster DNS (camera-cleaner-compute:8001)
      "remote"     — call the compute-service at remote_url

"local" is accepted as a legacy alias for "kubernetes" (stored values migrate on next save).
"""
import json
import logging
from pathlib import Path

logger = logging.getLogger("api")

_CONFIG_PATH = Path(__file__).parent / "compute_config.json"
_KUBERNETES_URL = "http://camera-cleaner-compute:8001"
_DEFAULT = {"mode": "kubernetes", "remote_url": ""}
VALID_MODES = ("off", "kubernetes", "local", "remote")
_LEGACY_ALIASES = {}  # no legacy aliases; "local" is now a distinct mode


def load_config() -> dict:
    if _CONFIG_PATH.exists():
        try:
            data = json.loads(_CONFIG_PATH.read_text(encoding="utf-8"))
            cfg = {**_DEFAULT, **data}
            cfg["mode"] = _LEGACY_ALIASES.get(cfg["mode"], cfg["mode"])
            return cfg
        except Exception as e:
            logger.warning("compute_config.json unreadable, using defaults: %s", e)
    return dict(_DEFAULT)


def save_config(mode: str, remote_url: str) -> dict:
    mode = _LEGACY_ALIASES.get(mode, mode)
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
    if cfg["mode"] == "kubernetes":
        return _KUBERNETES_URL
    # local and remote both store their target in remote_url
    return cfg["remote_url"].rstrip("/") or None
