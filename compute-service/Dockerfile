# Compute-service — FastAPI :8001. Heavy deps (torch/ultralytics/openvino).
# Build context = repo root (needs shared/).
#   docker build -f compute-service/Dockerfile -t compute .
FROM python:3.12-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 libgomp1 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install CPU-only torch first so ultralytics doesn't pull the multi-GB CUDA build.
RUN pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu

COPY compute-service/requirements.txt compute-service/requirements.txt
RUN pip install --no-cache-dir -r compute-service/requirements.txt

COPY shared/ shared/
COPY compute-service/ compute-service/

WORKDIR /app/compute-service
# Pre-download the default model so the pod doesn't fetch it at runtime.
# detection.py loads "{model}.pt" from the working dir when no OpenVINO export exists.
RUN python -c "from ultralytics import YOLO; YOLO('yolov8n.pt')"

EXPOSE 8001
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8001"]
