import { randomUUID } from "node:crypto";
import { decryptSecret, encryptSecret } from "./auth-crypto.js";
import { ProviderError } from "./image-provider.js";
import type {
  CategoryKitPlannerConfigEntry,
  CategoryKitPlannerConfigResponse,
  CategoryKitPlannerModelRole,
  EcommerceCategoryKitPlanItem,
  EcommerceCategoryKitPlanRequest,
  EcommerceCategoryKitPlanResponse,
  SaveCategoryKitPlannerConfigRequest
} from "./contracts.js";
import { getSystemSetting, saveSystemSetting } from "./system-settings.js";

const SETTING_KEY = "ecommerce.categoryKitPlanner";
const DEFAULT_MODEL = "gpt-5.5";
const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000;

interface StoredCategoryKitPlannerConfigEntry extends Omit<CategoryKitPlannerConfigEntry, "apiKeySaved"> {
  encryptedApiKey: string;
}

interface StoredCategoryKitPlannerConfig {
  version: 2;
  models: StoredCategoryKitPlannerConfigEntry[];
}

interface ResolvedCategoryKitPlannerConfigEntry extends Omit<CategoryKitPlannerConfigEntry, "apiKeySaved"> {
  apiKey: string;
}

interface ResolvedCategoryKitPlannerConfigs {
  source: "saved" | "default";
  models: ResolvedCategoryKitPlannerConfigEntry[];
}

interface CategoryKitPlannerDebugContext {
  jobId?: string;
}

function logCategoryKitPlanner(event: string, details: Record<string, unknown>): void {
  console.info(`[category-kit-planner] ${event} ${JSON.stringify(details)}`);
}

export async function getCategoryKitPlannerConfig(): Promise<CategoryKitPlannerConfigResponse> {
  const resolved = await resolveCategoryKitPlannerConfigs();
  return {
    models: resolved.models.map(({ apiKey, ...model }) => ({
      ...model,
      apiKeySaved: Boolean(apiKey)
    })),
    source: resolved.source
  };
}

export async function saveCategoryKitPlannerConfig(
  input: SaveCategoryKitPlannerConfigRequest
): Promise<CategoryKitPlannerConfigResponse> {
  const existing = await resolveCategoryKitPlannerConfigs();
  const existingById = new Map(existing.models.map((model) => [model.id, model]));
  const models = input.models.map((model, index) => {
    const id = normalizeId(model.id) || randomUUID();
    const previous = existingById.get(id);
    const apiKey = model.apiKey?.trim() || (model.preserveApiKey ? previous?.apiKey ?? "" : "");
    return normalizeCategoryKitPlannerConfig({
      id,
      enabled: model.enabled,
      name: model.name,
      role: model.role,
      priority: model.priority ?? index + 1,
      apiKey,
      baseUrl: model.baseUrl,
      model: model.model,
      timeoutMs: model.timeoutMs ?? previous?.timeoutMs ?? DEFAULT_TIMEOUT_MS
    });
  });
  const config: StoredCategoryKitPlannerConfig = {
    version: 2,
    models: sortCategoryKitPlannerConfigs(models).map(({ apiKey, ...model }) => ({
      ...model,
      encryptedApiKey: encryptApiKey(apiKey)
    }))
  };
  await saveSystemSetting(SETTING_KEY, config);
  return getCategoryKitPlannerConfig();
}

