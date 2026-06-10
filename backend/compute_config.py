"""Compute-service routing config — persisted server-side in compute_config.json.

mode: "off"        — heavy features disabled, heavy endpoints return 503
      "kubernetes" — call the compute-service via cluster DNS (camera-cleaner-compute:8001)
      "remote"     — call the compute-service at the URLs in remote_urls

remote_urls is a list of URLs tried in order; first reachable one is used at runtime.
remote_url (single string) is kept for backward compatibility — it equals remote_urls[0].

"local" is accepted as a legacy alias for "remote".
"""
import json
import logging
from pathlib import Path

logger = logging.getLogger("api")

_CONFIG_PATH = Path(__file__).parent / "compute_config.json"
_KUBERNETES_URL = "http://camera-cleaner-compute:8001"
_DEFAULT = {"mode": "kubernetes", "remote_url": "", "remote_urls": []}
VALID_MODES = ("off", "kubernetes", "local", "remote")
_LEGACY_ALIASES = {}  # "local" now treated as "remote" in effective_urls


def load_config() -> dict:
    if _CONFIG_PATH.exists():
        try:
            data = json.loads(_CONFIG_PATH.read_text(encoding="utf-8"))
            cfg = {**_DEFAULT, **data}
            cfg["mode"] = _LEGACY_ALIASES.get(cfg["mode"], cfg["mode"])
            # Backfill remote_urls from remote_url for backwards compat
            if not cfg.get("remote_urls") and cfg.get("remote_url"):
                cfg["remote_urls"] = [cfg["remote_url"]]
            if "remote_urls" not in cfg:
                cfg["remote_urls"] = []
            return cfg
        except Exception as e:
            logger.warning("compute_config.json unreadable, using defaults: %s", e)
    return dict(_DEFAULT)


def save_config(mode: str, remote_urls: list | None = None, remote_url: str = "") -> dict:
    mode = _LEGACY_ALIASES.get(mode, mode)
    if mode not in VALID_MODES:
        raise ValueError(f"Invalid mode '{mode}'. Valid: {VALID_MODES}")
    if remote_urls is None:
        remote_urls = [remote_url] if remote_url else []
    remote_urls = [u.rstrip("/") for u in remote_urls if u.strip()]
    first_url = remote_urls[0] if remote_urls else remote_url or ""
    cfg = {"mode": mode, "remote_url": first_url, "remote_urls": remote_urls}
    _CONFIG_PATH.write_text(json.dumps(cfg, indent=2), encoding="utf-8")
    logger.info("⚙️  compute config saved: mode=%s urls=%s", mode, remote_urls or "—")
    return cfg


def effective_urls() -> list:
    """All base URLs to try, in priority order. Empty list if compute is off."""
    cfg = load_config()
    if cfg["mode"] == "off":
        return []
    if cfg["mode"] == "kubernetes":
        return [_KUBERNETES_URL]
    # remote / local: use remote_urls list (with backward compat fallback to remote_url)
    urls = cfg.get("remote_urls") or []
    if not urls and cfg.get("remote_url"):
        urls = [cfg["remote_url"]]
    return [u.rstrip("/") for u in urls if u.strip()]


def effective_url() -> str | None:
    """First URL or None — preserved for backward compat."""
    urls = effective_urls()
    return urls[0] if urls else None
