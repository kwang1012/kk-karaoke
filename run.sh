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
. .venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000 &
celery -A services.process_request.celery worker -l info --concurrency=1 --pool=solo &

# Start Nginx (serving frontend)
nginx -g 'daemon off;'
