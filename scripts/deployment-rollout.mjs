#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const VALID_PROFILES = new Set(["local", "private-cloud", "saas"]);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const PROFILE_DEFAULTS = {
  local: {
    envFile: "deploy/profiles/local.env.example",
    composeFiles: ["docker-compose.yml"],
    baseUrl: "http://127.0.0.1:8787"
  },
  "private-cloud": {
    envFile: "deploy/profiles/private-cloud.env.example",
    composeFiles: ["docker-compose.private-cloud.yml"],
    baseUrl: "http://127.0.0.1:8787"
  },
  saas: {
    envFile: "deploy/profiles/saas.env.example",
    composeFiles: ["docker-compose.server-bluegreen.yml"],
    baseUrl: "http://127.0.0.1:8787"
  }
};

const HELP = `Usage:
  node scripts/deployment-rollout.mjs install --profile <local|private-cloud|saas> [--env-file <path>] [--image-archive <path>] [--offline]
  node scripts/deployment-rollout.mjs upgrade --profile <local|private-cloud|saas> [--env-file <path>] [--image-archive <path>] [--offline]
  node scripts/deployment-rollout.mjs rollback --profile <local|private-cloud|saas> --backup-dir <dir> [--env-file <path>]
  node scripts/deployment-rollout.mjs status --profile <local|private-cloud|saas> [--env-file <path>]

Options:
  --profile, --edition <profile>  Deployment profile.
  --env-file <path>               Env file. Defaults to .env when present, otherwise the profile template.
  --compose-file <path>           Compose file. Can be repeated.
  --image-archive <path>          Docker image archive to load before compose up.
  --offline                       Load image archive if present and run compose up without --build.
  --no-build                      Run compose up without --build.
  --skip-backup                   Do not create a deployment backup before upgrade.
  --backup-dir <dir>              Backup directory to restore during rollback. Rollback starts compose before MySQL restore.
  --backup-output-dir <dir>       Backup root for upgrade. Defaults to backups.
  --base-url <url>                Base URL for post-deploy smoke.
  --skip-smoke                    Skip post-deploy smoke.
  --dry-run                       Print commands without executing them.
  --help, -h                      Show this help.

Examples:
  node scripts/deployment-rollout.mjs install --profile local --env-file .env
  node scripts/deployment-rollout.mjs upgrade --profile private-cloud --env-file .env --image-archive private-cloud-images.tar --offline
  node scripts/deployment-rollout.mjs rollback --profile local --backup-dir backups/20260520-120000 --skip-smoke
`;

function parseArgs(argv) {
  if (argv[0] === "--help" || argv[0] === "-h") {
    return { help: true };
  }

  const [command, ...rest] = argv;
  const options = {
    command,
    composeFiles: [],
    backupOutputDir: "backups",
    offline: false,
    noBuild: false,
    skipBackup: false,
    skipSmoke: false,
    dryRun: false
  };

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--offline") {
      options.offline = true;
      options.noBuild = true;
      continue;
    }
    if (arg === "--no-build") {
      options.noBuild = true;
      continue;
    }
    if (arg === "--skip-backup") {
      options.skipBackup = true;
      continue;
    }
    if (arg === "--skip-smoke") {
      options.skipSmoke = true;
      continue;
    }
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg.startsWith("--profile=") || arg.startsWith("--edition=")) {
      options.profile = arg.slice(arg.indexOf("=") + 1);
      continue;
    }
    if (arg === "--profile" || arg === "--edition") {
      options.profile = readNextValue(rest, index, arg);
      index += 1;
      continue;
    }
    if (arg.startsWith("--env-file=")) {
      options.envFile = arg.slice("--env-file=".length);
      continue;
    }
    if (arg === "--env-file") {
      options.envFile = readNextValue(rest, index, arg);
      index += 1;
      continue;
    }
    if (arg.startsWith("--compose-file=")) {
      options.composeFiles.push(arg.slice("--compose-file=".length));
      continue;
    }
    if (arg === "--compose-file") {
      options.composeFiles.push(readNextValue(rest, index, arg));
      index += 1;
      continue;
    }
    if (arg.startsWith("--image-archive=")) {
      options.imageArchive = arg.slice("--image-archive=".length);
      continue;
    }
    if (arg === "--image-archive") {
      options.imageArchive = readNextValue(rest, index, arg);
      index += 1;
      continue;
    }
    if (arg.startsWith("--backup-dir=")) {
      options.backupDir = arg.slice("--backup-dir=".length);
      continue;
    }
    if (arg === "--backup-dir") {
      options.backupDir = readNextValue(rest, index, arg);
      index += 1;
      continue;
    }
    if (arg.startsWith("--backup-output-dir=")) {
      options.backupOutputDir = arg.slice("--backup-output-dir=".length);
      continue;
    }
    if (arg === "--backup-output-dir") {
      options.backupOutputDir = readNextValue(rest, index, arg);
      index += 1;
      continue;
    }
    if (arg.startsWith("--base-url=")) {
      options.baseUrl = arg.slice("--base-url=".length);
      continue;
    }
    if (arg === "--base-url") {
      options.baseUrl = readNextValue(rest, index, arg);
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

function resolveRepoPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.join(REPO_ROOT, filePath);
}

