# Deployment (k3s + ArgoCD + Helm)

GitOps deployment of all three components ([main backend](compute-service.md),
[compute-service](compute-service.md), frontend) onto an existing **k3s** cluster
through an existing **ArgoCD**, packaged as a **Helm** chart. Flow: `git push` to
`main` → GitHub Actions builds three images and pushes them to GHCR, then rewrites
the image tags in the chart's `values.yaml`; ArgoCD watches the repo and rolls the
pods. The compute-service is pinned to a powerful node; backend/frontend run anywhere.

The application code is **not** modified for the cluster — only infrastructure files
were added. Local `npm start` dev flow is unchanged.

---

## Design intent (why this shape)

The owner runs **two physical machines** — one powerful, one modest — joined as nodes
of a **single k3s cluster**. The goal: heavy image work (YOLO/OpenVINO detection, video
decoding) runs on the powerful node, while everything else runs anywhere. It should be
a true GitOps loop: push code, and the running pods update themselves with no manual
`kubectl`.

A tempting but **wrong** way to get there is to deploy two *identical full backends* and
call one "main" and one "heavy". It fails because the main backend is **stateful** — it
owns the SQLite DB and every disk cache. Two full copies means two databases: detection
results and AI analysis would be written on whichever machine ran the job, and the two
DBs drift apart (split-brain). The whole point of the existing split (see
[`compute-service.md`](compute-service.md)) is that **only the stateless
compute-service is relocatable** — it takes a file path, returns results, and owns no
state. All state stays in one place (the backend), so there is nothing to synchronise.

This deployment simply realises that split on the cluster:

| Intent | Mechanism |
|---|---|
| Heavy work on the powerful machine | compute-service Deployment pinned with `nodeSelector: role=compute` |
| One source of truth for state | single backend with a state PVC; compute stays stateless |
| Both machines see the camera files | one SMB share mounted (CSI) into both pods at the same path |
| Push code → pods update | CI builds images → rewrites image tags in `values.yaml` → ArgoCD auto-syncs |

The backend reaches the compute-service over the in-cluster Service DNS
(`http://camera-cleaner-compute:8001`) instead of `localhost`, exactly as the existing
`remote` routing mode was built for — the cluster is just a second, automated way to run
the same off/local/remote design.

---

## Three images

| Image | Dockerfile | Context | Notes |
|---|---|---|---|
| backend | [`backend/Dockerfile`](../backend/Dockerfile) | repo root (needs `shared/`) | light deps; serves :8000 |
| compute | [`compute-service/Dockerfile`](../compute-service/Dockerfile) | repo root (needs `shared/`) | CPU-only torch + ultralytics; pre-bakes `yolov8n.pt`; serves :8001 |
| frontend | [`frontend/Dockerfile`](../frontend/Dockerfile) | repo root | Vite build → nginx static ([`frontend/nginx.conf`](../frontend/nginx.conf)) |

Both Python images import `shared/`, so they build from the **repo root** with
`-f <component>/Dockerfile`. [`.dockerignore`](../.dockerignore) keeps `node_modules`,
caches, the DB and `*.pt` out of the build context.

---

## Helm chart — `deploy/helm/camera-cleaner`

| Template | Renders |
|---|---|
| `backend-deployment.yaml` | backend Deployment (`Recreate`); initContainer seeds `compute_config.json`; state via subPath mounts |
| `backend-service.yaml` / `backend-pvc.yaml` | backend Service :8000; state PVC (RWO) |
| `compute-deployment.yaml` / `compute-service.yaml` | compute Deployment (`nodeSelector role=compute`); Service :8001 |
| `frontend-deployment.yaml` / `frontend-service.yaml` | nginx Deployment; Service :80 |
| `cameras-configmap.yaml` | `cameras.yaml` with **Linux** paths under the SMB mount |
| `smb-camera.yaml` | SMB CSI PV + PVC (RWX) + optional credentials Secret |
| `ingress.yaml` | Traefik Ingress (`/api`→backend, `/`→frontend) + StripPrefix Middleware |

### State on a PVC without shadowing code
The backend writes `snapshots.db`, `compute_config.json` and seven `*_cache/`
directories into `/app/backend` (next to the code). The chart mounts a single state
PVC into each of those paths via **`subPath`**, so persistence does not overwrite the
image's code. The cache directory list lives in `values.yaml` (`backend.cacheDirs`).

