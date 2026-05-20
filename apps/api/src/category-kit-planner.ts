import { randomUUID } from "node:crypto";
import { decryptSecret, encryptSecret } from "./auth-crypto.js";
import { ProviderError } from "./image-provider.js";
import type {
  CategoryKitPlannerConfigEntry,
  CategoryKitPlannerConfigResponse,
  CategoryKitPlannerModule,
  CategoryKitPlannerModelRole,
  CategoryKitPlannerProvider,
  EcommerceCategoryKitPlanItem,
  EcommerceCategoryKitPlanRequest,
  EcommerceCategoryKitPlanResponse,
  EcommerceCategoryKitStrategy,
  EcommerceMarket,
  EcommercePlatform,
  EcommerceProductBrief,
  EcommerceTextLanguage,
  PromptOptimizeRequest,
  PromptOptimizeResponse,
  ReferenceImageInput,
  SaveCategoryKitPlannerConfigRequest,
  SeedanceVideoStoryboardPlanRequest,
  SeedanceVideoStoryboardPlanResponse
} from "./contracts.js";
import { getSystemSetting, saveSystemSetting } from "./system-settings.js";

const SETTING_KEY = "ecommerce.categoryKitPlanner";
const DEFAULT_MODEL = "gpt-5.5";
const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000;
const OPENAI_RESPONSES_BASE_URL = "https://api.openai.com/v1";
const OPENAI_CHAT_BASE_URL = "https://api.openai.com/v1";
const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const DEEPSEEK_DEFAULT_MODEL = "deepseek-v4-flash";
const ALL_TEXT_MODEL_MODULES: CategoryKitPlannerModule[] = [
  "prompt-optimizer",
  "category-kit-planner",
  "category-classifier",
  "video-storyboard-planner"
];
const SEEDANCE_FACE_SAFE_PROMPT_NOTE =
  "Seedance 合规限制：画面中不出现可识别真人脸、真实人物肖像或身份特征；如需人物互动，仅使用手部、背影、肩颈以下裁切、虚化远景人物、无脸模特或人体模特道具，产品始终是主体。";

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

export interface CategoryKitCategoryCandidate {
  id: string;
  categoryPath: string[];
  categoryName: string;
  aliases?: string[];
}

export interface CategoryKitCategoryClassificationInput {
  product: EcommerceProductBrief;
  platform: EcommercePlatform;
  market: EcommerceMarket;
  textLanguage?: EcommerceTextLanguage;
  referenceImage: ReferenceImageInput;
  candidates: CategoryKitCategoryCandidate[];
}

export interface CategoryKitCategoryClassificationResponse {
  categoryPath?: string[];
  categoryName?: string;
  strategyId?: string;
  confidence?: number;
  notes?: string;
  model?: string;
}

