# Camera Archive Cleaner

Browse, review, and clean up camera archive files stored on a network share.

## Features

- Heatmap view: Year → Month → Day → Hour drill-down
- Thumbnail grid with motion diff and image viewer
- Delete selected files with matching video preview auto-detection
- Cloud AI analysis (Google Gemini, Anthropic Claude) per image
- Local object detection via remote compute service (optional)
- Task queue for background scanning and batch analysis
- Full camera management via UI (no config file editing)
- Google OAuth integration: download snapshots from Gmail, upload to Google Drive
- Mobile-friendly responsive UI

## Setup

### 1. Mount your camera share

In Home Assistant: **Settings → System → Storage → Add network storage**

- Type: Samba / CIFS
- Share path: `\\192.168.x.x\Camera` (your NAS / NVR share)
- Usage: **media** (will appear under `/media/<name>`)

### 2. Configure the add-on

| Option | Description | Example |
|---|---|---|
| `camera_root` | Path to the mounted share directory | `/media/Camera` |
| `compute_remote_url` | URL of a running compute-service for object detection and video previews (optional) | `http://192.168.1.10:8001` |

### 3. Start and open

Click **Start**, then **Open Web UI**. On first launch two cameras are pre-configured:

- **Demo Camera** — bundled sample images, no setup needed. Click **Scan** to index them.
- **My Camera** — placeholder pointing to `Camera` under your `camera_root`. The UI shows setup instructions until you point it at a real folder in **Tools → Cameras**.

To configure a real camera: go to **Tools → Cameras**, set the path to the subfolder inside `camera_root` that contains your camera's files (e.g. `FrontDoor`), then click **Scan**.

## Google Integration — Gmail Download (optional)

Allows the add-on to download photo/video attachments from a Gmail label into a camera folder.
Each user creates their own private OAuth client — your Google password is never entered here.

### Step 1 — Create a Google Cloud project

1. Open [Google Cloud Console](https://console.cloud.google.com/) and sign in with the Gmail account whose mail you want to download.
2. At the top, open the project selector and click **New project**. Give it any name (e.g. *Camera Cleaner*) and click **Create**.

### Step 2 — Enable the Gmail API

1. Go to **APIs & Services → Library**.
2. Search for **Gmail API** and open it.
3. Click **Enable**.

### Step 3 — Configure the OAuth consent screen

1. Go to **APIs & Services → OAuth consent screen**.
2. Choose **External** and click **Create**.
3. Fill in the required fields:
   - **App name**: any name (e.g. *Camera Cleaner*)
   - **User support email**: your email
   - **Developer contact email**: your email
4. Click **Save and continue** through the Scopes and Optional info steps (no changes needed).
5. On the **Test users** page, click **+ Add users** and add your Gmail address (e.g. `you@gmail.com`). Click **Save and continue**.

> **Why "Test users"?** The Gmail scope requires this step for unverified apps.
> Without it Google shows "Access blocked: 403 access_denied" and the flow fails.

### Step 4 — Create OAuth credentials

1. Go to **APIs & Services → Credentials**.
2. Click **+ Create credentials → OAuth client ID**.
3. Application type: **Web application**. Name: anything.
4. Under **Authorized redirect URIs** click **+ Add URI**.
5. Open the add-on Web UI, go to **Tools → Google**, and copy the redirect URI shown there (use the copy button next to it). Paste it into Google Cloud Console.
6. Click **Create**. A dialog shows your **Client ID** and **Client secret** — copy both.

### Step 5 — Connect the account

1. In the add-on: **Tools → Google → OAuth client** — paste the Client ID and Client secret, click **Save credentials**.
2. Click **Connect Google account**. A Google consent screen opens in a new tab.
3. Select your account → click **Continue** (you may see an "unverified app" warning — click **Advanced → Go to [app name]** to proceed).
4. Grant the requested Gmail read permission.
5. The tab closes and the add-on shows **Connected: you@gmail.com**.

**If the redirect fails with 401 (Home Assistant ingress):** After granting permission Google redirects the browser back to the add-on, but HA ingress may reject it as 401 because the redirect happens in a fresh popup without an HA session. When this happens:
- Copy the full URL from the popup's address bar (it still contains `?code=…&state=…`)
- Paste it into the **"If the redirect failed…"** field that appears below the Connect button
- Click **Complete** — the add-on will extract the code and finish connecting

### Step 6 — Download attachments

1. Go to **Tasks** and click **New task**.
2. Choose **Gmail Download**.
3. Select the Gmail **label** that contains the camera emails, choose the target camera folder, and optionally set a date range.
4. Click **Create** — the task runs in the background and saves attachments incrementally (already-downloaded files are skipped on re-run).

The OAuth token is stored in `/data/google_oauth.json` and persists across add-on restarts and updates.

## Compute Service (optional)

Enables **local object detection** (person, car, animal, etc.) and **video preview generation** — without sending images to a cloud API.

The compute service runs separately on any machine with spare CPU (a Linux server, NAS, or Windows PC). Point the add-on to it via `compute_remote_url`.

### Docker — Linux or Windows with Docker Desktop

The pre-built image has YOLO models baked in (no download at startup):

```bash
docker run -d \
  --name camera-compute \
  --restart unless-stopped \
  -p 8001:8001 \
  -e CAMERA_ROOT=/camera \
  -v /mnt/Camera:/camera:ro \
  ghcr.io/sergeyanokhin/camera-compute:latest
```

Replace `/mnt/Camera` with the path where the camera share is mounted on that machine.

**Windows with Docker Desktop** — use forward-slash UNC paths for the volume:
```
-v //192.168.1.99/Camera:/camera:ro
```

### Without Docker — Windows (Python 3.11+)

```powershell
# Run in compute-service/ folder from the project repo
pip install -r requirements.txt
$env:CAMERA_ROOT = "\\192.168.1.99\Camera"
uvicorn app:app --host 0.0.0.0 --port 8001
```

### Without Docker — Linux (Python 3.11+)

```bash
pip install -r requirements.txt
export CAMERA_ROOT=/mnt/Camera
uvicorn app:app --host 0.0.0.0 --port 8001
```

### Connect to the add-on

1. Set `compute_remote_url` to `http://<machine-ip>:8001` in add-on options and restart.
2. Open **Tools → Compute** and switch to **Remote**.
3. Use **Test connection** to confirm the add-on can reach the service.

---

## Notes

- **Database and caches** persist across add-on updates in `/data`.
- **AI analysis** (Gemini / Claude) — enter your API key in **Tools → AI**. Keys are never stored server-side.
- The add-on binds exclusively to the HA ingress gateway; it is not exposed on a host port.
