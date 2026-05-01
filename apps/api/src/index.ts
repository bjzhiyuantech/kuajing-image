import { relative } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { asc, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Context } from "hono";
import { parsePreviewWidth, readStoredAssetPreview } from "./asset-preview.js";
import { resolveRequestTenant, type RequestTenant } from "./auth-context.js";
import {
  AuthError,
  getAuthSession,
  getAuthSessionFromToken,
  loginUser,
  registerUser,
  requireAdminSession,
  requireAuthSession,
  toMeResponse,
  type AuthSession
} from "./auth-service.js";
import {
  GENERATION_COUNTS,
  IMAGE_QUALITIES,
  OUTPUT_FORMATS,
  SIZE_PRESETS,
  STYLE_PRESETS,
  composeEcommercePrompt,
  composePrompt,
  validateSceneImageSize,
  type AppConfig,
  type AdminAssetsResponse,
  type AdminPlansResponse,
  type AdminStatsResponse,
  type AdminUsersResponse,
  type EcommerceBatchGenerateRequest,
  type EcommerceBatchGenerateResponse,
  type EcommerceJobListResponse,
  type EcommerceStatsResponse,
  type EcommerceMarket,
  type EcommercePlatform,
  type EcommerceProductBrief,
  type EcommerceSceneTemplateId,
  type GenerationCount,
  type ImageQuality,
  type ImageSize,
  type OutputFormat,
  type Plan,
  type ReferenceImageInput,
  type SaveStorageConfigRequest,
  type StylePresetId
} from "./contracts.js";
import { closeDatabase, ensureTenant, initializeDatabase } from "./database.js";
import { db } from "./database.js";
import {
  ProviderError,
  createOpenAIImageProvider,
  getConfiguredImageModel,
  getOpenAIImageProviderConfig,
  type EditImageProviderInput,
  type ImageProviderInput,
  type OpenAIImageProviderConfig
} from "./image-provider.js";
import { getStoredAssetFile, readStoredAsset, runReferenceImageGeneration, runTextToImageGeneration } from "./image-generation.js";
import {
  createEcommerceBatchJob,
  getEcommerceBatchJob,
  getEcommerceStats,
  listEcommerceBatchJobs,
  updateEcommerceBatchJob
} from "./ecommerce-jobs.js";
import { deleteGalleryOutput, getGalleryImages, getProjectState, saveProjectSnapshot } from "./project-store.js";
import { runtimePaths, serverConfig } from "./runtime.js";
import { assets, ecommerceBatchJobs, subscriptionPlans, users, workspaceMembers } from "./schema.js";
import { getStorageConfig, saveStorageConfig, testStorageConfig } from "./storage-config.js";

const MAX_PROJECT_SNAPSHOT_BYTES = 100 * 1024 * 1024;
const MAX_PROJECT_NAME_LENGTH = 120;
const MAX_PLAN_NAME_LENGTH = 120;
const MAX_PLAN_DESCRIPTION_LENGTH = 1000;
const MAX_CURRENCY_LENGTH = 16;

interface ProjectPayload {
  name?: string;
  snapshotJson: string;
}

type ResolvedEcommerceBatchGenerateRequest = Omit<
  EcommerceBatchGenerateRequest,
  "countPerScene" | "outputFormat" | "quality" | "size" | "stylePresetId"
> & {
  countPerScene: GenerationCount;
  outputFormat: OutputFormat;
  quality: ImageQuality;
  size: ImageSize;
  stylePresetId: StylePresetId;
};

interface EcommerceBatchJob {
  jobId: string;
  tenant: RequestTenant;
  input: ResolvedEcommerceBatchGenerateRequest;
  providerConfig: OpenAIImageProviderConfig;
  totalScenes: number;
  completedScenes: number;
  records: EcommerceBatchGenerateResponse["records"];
}

const runningEcommerceBatchJobs = new Map<string, EcommerceBatchJob>();
const authSessions = new WeakMap<Context, AuthSession>();
const fallbackTenants = new WeakMap<Context, RequestTenant>();

export const app = new Hono();

app.onError((error, c) => {
  if (error instanceof AuthError) {
    return c.json(errorResponse(error.code, error.message), error.status as 400 | 401 | 403 | 404 | 409 | 500);
  }

  console.error(error);
  return c.json(
    {
      error: {
        code: "internal_error",
        message: "Internal server error."
      }
    },
    500
  );
});

app.get("/api/health", (c) =>
  c.json({
    status: "ok"
  })
);

app.get("/api/config", (c) => {
  const configuredModel = getConfiguredImageModel();
  const config: AppConfig = {
    model: configuredModel,
    models: [configuredModel],
    sizePresets: SIZE_PRESETS,
    stylePresets: STYLE_PRESETS,
    qualities: IMAGE_QUALITIES,
    outputFormats: OUTPUT_FORMATS,
    counts: GENERATION_COUNTS
  };

  return c.json(config);
});

app.post("/api/auth/register", async (c) => {
  const payload = await readJson(c.req.raw);
  if (!payload.ok) {
    return c.json(payload.error, 400);
  }

  const parsed = parseAuthPayload(payload.value, true);
  if (!parsed.ok) {
    return c.json(parsed.error, 400);
  }

  try {
    return c.json(await registerUser(parsed.value));
  } catch (error) {
    return authErrorJson(c, error);
  }
});

app.post("/api/auth/login", async (c) => {
  const payload = await readJson(c.req.raw);
  if (!payload.ok) {
    return c.json(payload.error, 400);
  }

  const parsed = parseAuthPayload(payload.value, false);
  if (!parsed.ok) {
    return c.json(parsed.error, 400);
  }

  try {
    return c.json(await loginUser(parsed.value));
  } catch (error) {
    return authErrorJson(c, error);
  }
});

app.get("/api/auth/me", async (c) => {
  try {
    return c.json(toMeResponse(await requireAuthSession(c.req.raw.headers)));
  } catch (error) {
    return authErrorJson(c, error);
  }
});

app.use("/api/*", async (c, next) => {
  const session = (await getAuthSession(c.req.raw.headers)) ?? (await getAssetQueryTokenSession(c));
  if (session) {
    authSessions.set(c, session);
    await next();
    return;
  }

  const fallbackTenant = resolveRequestTenant(c.req.raw.headers);
  if (fallbackTenant) {
    await ensureTenant(fallbackTenant);
    fallbackTenants.set(c, fallbackTenant);
    await next();
    return;
  }

  return c.json(errorResponse("unauthorized", "请先登录，并使用 Authorization: Bearer <JWT> 访问接口。"), 401);
});

async function getAssetQueryTokenSession(c: Context): Promise<AuthSession | undefined> {
  if (!c.req.path.startsWith("/api/assets/")) {
    return undefined;
  }

  const token = c.req.query("token") ?? c.req.query("access_token");
  return token ? getAuthSessionFromToken(token) : undefined;
}

app.get("/api/project", async (c) => c.json(await getProjectState(await requestTenant(c))));

app.get("/api/gallery", async (c) => c.json(await getGalleryImages(await requestTenant(c))));

app.delete("/api/gallery/:outputId", async (c) => {
  const deleted = await deleteGalleryOutput(await requestTenant(c), c.req.param("outputId"));
  if (!deleted) {
    return c.json(errorResponse("not_found", "找不到请求的 Gallery 图片记录。"), 404);
  }

  return c.json({
    ok: true
  });
});

app.get("/api/storage/config", async (c) => {
  return c.json(await getStorageConfig(await requestTenant(c)));
});

