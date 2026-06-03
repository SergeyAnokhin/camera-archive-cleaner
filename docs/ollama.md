# Ollama — Local Vision-LLM Analysis

A third AI provider alongside the cloud APIs (Gemini, Claude) and the OpenVINO
detector: a **self-hosted [Ollama](https://ollama.com) server** running a small
multimodal model (default `gemma3:4b`). It produces the same
`{ description, objects }` output as the cloud providers, but runs locally and
is **free** (`cost_usd = 0`).

Unlike OpenVINO — which is delegated to the compute-service — the main backend
calls **Ollama directly**. Ollama is just another HTTP API that happens to be
self-hosted, so it reuses the entire cloud-provider machinery (image loading,
JSON parsing, DB save). `shared/contract.py` and the compute-service are not
involved.

---

## Request flow

```
browser ──► main backend (:8000) ─────────────► Ollama (:11434)
   pick      1. DB: file_ids → file_paths        run gemma3:4b on ONE image
  "Ollama"   2. load + resize + base64 JPEG       return {description, objects}
   mode      3. loop image-by-image (POST /api/chat, format=json)
             4. assemble {scene:"", images:[...]}
             5. DB: save_ai_analysis(provider='ollama')
             ◄───────────────────────────────────┘
```

The `base_url` of the Ollama server is **sent from the frontend in every
request** (the same way the cloud providers send their `api_key`), so the
backend keeps no server-side Ollama config. The URL must be reachable **from the
backend process**, not the browser — the backend is what opens the connection.

| Environment | Base URL |
|---|---|
| Local dev | `http://localhost:11434` |
| k3s | `http://camera-cleaner-ollama:11434` (in-cluster Service DNS) |

---

## Why one image per request

`gemma3:4b` and other small models are unreliable at the cloud-provider pattern
of "here are N images, return a JSON array of N results" — they drift, drop
entries, or merge images. So [`ai_providers/ollama.py`](../backend/ai_providers/ollama.py)
loops **one image per `/api/chat` call** with `format: "json"` and a focused
single-image prompt asking for `{ "description": "...", "objects": [...] }`,
then assembles the per-image results into the shared
`{ scene: "", images: [...] }` structure and saves via `save_structured()`.

Trade-off: N sequential calls are slower than one batched call, but far more
reliable for a 4B model — and since it's local and free, latency is the only
cost.

---

## Backend

| File | Role |
|---|---|
| [`backend/ai_providers/ollama.py`](../backend/ai_providers/ollama.py) | `analyze_batch()` (per-image loop), `list_models()`, `pull_model()` |
| [`backend/ai_providers/common.py`](../backend/ai_providers/common.py) | `encode_jpeg()` (shared with Claude), `open_thumbnails()`, `parse_json_response()`, `save_structured()` |
| [`backend/routers/ai.py`](../backend/routers/ai.py) | `/ollama_analyze_batch`, `/ollama_models`, `/ollama_pull` |

No new Python dependency — `httpx` is already in `backend/requirements.txt`.

### Endpoints

| Method | Path | In | Out |
|---|---|---|---|
| `POST` | `/ollama_analyze_batch` | `{file_ids, prompt, model, base_url}` | `{parsed, elapsed_ms, images_used, saved_count, cost_usd:0, ...}` |
| `GET` | `/ollama_models?base_url=…` | — | `{models: [name, ...]}` (proxies Ollama `/api/tags`) |
| `POST` | `/ollama_pull` | `{base_url, name}` | `{status, model}` (proxies Ollama `/api/pull`) |

---

## Frontend

| File | Role |
|---|---|
| [`hour/AiModePanel.jsx`](../frontend/src/components/hour/AiModePanel.jsx) | `AI_PROVIDER_CONFIG.ollama` — model dropdown (`ollama_model`) |
| [`viewModes/ollamaMode.js`](../frontend/src/components/viewModes/ollamaMode.js) | `ollama_analysis` view mode (`isAiMode`, `aiProvider:'ollama'`) |
| [`OllamaAnalysisModal.jsx`](../frontend/src/components/OllamaAnalysisModal.jsx) | Run modal — editable per-image prompt, no token/cost stats |
| [`tools/OllamaAiTab.jsx`](../frontend/src/components/tools/OllamaAiTab.jsx) | Settings: Base URL, model, **Refresh list** + **Install model** |
| [`api.js`](../frontend/src/api.js) | `ollamaAnalyzeBatch`, `getOllamaModels`, `pullOllamaModel` |

### Model install & selection

`Tools → Ollama` lets the user:
- set the **Base URL**,
- click **Обновить список** to fetch installed models (`GET /ollama_models`),
- type a model name and **Установить** it (`POST /ollama_pull` → Ollama downloads it),
- pick the active model (free-text input backed by a `datalist` of installed models).

The model name flows into every analysis request, so switching models is just
changing the dropdown.

### localStorage keys

| Key | Default | Meaning |
|---|---|---|
| `ollama_base_url` | `http://localhost:11434` | Server address (reachable from backend) |
| `ollama_model` | `gemma3:4b` | Active model |
| `ollama_single_image_prompt` | `OLLAMA_SINGLE_IMAGE_TEMPLATE` | Per-image prompt (`prompts.js`) |

---

## Deployment (k3s)

Ollama runs as its **own** Deployment + Service + PVC, pinned to the same
powerful node as the compute-service (`role: compute`). Manifests:

| File | Role |
|---|---|
| [`templates/ollama-deployment.yaml`](../deploy/helm/camera-cleaner/templates/ollama-deployment.yaml) | `ollama/ollama` container, port 11434, node pinning, memory limit |
| [`templates/ollama-service.yaml`](../deploy/helm/camera-cleaner/templates/ollama-service.yaml) | ClusterIP `camera-cleaner-ollama:11434` |
| [`templates/ollama-pvc.yaml`](../deploy/helm/camera-cleaner/templates/ollama-pvc.yaml) | PVC mounted at `/root/.ollama` so pulled models survive restarts |

Config in [`values.yaml`](../deploy/helm/camera-cleaner/values.yaml) under
`ollama:` — `enabled`, `image`, `nodeSelector`/`tolerations`, `resources`,
`keepAlive`, `maxLoadedModels`, `storage.size`. All three manifests are gated on
`ollama.enabled`.

Models are **not** baked into the image — pull `gemma3:4b` once via the UI (or
`kubectl exec … ollama pull gemma3:4b`); it then persists on the PVC.

### ⚠️ Memory budget

The `role: compute` node carries the compute-service (torch + OpenVINO + YOLO,
~1–1.5 GB resident when a model is loaded). `gemma3:4b` (Q4) peaks at
~3.5–4.5 GB. With only ~5 GB headroom, running **YOLO and Gemma at the same
time can OOM**. Mitigations applied:

- `OLLAMA_KEEP_ALIVE=5m` — Gemma is unloaded after 5 min idle.
- `OLLAMA_MAX_LOADED_MODELS=1` — never hold two models at once.
- Memory `limits` on the Ollama container.
- Fallback to `gemma3:1b` if memory is too tight.

Verify under load with `kubectl top pod` while both providers run.

---

## Running locally

```powershell
# Ollama installed separately (https://ollama.com)
ollama pull gemma3:4b
# ollama serve usually runs as a background service on :11434
```

Then in the app: `Tools → Ollama` → Base URL `http://localhost:11434`, model
`gemma3:4b`. In HourViewer pick the **Ollama (локально)** view mode and click
**Анализ страницы**. Detected-object emoji appear on each photo card, exactly
like the other providers.
