"""Thin sync REST client for the Gmail and Drive APIs (httpx, bearer auth via google_oauth).

Used by the gmail_download / gdrive_upload task executors and routers/google.py.
All functions are blocking — executors call them via asyncio.to_thread.
The pure helpers `extract_attachments()` and `split_drive_path()` are unit-tested
(see docs/google-integration.md).
"""
import base64
import logging
import mimetypes
from pathlib import Path

import httpx

import google_oauth

logger = logging.getLogger("api")

GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me"
DRIVE = "https://www.googleapis.com/drive/v3"
DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3"

MEDIA_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp",
                    ".mp4", ".mkv", ".avi", ".mov", ".webm"}


def _headers() -> dict:
    return {"Authorization": f"Bearer {google_oauth.get_access_token()}"}


def _get(url: str, params: dict | None = None, timeout: float = 60) -> dict:
    resp = httpx.get(url, params=params, headers=_headers(), timeout=timeout)
    resp.raise_for_status()
    return resp.json()


# ── Gmail ────────────────────────────────────────────────────────────────

def gmail_list_labels() -> list[dict]:
    data = _get(f"{GMAIL}/labels")
    return [{"id": l["id"], "name": l["name"]} for l in data.get("labels", [])]


def gmail_list_message_ids(label_id: str, after_epoch: "int | None" = None,
                           before_epoch: "int | None" = None) -> list[str]:
    """All message ids in a label (newest first — Gmail's order), paginated."""
    q_parts = []
    if after_epoch:
        q_parts.append(f"after:{after_epoch}")
    if before_epoch:
        q_parts.append(f"before:{before_epoch}")
    params = {"labelIds": label_id, "maxResults": 500}
    if q_parts:
        params["q"] = " ".join(q_parts)
    ids: list[str] = []
    while True:
        data = _get(f"{GMAIL}/messages", params=params)
        ids.extend(m["id"] for m in data.get("messages", []))
        token = data.get("nextPageToken")
        if not token:
            return ids
        params["pageToken"] = token


def gmail_get_message(msg_id: str) -> dict:
    return _get(f"{GMAIL}/messages/{msg_id}", params={"format": "full"})


def gmail_get_attachment(msg_id: str, attachment_id: str) -> bytes:
    data = _get(f"{GMAIL}/messages/{msg_id}/attachments/{attachment_id}", timeout=120)
    return base64.urlsafe_b64decode(data["data"])


def extract_attachments(payload: dict) -> list[dict]:
    """Walk a Gmail message payload tree and collect photo/video attachments.

    Returns [{filename, mime_type, attachment_id, data}] where exactly one of
    attachment_id (large parts) or data (small inline parts, base64url) is set.
    A part qualifies by image/* or video/* MIME type, or by file extension —
    cameras often send application/octet-stream with a .jpg name.
    """
    found: list[dict] = []

    def walk(part: dict) -> None:
        for sub in part.get("parts", []):
            walk(sub)
        filename = part.get("filename") or ""
        if not filename:
            return
        mime = part.get("mimeType", "")
        ext = Path(filename).suffix.lower()
        if not (mime.startswith("image/") or mime.startswith("video/")
                or ext in MEDIA_EXTENSIONS):
            return
        body = part.get("body", {})
        if body.get("attachmentId"):
            found.append({"filename": filename, "mime_type": mime,
                          "attachment_id": body["attachmentId"], "data": None})
        elif body.get("data"):
            found.append({"filename": filename, "mime_type": mime,
                          "attachment_id": None, "data": body["data"]})

    walk(payload)
    return found


# ── Drive ────────────────────────────────────────────────────────────────

def split_drive_path(path: str) -> list[str]:
    """Normalize a user-typed Drive folder path into clean segments."""
    return [seg.strip() for seg in path.replace("\\", "/").split("/") if seg.strip()]


def drive_find_or_create_folder(path: str) -> str:
    """Resolve 'A/B/C' to a folder id under My Drive root, creating missing levels."""
    parent = "root"
    for seg in split_drive_path(path):
        name_esc = seg.replace("'", "\\'")
        q = (f"name='{name_esc}' and '{parent}' in parents "
             "and mimeType='application/vnd.google-apps.folder' and trashed=false")
        data = _get(f"{DRIVE}/files", params={"q": q, "fields": "files(id)", "pageSize": 1})
        files = data.get("files", [])
        if files:
            parent = files[0]["id"]
        else:
            resp = httpx.post(f"{DRIVE}/files", headers=_headers(), timeout=60, json={
                "name": seg, "mimeType": "application/vnd.google-apps.folder",
                "parents": [parent],
            })
            resp.raise_for_status()
            parent = resp.json()["id"]
    return parent


def drive_list_filenames(folder_id: str) -> set[str]:
    """Names of all non-trashed files already in the folder (for skip-if-exists)."""
    names: set[str] = set()
    params = {"q": f"'{folder_id}' in parents and trashed=false",
              "fields": "nextPageToken,files(name)", "pageSize": 1000}
    while True:
        data = _get(f"{DRIVE}/files", params=params)
        names.update(f["name"] for f in data.get("files", []))
        token = data.get("nextPageToken")
        if not token:
            return names
        params["pageToken"] = token


def drive_upload_file(folder_id: str, local_path: str) -> None:
    """Resumable upload of one local file into the folder (single PUT of the body)."""
    p = Path(local_path)
    mime = mimetypes.guess_type(p.name)[0] or "application/octet-stream"
    init = httpx.post(
        f"{DRIVE_UPLOAD}/files?uploadType=resumable",
        headers={**_headers(), "X-Upload-Content-Type": mime},
        json={"name": p.name, "parents": [folder_id]},
        timeout=60,
    )
    init.raise_for_status()
    session_url = init.headers["Location"]
    with p.open("rb") as f:
        resp = httpx.put(session_url, content=f,
                         headers={"Content-Type": mime,
                                  "Content-Length": str(p.stat().st_size)},
                         timeout=3600)
    resp.raise_for_status()