app.put("/api/storage/config", async (c) => {
  const payload = await readJson(c.req.raw);
  if (!payload.ok) {
    return c.json(payload.error, 400);
  }

  const parsed = parseStorageConfigPayload(payload.value);
  if (!parsed.ok) {
    return c.json(parsed.error, 400);
  }

  try {
    return c.json(await saveStorageConfig(await requestTenant(c), parsed.value));
  } catch (error) {
    return c.json(errorResponse("storage_config_error", errorToMessage(error)), 400);
  }
});

app.post("/api/storage/config/test", async (c) => {
  const payload = await readJson(c.req.raw);
  if (!payload.ok) {
    return c.json(payload.error, 400);
  }

  const parsed = parseStorageConfigPayload(payload.value);
  if (!parsed.ok) {
    return c.json(parsed.error, 400);
  }

  return c.json(await testStorageConfig(await requestTenant(c), parsed.value));
});

app.get("/api/assets/:id/preview", async (c) => {
  const parsedWidth = parsePreviewWidth(c.req.query("width"));
  if (!parsedWidth.ok) {
    return c.json(errorResponse(parsedWidth.code, parsedWidth.message), 400);
  }

  const preview = await readStoredAssetPreview(await requestTenant(c), c.req.param("id"), parsedWidth.width);
  if (!preview) {
    return c.json(errorResponse("not_found", "Asset not found."), 404);
  }

  return new Response(new Uint8Array(preview.bytes), {
    status: 200,
    headers: {
      "Cache-Control": "private, max-age=31536000, immutable",
      "Content-Disposition": `inline; filename="${downloadFileName(c.req.param("id"))}-${preview.width}.webp"`,
      "Content-Type": "image/webp"
    }
  });
});

app.get("/api/assets/:id/download", async (c) => {
  const asset = await readStoredAsset(await requestTenant(c), c.req.param("id"));
  if (!asset) {
    return c.json(errorResponse("not_found", "找不到请求的图像资源。"), 404);
  }

  return new Response(new Uint8Array(asset.bytes), {
    status: 200,
    headers: {
      "Cache-Control": "private, max-age=31536000, immutable",
      "Content-Disposition": `attachment; filename="${downloadFileName(asset.file.fileName)}"`,
      "Content-Type": asset.file.mimeType
    }
  });
});

app.get("/api/assets/:id", async (c) => {
  const asset = await readStoredAsset(await requestTenant(c), c.req.param("id"));
  if (!asset) {
    return c.json(errorResponse("not_found", "找不到请求的图像资源。"), 404);
  }

  return new Response(new Uint8Array(asset.bytes), {
    status: 200,
    headers: {
      "Cache-Control": "private, max-age=31536000, immutable",
      "Content-Disposition": `inline; filename="${asset.file.fileName}"`,
      "Content-Type": asset.file.mimeType
    }
  });
});

app.put("/api/project", async (c) => {
  const payload = await readJson(c.req.raw);
  if (!payload.ok) {
    logProjectSaveRejected(payload.error, c.req.raw);
    return c.json(payload.error, 400);
  }

  const parsed = parseProjectPayload(payload.value);
  if (!parsed.ok) {
    logProjectSaveRejected(parsed.error, c.req.raw);
    return c.json(parsed.error, 400);
  }

  return c.json(await saveProjectSnapshot(await requestTenant(c), parsed.value));
});

app.post("/api/images/generate", async (c) => {
  const payload = await readJson(c.req.raw);
  if (!payload.ok) {
    return c.json(payload.error, 400);
  }

  const parsed = parseGeneratePayload(payload.value);
  if (!parsed.ok) {
    return c.json(parsed.error, 400);
  }

  const providerConfig = getOpenAIImageProviderConfig();
  if (!providerConfig.ok) {
    return providerErrorJson(c, providerConfig.error);
  }

  try {
    const provider = createOpenAIImageProvider(providerConfig.config);
    return c.json(await runTextToImageGeneration(await requestTenant(c), parsed.value, provider, c.req.raw.signal));
  } catch (error) {
    if (error instanceof ProviderError) {
      return providerErrorJson(c, error);
    }

    throw error;
  }
});

app.post("/api/images/edit", async (c) => {
  const payload = await readJson(c.req.raw);
  if (!payload.ok) {
    return c.json(payload.error, 400);
  }

  const parsed = await parseEditPayload(await requestTenant(c), payload.value);
  if (!parsed.ok) {
    return c.json(parsed.error, 400);
  }

  const providerConfig = getOpenAIImageProviderConfig();
  if (!providerConfig.ok) {
    return providerErrorJson(c, providerConfig.error);
  }

  try {
    const provider = createOpenAIImageProvider(providerConfig.config);
    return c.json(await runReferenceImageGeneration(await requestTenant(c), parsed.value, provider, c.req.raw.signal));
  } catch (error) {
    if (error instanceof ProviderError) {
      return providerErrorJson(c, error);
    }

    throw error;
  }
});

app.post("/api/ecommerce/images/batch-generate", async (c) => {
  const payload = await readJson(c.req.raw);
  if (!payload.ok) {
    return c.json(payload.error, 400);
  }

  const parsed = parseEcommerceBatchPayload(payload.value);
  if (!parsed.ok) {
    return c.json(parsed.error, 400);
  }

  const providerConfig = getOpenAIImageProviderConfig();
  if (!providerConfig.ok) {
    return providerErrorJson(c, providerConfig.error);
  }

  const tenant = await requestTenant(c);
  const now = new Date().toISOString();
  const job: EcommerceBatchJob = {
    jobId: randomUUID(),
    tenant,
    input: parsed.value,
    providerConfig: providerConfig.config,
    totalScenes: parsed.value.sceneTemplateIds.length,
    completedScenes: 0,
    records: []
  };

  const response = await createEcommerceBatchJob({
    jobId: job.jobId,
    tenant,
    input: parsed.value,
    message: "批量任务已创建，服务端正在排队生成。",
    now
  });
  runningEcommerceBatchJobs.set(job.jobId, job);
  void runEcommerceBatchJob(job.jobId);

  return c.json(response, 202);
});

app.get("/api/ecommerce/images/batch-generate/:jobId", async (c) => {
  const tenant = await requestTenant(c);
  const job = await getEcommerceBatchJob(tenant, c.req.param("jobId"));
  if (!job) {
    return c.json(errorResponse("not_found", "批量生成任务不存在。"), 404);
  }

  return c.json(job);
});

app.get("/api/ecommerce/jobs", async (c) => {
  const response: EcommerceJobListResponse = await listEcommerceBatchJobs(await requestTenant(c), parseListLimit(c.req.query("limit")));
  return c.json(response);
});

app.get("/api/ecommerce/jobs/:jobId", async (c) => {
  const job = await getEcommerceBatchJob(await requestTenant(c), c.req.param("jobId"));
  if (!job) {
    return c.json(errorResponse("not_found", "批量生成任务不存在。"), 404);
  }

  return c.json(job);
});

app.get("/api/ecommerce/stats", async (c) => {
  const response: EcommerceStatsResponse = await getEcommerceStats(await requestTenant(c));
  return c.json(response);
});

app.get("/api/admin/stats", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  return c.json(await getAdminStats());
});

app.get("/api/admin/users", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  return c.json(await getAdminUsers());
});

app.get("/api/admin/plans", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  return c.json(await getAdminPlans());
});

