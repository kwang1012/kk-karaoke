# Backend image shared by the `api` and `worker` services.
# On x86-64 Linux the torch wheels bundle the CUDA libraries, so the same image runs
# on a GPU when the container is started with GPU access (see docker-compose.gpu.yml).
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg build-essential curl && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first so code changes don't invalidate this (large) layer.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY . .

ENV PATH="/app/.venv/bin:$PATH" \
    STORAGE_DIR=/app/storage \
    PYTHONUNBUFFERED=1

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
