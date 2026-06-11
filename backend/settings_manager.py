import json
import logging
from pathlib import Path

logger = logging.getLogger("api")

_SETTINGS_PATH = Path(__file__).parent / "settings.json"


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