app.post("/api/admin/plans", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  const payload = await readJson(c.req.raw);
  if (!payload.ok) {
    return c.json(payload.error, 400);
  }

  const parsed = parsePlanPayload(payload.value, true);
  if (!parsed.ok) {
    return c.json(parsed.error, 400);
  }

  const now = new Date().toISOString();
  const id = randomUUID();
  const planValues = parsed.value;
  await db.insert(subscriptionPlans).values({
    id,
    name: planValues.name ?? "",
    description: planValues.description,
    imageQuota: planValues.imageQuota ?? 0,
    storageQuotaBytes: planValues.storageQuotaBytes ?? 0,
    priceCents: planValues.priceCents ?? 0,
    currency: planValues.currency ?? "CNY",
    enabled: planValues.enabled ?? 1,
    sortOrder: planValues.sortOrder ?? 0,
    benefitsJson: planValues.benefitsJson,
    createdAt: now,
    updatedAt: now
  });

  return c.json({ plan: await getPlanOrThrow(id) }, 201);
});

app.put("/api/admin/plans/:planId", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  const payload = await readJson(c.req.raw);
  if (!payload.ok) {
    return c.json(payload.error, 400);
  }

  const parsed = parsePlanPayload(payload.value, false);
  if (!parsed.ok) {
    return c.json(parsed.error, 400);
  }

  const planId = c.req.param("planId");
  const existing = await getPlanOrUndefined(planId);
  if (!existing) {
    return c.json(errorResponse("not_found", "套餐不存在。"), 404);
  }

  await db
    .update(subscriptionPlans)
    .set({
      ...parsed.value,
      updatedAt: new Date().toISOString()
    })
    .where(eq(subscriptionPlans.id, planId));

  return c.json({ plan: await getPlanOrThrow(planId) });
});

app.put("/api/admin/users/:userId/plan", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  const payload = await readJson(c.req.raw);
  if (!payload.ok) {
    return c.json(payload.error, 400);
  }

  const parsed = parseAssignPlanPayload(payload.value);
  if (!parsed.ok) {
    return c.json(parsed.error, 400);
  }

  const plan = await getPlanOrUndefined(parsed.value.planId);
  if (!plan) {
    return c.json(errorResponse("not_found", "套餐不存在。"), 404);
  }

  const userId = c.req.param("userId");
  const existing = await getUserOrUndefined(userId);
  if (!existing) {
    return c.json(errorResponse("not_found", "用户不存在。"), 404);
  }

  const resetQuota = parsed.value.resetQuota === true;
  const quotaTotal = parsed.value.quotaTotal ?? (resetQuota ? plan.imageQuota : Number(existing.quotaTotal ?? 0));
  const storageQuotaBytes =
    parsed.value.storageQuotaBytes ?? (resetQuota ? plan.storageQuotaBytes : Number(existing.storageQuotaBytes ?? 0));

  await db
    .update(users)
    .set({
      planId: plan.id,
      quotaTotal,
      storageQuotaBytes,
      updatedAt: new Date().toISOString()
    })
    .where(eq(users.id, userId));

  return c.json({ user: await getAdminUserOrThrow(userId) });
});

app.put("/api/admin/users/:userId/quota", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  const payload = await readJson(c.req.raw);
  if (!payload.ok) {
    return c.json(payload.error, 400);
  }

  const parsed = parseQuotaPayload(payload.value);
  if (!parsed.ok) {
    return c.json(parsed.error, 400);
  }

  const userId = c.req.param("userId");
  const existing = await getUserOrUndefined(userId);
  if (!existing) {
    return c.json(errorResponse("not_found", "用户不存在。"), 404);
  }

  await db
    .update(users)
    .set({
      ...parsed.value,
      updatedAt: new Date().toISOString()
    })
    .where(eq(users.id, userId));

  return c.json({ user: await getAdminUserOrThrow(userId) });
});

app.get("/api/admin/ecommerce/jobs", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  return c.json(await getAdminEcommerceJobs(parseListLimit(c.req.query("limit"))));
});

app.get("/api/admin/assets", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  return c.json(await getAdminAssets(parseListLimit(c.req.query("limit"))));
});

async function runEcommerceBatchJob(jobId: string): Promise<void> {
  const job = runningEcommerceBatchJobs.get(jobId);
  if (!job) {
    return;
  }

  try {
    await updateEcommerceBatchJob(job.tenant, job.jobId, {
      status: "running",
      message: "服务端正在并行生成场景，页面可以离开后稍晚回来查看。"
    });

    const provider = createOpenAIImageProvider(job.providerConfig);
    const records = new Array<EcommerceBatchGenerateResponse["records"][number] | undefined>(job.input.sceneTemplateIds.length);

    await Promise.all(
      job.input.sceneTemplateIds.map(async (sceneTemplateId, index) => {
        try {
          const prompt = composeEcommercePrompt({
            product: job.input.product,
            platform: job.input.platform,
            market: job.input.market,
            sceneTemplateId,
            extraDirection: job.input.extraDirection
          });
          const generationInput = {
            originalPrompt: prompt,
            presetId: job.input.stylePresetId ?? "product",
            prompt: composePrompt(prompt, job.input.stylePresetId ?? "product"),
            size: job.input.size,
            sizeApiValue: `${job.input.size.width}x${job.input.size.height}`,
            quality: job.input.quality ?? "auto",
            outputFormat: job.input.outputFormat ?? "png",
            count: job.input.countPerScene ?? 1
          };
          const response = job.input.referenceImage
            ? await runReferenceImageGeneration(job.tenant, { ...generationInput, referenceImage: job.input.referenceImage }, provider)
            : await runTextToImageGeneration(job.tenant, generationInput, provider);
          records[index] = response.record;
        } catch (error) {
          records[index] = failedEcommerceSceneRecord(job.input, sceneTemplateId, errorToMessage(error));
        } finally {
          job.completedScenes += 1;
          job.records = records.flatMap((record) => (record ? [record] : []));
          const failedCount = job.records.filter((record) => record.status === "failed").length;
          await updateEcommerceBatchJob(job.tenant, job.jobId, {
            status: "running",
            message: `服务端正在并行生成：${job.completedScenes}/${job.totalScenes} 个场景完成，${failedCount} 个失败。`,
            completedScenes: job.completedScenes,
            records: job.records
          });
        }
      })
    );

    const failedCount = job.records.filter((record) => record.status === "failed").length;
    const succeededCount = job.records.length - failedCount;
    await updateEcommerceBatchJob(job.tenant, job.jobId, {
      status: succeededCount > 0 && failedCount > 0 ? "partial" : succeededCount > 0 ? "succeeded" : "failed",
      message:
        succeededCount > 0 && failedCount > 0
          ? `批量生成部分完成：${succeededCount} 个场景成功，${failedCount} 个失败。`
          : succeededCount > 0
            ? `批量生成完成：${succeededCount} 个场景成功。`
            : "批量生成失败，请检查上游图像接口或稍后重试。",
      completedScenes: job.completedScenes,
      records: job.records,
      completedAt: new Date().toISOString()
    });
  } finally {
    runningEcommerceBatchJobs.delete(jobId);
  }
}

