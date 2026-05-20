#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const VALID_PROFILES = new Set(["local", "private-cloud", "saas"]);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROFILE_DEFAULTS = {
  local: {
    envFile: "deploy/profiles/local.env.example",
    composeFiles: ["docker-compose.yml"],
    port: 8787,
    warnings: ["OPENAI_API_KEY", "JWT_SECRET", "ADMIN_EMAIL", "ADMIN_PASSWORD"]
  },
  "private-cloud": {
    envFile: "deploy/profiles/private-cloud.env.example",
    composeFiles: ["docker-compose.private-cloud.yml"],
    port: 8787,
    warnings: ["OPENAI_API_KEY", "JWT_SECRET", "ADMIN_EMAIL", "ADMIN_PASSWORD"]
  },
  saas: {
    envFile: "deploy/profiles/saas.env.example",
    composeFiles: ["docker-compose.server.yml", "docker-compose.bluegreen.yml", "docker-compose.server-bluegreen.yml"],
    port: 8787,
    warnings: ["OPENAI_API_KEY", "JWT_SECRET", "ADMIN_EMAIL", "ADMIN_PASSWORD", "OSS_ACCESS_KEY_ID", "OSS_ACCESS_KEY_SECRET"]
  }
};

const HELP = `Usage:
  node scripts/deployment-preflight.mjs --profile <local|private-cloud|saas> [--env-file <path>] [--compose-file <path>] [--strict]

Options:
  --profile, --edition <profile>  Deployment profile to check.
  --env-file <path>               Env file to inspect. Defaults to .env when present, otherwise the profile template.
  --compose-file <path>           Compose file to validate. Can be repeated.
  --strict                        Treat warnings as failures.
  --help, -h                      Show this help.

Examples:
  node scripts/deployment-preflight.mjs --profile local --env-file .env
  node scripts/deployment-preflight.mjs --profile private-cloud --compose-file docker-compose.private-cloud.yml --strict
`;

function parseArgs(argv) {
  if (argv[0] === "--") {
    argv = argv.slice(1);
  }
  const options = {
    composeFiles: [],
    strict: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--strict") {
      options.strict = true;
      continue;
    }
    if (arg.startsWith("--profile=") || arg.startsWith("--edition=")) {
      options.profile = arg.slice(arg.indexOf("=") + 1);
      continue;
    }
    if (arg === "--profile" || arg === "--edition") {
      options.profile = readNextValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg.startsWith("--env-file=")) {
      options.envFile = arg.slice("--env-file=".length);
      continue;
    }
    if (arg === "--env-file") {
      options.envFile = readNextValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg.startsWith("--compose-file=")) {
      options.composeFiles.push(arg.slice("--compose-file=".length));
      continue;
    }
    if (arg === "--compose-file") {
      options.composeFiles.push(readNextValue(argv, index, arg));
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

function commandExists(command, args = ["--version"]) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  return result.status === 0 || result.status === 1;
}

function runComposeConfig(composeFile, envFile) {
  const args = ["compose", "-f", composeFile];
  if (envFile) {
    args.push("--env-file", envFile);
  }
  args.push("config", "--quiet");
  return spawnSync("docker", args, { cwd: REPO_ROOT, encoding: "utf8" });
}

function checkPortAvailable(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });
}

function diskFreeKb(target = REPO_ROOT) {
  const result = spawnSync("df", ["-Pk", target], { encoding: "utf8" });
  if (result.status !== 0) return null;
  const lines = result.stdout.trim().split(/\r?\n/u);
  const fields = lines.at(-1)?.trim().split(/\s+/u);
  const available = Number(fields?.[3]);
  return Number.isFinite(available) ? available : null;
}

function logResult(kind, message) {
  const prefix = kind === "ok" ? "OK" : kind === "warn" ? "WARN" : "ERROR";
  console.log(`${prefix} ${message}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(HELP);
    return;
  }
  if (!VALID_PROFILES.has(options.profile)) {
    throw new Error(`Missing or invalid --profile. Expected one of: ${[...VALID_PROFILES].join(", ")}`);
  }

  const profile = options.profile;
  const defaults = PROFILE_DEFAULTS[profile];
  const envFile = resolveRepoPath(options.envFile || ((await fileExists(resolveRepoPath(".env"))) ? ".env" : defaults.envFile));
  const composeFiles = (options.composeFiles.length > 0 ? options.composeFiles : defaults.composeFiles).map(resolveRepoPath);
  const errors = [];
  const warnings = [];

  if (await fileExists(envFile)) {
    logResult("ok", `env file found: ${path.relative(REPO_ROOT, envFile)}`);
  } else {
    errors.push(`env file not found: ${envFile}`);
  }

  const env = (await fileExists(envFile)) ? parseEnv(await readFile(envFile, "utf8")) : new Map();
  const envProfile = env.get("DEPLOYMENT_PROFILE");
  if (envProfile && envProfile !== profile) {
    errors.push(`DEPLOYMENT_PROFILE is "${envProfile}", expected "${profile}"`);
  }

  for (const key of defaults.warnings) {
    if (!env.get(key)) {
      warnings.push(`${key} is empty in ${path.relative(REPO_ROOT, envFile)}`);
    }
  }

  const port = Number(env.get("PORT") || defaults.port);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    errors.push(`PORT is invalid: ${String(env.get("PORT"))}`);
  } else if (await checkPortAvailable(port)) {
    logResult("ok", `port ${port} is available on 127.0.0.1`);
  } else {
    warnings.push(`port ${port} is already in use on 127.0.0.1`);
  }

  for (const composeFile of composeFiles) {
    if (await fileExists(composeFile)) {
      logResult("ok", `compose file found: ${path.relative(REPO_ROOT, composeFile)}`);
    } else {
      errors.push(`compose file not found: ${composeFile}`);
    }
  }

  if (commandExists("docker")) {
    logResult("ok", "docker CLI is available");
    for (const composeFile of composeFiles) {
      if (!(await fileExists(composeFile))) continue;
      const result = runComposeConfig(composeFile, await fileExists(envFile) ? envFile : undefined);
      if (result.status === 0) {
        logResult("ok", `docker compose config: ${path.relative(REPO_ROOT, composeFile)}`);
      } else {
        warnings.push(`docker compose config failed for ${path.relative(REPO_ROOT, composeFile)}: ${(result.stderr || result.stdout).trim()}`);
      }
    }
  } else {
    warnings.push("docker CLI is not available; compose validation skipped");
  }

  const freeKb = diskFreeKb();
  if (freeKb === null) {
    warnings.push("disk free check skipped; df is unavailable");
  } else if (freeKb < 10 * 1024 * 1024) {
    warnings.push(`available disk space is below 10GB: ${Math.round(freeKb / 1024)}MB`);
  } else {
    logResult("ok", `available disk space: ${Math.round(freeKb / 1024)}MB`);
  }

  for (const warning of warnings) logResult("warn", warning);
  for (const error of errors) logResult("error", error);

  if (errors.length > 0 || (options.strict && warnings.length > 0)) {
    process.exit(1);
  }
  console.log(`Preflight complete for ${profile}: ${warnings.length} warning(s), ${errors.length} error(s)`);
}

main().catch((error) => {
  console.error(`Deployment preflight failed: ${error.message}`);
  console.error("");
  console.error(HELP.trimEnd());
  process.exit(1);
});
