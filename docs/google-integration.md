# Google Integration (Gmail Download & Drive Upload)

Connects a Google account via OAuth 2.0 and adds two task types to the queue:
**`gmail_download`** saves photo/video attachments from a chosen Gmail label into a
camera folder, and **`gdrive_upload`** uploads a camera's photos/videos (by date
range) into a Google Drive folder. Both are idempotent — re-running a task skips
everything already downloaded/uploaded, so new emails and new snapshots are picked
up incrementally, and pause/restart resume safely.

---

## Files

| File | Role |
|---|---|
| [`backend/google_oauth.py`](../backend/google_oauth.py) | OAuth client credentials + tokens, consent URL, code exchange, access-token refresh. Store: `DATA_DIR/google_oauth.json` |
| [`backend/google_api.py`](../backend/google_api.py) | Sync REST client for Gmail + Drive (httpx). Pure helpers `extract_attachments()`, `split_drive_path()` are unit-tested |
| [`backend/routers/google.py`](../backend/routers/google.py) | `/google/*` endpoints (auth status/credentials/url, OAuth callback, labels) |
| [`backend/task_executors/gmail_download.py`](../backend/task_executors/gmail_download.py) | `gmail_download` executor |
| [`backend/task_executors/gdrive_upload.py`](../backend/task_executors/gdrive_upload.py) | `gdrive_upload` executor |
| [`frontend/src/api/google.js`](../frontend/src/api/google.js) | API client + `googleRedirectUri()` |
| [`frontend/src/components/tools/GoogleTab.jsx`](../frontend/src/components/tools/GoogleTab.jsx) | Tools → Google: OAuth client setup + connect/disconnect |
| [`frontend/src/components/newTask/GmailDownloadPanel.jsx`](../frontend/src/components/newTask/GmailDownloadPanel.jsx) | New-task params: label, subfolder, email date filter |
| [`frontend/src/components/newTask/GDriveUploadPanel.jsx`](../frontend/src/components/newTask/GDriveUploadPanel.jsx) | New-task params: file type, Drive folder, date range |
| [`backend/tests/test_google_api.py`](../backend/tests/test_google_api.py) | Pins attachment extraction + Drive path rules |

---

## OAuth flow

One-time setup (Tools → Google): the user creates an OAuth client of type
**Web application** in Google Cloud Console, enables the **Gmail API** and
**Drive API**, registers the redirect URI shown in the tab
(`<app origin>/api/google/oauth/callback`), and saves the client id/secret.

```
GoogleTab "Connect"
   │ GET /google/auth/url?redirect_uri=…      (state stored in memory, CSRF)
   ▼
Google consent screen (popup; scopes: openid email gmail.readonly drive)
   │ redirect with ?code&state
   ▼
GET /google/oauth/callback  ──►  exchange code → refresh+access token
   │                              saved to DATA_DIR/google_oauth.json
   ▼
GoogleTab polls /google/auth/status every 2 s until connected=true
```

- `access_type=offline&prompt=consent` forces a refresh token on every connect.
- **Tokens are stored server-side** (unlike AI API keys) — background tasks must
  refresh access tokens without a browser. `get_access_token()` refreshes when
  < 60 s of validity remain; `invalid_grant` (revoked) auto-disconnects.
- Scope `drive` (full) instead of `drive.file` so the user can target any
  existing Drive folder, not only app-created ones. With a personal unverified
  OAuth client Google shows an "unverified app" warning — Advanced → continue.
- Changing the client id drops the stored tokens (they belong to the old client).

## Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/google/auth/status` | `{client_id_set, connected, email}` |
| `PUT` | `/google/auth/credentials` | `{client_id, client_secret}` — save OAuth client |
| `GET` | `/google/auth/url?redirect_uri=` | Build consent URL |
| `GET` | `/google/oauth/callback?code&state` | OAuth redirect target, returns a small HTML page |
| `POST` | `/google/auth/disconnect` | Drop tokens (client credentials kept) |
| `GET` | `/google/gmail/labels` | `{labels: [{id, name}]}` for the task form |

## Task: `gmail_download`

`params`: `{camera_id, label_id, label_name?, output_folder?, date_from?, date_to?, max_errors?}`

- Lists all message ids in the label (Gmail `q: after:/before:` epoch filters),
  processes **oldest first** — so `resume_from` slicing stays consistent when new
  mail arrives mid-run.
- Per message: walks the MIME tree (`extract_attachments`) and saves parts that are
  `image/*`, `video/*`, **or** have a media file extension (cameras often send
  `application/octet-stream` named `*.jpg`). Both `attachmentId` and inline
  `body.data` parts are handled.
- Destination: `CAMERA_ROOT/camera.path/[output_folder/]<original filename>`;
  file mtime is set to the email's `internalDate` (scanner mtime fallback works).
- **Skip-if-exists by filename** → re-running only fetches new attachments.
- Network errors (`httpx.TransportError`/timeout) pause the task instead of
  failing — resume continues after the outage. Other per-message errors are
  logged and counted against `max_errors`.

## Task: `gdrive_upload`

`params`: `{camera_id, file_type: photo|video|both, drive_folder, date_from?, date_to?, max_errors?}`

- File list comes from the `files` table (camera + type + timestamp range,
  ordered by timestamp) — files must be indexed (scanned) to upload.
- `drive_folder` is a path under My Drive (`A/B/C`); missing levels are created
  (`drive_find_or_create_folder`).
- The folder's existing file names are listed **once** at start
  (`drive_list_filenames`) and every present name is skipped → incremental
  re-runs upload only new files. Uploads use the resumable-session protocol
  (metadata POST → single PUT of the body, streamed from disk).
- Pause/restart/network-outage semantics identical to `gmail_download`.

Both task types appear in NewTaskModal only with full params when the account is
connected (the modal shows a "not connected" warning linking to Tools → Google)
and support the standard log viewer (TaskCard console button).