function failedEcommerceSceneRecord(
  input: ResolvedEcommerceBatchGenerateRequest,
  sceneTemplateId: EcommerceSceneTemplateId,
  message: string
): EcommerceBatchGenerateResponse["records"][number] {
  const prompt = composeEcommercePrompt({
    product: input.product,
    platform: input.platform,
    market: input.market,
    sceneTemplateId,
    extraDirection: input.extraDirection
  });
  return {
    id: randomUUID(),
    mode: input.referenceImage ? "edit" : "generate",
    prompt,
    effectivePrompt: composePrompt(prompt, input.stylePresetId ?? "product"),
    presetId: input.stylePresetId ?? "product",
    size: input.size,
    quality: input.quality ?? "auto",
    outputFormat: input.outputFormat ?? "png",
    count: input.countPerScene ?? 1,
    status: "failed",
    error: message,
    createdAt: new Date().toISOString(),
    outputs: [
      {
        id: randomUUID(),
        status: "failed",
        error: message
      }
    ]
  };
}

const webDistRoot = relative(process.cwd(), runtimePaths.webDistDir) || ".";

app.get("/api/*", (c) => c.json(errorResponse("not_found", "Not found."), 404));

app.get("*", serveStatic({ root: webDistRoot }));
app.get(
  "*",
  serveStatic({
    root: webDistRoot,
    path: "index.html",
    onNotFound: () => {
      console.error(`Built web bundle not found at ${runtimePaths.webDistDir}. Run pnpm build before pnpm start.`);
    }
  })
);

function errorResponse(code: string, message: string): ErrorResponseBody {
  return {
    error: {
      code,
      message
    }
  };
}

function downloadFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/gu, "_");
}

interface ErrorResponseBody {
  error: {
    code: string;
    message: string;
  };
}

type ParseResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      error: ErrorResponseBody;
    };

type PlanMutation = Partial<{
  name: string;
  description: string | null;
  imageQuota: number;
  storageQuotaBytes: number;
  priceCents: number;
  currency: string;
  enabled: number;
  sortOrder: number;
  benefitsJson: string | null;
}>;

function logProjectSaveRejected(error: ErrorResponseBody, request: Request): void {
  console.warn(
    `Project save rejected: ${error.error.code}. ${error.error.message}${formatRequestBodySummary(request)}`
  );
}

function formatRequestBodySummary(request: Request): string {
  const contentType = sanitizeHeaderValue(request.headers.get("content-type"));
  const contentLength = sanitizeHeaderValue(request.headers.get("content-length"));
  const transferEncoding = sanitizeHeaderValue(request.headers.get("transfer-encoding"));
  const bodySize = contentLength
    ? `content-length=${contentLength}`
    : transferEncoding
      ? `transfer-encoding=${transferEncoding}`
      : "content-length=unknown";

  return ` (${bodySize}, content-type=${contentType || "missing"})`;
}

function sanitizeHeaderValue(value: string | null): string {
  return (value ?? "").replace(/[\r\n]/gu, " ").trim().slice(0, 120);
}

function providerErrorJson(_c: Context, error: ProviderError) {
  const body = errorResponse(error.code, error.message);

  return new Response(JSON.stringify(body), {
    status: providerHttpStatus(error.status),
    headers: {
      "Content-Type": "application/json"
    }
  });
}

function providerHttpStatus(status: number): number {
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : 502;
}

async function requestTenant(c: Context): Promise<RequestTenant> {
  const session = authSessions.get(c);
  if (session) {
    return session.tenant;
  }

  const fallbackTenant = fallbackTenants.get(c);
  if (fallbackTenant) {
    return fallbackTenant;
  }

  throw new AuthError("unauthorized", "请先登录，并使用 Authorization: Bearer <JWT> 访问接口。", 401);
}

async function requireAdminRoute(c: Context): Promise<Response | undefined> {
  try {
    const session = authSessions.get(c) ?? (await requireAdminSession(c.req.raw.headers));
    if (session.user.role !== "admin") {
      return c.json(errorResponse("forbidden", "需要管理员权限。"), 403);
    }
    return undefined;
  } catch (error) {
    return authErrorJson(c, error);
  }
}

function authErrorJson(c: Context, error: unknown): Response {
  if (error instanceof AuthError) {
    return c.json(errorResponse(error.code, error.message), error.status as 400 | 401 | 403 | 404 | 409 | 500);
  }

  if (error instanceof Error && error.message.includes("JWT_SECRET")) {
    return c.json(errorResponse("auth_not_configured", "服务端未配置 JWT_SECRET。"), 500);
  }

  throw error;
}

async function getAdminStats(): Promise<AdminStatsResponse> {
  const [userRows, assetRows, jobRows] = await Promise.all([
    db.select().from(users),
    db.select().from(assets),
    db.select().from(ecommerceBatchJobs).orderBy(desc(ecommerceBatchJobs.createdAt))
  ]);
  const status: AdminStatsResponse["ecommerceJobStatus"] = {
    pending: 0,
    running: 0,
    succeeded: 0,
    partial: 0,
    failed: 0
  };

  for (const job of jobRows) {
    if (job.status in status) {
      status[job.status as keyof typeof status] += 1;
    }
  }

  return {
    userCount: userRows.length,
    assetCount: assetRows.length,
    estimatedStorageBytes: assetRows.reduce((total, asset) => total + estimateAssetBytes(asset), 0),
    totalStorageQuotaBytes: userRows.reduce((total, user) => total + Number(user.storageQuotaBytes ?? 0), 0),
    totalStorageUsedBytes: assetRows.reduce((total, asset) => total + estimateAssetBytes(asset), 0),
    ecommerceJobStatus: status,
    recentJobs: jobRows.slice(0, 20).map((job) => ({
      jobId: job.id,
      status: job.status as EcommerceBatchGenerateResponse["status"],
      message: job.message,
      productTitle: job.productTitle,
      platform: job.platform as EcommercePlatform,
      market: job.market as EcommerceMarket,
      totalScenes: job.totalScenes,
      completedScenes: job.completedScenes,
      succeededScenes: job.succeededScenes,
      failedScenes: job.failedScenes,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      completedAt: job.completedAt ?? undefined
    }))
  };
}

async function getAdminUsers(): Promise<AdminUsersResponse> {
  const [userRows, memberRows, assetRows] = await Promise.all([
    db
      .select({
        user: users,
        plan: subscriptionPlans
      })
      .from(users)
      .leftJoin(subscriptionPlans, eq(subscriptionPlans.id, users.planId)),
    db.select().from(workspaceMembers),
    db.select().from(assets)
  ]);
  const workspaceCountByUserId = new Map<string, number>();
  for (const member of memberRows) {
    workspaceCountByUserId.set(member.userId, (workspaceCountByUserId.get(member.userId) ?? 0) + 1);
  }
  const storageUsedByUserId = new Map<string, number>();
  for (const asset of assetRows) {
    storageUsedByUserId.set(asset.createdByUserId, (storageUsedByUserId.get(asset.createdByUserId) ?? 0) + estimateAssetBytes(asset));
  }

  return {
    users: userRows.map(({ user, plan }) =>
      toAdminUserItem(user, plan, workspaceCountByUserId.get(user.id) ?? 0, storageUsedByUserId.get(user.id) ?? 0)
    )
  };
}

async function getAdminPlans(): Promise<AdminPlansResponse> {
  const rows = await db
    .select()
    .from(subscriptionPlans)
    .orderBy(asc(subscriptionPlans.sortOrder), asc(subscriptionPlans.createdAt));
  return {
    plans: rows.map(toPlan)
  };
}

async function getPlanOrUndefined(planId: string): Promise<(typeof subscriptionPlans.$inferSelect) | undefined> {
  const [row] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, planId)).limit(1);
  return row;
}

async function getPlanOrThrow(planId: string): Promise<Plan> {
  const row = await getPlanOrUndefined(planId);
  if (!row) {
    throw new AuthError("not_found", "套餐不存在。", 404);
  }
  return toPlan(row);
}

