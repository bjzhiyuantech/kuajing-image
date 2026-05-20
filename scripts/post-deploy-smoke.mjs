#!/usr/bin/env node

const VALID_PROFILES = new Set(["local", "private-cloud", "saas"]);
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_BASE_URL = "http://127.0.0.1:8787";

const HELP = `Usage:
  node scripts/post-deploy-smoke.mjs --profile <local|private-cloud|saas> [--base-url <url>]

Options:
  --profile, --edition <profile>  Expected deployment profile.
  --base-url, --api-base-url <url> API/Web origin. Defaults to API_BASE_URL or ${DEFAULT_BASE_URL}.
  --timeout-ms <ms>               Request timeout in milliseconds. Defaults to ${DEFAULT_TIMEOUT_MS}.
  --help, -h                      Show this help.

Examples:
  node scripts/post-deploy-smoke.mjs --profile local --base-url http://127.0.0.1:8787
  API_BASE_URL=https://ai.example.com node scripts/post-deploy-smoke.mjs --profile saas
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
  if (!value) throw new Error("Missing base URL");
  const url = new URL(value);
  url.pathname = url.pathname.replace(/\/+$/u, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/u, "");
}

function endpointUrl(baseUrl, path) {
  return `${baseUrl}${path}`;
}

async function fetchWithTimeout(url, timeoutMs, headers = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      headers,
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`${url} timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function checkJson(name, url, timeoutMs, validate) {
  const response = await fetchWithTimeout(url, timeoutMs, { accept: "application/json" });
  if (!response.ok) throw new Error(`${name} returned HTTP ${response.status}`);
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error(`${name} returned non-JSON content-type: ${contentType || "unknown"}`);
  }
  const payload = await response.json();
  validate(payload);
  console.log(`OK ${name}`);
  return payload;
}

async function checkText(name, url, timeoutMs, expectedText) {
  const response = await fetchWithTimeout(url, timeoutMs, { accept: "text/html,*/*" });
  if (!response.ok) throw new Error(`${name} returned HTTP ${response.status}`);
  const body = await response.text();
  if (expectedText && !body.includes(expectedText)) {
    throw new Error(`${name} did not include expected marker: ${expectedText}`);
  }
  console.log(`OK ${name}`);
}

function assertObject(payload, endpoint) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(`${endpoint} returned an invalid JSON object`);
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
  await checkJson("health", endpointUrl(baseUrl, "/api/health"), options.timeoutMs, (payload) => {
    assertObject(payload, "/api/health");
  });
  await checkJson("deployment-profile", endpointUrl(baseUrl, "/api/deployment-profile"), options.timeoutMs, (payload) => {
    assertObject(payload, "/api/deployment-profile");
    if (payload.edition !== options.profile) {
      throw new Error(`expected edition ${options.profile}, received ${String(payload.edition)}`);
    }
    assertObject(payload.capabilities, "/api/deployment-profile capabilities");
  });
  await checkJson("config", endpointUrl(baseUrl, "/api/config"), options.timeoutMs, (payload) => {
    assertObject(payload, "/api/config");
    assertObject(payload.deployment, "/api/config deployment");
  });
  await checkText("web shell", endpointUrl(baseUrl, "/"), options.timeoutMs, "root");

  if (options.profile === "saas") {
    await checkJson("extension release", endpointUrl(baseUrl, "/api/extension-release"), options.timeoutMs, (payload) => {
      assertObject(payload, "/api/extension-release");
    });
    await checkJson("app release", endpointUrl(baseUrl, "/api/app-release"), options.timeoutMs, (payload) => {
      assertObject(payload, "/api/app-release");
    });
  }

  console.log(`Post-deploy smoke passed for ${options.profile}: ${baseUrl}`);
}

main().catch((error) => {
  console.error(`Post-deploy smoke failed: ${error.message}`);
  console.error("");
  console.error(HELP.trimEnd());
  process.exit(1);
});
