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

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "$1 command was not found. Install it or add it to PATH." >&2
    exit 1
  fi
}

remote() {
  ssh "$SERVER" "$@"
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

for command_name in ssh; do
  require_command "$command_name"
done

target="${1:-}"
if [ "$target" = "" ]; then
  target="$(remote "cd '$REMOTE_DIR' && if [ -f '$DEV_UPSTREAM_FILE' ]; then sed -n 's/.*server app-\\(blue\\|green\\):8787.*/\\1/p' '$DEV_UPSTREAM_FILE' | head -1; fi")"
fi

case "$target" in
  blue|green) ;;
  *) echo "Usage: $0 [blue|green]" >&2; exit 1 ;;
esac

current="$(remote "cd '$REMOTE_DIR' && if [ -f '$ACTIVE_FILE' ]; then tr -d '[:space:]' < '$ACTIVE_FILE'; else printf blue; fi")"
case "$current" in
  blue|green) ;;
  *) echo "Unknown active color on server: $current" >&2; exit 1 ;;
esac

if [ "$target" = "$current" ]; then
  echo "$target is already active prod."
  exit 0
fi

service="app-$target"
dev_color="$(opposite_color "$target")"

echo "Checking $service health before promotion ..."
wait_remote_service "$service"

echo "Switching prod from $current to $target ..."
remote "cd '$REMOTE_DIR' && mkdir -p \"\$(dirname '$ACTIVE_FILE')\" \"\$(dirname '$UPSTREAM_FILE')\" \"\$(dirname '$DEV_UPSTREAM_FILE')\" && cat > '$UPSTREAM_FILE' <<EOF
upstream active_app {
  server $service:8787;
}
EOF
cat > '$DEV_UPSTREAM_FILE' <<EOF
upstream dev_app {
  server app-$dev_color:8787;
}
EOF
printf '%s\n' '$target' > '$ACTIVE_FILE'
docker compose -f '$COMPOSE_FILE' up -d --force-recreate nginx"

echo "Prod now points to $target: http://$SERVER_HOST:$PUBLIC_PORT"
echo "Dev now points to $dev_color: http://$SERVER_HOST:$DEV_PUBLIC_PORT"