export async function generateCategoryKitPlan(
  input: EcommerceCategoryKitPlanRequest,
  debug?: CategoryKitPlannerDebugContext
): Promise<EcommerceCategoryKitPlanResponse> {
  const configs = await resolveCategoryKitPlannerConfigs();
  logCategoryKitPlanner("config", {
    jobId: debug?.jobId,
    source: configs.source,
    modelCount: configs.models.length,
    models: configs.models.map((model) => ({
      id: model.id,
      name: model.name,
      role: model.role,
      priority: model.priority,
      enabled: model.enabled,
      baseUrl: model.baseUrl || "https://api.openai.com/v1",
      model: model.model,
      timeoutMs: model.timeoutMs,
      hasApiKey: Boolean(model.apiKey)
    }))
  });
  const activeConfigs = sortCategoryKitPlannerConfigs(configs.models).filter((model) => model.enabled && Boolean(model.apiKey));
  if (activeConfigs.length === 0) {
    logCategoryKitPlanner("blocked", {
      jobId: debug?.jobId,
      reason: "no_active_models"
    });
    throw new ProviderError("missing_api_key", "后台未配置可用的品类套图文本模型，请先在管理后台保存并启用至少一个模型。", 503);
  }

  const errors: string[] = [];
  for (const [index, config] of activeConfigs.entries()) {
    try {
      return await runCategoryKitPlannerAttempt(config, input, debug, index + 1, activeConfigs.length);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${config.name} (${config.model}): ${message}`);
      logCategoryKitPlanner("attempt-failed", {
        jobId: debug?.jobId,
        attempt: index + 1,
        attemptCount: activeConfigs.length,
        name: config.name,
        role: config.role,
        priority: config.priority,
        model: config.model,
        message
      });
    }
  }

  throw new ProviderError(
    "upstream_failure",
    `文本模型规划失败，已尝试 ${activeConfigs.length} 个模型：${errors.join("；")}`,
    502
  );
}

async function resolveCategoryKitPlannerConfigs(): Promise<ResolvedCategoryKitPlannerConfigs> {
  const row = await getSystemSetting(SETTING_KEY);
  const stored = parseStoredConfig(row?.valueJson);
  if (stored) {
    return {
      source: "saved",
      models: stored
    };
  }
  if (row?.valueJson) {
    console.warn(
      `[category-kit-planner] invalid stored config ${JSON.stringify({
        settingKey: SETTING_KEY,
        rawLength: row.valueJson.length
      })}`
    );
  }

  return {
    source: "default",
    models: [
    normalizeCategoryKitPlannerConfig({
      id: "default-category-kit-planner-primary",
      enabled: true,
      name: "品类套图共享文本模型",
      role: "primary",
      priority: 1,
      apiKey: "",
      baseUrl: "https://api.openai.com/v1",
      model: DEFAULT_MODEL,
      timeoutMs: DEFAULT_TIMEOUT_MS
    })
    ]
  };
}

function parseStoredConfig(valueJson: string | undefined): ResolvedCategoryKitPlannerConfigEntry[] | undefined {
  if (!valueJson) {
    return undefined;
  }

  try {
    const body = JSON.parse(valueJson) as Record<string, unknown>;
    const rawModels = Array.isArray(body.models)
      ? body.models
      : body.config
        ? [body.config]
        : body.model || body.encryptedApiKey || body.baseUrl
          ? [body]
          : [];
    const models = rawModels.flatMap((item, index) => {
      const value = asRecord(item);
      const encryptedApiKey = typeof value.encryptedApiKey === "string" ? value.encryptedApiKey : undefined;
      const apiKey = decryptApiKey(encryptedApiKey);
      return [
        normalizeCategoryKitPlannerConfig({
          id: normalizeId(value.id) || `stored-category-kit-planner-${index + 1}`,
          enabled: value.enabled !== false,
          name: normalizeName(value.name),
          role: normalizeRole(value.role, index),
          priority: parsePositiveInteger(value.priority, index + 1),
          apiKey,
          baseUrl: normalizeBaseUrl(value.baseUrl),
          model: normalizeName(value.model),
          timeoutMs: parsePositiveInteger(value.timeoutMs, DEFAULT_TIMEOUT_MS)
        })
      ];
    });

    return models.length > 0 ? sortCategoryKitPlannerConfigs(models) : undefined;
  } catch {
    return undefined;
  }
}

function runCategoryKitPlannerAttempt(
  config: ResolvedCategoryKitPlannerConfigEntry,
  input: EcommerceCategoryKitPlanRequest,
  debug: CategoryKitPlannerDebugContext | undefined,
  attempt: number,
  attemptCount: number
): Promise<EcommerceCategoryKitPlanResponse> {
  const baseUrl = normalizeBaseUrl(config.baseUrl) || "https://api.openai.com/v1";
  const startedAt = Date.now();
  let failureLogged = false;
  logCategoryKitPlanner("request-start", {
    jobId: debug?.jobId,
    attempt,
    attemptCount,
    name: config.name,
    id: config.id,
    role: config.role,
    priority: config.priority,
    baseUrl,
    model: config.model,
    timeoutMs: config.timeoutMs,
    platform: input.platform,
    market: input.market,
    textLanguage: input.textLanguage || "none",
    productTitle: input.product.title || "",
    hasReferenceImage: Boolean(input.referenceImage)
  });

  return fetch(`${baseUrl}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: config.model,
      store: false,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: composePlannerPrompt(input)
            },
            {
              type: "input_image",
              image_url: input.referenceImage.dataUrl,
              detail: "auto"
            }
          ]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "ecommerce_category_kit_plan",
          strict: true,
          schema: categoryKitPlanSchema()
        }
      }
    }),
    signal: AbortSignal.timeout(config.timeoutMs)
  })
    .then(async (response) => {
      const responseText = await response.text();
      const body = parseJsonMaybe(responseText);
      if (!response.ok) {
        const message = responseErrorMessage(body) || `文本模型规划失败：HTTP ${response.status}`;
        failureLogged = true;
        logCategoryKitPlanner("request-upstream-error", {
          jobId: debug?.jobId,
          attempt,
          attemptCount,
          name: config.name,
          id: config.id,
          role: config.role,
          priority: config.priority,
          durationMs: Date.now() - startedAt,
          status: response.status,
          statusText: response.statusText,
          contentType: response.headers.get("content-type"),
          requestId: response.headers.get("x-request-id") || response.headers.get("request-id"),
          bodySnippet: responseText.slice(0, 1000),
          message
        });
        throw new ProviderError("upstream_failure", message, response.status >= 400 ? response.status : 502);
      }

      try {
        const result = parseCategoryKitPlanResponse(responseTextFromBody(body), config.model);
        logCategoryKitPlanner("request-success", {
          jobId: debug?.jobId,
          attempt,
          attemptCount,
          name: config.name,
          id: config.id,
          role: config.role,
          priority: config.priority,
          durationMs: Date.now() - startedAt,
          imageCount: result.imagePlan.length,
          model: result.model
        });
        return result;
      } catch (error) {
        failureLogged = true;
        logCategoryKitPlanner("request-parse-error", {
          jobId: debug?.jobId,
          attempt,
          attemptCount,
          name: config.name,
          id: config.id,
          role: config.role,
          priority: config.priority,
          durationMs: Date.now() - startedAt,
          message: error instanceof Error ? error.message : String(error),
          responseLength: responseText.length,
          responseSnippet: responseText.slice(0, 2000),
          parsedType: Array.isArray(body) ? "array" : typeof body,
          parsedKeys: asRecord(body) ? Object.keys(asRecord(body)).slice(0, 20) : []
        });
        throw error;
      }
    })
    .catch((error) => {
      if (!failureLogged) {
        logCategoryKitPlanner("request-error", {
          jobId: debug?.jobId,
          attempt,
          attemptCount,
          name: config.name,
          id: config.id,
          role: config.role,
          priority: config.priority,
          durationMs: Date.now() - startedAt,
          message: error instanceof Error ? error.message : String(error)
        });
      }
      throw error;
    });
}

