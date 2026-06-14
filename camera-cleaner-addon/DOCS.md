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

Click **Start**, then **Open Web UI**. On first launch the camera list is empty — go to **Tools → Cameras** to add your cameras (ID, display name, path relative to `camera_root`).

To pre-seed cameras, place a `cameras.yaml` in the `/data` directory of the add-on (accessible via Samba add-on or File Editor) before the first start:

```yaml
cameras:
  - id: foscam_front
    name: Front Door
    path: Foscam/FI9805W_C4D6553DECE1
```

## Google Integration (optional)

To enable Gmail download or Google Drive upload tasks:

1. Go to **Tools → Google** and click **Connect Google Account**.
2. Complete the OAuth flow in the browser (you will be redirected back to the add-on).
3. Once authorized, create tasks of type **Gmail Download** or **Google Drive Upload** in the Tasks screen.

The OAuth token is stored in `/data/google_oauth.json` and persists across restarts.

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
