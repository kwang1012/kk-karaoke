#!/bin/bash
# Run the whole dev stack (Redis, API, Celery worker, frontend) from the repo root.
# Ctrl+C stops everything.
cd "$(dirname "$0")"

command -v uv >/dev/null || { echo "uv is required: https://docs.astral.sh/uv/"; exit 1; }
command -v ffmpeg >/dev/null || { echo "ffmpeg is required"; exit 1; }

# Background jobs get their own process group. `uv run`, uvicorn --reload
# and yarn all start children of their own; stopping only the wrapper would leave those running
# and holding their ports, so cleanup stops each group.
pids=()
cleanup() {
  trap - EXIT
  trap '' INT TERM
  echo "Stopping (the Celery worker can take up to 5s to give up on a running task)..."
  for pid in "${pids[@]}"; do
    kill -TERM -- "-$pid" 2>/dev/null
    # A job stopped by terminal job control cannot handle TERM until it is resumed.
    kill -CONT -- "-$pid" 2>/dev/null
  done
  for ((attempt=0; attempt<25; attempt++)); do
    alive=0
    for pid in "${pids[@]}"; do
      kill -0 -- "-$pid" 2>/dev/null && alive=1
    done
    [ "$alive" = 0 ] && break
    sleep 0.2
  done
  for pid in "${pids[@]}"; do kill -KILL -- "-$pid" 2>/dev/null; done
  wait 2>/dev/null
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

for port in 8000 3000; do
  if holder=$(lsof -nP -tiTCP:$port -sTCP:LISTEN 2>/dev/null | head -1) && [ -n "$holder" ]; then
    echo "Port $port is already in use (pid $holder: $(ps -o command= -p "$holder" | cut -c1-80))."
    echo "Stop it first, e.g.  kill $holder"
    exit 1
  fi
done

need_redis=0
if ! redis-cli ping >/dev/null 2>&1; then
  command -v redis-server >/dev/null || { echo "redis-server is required"; exit 1; }
  need_redis=1
fi

# Job control stays on only while launching. With it on, bash hands the terminal to each
# foreground command's own process group and can leave it pointing at a dead group, after which
# Ctrl+C reaches nobody. The groups of the jobs started here survive turning it off again.
set -m
[ "$need_redis" = 1 ] && { redis-server --save "" --appendonly no >/dev/null </dev/null & pids+=($!); }

(cd backend && exec uv run uvicorn main:app --reload --host 0.0.0.0 --port 8000) </dev/null &
pids+=($!)
(cd backend && exec uv run celery -A services.process_request.celery worker -l info -Q urgent,celery --concurrency=1 --pool=solo) </dev/null >.local-worker.log 2>&1 &
pids+=($!)
echo "Worker output: $(pwd)/.local-worker.log"
(cd frontend && [ -d node_modules ] || yarn install; exec yarn start) </dev/null &
pids+=($!)
set +m
[ "$need_redis" = 1 ] && sleep 1

# macOS ships bash 3.2 (no `wait -n`): poll until any process exits, then clean up.
while true; do
  for pid in "${pids[@]}"; do
    kill -0 "$pid" 2>/dev/null || exit 1
  done
  sleep 1
done