function normalizeCategoryKitPlannerConfig(input: {
  id?: string;
  enabled?: boolean;
  name?: unknown;
  role?: unknown;
  priority?: number;
  apiKey?: string;
  baseUrl?: unknown;
  model?: unknown;
  timeoutMs?: unknown;
}): ResolvedCategoryKitPlannerConfigEntry {
  const role = normalizeRole(input.role);
  return {
    id: normalizeId(input.id) || randomUUID(),
    enabled: input.enabled !== false,
    name: normalizeName(input.name) || defaultCategoryKitPlannerName(role),
    role,
    priority: Number.isInteger(input.priority) && (input.priority ?? 0) > 0 ? Number(input.priority) : 1,
    apiKey: input.apiKey?.trim() || "",
    baseUrl: normalizeBaseUrl(input.baseUrl) || undefined,
    model: normalizeName(input.model) || DEFAULT_MODEL,
    timeoutMs: parsePositiveInteger(input.timeoutMs, DEFAULT_TIMEOUT_MS)
  };
}

function sortCategoryKitPlannerConfigs(configs: ResolvedCategoryKitPlannerConfigEntry[]): ResolvedCategoryKitPlannerConfigEntry[] {
  return [...configs].sort((left, right) => {
    if (left.role !== right.role) {
      return left.role === "primary" ? -1 : 1;
    }
    return left.priority - right.priority;
  });
}

