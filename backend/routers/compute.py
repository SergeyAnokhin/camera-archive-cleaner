"""Compute-service routing config + reachability status."""
import logging

import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

import compute_client
import compute_config

try:
    import psutil as _psutil
except ImportError:
    _psutil = None

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


@router.get("/services/status", summary="Backend + compute-service status and metrics")
def services_status(request: Request):
    # Backend metrics (local process)
    backend_data: dict = {"cpu_percent": None, "memory_percent": None, "memory_used": None, "memory_total": None}
    if _psutil is not None:
        cpu = _psutil.cpu_percent(interval=0.1)
        vm = _psutil.virtual_memory()
        backend_data = {
            "cpu_percent": round(cpu, 1),
            "memory_percent": round(vm.percent, 1),
            "memory_used": vm.used,
            "memory_total": vm.total,
        }

    # Compute service metrics (may be remote — use short timeout)
    cfg = compute_config.load_config()
    compute_url = compute_config.effective_url()
    compute_data: dict = {
        "mode": cfg["mode"],
        "url": compute_url,
        "reachable": False,
        "cpu_percent": None,
        "memory_percent": None,
        "memory_used": None,
        "memory_total": None,
    }
    if compute_url:
        try:
            resp = httpx.get(f"{compute_url}/metrics", timeout=1.5)
            resp.raise_for_status()
            m = resp.json()
            compute_data.update({
                "reachable": True,
                "cpu_percent": m.get("cpu_percent"),
                "memory_percent": m.get("memory_percent"),
                "memory_used": m.get("memory_used"),
                "memory_total": m.get("memory_total"),
            })
        except Exception:
            pass

    backend_url = str(request.base_url).rstrip('/')
    return {"backend_url": backend_url, "backend": backend_data, "compute": compute_data}


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
