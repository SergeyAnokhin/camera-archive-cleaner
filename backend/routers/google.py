"""Google account integration endpoints.

GET  /google/auth/status       — OAuth client + connection status
PUT  /google/auth/credentials  — save OAuth client id/secret
GET  /google/auth/url          — build the consent URL for a redirect_uri
GET  /google/oauth/callback    — OAuth redirect target (code → tokens)
POST /google/auth/disconnect   — drop tokens (client credentials are kept)
GET  /google/gmail/labels      — Gmail labels for the gmail_download task form
"""
import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

import google_api
import google_oauth

router = APIRouter(prefix="/google")
logger = logging.getLogger("api")


@router.get("/auth/status")
def auth_status():
    return google_oauth.get_status()


class CredentialsRequest(BaseModel):
    client_id: str
    client_secret: str


@router.put("/auth/credentials")
def save_credentials(req: CredentialsRequest):
    if not req.client_id.strip() or not req.client_secret.strip():
        raise HTTPException(status_code=400, detail="client_id and client_secret are required")
    google_oauth.save_credentials(req.client_id, req.client_secret)
    return google_oauth.get_status()


@router.get("/auth/url")
def auth_url(redirect_uri: str):
    try:
        return {"url": google_oauth.build_auth_url(redirect_uri)}
    except google_oauth.NotConnected as e:
        raise HTTPException(status_code=400, detail=str(e))


_CALLBACK_HTML = """<!doctype html>
<html><head><meta charset="utf-8"><title>Camera Cleaner</title></head>
<body style="background:#111827;color:#e5e7eb;font-family:sans-serif;
             display:flex;align-items:center;justify-content:center;height:100vh">
  <div style="text-align:center">
    <h2>{title}</h2>
    <p>{message}</p>
  </div>
  <script>setTimeout(() => window.close(), 1500)</script>
</body></html>"""


@router.get("/oauth/callback")
def oauth_callback(state: str = "", code: str = "", error: str = ""):
    if error or not code:
        logger.warning("Google OAuth callback error: %s", error or "no code")
        return HTMLResponse(_CALLBACK_HTML.format(
            title="Google connection failed",
            message=error or "No authorization code received."))
    try:
        status = google_oauth.exchange_code(state, code)
    except Exception as e:
        logger.error("Google OAuth code exchange failed: %s", e)
        return HTMLResponse(_CALLBACK_HTML.format(
            title="Google connection failed", message=str(e)))
    return HTMLResponse(_CALLBACK_HTML.format(
        title="Google account connected",
        message=f"{status.get('email') or ''} — you can close this tab."))


@router.post("/auth/disconnect")
def auth_disconnect():
    google_oauth.disconnect()
    return google_oauth.get_status()


@router.get("/gmail/labels")
def gmail_labels():
    try:
        return {"labels": google_api.gmail_list_labels()}
    except google_oauth.NotConnected as e:
        raise HTTPException(status_code=400, detail=str(e))
