"""Rules: docs/google-integration.md — get_access_token() returns the cached
access token while >60 s of validity remain, refreshes it via the token
endpoint otherwise, and on an `invalid_grant` refresh error disconnects the
account and raises NotConnected. httpx is mocked — no real Google calls."""
import time
from types import SimpleNamespace

import pytest

import google_oauth
from google_oauth import NotConnected, get_access_token


@pytest.fixture(autouse=True)
def _clean_store():
    """Each test starts with an empty google_oauth.json store."""
    google_oauth._save({})
    yield
    google_oauth._save({})


def _seed(**extra):
    store = {"client_id": "cid", "client_secret": "cs", "refresh_token": "rt"}
    store.update(extra)
    google_oauth._save(store)


def _fake_post(monkeypatch, status_code=200, payload=None, text=""):
    """Mock httpx.post; returns a dict capturing the request data."""
    captured = {}

    def post(url, data=None, timeout=None):
        captured["url"] = url
        captured["data"] = data
        return SimpleNamespace(
            status_code=status_code,
            text=text,
            json=lambda: payload or {},
            raise_for_status=lambda: None,
        )

    monkeypatch.setattr(google_oauth.httpx, "post", post)
    return captured


def test_not_connected_raises():
    with pytest.raises(NotConnected):
        get_access_token()


def test_cached_token_reused_while_valid(monkeypatch):
    _seed(access_token="cached", token_expiry=time.time() + 3600)

    def _no_call(*a, **kw):
        raise AssertionError("token endpoint must not be called")

    monkeypatch.setattr(google_oauth.httpx, "post", _no_call)
    assert get_access_token() == "cached"


def test_expired_token_refreshed_and_persisted(monkeypatch):
    _seed(access_token="old", token_expiry=time.time() + 30)  # <60 s left
    captured = _fake_post(monkeypatch, payload={"access_token": "new", "expires_in": 1000})

    assert get_access_token() == "new"
    assert captured["data"]["grant_type"] == "refresh_token"
    assert captured["data"]["refresh_token"] == "rt"
    store = google_oauth._load()
    assert store["access_token"] == "new"
    assert store["token_expiry"] > time.time()


def test_invalid_grant_disconnects(monkeypatch):
    _seed(access_token="old", token_expiry=0)
    _fake_post(monkeypatch, status_code=400, text='{"error": "invalid_grant"}')

    with pytest.raises(NotConnected):
        get_access_token()
    assert google_oauth.get_status()["connected"] is False
