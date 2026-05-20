#!/usr/bin/env sh
set -eu

PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

SERVER="${SERVER:-root@101.200.231.35}"
SERVER_HOST="${SERVER#*@}"
REMOTE_DIR="${REMOTE_DIR:-/opt/kuajing-image}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.server-bluegreen.yml}"
ACTIVE_FILE="${ACTIVE_FILE:-deploy/bluegreen/active}"
UPSTREAM_FILE="${UPSTREAM_FILE:-deploy/nginx/active-upstream.conf}"
DEV_UPSTREAM_FILE="${DEV_UPSTREAM_FILE:-deploy/nginx/dev-upstream.conf}"
PUBLIC_PORT="${PUBLIC_PORT:-8787}"
DEV_PUBLIC_PORT="${DEV_PUBLIC_PORT:-8790}"
BLUE_PORT="${BLUE_PORT:-8788}"
GREEN_PORT="${GREEN_PORT:-8789}"
APNS_ENV_FILE="${APNS_ENV_FILE:-.env.apns}"
APNS_SECRETS_DIR="${APNS_SECRETS_DIR:-secrets/apns}"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "$1 command was not found. Install it or add it to PATH." >&2
    exit 1
  fi
}

remote() {
  ssh "$SERVER" "$@"
}

read_remote_active_color() {
  remote "cd '$REMOTE_DIR' && if [ -f '$ACTIVE_FILE' ]; then tr -d '[:space:]' < '$ACTIVE_FILE'; else printf blue; fi"
}

opposite_color() {
  case "$1" in
    blue) printf green ;;
    green) printf blue ;;
    *) echo "Unknown color: $1" >&2; exit 1 ;;
  esac
}

wait_remote_service() {
  service="$1"
  remote "cd '$REMOTE_DIR' && tries=60; while [ \"\$tries\" -gt 0 ]; do if docker compose -f '$COMPOSE_FILE' exec -T '$service' node -e \"fetch('http://127.0.0.1:8787/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\" >/dev/null 2>&1; then exit 0; fi; tries=\$((tries - 1)); sleep 2; done; exit 1"
}

reload_remote_nginx() {
  remote "cd '$REMOTE_DIR' && tries=30; while [ \"\$tries\" -gt 0 ]; do container_id=\$(docker compose -f '$COMPOSE_FILE' ps -q nginx); if [ \"\$container_id\" != \"\" ] && [ \"\$(docker inspect -f '{{.State.Running}}' \"\$container_id\")\" = \"true\" ]; then docker compose -f '$COMPOSE_FILE' kill -s HUP nginx >/dev/null 2>&1 || true; exit 0; fi; tries=\$((tries - 1)); sleep 1; done; exit 1"
}

sync_code() {
  rsync -az --delete \
    --exclude='.git/' \
    --exclude='node_modules/' \
    --exclude='**/node_modules/' \
    --exclude='.codex-temp/' \
    --exclude='data/' \
    --exclude='downloads/' \
    --exclude='secrets/' \
    --exclude='.env' \
    --exclude='.env.*' \
    --exclude='apps/**/dist/' \
    --exclude='packages/**/dist/' \
    ./ "$SERVER:$REMOTE_DIR/"
}

sync_apns_secrets() {
  if [ ! -f "$APNS_ENV_FILE" ]; then
    return 0
  fi

  echo "Syncing APNs runtime config to $SERVER:$REMOTE_DIR ..."
  rsync -az "$APNS_ENV_FILE" "$SERVER:$REMOTE_DIR/$APNS_ENV_FILE"

  if [ -d "$APNS_SECRETS_DIR" ]; then
    remote "mkdir -p '$REMOTE_DIR/$APNS_SECRETS_DIR'"
    rsync -az "$APNS_SECRETS_DIR/" "$SERVER:$REMOTE_DIR/$APNS_SECRETS_DIR/"
    remote "chmod 700 '$REMOTE_DIR/secrets' '$REMOTE_DIR/$APNS_SECRETS_DIR' 2>/dev/null || true; chmod 600 '$REMOTE_DIR/$APNS_SECRETS_DIR/'*.p8 2>/dev/null || true"
  fi
}

case "${1:-}" in
  ""|blue|green) target="${1:-}" ;;
  *) echo "Usage: $0 [blue|green]" >&2; exit 1 ;;
esac

for command_name in rsync ssh; do
  require_command "$command_name"
done

current="$(read_remote_active_color)"
case "$current" in
  blue|green) ;;
  *) echo "Unknown active color on server: $current" >&2; exit 1 ;;
esac

if [ "$target" = "" ]; then
  target="$(opposite_color "$current")"
fi

if [ "$target" = "$current" ]; then
  echo "Refusing to rebuild active prod color $target. Current prod is $current." >&2
  echo "Choose $(opposite_color "$current") for dev, or promote/switch prod first." >&2
  exit 1
fi

service="app-$target"

echo "Syncing local workspace to $SERVER:$REMOTE_DIR ..."
sync_code
sync_apns_secrets

echo "Preparing blue/green nginx config on server ..."
remote "cd '$REMOTE_DIR' && mkdir -p \"\$(dirname '$ACTIVE_FILE')\" \"\$(dirname '$UPSTREAM_FILE')\" \"\$(dirname '$DEV_UPSTREAM_FILE')\" && printf '%s\n' '$current' > '$ACTIVE_FILE' && cat > '$UPSTREAM_FILE' <<EOF
upstream active_app {
  server app-$current:8787;
}
EOF
cat > '$DEV_UPSTREAM_FILE' <<EOF
upstream dev_app {
  server $service:8787;
}
EOF"

echo "Building and starting dev color $target ($service) ..."
remote "cd '$REMOTE_DIR' && PUBLIC_PORT='$PUBLIC_PORT' DEV_PUBLIC_PORT='$DEV_PUBLIC_PORT' BLUE_PORT='$BLUE_PORT' GREEN_PORT='$GREEN_PORT' docker compose -f '$COMPOSE_FILE' up -d --build --remove-orphans '$service'"

echo "Waiting for $service health ..."
wait_remote_service "$service"

echo "Starting/reloading blue/green nginx ..."
remote "cd '$REMOTE_DIR' && PUBLIC_PORT='$PUBLIC_PORT' DEV_PUBLIC_PORT='$DEV_PUBLIC_PORT' BLUE_PORT='$BLUE_PORT' GREEN_PORT='$GREEN_PORT' docker compose -f '$COMPOSE_FILE' up -d --remove-orphans nginx"
reload_remote_nginx

echo "Dev color $target is ready."
echo "Prod stays on $current: http://$SERVER_HOST:$PUBLIC_PORT"
echo "Dev points to $target: http://$SERVER_HOST:$DEV_PUBLIC_PORT"
echo "Promote after verification: ./scripts/server-bluegreen-promote.sh $target"