async function getUserOrUndefined(userId: string): Promise<(typeof users.$inferSelect) | undefined> {
  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return row;
}

async function getAdminUserOrThrow(userId: string): Promise<AdminUsersResponse["users"][number]> {
  const [row] = await db
    .select({
      user: users,
      plan: subscriptionPlans
    })
    .from(users)
    .leftJoin(subscriptionPlans, eq(subscriptionPlans.id, users.planId))
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) {
    throw new AuthError("not_found", "用户不存在。", 404);
  }

  const [members, assetRows] = await Promise.all([
    db.select().from(workspaceMembers).where(eq(workspaceMembers.userId, userId)),
    db.select().from(assets).where(eq(assets.createdByUserId, userId))
  ]);
  const estimatedStorageUsedBytes = assetRows.reduce((total, asset) => total + estimateAssetBytes(asset), 0);
  return toAdminUserItem(row.user, row.plan, members.length, estimatedStorageUsedBytes);
}

function toAdminUserItem(
  user: typeof users.$inferSelect,
  plan: typeof subscriptionPlans.$inferSelect | null,
  workspaceCount: number,
  estimatedStorageUsedBytes = 0
): AdminUsersResponse["users"][number] {
  return {
    id: user.id,
    email: user.email ?? "",
    displayName: user.displayName,
    role: user.role === "admin" ? "admin" : "user",
    planId: user.planId ?? undefined,
    planName: plan?.name,
    quotaTotal: Number(user.quotaTotal ?? 0),
    quotaUsed: Number(user.quotaUsed ?? 0),
    storageQuotaBytes: Number(user.storageQuotaBytes ?? 0),
    storageUsedBytes: Math.max(Number(user.storageUsedBytes ?? 0), estimatedStorageUsedBytes),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    workspaceCount
  };
}

function toPlan(plan: typeof subscriptionPlans.$inferSelect): Plan {
  return {
    id: plan.id,
    name: plan.name,
    description: plan.description ?? undefined,
    imageQuota: Number(plan.imageQuota ?? 0),
    storageQuotaBytes: Number(plan.storageQuotaBytes ?? 0),
    priceCents: Number(plan.priceCents ?? 0),
    currency: plan.currency,
    enabled: Number(plan.enabled ?? 0) === 1,
    sortOrder: Number(plan.sortOrder ?? 0),
    benefits: parseJsonValue(plan.benefitsJson),
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt
  };
}

async function getAdminEcommerceJobs(limit: number): Promise<EcommerceJobListResponse> {
  const rows = await db.select().from(ecommerceBatchJobs).orderBy(desc(ecommerceBatchJobs.createdAt)).limit(limit);
  return {
    jobs: rows.map((job) => ({
      jobId: job.id,
      status: job.status as EcommerceBatchGenerateResponse["status"],
      message: job.message,
      productTitle: job.productTitle,
      platform: job.platform as EcommercePlatform,
      market: job.market as EcommerceMarket,
      totalScenes: job.totalScenes,
      completedScenes: job.completedScenes,
      succeededScenes: job.succeededScenes,
      failedScenes: job.failedScenes,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      completedAt: job.completedAt ?? undefined
    }))
  };
}

async function getAdminAssets(limit: number): Promise<AdminAssetsResponse> {
  const rows = await db
    .select({
      asset: assets,
      user: users
    })
    .from(assets)
    .leftJoin(users, eq(users.id, assets.createdByUserId))
    .orderBy(desc(assets.createdAt))
    .limit(limit);

  return {
    assets: rows.map(({ asset, user }) => ({
      id: asset.id,
      userId: asset.createdByUserId,
      userEmail: user?.email,
      workspaceId: asset.workspaceId,
      fileName: asset.fileName,
      mimeType: asset.mimeType,
      width: asset.width,
      height: asset.height,
      estimatedBytes: estimateAssetBytes(asset),
      cloudProvider: asset.cloudProvider === "cos" || asset.cloudProvider === "oss" ? asset.cloudProvider : undefined,
      cloudStatus: asset.cloudStatus === "uploaded" || asset.cloudStatus === "failed" ? asset.cloudStatus : undefined,
      createdAt: asset.createdAt
    }))
  };
}

function estimateAssetBytes(asset: typeof assets.$inferSelect): number {
  const pixelBytes = Math.max(0, asset.width * asset.height * 4);
  if (asset.mimeType === "image/jpeg") {
    return Math.round(pixelBytes * 0.35);
  }
  if (asset.mimeType === "image/webp") {
    return Math.round(pixelBytes * 0.25);
  }
  return pixelBytes;
}

function parseListLimit(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "50", 10);
  return Number.isInteger(parsed) ? Math.max(1, Math.min(parsed, 100)) : 50;
}

function parseAuthPayload(
  input: unknown,
  includeDisplayName: boolean
): ParseResult<{ email: string; password: string; displayName?: string }> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: errorResponse("invalid_request", "请求内容必须是 JSON 对象。")
    };
  }

  const email = stringValue(input.email)?.trim();
  const password = stringValue(input.password);
  if (!email || !password) {
    return {
      ok: false,
      error: errorResponse("invalid_credentials", "请输入邮箱和密码。")
    };
  }

  return {
    ok: true,
    value: {
      email,
      password,
      displayName: includeDisplayName ? stringValue(input.displayName)?.trim() : undefined
    }
  };
}

function parsePlanPayload(input: unknown, requireName: boolean): ParseResult<PlanMutation> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: errorResponse("invalid_plan", "套餐内容必须是 JSON 对象。")
    };
  }

  const value: PlanMutation = {};
  if (Object.hasOwn(input, "name")) {
    const name = parseLimitedString(input.name, MAX_PLAN_NAME_LENGTH);
    if (!name) {
      return {
        ok: false,
        error: errorResponse("invalid_plan_name", "套餐名称不能为空，且不能超过 120 个字符。")
      };
    }
    value.name = name;
  } else if (requireName) {
    return {
      ok: false,
      error: errorResponse("invalid_plan_name", "请提供套餐名称。")
    };
  }

  if (Object.hasOwn(input, "description")) {
    const description = parseNullableLimitedString(input.description, MAX_PLAN_DESCRIPTION_LENGTH);
    if (description === undefined) {
      return {
        ok: false,
        error: errorResponse("invalid_plan_description", "套餐描述不能超过 1000 个字符。")
      };
    }
    value.description = description;
  }

  const numberFields = [
    ["imageQuota", "image_quota", "生图额度必须是非负整数。"],
    ["storageQuotaBytes", "storage_quota_bytes", "存储额度必须是非负整数。"],
    ["priceCents", "price_cents", "价格必须是非负整数。"],
    ["sortOrder", "sort_order", "排序值必须是非负整数。"]
  ] as const;
  for (const [camelName, snakeName, message] of numberFields) {
    const rawValue = planNumberFieldValue(input, camelName, snakeName);
    if (rawValue !== undefined) {
      const parsed = parseNonNegativeInteger(rawValue);
      if (parsed === undefined) {
        return {
          ok: false,
          error: errorResponse("invalid_plan_number", message)
        };
      }
      value[camelName] = parsed;
    }
  }

  if (Object.hasOwn(input, "currency")) {
    const currency = parseLimitedString(input.currency, MAX_CURRENCY_LENGTH)?.toUpperCase();
    if (!currency) {
      return {
        ok: false,
        error: errorResponse("invalid_currency", "币种不能为空，且不能超过 16 个字符。")
      };
    }
    value.currency = currency;
  } else if (requireName) {
    value.currency = "CNY";
  }

  if (Object.hasOwn(input, "enabled")) {
    if (typeof input.enabled !== "boolean") {
      return {
        ok: false,
        error: errorResponse("invalid_enabled", "enabled 必须是布尔值。")
      };
    }
    value.enabled = input.enabled ? 1 : 0;
  } else if (requireName) {
    value.enabled = 1;
  }

  const benefits = parseBenefitsJson(input);
  if (!benefits.ok) {
    return benefits;
  }
  if (benefits.value !== undefined) {
    value.benefitsJson = benefits.value;
  }

  if (requireName) {
    value.imageQuota ??= 0;
    value.storageQuotaBytes ??= 0;
    value.priceCents ??= 0;
    value.sortOrder ??= 0;
  }

  if (!requireName && Object.keys(value).length === 0) {
    return {
      ok: false,
      error: errorResponse("invalid_plan", "请至少提供一个要修改的套餐字段。")
    };
  }

  return {
    ok: true,
    value
  };
}