async function fileExists(filePath) {
  try {
    const item = await stat(filePath);
    return item.isFile();
  } catch {
    return false;
  }
}

function parseEnv(text) {
  const values = new Map();
  for (const rawLine of text.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values.set(key, value);
  }
  return values;
}

async function resolveProfileOptions(options) {
  if (!VALID_PROFILES.has(options.profile)) {
    throw new Error(`Missing or invalid --profile. Expected one of: ${[...VALID_PROFILES].join(", ")}`);
  }
  const defaults = PROFILE_DEFAULTS[options.profile];
  const envFile = resolveRepoPath(options.envFile || ((await fileExists(resolveRepoPath(".env"))) ? ".env" : defaults.envFile));
  const composeFiles = (options.composeFiles.length > 0 ? options.composeFiles : defaults.composeFiles).map(resolveRepoPath);
  const env = (await fileExists(envFile)) ? parseEnv(await readFile(envFile, "utf8")) : new Map();
  const port = env.get("PUBLIC_PORT") || env.get("PORT");
  const baseUrl = options.baseUrl || (port ? `http://127.0.0.1:${port}` : defaults.baseUrl);
  return { envFile, composeFiles, baseUrl };
}

function composeArgs(composeFiles, envFile, command, extraArgs = []) {
  const args = ["compose"];
  for (const composeFile of composeFiles) {
    args.push("-f", composeFile);
  }
  if (envFile) {
    args.push("--env-file", envFile);
  }
  args.push(command, ...extraArgs);
  return args;
}

function formatCommand(command, args) {
  return [command, ...args].map((part) => (/\s/u.test(part) ? JSON.stringify(part) : part)).join(" ");
}

function run(command, args, options) {
  if (options.dryRun) {
    console.log(`DRY ${formatCommand(command, args)}`);
    return;
  }
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: "inherit"
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed`);
  }
}

function nodeScript(script, args, options) {
  run(process.execPath, [path.join(REPO_ROOT, script), ...args], options);
}

async function preflight(options, resolved) {
  const args = ["--profile", options.profile, "--env-file", resolved.envFile];
  for (const composeFile of resolved.composeFiles) {
    args.push("--compose-file", composeFile);
  }
  nodeScript("scripts/deployment-preflight.mjs", args, options);
}

async function backup(options, resolved) {
  if (options.skipBackup) return;
  const args = ["backup", "--env-file", resolved.envFile, "--output-dir", options.backupOutputDir];
  for (const composeFile of resolved.composeFiles) {
    args.push("--compose-file", composeFile);
  }
  nodeScript("scripts/deployment-backup.mjs", args, options);
}

async function restore(options, resolved) {
  if (!options.backupDir) throw new Error("rollback requires --backup-dir");
  const args = ["restore", "--backup-dir", options.backupDir, "--env-file", resolved.envFile];
  for (const composeFile of resolved.composeFiles) {
    args.push("--compose-file", composeFile);
  }
  nodeScript("scripts/deployment-backup.mjs", args, options);
}

async function loadImages(options) {
  if (!options.imageArchive) return;
  nodeScript("scripts/deployment-images.mjs", ["load", "--archive", options.imageArchive], options);
}

async function composeUp(options, resolved) {
  const args = ["up", "-d", "--remove-orphans"];
  if (!options.noBuild) args.push("--build");
  run("docker", composeArgs(resolved.composeFiles, resolved.envFile, args.shift(), args), options);
}

async function smoke(options, resolved) {
  if (options.skipSmoke) return;
  nodeScript("scripts/post-deploy-smoke.mjs", ["--profile", options.profile, "--base-url", resolved.baseUrl], options);
}

async function status(options, resolved) {
  run("docker", composeArgs(resolved.composeFiles, resolved.envFile, "ps"), options);
}

async function install(options, resolved) {
  await preflight(options, resolved);
  await loadImages(options);
  await composeUp(options, resolved);
  await smoke(options, resolved);
}

async function upgrade(options, resolved) {
  await backup(options, resolved);
  await preflight(options, resolved);
  await loadImages(options);
  await composeUp(options, resolved);
  await smoke(options, resolved);
}

async function rollback(options, resolved) {
  await loadImages(options);
  await composeUp({ ...options, noBuild: true }, resolved);
  await restore(options, resolved);
  await composeUp({ ...options, noBuild: true }, resolved);
  await smoke(options, resolved);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help || !options.command) {
    process.stdout.write(HELP);
    return;
  }
  const resolved = await resolveProfileOptions(options);
  if (options.command === "install") {
    await install(options, resolved);
    return;
  }
  if (options.command === "upgrade") {
    await upgrade(options, resolved);
    return;
  }
  if (options.command === "rollback") {
    await rollback(options, resolved);
    return;
  }
  if (options.command === "status") {
    await status(options, resolved);
    return;
  }
  throw new Error(`Unknown command: ${options.command}`);
}

main().catch((error) => {
  console.error(`Deployment rollout failed: ${error.message}`);
  console.error("");
  console.error(HELP.trimEnd());
  process.exit(1);
});
