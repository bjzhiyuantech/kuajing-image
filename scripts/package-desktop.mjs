#!/usr/bin/env node

import { readdir, rm, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_DIR = path.join(REPO_ROOT, "dist/desktop");
const PLATFORM_BY_NODE = {
  darwin: "mac",
  win32: "win",
  linux: "linux"
};

const HELP = `Usage:
  node scripts/package-desktop.mjs [--platform <current|mac|win|linux>] [--target <target>] [--clean] [--with-images] [--skip-standalone] [--dir]

Options:
  --platform <value>      Desktop platform to build. Defaults to current.
  --target <value>        electron-builder target. Can be repeated. Defaults to dmg on mac, nsis on win, AppImage on linux.
  --clean                 Remove dist/desktop first and regenerate standalone resources cleanly.
  --with-images           Include Docker image archive in the standalone resources before packaging.
  --skip-standalone       Reuse existing dist/standalone/shangtu-ai-standalone.
  --dir                   Build unpacked app directory instead of an installer target.
  --help, -h              Show this help.

Examples:
  node scripts/package-desktop.mjs --clean
  node scripts/package-desktop.mjs --platform mac --target dmg --clean
  node scripts/package-desktop.mjs --platform win --target nsis --clean
`;

function parseArgs(argv) {
  if (argv[0] === "--") {
    argv = argv.slice(1);
  }
  const options = {
    platform: "current",
    targets: [],
    clean: false,
    withImages: false,
    skipStandalone: false,
    dir: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--clean") {
      options.clean = true;
      continue;
    }
    if (arg === "--with-images") {
      options.withImages = true;
      continue;
    }
    if (arg === "--skip-standalone") {
      options.skipStandalone = true;
      continue;
    }
    if (arg === "--dir") {
      options.dir = true;
      continue;
    }
    if (arg.startsWith("--platform=")) {
      options.platform = arg.slice("--platform=".length);
      continue;
    }
    if (arg === "--platform") {
      options.platform = readNextValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg.startsWith("--target=")) {
      options.targets.push(arg.slice("--target=".length));
      continue;
    }
    if (arg === "--target") {
      options.targets.push(readNextValue(argv, index, arg));
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function readNextValue(argv, index, optionName) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${optionName}`);
  }
  return value;
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: "inherit"
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed`);
  }
}

function resolvePlatform(platform) {
  if (platform === "current") {
    const current = PLATFORM_BY_NODE[process.platform];
    if (!current) {
      throw new Error(`Unsupported current platform: ${process.platform}`);
    }
    return current;
  }
  if (!new Set(["mac", "win", "linux"]).has(platform)) {
    throw new Error(`Invalid --platform: ${platform}`);
  }
  return platform;
}

function defaultTargets(platform) {
  if (platform === "mac") return ["dmg"];
  if (platform === "win") return ["nsis"];
  return ["AppImage"];
}

function builderArgs(options) {
  const platform = resolvePlatform(options.platform);
  const args = ["--publish=never", `--${platform}`];
  if (options.dir) {
    args.push("--dir");
    return args;
  }
  for (const target of options.targets.length > 0 ? options.targets : defaultTargets(platform)) {
    args.push(target);
  }
  return args;
}

async function listArtifacts(dir) {
  const artifacts = [];
  let entries = [];
  try {
    entries = await readdir(dir);
  } catch {
    return artifacts;
  }
  for (const entry of entries) {
    if (entry.endsWith(".blockmap") || entry === "builder-debug.yml" || entry === "builder-effective-config.yaml") {
      continue;
    }
    const filePath = path.join(dir, entry);
    const item = await stat(filePath);
    if (item.isFile() || item.isDirectory()) {
      artifacts.push(path.relative(REPO_ROOT, filePath));
    }
  }
  return artifacts.sort();
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(HELP);
    return;
  }

  if (options.clean) {
    await rm(OUTPUT_DIR, { recursive: true, force: true });
  }

  if (!options.skipStandalone) {
    const standaloneArgs = ["--skip-zip"];
    if (options.clean) standaloneArgs.unshift("--clean");
    if (options.withImages) standaloneArgs.push("--with-images");
    run("corepack", ["pnpm", "standalone:package", "--", ...standaloneArgs]);
  }

  run("corepack", ["pnpm", "--filter", "@gpt-image-canvas/desktop", "build"]);
  run("corepack", ["pnpm", "--filter", "@gpt-image-canvas/desktop", "exec", "electron-builder", ...builderArgs(options)]);

  const artifacts = await listArtifacts(OUTPUT_DIR);
  console.log("OK desktop artifacts:");
  for (const artifact of artifacts) {
    console.log(`- ${artifact}`);
  }
}

main().catch((error) => {
  console.error(`Desktop package failed: ${error.message}`);
  console.error("");
  console.error(HELP.trimEnd());
  process.exit(1);
});
