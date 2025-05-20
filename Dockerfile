# --- Stage 1: Build React frontend ---
FROM node:22-alpine AS frontend

ARG APP_ADDR=localhost:8080
WORKDIR /app/frontend
COPY frontend/ ./
RUN yarn install && VITE_API_ADDR=${APP_ADDR} yarn build


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
CMD ["/run.sh"]
