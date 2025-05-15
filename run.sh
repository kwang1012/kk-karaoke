#!/bin/sh

# For backend
redis-server --daemonize yes

# Start FastAPI backend
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000 &
celery -A services.process_request.celery worker -l info --concurrency=1 --pool=solo &


# Start Nginx (serving frontend)
nginx -g 'daemon off;'