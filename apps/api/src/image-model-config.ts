import { randomUUID } from "node:crypto";
import { decryptSecret, encryptSecret } from "./auth-crypto.js";
import { IMAGE_MODEL } from "./contracts.js";
import { getSystemSetting, saveSystemSetting } from "./system-settings.js";

export type ImageModelProvider = "openai-compatible" | "gemini";
export type ImageModelRole = "primary" | "fallback";

export interface ImageModelConfigEntry {
  id: string;
  name: string;
  provider: ImageModelProvider;
  enabled: boolean;
  role: ImageModelRole;
  priority: number;
  apiKey: string;
  baseUrl?: string;
  model: string;
  timeoutMs: number;
}

export interface ImageModelConfigResponseEntry extends Omit<ImageModelConfigEntry, "apiKey"> {
  apiKeySaved: boolean;
}

export interface SaveImageModelConfigEntry {
  id?: string;
  name: string;
  provider: ImageModelProvider;
  enabled: boolean;
  role: ImageModelRole;
  priority?: number;
  apiKey?: string;
  preserveApiKey?: boolean;
  baseUrl?: string;
  model: string;
  timeoutMs?: number;
}

export interface SaveImageModelConfigRequest {
  models: SaveImageModelConfigEntry[];
}

const SETTING_KEY = "image.models";
const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000;
const GEMINI_IMAGE_MODEL = "gemini-3-pro-image-preview";

interface StoredImageModelConfigEntry extends Omit<ImageModelConfigEntry, "apiKey"> {
  encryptedApiKey: string;
}

interface StoredImageModelConfig {
  version: 1;
  models: StoredImageModelConfigEntry[];
}

export async function getImageModelConfig(): Promise<{ models: ImageModelConfigResponseEntry[] }> {
  const models = await getResolvedImageModelConfigs();
  return {
    models: models.map(({ apiKey, ...model }) => ({
      ...model,
      apiKeySaved: Boolean(apiKey)
    }))
  };
}

export async function saveImageModelConfig(input: SaveImageModelConfigRequest): Promise<{ models: ImageModelConfigResponseEntry[] }> {
  const existing = await getResolvedImageModelConfigs();
  const existingById = new Map(existing.map((model) => [model.id, model]));
  const nowModels = input.models.map((model, index) => {
    const id = normalizeId(model.id) || randomUUID();
    const previous = existingById.get(id);
    const apiKey = model.apiKey?.trim() || (model.preserveApiKey ? previous?.apiKey ?? "" : "");
    return normalizeModelConfig({
      id,
      name: model.name,
      provider: model.provider,
      enabled: model.enabled,
      role: model.role,
      priority: model.priority ?? index + 1,
      apiKey,
      baseUrl: model.baseUrl,
      model: model.model,
      timeoutMs: model.timeoutMs ?? previous?.timeoutMs ?? DEFAULT_TIMEOUT_MS
    });
  });

  const stored: StoredImageModelConfig = {
    version: 1,
    models: nowModels.map(({ apiKey, ...model }) => ({
      ...model,
      encryptedApiKey: encryptSecret(apiKey)
    }))
  };
  await saveSystemSetting(SETTING_KEY, stored);
  return getImageModelConfig();
}

export async function getActiveImageModelConfigs(): Promise<ImageModelConfigEntry[]> {
  return (await getResolvedImageModelConfigs())
    .filter((model) => model.enabled && model.apiKey)
    .sort((left, right) => {
      if (left.role !== right.role) {
        return left.role === "primary" ? -1 : 1;
      }
      return left.priority - right.priority;
    });
}

export async function getActiveImageModelConfigsForRequest(modelConfigId?: string): Promise<ImageModelConfigEntry[]> {
  const models = await getActiveImageModelConfigs();
  const requestedId = modelConfigId?.trim();
  if (!requestedId) {
    return models;
  }

  return models.filter((model) => model.id === requestedId);
}

