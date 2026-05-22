"""Compute-service routing config + reachability status."""
import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import compute_client
import compute_config

router = APIRouter()
logger = logging.getLogger("api")


@router.get("/compute/config", summary="Get compute-service routing config")
def get_compute_config():
    return compute_config.load_config()


class ComputeConfigUpdate(BaseModel):
    mode: str
    remote_url: str = ""


@router.put("/compute/config", summary="Update compute-service routing config")
def update_compute_config(req: ComputeConfigUpdate):
    try:
        return compute_config.save_config(req.mode, req.remote_url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/compute/status", summary="Compute-service reachability + capabilities")
def compute_status():
    cfg = compute_config.load_config()
    result = {
        "mode": cfg["mode"],
        "url": compute_config.effective_url(),
        "reachable": False,
        "capabilities": [],
    }
    if cfg["mode"] == "off":
        return result
    try:
        info = compute_client.health()
        result["reachable"] = True
        result["capabilities"] = info.get("capabilities", [])
    except compute_client.ComputeDisabled:
        result["error"] = "Remote URL is not configured"
    except compute_client.ComputeUnavailable as e:
        result["error"] = str(e)
    return result
