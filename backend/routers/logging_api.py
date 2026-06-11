"""Logging config + log tail API — /logging/*"""
import logging

import httpx
from fastapi import APIRouter
from pydantic import BaseModel

import compute_client
import logging_setup

router = APIRouter()
logger = logging.getLogger("api")


@router.get("/logging/config", summary="Get current backend log config")
def get_logging_config():
    return logging_setup.get_log_config()


class LogConfigUpdate(BaseModel):
    level: str = "INFO"
    file_max_lines: int = 500


@router.put("/logging/config", summary="Update backend log level and buffer size (live)")
def update_logging_config(req: LogConfigUpdate):
    logging_setup.configure_logging({"level": req.level, "file_max_lines": req.file_max_lines})
    return logging_setup.get_log_config()


@router.get("/logging/tail", summary="Return last N lines from the backend log buffer")
def get_log_tail(n: int = 200):
    lines = logging_setup.get_log_tail(n)
    return {"lines": lines, "total": len(lines)}


# ── Compute service proxy ──────────────────────────────────────────────────────

@router.get("/logging/compute/config", summary="Get compute-service log config (proxied)")
def get_compute_logging_config():
    url = compute_client.get_active_url()
    if not url:
        return {"level": None, "file_max_lines": None, "error": "compute unavailable"}
    try:
        resp = httpx.get(f"{url}/logging/config", timeout=3.0)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        return {"level": None, "file_max_lines": None, "error": str(e)[:200]}


class ComputeLogConfigUpdate(BaseModel):
    level: str = "INFO"
    file_max_lines: int = 200


@router.put("/logging/compute/config", summary="Update compute-service log config (proxied)")
def update_compute_logging_config(req: ComputeLogConfigUpdate):
    url = compute_client.get_active_url()
    if not url:
        return {"error": "compute unavailable"}
    try:
        resp = httpx.put(
            f"{url}/logging/config",
            json={"level": req.level, "file_max_lines": req.file_max_lines},
            timeout=3.0,
        )
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        return {"error": str(e)[:200]}


@router.get("/logging/compute/tail", summary="Return last N lines from compute-service log (proxied)")
def get_compute_log_tail(n: int = 200):
    url = compute_client.get_active_url()
    if not url:
        return {"lines": [], "total": 0, "error": "compute unavailable"}
    try:
        resp = httpx.get(f"{url}/logging/tail", params={"n": n}, timeout=3.0)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        return {"lines": [], "total": 0, "error": str(e)[:200]}
