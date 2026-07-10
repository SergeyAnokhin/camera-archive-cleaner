import logging

from server_store import load_json, save_json

logger = logging.getLogger("api")

_SETTINGS_FILE = "settings.json"
_SERVER_CONFIG_FILE = "server_config.json"


def load_settings() -> dict:
    """Load settings from settings.json. Returns empty dict if file is missing/unreadable."""
    return load_json(_SETTINGS_FILE)


def save_settings(settings: dict) -> dict:
    """Save settings dict to settings.json on disk."""
    # Strip API keys to be absolutely sure we never persist credentials on the server
    clean_settings = dict(settings)
    if "google_ai" in clean_settings:
        clean_settings["google_ai"] = dict(clean_settings["google_ai"])
        clean_settings["google_ai"].pop("api_key", None)
    if "claude_ai" in clean_settings:
        clean_settings["claude_ai"] = dict(clean_settings["claude_ai"])
        clean_settings["claude_ai"].pop("api_key", None)
    save_json(_SETTINGS_FILE, clean_settings)
    logger.info("⚙️ Settings saved to settings.json (credentials stripped)")
    return clean_settings


def load_server_config() -> dict:
    """Load server-side config (camera_root, etc.) that persists independently of frontend settings."""
    return load_json(_SERVER_CONFIG_FILE)


def save_server_config(cfg: dict) -> dict:
    """Save server-side config to server_config.json."""
    save_json(_SERVER_CONFIG_FILE, cfg)
    logger.info("⚙️ Server config saved: %s", list(cfg.keys()))
    return cfg
