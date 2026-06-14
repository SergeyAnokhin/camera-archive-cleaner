#!/bin/bash
set -e

# CAMERA_ROOT and compute settings are configured inside the app (Tools → Cameras / Compute).
# They are persisted to /data/server_config.json and applied on startup.
# This script only sets DATA_DIR so the backend knows where persistent storage lives.

export DATA_DIR=/data
mkdir -p /data

echo "Starting Camera Archive Cleaner: DATA_DIR=${DATA_DIR}"

# Start nginx in background (killed when container exits)
nginx -g 'daemon off;' &

# Start uvicorn as PID 1 (receives SIGTERM from HA Supervisor for graceful shutdown)
cd /app/backend
exec /opt/venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000 --log-level warning
