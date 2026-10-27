#!/bin/bash
# Start/stop the Docker stack, with the worker in Docker or on the host.
#   ./docker.sh up          worker in Docker (CPU, or NVIDIA with `up gpu`)
#   ./docker.sh up local    worker on this machine (Apple GPU via MPS); log in .local-worker.log
#   ./docker.sh down        stop everything, including a host worker
#   ./docker.sh status      show containers and where the worker is running
cd "$(dirname "$0")"

pidfile=.local-worker.pid
files=(-f docker-compose.yml)

stop_host_worker() {
  if [ -f "$pidfile" ]; then
    # The worker is a process group leader (set -m below); kill the whole group.
    kill -- "-$(cat "$pidfile")" 2>/dev/null
    rm -f "$pidfile"
  fi
}

case "$1:$2" in
  up:|up:docker) docker compose "${files[@]}" up -d --build ;;
  up:gpu) docker compose "${files[@]}" -f docker-compose.gpu.yml up -d --build ;;
  up:local)
    command -v uv >/dev/null || { echo "uv is required: https://docs.astral.sh/uv/"; exit 1; }
    stop_host_worker
    docker compose "${files[@]}" -f docker-compose.local-worker.yml up -d --build --remove-orphans || exit 1
    docker compose "${files[@]}" -f docker-compose.local-worker.yml stop worker >/dev/null 2>&1
    (cd backend && uv sync) || exit 1
    set -m
    (cd backend && REDIS_AUTOSTART=0 exec uv run celery -A services.process_request.celery worker -l info -Q urgent,celery --concurrency=1 --pool=solo) </dev/null >.local-worker.log 2>&1 &
    echo $! >"$pidfile"
    echo "Host worker started (pid $!, log: .local-worker.log)"
    ;;
  down:*)
    stop_host_worker
    docker compose -f docker-compose.yml -f docker-compose.local-worker.yml --profile docker-worker down
    ;;
  status:*)
    docker compose -f docker-compose.yml -f docker-compose.local-worker.yml --profile docker-worker ps
    if [ -f "$pidfile" ] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then
      echo "host worker: running (pid $(cat "$pidfile")), log: .local-worker.log"
    else
      echo "host worker: not running"
    fi
    ;;
  *) echo "usage: $0 up [docker|gpu|local] | down | status"; exit 1 ;;
esac
