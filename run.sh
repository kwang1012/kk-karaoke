#!/bin/sh

# For backend
redis-server --daemonize yes - <<EOF
dir /app/backend/storage
save 60 1
appendonly yes
EOF
sleep 1 # wait briefly

# Start FastAPI backend
cd backend
uvicorn main:app --host 0.0.0.0 --port 7860
