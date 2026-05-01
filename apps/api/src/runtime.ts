import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotEnv } from "dotenv";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(moduleDir, "..");
const repoRoot = resolve(packageRoot, "../..");

for (const envPath of [resolve(repoRoot, ".env"), resolve(packageRoot, ".env"), resolve(process.cwd(), ".env")]) {
  loadDotEnv({ path: envPath, quiet: true });
}

function parsePort(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "8787", 10);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    return 8787;
  }
  return parsed;
}

function resolveFromRepo(value: string): string {
  return isAbsolute(value) ? value : resolve(repoRoot, value);
}

const dataDir = resolveFromRepo(process.env.DATA_DIR ?? "./data");

export const runtimePaths = {
  repoRoot,
  packageRoot,
  dataDir,
  assetsDir: resolve(dataDir, "assets"),
  assetPreviewsDir: resolve(dataDir, "asset-previews"),
  webDistDir: resolve(repoRoot, "apps/web/dist")
};

export const serverConfig = {
  host: process.env.HOST ?? "127.0.0.1",
  port: parsePort(process.env.PORT)
};

export const mysqlConfig = {
  databaseUrl: emptyToUndefined(process.env.DATABASE_URL),
  host: emptyToUndefined(process.env.MYSQL_HOST) ?? "127.0.0.1",
  port: parsePort(process.env.MYSQL_PORT ?? "3306"),
  user: emptyToUndefined(process.env.MYSQL_USER) ?? "gpt_image_canvas",
  password: process.env.MYSQL_PASSWORD ?? "gpt_image_canvas",
  database: emptyToUndefined(process.env.MYSQL_DATABASE) ?? "gpt_image_canvas"
};

export function ensureRuntimeStorage(): void {
  mkdirSync(runtimePaths.dataDir, { recursive: true });
  mkdirSync(runtimePaths.assetsDir, { recursive: true });
  mkdirSync(runtimePaths.assetPreviewsDir, { recursive: true });
}

function emptyToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