export async function getConfiguredImageModelNames(): Promise<string[]> {
  const names = (await getResolvedImageModelConfigs()).filter((model) => model.enabled).map((model) => model.model);
  return names.length > 0 ? Array.from(new Set(names)) : [IMAGE_MODEL];
}

async function getResolvedImageModelConfigs(): Promise<ImageModelConfigEntry[]> {
  const setting = await getSystemSetting(SETTING_KEY);
  const stored = parseStoredConfig(setting?.valueJson);
  if (stored.length > 0) {
    return stored;
  }

  return envFallbackModels();
}

function parseStoredConfig(valueJson: string | undefined): ImageModelConfigEntry[] {
  if (!valueJson) {
    return [];
  }

  try {
    const body = JSON.parse(valueJson) as Partial<StoredImageModelConfig>;
    if (!Array.isArray(body.models)) {
      return [];
    }
    return body.models.map((model, index) =>
      normalizeModelConfig({
        id: normalizeId(model.id) || randomUUID(),
        name: model.name,
        provider: model.provider,
        enabled: model.enabled,
        role: model.role,
        priority: model.priority ?? index + 1,
        apiKey: decryptSecret(model.encryptedApiKey),
        baseUrl: model.baseUrl,
        model: model.model,
        timeoutMs: model.timeoutMs
      })
    );
  } catch {
    return [];
  }
}

function envFallbackModels(): ImageModelConfigEntry[] {
  const models: ImageModelConfigEntry[] = [];
  const openAiKey = process.env.OPENAI_API_KEY?.trim();
  if (openAiKey) {
    models.push(
      normalizeModelConfig({
        id: "env-openai",
        name: "OpenAI Image",
        provider: "openai-compatible",
        enabled: true,
        role: "primary",
        priority: 1,
        apiKey: openAiKey,
        baseUrl: process.env.OPENAI_BASE_URL,
        model: process.env.OPENAI_IMAGE_MODEL || IMAGE_MODEL,
        timeoutMs: parsePositiveInteger(process.env.OPENAI_IMAGE_TIMEOUT_MS, DEFAULT_TIMEOUT_MS)
      })
    );
  }

  const geminiKey = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim();
  if (geminiKey) {
    models.push(
      normalizeModelConfig({
        id: "env-gemini-nano-banana",
        name: "Gemini Nano Banana",
        provider: "gemini",
        enabled: true,
        role: models.length > 0 ? "fallback" : "primary",
        priority: models.length + 1,
        apiKey: geminiKey,
        model: process.env.GEMINI_IMAGE_MODEL || GEMINI_IMAGE_MODEL,
        timeoutMs: parsePositiveInteger(process.env.GEMINI_IMAGE_TIMEOUT_MS, DEFAULT_TIMEOUT_MS)
      })
    );
  }

  return models;
}

function normalizeModelConfig(input: Partial<ImageModelConfigEntry>): ImageModelConfigEntry {
  const provider = input.provider === "gemini" ? "gemini" : "openai-compatible";
  const role = input.role === "fallback" ? "fallback" : "primary";
  const fallbackName = provider === "gemini" ? "Gemini Nano Banana" : "OpenAI Image";
  return {
    id: normalizeId(input.id) || randomUUID(),
    name: stringValue(input.name) || fallbackName,
    provider,
    enabled: Boolean(input.enabled),
    role,
    priority: Number.isInteger(input.priority) && Number(input.priority) > 0 ? Number(input.priority) : 1,
    apiKey: stringValue(input.apiKey),
    baseUrl: stringValue(input.baseUrl) || undefined,
    model: stringValue(input.model) || (provider === "gemini" ? GEMINI_IMAGE_MODEL : IMAGE_MODEL),
    timeoutMs: parsePositiveInteger(input.timeoutMs, DEFAULT_TIMEOUT_MS)
  };
}

function normalizeId(value: unknown): string {
  return stringValue(value).slice(0, 64);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parsePositiveInteger(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
