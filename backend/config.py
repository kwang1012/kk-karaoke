"""Application configuration constants."""

import os
from dotenv import load_dotenv

load_dotenv()

# Redis
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))

# Spotify
DEFAULT_PLAYLIST_ID = os.getenv("DEFAULT_PLAYLIST_ID", "3AEkt2VeAAHFc1TC5FLuIl")

# Jam state
JAM_STATE_SYNC_INTERVAL = float(os.getenv("JAM_STATE_SYNC_INTERVAL", "1.0"))
