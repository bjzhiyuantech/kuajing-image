#!/usr/bin/env sh
set -eu

PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.bluegreen.yml}"
ACTIVE_FILE="${ACTIVE_FILE:-deploy/bluegreen/active}"
UPSTREAM_FILE="${UPSTREAM_FILE:-deploy/nginx/active-upstream.conf}"
DEV_UPSTREAM_FILE="${DEV_UPSTREAM_FILE:-deploy/nginx/dev-upstream.conf}"
DOWNLOADS_DIR="${DOWNLOADS_DIR:-downloads}"
DEV_PUBLIC_PORT="${DEV_PUBLIC_PORT:-8790}"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "$1 command was not found. Install it or add it to PATH." >&2
    exit 1
  fi
}

read_active_color() {
  if [ -f "$ACTIVE_FILE" ]; then
    tr -d '[:space:]' < "$ACTIVE_FILE"
  else
    printf '%s' "blue"
  fi
}

opposite_color() {
  case "$1" in
    blue) printf '%s' "green" ;;
    green) printf '%s' "blue" ;;
    *) echo "Unknown color: $1" >&2; exit 1 ;;
  esac
}

wait_for_service() {
  service="$1"
  container_id="$(docker compose -f "$COMPOSE_FILE" ps -q "$service")"
  if [ "$container_id" = "" ]; then
    echo "Could not find container for $service" >&2
    exit 1
  fi

  echo "Waiting for $service to pass /api/health..."
  tries=60
  while [ "$tries" -gt 0 ]; do
    health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container_id")"
    if [ "$health" = "healthy" ] || [ "$health" = "none" ]; then
      if docker compose -f "$COMPOSE_FILE" exec -T "$service" node -e "fetch('http://127.0.0.1:8787/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
        return 0
      fi
    fi
    tries=$((tries - 1))
    sleep 2
  done

  echo "$service did not become healthy." >&2
  exit 1
}

require_command git
require_command docker
require_command corepack
require_command node

current="$(read_active_color)"
target="${1:-$(opposite_color "$current")}"

case "$target" in
  blue|green) ;;
  *) echo "Usage: $0 [blue|green]" >&2; exit 1 ;;
esac

if [ "$target" = "$current" ]; then
  echo "Target $target is currently production. Use the inactive color for dev deployment, or switch production first." >&2
  exit 1
fi

service="app-$target"
current_service="app-$current"

mkdir -p "$(dirname "$UPSTREAM_FILE")" "$(dirname "$DEV_UPSTREAM_FILE")" "$(dirname "$ACTIVE_FILE")"

printf '%s\n' "$current" > "$ACTIVE_FILE"

if [ ! -f "$UPSTREAM_FILE" ]; then
  cat > "$UPSTREAM_FILE" <<EOF
upstream active_app {
  server $current_service:8787;
}
EOF
fi

echo "Pulling latest code..."
git pull --ff-only

mkdir -p "$(dirname "$UPSTREAM_FILE")" "$(dirname "$DEV_UPSTREAM_FILE")" "$(dirname "$ACTIVE_FILE")"
printf '%s\n' "$current" > "$ACTIVE_FILE"
if [ ! -f "$UPSTREAM_FILE" ]; then
  cat > "$UPSTREAM_FILE" <<EOF
upstream active_app {
  server $current_service:8787;
}
EOF
fi

echo "Installing workspace dependencies for extension packaging..."
corepack pnpm install --frozen-lockfile

echo "Starting shared services and rebuilding $service..."
docker compose -f "$COMPOSE_FILE" up -d mysql
docker compose -f "$COMPOSE_FILE" up -d --build "$service"
wait_for_service "$service"

cat > "$DEV_UPSTREAM_FILE" <<EOF
upstream dev_app {
  server $service:8787;
}
EOF

docker compose -f "$COMPOSE_FILE" up -d nginx
docker compose -f "$COMPOSE_FILE" exec -T nginx nginx -s reload

mkdir -p "$DOWNLOADS_DIR"

echo "Building dev extension bundle..."
corepack pnpm --filter @gpt-image-canvas/extension build:dev
node scripts/package-extensions.mjs "$DOWNLOADS_DIR" dev

echo "Dev environment is $service on http://localhost:$DEV_PUBLIC_PORT"
echo "Extension packages are in $DOWNLOADS_DIR/"
echo "After verification, promote with: ./scripts/bluegreen-switch.sh $target"
