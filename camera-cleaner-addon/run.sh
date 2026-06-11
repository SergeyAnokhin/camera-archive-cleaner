#!/bin/bash
set -e

# Read HA Supervisor options from /data/options.json
if [ -f /data/options.json ]; then
    CAMERA_ROOT=$(python3 -c "
import json, sys
try:
    print(json.load(open('/data/options.json')).get('camera_root', '/media'))
except Exception as e:
    print('/media', file=sys.stderr)
    print('/media')
" 2>/dev/null || echo "/media")
    COMPUTE_URL=$(python3 -c "
import json, sys
try:
    print(json.load(open('/data/options.json')).get('compute_remote_url', ''))
except:
    print('')
" 2>/dev/null || echo "")
else
    # Fallback: allow env vars for testing outside HA
    CAMERA_ROOT="${CAMERA_ROOT:-/media}"
    COMPUTE_URL="${COMPUTE_URL:-}"
fi

export CAMERA_ROOT
export DATA_DIR=/data
mkdir -p /data

echo "Starting Camera Snapshots Cleaner: CAMERA_ROOT=${CAMERA_ROOT}"

# Seed compute_config.json from options on first run
if [ -n "$COMPUTE_URL" ] && [ ! -f /data/compute_config.json ]; then
    echo "Seeding compute config: remote at ${COMPUTE_URL}"
    echo '{"mode":"remote","remote_url":"'"$COMPUTE_URL"'","remote_urls":["'"$COMPUTE_URL"'"]}' \
        > /data/compute_config.json
fi

# Start nginx in background (killed when container exits)
nginx -g 'daemon off;' &

# Start uvicorn as PID 1 (receives SIGTERM from HA Supervisor for graceful shutdown)
cd /app/backend
exec /opt/venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000 --log-level warning