function planNumberFieldValue(input: Record<string, unknown>, camelName: string, snakeName: string): unknown {
  if (Object.hasOwn(input, camelName)) {
    return input[camelName];
  }
  if (Object.hasOwn(input, snakeName)) {
    return input[snakeName];
  }
  if (camelName === "imageQuota") {
    return input.quotaTotal ?? input.generationQuota;
  }
  return undefined;
}

function parseAssignPlanPayload(input: unknown): ParseResult<{
  planId: string;
  resetQuota?: boolean;
  quotaTotal?: number;
  storageQuotaBytes?: number;
}> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: errorResponse("invalid_plan_assignment", "套餐分配内容必须是 JSON 对象。")
    };
  }

  const planId = parseLimitedString(input.planId, 64);
  if (!planId) {
    return {
      ok: false,
      error: errorResponse("invalid_plan_id", "请提供有效套餐 ID。")
    };
  }

  const quotaTotal = Object.hasOwn(input, "quotaTotal") ? parseNonNegativeInteger(input.quotaTotal) : undefined;
  if (Object.hasOwn(input, "quotaTotal") && quotaTotal === undefined) {
    return {
      ok: false,
      error: errorResponse("invalid_quota", "生图额度必须是非负整数。")
    };
  }

  const storageQuotaBytes = Object.hasOwn(input, "storageQuotaBytes")
    ? parseNonNegativeInteger(input.storageQuotaBytes)
    : undefined;
  if (Object.hasOwn(input, "storageQuotaBytes") && storageQuotaBytes === undefined) {
    return {
      ok: false,
      error: errorResponse("invalid_storage_quota", "存储额度必须是非负整数。")
    };
  }

  return {
    ok: true,
    value: {
      planId,
      resetQuota: input.resetQuota === true,
      quotaTotal,
      storageQuotaBytes
    }
  };
}

function parseQuotaPayload(input: unknown): ParseResult<Partial<{
  quotaTotal: number;
  quotaUsed: number;
  storageQuotaBytes: number;
  storageUsedBytes: number;
}>> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: errorResponse("invalid_quota", "额度内容必须是 JSON 对象。")
    };
  }

  const value: Partial<{
    quotaTotal: number;
    quotaUsed: number;
    storageQuotaBytes: number;
    storageUsedBytes: number;
  }> = {};
  for (const key of ["quotaTotal", "quotaUsed", "storageQuotaBytes", "storageUsedBytes"] as const) {
    if (!Object.hasOwn(input, key)) {
      continue;
    }
    const parsed = parseNonNegativeInteger(input[key]);
    if (parsed === undefined) {
      return {
        ok: false,
        error: errorResponse("invalid_quota", "额度字段必须是非负整数。")
      };
    }
    value[key] = parsed;
  }

  if (Object.keys(value).length === 0) {
    return {
      ok: false,
      error: errorResponse("invalid_quota", "请至少提供一个要调整的额度字段。")
    };
  }

  return {
    ok: true,
    value
  };
}

function parseGeneratePayload(input: unknown): ParseResult<ImageProviderInput> {
  const base = parseBaseImagePayload(input);
  if (!base.ok) {
    return base;
  }

  return {
    ok: true,
    value: base.value
  };
}

async function parseEditPayload(tenant: RequestTenant, input: unknown): Promise<ParseResult<EditImageProviderInput>> {
  const base = parseBaseImagePayload(input);
  if (!base.ok) {
    return base;
  }

  if (!isRecord(input) || !isRecord(input.referenceImage)) {
    return {
      ok: false,
      error: errorResponse("unsupported_provider_behavior", "编辑图像需要提供一个参考图像。")
    };
  }

  const dataUrl = input.referenceImage.dataUrl;
  if (typeof dataUrl !== "string" || dataUrl.trim().length === 0) {
    return {
      ok: false,
      error: errorResponse("unsupported_provider_behavior", "参考图像格式不受支持。")
    };
  }

  const fileName = input.referenceImage.fileName;
  const referenceAssetId = parseOptionalString(input.referenceAssetId);

  if (referenceAssetId && !(await getStoredAssetFile(tenant, referenceAssetId))) {
    return {
      ok: false,
      error: errorResponse("invalid_request", "找不到可记录的本地参考图像资源。")
    };
  }

  const referenceImage: ReferenceImageInput = {
    dataUrl,
    fileName: typeof fileName === "string" && fileName.trim() ? fileName.trim() : undefined
  };

  return {
    ok: true,
    value: {
      ...base.value,
      referenceImage,
      referenceAssetId
    }
  };
}

function parseStorageConfigPayload(input: unknown): ParseResult<SaveStorageConfigRequest> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: errorResponse("invalid_storage_config", "Storage config payload must be a JSON object.")
    };
  }

  const provider = parseOptionalString(input.provider) ?? "cos";
  if (provider !== "cos" && provider !== "oss") {
    return {
      ok: false,
      error: errorResponse("invalid_storage_provider", "Only Tencent COS and Alibaba Cloud OSS storage are supported.")
    };
  }

  const enabled = input.enabled === true;
  if (!enabled) {
    return {
      ok: true,
      value: {
        enabled: false,
        provider
      }
    };
  }

  if (provider === "oss") {
    if (!isRecord(input.oss)) {
      return {
        ok: false,
        error: errorResponse("invalid_storage_config", "OSS config must be a JSON object.")
      };
    }

    return {
      ok: true,
      value: {
        enabled: true,
        provider: "oss",
        oss: {
          accessKeyId: stringValue(input.oss.accessKeyId) ?? "",
          accessKeySecret: stringValue(input.oss.accessKeySecret),
          preserveSecret: input.oss.preserveSecret === true,
          bucket: stringValue(input.oss.bucket) ?? "",
          region: stringValue(input.oss.region) ?? "",
          keyPrefix: stringValue(input.oss.keyPrefix) ?? ""
        }
      }
    };
  }

  if (!isRecord(input.cos)) {
    return {
      ok: false,
      error: errorResponse("invalid_storage_config", "COS config must be a JSON object.")
    };
  }

  return {
    ok: true,
    value: {
      enabled: true,
      provider: "cos",
      cos: {
        secretId: stringValue(input.cos.secretId) ?? "",
        secretKey: stringValue(input.cos.secretKey),
        preserveSecret: input.cos.preserveSecret === true,
        bucket: stringValue(input.cos.bucket) ?? "",
        region: stringValue(input.cos.region) ?? "",
        keyPrefix: stringValue(input.cos.keyPrefix) ?? ""
      }
    }
  };
}

