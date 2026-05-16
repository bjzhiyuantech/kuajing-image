import { decryptSecret, encryptSecret } from "./auth-crypto.js";
import { getSystemSetting, saveSystemSetting } from "./system-settings.js";

export const DEFAULT_ARK_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";
export const DEFAULT_SEEDANCE_MODEL = "doubao-seedance-2-0-fast-260128";

const SETTING_KEY = "video.seedance";
const API_KEY_ENV_NAMES = ["ARK_API_KEY", "VOLCENGINE_ARK_API_KEY", "ARK_API_TOKEN", "SEEDANCE_API_KEY"] as const;

type SeedanceConfigSource = "saved" | "env" | "default";

export interface SeedanceVideoConfigResponse {
  apiKeySaved: boolean;
  baseUrl: string;
  model: string;
  source: SeedanceConfigSource;
}

export interface SaveSeedanceVideoConfigRequest {
  apiKey?: string;
  preserveApiKey?: boolean;
  baseUrl?: string;
  model?: string;
}

export interface ResolvedSeedanceVideoConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  source: SeedanceConfigSource;
}

interface StoredSeedanceVideoConfig {
  version: 1;
  encryptedApiKey: string;
  baseUrl: string;
  model: string;
}

export async function getSeedanceVideoConfig(): Promise<SeedanceVideoConfigResponse> {
  const resolved = await resolveSeedanceVideoConfig();
  return {
    apiKeySaved: Boolean(resolved.apiKey),
    baseUrl: resolved.baseUrl,
    model: resolved.model,
    source: resolved.source
  };
}

export async function saveSeedanceVideoConfig(input: SaveSeedanceVideoConfigRequest): Promise<SeedanceVideoConfigResponse> {
  const previous = await resolveSeedanceVideoConfig();
  const apiKey = input.apiKey?.trim() || (input.preserveApiKey ? previous.apiKey : "");
  const config = normalizeSeedanceVideoConfig({
    apiKey,
    baseUrl: input.baseUrl,
    model: input.model,
    source: "saved"
  });
  const stored: StoredSeedanceVideoConfig = {
    version: 1,
    encryptedApiKey: encryptSecret(config.apiKey),
    baseUrl: config.baseUrl,
    model: config.model
  };
  await saveSystemSetting(SETTING_KEY, stored);
  return getSeedanceVideoConfig();
}

export async function resolveSeedanceVideoConfig(): Promise<ResolvedSeedanceVideoConfig> {
  const row = await getSystemSetting(SETTING_KEY);
  const stored = parseStoredConfig(row?.valueJson);
  if (stored) {
    return stored;
  }

  const envConfig = envFallbackConfig();
  if (envConfig.apiKey || process.env.SEEDANCE_MODEL?.trim() || process.env.ARK_BASE_URL?.trim() || process.env.SEEDANCE_BASE_URL?.trim()) {
    return envConfig;
  }

  return normalizeSeedanceVideoConfig({
    apiKey: "",
    baseUrl: DEFAULT_ARK_BASE_URL,
    model: DEFAULT_SEEDANCE_MODEL,
    source: "default"
  });
}

function parseStoredConfig(valueJson: string | undefined): ResolvedSeedanceVideoConfig | undefined {
  if (!valueJson) {
    return undefined;
  }

  try {
    const body = JSON.parse(valueJson) as Partial<StoredSeedanceVideoConfig>;
    if (!body || typeof body !== "object") {
      return undefined;
    }
    return normalizeSeedanceVideoConfig({
      apiKey: decryptSecret(body.encryptedApiKey),
      baseUrl: body.baseUrl,
      model: body.model,
      source: "saved"
    });
  } catch {
    return undefined;
  }
}

function envFallbackConfig(): ResolvedSeedanceVideoConfig {
  return normalizeSeedanceVideoConfig({
    apiKey: resolveEnvApiKey(),
    baseUrl: process.env.ARK_BASE_URL || process.env.SEEDANCE_BASE_URL || DEFAULT_ARK_BASE_URL,
    model: process.env.SEEDANCE_MODEL || DEFAULT_SEEDANCE_MODEL,
    source: "env"
  });
}

function resolveEnvApiKey(): string {
  for (const envName of API_KEY_ENV_NAMES) {
    const value = process.env[envName]?.trim();
    if (value) {
      return value;
    }
  }
  return "";
}

function normalizeSeedanceVideoConfig(input: Partial<ResolvedSeedanceVideoConfig>): ResolvedSeedanceVideoConfig {
  return {
    apiKey: stringValue(input.apiKey),
    baseUrl: normalizeBaseUrl(input.baseUrl),
    model: stringValue(input.model) || DEFAULT_SEEDANCE_MODEL,
    source: input.source === "saved" || input.source === "env" ? input.source : "default"
  };
}

function normalizeBaseUrl(value: unknown): string {
  return (stringValue(value) || DEFAULT_ARK_BASE_URL).replace(/\/+$/u, "");
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
