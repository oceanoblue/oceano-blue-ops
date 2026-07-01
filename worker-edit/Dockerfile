# Oceano Edit Engine — deterministic real-estate photo pipeline (Python/OpenCV).
FROM python:3.11-slim

# OpenCV (headless) still needs libglib at runtime.
RUN apt-get update \
  && apt-get install -y --no-install-recommends libglib2.0-0 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY server.py window_pull.py geometry.py masks.py sky.py .

ENV PORT=8080
# Single worker: image ops are CPU-heavy; concurrency is handled by Fly machines.
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8080"]
