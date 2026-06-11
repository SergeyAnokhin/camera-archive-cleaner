# Build context must be the repo root:
#   docker build -f camera-cleaner-addon/Dockerfile -t camera-cleaner-addon .
# (same pattern as backend/Dockerfile)

ARG BUILD_FROM=ghcr.io/home-assistant/amd64-base-debian:bookworm

# ── Stage 1: build frontend ────────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci --prefer-offline
COPY frontend/ ./
RUN npm run build

# ── Stage 2: final image ───────────────────────────────────────────────────
FROM $BUILD_FROM

# System deps: Python 3, pip, nginx + opencv runtime libs
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      python3 python3-pip python3-venv \
      nginx \
      libglib2.0-0 libgomp1 \
 && rm -rf /var/lib/apt/lists/*

# Python venv (avoid polluting system Python)
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install backend Python dependencies
COPY backend/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

# Copy application code (same layout as backend/Dockerfile)
WORKDIR /app
COPY shared/ shared/
COPY backend/ backend/

# Copy built frontend to nginx web root
COPY --from=frontend-builder /frontend/dist/ /usr/share/camera-cleaner/

# Copy rootfs (s6 services, nginx config, init scripts)
COPY camera-cleaner-addon/rootfs/ /

RUN chmod a+x \
      /etc/cont-init.d/01-setup.sh \
      /etc/services.d/backend/run \
      /etc/services.d/nginx/run

EXPOSE 8099
