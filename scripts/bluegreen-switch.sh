#!/usr/bin/env sh
set -eu

PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

SERVER="${SERVER:-root@101.200.231.35}"
REMOTE_DIR="${REMOTE_DIR:-/opt/kuajing-image}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.server-bluegreen.yml}"

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT_DIR"

usage() {
  cat <<EOF
Usage: $0

Promote the current remote dev color to production.
The production extension package is built from the backend release version
and uploaded to the remote downloads directory.

Advanced override:
  $0 blue
  $0 green

Environment:
  SERVER=$SERVER
  REMOTE_DIR=$REMOTE_DIR
  COMPOSE_FILE=$COMPOSE_FILE
EOF
}

if [ "$#" -gt 1 ]; then
  usage >&2
  exit 1
fi

case "${1:-}" in
  -h|--help|help)
    usage
    exit 0
    ;;
  ""|blue|green) ;;
  *)
    usage >&2
    exit 1
    ;;
esac

if [ "${1:-}" = "" ]; then
  echo "Promoting the current remote dev color on $SERVER:$REMOTE_DIR ..."
else
  echo "Promoting remote $1 on $SERVER:$REMOTE_DIR ..."
fi
export SERVER REMOTE_DIR COMPOSE_FILE
exec ./scripts/server-release.sh promote "$@"
