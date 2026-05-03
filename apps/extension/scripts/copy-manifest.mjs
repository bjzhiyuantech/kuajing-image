import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const outputDir = process.argv[2] || "dist";
const manifest = JSON.parse(readFileSync(resolve("manifest.json"), "utf8"));
const apiBaseUrl = process.env.VITE_EXTENSION_API_BASE_URL || "https://imagen.neimou.com";
const extensionName = process.env.VITE_EXTENSION_NAME || manifest.name;
const buildTarget = process.env.EXTENSION_BUILD_TARGET || "local";

manifest.name = extensionName;
manifest.short_name = extensionName;

if (buildTarget === "dev") {
  manifest.description = `${manifest.description} Dev`;
}

const apiUrl = new URL(apiBaseUrl);
const apiOriginPermission = `${apiUrl.origin}/*`;
manifest.host_permissions = Array.from(new Set([apiOriginPermission, ...manifest.host_permissions]));

writeFileSync(resolve(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
