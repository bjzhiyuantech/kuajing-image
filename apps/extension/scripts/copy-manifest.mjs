import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

loadDotEnv(resolve("../..", ".env"));
loadDotEnv(resolve(".env"));

const outputDir = process.argv[2] || "dist";
const manifest = JSON.parse(readFileSync(resolve("manifest.json"), "utf8"));
const extensionPackage = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
const buildTarget = process.env.EXTENSION_BUILD_TARGET || "local";
const apiBaseUrl =
  process.env.VITE_EXTENSION_API_BASE_URL ||
  (buildTarget === "dev" ? process.env.EXTENSION_DEV_API_BASE_URL : process.env.EXTENSION_PROD_API_BASE_URL) ||
  (buildTarget === "dev" ? "https://dev.neimou.com" : "https://ai.neimou.com");
const extensionName =
  process.env.VITE_EXTENSION_NAME ||
  (buildTarget === "dev" ? process.env.EXTENSION_DEV_NAME : process.env.EXTENSION_PROD_NAME) ||
  (buildTarget === "dev" ? `${manifest.name} Dev` : manifest.name);
const extensionVersion =
  process.env.VITE_EXTENSION_VERSION ||
  (buildTarget === "dev" ? process.env.EXTENSION_DEV_VERSION : process.env.EXTENSION_PROD_VERSION) ||
  extensionPackage.version ||
  manifest.version;

manifest.name = extensionName;
manifest.short_name = extensionName;
manifest.version = extensionVersion;

if (buildTarget === "dev") {
  manifest.description = `${manifest.description} Dev`;
}

const apiUrl = new URL(apiBaseUrl);
const apiOriginPermission = `${apiUrl.origin}/*`;
manifest.host_permissions = Array.from(new Set([apiOriginPermission, ...manifest.host_permissions]));

writeFileSync(resolve(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

function loadDotEnv(path) {
  let body = "";
  try {
    body = readFileSync(path, "utf8");
  } catch {
    return;
  }

  for (const line of body.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }
    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    if (!key || Object.hasOwn(process.env, key)) {
      continue;
    }
    process.env[key] = rawValue.replace(/^(['"])(.*)\1$/u, "$2");
  }
}
