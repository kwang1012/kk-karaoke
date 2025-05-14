#!/bin/bash
kill `lsof -tn -i:8080`
kill `lsof -tn -i:5173`
kill `lsof -tn -i:4173`

HOST=127.0.0.1
PORT=6379

if lsof -n | grep ':6379'; then
    echo "Redis is running"
else
    echo "Redis is not running"
    exit 1
fi

if command -v ffmpeg >/dev/null 2>&1; then
    echo "ffmpeg is installed and in PATH"
else
    echo "ffmpeg is not installed or not in PATH"
    exit 1
fi

cd frontend
yarn install && yarn build
yarn preview --host &

cd ../backend
source .venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8080 &
celery -A services.process_request.celery worker -l info --concurrency=1
