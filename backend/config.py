"""Application configuration constants."""

import os
from dotenv import load_dotenv

load_dotenv()

# Redis
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))

# Spotify
DEFAULT_PLAYLIST_ID = os.getenv("DEFAULT_PLAYLIST_ID", "3AEkt2VeAAHFc1TC5FLuIl")

# CORS: comma-separated origins, or "*" (default) to allow any
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()]

# Jam state
JAM_STATE_SYNC_INTERVAL = float(os.getenv("JAM_STATE_SYNC_INTERVAL", "1.0"))

# Cloudflare R2: durable store for processed data (lyrics, vocal/instrumental stems, MIDI).
# Leave unset to keep everything on local disk only. The endpoint is
# https://<account id>.r2.cloudflarestorage.com.
R2_ENDPOINT_URL = os.getenv("R2_ENDPOINT_URL", "")
R2_ACCESS_KEY_ID = os.getenv("R2_ACCESS_KEY_ID", "")
R2_SECRET_ACCESS_KEY = os.getenv("R2_SECRET_ACCESS_KEY", "")
R2_BUCKET = os.getenv("R2_BUCKET", "")
R2_SYNC_WORKERS = int(os.getenv("R2_SYNC_WORKERS", "8"))
