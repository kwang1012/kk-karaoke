#!/usr/bin/env bash
# Deploy KKaraoke: the frontend to Cloudflare Workers, the backend to the server over SSH.
#
#   ./deploy.sh                 frontend and backend
#   ./deploy.sh frontend        only the frontend (seconds)
#   ./deploy.sh backend         only the backend (several minutes: the image is large)
#   ./deploy.sh backend --force deploy even if a song is being processed
#   ./deploy.sh -n              show what would run, change nothing
#
# Needs: an SSH host named "kkaraoke" (override with HOST), `wrangler` logged in, yarn, rsync.
# Secrets (backend/.env, cloudflared/credentials.json) live on the server and are never uploaded.
set -euo pipefail

HOST="${HOST:-kkaraoke}"
REMOTE_DIR="${REMOTE_DIR:-/opt/karaoke}"
API_ADDR="${API_ADDR:-api.kkaraoke.app}"
SITE_URL="${SITE_URL:-https://kkaraoke.app}"
COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"

target="all"
force=0
dry=0
for arg in "$@"; do
  case "$arg" in
    frontend | backend | all) target="$arg" ;;
    --force) force=1 ;;
    -n | --dry-run) dry=1 ;;
    -h | --help) sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $arg (try --help)" >&2; exit 1 ;;
  esac
done

cd "$(dirname "$0")"

run() {
  echo "+ $*"
  if [ "$dry" -eq 0 ]; then "$@"; fi
}

deploy_frontend() {
  echo "==> Frontend"
  # The API address is baked into the build; the Supabase settings come from frontend/.env.production.
  run bash -c "cd frontend && VITE_API_ADDR='$API_ADDR' yarn build && npx wrangler deploy"
}

deploy_backend() {
  echo "==> Backend"
  if [ "$dry" -eq 0 ] && [ "$force" -eq 0 ]; then
    # Restarting the worker mid-song can leave its uploads half finished.
    active="$(ssh "$HOST" "docker exec karaoke-worker-1 celery -A services.process_request.celery inspect active 2>&1" || true)"
    if ! grep -q "empty" <<<"$active"; then
      echo "A song is being processed (or the worker is unreachable). Wait for it, or use --force." >&2
      echo "$active" | tail -5 >&2
      exit 1
    fi
  fi
  run rsync -az \
    --exclude /temp \
    --exclude node_modules --exclude .venv --exclude venv --exclude __pycache__ \
    --exclude build --exclude dist --exclude .git \
    --exclude backend/storage --exclude backend/data --exclude backend/.env \
    --exclude cloudflared --exclude '*.icns' --exclude frontend/icon.iconset \
    --exclude .env.local --exclude .env.production.local \
    ./ "$HOST:$REMOTE_DIR/"
  run ssh "$HOST" "cd $REMOTE_DIR && $COMPOSE up -d --build api worker"
}

verify() {
  echo "==> Checking $SITE_URL and the API"
  if [ "$dry" -eq 1 ]; then echo "+ curl https://$API_ADDR/api/health"; return; fi
  health=""
  for _ in $(seq 1 30); do
    health="$(curl -fsS "https://$API_ADDR/api/health" 2>/dev/null || true)"
    case "$health" in *'"api":true'*'"redis":true'*'"worker":true'*) break ;; esac
    sleep 3
  done
  echo "health: ${health:-no answer}"
  echo "site:   $(curl -s -o /dev/null -w '%{http_code}' "$SITE_URL/")"
  case "$health" in *'"worker":true'*) ;; *) echo "The API is not healthy yet." >&2; exit 1 ;; esac
}

case "$target" in
  frontend) deploy_frontend ;;
  backend) deploy_backend ;;
  all) deploy_backend; deploy_frontend ;;
esac
verify
echo "Done."