function parseBaseImagePayload(input: unknown): ParseResult<ImageProviderInput> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: errorResponse("invalid_request", "请求内容必须是 JSON 对象。")
    };
  }

  const prompt = input.prompt;
  if (typeof prompt !== "string" || prompt.trim().length === 0) {
    return {
      ok: false,
      error: errorResponse("invalid_prompt", "请输入有效的提示词。")
    };
  }

  const stylePreset = parseStylePreset(input);
  if (!stylePreset.ok) {
    return stylePreset;
  }

  const size = parseSize(input.size);
  if (!size.ok) {
    return size;
  }

  const sizePresetId = parseOptionalString(input.sizePresetId) ?? parseOptionalString(input.scenePresetId) ?? parseSizePresetFromPresetId(input.presetId);
  const resolvedSize = validateSceneImageSize({
    size: size.value,
    sizePresetId
  });

  if (!resolvedSize.ok) {
    return {
      ok: false,
      error: errorResponse(resolvedSize.code, resolvedSize.message)
    };
  }

  const quality = parseQuality(input.quality);
  if (!quality.ok) {
    return quality;
  }

  const outputFormat = parseOutputFormat(input.outputFormat);
  if (!outputFormat.ok) {
    return outputFormat;
  }

  const count = parseCount(input.count);
  if (!count.ok) {
    return count;
  }

  return {
    ok: true,
    value: {
      originalPrompt: prompt.trim(),
      presetId: stylePreset.value,
      prompt: composePrompt(prompt, stylePreset.value),
      size: resolvedSize.size,
      sizeApiValue: resolvedSize.apiValue,
      quality: quality.value,
      outputFormat: outputFormat.value,
      count: count.value
    }
  };
}

function parseEcommerceBatchPayload(input: unknown): ParseResult<ResolvedEcommerceBatchGenerateRequest> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: errorResponse("invalid_request", "请求内容必须是 JSON 对象。")
    };
  }

  const product = parseEcommerceProduct(input.product);
  if (!product.ok) {
    return product;
  }

  const platform = parseEcommercePlatform(input.platform);
  if (!platform.ok) {
    return platform;
  }

  const market = parseEcommerceMarket(input.market);
  if (!market.ok) {
    return market;
  }

  const sceneTemplateIds = parseEcommerceSceneIds(input.sceneTemplateIds);
  if (!sceneTemplateIds.ok) {
    return sceneTemplateIds;
  }

  const size = parseSize(input.size);
  if (!size.ok) {
    return size;
  }

  const resolvedSize = validateSceneImageSize({
    size: size.value,
    sizePresetId: parseOptionalString(input.sizePresetId)
  });

  if (!resolvedSize.ok) {
    return {
      ok: false,
      error: errorResponse(resolvedSize.code, resolvedSize.message)
    };
  }

  const stylePreset = parseStylePreset({
    stylePresetId: parseOptionalString(input.stylePresetId)
  });
  if (!stylePreset.ok) {
    return stylePreset;
  }

  const quality = parseQuality(input.quality);
  if (!quality.ok) {
    return quality;
  }

  const outputFormat = parseOutputFormat(input.outputFormat);
  if (!outputFormat.ok) {
    return outputFormat;
  }

  const count = parseCount(input.countPerScene);
  if (!count.ok) {
    return count;
  }

  return {
    ok: true,
    value: {
      product: product.value,
      platform: platform.value,
      market: market.value,
      sceneTemplateIds: sceneTemplateIds.value,
      size: resolvedSize.size,
      stylePresetId: stylePreset.value,
      quality: quality.value,
      outputFormat: outputFormat.value,
      countPerScene: count.value,
      referenceImage: parseEcommerceReferenceImage(input.referenceImage),
      extraDirection: parseOptionalString(input.extraDirection)
    }
  };
}

function parseEcommerceReferenceImage(value: unknown): ReferenceImageInput | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const dataUrl = value.dataUrl;
  if (typeof dataUrl !== "string" || !dataUrl.trim()) {
    return undefined;
  }

  const fileName = value.fileName;
  return {
    dataUrl,
    fileName: typeof fileName === "string" && fileName.trim() ? fileName.trim() : undefined
  };
}

function parseEcommerceProduct(value: unknown): ParseResult<EcommerceProductBrief> {
  if (!isRecord(value) || typeof value.title !== "string" || value.title.trim().length === 0) {
    return {
      ok: false,
      error: errorResponse("invalid_product", "请提供有效的商品标题。")
    };
  }

  return {
    ok: true,
    value: {
      title: value.title.trim(),
      description: parseOptionalString(value.description),
      bulletPoints: Array.isArray(value.bulletPoints)
        ? value.bulletPoints.flatMap((item) => (typeof item === "string" && item.trim() ? [item.trim()] : []))
        : undefined,
      targetCustomer: parseOptionalString(value.targetCustomer),
      usageScene: parseOptionalString(value.usageScene),
      material: parseOptionalString(value.material),
      color: parseOptionalString(value.color),
      brandTone: parseOptionalString(value.brandTone)
    }
  };
}

function parseEcommercePlatform(value: unknown): ParseResult<EcommercePlatform> {
  const platform = parseOptionalString(value) ?? "amazon";
  const platforms: EcommercePlatform[] = ["amazon", "shopify", "tiktok-shop", "temu", "shein", "etsy", "aliexpress", "other"];
  if (!platforms.includes(platform as EcommercePlatform)) {
    return {
      ok: false,
      error: errorResponse("invalid_platform", "不支持的电商平台。")
    };
  }

  return {
    ok: true,
    value: platform as EcommercePlatform
  };
}

function parseEcommerceMarket(value: unknown): ParseResult<EcommerceMarket> {
  const market = parseOptionalString(value) ?? "us";
  const markets: EcommerceMarket[] = ["us", "uk", "eu", "ca", "au", "jp", "kr", "sg", "mx", "br", "global"];
  if (!markets.includes(market as EcommerceMarket)) {
    return {
      ok: false,
      error: errorResponse("invalid_market", "不支持的目标市场。")
    };
  }

  return {
    ok: true,
    value: market as EcommerceMarket
  };
}

function parseEcommerceSceneIds(value: unknown): ParseResult<EcommerceSceneTemplateId[]> {
  if (!Array.isArray(value) || value.length === 0) {
    return {
      ok: false,
      error: errorResponse("invalid_scene_templates", "请至少选择一个跨境电商生图场景。")
    };
  }

  const supported: EcommerceSceneTemplateId[] = [
    "marketplace-main",
    "logo-benefit",
    "promo-poster",
    "lifestyle",
    "feature-benefit",
    "model-wear",
    "accessory-match",
    "seasonal-campaign",
    "social-ad"
  ];
  const sceneIds = value.flatMap((item) =>
    typeof item === "string" && supported.includes(item as EcommerceSceneTemplateId)
      ? [item as EcommerceSceneTemplateId]
      : []
  );

  if (sceneIds.length === 0) {
    return {
      ok: false,
      error: errorResponse("invalid_scene_templates", "没有可用的跨境电商生图场景。")
    };
  }

  return {
    ok: true,
    value: sceneIds.slice(0, 6)
  };
}

