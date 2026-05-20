#!/usr/bin/env node

const VALID_PROFILES = new Set(["local", "private-cloud", "saas"]);
const DEFAULT_BASE_URL = "http://127.0.0.1:8787";
const DEFAULT_TIMEOUT_MS = 10_000;

const HELP = `Usage:
  node scripts/check-deployment-profile.mjs --profile <local|private-cloud|saas> [--base-url <url>]

Options:
  --profile, --edition <profile>  Expected deployment edition.
  --base-url, --api-base-url <url> API origin. Defaults to API_BASE_URL or ${DEFAULT_BASE_URL}.
  --timeout-ms <ms>              Request timeout in milliseconds. Defaults to ${DEFAULT_TIMEOUT_MS}.
  --help, -h                     Show this help.

Examples:
  node scripts/check-deployment-profile.mjs --profile local --base-url http://127.0.0.1:8787
  API_BASE_URL=https://ai.example.com node scripts/check-deployment-profile.mjs --profile saas
`;

function parseArgs(argv) {
  if (argv[0] === "--") {
    argv = argv.slice(1);
  }
  const options = {
    baseUrl: process.env.API_BASE_URL || process.env.PUBLIC_API_BASE_URL || DEFAULT_BASE_URL,
    timeoutMs: DEFAULT_TIMEOUT_MS
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
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

    if (arg.startsWith("--base-url=") || arg.startsWith("--api-base-url=")) {
      options.baseUrl = arg.slice(arg.indexOf("=") + 1);
      continue;
    }

    if (arg === "--base-url" || arg === "--api-base-url") {
      options.baseUrl = readNextValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--timeout-ms=")) {
      options.timeoutMs = parseTimeoutMs(arg.slice("--timeout-ms=".length));
      continue;
    }

    if (arg === "--timeout-ms") {
      options.timeoutMs = parseTimeoutMs(readNextValue(argv, index, arg));
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

function parseTimeoutMs(value) {
  const timeoutMs = Number(value);
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error(`Invalid --timeout-ms value: ${value}`);
  }
  return timeoutMs;
}

function normalizeBaseUrl(rawBaseUrl) {
  const value = rawBaseUrl?.trim();
  if (!value) {
    throw new Error("Missing API base URL");
  }

  try {
    const url = new URL(value);
    url.pathname = url.pathname.replace(/\/+$/u, "");
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/u, "");
  } catch {
    throw new Error(`Invalid API base URL: ${rawBaseUrl}`);
  }
}

function endpointUrl(baseUrl, path) {
  return `${baseUrl}${path}`;
}

async function fetchJson(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`${url} returned HTTP ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("application/json")) {
      throw new Error(`${url} returned non-JSON content-type: ${contentType || "unknown"}`);
    }

    return await response.json();
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`${url} timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function assertHealthPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("/api/health returned an invalid JSON object");
  }
}

function assertDeploymentProfilePayload(payload, expectedProfile) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("/api/deployment-profile returned an invalid JSON object");
  }

  if (payload.edition !== expectedProfile) {
    throw new Error(`Expected edition "${expectedProfile}", received "${String(payload.edition)}"`);
  }

  if (!payload.capabilities || typeof payload.capabilities !== "object" || Array.isArray(payload.capabilities)) {
    throw new Error('/api/deployment-profile is missing object field "capabilities"');
  }
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

  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const health = await fetchJson(endpointUrl(baseUrl, "/api/health"), options.timeoutMs);
  assertHealthPayload(health);

  const deploymentProfile = await fetchJson(endpointUrl(baseUrl, "/api/deployment-profile"), options.timeoutMs);
  assertDeploymentProfilePayload(deploymentProfile, options.profile);

  console.log(`OK ${options.profile}: ${baseUrl}`);
  console.log(`edition=${deploymentProfile.edition} target=${deploymentProfile.target ?? "unknown"} name=${deploymentProfile.name ?? ""}`);
}

main().catch((error) => {
  console.error(`Deployment profile check failed: ${error.message}`);
  console.error("");
  console.error(HELP.trimEnd());
  process.exit(1);
});
