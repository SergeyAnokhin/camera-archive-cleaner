# Build from repo root:
#   docker build -f camera-cleaner-addon/Dockerfile .
# In CI, BUILD_FROM is overridden per arch via --build-arg.
# Default (debian:bookworm-slim) is used for local test builds only.
ARG BUILD_FROM=debian:bookworm-slim

# ── Stage 1: build frontend ────────────────────────────────────────────────
FROM node:24-alpine AS frontend-builder
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci --prefer-offline
COPY frontend/ ./
RUN npm run build

# ── Stage 2: final image ───────────────────────────────────────────────────
FROM $BUILD_FROM

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      python3 python3-pip python3-venv \
      nginx \
      libglib2.0-0 libgomp1 \
 && rm -rf /var/lib/apt/lists/*

RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY backend/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

WORKDIR /app
COPY shared/ shared/
COPY backend/ backend/

COPY --from=frontend-builder /frontend/dist/ /usr/share/camera-cleaner/
COPY camera-cleaner-addon/rootfs/etc/nginx/nginx.conf /etc/nginx/nginx.conf
COPY camera-cleaner-addon/run.sh /run.sh
RUN chmod +x /run.sh

EXPOSE 8099
ENTRYPOINT ["/run.sh"]