function normalizeRole(value: unknown, index?: number): CategoryKitPlannerModelRole {
  if (value === "fallback" || value === "primary") {
    return value;
  }
  return index === 0 ? "primary" : "fallback";
}

function defaultCategoryKitPlannerName(role: CategoryKitPlannerModelRole): string {
  return role === "fallback" ? "品类套图备用文本模型" : "品类套图共享文本模型";
}

function composePlannerPrompt(input: EcommerceCategoryKitPlanRequest): string {
  const product = input.product;
  const platform = input.platform;
  const market = input.market;
  const textLanguage = input.textLanguage || "none";
  return [
    "You are planning a commercial e-commerce listing image kit.",
    "First identify the actual product category from the reference image and brief.",
    "Then decide the most useful listing/detail-page images for that exact product instead of following a fixed template.",
    "Return only JSON matching the schema. No markdown, no explanation, no code fences.",
    "Choose a useful number of images, usually 4 to 12. Prefer fewer images for simple products and more only when the product truly needs them.",
    "Each image prompt must be self-contained because the images will be generated in parallel.",
    "Decide text density per image instead of making every image text-free.",
    "For mainland China and other detail-page-heavy domestic e-commerce use cases, most images should usually include short benefit copy, callouts, labels, or comparison text when it helps conversion.",
    "For overseas markets such as Amazon, keep text lighter and cleaner; use text only when it clarifies benefits, dimensions, materials, usage, or compliance.",
    "When you choose to use text, keep it short, readable, localized for the selected market, and placed so it does not cover the product.",
    "Keep every prompt truthful to the real product. Preserve identity, color, material, labels, package, proportions, and recognizable details from the reference image.",
    "Do not invent packaging, variants, certifications, badges, official marks, rankings, medical effects, absolute claims, or platform logos.",
    `Platform: ${platform}.`,
    `Market: ${market}.`,
    `Preferred text language: ${textLanguage}.`,
    product.title
      ? `Product title: ${product.title}. If this title is only a placeholder, ignore it and infer the real product from the reference image.`
      : "Product title: infer from the reference image.",
    product.description ? `Product description: ${product.description}.` : "",
    product.targetCustomer ? `Target customer: ${product.targetCustomer}.` : "",
    product.usageScene ? `Usage scene: ${product.usageScene}.` : "",
    product.material ? `Material: ${product.material}.` : "",
    product.color ? `Color / SKU: ${product.color}.` : "",
    input.extraDirection ? `User extra direction: ${input.extraDirection}.` : "",
    "The response must include a short productSummary and an imagePlan array. Each item needs title, purpose, prompt, and notes.",
    "Use notes to spell out the text strategy for that image, including whether the image should have text, the exact short copy or headline if any, and any placement or style guidance."
  ]
    .filter(Boolean)
    .join("\n");
}

function categoryKitPlanSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      productSummary: {
        type: "string"
      },
      imagePlan: {
        type: "array",
        minItems: 1,
        maxItems: 12,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string" },
            purpose: { type: "string" },
            prompt: { type: "string" },
            notes: { type: "string" }
          },
          required: ["title", "purpose", "prompt", "notes"]
        }
      }
    },
    required: ["productSummary", "imagePlan"]
  };
}

