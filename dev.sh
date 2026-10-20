#!/bin/bash
# Run the whole dev stack (Redis, API, Celery worker, frontend) from the repo root.
# Ctrl+C stops everything.
cd "$(dirname "$0")"

command -v uv >/dev/null || { echo "uv is required: https://docs.astral.sh/uv/"; exit 1; }
command -v ffmpeg >/dev/null || { echo "ffmpeg is required"; exit 1; }

# Job control gives every background job its own process group. `uv run`, uvicorn --reload and
# yarn all start children of their own; stopping only the wrapper would leave those running and
# holding their ports, so cleanup stops each group.
set -m
pids=()
cleanup() {
  trap - INT TERM EXIT
  for pid in "${pids[@]}"; do kill -- "-$pid" 2>/dev/null; done
  wait 2>/dev/null
}
trap cleanup INT TERM EXIT

for port in 8000 3000; do
  if holder=$(lsof -nP -tiTCP:$port -sTCP:LISTEN 2>/dev/null | head -1) && [ -n "$holder" ]; then
    echo "Port $port is already in use (pid $holder: $(ps -o command= -p "$holder" | cut -c1-80))."
    echo "Stop it first, e.g.  kill $holder"
    exit 1
  fi
done

if ! redis-cli ping >/dev/null 2>&1; then
  command -v redis-server >/dev/null || { echo "redis-server is required"; exit 1; }
  redis-server --save "" --appendonly no >/dev/null &
  pids+=($!)
  sleep 1
fi

(cd backend && exec uv run uvicorn main:app --reload --host 0.0.0.0 --port 8000) &
pids+=($!)
(cd backend && exec uv run celery -A services.process_request.celery worker -l info --concurrency=1 --pool=solo) &
pids+=($!)
(cd frontend && [ -d node_modules ] || yarn install; exec yarn start) &
pids+=($!)

# macOS ships bash 3.2 (no `wait -n`): poll until any process exits, then clean up.
while true; do
  for pid in "${pids[@]}"; do
    kill -0 "$pid" 2>/dev/null || exit 1
  done
  sleep 1
done
