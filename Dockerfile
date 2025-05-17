# --- Stage 1: Build React frontend ---
FROM node:22-alpine AS frontend

WORKDIR /app/frontend
COPY frontend/ ./
RUN yarn install && VITE_API_ADDR=kwang1012-kkaraoke.hf.space yarn build


# --- Stage 2: Build FastAPI backend ---
FROM debian:stable-slim

# Install system dependencies
RUN apt-get update && \
    apt-get install -y \
    redis-server \
    python3 \
    python3-pip \
    python3-venv \
    curl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY backend/ ./backend/
COPY --from=frontend /app/frontend/build/ ./frontend/build/

# Install Python deps
RUN python3 -m venv /venv

ENV PATH="/venv/bin:$PATH"
# Install Python dependencies
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY run.sh /run.sh
RUN chmod +x /run.sh

EXPOSE 7860

CMD ["/run.sh"]
