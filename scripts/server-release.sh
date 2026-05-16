#!/usr/bin/env sh
set -eu

PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"
COREPACK_NPM_REGISTRY="${COREPACK_NPM_REGISTRY:-${NPM_CONFIG_REGISTRY:-https://registry.npmmirror.com}}"
NPM_CONFIG_REGISTRY="${NPM_CONFIG_REGISTRY:-$COREPACK_NPM_REGISTRY}"
export COREPACK_NPM_REGISTRY NPM_CONFIG_REGISTRY

SERVER="${SERVER:-root@101.200.231.35}"
SERVER_HOST="${SERVER#*@}"
REMOTE_DIR="${REMOTE_DIR:-/opt/kuajing-image}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.server-bluegreen.yml}"
DOWNLOADS_DIR="${DOWNLOADS_DIR:-downloads}"
ACTIVE_FILE="${ACTIVE_FILE:-deploy/bluegreen/active}"
DEV_UPSTREAM_FILE="${DEV_UPSTREAM_FILE:-deploy/nginx/dev-upstream.conf}"
PROD_BASE_URL="${PROD_BASE_URL:-https://ai.neimou.com}"
DEV_BASE_URL="${DEV_BASE_URL:-https://dev.neimou.com}"

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT_DIR"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "$1 command was not found. Install it or add it to PATH." >&2
    exit 1
  fi
}

remote() {
  ssh "$SERVER" "$@"
}

usage() {
  cat <<EOF
Usage: $0 [dev|promote|status]

Commands:
  dev      Sync local code to the inactive dev color, start it, package/upload the dev extension.
  promote  Promote the current dev color to production, package/upload the prod extension. No color is needed.
  status   Show current server blue/green and extension release status.

Environment:
  SERVER=$SERVER
  REMOTE_DIR=$REMOTE_DIR
  DEV_BASE_URL=$DEV_BASE_URL
  PROD_BASE_URL=$PROD_BASE_URL
EOF
}

choose_command() {
  cat >&2 <<EOF
请选择操作：
  1) 同步本地修改到 dev 环境，启动 dev，并打包开发插件
  2) 切换蓝绿，让当前 dev 上线，并打包正式插件
  3) 查看当前状态
  q) 退出
EOF
  printf "输入选择 [1/2/3/q]: " >&2
  if ! read -r choice 2>/dev/null </dev/tty; then
    read -r choice || {
      echo "No interactive input available. Use: $0 [dev|promote|status]" >&2
      exit 1
    }
  fi
  case "$choice" in
    1) printf dev ;;
    2) printf promote ;;
    3) printf status ;;
    q|Q) exit 0 ;;
    *) echo "Unknown choice: $choice" >&2; exit 1 ;;
  esac
}

read_remote_active_color() {
  remote "cd '$REMOTE_DIR' && if [ -f '$ACTIVE_FILE' ]; then tr -d '[:space:]' < '$ACTIVE_FILE'; else printf blue; fi"
}

read_remote_dev_color() {
  remote "cd '$REMOTE_DIR' && if [ -f '$DEV_UPSTREAM_FILE' ]; then sed -n 's/.*server app-\\(blue\\|green\\):8787.*/\\1/p' '$DEV_UPSTREAM_FILE' | head -1; fi"
}

read_remote_service_for_target() {
  target="$1"
  case "$target" in
    dev) color="$(read_remote_dev_color)" ;;
    prod) color="$(read_remote_active_color)" ;;
    *) echo "Unknown extension target: $target" >&2; exit 1 ;;
  esac
  case "$color" in
    blue|green) printf 'app-%s' "$color" ;;
    *) echo "Could not detect remote $target service color." >&2; exit 1 ;;
  esac
}

read_remote_release_version() {
  target="$1"
  service="$(read_remote_service_for_target "$target")"
  remote "cd '$REMOTE_DIR' && docker compose -f '$COMPOSE_FILE' exec -T -e TARGET='$target' '$service' node --input-type=module <<'NODE'
import { getExtensionReleaseConfig } from './apps/api/dist/extension-release.js';

const target = process.env.TARGET;
const config = await getExtensionReleaseConfig();
console.log(config[target]?.version || '');
process.exit(0);
NODE
"
}