### compute_config.json seed
The on-disk default is `mode=local` (→ `localhost:8001`), wrong when backend and
compute are separate pods. An initContainer writes
`{"mode":"remote","remote_url":"http://camera-cleaner-compute:8001"}` to the state PVC
**if absent**, so the backend reaches the compute Service and later UI edits
(Tools → Compute) still persist. See [`backend/compute_config.py`](../backend/compute_config.py).

### Camera files (SMB)
Both pods mount the same NAS share via the SMB CSI driver at the **same** path
(`camera.smb.mountPath`, default `/camera`), so `COMPUTE_PATH_REMAP_*` stays empty
(identity). `cameras.yaml` paths must match that mount. The backend mounts it
read-write (it deletes files via `/delete`); compute mounts it read-only.

### Ingress / `/api` stripping
The frontend calls relative `/api/...` ([`frontend/src/api.js`](../frontend/src/api.js)),
but the backend serves routes at the root — matching the dev Vite proxy
([`frontend/vite.config.js`](../frontend/vite.config.js)). A Traefik **StripPrefix**
middleware removes `/api` before forwarding to the backend Service.

AI keys are **not** stored in the cluster — the frontend sends `api_key` in each
request body ([`backend/routers/ai.py`](../backend/routers/ai.py)).

---

## CI/CD

[`.github/workflows/build.yml`](../.github/workflows/build.yml) (push to `main`):
builds + pushes the three images to `ghcr.io/<owner>/<repo>/{backend,compute,frontend}`
tagged with the short git SHA, then `yq`-rewrites `image.*.tag` in `values.yaml` and
commits back (`[skip ci]`; the bump path is outside the workflow's trigger paths, so it
does not re-trigger). ArgoCD ([`deploy/argocd/application.yaml`](../deploy/argocd/application.yaml))
auto-syncs the change.

---

## Step-by-step deployment runbook

End-to-end, in order, from an existing cluster to a working UI. **Assumes already in
place:** a k3s cluster with two nodes and `kubectl` access, ArgoCD installed in the
`argocd` namespace, the Traefik ingress controller (ships with k3s), this GitHub
repository, and a reachable SMB/NAS share holding the camera files.

### Step 0 — Check the baseline
```bash
kubectl get nodes -o wide                      # both nodes Ready; note the powerful one's name
kubectl -n kube-system get pods | grep traefik # Traefik running (k3s default ingress)
kubectl -n argocd get pods                     # ArgoCD running
```

### Step 1 — Get the three images into GHCR
The pods pull `ghcr.io/<owner>/<repo>/{backend,compute,frontend}`. Populate the registry
once by triggering CI: push any change to `main` (or use the GitHub Actions “Run workflow”
button). [`build.yml`](../.github/workflows/build.yml) builds all three, pushes them by git
SHA, and writes those tags into `values.yaml`.
```bash
git commit --allow-empty -m "ci: first image build" && git push origin main
# Watch the run in the GitHub Actions tab until all three images are pushed.
```
Then make the GHCR packages **public** (GitHub → repo → Packages → each package →
Package settings → Change visibility), *or* keep them private and create a pull secret in
Step 4. Confirm CI bumped the tags:
```bash
grep -A1 'backend:\|compute:\|frontend:' deploy/helm/camera-cleaner/values.yaml
git pull   # fetch the CI tag-bump commit locally
```

### Step 2 — Install the SMB CSI driver (camera share access)
Lets pods mount the NAS share. Install once per cluster.
```bash
helm repo add csi-driver-smb https://raw.githubusercontent.com/kubernetes-csi/csi-driver-smb/master/charts
helm install csi-driver-smb csi-driver-smb/csi-driver-smb -n kube-system
kubectl -n kube-system get pods | grep csi-smb   # csi-smb-node pods Running on every node
```

### Step 3 — Label the powerful node
Pins the compute-service (heavy YOLO/video work) to that machine.
```bash
kubectl label node <powerful-node> role=compute
```

### Step 4 — Namespace + secrets
```bash
kubectl create namespace camera-cleaner

# NAS credentials (used by the SMB PV). Keys MUST be username/password.
kubectl create secret generic smb-creds -n camera-cleaner \
  --from-literal=username=<nas-user> --from-literal=password=<nas-pass>

# Only if the GHCR packages stayed private:
kubectl create secret docker-registry ghcr-creds -n camera-cleaner \
  --docker-server=ghcr.io --docker-username=<gh-user> --docker-password=<gh-PAT>
#   …then set imagePullSecrets: [{name: ghcr-creds}] in values.yaml (Step 5).
```

