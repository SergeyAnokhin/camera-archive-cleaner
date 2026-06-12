# Home Assistant Add-on

Third deployment target (besides local dev and k3s): the whole app packaged as a
single-container HA add-on, exposed through **HA ingress** (no host port). One
image holds the backend (uvicorn on 127.0.0.1:8000), the pre-built frontend, and
nginx on :8099 which serves the SPA and proxies `/api/` to uvicorn. The frontend
uses relative paths (`BASE='api'` in `api/http.js`, `base: './'` in Vite), so it
works under HA's ingress URL prefix without configuration.

## Request flow

```
HA UI (ingress, /api/hassio_ingress/<token>/…)
   │  only from 172.30.32.2 (nginx allow/deny)
   ▼
nginx :8099 ── /        → SPA static files (/usr/share/camera-cleaner/)
           └─ /api/…    → strip prefix → uvicorn 127.0.0.1:8000
```

## Runtime

[`run.sh`](../camera-cleaner-addon/run.sh) is the container ENTRYPOINT — it
**bypasses the s6-overlay** of the HA base image (s6 caused startup failures;
see commit 535fc96). It reads `/data/options.json` (`camera_root`,
`compute_remote_url`), exports `CAMERA_ROOT` and `DATA_DIR=/data`, seeds
`/data/compute_config.json` on first run, starts nginx in the background, and
`exec`s uvicorn as PID 1.

> The s6 scripts under `rootfs/etc/services.d/` and `rootfs/etc/cont-init.d/`
> are **not executed** — legacy from the s6 attempt. Only
> `rootfs/etc/nginx/nginx.conf` is used (COPY'd in the Dockerfile).

All state (SQLite DB, thumbnail caches, OAuth tokens, compute config) lives in
`/data` — HA's persistent add-on volume. Camera files come from `map: media:rw`
(default `camera_root: /media`).

## Files

| File | Role |
|---|---|
| [`repository.yaml`](../repository.yaml) | HA add-on repository manifest (repo root — required by the HA store) |
| [`config.yaml`](../camera-cleaner-addon/config.yaml) | Add-on manifest: version, arch (amd64/aarch64), `ingress_port: 8099`, `map: media:rw`, options + schema, prebuilt `image:` ref |
| [`build.yaml`](../camera-cleaner-addon/build.yaml) | Per-arch HA Debian base images |
| [`Dockerfile`](../camera-cleaner-addon/Dockerfile) | Multi-stage: Node builds the frontend → HA Debian base + Python venv + nginx. Build context = repo root |
| [`run.sh`](../camera-cleaner-addon/run.sh) | ENTRYPOINT — options → env vars, nginx + uvicorn (see above) |
| [`rootfs/etc/nginx/nginx.conf`](../camera-cleaner-addon/rootfs/etc/nginx/nginx.conf) | Ingress-only nginx: `allow 172.30.32.2; deny all`, SPA fallback, `/api/` proxy |
| [`DOCS.md`](../camera-cleaner-addon/DOCS.md) | User-facing docs shown in the HA store |
| [`.github/workflows/addon-build.yml`](../.github/workflows/addon-build.yml) | CI release (below) |

## Release

Push a tag `addon/v<X.Y.Z>` → CI builds amd64 + aarch64 images, pushes
`ghcr.io/sergeyanokhin/camera-cleaner-addon:<X.Y.Z>` (+ `latest`) as a
multi-arch manifest. The tag version must match `version:` in `config.yaml` —
HA pulls `image:<version>` and offers the update when the version bumps.
No compute-service in the add-on: heavy detection is `off` or `remote`
(`compute_remote_url` option).
