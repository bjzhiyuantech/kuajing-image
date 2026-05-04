#!/usr/bin/env sh
set -eu

PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.bluegreen.yml}"
ACTIVE_FILE="${ACTIVE_FILE:-deploy/bluegreen/active}"
UPSTREAM_FILE="${UPSTREAM_FILE:-deploy/nginx/active-upstream.conf}"
DEV_UPSTREAM_FILE="${DEV_UPSTREAM_FILE:-deploy/nginx/dev-upstream.conf}"
PUBLIC_PORT="${PUBLIC_PORT:-8787}"
DEV_PUBLIC_PORT="${DEV_PUBLIC_PORT:-8790}"
DOWNLOADS_DIR="${DOWNLOADS_DIR:-downloads}"

mkdir -p "$(dirname "$UPSTREAM_FILE")" "$(dirname "$DEV_UPSTREAM_FILE")" "$(dirname "$ACTIVE_FILE")"

for command_name in docker corepack node; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "$command_name command was not found. Install it or add it to PATH." >&2
    exit 1
  fi
done

if [ "${1:-}" = "" ]; then
  if [ -f "$ACTIVE_FILE" ]; then
    current="$(tr -d '[:space:]' < "$ACTIVE_FILE")"
  else
    current="blue"
  fi

  case "$current" in
    blue) target="green" ;;
    green) target="blue" ;;
    *) echo "Unknown active color in $ACTIVE_FILE: $current" >&2; exit 1 ;;
  esac
else
  target="$1"
fi

case "$target" in
  blue|green) ;;
  *) echo "Usage: $0 [blue|green]" >&2; exit 1 ;;
esac

service="app-$target"
case "$target" in
  blue) dev_target="green" ;;
  green) dev_target="blue" ;;
esac
dev_service="app-$dev_target"

wait_for_service() {
  wait_service="$1"
  container_id="$(docker compose -f "$COMPOSE_FILE" ps -q "$wait_service")"
  if [ "$container_id" = "" ]; then
    echo "Could not find container for $wait_service" >&2
    exit 1
  fi

  echo "Waiting for $wait_service to pass /api/health..."
  tries=60
  while [ "$tries" -gt 0 ]; do
    health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container_id")"
    if [ "$health" = "healthy" ] || [ "$health" = "none" ]; then
      if docker compose -f "$COMPOSE_FILE" exec -T "$wait_service" node -e "fetch('http://127.0.0.1:8787/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
        return 0
      fi
    fi
    tries=$((tries - 1))
    sleep 2
  done

  echo "$wait_service did not become healthy. Traffic was not switched." >&2
  exit 1
}

docker compose -f "$COMPOSE_FILE" up -d --build "$service"
wait_for_service "$service"

mkdir -p "$DOWNLOADS_DIR"
echo "Building product extension bundle for the promoted environment..."
corepack pnpm --filter @gpt-image-canvas/extension build:prod
node scripts/package-extensions.mjs "$DOWNLOADS_DIR" prod

cat > "$UPSTREAM_FILE" <<EOF
upstream active_app {
  server $service:8787;
}
EOF

cat > "$DEV_UPSTREAM_FILE" <<EOF
upstream dev_app {
  server $dev_service:8787;
}
EOF

docker compose -f "$COMPOSE_FILE" up -d nginx
docker compose -f "$COMPOSE_FILE" exec -T nginx nginx -s reload

printf '%s\n' "$target" > "$ACTIVE_FILE"

echo "Traffic is now routed to $service on http://localhost:$PUBLIC_PORT"
echo "Dev traffic is now routed to $dev_service on http://localhost:$DEV_PUBLIC_PORT"