assert_packaged_version() {
  target="$1"
  expected_version="$2"
  TARGET="$target" EXPECTED_VERSION="$expected_version" DOWNLOADS_DIR="$DOWNLOADS_DIR" node --input-type=module <<'NODE'
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const target = process.env.TARGET;
const expectedVersion = process.env.EXPECTED_VERSION;
const downloadsDir = process.env.DOWNLOADS_DIR || 'downloads';
const manifestPath = resolve(downloadsDir, `kuajing-image-extension-${target}-latest.json`);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (manifest.version !== expectedVersion) {
  console.error(`Packaged ${target} extension version mismatch: expected ${expectedVersion}, got ${manifest.version || '(empty)'}.`);
  process.exit(1);
}
console.log(`Packaged ${target} extension version: ${manifest.version}`);
NODE
}

package_extension() {
  target="$1"
  case "$target" in
    dev|prod) ;;
    *) echo "Unknown extension target: $target" >&2; exit 1 ;;
  esac

  mkdir -p "$DOWNLOADS_DIR"
  release_version="$(read_remote_release_version "$target")"
  if [ "$release_version" = "" ]; then
    echo "Remote $target extension release version is empty. Please set it in admin before packaging." >&2
    exit 1
  fi
  echo "Using $target extension release version: $release_version"
  echo "Building $target extension..."
  case "$target" in
    dev)
      EXTENSION_DEV_VERSION="$release_version" \
      EXTENSION_DEV_API_BASE_URL="$DEV_BASE_URL" \
      EXTENSION_DEV_NAME="商图AI助手 Dev" \
      VITE_EXTENSION_API_BASE_URL="$DEV_BASE_URL" \
      corepack pnpm --filter @gpt-image-canvas/extension build:dev
      ;;
    prod)
      EXTENSION_PROD_VERSION="$release_version" \
      EXTENSION_PROD_API_BASE_URL="$PROD_BASE_URL" \
      EXTENSION_PROD_NAME="商图AI助手" \
      VITE_EXTENSION_API_BASE_URL="$PROD_BASE_URL" \
      corepack pnpm --filter @gpt-image-canvas/extension build:prod
      ;;
  esac
  node scripts/package-extensions.mjs "$DOWNLOADS_DIR" "$target"
  assert_packaged_version "$target" "$release_version"
}

upload_extension() {
  target="$1"
  echo "Uploading $target extension packages to $SERVER:$REMOTE_DIR/$DOWNLOADS_DIR ..."
  remote "mkdir -p '$REMOTE_DIR/$DOWNLOADS_DIR'"
  rsync -az \
    "$DOWNLOADS_DIR/kuajing-image-extension-$target-latest.zip" \
    "$DOWNLOADS_DIR/kuajing-image-extension-$target-latest.json" \
    "$DOWNLOADS_DIR/kuajing-image-extension-$target-v"*.zip \
    "$SERVER:$REMOTE_DIR/$DOWNLOADS_DIR/"
}

