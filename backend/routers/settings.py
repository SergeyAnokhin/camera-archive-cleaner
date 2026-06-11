"""FastAPI router for user settings storage."""
import logging
from fastapi import APIRouter, HTTPException
import settings_manager

router = APIRouter()
logger = logging.getLogger("api")


@router.get("/settings", summary="Get application settings from server")
def get_settings():
    return settings_manager.load_settings()


@router.put("/settings", summary="Save application settings to server (API keys will be stripped)")
def save_settings(req: dict):
    try:
        return settings_manager.save_settings(req)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save settings: {str(e)}")
