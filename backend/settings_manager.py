import json
import logging
import os
from pathlib import Path

logger = logging.getLogger("api")

# Use DATA_DIR when set (HA addon persistent volume), otherwise backend dir.
_data_dir = Path(os.getenv("DATA_DIR", str(Path(__file__).parent)))
_SETTINGS_PATH = _data_dir / "settings.json"
_SERVER_CONFIG_PATH = _data_dir / "server_config.json"


def load_settings() -> dict:
    """Load settings from settings.json. Returns empty dict if file is missing/unreadable."""
    if _SETTINGS_PATH.exists():
        try:
            return json.loads(_SETTINGS_PATH.read_text(encoding="utf-8"))
        except Exception as e:
            logger.warning("settings.json unreadable: %s", e)
    return {}


def save_settings(settings: dict) -> dict:
    """Save settings dict to settings.json on disk."""
    try:
        # Strip API keys to be absolutely sure we never persist credentials on the server
        clean_settings = dict(settings)
        if "google_ai" in clean_settings:
            clean_settings["google_ai"] = dict(clean_settings["google_ai"])
            clean_settings["google_ai"].pop("api_key", None)
        if "claude_ai" in clean_settings:
            clean_settings["claude_ai"] = dict(clean_settings["claude_ai"])
            clean_settings["claude_ai"].pop("api_key", None)

        _SETTINGS_PATH.write_text(json.dumps(clean_settings, indent=2, ensure_ascii=False), encoding="utf-8")
        logger.info("⚙️ Settings saved to settings.json (credentials stripped)")
        return clean_settings
    except Exception as e:
        logger.error("Failed to save settings.json: %s", e)
        raise e


def load_server_config() -> dict:
    """Load server-side config (camera_root, etc.) that persists independently of frontend settings."""
    if _SERVER_CONFIG_PATH.exists():
        try:
            return json.loads(_SERVER_CONFIG_PATH.read_text(encoding="utf-8"))
        except Exception as e:
            logger.warning("server_config.json unreadable: %s", e)
    return {}


def save_server_config(cfg: dict) -> dict:
    """Save server-side config to server_config.json."""
    try:
        _SERVER_CONFIG_PATH.write_text(json.dumps(cfg, indent=2, ensure_ascii=False), encoding="utf-8")
        logger.info("⚙️ Server config saved: %s", list(cfg.keys()))
        return cfg
    except Exception as e:
        logger.error("Failed to save server_config.json: %s", e)
        raise e