update_remote_release_config() {
  target="$1"
  base_url="$2"
  service="$(read_remote_service_for_target "$target")"

  echo "Updating $target extension release config on server..."
  remote "cd '$REMOTE_DIR' && docker compose -f '$COMPOSE_FILE' exec -T -e TARGET='$target' -e BASE_URL='$base_url' '$service' node --input-type=module <<'NODE'
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { getExtensionReleaseConfig, saveExtensionReleaseConfig } from './apps/api/dist/extension-release.js';

const target = process.env.TARGET;
const baseUrl = process.env.BASE_URL.replace(/\\/$/u, '');
const manifestPath = \`/app/apps/web/dist/downloads/kuajing-image-extension-\${target}-latest.json\`;
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const existing = await getExtensionReleaseConfig();
const downloadUrl = new URL(manifest.downloadUrl || \`/downloads/\${manifest.fileName}\`, \`\${baseUrl}/\`).toString();
const latestDownloadUrl = new URL(manifest.latestDownloadUrl || \`/downloads/kuajing-image-extension-\${target}-latest.zip\`, \`\${baseUrl}/\`).toString();
const installHelpUrl = new URL(manifest.installHelpUrl || '/install-help.html', \`\${baseUrl}/\`).toString();
const nextTarget = {
  apiBaseUrl: baseUrl,
  version: manifest.version || existing[target].version,
  downloadUrl,
  latestDownloadUrl,
  installHelpUrl,
  fileName: manifest.fileName || basename(new URL(downloadUrl).pathname),
  sizeBytes: manifest.sizeBytes,
  sha256: manifest.sha256,
  publishedAt: manifest.publishedAt,
  releaseNotes: manifest.releaseNotes
};
await saveExtensionReleaseConfig({
  dev: target === 'dev' ? nextTarget : existing.dev,
  prod: target === 'prod' ? nextTarget : existing.prod
});
console.log(JSON.stringify({ target, version: nextTarget.version, latestDownloadUrl }, null, 2));
process.exit(0);
NODE"
}

show_status() {
  echo "Server compose status:"
  remote "cd '$REMOTE_DIR' && docker compose -f '$COMPOSE_FILE' ps && echo && printf 'prod color: ' && if [ -f '$ACTIVE_FILE' ]; then cat '$ACTIVE_FILE'; else printf blue; fi && echo && printf 'dev color: ' && if [ -f '$DEV_UPSTREAM_FILE' ]; then sed -n 's/.*server app-\\(blue\\|green\\):8787.*/\\1/p' '$DEV_UPSTREAM_FILE' | head -1; fi && echo && echo && curl -fsS http://127.0.0.1:8787/api/extension-release"
}

deploy_dev() {
  target="${1:-}"
  echo "Deploying local workspace to server dev color..."
  ./scripts/server-bluegreen-deploy-dev.sh "$target"
  package_extension dev
  upload_extension dev
  update_remote_release_config dev "$DEV_BASE_URL"
  echo "Dev deployment complete."
  echo "Dev app: $DEV_BASE_URL"
  echo "Dev extension: $DEV_BASE_URL/downloads/kuajing-image-extension-dev-latest.zip"
}

promote_prod() {
  target="${1:-}"
  if [ "$target" = "" ]; then
    target="$(read_remote_dev_color)"
  fi
  case "$target" in
    blue|green) ;;
    *) echo "Could not detect dev color. Usage: $0 promote [blue|green]" >&2; exit 1 ;;
  esac

  current="$(read_remote_active_color)"
  echo "Current prod color: $current"
  echo "Promoting dev color: $target"
  if [ -t 0 ]; then
    printf "确认切换 prod 到 %s? [y/N]: " "$target"
    read -r answer
    case "$answer" in
      y|Y|yes|YES) ;;
      *) echo "Cancelled."; exit 0 ;;
    esac
  fi

  ./scripts/server-bluegreen-promote.sh "$target"
  package_extension prod
  upload_extension prod
  update_remote_release_config prod "$PROD_BASE_URL"
  echo "Production promotion complete."
  echo "Prod app: $PROD_BASE_URL"
  echo "Prod extension: $PROD_BASE_URL/downloads/kuajing-image-extension-prod-latest.zip"
  echo "Install help: $PROD_BASE_URL/install-help.html"
}

for command_name in ssh rsync corepack node; do
  require_command "$command_name"
done

command="${1:-}"
if [ "$command" = "" ]; then
  command="$(choose_command)"
else
  shift
fi

case "$command" in
  dev) deploy_dev "${1:-}" ;;
  promote) promote_prod "${1:-}" ;;
  status) show_status ;;
  -h|--help|help) usage ;;
  *) usage >&2; exit 1 ;;
esac
