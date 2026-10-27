#!/bin/bash

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
celery -A services.process_request.celery worker -l info -Q urgent,celery --concurrency=1 --pool=solo &

# Start Nginx (serving frontend)
nginx -g 'daemon off;' &

# If any process dies, stop the container (so Docker's restart policy can recover it)
# instead of leaving nginx up in front of a dead backend or worker.
wait -n
echo "A service exited; shutting down container" >&2
kill $(jobs -p) 2>/dev/null
exit 1