function parseCategoryKitPlanResponse(text: string, model: string): EcommerceCategoryKitPlanResponse {
  const root = jsonFromText(text);
  const source = asRecord(root);
  const productSummary = normalizeText(source.productSummary) || normalizeText(source.product_summary) || "已识别商品并完成套图规划。";
  const rawPlan = Array.isArray(source.imagePlan)
    ? source.imagePlan
    : Array.isArray(source.image_plan)
      ? source.image_plan
      : Array.isArray(source.plannedImages)
        ? source.plannedImages
        : Array.isArray(source.planned_images)
          ? source.planned_images
          : Array.isArray(source.plan)
            ? source.plan
            : Array.isArray(source.plans)
              ? source.plans
              : Array.isArray(source.items)
                ? source.items
                : Array.isArray(source.images)
                  ? source.images
                  : Array.isArray(source.scenes)
                    ? source.scenes
                    : Array.isArray(source.data)
                      ? source.data
      : Array.isArray(root)
        ? root
        : [];
  const imagePlan: EcommerceCategoryKitPlanItem[] = rawPlan.flatMap((item) => {
    const value = asRecord(item);
    const title = firstString(value, ["title", "name", "image_title"]);
    const purpose = firstString(value, ["purpose", "goal", "reason"]);
    const prompt = firstString(value, ["prompt", "image_prompt", "generation_prompt"]);
    const notes = firstString(value, ["notes", "constraints", "copy_notes"]);
    if (!title || !prompt) {
      return [];
    }
    return [
      {
        title,
        purpose: purpose || title,
        prompt,
        notes
      }
    ];
  });

  if (imagePlan.length === 0) {
    throw new ProviderError("upstream_failure", "文本模型没有返回可用的套图方案。", 502);
  }

  return {
    productSummary,
    imagePlan: imagePlan.slice(0, 12),
    model
  };
}

function responseTextFromBody(body: unknown): string {
  if (typeof body === "string" && body.trim()) {
    return body.trim();
  }
  const root = asRecord(body);
  if (typeof root.output_text === "string" && root.output_text.trim()) {
    return root.output_text;
  }

  const chunks: string[] = [];
  const output = Array.isArray(root.output) ? root.output : [];
  for (const item of output) {
    const source = asRecord(item);
    const content = Array.isArray(source.content) ? source.content : [];
    for (const part of content) {
      const partRecord = asRecord(part);
      const text = normalizeText(partRecord.text ?? partRecord.output_text);
      if (text) {
        chunks.push(text);
      }
    }
  }

  if (chunks.length > 0) {
    return chunks.join("\n");
  }

  throw new ProviderError("upstream_failure", "文本模型没有返回任何文本内容。", 502);
}

function parseJsonMaybe(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function jsonFromText(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/iu.exec(trimmed);
  const candidate = fenced?.[1]?.trim() || trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1));
    }
    throw new ProviderError("upstream_failure", "文本模型返回内容无法解析为 JSON。", 502);
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function firstString(source: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function normalizeText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeBaseUrl(value: unknown): string | undefined {
  const text = normalizeText(value);
  if (!text) {
    return undefined;
  }
  return text.replace(/\/+$/u, "");
}

function normalizeName(value: unknown): string | undefined {
  return normalizeText(value);
}

function normalizeId(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 64) : "";
}

function parsePositiveInteger(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function encryptApiKey(value: string): string {
  return encryptSecret(value);
}

function decryptApiKey(value: string | undefined): string {
  if (!value) {
    return "";
  }
  try {
    return decryptSecret(value);
  } catch {
    return "";
  }
}

function responseErrorMessage(body: unknown): string | undefined {
  const root = asRecord(body);
  if (typeof root.error === "string") {
    return root.error;
  }
  if (typeof root.message === "string") {
    return root.message;
  }
  const error = asRecord(root.error);
  if (typeof error.message === "string") {
    return error.message;
  }
  return undefined;
}