function parseStylePreset(input: Record<string, unknown>): ParseResult<StylePresetId> {
  const presetId = parseOptionalString(input.stylePresetId) ?? parseStylePresetFromPresetId(input.presetId) ?? "none";

  if (!STYLE_PRESETS.some((preset) => preset.id === presetId)) {
    return {
      ok: false,
      error: errorResponse("invalid_prompt", "不支持的风格预设。")
    };
  }

  return {
    ok: true,
    value: presetId as StylePresetId
  };
}

function parseSize(value: unknown): ParseResult<ImageSize> {
  if (!isRecord(value)) {
    return {
      ok: false,
      error: errorResponse("invalid_size", "请提供有效的图像尺寸。")
    };
  }

  return {
    ok: true,
    value: {
      width: parseDimension(value.width),
      height: parseDimension(value.height)
    }
  };
}

function parseQuality(value: unknown): ParseResult<ImageQuality> {
  if (value === undefined) {
    return {
      ok: true,
      value: "auto"
    };
  }

  if (typeof value === "string" && IMAGE_QUALITIES.includes(value as ImageQuality)) {
    return {
      ok: true,
      value: value as ImageQuality
    };
  }

  return {
    ok: false,
    error: errorResponse("invalid_request", "不支持的图像质量设置。")
  };
}

function parseOutputFormat(value: unknown): ParseResult<OutputFormat> {
  if (value === undefined) {
    return {
      ok: true,
      value: "png"
    };
  }

  if (typeof value === "string" && OUTPUT_FORMATS.includes(value as OutputFormat)) {
    return {
      ok: true,
      value: value as OutputFormat
    };
  }

  return {
    ok: false,
    error: errorResponse("invalid_request", "不支持的输出格式。")
  };
}

function parseCount(value: unknown): ParseResult<GenerationCount> {
  if (value === undefined) {
    return {
      ok: true,
      value: 1
    };
  }

  if (typeof value === "number" && GENERATION_COUNTS.includes(value as GenerationCount)) {
    return {
      ok: true,
      value: value as GenerationCount
    };
  }

  return {
    ok: false,
    error: errorResponse("invalid_request", "生成数量只能是 1、2 或 4。")
  };
}

function parseDimension(value: unknown): number {
  return typeof value === "number" ? value : Number.NaN;
}

function parseOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseLimitedString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= maxLength ? trimmed : undefined;
}

function parseNullableLimitedString(value: unknown, maxLength: number): string | null | undefined {
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length <= maxLength ? trimmed || null : undefined;
}

function parseNonNegativeInteger(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    return undefined;
  }
  return value;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function parseBenefitsJson(input: Record<string, unknown>): ParseResult<string | null | undefined> {
  const rawValue = Object.hasOwn(input, "benefits")
    ? input.benefits
    : Object.hasOwn(input, "benefitsJson")
      ? input.benefitsJson
      : Object.hasOwn(input, "featuresJson")
        ? input.featuresJson
        : undefined;
  if (rawValue === undefined) {
    return {
      ok: true,
      value: undefined
    };
  }
  if (rawValue === null) {
    return {
      ok: true,
      value: null
    };
  }
  if (typeof rawValue === "string") {
    if (!rawValue.trim()) {
      return {
        ok: true,
        value: null
      };
    }
    try {
      JSON.parse(rawValue);
      return {
        ok: true,
        value: rawValue
      };
    } catch {
      return {
        ok: false,
        error: errorResponse("invalid_benefits_json", "benefitsJson 必须是有效 JSON 字符串。")
      };
    }
  }

  try {
    return {
      ok: true,
      value: JSON.stringify(rawValue)
    };
  } catch {
    return {
      ok: false,
      error: errorResponse("invalid_benefits_json", "套餐权益字段必须可序列化为 JSON。")
    };
  }
}

function parseJsonValue(value: string | null): unknown {
  if (!value) {
    return undefined;
  }
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function errorToMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Request failed.";
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function parseStylePresetFromPresetId(value: unknown): string | undefined {
  const presetId = parseOptionalString(value);
  return presetId && STYLE_PRESETS.some((preset) => preset.id === presetId) ? presetId : undefined;
}

function parseSizePresetFromPresetId(value: unknown): string | undefined {
  const presetId = parseOptionalString(value);
  return presetId && SIZE_PRESETS.some((preset) => preset.id === presetId) ? presetId : undefined;
}

async function readJson(request: Request): Promise<ParseResult<unknown>> {
  const contentType = request.headers.get("content-type");
  if (contentType && !isJsonContentType(contentType)) {
    return {
      ok: false,
      error: errorResponse("unsupported_media_type", "请求 Content-Type 必须是 application/json。")
    };
  }

  let bodyText: string;
  try {
    bodyText = await request.text();
  } catch {
    return {
      ok: false,
      error: errorResponse("invalid_request_body", "请求体读取失败，请重试。")
    };
  }

  if (bodyText.trim().length === 0) {
    return {
      ok: false,
      error: errorResponse("empty_json", "请求体不能为空，必须是有效的 JSON。")
    };
  }

  try {
    return {
      ok: true,
      value: JSON.parse(bodyText) as unknown
    };
  } catch {
    return {
      ok: false,
      error: errorResponse("invalid_json", "请求体必须是有效的 JSON。")
    };
  }
}

function isJsonContentType(contentType: string): boolean {
  const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase();
  return mediaType === "application/json" || Boolean(mediaType?.endsWith("+json"));
}

function parseProjectPayload(input: unknown):
  | {
      ok: true;
      value: ProjectPayload;
    }
  | {
      ok: false;
      error: { error: { code: string; message: string } };
    } {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: errorResponse("invalid_project", "Project payload must be a JSON object.")
    };
  }

  if (!Object.hasOwn(input, "snapshot")) {
    return {
      ok: false,
      error: errorResponse("missing_snapshot", "Project payload must include a snapshot.")
    };
  }

  const snapshot = input.snapshot;
  if (snapshot !== null && (!isRecord(snapshot) || Array.isArray(snapshot))) {
    return {
      ok: false,
      error: errorResponse("invalid_snapshot", "Project snapshot must be an object or null.")
    };
  }

  const snapshotJson = JSON.stringify(snapshot);
  const snapshotBytes = snapshotJson ? Buffer.byteLength(snapshotJson, "utf8") : 0;
  if (!snapshotJson || snapshotBytes > MAX_PROJECT_SNAPSHOT_BYTES) {
    return {
      ok: false,
      error: errorResponse(
        "invalid_snapshot",
        `Project snapshot is too large (${formatBytes(snapshotBytes)}). Maximum is ${formatBytes(MAX_PROJECT_SNAPSHOT_BYTES)}.`
      )
    };
  }

  const name = input.name;
  if (name !== undefined) {
    if (typeof name !== "string" || name.trim().length === 0 || name.length > MAX_PROJECT_NAME_LENGTH) {
      return {
        ok: false,
        error: errorResponse("invalid_name", "Project name must be a non-empty string up to 120 characters.")
      };
    }

    return {
      ok: true,
      value: {
        name: name.trim(),
        snapshotJson
      }
    };
  }

  return {
    ok: true,
    value: {
      snapshotJson
    }
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMainModule(): boolean {
  const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;
  return entryUrl === import.meta.url;
}

if (isMainModule()) {
  await initializeDatabase();

  const server = serve(
    {
      fetch: app.fetch,
      hostname: serverConfig.host,
      port: serverConfig.port
    },
    (info) => {
      console.log(`API listening at http://${info.address}:${info.port}`);
    }
  );

  const shutdown = (): void => {
    void closeDatabase();
    server.close();
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
