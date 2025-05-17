# --- Stage 1: Build React frontend ---
FROM node:22-alpine AS frontend

WORKDIR /app/frontend
COPY frontend/ ./
RUN yarn install && yarn build


# --- Stage 2: Build FastAPI backend ---
FROM debian:stable-slim

# Install system dependencies
RUN apt-get update && \
    apt-get install -y \
    ffmpeg \
    redis-server \
    python3 \
    python3-pip \
    python3-venv \
    nginx \
    curl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=frontend /app/frontend/build /usr/share/nginx/html
COPY backend/ ./backend/

# Install Python deps
RUN python3 -m venv /venv

ENV PATH="/venv/bin:$PATH"
COPY backend/requirements.txt .
# Make sure uvicorn uses the venv Python
RUN pip install --no-cache-dir -r requirements.txt

# Copy Nginx config and start script
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY run.sh /run.sh
RUN chmod +x /run.sh

EXPOSE 8080

CMD ["/run.sh"]
