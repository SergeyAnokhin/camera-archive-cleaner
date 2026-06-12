# Camera Snapshots Cleaner

Browse, review, and clean up camera snapshot archives stored on a network share.

## Features

- Heatmap view: Year → Month → Day → Hour drill-down
- Thumbnail grid with motion diff and image viewer
- Delete selected snapshots with matching video preview auto-detection
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

## Notes

- **Database and caches** persist across add-on updates in `/data`.
- **Object detection / video preview** requires a separately running compute-service (see project repo). Set `compute_remote_url` in options and select Remote mode in **Tools → Compute**.
- **AI analysis** (Gemini / Claude) — enter your API key in **Tools → AI**. Keys are never stored server-side.
- The add-on binds exclusively to the HA ingress gateway; it is not exposed on a host port.
