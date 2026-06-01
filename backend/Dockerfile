# Main backend — FastAPI :8000. Light deps. Build context = repo root (needs shared/).
#   docker build -f backend/Dockerfile -t backend .
FROM python:3.12-slim

# opencv-python-headless still needs these shared libs at runtime.
RUN apt-get update \
 && apt-get install -y --no-install-recommends libglib2.0-0 libgomp1 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY shared/ shared/
COPY backend/ backend/

WORKDIR /app/backend
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