interface TextModelAttemptContext {
  feature: string;
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
      provider: model.provider,
      modules: model.modules,
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
      provider: model.provider,
      modules: model.modules,
      baseUrl: model.baseUrl || defaultBaseUrlForProvider(model.provider),
      model: model.model,
      timeoutMs: model.timeoutMs,
      hasApiKey: Boolean(model.apiKey)
    }))
  });
  const activeConfigs = activeVisionTextModelConfigs(configs.models, "category-kit-planner");
  if (activeConfigs.length === 0) {
    logCategoryKitPlanner("blocked", {
      jobId: debug?.jobId,
      reason: "no_active_models"
    });
    throw new ProviderError("missing_api_key", "后台未配置可看图的品类套图 OpenAI 文本模型，请先在管理后台保存并启用至少一个 OpenAI/兼容视觉模型。", 503);
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

export async function optimizeImagePrompt(input: PromptOptimizeRequest): Promise<PromptOptimizeResponse> {
  const configs = await resolveCategoryKitPlannerConfigs();
  const activeConfigs = activeTextModelConfigs(configs.models, "prompt-optimizer");
  if (activeConfigs.length === 0) {
    throw new ProviderError("missing_api_key", "后台未配置可用的提示词优化文本模型，请先在管理后台保存并启用共享文本模型。", 503);
  }

  const errors: string[] = [];
  for (const [index, config] of activeConfigs.entries()) {
    try {
      return await runPromptOptimizerAttempt(config, input, { feature: "prompt-optimizer" }, index + 1, activeConfigs.length);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${config.name} (${config.model}): ${message}`);
      logCategoryKitPlanner("prompt-optimize-attempt-failed", {
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
    `提示词优化失败，已尝试 ${activeConfigs.length} 个模型：${errors.join("；")}`,
    502
  );
}

export async function planSeedanceVideoStoryboard(
  input: SeedanceVideoStoryboardPlanRequest
): Promise<SeedanceVideoStoryboardPlanResponse> {
  const configs = await resolveCategoryKitPlannerConfigs();
  const activeConfigs = activeVisionTextModelConfigs(configs.models, "video-storyboard-planner");
  if (activeConfigs.length === 0) {
    throw new ProviderError("missing_api_key", "后台未配置可看图的视频分镜 OpenAI 文本模型，请先在管理后台保存并启用 OpenAI/兼容视觉模型。", 503);
  }

  const errors: string[] = [];
  for (const [index, config] of activeConfigs.entries()) {
    try {
      return await runVideoStoryboardPlannerAttempt(config, input, index + 1, activeConfigs.length);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${config.name} (${config.model}): ${message}`);
      logCategoryKitPlanner("video-storyboard-attempt-failed", {
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
    `视频分镜规划失败，已尝试 ${activeConfigs.length} 个模型：${errors.join("；")}`,
    502
  );
}

export async function classifyCategoryKitCategory(
  input: CategoryKitCategoryClassificationInput,
  debug?: CategoryKitPlannerDebugContext
): Promise<CategoryKitCategoryClassificationResponse | undefined> {
  if (input.candidates.length === 0) {
    return undefined;
  }
  const configs = await resolveCategoryKitPlannerConfigs();
  const activeConfigs = activeVisionTextModelConfigs(configs.models, "category-classifier");
  if (activeConfigs.length === 0) {
    logCategoryKitPlanner("classify-skipped", {
      jobId: debug?.jobId,
      reason: "no_active_models"
    });
    return undefined;
  }

  const errors: string[] = [];
  for (const [index, config] of activeConfigs.entries()) {
    try {
      return await runCategoryKitClassifierAttempt(config, input, debug, index + 1, activeConfigs.length);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${config.name} (${config.model}): ${message}`);
      logCategoryKitPlanner("classify-attempt-failed", {
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

  logCategoryKitPlanner("classify-failed", {
    jobId: debug?.jobId,
    attemptCount: activeConfigs.length,
    message: errors.join("；")
  });
  return undefined;
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
        provider: "openai-responses",
        modules: ALL_TEXT_MODEL_MODULES,
        baseUrl: OPENAI_RESPONSES_BASE_URL,
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
          provider: normalizeProvider(value.provider, value.baseUrl),
          modules: normalizeModules(value.modules),
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
  const provider = normalizeProvider(config.provider, config.baseUrl);
  const baseUrl = normalizeBaseUrl(config.baseUrl) || defaultBaseUrlForProvider(provider);
  const startedAt = Date.now();
  let failureLogged = false;
  const requestedImageCount = normalizeRequestedImageCount(input.requestedImageCount);
  const preferredTextLanguage = categoryKitPreferredTextLanguage(input);
  logCategoryKitPlanner("request-start", {
    jobId: debug?.jobId,
    attempt,
    attemptCount,
    name: config.name,
    id: config.id,
    role: config.role,
    priority: config.priority,
    provider,
    baseUrl,
    model: config.model,
    timeoutMs: config.timeoutMs,
    platform: input.platform,
    market: input.market,
    textLanguage: preferredTextLanguage,
    requestedImageCount,
    productTitle: input.product.title || "",
    hasReferenceImage: Boolean(input.referenceImage)
  });

  if (provider === "openai-responses") {
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
          schema: categoryKitPlanSchema(requestedImageCount)
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

  return fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: composePlannerPrompt(input)
            },
            {
              type: "image_url",
              image_url: {
                url: input.referenceImage.dataUrl
              }
            }
          ]
        }
      ],
      response_format: {
        type: "json_object"
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
          provider,
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
        const result = parseCategoryKitPlanResponse(responseTextFromChatBody(body), config.model);
        logCategoryKitPlanner("request-success", {
          jobId: debug?.jobId,
          attempt,
          attemptCount,
          name: config.name,
          id: config.id,
          role: config.role,
          priority: config.priority,
          provider,
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
          provider,
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
          provider,
          durationMs: Date.now() - startedAt,
          message: error instanceof Error ? error.message : String(error)
        });
      }
      throw error;
    });
}

function runCategoryKitClassifierAttempt(
  config: ResolvedCategoryKitPlannerConfigEntry,
  input: CategoryKitCategoryClassificationInput,
  debug: CategoryKitPlannerDebugContext | undefined,
  attempt: number,
  attemptCount: number
): Promise<CategoryKitCategoryClassificationResponse | undefined> {
  const provider = normalizeProvider(config.provider, config.baseUrl);
  const baseUrl = normalizeBaseUrl(config.baseUrl) || defaultBaseUrlForProvider(provider);
  const startedAt = Date.now();
  logCategoryKitPlanner("classify-request-start", {
    jobId: debug?.jobId,
    attempt,
    attemptCount,
    name: config.name,
    id: config.id,
    role: config.role,
    priority: config.priority,
    provider,
    baseUrl,
    model: config.model,
    candidateCount: input.candidates.length,
    productTitle: input.product.title || ""
  });

  if (provider === "openai-responses") {
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
              text: composeCategoryClassifierPrompt(input)
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
          name: "ecommerce_category_kit_category",
          strict: true,
          schema: categoryClassifierSchema()
        }
      }
    }),
    signal: AbortSignal.timeout(Math.min(config.timeoutMs, 120_000))
  })
    .then(async (response) => {
      const responseText = await response.text();
      const body = parseJsonMaybe(responseText);
      if (!response.ok) {
        const message = responseErrorMessage(body) || `类目识别失败：HTTP ${response.status}`;
        logCategoryKitPlanner("classify-upstream-error", {
          jobId: debug?.jobId,
          attempt,
          attemptCount,
          name: config.name,
          id: config.id,
          durationMs: Date.now() - startedAt,
          status: response.status,
          bodySnippet: responseText.slice(0, 800),
          message
        });
        throw new ProviderError("upstream_failure", message, response.status >= 400 ? response.status : 502);
      }

      const result = parseCategoryClassifierResponse(responseTextFromBody(body), config.model, input.candidates);
      logCategoryKitPlanner("classify-success", {
        jobId: debug?.jobId,
        attempt,
        attemptCount,
        name: config.name,
        id: config.id,
        durationMs: Date.now() - startedAt,
        strategyId: result?.strategyId,
        categoryPath: result?.categoryPath,
        confidence: result?.confidence,
        model: result?.model
      });
      return result;
    });
  }

  return fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: composeCategoryClassifierPrompt(input)
            },
            {
              type: "image_url",
              image_url: {
                url: input.referenceImage.dataUrl
              }
            }
          ]
        }
      ],
      response_format: {
        type: "json_object"
      }
    }),
    signal: AbortSignal.timeout(Math.min(config.timeoutMs, 120_000))
  })
    .then(async (response) => {
      const responseText = await response.text();
      const body = parseJsonMaybe(responseText);
      if (!response.ok) {
        const message = responseErrorMessage(body) || `类目识别失败：HTTP ${response.status}`;
        logCategoryKitPlanner("classify-upstream-error", {
          jobId: debug?.jobId,
          attempt,
          attemptCount,
          name: config.name,
          id: config.id,
          provider,
          durationMs: Date.now() - startedAt,
          status: response.status,
          bodySnippet: responseText.slice(0, 800),
          message
        });
        throw new ProviderError("upstream_failure", message, response.status >= 400 ? response.status : 502);
      }

      const result = parseCategoryClassifierResponse(responseTextFromChatBody(body), config.model, input.candidates);
      logCategoryKitPlanner("classify-success", {
        jobId: debug?.jobId,
        attempt,
        attemptCount,
        name: config.name,
        id: config.id,
        provider,
        durationMs: Date.now() - startedAt,
        strategyId: result?.strategyId,
        categoryPath: result?.categoryPath,
        confidence: result?.confidence,
        model: result?.model
      });
      return result;
    });
}

function runPromptOptimizerAttempt(
  config: ResolvedCategoryKitPlannerConfigEntry,
  input: PromptOptimizeRequest,
  debug: TextModelAttemptContext,
  attempt: number,
  attemptCount: number
): Promise<PromptOptimizeResponse> {
  const provider = normalizeProvider(config.provider, config.baseUrl);
  const baseUrl = normalizeBaseUrl(config.baseUrl) || defaultBaseUrlForProvider(provider);
  const startedAt = Date.now();
  let failureLogged = false;
  logCategoryKitPlanner("prompt-optimize-request-start", {
    feature: debug.feature,
    attempt,
    attemptCount,
    name: config.name,
    id: config.id,
    role: config.role,
    priority: config.priority,
    provider,
    baseUrl,
    model: config.model,
    timeoutMs: config.timeoutMs,
    mode: input.mode || "text",
    stylePresetId: input.stylePresetId || "none",
    hasReferenceImage: input.hasReferenceImage === true,
    promptLength: input.prompt.length
  });

  if (provider === "openai-responses") {
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
              text: composePromptOptimizerPrompt(input)
            }
          ]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "image_prompt_optimization",
          strict: true,
          schema: promptOptimizerSchema()
        }
      }
    }),
    signal: AbortSignal.timeout(Math.min(config.timeoutMs, 120_000))
  })
    .then(async (response) => {
      const responseText = await response.text();
      const body = parseJsonMaybe(responseText);
      if (!response.ok) {
        const message = responseErrorMessage(body) || `提示词优化失败：HTTP ${response.status}`;
        failureLogged = true;
        logCategoryKitPlanner("prompt-optimize-upstream-error", {
          feature: debug.feature,
          attempt,
          attemptCount,
          name: config.name,
          id: config.id,
          durationMs: Date.now() - startedAt,
          status: response.status,
          statusText: response.statusText,
          requestId: response.headers.get("x-request-id") || response.headers.get("request-id"),
          bodySnippet: responseText.slice(0, 1000),
          message
        });
        throw new ProviderError("upstream_failure", message, response.status >= 400 ? response.status : 502);
      }

      try {
        const result = parsePromptOptimizerResponse(responseTextFromBody(body), config.model, input.prompt);
        logCategoryKitPlanner("prompt-optimize-success", {
          feature: debug.feature,
          attempt,
          attemptCount,
          name: config.name,
          id: config.id,
          durationMs: Date.now() - startedAt,
          optimizedLength: result.optimizedPrompt.length,
          changeCount: result.changes?.length ?? 0,
          model: result.model
        });
        return result;
      } catch (error) {
        failureLogged = true;
        logCategoryKitPlanner("prompt-optimize-parse-error", {
          feature: debug.feature,
          attempt,
          attemptCount,
          name: config.name,
          id: config.id,
          durationMs: Date.now() - startedAt,
          message: error instanceof Error ? error.message : String(error),
          responseLength: responseText.length,
          responseSnippet: responseText.slice(0, 2000)
        });
        throw error;
      }
    })
    .catch((error) => {
      if (!failureLogged) {
        logCategoryKitPlanner("prompt-optimize-request-error", {
          feature: debug.feature,
          attempt,
          attemptCount,
          name: config.name,
          id: config.id,
          durationMs: Date.now() - startedAt,
          message: error instanceof Error ? error.message : String(error)
        });
      }
      throw error;
    });
  }

  return fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        {
          role: "user",
          content: composePromptOptimizerPrompt(input)
        }
      ],
      response_format: {
        type: "json_object"
      }
    }),
    signal: AbortSignal.timeout(Math.min(config.timeoutMs, 120_000))
  })
    .then(async (response) => {
      const responseText = await response.text();
      const body = parseJsonMaybe(responseText);
      if (!response.ok) {
        const message = responseErrorMessage(body) || `提示词优化失败：HTTP ${response.status}`;
        failureLogged = true;
        logCategoryKitPlanner("prompt-optimize-upstream-error", {
          feature: debug.feature,
          attempt,
          attemptCount,
          name: config.name,
          id: config.id,
          provider,
          durationMs: Date.now() - startedAt,
          status: response.status,
          statusText: response.statusText,
          requestId: response.headers.get("x-request-id") || response.headers.get("request-id"),
          bodySnippet: responseText.slice(0, 1000),
          message
        });
        throw new ProviderError("upstream_failure", message, response.status >= 400 ? response.status : 502);
      }

      try {
        const result = parsePromptOptimizerResponse(responseTextFromChatBody(body), config.model, input.prompt);
        logCategoryKitPlanner("prompt-optimize-success", {
          feature: debug.feature,
          attempt,
          attemptCount,
          name: config.name,
          id: config.id,
          provider,
          durationMs: Date.now() - startedAt,
          optimizedLength: result.optimizedPrompt.length,
          changeCount: result.changes?.length ?? 0,
          model: result.model
        });
        return result;
      } catch (error) {
        failureLogged = true;
        logCategoryKitPlanner("prompt-optimize-parse-error", {
          feature: debug.feature,
          attempt,
          attemptCount,
          name: config.name,
          id: config.id,
          provider,
          durationMs: Date.now() - startedAt,
          message: error instanceof Error ? error.message : String(error),
          responseLength: responseText.length,
          responseSnippet: responseText.slice(0, 2000)
        });
        throw error;
      }
    })
    .catch((error) => {
      if (!failureLogged) {
        logCategoryKitPlanner("prompt-optimize-request-error", {
          feature: debug.feature,
          attempt,
          attemptCount,
          name: config.name,
          id: config.id,
          provider,
          durationMs: Date.now() - startedAt,
          message: error instanceof Error ? error.message : String(error)
        });
      }
      throw error;
    });
}

function runVideoStoryboardPlannerAttempt(
  config: ResolvedCategoryKitPlannerConfigEntry,
  input: SeedanceVideoStoryboardPlanRequest,
  attempt: number,
  attemptCount: number
): Promise<SeedanceVideoStoryboardPlanResponse> {
  const provider = normalizeProvider(config.provider, config.baseUrl);
  const baseUrl = normalizeBaseUrl(config.baseUrl) || defaultBaseUrlForProvider(provider);
  const startedAt = Date.now();
  let failureLogged = false;
  const schema = videoStoryboardSchema();
  const referenceImages = input.referenceImages.slice(0, 4);
  logCategoryKitPlanner("video-storyboard-request-start", {
    attempt,
    attemptCount,
    name: config.name,
    id: config.id,
    role: config.role,
    priority: config.priority,
    provider,
    baseUrl,
    model: config.model,
    timeoutMs: config.timeoutMs,
    referenceImageCount: referenceImages.length,
    intentLength: input.intent.length,
    ratio: input.ratio || "auto",
    duration: input.duration ?? 4,
    resolution: input.resolution || "auto"
  });

  if (provider === "openai-responses") {
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
                text: composeVideoStoryboardPrompt(input)
              },
              ...referenceImages.map((image) => ({
                type: "input_image",
                image_url: image.dataUrl,
                detail: "auto"
              }))
            ]
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "seedance_video_storyboard_plan",
            strict: true,
            schema
          }
        }
      }),
      signal: AbortSignal.timeout(Math.min(config.timeoutMs, 180_000))
    })
      .then(async (response) => {
        const responseText = await response.text();
        const body = parseJsonMaybe(responseText);
        if (!response.ok) {
          const message = responseErrorMessage(body) || `视频分镜规划失败：HTTP ${response.status}`;
          failureLogged = true;
          logCategoryKitPlanner("video-storyboard-upstream-error", {
            attempt,
            attemptCount,
            name: config.name,
            id: config.id,
            durationMs: Date.now() - startedAt,
            status: response.status,
            statusText: response.statusText,
            requestId: response.headers.get("x-request-id") || response.headers.get("request-id"),
            bodySnippet: responseText.slice(0, 1000),
            message
          });
          throw new ProviderError("upstream_failure", message, response.status >= 400 ? response.status : 502);
        }

        try {
          const result = parseVideoStoryboardResponse(responseTextFromBody(body), config.model, input);
          logCategoryKitPlanner("video-storyboard-success", {
            attempt,
            attemptCount,
            name: config.name,
            id: config.id,
            durationMs: Date.now() - startedAt,
            sceneCount: result.scenes.length,
            model: result.model
          });
          return result;
        } catch (error) {
          failureLogged = true;
          logCategoryKitPlanner("video-storyboard-parse-error", {
            attempt,
            attemptCount,
            name: config.name,
            id: config.id,
            durationMs: Date.now() - startedAt,
            message: error instanceof Error ? error.message : String(error),
            responseLength: responseText.length,
            responseSnippet: responseText.slice(0, 2000)
          });
          throw error;
        }
      })
      .catch((error) => {
        if (!failureLogged) {
          logCategoryKitPlanner("video-storyboard-request-error", {
            attempt,
            attemptCount,
            name: config.name,
            id: config.id,
            durationMs: Date.now() - startedAt,
            message: error instanceof Error ? error.message : String(error)
          });
        }
        throw error;
      });
  }

  return fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: composeVideoStoryboardPrompt(input)
            },
            ...referenceImages.map((image) => ({
              type: "image_url",
              image_url: {
                url: image.dataUrl
              }
            }))
          ]
        }
      ],
      response_format: {
        type: "json_object"
      }
    }),
    signal: AbortSignal.timeout(Math.min(config.timeoutMs, 180_000))
  })
    .then(async (response) => {
      const responseText = await response.text();
      const body = parseJsonMaybe(responseText);
      if (!response.ok) {
        const message = responseErrorMessage(body) || `视频分镜规划失败：HTTP ${response.status}`;
        failureLogged = true;
        logCategoryKitPlanner("video-storyboard-upstream-error", {
          attempt,
          attemptCount,
          name: config.name,
          id: config.id,
          provider,
          durationMs: Date.now() - startedAt,
          status: response.status,
          statusText: response.statusText,
          requestId: response.headers.get("x-request-id") || response.headers.get("request-id"),
          bodySnippet: responseText.slice(0, 1000),
          message
        });
        throw new ProviderError("upstream_failure", message, response.status >= 400 ? response.status : 502);
      }

      try {
        const result = parseVideoStoryboardResponse(responseTextFromChatBody(body), config.model, input);
        logCategoryKitPlanner("video-storyboard-success", {
          attempt,
          attemptCount,
          name: config.name,
          id: config.id,
          provider,
          durationMs: Date.now() - startedAt,
          sceneCount: result.scenes.length,
          model: result.model
        });
        return result;
      } catch (error) {
        failureLogged = true;
        logCategoryKitPlanner("video-storyboard-parse-error", {
          attempt,
          attemptCount,
          name: config.name,
          id: config.id,
          provider,
          durationMs: Date.now() - startedAt,
          message: error instanceof Error ? error.message : String(error),
          responseLength: responseText.length,
          responseSnippet: responseText.slice(0, 2000)
        });
        throw error;
      }
    })
    .catch((error) => {
      if (!failureLogged) {
        logCategoryKitPlanner("video-storyboard-request-error", {
          attempt,
          attemptCount,
          name: config.name,
          id: config.id,
          provider,
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
  provider?: unknown;
  modules?: unknown;
  role?: unknown;
  priority?: number;
  apiKey?: string;
  baseUrl?: unknown;
  model?: unknown;
  timeoutMs?: unknown;
}): ResolvedCategoryKitPlannerConfigEntry {
  const role = normalizeRole(input.role);
  const provider = normalizeProvider(input.provider, input.baseUrl);
  return {
    id: normalizeId(input.id) || randomUUID(),
    enabled: input.enabled !== false,
    name: normalizeName(input.name) || defaultCategoryKitPlannerName(role),
    provider,
    modules: normalizeModules(input.modules),
    role,
    priority: Number.isInteger(input.priority) && (input.priority ?? 0) > 0 ? Number(input.priority) : 1,
    apiKey: input.apiKey?.trim() || "",
    baseUrl: normalizeBaseUrl(input.baseUrl) || defaultBaseUrlForProvider(provider),
    model: normalizeName(input.model) || defaultModelForProvider(provider),
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

function activeTextModelConfigs(
  configs: ResolvedCategoryKitPlannerConfigEntry[],
  module: CategoryKitPlannerModule
): ResolvedCategoryKitPlannerConfigEntry[] {
  return sortCategoryKitPlannerConfigs(configs).filter((model) => model.enabled && Boolean(model.apiKey) && model.modules.includes(module));
}

function activeVisionTextModelConfigs(
  configs: ResolvedCategoryKitPlannerConfigEntry[],
  module: CategoryKitPlannerModule
): ResolvedCategoryKitPlannerConfigEntry[] {
  const exactConfigs = activeTextModelConfigs(configs, module).filter((model) => normalizeProvider(model.provider, model.baseUrl) !== "deepseek");
  if (exactConfigs.length > 0 || module !== "video-storyboard-planner") {
    return exactConfigs;
  }

  return sortCategoryKitPlannerConfigs(configs).filter(
    (model) => model.enabled && Boolean(model.apiKey) && normalizeProvider(model.provider, model.baseUrl) !== "deepseek"
  );
}

function normalizeProvider(value: unknown, baseUrl?: unknown): CategoryKitPlannerProvider {
  if (value === "deepseek" || value === "openai-compatible-chat" || value === "openai-responses") {
    return value;
  }
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)?.toLowerCase() ?? "";
  if (normalizedBaseUrl.includes("deepseek")) {
    return "deepseek";
  }
  return "openai-responses";
}

function defaultBaseUrlForProvider(provider: CategoryKitPlannerProvider): string {
  if (provider === "deepseek") {
    return DEEPSEEK_BASE_URL;
  }
  if (provider === "openai-compatible-chat") {
    return OPENAI_CHAT_BASE_URL;
  }
  return OPENAI_RESPONSES_BASE_URL;
}

function defaultModelForProvider(provider: CategoryKitPlannerProvider): string {
  return provider === "deepseek" ? DEEPSEEK_DEFAULT_MODEL : DEFAULT_MODEL;
}

function normalizeModules(value: unknown): CategoryKitPlannerModule[] {
  if (!Array.isArray(value)) {
    return [...ALL_TEXT_MODEL_MODULES];
  }
  const source = value;
  const modules = source.filter((item): item is CategoryKitPlannerModule => ALL_TEXT_MODEL_MODULES.includes(item as CategoryKitPlannerModule));
  return Array.from(new Set(modules));
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

function composePromptOptimizerPrompt(input: PromptOptimizeRequest): string {
  const stylePresetId = input.stylePresetId || "none";
  const size = input.size ? `${input.size.width} x ${input.size.height}` : "unspecified";
  const mode = input.mode === "reference" ? "reference image editing/generation" : "text-to-image generation";
  return [
    "You are an expert image-generation prompt editor for a Chinese AI image canvas product.",
    "Rewrite the user's prompt into a stronger image-generation prompt.",
    "Return only JSON matching the schema. No markdown, no explanation, no code fences.",
    "Preserve the user's intent, subject, product identity, named brands, quantities, text requirements, and hard constraints.",
    "Improve weak or vague prompts by adding concrete subject details, environment, composition, lighting, camera/view, material/texture, mood, quality, and useful negative constraints.",
    "Do not invent unsupported product claims, fake certifications, fake logos, or text content the user did not request.",
    "If the user writes in Chinese, keep the optimized prompt in Chinese. If they write another language, keep that language unless a direct translation is needed for clarity.",
    "Keep the optimized prompt practical for image generation: one polished paragraph or compact structured lines, 80 to 240 Chinese characters when possible.",
    input.hasReferenceImage ? "Because a reference image is selected, mention preserving the reference image's main subject, structure, colors, and recognizable details." : "",
    `Generation mode: ${mode}.`,
    `Selected style preset: ${stylePresetId}.`,
    `Requested size: ${size}.`,
    `Original user prompt: ${input.prompt}`,
    jsonSchemaInstruction("image_prompt_optimization", promptOptimizerSchema())
  ].filter(Boolean).join("\n");
}

function composeVideoStoryboardPrompt(input: SeedanceVideoStoryboardPlanRequest): string {
  const requestedDuration = clampStoryboardDuration(input.duration);
  const requestedRatio = normalizeStoryboardRatio(input.ratio) || "9:16";
  const requestedResolution = normalizeStoryboardResolution(input.resolution) || "720p";
  return [
    "You are a senior commercial video director and AI-video prompt planner for a Chinese e-commerce creative tool.",
    "Use the reference images as visual evidence for product identity, shape, color, material, packaging, labels, and brand style.",
    "The user only provides one intent sentence. Turn it into a practical shot-by-shot storyboard for image-to-video generation.",
    "Return only JSON matching the schema. No markdown, no explanation, no code fences.",
    "Each scene must be independently executable: include one video prompt, one first-frame image prompt, and one last-frame image prompt.",
    "The first and last frame prompts will be sent to the existing image-generation backend before video generation. They must describe still images, not videos.",
    "Do not assume the uploaded reference image is already a correct first or last frame. Infer the needed frames from the script.",
    "Keep product identity faithful to references. Do not redesign the product, invent labels, add fake certifications, fake platform badges, unsupported claims, medical effects, or unreadable text.",
    "Important Seedance compliance: the final video API may reject input images containing real people or recognizable faces. Avoid recognizable real human faces in every video prompt and every first/last-frame prompt.",
    "If the user asks for a model, person, lifestyle scene, face, portrait, selfie, influencer, or if a reference image contains a person, replace the human presence with anonymous safe alternatives: hands only, back view, below-neck crop, partial body without face, mannequin, blurred distant figure, silhouette, or product-only still life. Preserve the product, not the person's identity.",
    `Every scene prompt should include this constraint when relevant: ${SEEDANCE_FACE_SAFE_PROMPT_NOTE}`,
    "Prefer 1 to 3 scenes. Use more than one scene only when the user intent clearly needs a sequence.",
    "Default each scene duration to 4 seconds. Do not exceed 6 seconds per scene unless the user explicitly asks for a longer shot.",
    "Video prompts should be concise but complete, with subject, scene, camera motion, action progression, lighting, style, and continuity from first frame to last frame.",
    "Frame prompts should be photorealistic commercial stills suitable as opening/closing keyframes for the video.",
    "If text appears in frames, keep it minimal, readable, and only use text provided by the user or visibly supported by the references.",
    `User intent: ${input.intent}.`,
    `Requested ratio: ${requestedRatio}.`,
    `Requested scene duration: ${requestedDuration} seconds.`,
    `Requested resolution: ${requestedResolution}.`,
    `Requested audio: ${input.generateAudio === true ? "on" : "off"}.`,
    jsonSchemaInstruction("seedance_video_storyboard_plan", videoStoryboardSchema())
  ].join("\n");
}

function promptOptimizerSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      optimizedPrompt: { type: "string" },
      changes: {
        type: "array",
        maxItems: 5,
        items: { type: "string" }
      }
    },
    required: ["optimizedPrompt", "changes"]
  };
}

function videoStoryboardSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      summary: { type: "string" },
      recommendations: {
        type: "object",
        additionalProperties: false,
        properties: {
          ratio: { type: "string" },
          resolution: { type: "string" },
          duration: { type: "number" },
          generateAudio: { type: "boolean" },
          notes: {
            type: "array",
            items: { type: "string" }
          }
        },
        required: ["ratio", "resolution", "duration", "generateAudio", "notes"]
      },
      scenes: {
        type: "array",
        minItems: 1,
        maxItems: 3,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            overview: { type: "string" },
            scene: { type: "string" },
            camera: { type: "string" },
            plot: { type: "string" },
            extra: { type: "string" },
            videoPrompt: { type: "string" },
            firstFrame: {
              type: "object",
              additionalProperties: false,
              properties: {
                prompt: { type: "string" },
                notes: { type: "string" }
              },
              required: ["prompt", "notes"]
            },
            lastFrame: {
              type: "object",
              additionalProperties: false,
              properties: {
                prompt: { type: "string" },
                notes: { type: "string" }
              },
              required: ["prompt", "notes"]
            },
            duration: { type: "number" }
          },
          required: [
            "id",
            "title",
            "overview",
            "scene",
            "camera",
            "plot",
            "extra",
            "videoPrompt",
            "firstFrame",
            "lastFrame",
            "duration"
          ]
        }
      }
    },
    required: ["summary", "recommendations", "scenes"]
  };
}

function parsePromptOptimizerResponse(text: string, model: string, originalPrompt: string): PromptOptimizeResponse {
  const root = asRecord(jsonFromText(text));
  const optimizedPrompt = normalizeText(root.optimizedPrompt ?? root.optimized_prompt ?? root.prompt);
  if (!optimizedPrompt) {
    throw new ProviderError("upstream_failure", "文本模型没有返回可用的优化提示词。", 502);
  }
  return {
    originalPrompt,
    optimizedPrompt: optimizedPrompt.slice(0, 2000),
    changes: stringArrayFrom(root.changes)?.slice(0, 5),
    model
  };
}

function parseVideoStoryboardResponse(
  text: string,
  model: string,
  input: SeedanceVideoStoryboardPlanRequest
): SeedanceVideoStoryboardPlanResponse {
  const root = asRecord(jsonFromText(text));
  const rawScenes = Array.isArray(root.scenes)
    ? root.scenes
    : Array.isArray(root.storyboard)
      ? root.storyboard
      : Array.isArray(root.shots)
        ? root.shots
        : [];
  const scenes = rawScenes.flatMap((item, index): SeedanceVideoStoryboardPlanResponse["scenes"] => {
    const scene = asRecord(item);
    const firstFrame = asRecord(scene.firstFrame ?? scene.first_frame ?? scene.openingFrame ?? scene.opening_frame);
    const lastFrame = asRecord(scene.lastFrame ?? scene.last_frame ?? scene.endingFrame ?? scene.ending_frame);
    const title = firstString(scene, ["title", "name"]) || `镜头 ${index + 1}`;
    const overview = firstString(scene, ["overview", "summary", "goal"]) || title;
    const sceneText = firstString(scene, ["scene", "setting", "environment"]) || "商业产品拍摄场景，主体清晰，背景干净。";
    const camera = firstString(scene, ["camera", "cameraMotion", "camera_motion"]) || "稳定轻微推进，保持主体清晰。";
    const plot = firstString(scene, ["plot", "action", "story"]) || overview;
    const extra = firstString(scene, ["extra", "notes", "constraints"]) || "保持参考图商品身份、颜色、材质与比例一致。";
    const videoPrompt = firstString(scene, ["videoPrompt", "video_prompt", "prompt"]) || "";
    const firstFramePrompt = firstString(firstFrame, ["prompt", "imagePrompt", "image_prompt"]) || "";
    const lastFramePrompt = firstString(lastFrame, ["prompt", "imagePrompt", "image_prompt"]) || "";
    if (!videoPrompt || !firstFramePrompt || !lastFramePrompt) {
      return [];
    }
    return [
      {
        id: firstString(scene, ["id", "sceneId", "scene_id"]) || `scene-${index + 1}`,
        title: title.slice(0, 80),
        overview: overview.slice(0, 600),
        scene: sceneText.slice(0, 800),
        camera: camera.slice(0, 800),
        plot: plot.slice(0, 800),
        extra: appendSeedanceFaceSafeNote(extra).slice(0, 800),
        videoPrompt: appendSeedanceFaceSafeNote(videoPrompt).slice(0, 2000),
        firstFrame: {
          prompt: appendSeedanceFaceSafeNote(firstFramePrompt).slice(0, 2000),
          notes: firstString(firstFrame, ["notes", "note"])?.slice(0, 400)
        },
        lastFrame: {
          prompt: appendSeedanceFaceSafeNote(lastFramePrompt).slice(0, 2000),
          notes: firstString(lastFrame, ["notes", "note"])?.slice(0, 400)
        },
        duration: clampStoryboardDuration(typeof scene.duration === "number" ? scene.duration : input.duration)
      }
    ];
  });

  if (scenes.length === 0) {
    throw new ProviderError("upstream_failure", "文本模型没有返回可用的视频分镜。", 502);
  }

  const recommendations = asRecord(root.recommendations ?? root.suggestions);
  const ratio = normalizeStoryboardRatio(recommendations.ratio) || normalizeStoryboardRatio(input.ratio) || "9:16";
  const resolution = normalizeStoryboardResolution(recommendations.resolution) || normalizeStoryboardResolution(input.resolution) || "720p";
  const duration = clampStoryboardDuration(typeof recommendations.duration === "number" ? recommendations.duration : input.duration);
  const generateAudio = typeof recommendations.generateAudio === "boolean"
    ? recommendations.generateAudio
    : typeof recommendations.generate_audio === "boolean"
      ? recommendations.generate_audio
      : input.generateAudio === true;
  const notes = stringArrayFrom(recommendations.notes)?.slice(0, 5) ?? [
    "建议单镜头默认 4 秒，最长不超过 6 秒，稳定性更好。",
    "首尾帧先用生图模型生成并确认，再提交视频生成。"
  ];

  return {
    summary: normalizeText(root.summary ?? root.productSummary ?? root.product_summary) || "已根据参考图和意图完成视频分镜规划。",
    scenes: scenes.slice(0, 3),
    recommendations: {
      ratio,
      resolution,
      duration,
      generateAudio,
      notes
    },
    model
  };
}

function normalizeStoryboardRatio(value: unknown): string | undefined {
  const ratio = normalizeText(value);
  if (!ratio) {
    return undefined;
  }
  return /^\d{1,2}:\d{1,2}$/u.test(ratio) ? ratio : undefined;
}

function normalizeStoryboardResolution(value: unknown): string | undefined {
  const resolution = normalizeText(value)?.toLowerCase();
  if (!resolution || resolution === "auto") {
    return "auto";
  }
  return /^(?:480p|720p|1080p|2k|4k)$/u.test(resolution) ? resolution : undefined;
}

function clampStoryboardDuration(value: unknown): number {
  const duration = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(duration)) {
    return 4;
  }
  return Math.min(Math.max(Math.round(duration), 1), 6);
}

function appendSeedanceFaceSafeNote(prompt: string): string {
  const normalized = normalizeText(prompt) || "";
  if (!normalized) {
    return SEEDANCE_FACE_SAFE_PROMPT_NOTE;
  }
  if (normalized.includes("可识别真人脸") || normalized.includes("无脸模特") || normalized.includes("below-neck") || normalized.includes("hands only")) {
    return normalized;
  }
  return `${normalized}\n${SEEDANCE_FACE_SAFE_PROMPT_NOTE}`;
}

function jsonSchemaInstruction(name: string, schema: Record<string, unknown>): string {
  return `Return JSON only. The JSON object must match this schema named ${name}: ${JSON.stringify(schema)}`;
}

const CHINESE_CATEGORY_KIT_PLATFORM_IDS = new Set<EcommercePlatform>([
  "1688",
  "taobao",
  "tmall",
  "jd",
  "douyin",
  "pinduoduo",
  "xiaohongshu",
  "kuaishou",
  "weidian",
  "dewu"
]);
const RUSSIAN_CATEGORY_KIT_PLATFORM_IDS = new Set<EcommercePlatform>(["ozon"]);

function normalizeRequestedImageCount(value: unknown): number | undefined {
  const count = Number(value);
  if (!Number.isInteger(count) || count < 1) {
    return undefined;
  }
  return Math.min(12, count);
}

function isChineseCommerceTarget(platform: EcommercePlatform, market: EcommerceMarket): boolean {
  return CHINESE_CATEGORY_KIT_PLATFORM_IDS.has(platform) || market === "cn";
}

function preferredTextLanguageForTarget(
  platform: EcommercePlatform,
  market: EcommerceMarket,
  textLanguage?: EcommerceTextLanguage
): EcommerceTextLanguage {
  if (textLanguage && textLanguage !== "none") {
    return textLanguage;
  }
  if (isChineseCommerceTarget(platform, market)) {
    return "zh-hans";
  }
  if (RUSSIAN_CATEGORY_KIT_PLATFORM_IDS.has(platform) || market === "ru") {
    return "ru";
  }
  return "none";
}

function categoryKitPreferredTextLanguage(input: EcommerceCategoryKitPlanRequest): EcommerceTextLanguage {
  return preferredTextLanguageForTarget(input.platform, input.market, input.textLanguage);
}

function composePlannerPrompt(input: EcommerceCategoryKitPlanRequest): string {
  const product = input.product;
  const platform = input.platform;
  const market = input.market;
  const textLanguage = categoryKitPreferredTextLanguage(input);
  const requestedImageCount = normalizeRequestedImageCount(input.requestedImageCount);
  const requestedSceneTemplateIds = input.requestedSceneTemplateIds?.length
    ? `Requested scene template slots JSON: ${truncateForPrompt(JSON.stringify(input.requestedSceneTemplateIds))}. Treat these as the user's desired kit coverage/count hints, not as rigid visual templates.`
    : "";
  const imageCountRule = requestedImageCount
    ? `The user selected ${requestedImageCount} scene slot(s). Return exactly ${requestedImageCount} imagePlan items unless it would be unsafe or impossible. Do not reduce the count only because the product is simple.`
    : "Choose a useful number of images, usually 4 to 12. Prefer fewer images for simple products and more only when the product truly needs them.";
  return [
    "You are planning a commercial e-commerce listing image kit.",
    "First identify the actual product category from the reference image and brief.",
    "Then decide the most useful listing/detail-page images for that exact product instead of following a fixed template.",
    "Return only JSON matching the schema. No markdown, no explanation, no code fences.",
    imageCountRule,
    requestedSceneTemplateIds,
    "Each image prompt must be self-contained because the images will be generated in parallel.",
    "Build a balanced selling kit, not a sequence of alternate product angles. Cover a useful role mix such as main product hero, benefit headline, feature callouts, material/detail, usage scenario, capacity/size/scale, package or included parts, trust/service/care, comparison, and specs when supported.",
    "Decide text density per image instead of making every image text-free.",
    "For mainland China and other detail-page-heavy domestic e-commerce use cases, most images should usually include short benefit copy, callouts, labels, or comparison text when it helps conversion.",
    "For overseas markets such as Amazon, keep text lighter and cleaner; use text only when it clarifies benefits, dimensions, materials, usage, or compliance.",
    "When you choose to use text, include the exact short readable copy in the prompt and notes, keep it localized for the selected market, and place it so it does not cover the product.",
    "If exact facts such as capacity, insulation, material grade, certification, discount, or warranty are not provided or visible, do not invent them. Use safe visual or lifestyle benefits instead.",
    "For simple products such as cups, mugs, storage boxes, or small accessories, still create distinct selling roles such as texture/detail, grip or portability, daily usage scene, gift/package, size/scale, cleaning/care, and benefit headline instead of repeating different photo angles.",
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
    categoryKitPromptContext(input),
    "The response must include a short productSummary and an imagePlan array. Each item needs title, purpose, prompt, notes, and sourceImageRoles.",
    "sourceImageRoles must list only the known asset roles required by that specific image, such as main-product, detail, package, model, lifestyle, scale, texture, or other.",
    "Use notes to spell out the text strategy for that image, including whether the image should have text, the exact short copy or headline if any, and any placement or style guidance.",
    jsonSchemaInstruction("ecommerce_category_kit_plan", categoryKitPlanSchema(requestedImageCount))
  ]
    .filter(Boolean)
    .join("\n");
}

function composeCategoryClassifierPrompt(input: CategoryKitCategoryClassificationInput): string {
  const product = input.product;
  return [
    "You are classifying an e-commerce product into the closest category strategy.",
    "Use the reference image as the primary evidence and the brief as secondary evidence.",
    "Return only JSON matching the schema. No markdown, no explanation, no code fences.",
    "Pick one candidate strategy id when it is reasonably close. If none fit, return strategyId as category-kit-fallback.",
    "Do not invent product attributes. The classification only chooses a strategy/category.",
    `Platform: ${input.platform}.`,
    `Market: ${input.market}.`,
    `Preferred text language: ${preferredTextLanguageForTarget(input.platform, input.market, input.textLanguage)}.`,
    product.title ? `Product title: ${product.title}.` : "",
    product.description ? `Product description: ${product.description}.` : "",
    product.targetCustomer ? `Target customer: ${product.targetCustomer}.` : "",
    product.usageScene ? `Usage scene: ${product.usageScene}.` : "",
    product.material ? `Material: ${product.material}.` : "",
    product.color ? `Color / SKU: ${product.color}.` : "",
    `Candidate strategies JSON: ${truncateForPrompt(JSON.stringify(input.candidates), 8000)}`,
    jsonSchemaInstruction("ecommerce_category_kit_category", categoryClassifierSchema())
  ]
    .filter(Boolean)
    .join("\n");
}

function categoryKitPromptContext(input: EcommerceCategoryKitPlanRequest): string {
  const lines = [
    input.categoryPath?.length ? `Matched category path: ${input.categoryPath.join(" > ")}.` : "",
    input.strategy
      ? `Matched strategy JSON: ${truncateForPrompt(
          JSON.stringify({
            id: input.strategy.id,
            categoryName: input.strategy.categoryName,
            categoryPath: input.strategy.categoryPath,
            platform: input.strategy.platform,
            market: input.strategy.market,
            visualStyle: input.strategy.visualStyle,
            copyStyle: input.strategy.copyStyle,
            sellingPointLogic: input.strategy.sellingPointLogic,
            compositionRules: input.strategy.compositionRules,
            safetyRules: input.strategy.safetyRules,
            requiredFields: input.strategy.requiredFields,
            recommendedFields: input.strategy.recommendedFields,
            imageRoles: input.strategy.imageRoles,
            outputScenes: input.strategy.outputScenes,
            fallbackRules: input.strategy.fallbackRules
          })
        )}`
      : "",
    input.assets?.length ? `Known assets JSON: ${truncateForPrompt(JSON.stringify(input.assets.map(promptSafeAsset)))}` : "",
    input.missingInputs?.length
      ? `Missing inputs JSON: ${truncateForPrompt(JSON.stringify(input.missingInputs))}. Do not fabricate these missing inputs. Adapt the plan around what is known.`
      : ""
  ].filter(Boolean);
  return lines.length ? lines.join("\n") : "";
}

function promptSafeAsset(asset: NonNullable<EcommerceCategoryKitPlanRequest["assets"]>[number]): Record<string, unknown> {
  return {
    id: asset.id,
    role: asset.role,
    referenceAssetId: asset.referenceAssetId,
    url: asset.url,
    fileName: asset.fileName ?? asset.referenceImage?.fileName,
    title: asset.title,
    description: asset.description,
    required: asset.required,
    tags: asset.tags,
    hasReferenceImage: Boolean(asset.referenceImage),
    hasMask: Boolean(asset.referenceImage?.maskDataUrl)
  };
}

function truncateForPrompt(value: string, maxLength = 6000): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function categoryKitPlanSchema(requestedImageCount?: number): Record<string, unknown> {
  const exactImageCount = normalizeRequestedImageCount(requestedImageCount);
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      productSummary: {
        type: "string"
      },
      imagePlan: {
        type: "array",
        minItems: exactImageCount ?? 1,
        maxItems: exactImageCount ?? 12,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string" },
            purpose: { type: "string" },
            prompt: { type: "string" },
            notes: { type: "string" },
            sourceImageRoles: {
              type: "array",
              items: { type: "string" }
            }
          },
          required: ["title", "purpose", "prompt", "notes", "sourceImageRoles"]
        }
      }
    },
    required: ["productSummary", "imagePlan"]
  };
}

function categoryClassifierSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      strategyId: { type: "string" },
      categoryPath: {
        type: "array",
        items: { type: "string" }
      },
      categoryName: { type: "string" },
      confidence: { type: "number" },
      notes: { type: "string" }
    },
    required: ["strategyId", "categoryPath", "categoryName", "confidence", "notes"]
  };
}

