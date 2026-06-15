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
**Web application** in Google Cloud Console, enables the **Gmail API**,
registers the redirect URI shown in the tab
(`<app origin>/api/google/oauth/callback`), and saves the client id/secret.

```
GoogleTab "Connect"
   │ GET /google/auth/url?redirect_uri=…      (state stored in memory, CSRF)
   ▼
Google consent screen (popup; scopes: openid email gmail.readonly)
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
- `gmail.readonly` is a sensitive scope — Google blocks unverified apps with
  `403 access_denied` unless the authenticating account is listed under
  **Test users** in the OAuth consent screen (GCP Console → APIs & Services →
  OAuth consent screen → Test users). Each user must add their own address.
  There is no "Advanced → continue" bypass for this error.
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

`params`: `{camera_id, label_id, label_name?, organize_by_date?, output_folder?, date_from?, date_to?, max_errors?}`

- Lists all message ids in the label (Gmail `q: after:/before:` epoch filters),
  processes **oldest first** — so `resume_from` slicing stays consistent when new
  mail arrives mid-run.
- Per message: walks the MIME tree (`extract_attachments`) and saves parts that are
  `image/*`, `video/*`, **or** have a media file extension (cameras often send
  `application/octet-stream` named `*.jpg`). Both `attachmentId` and inline
  `body.data` parts are handled.
- **Immediate DB indexing**: after each download the file is inserted into the
  `files` table (via `upsert_file`) so it appears in the library without a manual
  scan. The timestamp used is the one parsed from the subject (see Reolink section
  below) or the email `internalDate`.
- **Automatic object detection from subject**: if the email subject matches the
  Reolink alarm pattern `{EventType} Detected from …`, the event type (e.g.
  `person`, `animal`, `vehicle`) is written to `object_detection` with
  `model = "reolink-alarm"` — the photo appears in the heatmap with AI icons
  exactly as if OpenVINO had detected the object. Log lines show `[person]`/
  `[animal]` etc. for matched emails.
- **`organize_by_date`** (bool, default false; UI defaults to true): when true,
  files are placed in `YYYY/MM/DD/` subfolders under the destination directory. The
  date is parsed from the email subject (`at YYYY/M/D H:MM:SS`, Reolink format);
  falls back to the email `internalDate` if the subject has no timestamp.
- Destination: `CAMERA_ROOT/camera.path/[output_folder/][YYYY/MM/DD/]<filename>`;
  file mtime is set to the email's `internalDate`.
- **Skip-if-exists by filename** → re-running only fetches new attachments.
- Network errors (`httpx.TransportError`/timeout) pause the task instead of
  failing — resume continues after the outage. Other per-message errors are
  logged and counted against `max_errors`.

### Reolink alarm email format

Reolink cameras send alarm emails with subject:
```
Person Detected from reolink-chicken-coop at 2026/6/15 19:31:46
```
Body contains `Alarm Camera Name`, `Alarm Event`, `Alarm Device Name`. Attachment
filename encodes the timestamp: `01_20260615193146049.jpg` (channel_YYYYMMDDHHMMSS[ms]).
The scanner recognises this filename pattern and indexes the correct timestamp.

Supported event types (all lowercase in DB): `person`, `animal`, `vehicle`,
`package`, `motion`, and any other word before `Detected` in the subject.

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
