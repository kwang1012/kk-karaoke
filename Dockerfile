# --- Stage 1: Build React frontend ---
FROM node:22-alpine AS frontend

# Leave empty to call the API on the same host/port that serves the page.
ARG APP_ADDR=
WORKDIR /app/frontend
COPY frontend/ ./
# package.json pins Yarn 4; enable it via Corepack (Yarn 1 can't read the lockfile).
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
RUN corepack enable && yarn install --immutable && VITE_API_ADDR=${APP_ADDR} yarn build


# --- Stage 2: Build FastAPI backend ---
FROM ghcr.io/astral-sh/uv:bookworm-slim

# Install system dependencies
RUN apt-get update && \
    apt-get install -y \
    ffmpeg \
    redis-server \
    build-essential \
    python3 \
    nginx \
    curl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=frontend /app/frontend/build /usr/share/nginx/html
COPY backend/ ./backend/

# Make sure uvicorn uses the venv Python
RUN cd backend && uv sync
RUN pwd

# Copy Nginx config and start script
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY run.sh /run.sh
RUN chmod +x /run.sh

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD curl -fsS http://localhost:8080/api/ || exit 1
CMD ["/run.sh"]
