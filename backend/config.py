"""Application configuration constants."""

import os
from dotenv import load_dotenv

load_dotenv()

# All API/worker instances use the same Cloudflare D1 catalog. Never fall back to a local DB.
CLOUDFLARE_ACCOUNT_ID = os.getenv("CLOUDFLARE_ACCOUNT_ID", "")
CLOUDFLARE_API_TOKEN = os.getenv("CLOUDFLARE_API_TOKEN", "")
D1_DATABASE_ID = os.getenv("D1_DATABASE_ID", "")
# Durable outgoing uploads, separate from the disposable storage cache.
DATA_DIR = os.getenv("DATA_DIR", "data")

# Redis
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))

# The address other devices (a phone scanning the QR code) should use to reach this machine.
# Normally found automatically; set it when that guess is wrong, e.g. inside Docker.
SHARE_HOST = os.getenv("SHARE_HOST", "").strip()

# CORS: comma-separated origins, or "*" (default) to allow any
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()]

# Whisper model for songs no lyric provider has (faster-whisper name: tiny, base, small, medium, turbo...).
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "small")

# Modal: run vocal separation on a cloud GPU instead of this machine. Deploy backend/modal_app.py
# first; Modal credentials come from `modal setup` or MODAL_TOKEN_ID / MODAL_TOKEN_SECRET.
USE_MODAL = os.getenv("USE_MODAL", "").strip().lower() in ("1", "true", "yes", "on")
MODAL_APP_NAME = os.getenv("MODAL_APP_NAME", "kkaraoke")

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
# How much audio the local disk may hold as a cache of R2; the least recently played goes first. 0: no limit.
R2_CACHE_MAX_BYTES = int(float(os.getenv("R2_CACHE_MAX_GB", "5")) * 1024**3)

# Spicy Lyrics (word-by-word lyrics), looked up through Spotify's search. Both are optional:
# without them that provider is skipped. Keys: https://developers.spicylyrics.org, https://developer.spotify.com
SPICY_SECRET_KEY = os.getenv("SPICY_SECRET_KEY", "")
SPOTIFY_CLIENT_ID = os.getenv("SPOTIFY_CLIENT_ID", "")
SPOTIFY_SECRET = os.getenv("SPOTIFY_SECRET", "")
