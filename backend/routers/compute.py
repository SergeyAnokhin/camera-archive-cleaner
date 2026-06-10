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
    remote_urls: list[str] = []


@router.put("/compute/config", summary="Update compute-service routing config")
def update_compute_config(req: ComputeConfigUpdate):
    try:
        urls = req.remote_urls or ([req.remote_url] if req.remote_url else [])
        return compute_config.save_config(req.mode, remote_urls=urls)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


class ProbeUrlsRequest(BaseModel):
    urls: list[str]


@router.post("/compute/probe-urls", summary="Probe a list of compute-service URLs in parallel")
def probe_urls(req: ProbeUrlsRequest):
    """Pings each URL in the list and returns per-URL reachability.
    Used by the frontend to validate/auto-select from a multi-URL config."""
    results = []
    for url in req.urls:
        url = url.rstrip("/")
        entry: dict = {"url": url, "reachable": False}
        try:
            resp = httpx.get(f"{url}/health", timeout=3.0)
            resp.raise_for_status()
            info = resp.json()
            entry.update({"reachable": True, "capabilities": info.get("capabilities", [])})
        except Exception as e:
            entry["error"] = str(e)[:200]
        results.append(entry)
    return {"results": results}


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
    compute_url = compute_client.get_active_url()
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
    urls = compute_config.effective_urls()
    result = {
        "mode": cfg["mode"],
        "url": compute_client.get_active_url(),
        "urls": urls,
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


@router.get("/compute/discover", summary="Scan well-known in-cluster URLs and return the first reachable compute-service")
def compute_discover():
    """Tries localhost:8001 (local/docker-compose) and the k3s Helm chart Service DNS name.
    Returns the first URL that responds to /health, or found=False if none work."""
    candidates = [
        "http://localhost:8001",
        "http://camera-cleaner-compute:8001",   # Helm chart: fullnameOverride=camera-cleaner
    ]
    for url in candidates:
        try:
            resp = httpx.get(f"{url}/health", timeout=2.0)
            if resp.status_code == 200:
                return {"found": True, "url": url, "health": resp.json()}
        except Exception:
            continue
    return {"found": False, "url": None, "health": None}


@router.get("/compute/client-ip", summary="Return the real client IP as seen by the backend")
def compute_client_ip(request: Request):
    """Returns the browser's real LAN IP (not the Kubernetes pod IP).
    Traefik adds X-Forwarded-For with the original client IP; we use that first."""
    xff = request.headers.get("x-forwarded-for", "")
    if xff:
        ip = xff.split(",")[0].strip()
    else:
        ip = request.client.host if request.client else "unknown"
    return {"ip": ip}


class ComputePingRequest(BaseModel):
    mode: str
    remote_url: str = ""


@router.post("/compute/ping", summary="Test reachability of given compute settings without saving")
def compute_ping(req: ComputePingRequest):
    """Tests the compute-service at the given mode/url without persisting the config."""
    if req.mode == "off":
        return {"mode": "off", "url": None, "reachable": False, "capabilities": []}

    if req.mode == "kubernetes":
        url = compute_config._KUBERNETES_URL
    elif req.mode in ("local", "remote"):
        url = req.remote_url.rstrip("/") if req.remote_url else None
    else:
        return {"mode": req.mode, "url": None, "reachable": False, "error": f"Unknown mode '{req.mode}'"}

    result = {"mode": req.mode, "url": url, "reachable": False, "capabilities": []}
    if not url:
        result["error"] = "URL не задан"
        return result
    try:
        resp = httpx.get(f"{url}/health", timeout=3.0)
        resp.raise_for_status()
        info = resp.json()
        result["reachable"] = True
        result["capabilities"] = info.get("capabilities", [])
    except Exception as e:
        result["error"] = str(e)
    return result