function parseCategoryClassifierResponse(
  text: string,
  model: string,
  candidates: CategoryKitCategoryCandidate[]
): CategoryKitCategoryClassificationResponse | undefined {
  const root = asRecord(jsonFromText(text));
  const strategyId = normalizeText(root.strategyId ?? root.strategy_id);
  const matched = strategyId ? candidates.find((candidate) => candidate.id === strategyId) : undefined;
  const categoryPath = stringArrayFrom(root.categoryPath ?? root.category_path) ?? matched?.categoryPath;
  const categoryName = normalizeText(root.categoryName ?? root.category_name) ?? matched?.categoryName ?? categoryPath?.at(-1);
  if (!strategyId && !categoryPath?.length && !categoryName) {
    return undefined;
  }
  return {
    strategyId: strategyId || matched?.id,
    categoryPath,
    categoryName,
    confidence: typeof root.confidence === "number" ? root.confidence : undefined,
    notes: normalizeText(root.notes),
    model
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
    const sourceImageRoles = stringArrayFrom(value.sourceImageRoles ?? value.source_image_roles ?? value.sourceRoles ?? value.source_roles);
    if (!title || !prompt) {
      return [];
    }
    return [
      {
        title,
        purpose: purpose || title,
        prompt,
        notes,
        sourceImageRoles
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

function responseTextFromChatBody(body: unknown): string {
  if (typeof body === "string" && body.trim()) {
    return body.trim();
  }

  const root = asRecord(body);
  const choices = Array.isArray(root.choices) ? root.choices : [];
  const chunks = choices.flatMap((choice) => {
    const choiceRecord = asRecord(choice);
    const message = asRecord(choiceRecord.message);
    const content = message.content;
    if (typeof content === "string" && content.trim()) {
      return [content.trim()];
    }
    if (Array.isArray(content)) {
      return content.flatMap((part) => {
        const partRecord = asRecord(part);
        const text = normalizeText(partRecord.text ?? partRecord.content);
        return text ? [text] : [];
      });
    }
    return [];
  });

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

function stringArrayFrom(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items = value.flatMap((item) => (typeof item === "string" && item.trim() ? [item.trim()] : []));
  return items.length ? items : undefined;
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