### Step 5 — Point `values.yaml` at your environment, then push
Edit [`deploy/helm/camera-cleaner/values.yaml`](../deploy/helm/camera-cleaner/values.yaml)
and commit — ArgoCD deploys from git, so changes must be pushed, not applied locally.

| Key | Set to |
|---|---|
| `image.registry` | `ghcr.io/<your-owner>/<your-repo>` (lowercase) |
| `camera.smb.source` | your share, e.g. `//192.168.1.91/Camera` |
| `camera.smb.mountPath` | mount point inside both pods (default `/camera`) |
| `camerasConfig` | one entry per camera, **Linux** paths under `mountPath` (e.g. `/camera/Foscam/.../snap`) — these are what the DB stores |
| `ingress.host` | the hostname you will open in the browser |
| `imagePullSecrets` | `[{name: ghcr-creds}]` only if images are private |

```bash
git add deploy/helm/camera-cleaner/values.yaml && git commit -m "config: cluster values" && git push
```
> The `camerasConfig` paths and the SMB `mountPath` must agree: the backend stores paths
> as written here, and the compute-service reads the *same* paths off the *same* mount —
> that is why `compute.pathRemap` stays empty.

### Step 6 — Register the app with ArgoCD
```bash
kubectl apply -f deploy/argocd/application.yaml      # creates the namespace-scoped Application
kubectl -n argocd get application camera-cleaner     # wait for SYNCED / HEALTHY
```
ArgoCD now renders the chart and creates: SMB PV/PVC, state PVC, cameras ConfigMap, the
three Deployments + Services, and the Ingress + StripPrefix middleware.

### Step 7 — DNS / hosts
Resolve `ingress.host` to any node IP (Traefik listens cluster-wide). For a quick local
test add a hosts entry, e.g. `192.168.1.x  camera.local`, then open `http://camera.local`.

### Step 8 — First run in the UI
1. Open the host → the frontend loads (served by nginx, calls relative `/api`).
2. **Scan** (top bar) → the backend walks the SMB share and fills the DB; the heatmap populates.
3. **Tools → Compute** → should show the remote compute-service **Healthy**.
4. Switch a view to **OpenVINO Detection** → a bounding-box image confirms backend ↔ compute ↔ SMB all work.

---

## How the parts connect (runtime)

```
browser ──http──► Traefik Ingress (host: ingress.host)
                    ├── /     ─────────────► frontend Service :80  (nginx static SPA)
                    └── /api  ─(stripPrefix)► backend Service :8000
                                                  │  reads/writes state PVC (DB + caches)
                                                  │  reads/deletes files on SMB PVC
                                                  └─http──► compute Service :8001  (role=compute node)
                                                                 reads files on the SAME SMB PVC (read-only)
```

| Link | Wired by |
|---|---|
| browser → frontend / backend | Ingress host + two paths; `/api` stripped by Traefik middleware |
| frontend → backend | relative `/api` in [`api.js`](../frontend/src/api.js) → same origin via Ingress |
| backend → compute | seeded `compute_config.json` = `remote http://camera-cleaner-compute:8001` |
| backend/compute → camera files | one SMB PVC mounted at the same `mountPath` in both pods |
| compute → powerful node | `nodeSelector: role=compute` |
| git push → running pods | CI builds + bumps tags → ArgoCD auto-syncs |

---

## Verify & troubleshoot
```bash
kubectl -n camera-cleaner get pods -o wide        # all Running; compute on the role=compute node
kubectl -n camera-cleaner get pvc,ingress
kubectl -n camera-cleaner logs deploy/camera-cleaner-backend
# Check the SMB mount from inside the backend pod:
kubectl -n camera-cleaner exec deploy/camera-cleaner-backend -- ls /camera
```

| Symptom | Likely cause |
|---|---|
| Pod `ImagePullBackOff` | GHCR package private and no `imagePullSecrets`, or wrong `image.registry` |
| Pod stuck `ContainerCreating`, PVC unbound | SMB CSI driver missing, bad `smb-creds`, or wrong `camera.smb.source` |
| compute pod won't schedule (`Pending`) | no node labelled `role=compute` |
| Heatmap empty after scan | `camerasConfig` paths don't match the SMB mount contents |
| Tools → Compute shows unavailable | compute pod not Ready, or seeded `remote_url` doesn't match the compute Service name |
| `/api` calls 404 | StripPrefix middleware not applied (`ingress.stripApiPrefix: true`) |

Render the manifests locally without a cluster:
```bash
helm template camera-cleaner deploy/helm/camera-cleaner -n camera-cleaner
```
