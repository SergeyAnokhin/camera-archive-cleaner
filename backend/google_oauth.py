"""Google OAuth 2.0 — account connection for the gmail_download / gdrive_upload tasks.

The user creates an OAuth client ("Web application") in Google Cloud Console,
saves its client_id/client_secret in Tools → Google, and connects the account
via the standard consent flow. Tokens are stored server-side in
DATA_DIR/google_oauth.json — background tasks must refresh access tokens
without a browser, so unlike the AI API keys these credentials are
intentionally persisted on the server.
"""
import base64
import json
import logging
import os
import secrets
import time
from pathlib import Path
from urllib.parse import urlencode

import httpx

logger = logging.getLogger("api")

_STORE_PATH = Path(os.getenv("DATA_DIR", str(Path(__file__).parent))) / "google_oauth.json"

AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"

# gmail.readonly — list labels/messages + download attachments;
# drive — find/create the target folder and upload (any folder, not only app-created);
# openid email — show the connected account in the UI.
SCOPES = [
    "openid",
    "email",
    "https://www.googleapis.com/auth/gmail.readonly",
]

# state → redirect_uri for in-flight consent flows (CSRF protection)
_pending_states: dict[str, str] = {}


class NotConnected(Exception):
    """Google account is not connected (no credentials or refresh token)."""


def _load() -> dict:
    if _STORE_PATH.exists():
        try:
            return json.loads(_STORE_PATH.read_text(encoding="utf-8"))
        except Exception as e:
            logger.warning("google_oauth.json unreadable: %s", e)
    return {}


def _save(store: dict) -> None:
    _STORE_PATH.write_text(json.dumps(store, indent=2), encoding="utf-8")


def get_status() -> dict:
    store = _load()
    return {
        "client_id_set": bool(store.get("client_id")),
        "connected": bool(store.get("refresh_token")),
        "email": store.get("email"),
    }


def save_credentials(client_id: str, client_secret: str) -> None:
    store = _load()
    if store.get("client_id") and store["client_id"] != client_id:
        # New OAuth client — old refresh token belongs to the old client
        store.pop("refresh_token", None)
        store.pop("access_token", None)
        store.pop("email", None)
    store["client_id"] = client_id.strip()
    store["client_secret"] = client_secret.strip()
    _save(store)
    logger.info("⚙️ Google OAuth client credentials saved")


def disconnect() -> None:
    store = _load()
    for k in ("refresh_token", "access_token", "token_expiry", "email"):
        store.pop(k, None)
    _save(store)
    logger.info("Google account disconnected")


def build_auth_url(redirect_uri: str) -> str:
    store = _load()
    if not store.get("client_id") or not store.get("client_secret"):
        raise NotConnected("OAuth client credentials are not set")
    state = secrets.token_urlsafe(24)
    _pending_states[state] = redirect_uri
    params = {
        "client_id": store["client_id"],
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "access_type": "offline",
        "prompt": "consent",  # force refresh_token issuance on re-connect
        "state": state,
    }
    return f"{AUTH_ENDPOINT}?{urlencode(params)}"


def _email_from_id_token(id_token: str) -> "str | None":
    """Decode the JWT payload (no signature check — token came from Google over TLS)."""
    try:
        payload = id_token.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        return json.loads(base64.urlsafe_b64decode(payload)).get("email")
    except Exception:
        return None


def exchange_redirect_url(url: str) -> dict:
    """Parse a full callback URL pasted from the browser address bar and exchange the code."""
    from urllib.parse import urlparse, parse_qs
    qs = parse_qs(urlparse(url).query)
    error = qs.get("error", [None])[0]
    if error:
        raise ValueError(f"Google OAuth error: {error}")
    code = qs.get("code", [None])[0]
    state = qs.get("state", [None])[0]
    if not code or not state:
        raise ValueError("URL does not contain 'code' and 'state' — copy the full redirect URL from the browser address bar")
    return exchange_code(state, code)


def exchange_code(state: str, code: str) -> dict:
    redirect_uri = _pending_states.pop(state, None)
    if redirect_uri is None:
        raise ValueError("Unknown or expired OAuth state")
    store = _load()
    resp = httpx.post(TOKEN_ENDPOINT, data={
        "client_id": store["client_id"],
        "client_secret": store["client_secret"],
        "code": code,
        "grant_type": "authorization_code",
        "redirect_uri": redirect_uri,
    }, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    store["refresh_token"] = data["refresh_token"]
    store["access_token"] = data["access_token"]
    store["token_expiry"] = time.time() + data.get("expires_in", 3600)
    email = _email_from_id_token(data.get("id_token", ""))
    if email:
        store["email"] = email
    _save(store)
    logger.info("✅ Google account connected: %s", email or "(email unknown)")
    return get_status()


def get_access_token() -> str:
    """Return a valid access token, refreshing it when <60 s of validity remain."""
    store = _load()
    if not store.get("refresh_token"):
        raise NotConnected("Google account is not connected — open Tools → Google")
    if store.get("access_token") and time.time() < store.get("token_expiry", 0) - 60:
        return store["access_token"]
    resp = httpx.post(TOKEN_ENDPOINT, data={
        "client_id": store["client_id"],
        "client_secret": store["client_secret"],
        "refresh_token": store["refresh_token"],
        "grant_type": "refresh_token",
    }, timeout=30)
    if resp.status_code == 400 and "invalid_grant" in resp.text:
        disconnect()
        raise NotConnected("Google refresh token revoked — reconnect in Tools → Google")
    resp.raise_for_status()
    data = resp.json()
    store["access_token"] = data["access_token"]
    store["token_expiry"] = time.time() + data.get("expires_in", 3600)
    _save(store)
    return store["access_token"]
