#!/usr/bin/env node
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
const webRequire = createRequire(new URL("../apps/web/package.json", import.meta.url));
const {
  DEFAULT_EMBED_DEFINITIONS,
  LANGUAGES,
  defaultEditorAssetUrls
} = webRequire("tldraw");
const tldrawPackage = JSON.parse(
  await readFile(new URL("../apps/web/node_modules/tldraw/package.json", import.meta.url), "utf8")
);

const CDN_ORIGIN = "https://cdn.tldraw.com";
const TLDRAW_VERSION = tldrawPackage.version;
const CDN_BASE_URL = `${CDN_ORIGIN}/${TLDRAW_VERSION}`;
const DEFAULT_OUTPUT_DIR = `/tmp/tldraw-assets/${TLDRAW_VERSION}`;

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const outputDir =
  process.argv.find((arg) => arg.startsWith("--out="))?.slice("--out=".length) || DEFAULT_OUTPUT_DIR;

function assetPathFromUrl(url) {
  const parsed = new URL(url);
  return parsed.pathname.replace(`/${TLDRAW_VERSION}/`, "");
}

function tldrawAsset(path) {
  return {
    url: `${CDN_BASE_URL}/${path}`,
    path
  };
}

const assets = [
  ...Object.values(defaultEditorAssetUrls.fonts ?? {})
    .filter(Boolean)
    .map((url) => ({ url, path: assetPathFromUrl(url) })),
  tldrawAsset("icons/icon/0_merged.svg"),
  ...LANGUAGES.map((language) => tldrawAsset(`translations/${language.locale}.json`)),
  ...DEFAULT_EMBED_DEFINITIONS.map((definition) => tldrawAsset(`embed-icons/${definition.type}.png`))
];

const uniqueAssets = Array.from(new Map(assets.map((asset) => [asset.path, asset])).values());

async function downloadAsset(asset) {
  const target = join(outputDir, asset.path);
  const response = await fetch(asset.url);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${asset.url}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes);
  console.log(`Downloaded ${asset.path} (${bytes.byteLength} bytes)`);
}

console.log(`tldraw version: ${TLDRAW_VERSION}`);
console.log(`source: ${CDN_BASE_URL}`);
console.log(`output: ${outputDir}`);
console.log(`assets: ${uniqueAssets.length}`);

if (dryRun) {
  for (const asset of uniqueAssets) {
    console.log(`${asset.path} <- ${asset.url}`);
  }
  process.exit(0);
}

const concurrency = 8;
const queue = [...uniqueAssets];
const failures = [];

await Promise.all(
  Array.from({ length: concurrency }, async () => {
    while (queue.length > 0) {
      const asset = queue.shift();
      try {
        await downloadAsset(asset);
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
      }
    }
  })
);

if (failures.length > 0) {
  console.error(`Failed to download ${failures.length} asset(s):`);
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Done.");
console.log(`Next: ossutil sync ${outputDir}/ oss://kuajing-image/tldraw/${TLDRAW_VERSION}/ -e oss-cn-beijing.aliyuncs.com -f`);
process.exit(0);
