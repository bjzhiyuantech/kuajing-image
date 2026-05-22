import { relative } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { and, asc, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Context } from "hono";
import { getAppReleaseConfig, saveAppReleaseConfig } from "./app-release.js";
import { parsePreviewWidth, readStoredAssetPreview } from "./asset-preview.js";
import { resolveRequestTenant, type RequestTenant } from "./auth-context.js";
import {
  AuthError,
  bindCurrentUserPhone,
  bindWechatMiniAppToCurrentUser,
  deleteCurrentUserAccount,
  getAdminWechatMiniAppConfig,
  getAuthSession,
  getAuthSessionFromToken,
  getWechatMiniAppConfig,
  loginUser,
  loginWithWechatMiniApp,
  registerWechatMiniAppUser,
  registerUser,
  requireAdminSession,
  requireAuthSession,
  saveWechatMiniAppConfig,
  toMeResponse,
  updateAuthProfile,
  type AuthSession
} from "./auth-service.js";
import { getExtensionReleaseConfig, saveExtensionReleaseConfig } from "./extension-release.js";
import { hashPassword } from "./auth-crypto.js";
import {
  GENERATION_COUNTS,
  ECOMMERCE_SCENE_TEMPLATES,
  IMAGE_QUALITIES,
  OUTPUT_FORMATS,
  SIZE_PRESETS,
  STYLE_PRESETS,
  ECOMMERCE_MARKETS,
  ECOMMERCE_PLATFORMS,
  ECOMMERCE_TEXT_LANGUAGES,
  composeEcommercePrompt,
  composePrompt,
  validateSceneImageSize,
  type AppConfig,
  type AdminAssetsResponse,
  type AdminAdjustBalanceRequest,
  type AdminCreateRedemptionCodesRequest,
  type AdminPlansResponse,
  type AdminStatsResponse,
  type AdminUsersResponse,
  type CategoryKitPlannerConfigResponse,
  type EcommerceGenerationConcurrencyConfigResponse,
  type SaveAlipayConfigRequest,
  type SaveAppReleaseConfigRequest,
  type SaveBillingSettingsRequest,
  type SaveCategoryKitPlannerConfigRequest,
  type SaveEcommerceGenerationConcurrencyConfigRequest,
  type SaveDemoCanvasConfigRequest,
  type UpdateInvoiceApplicationRequest,
  type SaveHelpArticleRequest,
  type SaveHelpCategoryRequest,
  type SaveInviteRewardSettingsRequest,
  type SaveWechatMiniAppConfigRequest,
  type ApplyInvoiceRequest,
  type EcommerceBatchGenerateRequest,
  type EcommerceBatchReferenceImage,
  type EcommerceBatchGenerateResponse,
  type EcommerceBatchJobStatus,
  type EcommerceCategoryKitAssetInput,
  type EcommerceCategoryKitPlanItem,
  type EcommerceCategoryKitPreparationResponse,
  type EcommerceCategoryKitMissingInput,
  type EcommerceCategoryKitStrategy,
  type EcommerceJobListResponse,
  type EcommerceStatsResponse,
  type EcommerceMarket,
  type EcommercePlatform,
  type EcommerceProductBrief,
  type EcommerceSceneTemplateId,
  type EcommerceTextLanguage,
  type BrandOverlayPlacement,
  type GenerationCount,
  type ImageQuality,
  type ImageSize,
  type OutputFormat,
  type Plan,
  type PromptOptimizeRequest,
  type RedemptionCodeRedeemRequest,
  type NotificationDeviceRegisterRequest,
  type ReferenceImageInput,
  type SeedanceVideoStoryboardPlanRequest,
  type SaveStorageConfigRequest,
  type StylePresetId,
  type VerifyAppleInAppPurchaseRequest
} from "./contracts.js";
import { closeDatabase, ensureTenant, initializeDatabase } from "./database.js";
import { db } from "./database.js";
import {
  BillingError,
  createRechargeOrder,
  adjustUserBalance,
  getBillingSummary,
  getAlipayConfig,
  getBillingSettings,
  handleAlipayNotify,
  listAdminBillingOrders,
  listAdminBillingTransactions,
  listUserBillingOrders,
  listUserBillingTransactions,
  purchasePlan,
  attachGenerationToCharge,
  reserveGenerationCharge,
  saveAlipayConfig,
  saveBillingSettings,
  verifyAppleInAppPurchase
} from "./billing.js";
import { DemoCanvasAssetError, uploadDemoCanvasAsset } from "./demo-canvas-assets.js";
import { getAdminDemoCanvasConfig, getDemoCanvasConfig, saveDemoCanvasConfig } from "./demo-canvas-config.js";
import {
  InvoiceError,
  applyForInvoice,
  getInvoiceApplications,
  listAdminInvoiceApplications,
  updateInvoiceApplication
} from "./invoice-service.js";
import { EmailError, getSmtpSettings, saveSmtpSettings, sendRegisterEmailCode } from "./email-service.js";
import { SmsError, getAliyunSmsSettings, normalizePhone, saveAliyunSmsSettings, sendBindPhoneSmsCode, sendDeleteAccountSmsCode, sendRegisterSmsCode } from "./sms-service.js";
import {
  ProviderError,
  type EditImageProviderInput,
  type ImageProviderInput
} from "./image-provider.js";
import {
  getActiveImageModelConfigs,
  getActiveImageModelConfigsForRequest,
  getConfiguredImageModelNames,
  getImageModelConfig,
  saveImageModelConfig,
  type ImageModelConfigEntry
} from "./image-model-config.js";
import {
  generateCategoryKitPlan,
  getCategoryKitPlannerConfig,
  optimizeImagePrompt,
  planSeedanceVideoStoryboard,
  saveCategoryKitPlannerConfig
} from "./category-kit-planner.js";
import {
  CategoryKitStrategyError,
  createCategoryKitStrategy,
  deleteCategoryKitStrategy,
  getCategoryKitStrategy,
  listCategoryKitStrategies,
  prepareCategoryKitPlanRequest,
  updateCategoryKitStrategy,
  type CategoryKitStrategyQuery,
  type SaveCategoryKitStrategyInput
} from "./category-kit-strategy-service.js";
import {
  getEcommerceGenerationConcurrencyConfig,
  initializeEcommerceGenerationConcurrency,
  saveEcommerceGenerationConcurrencyConfig
} from "./ecommerce-generation-concurrency.js";
import {
  readStoredAsset,
  saveCanvasAsset,
  runReferenceImageGeneration,
  runReferenceImageGenerationWithFallback,
  runTextToImageGeneration,
  runTextToImageGenerationWithFallback,
  type ReservedGenerationCharge
} from "./image-generation.js";
import {
  createEcommerceBatchJob,
  getEcommerceBatchJob,
  getEcommerceBatchSceneCount,
  getEcommerceStats,
  listEcommerceBatchJobs,
  updateEcommerceBatchJob
} from "./ecommerce-jobs.js";
import {
  deleteAdminGalleryOutput,
  deleteGalleryOutput,
  getAdminGalleryImages,
  getGalleryImages,
  getProjectState,
  getPublicGalleryAssetTenant,
  getPublicGalleryImages,
  saveProjectSnapshot,
  updateAdminGalleryPublicStatus
} from "./project-store.js";
import { planExpiryFrom, resetExpiredUserPlans } from "./plan-expiration.js";
import {
  getInviteRewardSettings,
  getInviteSummary,
  listAdminReferralTransactions,
  saveInviteRewardSettings
} from "./referral-service.js";
import {
  RedemptionCodeError,
  createAdminRedemptionCodes,
  listAdminRedemptionCodes,
  normalizeRedemptionCode,
  redeemCode
} from "./redemption-codes.js";
import { runtimePaths, serverConfig } from "./runtime.js";
import { assets, ecommerceBatchJobs, subscriptionPlans, users, workspaceMembers, workspaces } from "./schema.js";
import { getStorageConfig, saveStorageConfig, testStorageConfig } from "./storage-config.js";
import {
  HelpError,
  createHelpArticle,
  createHelpCategory,
  deleteHelpArticle,
  deleteHelpCategory,
  getAdminHelpCenter,
  getHelpCenter,
  updateHelpArticle,
  updateHelpCategory
} from "./help-service.js";
import { HelpAssetError, uploadHelpCenterAsset } from "./help-assets.js";
import { SeedanceVideoError, createSeedanceVideoGeneration } from "./seedance-video.js";
import { getSeedanceVideoConfig, saveSeedanceVideoConfig } from "./seedance-config.js";
import {
  NotificationError,
  createEcommerceJobFinishedNotification,
  getNotificationClientConfig,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  registerNotificationDevice,
  unreadNotificationCount
} from "./notifications.js";
import {
  PhotoshopPackageError,
  createPhotoshopPackage,
  readPhotoshopPackageFile
} from "./photoshop-package.js";

const MAX_PROJECT_SNAPSHOT_BYTES = 100 * 1024 * 1024;
const MAX_PROJECT_NAME_LENGTH = 120;
const MAX_PLAN_NAME_LENGTH = 120;
const MAX_PLAN_DESCRIPTION_LENGTH = 1000;
const MAX_CURRENCY_LENGTH = 16;
const DEFAULT_ADMIN_PLAN_ID = "free";
const DEFAULT_ADMIN_STORAGE_QUOTA_BYTES = 1024 * 1024 * 1024;

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
  categoryKitPlannerPending?: boolean;
  plannedImages?: EcommerceCategoryKitPlanItem[];
  categoryKit?: EcommerceCategoryKitPreparationResponse;
};

type ResolvedCategoryKitPreparationRequest = Pick<
  ResolvedEcommerceBatchGenerateRequest,
  | "product"
  | "platform"
  | "market"
  | "textLanguage"
  | "categoryPath"
  | "categoryName"
  | "strategyId"
  | "strategy"
  | "assets"
  | "missingInputs"
  | "referenceImage"
  | "extraDirection"
>;

interface EcommerceBatchJob {
  jobId: string;
  tenant: RequestTenant;
  input: ResolvedEcommerceBatchGenerateRequest;
  providerConfigs: ImageModelConfigEntry[];
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
  if (error instanceof BillingError) {
    return c.json(errorResponse(error.code, error.message), error.status as 400 | 401 | 402 | 403 | 404 | 409 | 500);
  }
  if (error instanceof RedemptionCodeError) {
    return c.json(errorResponse(error.code, error.message), error.status as 400 | 401 | 402 | 403 | 404 | 409 | 500);
  }
  if (error instanceof InvoiceError) {
    return c.json(errorResponse(error.code, error.message), error.status as 400 | 401 | 402 | 403 | 404 | 409 | 500);
  }
  if (error instanceof HelpError) {
    return c.json(errorResponse(error.code, error.message), error.status as 400 | 401 | 403 | 404 | 409 | 500);
  }
  if (error instanceof HelpAssetError) {
    return c.json(errorResponse(error.code, error.message), error.status as 400 | 401 | 403 | 404 | 409 | 413 | 500 | 502);
  }
  if (error instanceof DemoCanvasAssetError) {
    return c.json(errorResponse(error.code, error.message), error.status as 400 | 401 | 403 | 404 | 409 | 413 | 500 | 502);
  }
  if (error instanceof CategoryKitStrategyError) {
    return c.json(errorResponse(error.code, error.message), error.status as 400 | 404 | 409 | 500);
  }
  if (error instanceof NotificationError) {
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

app.get("/api/config", async (c) => {
  const models = await getConfiguredImageModelNames();
  const configuredModel = models[0];
  const config: AppConfig = {
    model: configuredModel,
    models,
    sizePresets: SIZE_PRESETS,
    stylePresets: STYLE_PRESETS,
    qualities: IMAGE_QUALITIES,
    outputFormats: OUTPUT_FORMATS,
    counts: GENERATION_COUNTS,
    notifications: await getNotificationClientConfig()
  };

  return c.json(config);
});

app.get("/api/extension-release", async (c) => c.json(await getExtensionReleaseConfig()));

app.get("/api/app-release", async (c) => c.json(await getAppReleaseConfig()));

app.get("/api/help", async (c) => c.json(await getHelpCenter()));

app.get("/api/public/demo-canvas", async (c) => c.json(await getDemoCanvasConfig()));

app.get("/api/public/gallery", async (c) => c.json(await getPublicGalleryImages()));

app.get("/api/public/assets/:id/preview", async (c) => {
  const parsedWidth = parsePreviewWidth(c.req.query("width"));
  if (!parsedWidth.ok) {
    return c.json(errorResponse(parsedWidth.code, parsedWidth.message), 400);
  }

  const tenant = await getPublicGalleryAssetTenant(c.req.param("id"));
  if (!tenant) {
    return c.json(errorResponse("not_found", "找不到公开展示的图像资源。"), 404);
  }

  const preview = await readStoredAssetPreview(tenant, c.req.param("id"), parsedWidth.width);
  if (!preview) {
    return c.json(errorResponse("not_found", "找不到公开展示的图像资源。"), 404);
  }

  return new Response(new Uint8Array(preview.bytes), {
    status: 200,
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Disposition": `inline; filename="${downloadFileName(c.req.param("id"))}-${preview.width}.webp"`,
      "Content-Type": "image/webp"
    }
  });
});

app.get("/api/public/assets/:id", async (c) => {
  const tenant = await getPublicGalleryAssetTenant(c.req.param("id"));
  if (!tenant) {
    return c.json(errorResponse("not_found", "找不到公开展示的图像资源。"), 404);
  }

  const asset = await readStoredAsset(tenant, c.req.param("id"));
  if (!asset) {
    return c.json(errorResponse("not_found", "找不到公开展示的图像资源。"), 404);
  }

  return new Response(new Uint8Array(asset.bytes), {
    status: 200,
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Disposition": `inline; filename="${asset.file.fileName}"`,
      "Content-Type": asset.file.mimeType
    }
  });
});

app.get("/api/photoshop/packages/:packageId/:fileName", async (c) => {
  const file = await readPhotoshopPackageFile(c.req.param("packageId"), c.req.param("fileName"), c.req.query("token"));
  if (!file) {
    return c.json(errorResponse("not_found", "找不到 Photoshop 工作流文件，或访问链接已过期。"), 404);
  }

  return new Response(new Uint8Array(file.bytes), {
    status: 200,
    headers: {
      "Cache-Control": "private, max-age=86400",
      "Content-Disposition": `inline; filename="${downloadFileName(file.fileName)}"`,
      "Content-Type": file.mimeType
    }
  });
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

app.post("/api/auth/email-code", async (c) => {
  const payload = await readJson(c.req.raw);
  if (!payload.ok) {
    return c.json(payload.error, 400);
  }

  const parsed = parseEmailCodePayload(payload.value);
  if (!parsed.ok) {
    return c.json(parsed.error, 400);
  }

  try {
    return c.json(await sendRegisterEmailCode(parsed.value.email));
  } catch (error) {
    return emailErrorJson(c, error);
  }
});

app.post("/api/auth/sms-code", async (c) => {
  const payload = await readJson(c.req.raw);
  if (!payload.ok) {
    return c.json(payload.error, 400);
  }

  const parsed = parseSmsCodePayload(payload.value);
  if (!parsed.ok) {
    return c.json(parsed.error, 400);
  }

  try {
    return c.json(await sendRegisterSmsCode(parsed.value.phone));
  } catch (error) {
    return smsErrorJson(c, error);
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

app.get("/api/auth/wechat/miniapp/config", async (c) => {
  return c.json(await getWechatMiniAppConfig());
});

app.post("/api/auth/phone-code", async (c) => {
  try {
    const session = await requireAuthSession(c.req.raw.headers);
    const payload = await readJson(c.req.raw);
    if (!payload.ok) {
      return c.json(payload.error, 400);
    }
    const parsed = parseSmsCodePayload(payload.value);
    if (!parsed.ok) {
      return c.json(parsed.error, 400);
    }
    return c.json(await sendBindPhoneSmsCode(parsed.value.phone, session.user.id));
  } catch (error) {
    return authErrorJson(c, error);
  }
});

app.post("/api/auth/delete-code", async (c) => {
  try {
    const session = await requireAuthSession(c.req.raw.headers);
    if (!session.user.phone) {
      return c.json(errorResponse("phone_missing", "请先绑定手机号后再注销。"), 400);
    }
    return c.json(await sendDeleteAccountSmsCode(session.user.phone, session.user.id));
  } catch (error) {
    return authErrorJson(c, error);
  }
});

app.post("/api/auth/phone", async (c) => {
  const payload = await readJson(c.req.raw);
  if (!payload.ok) {
    return c.json(payload.error, 400);
  }
  const parsed = parseBindPhonePayload(payload.value);
  if (!parsed.ok) {
    return c.json(parsed.error, 400);
  }
  try {
    return c.json(await bindCurrentUserPhone(c.req.raw.headers, parsed.value));
  } catch (error) {
    return authErrorJson(c, error);
  }
});

app.post("/api/auth/wechat/miniapp/login", async (c) => {
  const payload = await readJson(c.req.raw);
  if (!payload.ok) {
    return c.json(payload.error, 400);
  }
  if (!isRecord(payload.value) || typeof payload.value.code !== "string") {
    return c.json(errorResponse("invalid_request", "请提供微信登录 code。"), 400);
  }
  try {
    return c.json(await loginWithWechatMiniApp({ code: payload.value.code }));
  } catch (error) {
    return authErrorJson(c, error);
  }
});

app.post("/api/auth/wechat/miniapp/register", async (c) => {
  const payload = await readJson(c.req.raw);
  if (!payload.ok) {
    return c.json(payload.error, 400);
  }
  if (!isRecord(payload.value) || typeof payload.value.bindToken !== "string") {
    return c.json(errorResponse("invalid_request", "请提供微信绑定凭证。"), 400);
  }
  try {
    return c.json(
      await registerWechatMiniAppUser({
        bindToken: payload.value.bindToken,
        displayName: parseOptionalString(payload.value.displayName),
        email: parseOptionalString(payload.value.email),
        inviteCode: parseOptionalString(payload.value.inviteCode)
      })
    );
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

app.put("/api/auth/me", async (c) => {
  const payload = await readJson(c.req.raw);
  if (!payload.ok) {
    return c.json(payload.error, 400);
  }
  if (!isRecord(payload.value)) {
    return c.json(errorResponse("invalid_request", "请求内容必须是 JSON 对象。"), 400);
  }
  try {
    return c.json(
      await updateAuthProfile(c.req.raw.headers, {
        displayName: parseOptionalString(payload.value.displayName),
        email: parseOptionalString(payload.value.email),
        password: parseOptionalString(payload.value.password)
      })
    );
  } catch (error) {
    return authErrorJson(c, error);
  }
});

app.delete("/api/auth/me", async (c) => {
  const payload = await readJson(c.req.raw);
  if (!payload.ok) {
    return c.json(payload.error, 400);
  }
  if (!isRecord(payload.value)) {
    return c.json(errorResponse("invalid_request", "请求内容必须是 JSON 对象。"), 400);
  }
  try {
    return c.json(await deleteCurrentUserAccount(c.req.raw.headers, { smsCode: parseOptionalString(payload.value.smsCode) ?? "" }));
  } catch (error) {
    return authErrorJson(c, error);
  }
});

app.post("/api/auth/wechat/miniapp/bind", async (c) => {
  const payload = await readJson(c.req.raw);
  if (!payload.ok) {
    return c.json(payload.error, 400);
  }
  if (!isRecord(payload.value) || typeof payload.value.bindToken !== "string") {
    return c.json(errorResponse("invalid_request", "请提供微信绑定凭证。"), 400);
  }
  try {
    return c.json(await bindWechatMiniAppToCurrentUser(c.req.raw.headers, { bindToken: payload.value.bindToken }));
  } catch (error) {
    return authErrorJson(c, error);
  }
});

app.use("/api/*", async (c, next) => {
  if (new URL(c.req.url).pathname === "/api/billing/alipay/notify") {
    await next();
    return;
  }

  const session = (await getAuthSession(c.req.raw.headers)) ?? (await getAssetQueryTokenSession(c));
  if (session) {
    authSessions.set(c, session);
    const path = new URL(c.req.url).pathname;
    if (!session.user.phone && !canAccessWithoutPhoneVerification(path)) {
      return c.json(errorResponse("phone_verification_required", "请先完成手机号验证后再使用账户权益。"), 403);
    }
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

  return c.json(errorResponse("unauthorized", "请先登录账号。"), 401);
});

async function getAssetQueryTokenSession(c: Context): Promise<AuthSession | undefined> {
  if (!c.req.path.startsWith("/api/assets/")) {
    return undefined;
  }

  const token = c.req.query("token") ?? c.req.query("access_token");
  return token ? getAuthSessionFromToken(token) : undefined;
}

function canAccessWithoutPhoneVerification(path: string): boolean {
  return (
    path === "/api/auth/me" ||
    path === "/api/auth/phone-code" ||
    path === "/api/auth/delete-code" ||
    path === "/api/auth/phone" ||
    path === "/api/auth/account" ||
    path.startsWith("/api/admin/")
  );
}

app.get("/api/project", async (c) => c.json(await getProjectState(await requestTenant(c))));

app.get("/api/gallery", async (c) => {
  const session = authSessions.get(c);
  if (session?.user.role === "admin") {
    return c.json(await getAdminGalleryImages());
  }

  return c.json(await getGalleryImages(await requestTenant(c)));
});

app.delete("/api/gallery/:outputId", async (c) => {
  const session = authSessions.get(c);
  const deleted =
    session?.user.role === "admin"
      ? await deleteAdminGalleryOutput(c.req.param("outputId"))
      : await deleteGalleryOutput(await requestTenant(c), c.req.param("outputId"));
  if (!deleted) {
    return c.json(errorResponse("not_found", "找不到请求的 Gallery 图片记录。"), 404);
  }

  return c.json({
    ok: true
  });
});

app.put("/api/admin/gallery/:outputId/public", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  const payload = await readJson(c.req.raw);
  if (!payload.ok) {
    return c.json(payload.error, 400);
  }
  const parsed = parsePublicGalleryPayload(payload.value);
  if (!parsed.ok) {
    return c.json(parsed.error, 400);
  }

  const item = await updateAdminGalleryPublicStatus(c.req.param("outputId"), parsed.value);
  if (!item) {
    return c.json(errorResponse("not_found", "找不到可公开展示的 Gallery 图片记录。"), 404);
  }

  return c.json({ item });
});

app.get("/api/storage/config", async (c) => {
  return c.json(errorResponse("forbidden", "云存储由后台统一配置。"), 403);
});

app.put("/api/storage/config", async (c) => {
  return c.json(errorResponse("forbidden", "云存储由后台统一配置。"), 403);
});

app.post("/api/storage/config/test", async (c) => {
  return c.json(errorResponse("forbidden", "云存储由后台统一配置。"), 403);
});

app.get("/api/admin/storage/config", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  return c.json(await getStorageConfig());
});

app.put("/api/admin/storage/config", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  const payload = await readJson(c.req.raw);
  if (!payload.ok) {
    return c.json(payload.error, 400);
  }

  const parsed = parseStorageConfigPayload(payload.value);
  if (!parsed.ok) {
    return c.json(parsed.error, 400);
  }

  try {
    return c.json(await saveStorageConfig(undefined, parsed.value));
  } catch (error) {
    return c.json(errorResponse("storage_config_error", errorToMessage(error)), 400);
  }
});

app.post("/api/admin/storage/config/test", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  const payload = await readJson(c.req.raw);
  if (!payload.ok) {
    return c.json(payload.error, 400);
  }

  const parsed = parseStorageConfigPayload(payload.value);
  if (!parsed.ok) {
    return c.json(parsed.error, 400);
  }

  return c.json(await testStorageConfig(undefined, parsed.value));
});

app.get("/api/assets/:id/preview", async (c) => {
  const parsedWidth = parsePreviewWidth(c.req.query("width"));
  if (!parsedWidth.ok) {
    return c.json(errorResponse(parsedWidth.code, parsedWidth.message), 400);
  }

  const preview = await readStoredAssetPreview(await assetReadTenant(c, c.req.param("id")), c.req.param("id"), parsedWidth.width);
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
  const asset = await readStoredAsset(await assetReadTenant(c, c.req.param("id")), c.req.param("id"));
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
  const asset = await readStoredAsset(await assetReadTenant(c, c.req.param("id")), c.req.param("id"));
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

app.post("/api/assets", async (c) => {
  let formData: FormData;
  try {
    formData = await c.req.raw.formData();
  } catch {
    return c.json(errorResponse("invalid_request_body", "无法读取上传文件。"), 400);
  }

  const file = formData.get("file");
  const width = Number(formData.get("width"));
  const height = Number(formData.get("height"));
  if (!(file instanceof File) || !file.type.startsWith("image/")) {
    return c.json(errorResponse("invalid_asset", "请上传有效的图片文件。"), 400);
  }
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return c.json(errorResponse("invalid_asset_dimensions", "请提供有效的图片尺寸。"), 400);
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const asset = await saveCanvasAsset(await requestTenant(c), {
    bytes,
    fileName: file.name || "canvas-image.png",
    mimeType: file.type,
    width: Math.round(width),
    height: Math.round(height)
  });

  return c.json({ asset });
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

  try {
    return c.json(
      await runTextToImageGenerationWithFallback(
        await requestTenant(c),
        parsed.value,
        await getActiveImageModelConfigsForRequest(parsed.value.modelConfigId),
        c.req.raw.signal
      )
    );
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

  try {
    return c.json(
      await runReferenceImageGenerationWithFallback(
        await requestTenant(c),
        parsed.value,
        await getActiveImageModelConfigsForRequest(parsed.value.modelConfigId),
        c.req.raw.signal
      )
    );
  } catch (error) {
    if (error instanceof ProviderError) {
      return providerErrorJson(c, error);
    }

    throw error;
  }
});

app.post("/api/images/prompt/optimize", async (c) => {
  const payload = await readJson(c.req.raw);
  if (!payload.ok) {
    return c.json(payload.error, 400);
  }

  const parsed = parsePromptOptimizePayload(payload.value);
  if (!parsed.ok) {
    return c.json(parsed.error, 400);
  }

  try {
    return c.json(await optimizeImagePrompt(parsed.value));
  } catch (error) {
    if (error instanceof ProviderError) {
      return providerErrorJson(c, error);
    }

    throw error;
  }
});

app.post("/api/photoshop/packages", async (c) => {
  const payload = await readJson(c.req.raw);
  if (!payload.ok) {
    return c.json(payload.error, 400);
  }

  const parsed = parsePhotoshopPackagePayload(payload.value);
  if (!parsed.ok) {
    return c.json(parsed.error, 400);
  }

  try {
    return c.json(
      await createPhotoshopPackage(await requestTenant(c), {
        ...parsed.value,
        baseUrl: new URL(c.req.url).origin
      })
    );
  } catch (error) {
    if (error instanceof PhotoshopPackageError) {
      return c.json(errorResponse(error.code, error.message), error.status as 400 | 404 | 500);
    }

    throw error;
  }
});

app.post("/api/videos/seedance", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  let formData: FormData;
  try {
    formData = await c.req.raw.formData();
  } catch {
    return c.json(errorResponse("invalid_request_body", "无法读取视频生成表单。"), 400);
  }

  try {
    return c.json(await createSeedanceVideoGeneration(await requestTenant(c), formData, c.req.raw.signal));
  } catch (error) {
    if (error instanceof SeedanceVideoError) {
      return c.json(errorResponse(error.code, error.message), error.status as 400 | 401 | 402 | 403 | 404 | 409 | 413 | 429 | 500 | 502 | 503 | 504);
    }

    throw error;
  }
});

app.post("/api/videos/seedance/storyboard-plan", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  const payload = await readJson(c.req.raw);
  if (!payload.ok) {
    return c.json(payload.error, 400);
  }

  const parsed = parseSeedanceStoryboardPlanPayload(payload.value);
  if (!parsed.ok) {
    return c.json(parsed.error, 400);
  }

  try {
    return c.json(await planSeedanceVideoStoryboard(parsed.value));
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

  const providerConfigs = await getActiveImageModelConfigs();
  if (providerConfigs.length === 0) {
    return providerErrorJson(c, new ProviderError("missing_api_key", "未配置可用的图像模型，请在后台模型管理中添加 API Key。", 500));
  }

  const tenant = await requestTenant(c);
  const session = authSessions.get(c);
  const now = new Date().toISOString();
  const jobId = randomUUID();
  const input: ResolvedEcommerceBatchGenerateRequest = {
    ...parsed.value,
    createComparisonCollage: parsed.value.createComparisonCollage === true && session?.user.role === "admin"
  };

  const response = await createEcommerceBatchJob({
    jobId,
    tenant,
    input,
    message: "批量任务已创建，服务端会按场景并发生成。",
    now
  });

  let charge: ReservedGenerationCharge;
  try {
    charge = await reserveGenerationCharge({
      tenant,
      imageCount: getEcommerceBatchSceneCount(input) * input.countPerScene
    });
    await attachGenerationToCharge(charge.transactionId, jobId);
  } catch (error) {
    await updateEcommerceBatchJob(tenant, jobId, {
      status: "failed",
      message: errorToMessage(error),
      completedAt: new Date().toISOString()
    });
    await notifyEcommerceJobFinished({
      tenant,
      jobId,
      status: "failed",
      productTitle: input.product.title,
      totalScenes: getEcommerceBatchSceneCount(input),
      completedScenes: 0,
      records: []
    });
    throw error;
  }

  const job: EcommerceBatchJob = {
    jobId,
    tenant,
    input,
    providerConfigs,
    totalScenes: getEcommerceBatchSceneCount(input),
    completedScenes: 0,
    records: []
  };
  runningEcommerceBatchJobs.set(job.jobId, job);
  void runEcommerceBatchJob(job.jobId);

  return c.json(response, 202);
});

app.post("/api/ecommerce/images/category-kit-prepare", async (c) => {
  const payload = await readJson(c.req.raw);
  if (!payload.ok) {
    return c.json(payload.error, 400);
  }

  const parsed = parseCategoryKitPreparationPayload(payload.value);
  if (!parsed.ok) {
    return c.json(parsed.error, 400);
  }
  if (!parsed.value.referenceImage) {
    return c.json(errorResponse("invalid_reference_image", "品类套图预检需要至少一张主商品图。"), 400);
  }

  const strategy = await resolveCategoryKitStrategyForRequest(parsed.value);
  return c.json(
    await prepareCategoryKitPlanRequest({
      product: parsed.value.product,
      platform: parsed.value.platform,
      market: parsed.value.market,
      textLanguage: parsed.value.textLanguage,
      categoryPath: parsed.value.categoryPath,
      categoryName: parsed.value.categoryName,
      strategyId: parsed.value.strategyId,
      strategy,
      assets: parsed.value.assets,
      missingInputs: parsed.value.missingInputs,
      referenceImage: parsed.value.referenceImage,
      extraDirection: parsed.value.extraDirection
    })
  );
});

app.post("/api/ecommerce/images/category-kit-plan", async (c) => {
  const payload = await readJson(c.req.raw);
  if (!payload.ok) {
    return c.json(payload.error, 400);
  }

  const parsed = parseEcommerceBatchPayload(payload.value);
  if (!parsed.ok) {
    return c.json(parsed.error, 400);
  }
  if (!parsed.value.referenceImage) {
    return c.json(errorResponse("invalid_reference_image", "品类套图规划需要至少一张主商品图。"), 400);
  }

  try {
    const strategy = await resolveCategoryKitStrategyForRequest(parsed.value);
    const categoryKit = await prepareCategoryKitPlanRequest({
      product: parsed.value.product,
      platform: parsed.value.platform,
      market: parsed.value.market,
      textLanguage: parsed.value.textLanguage,
      categoryPath: parsed.value.categoryPath,
      categoryName: parsed.value.categoryName,
      strategyId: parsed.value.strategyId,
      strategy,
      assets: parsed.value.assets,
      missingInputs: parsed.value.missingInputs,
      referenceImage: parsed.value.referenceImage,
      extraDirection: parsed.value.extraDirection
    });
    const plan = await generateCategoryKitPlan({
      product: parsed.value.product,
      platform: parsed.value.platform,
      market: parsed.value.market,
      textLanguage: parsed.value.textLanguage,
      requestedImageCount: parsed.value.sceneTemplateIds.length,
      requestedSceneTemplateIds: parsed.value.sceneTemplateIds,
      categoryPath: categoryKit.categoryPath,
      categoryName: categoryKit.categoryName,
      strategy: categoryKit.strategy,
      assets: categoryKit.assets,
      missingInputs: categoryKit.missingInputs,
      referenceImage: parsed.value.referenceImage,
      extraDirection: parsed.value.extraDirection
    });

    return c.json({
      ...plan,
      categoryPath: categoryKit.categoryPath,
      categoryName: categoryKit.categoryName,
      strategy: categoryKit.strategy,
      assets: categoryKit.assets,
      missingInputs: categoryKit.missingInputs,
      warnings: categoryKit.warnings,
      notes: categoryKit.notes
    });
  } catch (error) {
    if (error instanceof ProviderError) {
      return providerErrorJson(c, error);
    }

    throw error;
  }
});

app.post("/api/ecommerce/images/category-kit-generate", async (c) => {
  const payload = await readJson(c.req.raw);
  if (!payload.ok) {
    return c.json(payload.error, 400);
  }

  const parsed = parseEcommerceBatchPayload(payload.value);
  if (!parsed.ok) {
    return c.json(parsed.error, 400);
  }
  if (!parsed.value.referenceImage) {
    return c.json(errorResponse("invalid_reference_image", "品类套图需要至少一张参考图。"), 400);
  }

  const tenant = await requestTenant(c);
  const session = authSessions.get(c);
  const now = new Date().toISOString();
  const jobId = randomUUID();
  const input: ResolvedEcommerceBatchGenerateRequest = {
    ...parsed.value,
    createComparisonCollage: parsed.value.createComparisonCollage === true && session?.user.role === "admin",
    categoryKitPlannerPending: !parsed.value.plannedImages?.length,
    countPerScene: 1
  };
  const providerConfigs = await getActiveImageModelConfigs();
  logEcommerceCategoryKit("request-received", {
    jobId,
    workspaceId: tenant.workspaceId,
    productTitle: input.product.title || "",
    referenceImage: Boolean(input.referenceImage),
    sceneTemplateCount: input.sceneTemplateIds.length,
    imageModelCount: providerConfigs.length
  });
  if (providerConfigs.length === 0) {
    return providerErrorJson(c, new ProviderError("missing_api_key", "未配置可用的图像模型，请在后台模型管理中添加 API Key。", 500));
  }

  const response = await createEcommerceBatchJob({
    jobId,
    tenant,
    input,
    message: "品类套图任务已进入后端队列，服务端会先调用文本模型规划，再并发生成。",
    now
  });

  const job: EcommerceBatchJob = {
    jobId,
    tenant,
    input,
    providerConfigs,
    totalScenes: getEcommerceBatchSceneCount(input),
    completedScenes: 0,
    records: []
  };
  runningEcommerceBatchJobs.set(job.jobId, job);
  logEcommerceCategoryKit("queued", {
    jobId,
    workspaceId: tenant.workspaceId,
    totalScenes: response.totalScenes
  });
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

app.get("/api/notifications", async (c) => {
  return c.json(await listNotifications(await requestTenant(c), parseListLimit(c.req.query("limit"))));
});

app.get("/api/notifications/unread-count", async (c) => {
  return c.json({ unreadCount: await unreadNotificationCount(await requestTenant(c)) });
});

app.post("/api/notifications/read-all", async (c) => {
  return c.json(await markAllNotificationsRead(await requestTenant(c)));
});

app.post("/api/notifications/:id/read", async (c) => {
  return c.json(await markNotificationRead(await requestTenant(c), c.req.param("id")));
});

app.post("/api/notifications/devices", async (c) => {
  const payload = await readJson(c.req.raw);
  if (!payload.ok) {
    return c.json(payload.error, 400);
  }
  const parsed = parseNotificationDevicePayload(payload.value);
  if (!parsed.ok) {
    return c.json(parsed.error, 400);
  }
  return c.json(await registerNotificationDevice(await requestTenant(c), parsed.value));
});

app.get("/api/billing/transactions", async (c) => {
  return c.json(await listUserBillingTransactions(await requestTenant(c), parseListLimit(c.req.query("limit"))));
});

app.get("/api/billing/orders", async (c) => {
  return c.json(await listUserBillingOrders(await requestTenant(c), parseListLimit(c.req.query("limit"))));
});

app.get("/api/billing/summary", async (c) => {
  return c.json(await getBillingSummary(await requestTenant(c)));
});

app.post("/api/redemption-codes/redeem", async (c) => {
  const payload = await readJson(c.req.raw);
  if (!payload.ok) {
    return c.json(payload.error, 400);
  }
  const parsed = parseRedeemCodePayload(payload.value);
  if (!parsed.ok) {
    return c.json(parsed.error, 400);
  }
  return c.json(await redeemCode(await requestTenant(c), parsed.value));
});

app.get("/api/billing/invoice/applications", async (c) => {
  return c.json(await getInvoiceApplications(await requestTenant(c)));
});

app.post("/api/billing/invoice/applications", async (c) => {
  const payload = await readJson(c.req.raw);
  if (!payload.ok) {
    return c.json(payload.error, 400);
  }
  const parsed = parseInvoiceApplicationPayload(payload.value);
  if (!parsed.ok) {
    return c.json(parsed.error, 400);
  }
  return c.json(await applyForInvoice(await requestTenant(c), parsed.value), 201);
});

app.get("/api/referral/summary", async (c) => {
  const origin = new URL(c.req.url).origin;
  return c.json(await getInviteSummary((await requestTenant(c)).userId, origin));
});

app.post("/api/billing/recharge", async (c) => {
  const payload = await readJson(c.req.raw);
  if (!payload.ok) {
    return c.json(payload.error, 400);
  }
  const parsed = parseRechargePayload(payload.value);
  if (!parsed.ok) {
    return c.json(parsed.error, 400);
  }
  return c.json(await createRechargeOrder(await requestTenant(c), parsed.value), 201);
});

app.post("/api/billing/plans/:planId/purchase", async (c) => {
  const payload = await readJson(c.req.raw);
  if (!payload.ok) {
    return c.json(payload.error, 400);
  }
  const parsed = parsePurchasePlanPayload(payload.value);
  if (!parsed.ok) {
    return c.json(parsed.error, 400);
  }
  const planId = c.req.param("planId");
  return c.json(await purchasePlan(await requestTenant(c), planId, { ...parsed.value, planId }), 201);
});

app.post("/api/billing/apple-iap/verify", async (c) => {
  const payload = await readJson(c.req.raw);
  if (!payload.ok) {
    return c.json(payload.error, 400);
  }
  const parsed = parseAppleInAppPurchasePayload(payload.value);
  if (!parsed.ok) {
    return c.json(parsed.error, 400);
  }
  return c.json(await verifyAppleInAppPurchase(await requestTenant(c), parsed.value), 201);
});

app.post("/api/billing/alipay/notify", async (c) => {
  const form = await c.req.parseBody();
  const payload: Record<string, string> = {};
  for (const [key, value] of Object.entries(form)) {
    if (typeof value === "string") {
      payload[key] = value;
    }
  }
  const result = await handleAlipayNotify(payload);
  return c.text(result);
});

app.get("/api/admin/stats", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  return c.json(await getAdminStats());
});

app.get("/api/admin/help", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  return c.json(await getAdminHelpCenter());
});

app.get("/api/admin/demo-canvas", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  return c.json(await getAdminDemoCanvasConfig());
});

app.put("/api/admin/demo-canvas", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  const payload = await readJson(c.req.raw);
  if (!payload.ok) {
    return c.json(payload.error, 400);
  }
  const parsed = parseDemoCanvasPayload(payload.value);
  if (!parsed.ok) {
    return c.json(parsed.error, 400);
  }

  return c.json(await saveDemoCanvasConfig(parsed.value));
});

app.post("/api/admin/demo-canvas/assets", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  let formData: FormData;
  try {
    formData = await c.req.raw.formData();
  } catch {
    return c.json(errorResponse("invalid_request_body", "无法读取上传图片。"), 400);
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return c.json(errorResponse("invalid_demo_canvas_asset", "请上传有效的图片文件。"), 400);
  }

  const upload = await uploadDemoCanvasAsset({
    bytes: Buffer.from(await file.arrayBuffer()),
    fileName: file.name || "demo-canvas-image.png",
    mimeType: file.type
  });

  return c.json(upload, 201);
});

app.post("/api/admin/help/assets", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  let formData: FormData;
  try {
    formData = await c.req.raw.formData();
  } catch {
    return c.json(errorResponse("invalid_request_body", "无法读取上传图片。"), 400);
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return c.json(errorResponse("invalid_help_asset", "请上传有效的图片文件。"), 400);
  }

  const upload = await uploadHelpCenterAsset({
    bytes: Buffer.from(await file.arrayBuffer()),
    fileName: file.name || "help-image.png",
    mimeType: file.type
  });

  return c.json(upload, 201);
});

app.post("/api/admin/help/categories", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  const payload = await readJson(c.req.raw);
  if (!payload.ok) {
    return c.json(payload.error, 400);
  }
  const parsed = parseHelpCategoryPayload(payload.value);
  if (!parsed.ok) {
    return c.json(parsed.error, 400);
  }

  return c.json(await createHelpCategory(parsed.value), 201);
});

app.put("/api/admin/help/categories/:categoryId", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  const payload = await readJson(c.req.raw);
  if (!payload.ok) {
    return c.json(payload.error, 400);
  }
  const parsed = parseHelpCategoryPayload(payload.value);
  if (!parsed.ok) {
    return c.json(parsed.error, 400);
  }

  return c.json(await updateHelpCategory(c.req.param("categoryId"), parsed.value));
});

app.delete("/api/admin/help/categories/:categoryId", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  return c.json(await deleteHelpCategory(c.req.param("categoryId")));
});

app.post("/api/admin/help/articles", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  const payload = await readJson(c.req.raw);
  if (!payload.ok) {
    return c.json(payload.error, 400);
  }
  const parsed = parseHelpArticlePayload(payload.value);
  if (!parsed.ok) {
    return c.json(parsed.error, 400);
  }

  return c.json(await createHelpArticle(parsed.value), 201);
});

app.put("/api/admin/help/articles/:articleId", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  const payload = await readJson(c.req.raw);
  if (!payload.ok) {
    return c.json(payload.error, 400);
  }
  const parsed = parseHelpArticlePayload(payload.value);
  if (!parsed.ok) {
    return c.json(parsed.error, 400);
  }

  return c.json(await updateHelpArticle(c.req.param("articleId"), parsed.value));
});

app.delete("/api/admin/help/articles/:articleId", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  return c.json(await deleteHelpArticle(c.req.param("articleId")));
});

app.get("/api/admin/users", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  return c.json(await getAdminUsers());
});

app.post("/api/admin/users", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  const payload = await readJson(c.req.raw);
  if (!payload.ok) {
    return c.json(payload.error, 400);
  }

  const parsed = parseAdminUserPayload(payload.value);
  if (!parsed.ok) {
    return c.json(parsed.error, 400);
  }

  const result = await createOrPromoteAdminUser(parsed.value);
  return c.json({ user: await getAdminUserOrThrow(result.userId), created: result.created }, result.created ? 201 : 200);
});

app.get("/api/admin/plans", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  return c.json(await getAdminPlans());
});

app.get("/api/admin/billing/settings", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  return c.json(await getBillingSettings());
});

app.get("/api/admin/redemption-codes", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  return c.json(await listAdminRedemptionCodes(parseListLimit(c.req.query("limit"))));
});

app.post("/api/admin/redemption-codes", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  const payload = await readJson(c.req.raw);
  if (!payload.ok) {
    return c.json(payload.error, 400);
  }

  const parsed = parseAdminRedemptionCodesPayload(payload.value);
  if (!parsed.ok) {
    return c.json(parsed.error, 400);
  }

  const session = authSessions.get(c) ?? (await requireAdminSession(c.req.raw.headers));
  return c.json(await createAdminRedemptionCodes(session.user.id, parsed.value), 201);
});

app.put("/api/admin/billing/settings", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  const payload = await readJson(c.req.raw);
  if (!payload.ok) {
    return c.json(payload.error, 400);
  }

  const parsed = parseBillingSettingsPayload(payload.value);
  if (!parsed.ok) {
    return c.json(parsed.error, 400);
  }

  return c.json(await saveBillingSettings(parsed.value));
});

app.get("/api/admin/extension-release", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  return c.json(await getExtensionReleaseConfig());
});

app.put("/api/admin/extension-release", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  const payload = await readJson(c.req.raw);
  if (!payload.ok) {
    return c.json(payload.error, 400);
  }

  const parsed = parseExtensionReleasePayload(payload.value);
  if (!parsed.ok) {
    return c.json(parsed.error, 400);
  }

  return c.json(await saveExtensionReleaseConfig(parsed.value));
});

app.get("/api/admin/app-release", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  return c.json(await getAppReleaseConfig());
});

app.put("/api/admin/app-release", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  const payload = await readJson(c.req.raw);
  if (!payload.ok) {
    return c.json(payload.error, 400);
  }

  const parsed = parseAppReleasePayload(payload.value);
  if (!parsed.ok) {
    return c.json(parsed.error, 400);
  }

  return c.json(await saveAppReleaseConfig(parsed.value));
});

app.get("/api/admin/referral/settings", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  return c.json(await getInviteRewardSettings());
});

app.put("/api/admin/referral/settings", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  const payload = await readJson(c.req.raw);
  if (!payload.ok) {
    return c.json(payload.error, 400);
  }

  const parsed = parseInviteSettingsPayload(payload.value);
  if (!parsed.ok) {
    return c.json(parsed.error, 400);
  }

  return c.json(await saveInviteRewardSettings(parsed.value));
});

app.get("/api/admin/referral/transactions", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  return c.json(await listAdminReferralTransactions(parseListLimit(c.req.query("limit"))));
});

app.get("/api/admin/image-models", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  return c.json(await getImageModelConfig());
});

app.put("/api/admin/image-models", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  const payload = await readJson(c.req.raw);
  if (!payload.ok) {
    return c.json(payload.error, 400);
  }

  const parsed = parseImageModelConfigPayload(payload.value);
  if (!parsed.ok) {
    return c.json(parsed.error, 400);
  }

  return c.json(await saveImageModelConfig(parsed.value));
});

app.get("/api/admin/ecommerce/category-kit-planner", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  return c.json(await getCategoryKitPlannerConfig());
});

app.put("/api/admin/ecommerce/category-kit-planner", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  const payload = await readJson(c.req.raw);
  if (!payload.ok) {
    return c.json(payload.error, 400);
  }

  const parsed = parseCategoryKitPlannerConfigPayload(payload.value);
  if (!parsed.ok) {
    return c.json(parsed.error, 400);
  }

  return c.json(await saveCategoryKitPlannerConfig(parsed.value));
});

app.get("/api/admin/ecommerce/category-kit-strategies", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  return c.json(await listCategoryKitStrategies(parseCategoryKitStrategyQuery(c)));
});

app.get("/api/admin/ecommerce/category-strategies", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  return c.json(await listCategoryKitStrategies(parseCategoryKitStrategyQuery(c)));
});

app.get("/api/admin/ecommerce/category-kit-strategies/:strategyId", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  return c.json(await getCategoryKitStrategy(c.req.param("strategyId")));
});

app.get("/api/admin/ecommerce/category-strategies/:strategyId", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  return c.json(await getCategoryKitStrategy(c.req.param("strategyId")));
});

app.post("/api/admin/ecommerce/category-kit-strategies", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  const payload = await readJson(c.req.raw);
  if (!payload.ok) {
    return c.json(payload.error, 400);
  }
  const parsed = parseCategoryKitStrategyPayload(payload.value);
  if (!parsed.ok) {
    return c.json(parsed.error, 400);
  }

  return c.json(await createCategoryKitStrategy(parsed.value), 201);
});

app.post("/api/admin/ecommerce/category-strategies", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  const payload = await readJson(c.req.raw);
  if (!payload.ok) {
    return c.json(payload.error, 400);
  }
  const parsed = parseCategoryKitStrategyPayload(payload.value);
  if (!parsed.ok) {
    return c.json(parsed.error, 400);
  }

  return c.json(await createCategoryKitStrategy(parsed.value), 201);
});

app.put("/api/admin/ecommerce/category-kit-strategies/:strategyId", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  const payload = await readJson(c.req.raw);
  if (!payload.ok) {
    return c.json(payload.error, 400);
  }
  const parsed = parseCategoryKitStrategyPayload(payload.value);
  if (!parsed.ok) {
    return c.json(parsed.error, 400);
  }

  return c.json(await updateCategoryKitStrategy(c.req.param("strategyId"), parsed.value));
});

app.put("/api/admin/ecommerce/category-strategies/:strategyId", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  const payload = await readJson(c.req.raw);
  if (!payload.ok) {
    return c.json(payload.error, 400);
  }
  const parsed = parseCategoryKitStrategyPayload(payload.value);
  if (!parsed.ok) {
    return c.json(parsed.error, 400);
  }

  return c.json(await updateCategoryKitStrategy(c.req.param("strategyId"), parsed.value));
});

app.delete("/api/admin/ecommerce/category-kit-strategies/:strategyId", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  return c.json(await deleteCategoryKitStrategy(c.req.param("strategyId")));
});

app.delete("/api/admin/ecommerce/category-strategies/:strategyId", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  return c.json(await deleteCategoryKitStrategy(c.req.param("strategyId")));
});

app.get("/api/admin/video/seedance", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  return c.json(await getSeedanceVideoConfig());
});

app.put("/api/admin/video/seedance", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  const payload = await readJson(c.req.raw);
  if (!payload.ok) {
    return c.json(payload.error, 400);
  }

  const parsed = parseSeedanceVideoConfigPayload(payload.value);
  if (!parsed.ok) {
    return c.json(parsed.error, 400);
  }

  return c.json(await saveSeedanceVideoConfig(parsed.value));
});

app.get("/api/admin/image-generation/concurrency", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  return c.json(await getEcommerceGenerationConcurrencyConfig());
});

app.put("/api/admin/image-generation/concurrency", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  const payload = await readJson(c.req.raw);
  if (!payload.ok) {
    return c.json(payload.error, 400);
  }

  const parsed = parseEcommerceGenerationConcurrencyConfigPayload(payload.value);
  if (!parsed.ok) {
    return c.json(parsed.error, 400);
  }

  return c.json(await saveEcommerceGenerationConcurrencyConfig(parsed.value));
});

app.get("/api/admin/ecommerce/concurrency", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  return c.json(await getEcommerceGenerationConcurrencyConfig());
});

app.put("/api/admin/ecommerce/concurrency", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  const payload = await readJson(c.req.raw);
  if (!payload.ok) {
    return c.json(payload.error, 400);
  }

  const parsed = parseEcommerceGenerationConcurrencyConfigPayload(payload.value);
  if (!parsed.ok) {
    return c.json(parsed.error, 400);
  }

  return c.json(await saveEcommerceGenerationConcurrencyConfig(parsed.value));
});

app.get("/api/admin/payment/alipay", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  return c.json(await getAlipayConfig());
});

app.put("/api/admin/payment/alipay", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  const payload = await readJson(c.req.raw);
  if (!payload.ok) {
    return c.json(payload.error, 400);
  }

  const parsed = parseAlipayConfigPayload(payload.value);
  if (!parsed.ok) {
    return c.json(parsed.error, 400);
  }

  return c.json(await saveAlipayConfig(parsed.value));
});

app.get("/api/admin/email/smtp", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  return c.json(await getSmtpSettings());
});

app.put("/api/admin/email/smtp", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  const payload = await readJson(c.req.raw);
  if (!payload.ok) {
    return c.json(payload.error, 400);
  }

  const parsed = parseSmtpSettingsPayload(payload.value);
  if (!parsed.ok) {
    return c.json(parsed.error, 400);
  }

  try {
    return c.json(await saveSmtpSettings(parsed.value));
  } catch (error) {
    return emailErrorJson(c, error);
  }
});

app.get("/api/admin/sms/aliyun", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  return c.json(await getAliyunSmsSettings());
});

app.put("/api/admin/sms/aliyun", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  const payload = await readJson(c.req.raw);
  if (!payload.ok) {
    return c.json(payload.error, 400);
  }

  const parsed = parseAliyunSmsSettingsPayload(payload.value);
  if (!parsed.ok) {
    return c.json(parsed.error, 400);
  }

  try {
    return c.json(await saveAliyunSmsSettings(parsed.value));
  } catch (error) {
    return smsErrorJson(c, error);
  }
});

app.get("/api/admin/auth/wechat/miniapp", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  return c.json(await getAdminWechatMiniAppConfig());
});

app.put("/api/admin/auth/wechat/miniapp", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  const payload = await readJson(c.req.raw);
  if (!payload.ok) {
    return c.json(payload.error, 400);
  }

  const parsed = parseWechatMiniAppConfigPayload(payload.value);
  if (!parsed.ok) {
    return c.json(parsed.error, 400);
  }

  return c.json(await saveWechatMiniAppConfig(parsed.value));
});

app.get("/api/admin/billing/transactions", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  return c.json(await listAdminBillingTransactions(parseListLimit(c.req.query("limit"))));
});

app.get("/api/admin/billing/orders", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  return c.json(await listAdminBillingOrders(parseListLimit(c.req.query("limit"))));
});

app.get("/api/admin/billing/invoice/applications", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  return c.json(await listAdminInvoiceApplications(parseListLimit(c.req.query("limit"))));
});

app.put("/api/admin/billing/invoice/applications/:applicationId", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  const payload = await readJson(c.req.raw);
  if (!payload.ok) {
    return c.json(payload.error, 400);
  }
  const parsed = parseInvoiceApplicationUpdatePayload(payload.value);
  if (!parsed.ok) {
    return c.json(parsed.error, 400);
  }
  const session = authSessions.get(c) ?? (await requireAdminSession(c.req.raw.headers));
  return c.json({ application: await updateInvoiceApplication(c.req.param("applicationId"), session.user.id, parsed.value) });
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

  const updatedAt = new Date().toISOString();
  await db.transaction(async (tx) => {
    await tx
      .update(subscriptionPlans)
      .set({
        ...parsed.value,
        updatedAt
      })
      .where(eq(subscriptionPlans.id, planId));

    if (parsed.value.imageQuota !== undefined) {
      await tx
        .update(users)
        .set({
          quotaTotal: parsed.value.imageQuota,
          updatedAt
        })
        .where(and(eq(users.planId, planId), eq(users.quotaTotal, Number(existing.imageQuota ?? 0))));
    }
  });

  return c.json({ plan: await getPlanOrThrow(planId) });
});

app.delete("/api/admin/plans/:planId", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  const planId = c.req.param("planId");
  const existing = await getPlanOrUndefined(planId);
  if (!existing) {
    return c.json(errorResponse("not_found", "套餐不存在。"), 404);
  }
  if (planId === DEFAULT_ADMIN_PLAN_ID) {
    return c.json(errorResponse("protected_plan", "默认套餐不能删除。"), 409);
  }

  const defaultPlan = await getPlanOrUndefined(DEFAULT_ADMIN_PLAN_ID);
  if (!defaultPlan) {
    return c.json(errorResponse("default_plan_missing", "默认套餐不存在，暂时不能删除套餐。"), 409);
  }

  const updatedAt = new Date().toISOString();
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({
        planId: defaultPlan.id,
        planExpiresAt: null,
        quotaTotal: Number(defaultPlan.imageQuota ?? 0),
        storageQuotaBytes: Number(defaultPlan.storageQuotaBytes ?? 0),
        updatedAt
      })
      .where(eq(users.planId, planId));
    await tx.delete(subscriptionPlans).where(eq(subscriptionPlans.id, planId));
  });

  return c.json({ ok: true });
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
  const now = new Date();

  await db
    .update(users)
    .set({
      planId: plan.id,
      planExpiresAt: plan.id === "free" ? null : planExpiryFrom(now),
      quotaTotal,
      storageQuotaBytes,
      updatedAt: now.toISOString()
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

app.put("/api/admin/users/:userId/balance", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  const payload = await readJson(c.req.raw);
  if (!payload.ok) {
    return c.json(payload.error, 400);
  }

  const parsed = parseBalanceAdjustmentPayload(payload.value);
  if (!parsed.ok) {
    return c.json(parsed.error, 400);
  }

  const session = authSessions.get(c) ?? (await requireAdminSession(c.req.raw.headers));
  await adjustUserBalance({
    userId: c.req.param("userId"),
    adminUserId: session.user.id,
    ...parsed.value
  });

  return c.json({ user: await getAdminUserOrThrow(c.req.param("userId")) });
});

app.get("/api/admin/ecommerce/jobs", async (c) => {
  const unauthorized = await requireAdminRoute(c);
  if (unauthorized) {
    return unauthorized;
  }

  const limit = c.req.query("limit") ? parseListLimit(c.req.query("limit")) : undefined;
  return c.json(await getAdminEcommerceJobs(limit));
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
    if (job.input.categoryKitPlannerPending) {
      if (!job.input.referenceImage) {
        throw new Error("品类套图需要至少一张参考图。");
      }
      const categoryKitReferenceImage = job.input.referenceImage;

      logEcommerceCategoryKit("planner-stage-start", {
        jobId,
        workspaceId: job.tenant.workspaceId,
        productTitle: job.input.product.title || "",
        hasReferenceImage: Boolean(job.input.referenceImage),
        sceneTemplateCount: job.input.sceneTemplateIds.length
      });

      const strategy = await resolveCategoryKitStrategyForRequest(job.input);
      const categoryKit = await prepareCategoryKitPlanRequest({
        product: job.input.product,
        platform: job.input.platform,
        market: job.input.market,
        textLanguage: job.input.textLanguage,
        categoryPath: job.input.categoryPath,
        categoryName: job.input.categoryName,
        strategyId: job.input.strategyId,
        strategy,
        assets: job.input.assets,
        missingInputs: job.input.missingInputs,
        referenceImage: categoryKitReferenceImage,
        extraDirection: job.input.extraDirection
      });
      job.input = {
        ...job.input,
        categoryKit
      };
      logEcommerceCategoryKit("strategy-prepared", {
        jobId,
        workspaceId: job.tenant.workspaceId,
        categoryPath: categoryKit.categoryPath,
        categoryName: categoryKit.categoryName,
        strategyId: categoryKit.strategy?.id,
        missingInputCount: categoryKit.missingInputs?.length ?? 0,
        assetCount: categoryKit.assets?.length ?? 0
      });
      await updateEcommerceBatchJob(job.tenant, job.jobId, {
        status: "running",
        input: job.input,
        message: categoryKit.strategy
          ? `已匹配品类策略「${categoryKit.categoryName ?? categoryKit.strategy.categoryName}」，正在调用文本模型规划套图。`
          : "已准备品类上下文，正在调用文本模型规划套图。"
      });

      const plan = await generateCategoryKitPlan(
        {
          product: job.input.product,
          platform: job.input.platform,
          market: job.input.market,
          textLanguage: job.input.textLanguage,
          requestedImageCount: job.input.sceneTemplateIds.length,
          requestedSceneTemplateIds: job.input.sceneTemplateIds,
          categoryPath: categoryKit.categoryPath,
          categoryName: categoryKit.categoryName,
          strategy: categoryKit.strategy,
          assets: categoryKit.assets,
          missingInputs: categoryKit.missingInputs,
          referenceImage: categoryKitReferenceImage,
          extraDirection: job.input.extraDirection
        },
        { jobId }
      );
      logEcommerceCategoryKit("planner-stage-success", {
        jobId,
        workspaceId: job.tenant.workspaceId,
        imageCount: plan.imagePlan.length,
        model: plan.model
      });
      const productTitle = resolveCategoryKitProductTitle(job.input.product.title, plan.productSummary);
      job.input = {
        ...job.input,
        product: {
          ...job.input.product,
          title: productTitle
        },
        categoryKitPlannerPending: false,
        plannedImages: plan.imagePlan,
        categoryKit: {
          ...categoryKit,
          productSummary: plan.productSummary || categoryKit.productSummary
        },
        countPerScene: 1
      };
      job.totalScenes = plan.imagePlan.length;
      job.completedScenes = 0;
      job.records = [];
      await updateEcommerceBatchJob(job.tenant, job.jobId, {
        status: "running",
        productTitle,
        totalScenes: job.totalScenes,
        completedScenes: 0,
        input: job.input,
        message: `后台文本模型已规划 ${plan.imagePlan.length} 张图，正在检查额度并准备并发生成。`
      });

      const charge = await reserveGenerationCharge({
        tenant: job.tenant,
        imageCount: plan.imagePlan.length
      });
      await attachGenerationToCharge(charge.transactionId, job.jobId);
      await updateEcommerceBatchJob(job.tenant, job.jobId, {
        message: `后台文本模型已规划 ${plan.imagePlan.length} 张图，服务端开始按队列并发生成。`
      });
    } else {
      await updateEcommerceBatchJob(job.tenant, job.jobId, {
        status: "running",
        message: "服务端正在并发生成场景，页面可以离开后稍晚回来查看。"
      });
    }

    const concurrencyConfig: EcommerceGenerationConcurrencyConfigResponse = await getEcommerceGenerationConcurrencyConfig();
    const sceneConcurrency = Math.max(1, concurrencyConfig.jobConcurrency);
    logEcommerceCategoryKit("concurrency-config", {
      jobId,
      workspaceId: job.tenant.workspaceId,
      globalConcurrency: concurrencyConfig.globalConcurrency,
      jobConcurrency: sceneConcurrency,
      source: concurrencyConfig.source
    });

    type SceneItem =
      | { index: number; kind: "planned"; plannedImage: EcommerceCategoryKitPlanItem }
      | { index: number; kind: "reference"; referenceImage: EcommerceBatchReferenceImage; sceneTemplateId: EcommerceSceneTemplateId }
      | { index: number; kind: "template"; sceneTemplateId: EcommerceSceneTemplateId };
    const sceneItems: SceneItem[] = job.input.plannedImages?.length
      ? job.input.plannedImages.map((plannedImage, index) => ({ index, kind: "planned" as const, plannedImage }))
      : job.input.referenceImages?.length
        ? job.input.referenceImages.map((referenceImage, index) => ({
            index,
            kind: "reference" as const,
            referenceImage,
            sceneTemplateId: job.input.sceneTemplateIds[0]
          }))
      : job.input.sceneTemplateIds.map((sceneTemplateId, index) => ({ index, kind: "template" as const, sceneTemplateId }));
    const records = new Array<EcommerceBatchGenerateResponse["records"][number] | undefined>(sceneItems.length);

    await mapWithConcurrency(
      sceneItems,
      sceneConcurrency,
      async (sceneItem) => {
        try {
          const prompt =
            sceneItem.kind === "planned"
              ? composePlannedCategoryKitPrompt(sceneItem.plannedImage)
              : composeEcommercePrompt({
                product: {
                  ...job.input.product,
                  title: sceneItem.kind === "reference" && sceneItem.referenceImage.title ? sceneItem.referenceImage.title : job.input.product.title
                },
                platform: job.input.platform,
                market: job.input.market,
                textLanguage: job.input.textLanguage,
                allowTextRecreation: job.input.allowTextRecreation,
                removeWatermarkAndLogo: job.input.removeWatermarkAndLogo,
                brandOverlayPlacement: job.input.brandOverlayPlacement,
                sceneTemplateId: sceneItem.sceneTemplateId,
                extraDirection: [job.input.extraDirection, sceneItem.kind === "reference" ? sceneItem.referenceImage.extraDirection : ""]
                  .filter(Boolean)
                  .join("\n\n")
              });
          const referenceImage =
            sceneItem.kind === "reference"
              ? sceneItem.referenceImage.referenceImage
              : sceneItem.kind === "planned"
                ? selectCategoryKitReferenceImage(job.input, sceneItem.plannedImage)
                : job.input.referenceImage;
          const additionalReferenceImages = [
            ...(referenceImage?.additionalReferenceImages ?? []),
            ...(sceneItem.kind === "reference" ? sceneItem.referenceImage.additionalReferenceImages ?? [] : []),
            ...(job.input.additionalReferenceImages ?? [])
          ];
          const editReferenceImage = referenceImage
            ? {
                ...referenceImage,
                additionalReferenceImages: additionalReferenceImages.length ? additionalReferenceImages : referenceImage.additionalReferenceImages
              }
            : undefined;
          const size = sceneItem.kind === "reference" && sceneItem.referenceImage.size ? sceneItem.referenceImage.size : job.input.size;
          const generationInput = {
            originalPrompt: prompt,
            presetId: job.input.stylePresetId ?? "product",
            prompt: composePrompt(prompt, job.input.stylePresetId ?? "product"),
            size,
            sizeApiValue: `${size.width}x${size.height}`,
            quality: job.input.quality ?? "auto",
            outputFormat: job.input.outputFormat ?? "png",
            count: job.input.countPerScene ?? 1
          };
          const response = editReferenceImage
            ? await runReferenceImageGenerationWithFallback(
                job.tenant,
                { ...generationInput, referenceImage: editReferenceImage },
                job.providerConfigs,
                undefined,
                { skipCharge: true, createComparisonCollage: job.input.createComparisonCollage === true }
              )
            : await runTextToImageGenerationWithFallback(job.tenant, generationInput, job.providerConfigs, undefined, { skipCharge: true });
          records[sceneItem.index] = response.record;
        } catch (error) {
          records[sceneItem.index] = failedEcommerceSceneRecord(job.input, sceneItem, errorToMessage(error));
        } finally {
          job.completedScenes += 1;
          job.records = records.flatMap((record) => (record ? [record] : []));
          const failedCount = job.records.filter((record) => record.status === "failed").length;
          await updateEcommerceBatchJob(job.tenant, job.jobId, {
            status: "running",
            message: `服务端并发生成中：${job.completedScenes}/${job.totalScenes} 个场景完成，${failedCount} 个失败。`,
            completedScenes: job.completedScenes,
            records: job.records
          });
        }
      }
    );

    const failedCount = job.records.filter((record) => record.status === "failed").length;
    const succeededCount = job.records.length - failedCount;
    const finishedStatus = succeededCount > 0 && failedCount > 0 ? "partial" : succeededCount > 0 ? "succeeded" : "failed";
    await updateEcommerceBatchJob(job.tenant, job.jobId, {
      status: finishedStatus,
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
    await notifyEcommerceJobFinished({
      tenant: job.tenant,
      jobId: job.jobId,
      status: finishedStatus,
      productTitle: job.input.product.title,
      totalScenes: job.totalScenes,
      completedScenes: job.completedScenes,
      records: job.records
    });
  } catch (error) {
    logEcommerceCategoryKit("planner-stage-failed", {
      jobId,
      workspaceId: job.tenant.workspaceId,
      message: errorToMessage(error)
    });
    const message = errorToMessage(error);
    await updateEcommerceBatchJob(job.tenant, job.jobId, {
      status: "failed",
      message: `批量任务失败：${message}`,
      completedScenes: job.completedScenes,
      records: job.records,
      completedAt: new Date().toISOString()
    });
    await notifyEcommerceJobFinished({
      tenant: job.tenant,
      jobId: job.jobId,
      status: "failed",
      productTitle: job.input.product.title,
      totalScenes: job.totalScenes,
      completedScenes: job.completedScenes,
      records: job.records
    });
  } finally {
    runningEcommerceBatchJobs.delete(jobId);
  }
}

async function notifyEcommerceJobFinished(input: {
  tenant: RequestTenant;
  jobId: string;
  status: EcommerceBatchJobStatus;
  productTitle?: string;
  totalScenes: number;
  completedScenes: number;
  records: EcommerceBatchGenerateResponse["records"];
}): Promise<void> {
  const failedScenes = input.records.filter((record) => record.status === "failed").length;
  const succeededScenes = Math.max(0, input.records.length - failedScenes);
  try {
    await createEcommerceJobFinishedNotification({
      tenant: input.tenant,
      jobId: input.jobId,
      status: input.status,
      productTitle: input.productTitle,
      totalScenes: input.totalScenes,
      completedScenes: input.completedScenes,
      succeededScenes,
      failedScenes
    });
  } catch (error) {
    console.warn(`[notifications] failed to create ecommerce completion notification jobId=${input.jobId}`, error);
  }
}

function logEcommerceCategoryKit(event: string, details: Record<string, unknown>): void {
  console.info(`[ecommerce-category-kit] ${event} ${JSON.stringify(details)}`);
}

function composePlannedCategoryKitPrompt(plannedImage: EcommerceCategoryKitPlanItem): string {
  const notes = plannedImage.notes?.trim();
  const roles = plannedImage.sourceImageRoles?.length
    ? `Use the provided reference image role(s) for this scene: ${plannedImage.sourceImageRoles.join(", ")}.`
    : "";
  const parts = [plannedImage.prompt, roles, notes ? `Text / layout notes: ${notes}` : ""].filter(Boolean);
  return parts.join("\n\n");
}

function selectCategoryKitReferenceImage(
  input: ResolvedEcommerceBatchGenerateRequest,
  plannedImage: EcommerceCategoryKitPlanItem
): ReferenceImageInput | undefined {
  const assets = input.categoryKit?.assets ?? input.assets;
  const requestedRoles = plannedImage.sourceImageRoles?.map((role) => String(role).toLowerCase()) ?? [];
  if (assets?.length && requestedRoles.length) {
    const matched = assets.find((asset) => {
      const role = String(asset.role).toLowerCase();
      if (!requestedRoles.includes(role)) {
        return false;
      }
      return Boolean(asset.referenceImage);
    });
    if (matched?.referenceImage) {
      return matched.referenceImage;
    }
  }
  return input.referenceImage;
}

function resolveCategoryKitProductTitle(inputTitle: string, productSummary: string): string {
  const title = inputTitle.trim();
  if (title && title !== "AI 自拆品类套图") {
    return title;
  }

  return productSummary.trim().slice(0, 120) || title || "AI 自拆品类套图";
}

function failedEcommerceSceneRecord(
  input: ResolvedEcommerceBatchGenerateRequest,
  sceneItem: {
    index: number;
    sceneTemplateId?: EcommerceSceneTemplateId;
    plannedImage?: EcommerceCategoryKitPlanItem;
    referenceImage?: EcommerceBatchReferenceImage;
  },
  message: string
): EcommerceBatchGenerateResponse["records"][number] {
  const prompt = sceneItem.plannedImage
    ? sceneItem.plannedImage.prompt
    : composeEcommercePrompt({
        product: {
          ...input.product,
          title: sceneItem.referenceImage?.title || input.product.title
        },
        platform: input.platform,
        market: input.market,
        textLanguage: input.textLanguage,
        allowTextRecreation: input.allowTextRecreation,
        removeWatermarkAndLogo: input.removeWatermarkAndLogo,
        brandOverlayPlacement: input.brandOverlayPlacement,
        sceneTemplateId: sceneItem.sceneTemplateId as EcommerceSceneTemplateId,
        extraDirection: [input.extraDirection, sceneItem.referenceImage?.extraDirection].filter(Boolean).join("\n\n")
      });
  const size = sceneItem.referenceImage?.size ?? input.size;
  return {
    id: randomUUID(),
    mode: input.referenceImage || sceneItem.referenceImage ? "edit" : "generate",
    prompt,
    effectivePrompt: composePrompt(prompt, input.stylePresetId ?? "product"),
    presetId: input.stylePresetId ?? "product",
    size,
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

async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<void>
): Promise<void> {
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      await mapper(items[currentIndex]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
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

  throw new AuthError("unauthorized", "请先登录账号。", 401);
}

async function assetReadTenant(c: Context, assetId: string): Promise<RequestTenant> {
  const session = authSessions.get(c);
  if (session?.user.role !== "admin") {
    return requestTenant(c);
  }

  const [asset] = await db
    .select({
      workspaceId: assets.workspaceId,
      userId: assets.createdByUserId
    })
    .from(assets)
    .where(eq(assets.id, assetId))
    .limit(1);

  return asset
    ? {
        userId: asset.userId,
        workspaceId: asset.workspaceId
      }
    : session.tenant;
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
  if (error instanceof EmailError) {
    return c.json(errorResponse(error.code, error.message), error.status as 400 | 409 | 429 | 500 | 503);
  }
  if (error instanceof SmsError) {
    return c.json(errorResponse(error.code, error.message), error.status as 400 | 409 | 429 | 500 | 503);
  }

  if (error instanceof Error && error.message.includes("JWT_SECRET")) {
    return c.json(errorResponse("auth_not_configured", "服务端未配置 JWT_SECRET。"), 500);
  }

  throw error;
}

function smsErrorJson(c: Context, error: unknown): Response {
  if (error instanceof SmsError) {
    return c.json(errorResponse(error.code, error.message), error.status as 400 | 409 | 429 | 500 | 503);
  }

  throw error;
}

function emailErrorJson(c: Context, error: unknown): Response {
  if (error instanceof EmailError) {
    return c.json(errorResponse(error.code, error.message), error.status as 400 | 409 | 429 | 500 | 503);
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
  await resetExpiredUserPlans();
  const [userRows, memberRows, assetRows] = await Promise.all([
    db
      .select({
        user: users,
        plan: subscriptionPlans
      })
      .from(users)
      .leftJoin(subscriptionPlans, eq(subscriptionPlans.id, users.planId))
      .orderBy(desc(users.numericId), desc(users.createdAt), desc(users.id)),
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

async function createOrPromoteAdminUser(input: {
  phone?: string;
  email?: string;
  password?: string;
  displayName?: string;
}): Promise<{ userId: string; created: boolean }> {
  const phone = input.phone?.trim() ? normalizePhone(input.phone) : undefined;
  const email = input.email?.trim() ? input.email.trim().toLowerCase() : undefined;
  const existing = (phone ? await findUserByPhone(phone) : undefined) ?? (email ? await findUserByEmail(email) : undefined);
  const now = new Date().toISOString();

  if (existing) {
    await db
      .update(users)
      .set({
        role: "admin",
        displayName: input.displayName ?? existing.displayName,
        ...(input.password ? { passwordHash: hashPassword(input.password) } : {}),
        updatedAt: now
      })
      .where(eq(users.id, existing.id));
    return { userId: existing.id, created: false };
  }

  if (!input.password) {
    throw new AuthError("password_required", "新增管理员需要设置至少 8 位密码。", 400);
  }

  const defaultPlan = await getPlanOrUndefined(DEFAULT_ADMIN_PLAN_ID);
  const userId = randomUUID();
  const workspaceId = randomUUID();
  const displayName = input.displayName ?? phone ?? email?.split("@", 1)[0] ?? "Administrator";

  await db.transaction(async (tx) => {
    await tx.insert(users).values({
      id: userId,
      numericId: undefined,
      email: email ?? null,
      phone: phone ?? null,
      phoneVerifiedAt: phone ? now : null,
      passwordHash: hashPassword(input.password ?? ""),
      displayName,
      role: "admin",
      planId: defaultPlan?.id ?? DEFAULT_ADMIN_PLAN_ID,
      planExpiresAt: null,
      quotaTotal: Number(defaultPlan?.imageQuota ?? 0),
      quotaUsed: 0,
      balanceCents: 0,
      referralBalanceCents: 0,
      invoicePaidCents: 0,
      invoiceReservedCents: 0,
      invoiceIssuedCents: 0,
      inviteCode: undefined,
      inviterUserId: undefined,
      storageQuotaBytes: Number(defaultPlan?.storageQuotaBytes ?? DEFAULT_ADMIN_STORAGE_QUOTA_BYTES),
      storageUsedBytes: 0,
      currency: defaultPlan?.currency ?? "CNY",
      createdAt: now,
      updatedAt: now
    });
    await tx.insert(workspaces).values({
      id: workspaceId,
      name: `${displayName}'s Workspace`,
      ownerUserId: userId,
      createdAt: now,
      updatedAt: now
    });
    await tx.insert(workspaceMembers).values({
      id: workspaceMemberId(workspaceId, userId),
      workspaceId,
      userId,
      role: "owner",
      createdAt: now,
      updatedAt: now
    });
  });

  return { userId, created: true };
}

async function findUserByEmail(email: string): Promise<(typeof users.$inferSelect) | undefined> {
  const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return row;
}

async function findUserByPhone(phone: string): Promise<(typeof users.$inferSelect) | undefined> {
  const [row] = await db.select().from(users).where(eq(users.phone, phone)).limit(1);
  return row;
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
    numericId: user.numericId ?? undefined,
    id: user.id,
    email: user.email ?? "",
    phone: user.phone ?? undefined,
    phoneVerifiedAt: user.phoneVerifiedAt ?? undefined,
    displayName: user.displayName,
    role: user.role === "admin" ? "admin" : "user",
    accountStatus: user.accountStatus ?? "active",
    deletedAt: user.deletedAt ?? undefined,
    deletionLockUntil: user.deletionLockUntil ?? undefined,
    planId: user.planId ?? undefined,
    planName: plan?.name,
    planExpiresAt: user.planExpiresAt ?? undefined,
    quotaTotal: Number(user.quotaTotal ?? 0),
    quotaUsed: Number(user.quotaUsed ?? 0),
    balanceCents: Number(user.balanceCents ?? 0),
    currency: user.currency ?? "CNY",
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

async function getAdminEcommerceJobs(limit?: number): Promise<EcommerceJobListResponse> {
  const baseQuery = db
    .select({
      job: ecommerceBatchJobs,
      user: users
    })
    .from(ecommerceBatchJobs)
    .leftJoin(users, eq(users.id, ecommerceBatchJobs.createdByUserId))
    .orderBy(desc(ecommerceBatchJobs.createdAt));
  const rows = typeof limit === "number" ? await baseQuery.limit(limit) : await baseQuery;

  return {
    jobs: rows.map(({ job, user }) => toAdminEcommerceJobSummary(job, user))
  };
}

function toAdminEcommerceJobSummary(
  job: typeof ecommerceBatchJobs.$inferSelect,
  user?: typeof users.$inferSelect | null
): EcommerceJobListResponse["jobs"][number] {
  return {
    jobId: job.id,
    userId: job.createdByUserId,
    userEmail: user?.email ?? undefined,
    userDisplayName: user?.displayName,
    workspaceId: job.workspaceId,
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
      userEmail: user?.email ?? undefined,
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

function parsePublicGalleryPayload(input: unknown): ParseResult<{ enabled: boolean; sortOrder?: number }> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: errorResponse("invalid_public_gallery", "公开案例设置必须是 JSON 对象。")
    };
  }

  const enabled = parseOptionalBoolean(input.enabled ?? input.publicGalleryEnabled);
  if (typeof enabled !== "boolean") {
    return {
      ok: false,
      error: errorResponse("invalid_public_gallery", "enabled 必须是布尔值。")
    };
  }

  const rawSortOrder = input.sortOrder ?? input.publicGallerySortOrder;
  if (rawSortOrder === undefined || rawSortOrder === null || rawSortOrder === "") {
    return {
      ok: true,
      value: { enabled }
    };
  }

  const sortOrder = typeof rawSortOrder === "number" ? rawSortOrder : Number(rawSortOrder);
  if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 9999) {
    return {
      ok: false,
      error: errorResponse("invalid_public_gallery_sort", "公开案例排序必须是 0 到 9999 的整数。")
    };
  }

  return {
    ok: true,
    value: { enabled, sortOrder }
  };
}

function parseDemoCanvasPayload(input: unknown): ParseResult<SaveDemoCanvasConfigRequest> {
  if (!isRecord(input) || !Array.isArray(input.examples)) {
    return {
      ok: false,
      error: errorResponse("invalid_demo_canvas", "游客画布配置必须包含 examples 数组。")
    };
  }

  if (input.examples.length > 20) {
    return {
      ok: false,
      error: errorResponse("invalid_demo_canvas", "游客画布案例最多配置 20 组。")
    };
  }

  return {
    ok: true,
    value: {
      examples: input.examples.filter(isRecord).map((example) => ({
        id: parseOptionalString(example.id) || randomUUID(),
        title: parseOptionalString(example.title) || "画布案例",
        category: parseOptionalString(example.category) || "演示案例",
        beforeLabel: parseOptionalString(example.beforeLabel) || "修改前",
        afterLabel: parseOptionalString(example.afterLabel) || "修改后",
        brief: parseOptionalString(example.brief) || "展示修改前后的效果对比。",
        prompt: parseOptionalString(example.prompt) || "根据参考图生成适合电商展示的图片。",
        presetId: parseStylePresetValue(example.presetId),
        size: parseDemoCanvasSize(example.size),
        quality: parseImageQualityValue(example.quality),
        outputFormat: parseOutputFormatValue(example.outputFormat),
        createdAt: parseOptionalString(example.createdAt) || new Date().toISOString(),
        beforeUrl: parseOptionalString(example.beforeUrl) || "",
        afterUrl: parseOptionalString(example.afterUrl) || "",
        enabled: parseOptionalBoolean(example.enabled) ?? true,
        sortOrder: parseNonNegativeInteger(example.sortOrder) ?? 0
      }))
    }
  };
}

function parseDemoCanvasSize(value: unknown): ImageSize {
  const source = isRecord(value) ? value : {};
  return {
    width: parseImageDimension(source.width, 1024),
    height: parseImageDimension(source.height, 1024)
  };
}

function parseImageDimension(value: unknown, fallback: number): number {
  const numericValue = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isInteger(numericValue) && numericValue >= 256 && numericValue <= 4096 ? numericValue : fallback;
}

function parseStylePresetValue(value: unknown): StylePresetId {
  const presetId = parseOptionalString(value);
  return STYLE_PRESETS.some((preset) => preset.id === presetId) ? (presetId as StylePresetId) : "product";
}

function parseImageQualityValue(value: unknown): ImageQuality {
  const quality = parseOptionalString(value);
  return quality === "low" || quality === "medium" || quality === "high" || quality === "auto" ? quality : "auto";
}

function parseOutputFormatValue(value: unknown): OutputFormat {
  const outputFormat = parseOptionalString(value);
  return outputFormat === "jpeg" || outputFormat === "png" || outputFormat === "webp" ? outputFormat : "png";
}

function parseAuthPayload(
  input: unknown,
  includeDisplayName: boolean
): ParseResult<{ email: string; phone: string; password: string; displayName?: string; emailCode: string; smsCode: string; inviteCode?: string }> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: errorResponse("invalid_request", "请求内容必须是 JSON 对象。")
    };
  }

  const account = stringValue(input.account ?? input.identifier ?? input.login)?.trim();
  const email = stringValue(input.email)?.trim() || (!includeDisplayName && account?.includes("@") ? account : undefined);
  const phone = stringValue(input.phone)?.trim() || (!includeDisplayName && account && !account.includes("@") ? account : undefined);
  const password = stringValue(input.password);
  if ((!includeDisplayName && !email && !phone) || (includeDisplayName && !phone) || !password) {
    return {
      ok: false,
      error: errorResponse("invalid_credentials", includeDisplayName ? "请输入手机号和密码。" : "请输入手机号/邮箱和密码。")
    };
  }

  return {
    ok: true,
    value: {
      email: email ?? "",
      phone: phone ?? "",
      password,
      displayName: includeDisplayName ? stringValue(input.displayName)?.trim() : undefined,
      emailCode: includeDisplayName ? stringValue(input.emailCode)?.trim() || "" : "",
      smsCode: includeDisplayName ? stringValue(input.smsCode ?? input.phoneCode)?.trim() || "" : "",
      inviteCode: includeDisplayName ? stringValue(input.inviteCode)?.trim() : undefined
    }
  };
}

function parseInviteSettingsPayload(input: unknown): ParseResult<SaveInviteRewardSettingsRequest> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: errorResponse("invalid_referral_settings", "邀请激励设置内容必须是 JSON 对象。")
    };
  }
  if (typeof input.enabled !== "boolean") {
    return {
      ok: false,
      error: errorResponse("invalid_referral_settings", "enabled 必须是布尔值。")
    };
  }
  const numberFields = [
    "baseRegisterCredits",
    "inviterRegisterCredits",
    "inviteeRegisterCredits",
    "rechargeCashbackRateBps",
    "planPurchaseCashbackRateBps",
    "minCashbackOrderAmountCents"
  ] as const;
  const parsed: Record<string, number> = {};
  for (const field of numberFields) {
    const value = parseNonNegativeInteger(input[field]);
    if (value === undefined) {
      return {
        ok: false,
        error: errorResponse("invalid_referral_settings", "邀请激励数值必须是非负整数。")
      };
    }
    parsed[field] = value;
  }
  return {
    ok: true,
    value: {
      enabled: input.enabled,
      baseRegisterCredits: parsed.baseRegisterCredits,
      inviterRegisterCredits: parsed.inviterRegisterCredits,
      inviteeRegisterCredits: parsed.inviteeRegisterCredits,
      rechargeCashbackRateBps: parsed.rechargeCashbackRateBps,
      planPurchaseCashbackRateBps: parsed.planPurchaseCashbackRateBps,
      minCashbackOrderAmountCents: parsed.minCashbackOrderAmountCents,
      currency: stringValue(input.currency)?.toUpperCase()
    }
  };
}

function parseEmailCodePayload(input: unknown): ParseResult<{ email: string }> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: errorResponse("invalid_request", "请求内容必须是 JSON 对象。")
    };
  }

  const email = stringValue(input.email)?.trim();
  if (!email) {
    return {
      ok: false,
      error: errorResponse("invalid_email", "请输入邮箱。")
    };
  }

  return { ok: true, value: { email } };
}

function parseSmsCodePayload(input: unknown): ParseResult<{ phone: string }> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: errorResponse("invalid_request", "请求内容必须是 JSON 对象。")
    };
  }

  const phone = stringValue(input.phone)?.trim();
  if (!phone) {
    return {
      ok: false,
      error: errorResponse("invalid_phone", "请输入手机号。")
    };
  }

  return { ok: true, value: { phone } };
}

function parseBindPhonePayload(input: unknown): ParseResult<{ phone: string; smsCode: string }> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: errorResponse("invalid_request", "请求内容必须是 JSON 对象。")
    };
  }

  const phone = stringValue(input.phone)?.trim();
  const smsCode = stringValue(input.smsCode ?? input.phoneCode)?.trim();
  if (!phone || !smsCode) {
    return {
      ok: false,
      error: errorResponse("invalid_phone_binding", "请输入手机号和短信验证码。")
    };
  }

  return { ok: true, value: { phone, smsCode } };
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

function parseAdminUserPayload(input: unknown): ParseResult<{
  phone?: string;
  email?: string;
  password?: string;
  displayName?: string;
}> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: errorResponse("invalid_admin_user", "管理员内容必须是 JSON 对象。")
    };
  }

  const phoneInput = parseLimitedString(input.phone, 32);
  const emailInput = parseLimitedString(input.email, 255)?.toLowerCase();
  if (!phoneInput && !emailInput) {
    return {
      ok: false,
      error: errorResponse("invalid_admin_contact", "请输入手机号或邮箱。")
    };
  }

  const phone = phoneInput ? normalizePhone(phoneInput) : undefined;
  if (phone && !/^1[3-9]\d{9}$/u.test(phone)) {
    return {
      ok: false,
      error: errorResponse("invalid_admin_phone", "请输入有效手机号。")
    };
  }

  if (emailInput && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(emailInput)) {
    return {
      ok: false,
      error: errorResponse("invalid_admin_email", "请输入有效管理员邮箱。")
    };
  }

  const password = parseOptionalString(input.password);
  if (password !== undefined && password.length < 8) {
    return {
      ok: false,
      error: errorResponse("weak_admin_password", "管理员密码至少需要 8 位。")
    };
  }

  const displayName = parseLimitedString(input.displayName, 255);
  if (Object.hasOwn(input, "displayName") && input.displayName !== "" && !displayName) {
    return {
      ok: false,
      error: errorResponse("invalid_admin_display_name", "显示名不能超过 255 个字符。")
    };
  }

  return {
    ok: true,
    value: {
      phone,
      email: emailInput,
      password,
      displayName
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

function parseBalanceAdjustmentPayload(input: unknown): ParseResult<AdminAdjustBalanceRequest> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: errorResponse("invalid_balance_adjustment", "余额调整内容必须是 JSON 对象。")
    };
  }

  const value: AdminAdjustBalanceRequest = {};
  if (Object.hasOwn(input, "balanceCents")) {
    const balanceCents = parseNonNegativeInteger(input.balanceCents);
    if (balanceCents === undefined) {
      return {
        ok: false,
        error: errorResponse("invalid_balance_adjustment", "余额必须是非负整数分。")
      };
    }
    value.balanceCents = balanceCents;
  }

  if (Object.hasOwn(input, "deltaCents")) {
    if (typeof input.deltaCents !== "number" || !Number.isSafeInteger(input.deltaCents) || input.deltaCents === 0) {
      return {
        ok: false,
        error: errorResponse("invalid_balance_adjustment", "余额增减值必须是非零整数分。")
      };
    }
    value.deltaCents = input.deltaCents;
  }

  if (Object.hasOwn(input, "note")) {
    value.note = parseNullableLimitedString(input.note, 1000) ?? undefined;
  }

  if (value.balanceCents === undefined && value.deltaCents === undefined) {
    return {
      ok: false,
      error: errorResponse("invalid_balance_adjustment", "请提供 balanceCents 或 deltaCents。")
    };
  }

  return {
    ok: true,
    value
  };
}

function parseRedeemCodePayload(input: unknown): ParseResult<RedemptionCodeRedeemRequest> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: errorResponse("invalid_redemption_code", "兑换码内容必须是 JSON 对象。")
    };
  }

  const code = parseLimitedString(input.code, 64);
  if (!code) {
    return {
      ok: false,
      error: errorResponse("invalid_redemption_code", "请输入有效兑换码。")
    };
  }

  return {
    ok: true,
    value: { code }
  };
}

function parseNotificationDevicePayload(input: unknown): ParseResult<NotificationDeviceRegisterRequest> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: errorResponse("invalid_notification_device", "通知设备信息必须是 JSON 对象。")
    };
  }

  const channel = parseNotificationChannel(input.channel);
  if (!channel) {
    return {
      ok: false,
      error: errorResponse("invalid_notification_channel", "通知渠道必须是 web、native 或 wechat_miniapp。")
    };
  }

  return {
    ok: true,
    value: {
      channel,
      deviceId: parseLimitedString(input.deviceId, 255),
      platform: parseNotificationDevicePlatform(input.platform),
      provider: parseLimitedString(input.provider, 64),
      pushToken: parseLimitedString(input.pushToken, 512),
      userAgent: parseLimitedString(input.userAgent, 1000)
    }
  };
}

function parseNotificationChannel(value: unknown): NotificationDeviceRegisterRequest["channel"] | undefined {
  return value === "web" || value === "native" || value === "wechat_miniapp" ? value : undefined;
}

function parseNotificationDevicePlatform(value: unknown): NotificationDeviceRegisterRequest["platform"] {
  return value === "web" || value === "ios" || value === "android" || value === "wechat_miniapp" || value === "unknown" ? value : undefined;
}

function parseAdminRedemptionCodesPayload(input: unknown): ParseResult<AdminCreateRedemptionCodesRequest> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: errorResponse("invalid_redemption_codes", "兑换码生成内容必须是 JSON 对象。")
    };
  }

  const codes = parseAdminRedemptionCodeList(Object.hasOwn(input, "codes") ? input.codes : input.code);
  if (!codes.ok) {
    return codes;
  }
  const count = codes.value.length > 0 ? codes.value.length : parseNonNegativeInteger(input.count);
  const maxRedemptions = parseNonNegativeInteger(input.maxRedemptions);
  const quota = parseNonNegativeInteger(input.quota);
  const validDays = parseNonNegativeInteger(input.validDays);
  if (!count || count < 1 || count > 500) {
    return {
      ok: false,
      error: errorResponse("invalid_redemption_code_count", "生成数量必须是 1 到 500 的整数。")
    };
  }
  if (!maxRedemptions || maxRedemptions < 1) {
    return {
      ok: false,
      error: errorResponse("invalid_redemption_code_redemptions", "总可兑换次数必须是正整数。")
    };
  }
  if (!quota || quota < 1) {
    return {
      ok: false,
      error: errorResponse("invalid_redemption_code_quota", "兑换额度必须是正整数。")
    };
  }
  if (!validDays || validDays < 1) {
    return {
      ok: false,
      error: errorResponse("invalid_redemption_code_valid_days", "有效天数必须是正整数。")
    };
  }

  const codePrefix = Object.hasOwn(input, "codePrefix") ? parseNullableLimitedString(input.codePrefix, 20) : undefined;
  if (Object.hasOwn(input, "codePrefix") && codePrefix === undefined) {
    return {
      ok: false,
      error: errorResponse("invalid_redemption_code_prefix", "兑换码前缀不能超过 20 个字符。")
    };
  }
  const note = Object.hasOwn(input, "note") ? parseNullableLimitedString(input.note, 1000) : undefined;
  if (Object.hasOwn(input, "note") && note === undefined) {
    return {
      ok: false,
      error: errorResponse("invalid_redemption_code_note", "备注不能超过 1000 个字符。")
    };
  }

  return {
    ok: true,
    value: {
      count,
      maxRedemptions,
      quota,
      validDays,
      codes: codes.value.length > 0 ? codes.value : undefined,
      codePrefix: codePrefix ?? undefined,
      note: note ?? undefined
    }
  };
}

function parseAdminRedemptionCodeList(value: unknown): ParseResult<string[]> {
  if (value === undefined || value === null || value === "") {
    return { ok: true, value: [] };
  }

  const rawCodes = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[\s,，;；]+/u).filter(Boolean)
      : undefined;
  if (!rawCodes || rawCodes.some((code) => typeof code !== "string")) {
    return {
      ok: false,
      error: errorResponse("invalid_redemption_code_list", "指定兑换码必须是字符串数组。")
    };
  }

  const codes = rawCodes.map((code) => normalizeRedemptionCode(code));
  if (codes.some((code) => !code)) {
    return {
      ok: false,
      error: errorResponse("invalid_redemption_code", "指定兑换码只能包含 4 到 64 位字母、数字、下划线或中划线。")
    };
  }
  if (new Set(codes).size !== codes.length) {
    return {
      ok: false,
      error: errorResponse("duplicate_redemption_code", "指定兑换码中存在重复项。")
    };
  }

  return { ok: true, value: codes };
}

function parseBillingSettingsPayload(input: unknown): ParseResult<SaveBillingSettingsRequest> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: errorResponse("invalid_billing_settings", "计费设置内容必须是 JSON 对象。")
    };
  }

  const imageUnitPriceCents = parseNonNegativeInteger(input.imageUnitPriceCents);
  if (imageUnitPriceCents === undefined) {
    return {
      ok: false,
      error: errorResponse("invalid_billing_settings", "单张生图费用必须是非负整数分。")
    };
  }

  const currency = Object.hasOwn(input, "currency") ? parseLimitedString(input.currency, MAX_CURRENCY_LENGTH)?.toUpperCase() : undefined;
  if (Object.hasOwn(input, "currency") && !currency) {
    return {
      ok: false,
      error: errorResponse("invalid_billing_settings", "币种不能为空，且不能超过 16 个字符。")
    };
  }

  return {
    ok: true,
    value: {
      imageUnitPriceCents,
      currency
    }
  };
}

function parseExtensionReleasePayload(input: unknown): ParseResult<Parameters<typeof saveExtensionReleaseConfig>[0]> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: errorResponse("invalid_extension_release", "插件发布配置内容必须是 JSON 对象。")
    };
  }

  const dev = parseExtensionReleaseTargetPayload(input.dev);
  if (!dev.ok) {
    return dev;
  }
  const prod = parseExtensionReleaseTargetPayload(input.prod);
  if (!prod.ok) {
    return prod;
  }

  return {
    ok: true,
    value: { dev: dev.value, prod: prod.value }
  };
}

function parseExtensionReleaseTargetPayload(
  input: unknown
): ParseResult<Parameters<typeof saveExtensionReleaseConfig>[0]["dev"]> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: errorResponse("invalid_extension_release", "插件发布配置项必须是 JSON 对象。")
    };
  }

  const fileName = parseLimitedString(input.fileName, 255);
  const version = parseLimitedString(input.version, 64);
  const apiBaseUrl = parseLimitedString(input.apiBaseUrl, 1000);
  const downloadUrl = parseLimitedString(input.downloadUrl, 2000);
  const latestDownloadUrl = parseLimitedString(input.latestDownloadUrl, 2000);
  const installHelpUrl = parseLimitedString(input.installHelpUrl, 2000);
  const sha256 = parseLimitedString(input.sha256, 128);
  const publishedAt = parseLimitedString(input.publishedAt, 64);
  const releaseNotes = Array.isArray(input.releaseNotes)
    ? input.releaseNotes.filter((item): item is string => typeof item === "string").map((line) => line.trim()).filter(Boolean).slice(0, 20)
    : undefined;

  return {
    ok: true,
    value: {
      apiBaseUrl,
      version,
      downloadUrl,
      latestDownloadUrl,
      installHelpUrl,
      fileName,
      sizeBytes: parseNonNegativeInteger(input.sizeBytes),
      sha256,
      publishedAt,
      releaseNotes
    }
  };
}

function parseAppReleasePayload(input: unknown): ParseResult<SaveAppReleaseConfigRequest> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: errorResponse("invalid_app_release", "App 版本配置内容必须是 JSON 对象。")
    };
  }

  const ios = parseAppReleaseTargetPayload(input.ios);
  if (!ios.ok) {
    return ios;
  }
  const android = parseAppReleaseTargetPayload(input.android);
  if (!android.ok) {
    return android;
  }

  return {
    ok: true,
    value: { ios: ios.value, android: android.value }
  };
}

function parseAppReleaseTargetPayload(input: unknown): ParseResult<SaveAppReleaseConfigRequest["ios"]> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: errorResponse("invalid_app_release", "App 版本配置项必须是 JSON 对象。")
    };
  }

  const version = parseLimitedString(input.version, 64);
  const buildNumber = parseLimitedString(input.buildNumber, 64);
  const downloadUrl = parseLimitedString(input.downloadUrl, 2000);
  const publishedAt = parseLimitedString(input.publishedAt, 64);
  const enabled = parseOptionalBoolean(input.enabled);
  const forceUpdate = parseOptionalBoolean(input.forceUpdate);
  const releaseNotes = Array.isArray(input.releaseNotes)
    ? input.releaseNotes.filter((item): item is string => typeof item === "string").map((line) => line.trim()).filter(Boolean).slice(0, 20)
    : undefined;

  return {
    ok: true,
    value: {
      enabled,
      version,
      buildNumber,
      downloadUrl,
      releaseNotes,
      forceUpdate,
      publishedAt
    }
  };
}

function parseImageModelConfigPayload(input: unknown): ParseResult<{ models: Parameters<typeof saveImageModelConfig>[0]["models"] }> {
  if (!isRecord(input) || !Array.isArray(input.models)) {
    return {
      ok: false,
      error: errorResponse("invalid_image_models", "模型配置内容必须包含 models 数组。")
    };
  }

  if (input.models.length > 20) {
    return {
      ok: false,
      error: errorResponse("invalid_image_models", "最多可配置 20 个图像模型。")
    };
  }

  const models = input.models.map((item, index) => {
    if (!isRecord(item)) {
      return undefined;
    }
    const provider = item.provider === "gemini" ? "gemini" : item.provider === "openai-compatible" ? "openai-compatible" : undefined;
    const name = parseLimitedString(item.name, 120);
    const model = parseLimitedString(item.model, 255);
    const role = item.role === "fallback" ? "fallback" : item.role === "primary" ? "primary" : undefined;
    if (!provider || !name || !model || !role || typeof item.enabled !== "boolean") {
      return undefined;
    }
    return {
      id: parseLimitedString(item.id, 64),
      name,
      provider,
      enabled: item.enabled,
      role,
      priority: parseNonNegativeInteger(item.priority) ?? index + 1,
      apiKey: typeof item.apiKey === "string" ? item.apiKey : undefined,
      preserveApiKey: typeof item.preserveApiKey === "boolean" ? item.preserveApiKey : undefined,
      baseUrl: parseLimitedString(item.baseUrl, 512),
      model,
      timeoutMs: parseNonNegativeInteger(item.timeoutMs)
    };
  });

  if (models.some((model) => !model)) {
    return {
      ok: false,
      error: errorResponse("invalid_image_models", "模型名称、供应商、模型 ID、角色和启用状态不能为空。")
    };
  }

  return {
    ok: true,
    value: {
      models: models as Parameters<typeof saveImageModelConfig>[0]["models"]
    }
  };
}

function parseCategoryKitPlannerConfigPayload(input: unknown): ParseResult<SaveCategoryKitPlannerConfigRequest> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: errorResponse("invalid_category_kit_planner", "文本模型配置内容必须是 JSON 对象。")
    };
  }
  const rawModels = Array.isArray(input.models) ? input.models : [input];
  const models = rawModels.map((item, index) => parseCategoryKitPlannerConfigEntry(item, index)).filter((item): item is SaveCategoryKitPlannerConfigRequest["models"][number] => Boolean(item));

  if (models.length === 0) {
    return {
      ok: false,
      error: errorResponse("invalid_category_kit_planner", "至少需要配置一个文本模型。")
    };
  }

  if (models.length !== rawModels.length) {
    return {
      ok: false,
      error: errorResponse("invalid_category_kit_planner", "文本模型配置项不完整。")
    };
  }

  return {
    ok: true,
    value: {
      models
    }
  };
}

function parseCategoryKitStrategyQuery(c: Context): CategoryKitStrategyQuery {
  const platformValue = parseOptionalString(c.req.query("platform"));
  const marketValue = parseOptionalString(c.req.query("market"));
  const enabled = parseOptionalBooleanQuery(c.req.query("enabled"));
  const query: CategoryKitStrategyQuery = {
    q: parseOptionalString(c.req.query("q")),
    categoryPath: parseCategoryPathValue(c.req.query("categoryPath")),
    enabled,
    limit: c.req.query("limit") ? parseListLimit(c.req.query("limit")) : undefined
  };
  if (platformValue && ECOMMERCE_PLATFORMS.some((item) => item.id === platformValue)) {
    query.platform = platformValue as EcommercePlatform;
  }
  if (marketValue && ECOMMERCE_MARKETS.some((item) => item.id === marketValue)) {
    query.market = marketValue as EcommerceMarket;
  }
  return query;
}

function parseCategoryKitStrategyPayload(input: unknown): ParseResult<SaveCategoryKitStrategyInput> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: errorResponse("invalid_category_kit_strategy", "策略内容必须是 JSON 对象。")
    };
  }

  const categoryPath = parseCategoryPathValue(input.categoryPath);
  if (categoryPath.length === 0) {
    return {
      ok: false,
      error: errorResponse("invalid_category_kit_strategy", "categoryPath 至少需要一个类目层级。")
    };
  }

  const platform = parseOptionalPlatform(input.platform);
  if (Object.hasOwn(input, "platform") && input.platform !== undefined && input.platform !== null && input.platform !== "" && !platform) {
    return {
      ok: false,
      error: errorResponse("invalid_category_kit_strategy", "platform 不在支持列表中。")
    };
  }
  const market = parseOptionalMarket(input.market);
  if (Object.hasOwn(input, "market") && input.market !== undefined && input.market !== null && input.market !== "" && !market) {
    return {
      ok: false,
      error: errorResponse("invalid_category_kit_strategy", "market 不在支持列表中。")
    };
  }

  return {
    ok: true,
    value: {
      ...normalizeCategoryKitStrategyEditorInput(input),
      id: parseLimitedString(input.id, 64),
      categoryPath,
      categoryName: parseLimitedString(input.categoryName, 255) ?? categoryPath[categoryPath.length - 1],
      platform,
      market,
      enabled: input.enabled === false ? false : true,
      priority: parseNonNegativeInteger(input.priority),
      version: parseLimitedString(input.version, 64),
      source: parseLimitedString(input.source, 64)
    }
  };
}

function normalizeCategoryKitStrategyEditorInput(input: Record<string, unknown>): SaveCategoryKitStrategyInput {
  const rawStrategy = isRecord(input.strategy) ? input.strategy : {};
  const visualStyle = [
    ...parseStringListLike(input.visualStyle ?? input.visual_style),
    ...parseStringListLike(rawStrategy.visualStyle ?? rawStrategy.visual_style)
  ];
  const copyStyle = [
    ...parseStringListLike(input.copyStyle ?? input.copy_style),
    ...parseStringListLike(rawStrategy.copyStyle ?? rawStrategy.copy_style)
  ];
  const sellingPointLogic = [
    ...parseStringListLike(input.sellingPointLogic ?? input.selling_point_logic),
    ...parseStringListLike(rawStrategy.sellingPointLogic ?? rawStrategy.selling_point_logic),
    ...parseStringListLike(rawStrategy.promptRules ?? rawStrategy.prompt_rules)
  ];
  const compositionRules = [
    ...parseStringListLike(input.compositionRules ?? input.composition_rules),
    ...parseStringListLike(rawStrategy.compositionRules ?? rawStrategy.composition_rules),
    ...parseStringListLike(rawStrategy.layoutRules ?? rawStrategy.layout_rules)
  ];
  const safetyRules = [
    ...parseStringListLike(input.safetyRules ?? input.safety_rules),
    ...parseStringListLike(rawStrategy.safetyRules ?? rawStrategy.safety_rules)
  ];
  const imageRoles = parseCategoryKitImageRoles(
    input.imageRoles ?? input.image_roles ?? input.requiredAssets ?? input.required_assets ?? input.assetRoles ?? input.asset_roles,
    input.missingChecklist ?? input.missing_checklist ?? input.checklist
  );

  return {
    ...(input as SaveCategoryKitStrategyInput),
    aliases: parseStringListLike(input.aliases),
    visualStyle: visualStyle.length ? visualStyle : undefined,
    copyStyle: copyStyle.length ? copyStyle : undefined,
    sellingPointLogic: sellingPointLogic.length ? sellingPointLogic : undefined,
    compositionRules: compositionRules.length ? compositionRules : undefined,
    safetyRules: safetyRules.length ? safetyRules : undefined,
    recommendedFields: parseCategoryKitFields(input.missingChecklist ?? input.missing_checklist ?? input.checklist),
    imageRoles: imageRoles.length ? imageRoles : undefined,
    outputScenes: parseCategoryKitOutputScenes(rawStrategy.scenePlan ?? rawStrategy.scene_plan ?? input.outputScenes ?? input.output_scenes),
    fallbackRules: parseCategoryKitFallbackRules(rawStrategy.fallbackRules ?? rawStrategy.fallback_rules),
    examples: Array.isArray(rawStrategy.examples) ? rawStrategy.examples as SaveCategoryKitStrategyInput["examples"] : undefined
  };
}

function parseStringListLike(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      if (typeof item === "string" && item.trim()) {
        return [item.trim()];
      }
      if (isRecord(item)) {
        const text = parseOptionalString(item.title) ?? parseOptionalString(item.label) ?? parseOptionalString(item.name) ?? parseOptionalString(item.text);
        return text ? [text] : [];
      }
      return [];
    });
  }
  const text = parseOptionalString(value);
  return text ? text.split(/[\n,，]/u).map((item) => item.trim()).filter(Boolean) : [];
}

function parseCategoryKitFields(value: unknown): SaveCategoryKitStrategyInput["recommendedFields"] {
  return parseStringListLike(value).map((item, index) => ({
    id: `custom-field-${index + 1}`,
    label: item,
    description: item
  }));
}

function parseCategoryKitImageRoles(rolesValue: unknown, checklistValue: unknown): NonNullable<SaveCategoryKitStrategyInput["imageRoles"]> {
  const labels = parseStringListLike(rolesValue);
  const checklist = parseStringListLike(checklistValue);
  const roles = labels.map((label, index) => {
    const id = categoryKitRoleIdFromLabel(label, index);
    return {
      id,
      label,
      description: checklist[index] ?? label,
      required: index === 0 || /主|main/iu.test(label),
      recommended: index !== 0 && !/主|main/iu.test(label),
      minCount: index === 0 || /主|main/iu.test(label) ? 1 : undefined,
      acceptedAssetRoles: [id]
    };
  });
  return roles;
}

function categoryKitRoleIdFromLabel(label: string, index: number): string {
  const lower = label.toLowerCase();
  if (/main|主/u.test(lower)) return "main-product";
  if (/detail|细节|局部/u.test(lower)) return "detail";
  if (/package|包装/u.test(lower)) return "package";
  if (/texture|材质|面料/u.test(lower)) return "texture";
  if (/size|scale|尺寸|比例/u.test(lower)) return "scale";
  if (/model|模特|上身|穿着/u.test(lower)) return "model";
  if (/scene|usage|lifestyle|场景|使用/u.test(lower)) return "lifestyle";
  return `custom-role-${index + 1}`;
}

function parseCategoryKitOutputScenes(value: unknown): SaveCategoryKitStrategyInput["outputScenes"] {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const scenes = value.flatMap((item, index) => {
    if (!isRecord(item)) {
      return [];
    }
    const title = parseLimitedString(item.title ?? item.name, 160);
    const id = parseLimitedString(item.id, 120) ?? (title ? `scene-${index + 1}` : undefined);
    if (!id || !title) {
      return [];
    }
    return [
      {
        id,
        title,
        purpose: parseLimitedString(item.purpose ?? item.goal, 500),
        imageRoleId: parseLimitedString(item.imageRoleId ?? item.image_role_id, 120),
        required: parseOptionalBoolean(item.required),
        recommended: parseOptionalBoolean(item.recommended),
        priority: parseNonNegativeInteger(item.priority),
        compositionRules: parseStringListLike(item.compositionRules ?? item.composition_rules),
        copyRules: parseStringListLike(item.copyRules ?? item.copy_rules),
        safetyRules: parseStringListLike(item.safetyRules ?? item.safety_rules),
        examples: parseStringListLike(item.examples)
      }
    ];
  });
  return scenes.length ? scenes : undefined;
}

function parseCategoryKitFallbackRules(value: unknown): SaveCategoryKitStrategyInput["fallbackRules"] {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const rules = value.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }
    const when = parseLimitedString(item.when, 500);
    return when
      ? [
          {
            id: parseLimitedString(item.id, 120),
            when,
            use: parseLimitedString(item.use, 1000),
            avoid: parseLimitedString(item.avoid, 1000),
            notes: parseLimitedString(item.notes, 1000)
          }
        ]
      : [];
  });
  return rules.length ? rules : undefined;
}

function parseCategoryPathValue(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      const text = parseLimitedString(item, 80);
      return text ? [text] : [];
    }).slice(0, 8);
  }
  const text = parseOptionalString(value);
  if (!text) {
    return [];
  }
  if (text.trim().startsWith("[")) {
    try {
      const parsed = JSON.parse(text) as unknown;
      return parseCategoryPathValue(parsed);
    } catch {
      return [];
    }
  }
  return text
    .split(/[>/|,，、]+/u)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function parseOptionalBooleanQuery(value: unknown): boolean | undefined {
  const text = parseOptionalString(value)?.toLowerCase();
  if (text === "true" || text === "1" || text === "enabled") {
    return true;
  }
  if (text === "false" || text === "0" || text === "disabled") {
    return false;
  }
  return undefined;
}

function parseOptionalPlatform(value: unknown): EcommercePlatform | undefined {
  const text = parseOptionalString(value);
  return text && ECOMMERCE_PLATFORMS.some((item) => item.id === text) ? (text as EcommercePlatform) : undefined;
}

function parseOptionalMarket(value: unknown): EcommerceMarket | undefined {
  const text = parseOptionalString(value);
  return text && ECOMMERCE_MARKETS.some((item) => item.id === text) ? (text as EcommerceMarket) : undefined;
}

function parseCategoryKitPlannerConfigEntry(input: unknown, index: number): SaveCategoryKitPlannerConfigRequest["models"][number] | undefined {
  if (!isRecord(input)) {
    return undefined;
  }

  const enabled = typeof input.enabled === "boolean" ? input.enabled : undefined;
  const model = parseLimitedString(input.model, 255);
  const name = parseLimitedString(input.name, 120);
  if (typeof enabled !== "boolean" || !model || !name) {
    return undefined;
  }

  const role = input.role === "fallback" ? "fallback" : "primary";
  const priority = typeof input.priority === "number" && Number.isInteger(input.priority) && input.priority > 0 ? input.priority : index + 1;
  const timeoutMs = typeof input.timeoutMs === "number" && Number.isInteger(input.timeoutMs) && input.timeoutMs > 0 ? input.timeoutMs : undefined;

  return {
    id: parseLimitedString(input.id, 64) || undefined,
      enabled,
      name,
      provider: parseCategoryKitPlannerProvider(input.provider, input.baseUrl),
      modules: parseCategoryKitPlannerModules(input.modules),
      role,
    priority,
    apiKey: typeof input.apiKey === "string" ? input.apiKey : undefined,
    preserveApiKey: typeof input.preserveApiKey === "boolean" ? input.preserveApiKey : undefined,
    baseUrl: parseLimitedString(input.baseUrl, 512),
    model,
    timeoutMs
  };
}

function parseCategoryKitPlannerProvider(value: unknown, baseUrl: unknown): SaveCategoryKitPlannerConfigRequest["models"][number]["provider"] {
  if (value === "deepseek" || value === "openai-compatible-chat" || value === "openai-responses") {
    return value;
  }
  const normalizedBaseUrl = parseOptionalString(baseUrl)?.toLowerCase() ?? "";
  return normalizedBaseUrl.includes("deepseek") ? "deepseek" : "openai-responses";
}

function parseCategoryKitPlannerModules(value: unknown): SaveCategoryKitPlannerConfigRequest["models"][number]["modules"] {
  const allowed = new Set(["prompt-optimizer", "category-kit-planner", "category-classifier", "video-storyboard-planner"]);
  if (!Array.isArray(value)) {
    return undefined;
  }
  const raw = value;
  const modules = raw.filter(
    (item): item is NonNullable<SaveCategoryKitPlannerConfigRequest["models"][number]["modules"]>[number] =>
      typeof item === "string" && allowed.has(item)
  );
  return Array.from(new Set(modules));
}

function parseSeedanceVideoConfigPayload(input: unknown): ParseResult<Parameters<typeof saveSeedanceVideoConfig>[0]> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: errorResponse("invalid_seedance_config", "Seedance 视频配置内容必须是 JSON 对象。")
    };
  }

  const model = Object.hasOwn(input, "model") ? parseLimitedString(input.model, 160) : undefined;
  if (Object.hasOwn(input, "model") && !model) {
    return {
      ok: false,
      error: errorResponse("invalid_seedance_config", "Seedance 模型 ID 不能为空，且不能超过 160 个字符。")
    };
  }

  const baseUrl = Object.hasOwn(input, "baseUrl") ? parseLimitedString(input.baseUrl, 512) : undefined;
  if (Object.hasOwn(input, "baseUrl") && input.baseUrl !== "" && !baseUrl) {
    return {
      ok: false,
      error: errorResponse("invalid_seedance_config", "Seedance Base URL 不能超过 512 个字符。")
    };
  }
  if (baseUrl && !isHttpUrl(baseUrl)) {
    return {
      ok: false,
      error: errorResponse("invalid_seedance_config", "Seedance Base URL 必须是 HTTP(S) URL。")
    };
  }

  return {
    ok: true,
    value: {
      apiKey: typeof input.apiKey === "string" ? input.apiKey : undefined,
      preserveApiKey: input.preserveApiKey === true,
      baseUrl,
      model
    }
  };
}

function parseEcommerceGenerationConcurrencyConfigPayload(
  input: unknown
): ParseResult<SaveEcommerceGenerationConcurrencyConfigRequest> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: errorResponse("invalid_ecommerce_generation_concurrency", "并发配置内容必须是 JSON 对象。")
    };
  }

  const globalConcurrency =
    parsePositiveConcurrency(input.globalConcurrency) ??
    parsePositiveConcurrency(input.totalConcurrency) ??
    parsePositiveConcurrency(input.totalThreads);
  const jobConcurrency =
    parsePositiveConcurrency(input.jobConcurrency) ??
    parsePositiveConcurrency(input.taskConcurrency) ??
    parsePositiveConcurrency(input.sceneConcurrency) ??
    parsePositiveConcurrency(input.singleTaskConcurrency);

  if (!globalConcurrency || !jobConcurrency) {
    return {
      ok: false,
      error: errorResponse("invalid_ecommerce_generation_concurrency", "请填写有效的全局并发线程和单任务并发线程。")
    };
  }

  return {
    ok: true,
    value: {
      globalConcurrency,
      jobConcurrency
    }
  };
}

function parseAlipayConfigPayload(input: unknown): ParseResult<SaveAlipayConfigRequest> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: errorResponse("invalid_alipay_config", "支付宝配置内容必须是 JSON 对象。")
    };
  }

  if (typeof input.enabled !== "boolean") {
    return {
      ok: false,
      error: errorResponse("invalid_alipay_config", "enabled 必须是布尔值。")
    };
  }

  return {
    ok: true,
    value: {
      enabled: input.enabled,
      appId: stringValue(input.appId),
      privateKey: stringValue(input.privateKey),
      preservePrivateKey: input.preservePrivateKey === true,
      publicKey: stringValue(input.publicKey),
      preservePublicKey: input.preservePublicKey === true,
      notifyUrl: stringValue(input.notifyUrl),
      returnUrl: stringValue(input.returnUrl),
      gateway: stringValue(input.gateway),
      signType: stringValue(input.signType)
    }
  };
}

function parseWechatMiniAppConfigPayload(input: unknown): ParseResult<SaveWechatMiniAppConfigRequest> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: errorResponse("invalid_wechat_config", "微信小程序配置内容必须是 JSON 对象。")
    };
  }

  if (typeof input.enabled !== "boolean") {
    return {
      ok: false,
      error: errorResponse("invalid_wechat_config", "enabled 必须是布尔值。")
    };
  }

  return {
    ok: true,
    value: {
      enabled: input.enabled,
      appId: stringValue(input.appId),
      appSecret: stringValue(input.appSecret),
      preserveAppSecret: input.preserveAppSecret === true,
      taskCompleteTemplateId: stringValue(input.taskCompleteTemplateId),
      allowBindExistingAccount: input.allowBindExistingAccount !== false,
      allowRegisterNewUser: input.allowRegisterNewUser !== false
    }
  };
}

function parseSmtpSettingsPayload(input: unknown): ParseResult<{
  enabled: boolean;
  host?: string;
  port?: number;
  secure?: boolean;
  username?: string;
  password?: string;
  preservePassword?: boolean;
  fromName?: string;
  fromEmail?: string;
}> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: errorResponse("invalid_smtp_config", "SMTP 配置内容必须是 JSON 对象。")
    };
  }

  if (typeof input.enabled !== "boolean") {
    return {
      ok: false,
      error: errorResponse("invalid_smtp_config", "enabled 必须是布尔值。")
    };
  }

  const port = Object.hasOwn(input, "port") ? parseNonNegativeInteger(input.port) : undefined;
  if (Object.hasOwn(input, "port") && (!port || port > 65535)) {
    return {
      ok: false,
      error: errorResponse("invalid_smtp_config", "SMTP 端口必须是 1-65535 的整数。")
    };
  }

  return {
    ok: true,
    value: {
      enabled: input.enabled,
      host: stringValue(input.host),
      port,
      secure: typeof input.secure === "boolean" ? input.secure : undefined,
      username: stringValue(input.username),
      password: stringValue(input.password),
      preservePassword: input.preservePassword === true,
      fromName: stringValue(input.fromName),
      fromEmail: stringValue(input.fromEmail)
    }
  };
}

function parseAliyunSmsSettingsPayload(input: unknown): ParseResult<{
  enabled: boolean;
  accessKeyId?: string;
  accessKeySecret?: string;
  preserveAccessKeySecret?: boolean;
  endpoint?: string;
  signName?: string;
  registerTemplateCode?: string;
  bindTemplateCode?: string;
}> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: errorResponse("invalid_sms_config", "阿里云短信配置内容必须是 JSON 对象。")
    };
  }

  if (typeof input.enabled !== "boolean") {
    return {
      ok: false,
      error: errorResponse("invalid_sms_config", "enabled 必须是布尔值。")
    };
  }

  return {
    ok: true,
    value: {
      enabled: input.enabled,
      accessKeyId: stringValue(input.accessKeyId),
      accessKeySecret: stringValue(input.accessKeySecret),
      preserveAccessKeySecret: input.preserveAccessKeySecret === true,
      endpoint: stringValue(input.endpoint),
      signName: stringValue(input.signName),
      registerTemplateCode: stringValue(input.registerTemplateCode),
      bindTemplateCode: stringValue(input.bindTemplateCode)
    }
  };
}

function parseRechargePayload(input: unknown): ParseResult<{ amountCents: number; currency?: string; returnUrl?: string }> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: errorResponse("invalid_recharge", "充值内容必须是 JSON 对象。")
    };
  }

  const amountCents = parseNonNegativeInteger(input.amountCents);
  if (amountCents === undefined || amountCents < 100) {
    return {
      ok: false,
      error: errorResponse("invalid_recharge", "充值金额至少 1 元。")
    };
  }

  return {
    ok: true,
    value: {
      amountCents,
      currency: stringValue(input.currency)?.toUpperCase(),
      returnUrl: stringValue(input.returnUrl)
    }
  };
}

function parsePurchasePlanPayload(input: unknown): ParseResult<{
  paymentMethod: "balance" | "alipay";
  returnUrl?: string;
}> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: errorResponse("invalid_purchase", "套餐购买内容必须是 JSON 对象。")
    };
  }

  const paymentMethod = input.paymentMethod === "balance" || input.paymentMethod === "alipay" ? input.paymentMethod : undefined;
  if (!paymentMethod) {
    return {
      ok: false,
      error: errorResponse("invalid_purchase", "paymentMethod 必须是 balance 或 alipay。")
    };
  }

  return {
    ok: true,
    value: {
      paymentMethod,
      returnUrl: stringValue(input.returnUrl)
    }
  };
}

function parseAppleInAppPurchasePayload(input: unknown): ParseResult<VerifyAppleInAppPurchaseRequest> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: errorResponse("invalid_apple_iap", "Apple 内购内容必须是 JSON 对象。")
    };
  }

  const planId = stringValue(input.planId);
  const productId = stringValue(input.productId);
  const transactionId = stringValue(input.transactionId);
  if (!planId || !productId || !transactionId) {
    return {
      ok: false,
      error: errorResponse("invalid_apple_iap", "Apple 内购必须包含 planId、productId 和 transactionId。")
    };
  }

  return {
    ok: true,
    value: {
      appAccountToken: stringValue(input.appAccountToken),
      environment: stringValue(input.environment),
      originalTransactionId: stringValue(input.originalTransactionId),
      planId,
      productId,
      purchaseToken: stringValue(input.purchaseToken),
      transactionId
    }
  };
}

function parseInvoiceApplicationPayload(input: unknown): ParseResult<ApplyInvoiceRequest> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: errorResponse("invalid_invoice_application", "开票申请内容必须是 JSON 对象。")
    };
  }

  const amountCents = parseNonNegativeInteger(input.amountCents);
  if (amountCents === undefined || amountCents <= 0) {
    return {
      ok: false,
      error: errorResponse("invalid_invoice_application", "开票金额必须是大于 0 的整数分。")
    };
  }

  const headerType = input.headerType === "personal" ? "personal" : input.headerType === "company" ? "company" : undefined;
  if (!headerType) {
    return {
      ok: false,
      error: errorResponse("invalid_invoice_application", "headerType 必须是 company 或 personal。")
    };
  }

  const title = stringValue(input.title);
  const email = stringValue(input.email);
  const invoiceContent = stringValue(input.invoiceContent);
  if (!title || !email || !invoiceContent) {
    return {
      ok: false,
      error: errorResponse("invalid_invoice_application", "请填写发票抬头、接收邮箱和开票内容。")
    };
  }

  if (headerType === "company" && !stringValue(input.taxNumber)) {
    return {
      ok: false,
      error: errorResponse("invalid_invoice_application", "企业抬头需要填写纳税人识别号。")
    };
  }

  return {
    ok: true,
    value: {
      headerType,
      title,
      taxNumber: stringValue(input.taxNumber),
      invoiceContent,
      amountCents,
      email,
      phone: stringValue(input.phone),
      companyAddress: stringValue(input.companyAddress),
      bankName: stringValue(input.bankName),
      bankAccount: stringValue(input.bankAccount),
      remark: stringValue(input.remark)
    }
  };
}

function parseInvoiceApplicationUpdatePayload(input: unknown): ParseResult<UpdateInvoiceApplicationRequest> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: errorResponse("invalid_invoice_update", "开票处理内容必须是 JSON 对象。")
    };
  }
  const status = input.status;
  if (status !== "pending" && status !== "processing" && status !== "issued" && status !== "rejected") {
    return {
      ok: false,
      error: errorResponse("invalid_invoice_update", "status 必须是 pending、processing、issued 或 rejected。")
    };
  }
  return {
    ok: true,
    value: {
      status,
      reviewNote: stringValue(input.reviewNote)
    }
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
  const maskDataUrl = parseOptionalString(input.referenceImage.maskDataUrl);
  const maskedDataUrl = parseOptionalString(input.referenceImage.maskedDataUrl);
  const annotatedDataUrl = parseOptionalString(input.referenceImage.annotatedDataUrl);
  const referenceAssetId = parseOptionalString(input.referenceAssetId);

  if (referenceAssetId && !(await readStoredAsset(tenant, referenceAssetId))) {
    return {
      ok: false,
      error: errorResponse("invalid_request", "找不到可读取的参考图像资源。")
    };
  }

  const referenceImage: ReferenceImageInput = {
    dataUrl,
    fileName: typeof fileName === "string" && fileName.trim() ? fileName.trim() : undefined,
    maskDataUrl: maskDataUrl ?? undefined,
    maskedDataUrl: maskedDataUrl ?? undefined,
    annotatedDataUrl: annotatedDataUrl ?? undefined
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

function parsePhotoshopPackagePayload(input: unknown): ParseResult<{ assetId: string; packageName?: string }> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: errorResponse("invalid_photoshop_package", "Photoshop 工作流内容必须是 JSON 对象。")
    };
  }

  const assetId = parseLimitedString(input.assetId, 128);
  if (!assetId) {
    return {
      ok: false,
      error: errorResponse("invalid_photoshop_package", "请提供有效的图像资源 ID。")
    };
  }

  return {
    ok: true,
    value: {
      assetId,
      packageName: parseLimitedString(input.packageName, 80)
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
      count: count.value,
      modelConfigId: parseOptionalString(input.modelConfigId)
    }
  };
}

function parsePromptOptimizePayload(input: unknown): ParseResult<PromptOptimizeRequest> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: errorResponse("invalid_request", "请求内容必须是 JSON 对象。")
    };
  }

  const prompt = parseLimitedString(input.prompt, 2000);
  if (!prompt) {
    return {
      ok: false,
      error: errorResponse("invalid_prompt", "请输入需要优化的提示词，且不能超过 2000 个字符。")
    };
  }

  const stylePreset = parseStylePreset(input);
  if (!stylePreset.ok) {
    return stylePreset;
  }

  const mode = input.mode === "reference" ? "reference" : "text";
  const size = isRecord(input.size) ? parseSize(input.size) : undefined;
  if (size && !size.ok) {
    return size;
  }
  if (size && (!Number.isFinite(size.value.width) || !Number.isFinite(size.value.height))) {
    return {
      ok: false,
      error: errorResponse("invalid_size", "请提供有效的图像尺寸。")
    };
  }

  return {
    ok: true,
    value: {
      prompt,
      mode,
      stylePresetId: stylePreset.value,
      size: size?.value,
      sizePresetId: parseOptionalString(input.sizePresetId),
      hasReferenceImage: input.hasReferenceImage === true
    }
  };
}

function parseSeedanceStoryboardPlanPayload(input: unknown): ParseResult<SeedanceVideoStoryboardPlanRequest> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: errorResponse("invalid_request", "请求内容必须是 JSON 对象。")
    };
  }

  const intent = parseLimitedString(input.intent, 1000);
  if (!intent) {
    return {
      ok: false,
      error: errorResponse("invalid_seedance_storyboard_intent", "请输入视频意图，且不能超过 1000 个字符。")
    };
  }

  if (!Array.isArray(input.referenceImages) || input.referenceImages.length === 0) {
    return {
      ok: false,
      error: errorResponse("invalid_seedance_storyboard_reference_images", "请至少上传一张产品参考图。")
    };
  }
  if (input.referenceImages.length > 4) {
    return {
      ok: false,
      error: errorResponse("invalid_seedance_storyboard_reference_images", "视频分镜最多支持 4 张参考图。")
    };
  }

  const referenceImages: ReferenceImageInput[] = [];
  for (const [index, item] of input.referenceImages.entries()) {
    const referenceImage = parseEcommerceReferenceImage(item);
    if (!referenceImage) {
      return {
        ok: false,
        error: errorResponse("invalid_seedance_storyboard_reference_images", `第 ${index + 1} 张参考图格式不受支持。`)
      };
    }
    referenceImages.push(referenceImage);
  }

  return {
    ok: true,
    value: {
      intent,
      referenceImages,
      ratio: parseSeedanceRatioString(input.ratio),
      duration: parseSeedanceStoryboardDurationValue(input.duration),
      resolution: parseSeedanceResolutionString(input.resolution),
      generateAudio: typeof input.generateAudio === "boolean" ? input.generateAudio : undefined
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

  const textLanguage = parseEcommerceTextLanguage(input.textLanguage);
  if (!textLanguage.ok) {
    return textLanguage;
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

  const referenceImages = parseEcommerceReferenceImages(input.referenceImages);
  if (!referenceImages.ok) {
    return referenceImages;
  }
  const additionalReferenceImages = parseAdditionalReferenceImages(input.additionalReferenceImages ?? input.additional_reference_images);
  if (!additionalReferenceImages.ok) {
    return additionalReferenceImages;
  }
  const assets = parseCategoryKitAssets(input.assets);
  if (!assets.ok) {
    return assets;
  }
  const missingInputs = parseCategoryKitMissingInputs(input.missingInputs ?? input.missing_inputs ?? input.missingItems ?? input.missing_items);
  if (!missingInputs.ok) {
    return missingInputs;
  }
  const plannedImages = parseCategoryKitPlannedImages(input.plannedImages ?? input.planned_images ?? input.imagePlan ?? input.image_plan);
  if (!plannedImages.ok) {
    return plannedImages;
  }
  const strategy = parseCategoryKitStrategyValue(input.strategy);
  if (!strategy.ok) {
    return strategy;
  }
  const strategyId = parseLimitedString(input.strategyId ?? input.strategy_id, 64);

  return {
    ok: true,
    value: {
      product: product.value,
      platform: platform.value,
      market: market.value,
      textLanguage: textLanguage.value,
      categoryPath: parseCategoryPathValue(input.categoryPath ?? input.category_path),
      categoryName: parseLimitedString(input.categoryName ?? input.category_name, 255),
      strategyId,
      strategy: strategy.value,
      assets: assets.value,
      missingInputs: missingInputs.value,
      plannedImages: plannedImages.value,
      allowTextRecreation: parseOptionalBoolean(input.allowTextRecreation) ?? true,
      removeWatermarkAndLogo: parseOptionalBoolean(input.removeWatermarkAndLogo) ?? true,
      brandOverlayPlacement: parseBrandOverlayPlacement(input.brandOverlayPlacement),
      sceneTemplateIds: sceneTemplateIds.value,
      size: resolvedSize.size,
      stylePresetId: stylePreset.value,
      quality: quality.value,
      outputFormat: outputFormat.value,
      countPerScene: count.value,
      sourcePageUrl: parseOptionalString(input.sourcePageUrl),
      referenceImage: parseEcommerceReferenceImage(input.referenceImage),
      referenceImages: referenceImages.value,
      additionalReferenceImages: additionalReferenceImages.value,
      createComparisonCollage: parseOptionalBoolean(input.createComparisonCollage) === true,
      extraDirection: parseOptionalString(input.extraDirection)
    }
  };
}

function parseCategoryKitPreparationPayload(input: unknown): ParseResult<ResolvedCategoryKitPreparationRequest> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: errorResponse("invalid_request", "请求内容必须是 JSON 对象。")
    };
  }

  const product = parseEcommerceProductForCategoryKit(input.product);
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
  const textLanguage = parseEcommerceTextLanguage(input.textLanguage);
  if (!textLanguage.ok) {
    return textLanguage;
  }
  const assets = parseCategoryKitAssets(input.assets);
  if (!assets.ok) {
    return assets;
  }
  const missingInputs = parseCategoryKitMissingInputs(input.missingInputs ?? input.missing_inputs ?? input.missingItems ?? input.missing_items);
  if (!missingInputs.ok) {
    return missingInputs;
  }
  const strategy = parseCategoryKitStrategyValue(input.strategy);
  if (!strategy.ok) {
    return strategy;
  }

  return {
    ok: true,
    value: {
      product: product.value,
      platform: platform.value,
      market: market.value,
      textLanguage: textLanguage.value,
      categoryPath: parseCategoryPathValue(input.categoryPath ?? input.category_path),
      categoryName: parseLimitedString(input.categoryName ?? input.category_name, 255),
      strategyId: parseLimitedString(input.strategyId ?? input.strategy_id, 64),
      strategy: strategy.value,
      assets: assets.value,
      missingInputs: missingInputs.value,
      referenceImage: parseEcommerceReferenceImage(input.referenceImage ?? input.reference_image),
      extraDirection: parseOptionalString(input.extraDirection ?? input.extra_direction)
    }
  };
}

async function resolveCategoryKitStrategyForRequest(
  input: Pick<ResolvedCategoryKitPreparationRequest, "strategy" | "strategyId">
): Promise<EcommerceCategoryKitStrategy | undefined> {
  if (input.strategy) {
    return input.strategy;
  }
  if (!input.strategyId) {
    return undefined;
  }
  return (await getCategoryKitStrategy(input.strategyId)).strategy;
}

function parseCategoryKitAssets(value: unknown): ParseResult<EcommerceCategoryKitAssetInput[] | undefined> {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }
  if (!Array.isArray(value)) {
    return {
      ok: false,
      error: errorResponse("invalid_category_kit_assets", "品类套图素材必须是数组。")
    };
  }
  if (value.length > 24) {
    return {
      ok: false,
      error: errorResponse("invalid_category_kit_assets", "单个品类套图任务最多支持 24 张补充素材。")
    };
  }

  const assets: EcommerceCategoryKitAssetInput[] = [];
  for (const [index, item] of value.entries()) {
    if (!isRecord(item)) {
      return {
        ok: false,
        error: errorResponse("invalid_category_kit_assets", `第 ${index + 1} 张补充素材格式不受支持。`)
      };
    }
    const referenceImage = parseEcommerceReferenceImage(item.referenceImage ?? item.reference_image ?? item);
    const referenceAssetId = parseLimitedString(item.referenceAssetId ?? item.reference_asset_id, 128);
    const url = parseLimitedString(item.url, 2000);
    if (url && !isHttpUrl(url)) {
      return {
        ok: false,
        error: errorResponse("invalid_category_kit_assets", `第 ${index + 1} 张补充素材 URL 必须是 HTTP(S) 地址。`)
      };
    }
    if (!referenceImage && !referenceAssetId && !url) {
      return {
        ok: false,
        error: errorResponse("invalid_category_kit_assets", `第 ${index + 1} 张补充素材缺少图片或资源地址。`)
      };
    }

    assets.push({
      id: parseLimitedString(item.id, 128),
      role: parseLimitedString(item.role, 80) ?? "other",
      referenceImage,
      referenceAssetId,
      url,
      fileName: parseLimitedString(item.fileName ?? item.file_name, 255) ?? referenceImage?.fileName,
      title: parseLimitedString(item.title, 255),
      description: parseLimitedString(item.description, 1000),
      required: parseOptionalBoolean(item.required),
      tags: parseStringArray(item.tags, 24, 80)
    });
  }

  return { ok: true, value: assets.length ? assets : undefined };
}

function parseStringArray(value: unknown, maxItems: number, maxLength: number): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items = value.flatMap((item) => {
    const text = parseLimitedString(item, maxLength);
    return text ? [text] : [];
  });
  return items.length ? items.slice(0, maxItems) : undefined;
}

function parseCategoryKitMissingInputs(value: unknown): ParseResult<EcommerceCategoryKitMissingInput[] | undefined> {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }
  if (!Array.isArray(value)) {
    return {
      ok: false,
      error: errorResponse("invalid_category_kit_missing_inputs", "缺失项必须是数组。")
    };
  }

  const items = value.flatMap((item, index): EcommerceCategoryKitMissingInput[] => {
    if (typeof item === "string") {
      const label = item.trim();
      return label ? [{ id: `provided:${index}:${label.slice(0, 40)}`, label, required: false, recommended: true }] : [];
    }
    if (!isRecord(item)) {
      return [];
    }
    const label = parseLimitedString(item.label ?? item.name ?? item.title, 255);
    const id = parseLimitedString(item.id, 128) ?? (label ? `provided:${index}:${label.slice(0, 40)}` : undefined);
    return id
      ? [
          {
            id,
            label,
            description: parseLimitedString(item.description, 1000),
            role: parseLimitedString(item.role, 80),
            required: parseOptionalBoolean(item.required),
            recommended: parseOptionalBoolean(item.recommended),
            examples: parseStringArray(item.examples, 12, 160)
          }
        ]
      : [];
  });

  return { ok: true, value: items.length ? items.slice(0, 80) : undefined };
}

function parseCategoryKitPlannedImages(value: unknown): ParseResult<EcommerceCategoryKitPlanItem[] | undefined> {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }
  if (!Array.isArray(value)) {
    return {
      ok: false,
      error: errorResponse("invalid_category_kit_plan", "品类套图计划必须是数组。")
    };
  }
  if (value.length > 12) {
    return {
      ok: false,
      error: errorResponse("invalid_category_kit_plan", "单个品类套图任务最多支持 12 张规划图。")
    };
  }

  const plannedImages: EcommerceCategoryKitPlanItem[] = [];
  for (const [index, item] of value.entries()) {
    if (!isRecord(item)) {
      return {
        ok: false,
        error: errorResponse("invalid_category_kit_plan", `第 ${index + 1} 张规划图格式不受支持。`)
      };
    }
    const title = parseLimitedString(item.title ?? item.name, 160);
    const purpose = parseLimitedString(item.purpose ?? item.goal, 500);
    const prompt = parseLimitedString(item.prompt ?? item.imagePrompt ?? item.image_prompt, 4000);
    if (!title || !prompt) {
      return {
        ok: false,
        error: errorResponse("invalid_category_kit_plan", `第 ${index + 1} 张规划图需要包含标题和生图提示词。`)
      };
    }

    plannedImages.push({
      title,
      purpose: purpose || title,
      prompt,
      notes: parseLimitedString(item.notes ?? item.constraints ?? item.copy_notes, 1000),
      sourceImageRoles: parseStringListLike(item.sourceImageRoles ?? item.source_image_roles ?? item.sourceRoles ?? item.source_roles)
    });
  }

  return { ok: true, value: plannedImages.length ? plannedImages : undefined };
}

function parseCategoryKitStrategyValue(value: unknown): ParseResult<EcommerceCategoryKitStrategy | undefined> {
  if (value === undefined || value === null) {
    return { ok: true, value: undefined };
  }
  if (!isRecord(value)) {
    return {
      ok: false,
      error: errorResponse("invalid_category_kit_strategy", "内联类目策略必须是 JSON 对象。")
    };
  }
  const categoryPath = parseCategoryPathValue(value.categoryPath ?? value.category_path);
  if (!parseLimitedString(value.id, 128) || categoryPath.length === 0) {
    return {
      ok: false,
      error: errorResponse("invalid_category_kit_strategy", "内联类目策略缺少 id 或 categoryPath。")
    };
  }
  return {
    ok: true,
    value: {
      ...(value as unknown as EcommerceCategoryKitStrategy),
      id: parseLimitedString(value.id, 128)!,
      categoryPath,
      categoryName: parseLimitedString(value.categoryName ?? value.category_name, 255) ?? categoryPath[categoryPath.length - 1],
      platform: parseOptionalPlatform(value.platform),
      market: parseOptionalMarket(value.market)
    }
  };
}

function parseEcommerceProductForCategoryKit(value: unknown): ParseResult<EcommerceProductBrief> {
  const source = isRecord(value) ? value : {};
  const product = parseEcommerceProduct({
    ...source,
    title: parseOptionalString(source.title) ?? "AI 自拆品类套图"
  });
  if (!product.ok) {
    return product;
  }
  return product;
}

function parseBrandOverlayPlacement(value: unknown): BrandOverlayPlacement | undefined {
  const placement = parseOptionalString(value);
  if (!placement) {
    return undefined;
  }
  if (placement === "top-left" || placement === "top-right" || placement === "bottom-left" || placement === "bottom-right") {
    return placement;
  }
  return undefined;
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
  const maskDataUrl = parseOptionalString(value.maskDataUrl);
  const maskedDataUrl = parseOptionalString(value.maskedDataUrl);
  const annotatedDataUrl = parseOptionalString(value.annotatedDataUrl);
  const additionalReferenceImages = parseAdditionalReferenceImages(value.additionalReferenceImages ?? value.additional_reference_images);
  return {
    dataUrl,
    fileName: typeof fileName === "string" && fileName.trim() ? fileName.trim() : undefined,
    maskDataUrl: maskDataUrl ?? undefined,
    maskedDataUrl: maskedDataUrl ?? undefined,
    annotatedDataUrl: annotatedDataUrl ?? undefined,
    additionalReferenceImages: additionalReferenceImages.ok ? additionalReferenceImages.value : undefined
  };
}

function parseAdditionalReferenceImages(value: unknown): ParseResult<ReferenceImageInput[] | undefined> {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }
  if (!Array.isArray(value)) {
    return {
      ok: false,
      error: errorResponse("invalid_reference_image", "附加参考图必须是数组。")
    };
  }
  if (value.length > 4) {
    return {
      ok: false,
      error: errorResponse("invalid_reference_image", "单次编辑最多支持 4 张附加参考图。")
    };
  }

  const images: ReferenceImageInput[] = [];
  for (const [index, item] of value.entries()) {
    const referenceImage = parseEcommerceReferenceImage(item);
    if (!referenceImage) {
      return {
        ok: false,
        error: errorResponse("invalid_reference_image", `第 ${index + 1} 张附加参考图格式不受支持。`)
      };
    }
    images.push(referenceImage);
  }

  return { ok: true, value: images.length ? images : undefined };
}

function parseEcommerceReferenceImages(value: unknown): ParseResult<EcommerceBatchReferenceImage[] | undefined> {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }
  if (!Array.isArray(value)) {
    return {
      ok: false,
      error: errorResponse("invalid_reference_image", "批量参考图必须是数组。")
    };
  }
  if (value.length === 0) {
    return { ok: true, value: undefined };
  }
  if (value.length > 48) {
    return {
      ok: false,
      error: errorResponse("invalid_reference_image", "单个批量任务最多支持 48 张参考图。")
    };
  }

  const referenceImages: EcommerceBatchReferenceImage[] = [];
  for (const [index, item] of value.entries()) {
    if (!isRecord(item)) {
      return {
        ok: false,
        error: errorResponse("invalid_reference_image", `第 ${index + 1} 张批量参考图格式不受支持。`)
      };
    }

    const referenceImage = parseEcommerceReferenceImage(item.referenceImage ?? item);
    if (!referenceImage) {
      return {
        ok: false,
        error: errorResponse("invalid_reference_image", `第 ${index + 1} 张批量参考图格式不受支持。`)
      };
    }

    let size: ImageSize | undefined;
    if (typeof item.size !== "undefined") {
      const parsedSize = parseSize(item.size);
      if (!parsedSize.ok) {
        return parsedSize;
      }
      const resolvedSize = validateSceneImageSize({ size: parsedSize.value });
      if (!resolvedSize.ok) {
        return {
          ok: false,
          error: errorResponse(resolvedSize.code, resolvedSize.message)
        };
      }
      size = resolvedSize.size;
    }

    const additionalReferenceImages = parseAdditionalReferenceImages(item.additionalReferenceImages ?? item.additional_reference_images);
    if (!additionalReferenceImages.ok) {
      return additionalReferenceImages;
    }

    referenceImages.push({
      referenceImage,
      size,
      additionalReferenceImages: additionalReferenceImages.value,
      title: parseOptionalString(item.title),
      extraDirection: parseOptionalString(item.extraDirection)
    });
  }

  return { ok: true, value: referenceImages };
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
  if (!ECOMMERCE_PLATFORMS.some((item) => item.id === platform)) {
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
  if (!ECOMMERCE_MARKETS.some((item) => item.id === market)) {
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

function parseEcommerceTextLanguage(value: unknown): ParseResult<EcommerceTextLanguage> {
  const textLanguage = parseOptionalString(value) ?? "none";
  if (!ECOMMERCE_TEXT_LANGUAGES.some((item) => item.id === textLanguage)) {
    return {
      ok: false,
      error: errorResponse("invalid_text_language", "不支持的目标文字。")
    };
  }

  return {
    ok: true,
    value: textLanguage as EcommerceTextLanguage
  };
}

function parseEcommerceSceneIds(value: unknown): ParseResult<EcommerceSceneTemplateId[]> {
  if (!Array.isArray(value) || value.length === 0) {
    return {
      ok: false,
      error: errorResponse("invalid_scene_templates", "请至少选择一个跨境电商生图场景。")
    };
  }

  const supported = ECOMMERCE_SCENE_TEMPLATES.map((item) => item.id) as EcommerceSceneTemplateId[];
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
    value: sceneIds
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

function parseHelpCategoryPayload(input: unknown): ParseResult<SaveHelpCategoryRequest> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: errorResponse("invalid_help_category", "帮助分类内容必须是 JSON 对象。")
    };
  }

  const name = parseLimitedString(input.name, 120);
  if (!name) {
    return {
      ok: false,
      error: errorResponse("invalid_help_category_name", "分类名称不能为空，且不能超过 120 个字符。")
    };
  }

  const sortOrder = Object.hasOwn(input, "sortOrder") ? parseNonNegativeInteger(input.sortOrder) : 0;
  if (sortOrder === undefined) {
    return {
      ok: false,
      error: errorResponse("invalid_help_category_sort", "分类排序必须是非负整数。")
    };
  }

  return {
    ok: true,
    value: {
      slug: parseOptionalString(input.slug),
      name,
      description: parseOptionalString(input.description),
      audience: parseOptionalString(input.audience),
      sortOrder,
      enabled: parseOptionalBoolean(input.enabled) ?? true
    }
  };
}

function parseHelpArticlePayload(input: unknown): ParseResult<SaveHelpArticleRequest> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: errorResponse("invalid_help_article", "帮助文章内容必须是 JSON 对象。")
    };
  }

  const categoryId = parseOptionalString(input.categoryId);
  const title = parseLimitedString(input.title, 160);
  if (!categoryId) {
    return {
      ok: false,
      error: errorResponse("invalid_help_article_category", "请选择文章分类。")
    };
  }
  if (!title) {
    return {
      ok: false,
      error: errorResponse("invalid_help_article_title", "文章标题不能为空，且不能超过 160 个字符。")
    };
  }

  const sortOrder = Object.hasOwn(input, "sortOrder") ? parseNonNegativeInteger(input.sortOrder) : 0;
  if (sortOrder === undefined) {
    return {
      ok: false,
      error: errorResponse("invalid_help_article_sort", "文章排序必须是非负整数。")
    };
  }

  const contentMarkdown = parseHelpMarkdown(input.contentMarkdown);
  if (!contentMarkdown) {
    return {
      ok: false,
      error: errorResponse("invalid_help_article_content", "请输入帮助内容。")
    };
  }

  return {
    ok: true,
    value: {
      categoryId,
      slug: parseOptionalString(input.slug),
      title,
      summary: parseOptionalString(input.summary),
      contentMarkdown,
      coverImageUrl: parseOptionalString(input.coverImageUrl),
      videoUrl: parseOptionalString(input.videoUrl),
      status: input.status === "draft" ? "draft" : "published",
      featured: parseOptionalBoolean(input.featured) ?? false,
      sortOrder,
      tags: parseStringList(input.tags)
    }
  };
}

function parseStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean).slice(0, 50);
}

function parseHelpMarkdown(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseSeedanceRatioString(value: unknown): string | undefined {
  const ratio = parseOptionalString(value);
  return ratio && /^\d{1,2}:\d{1,2}$/u.test(ratio) ? ratio : undefined;
}

function parseSeedanceResolutionString(value: unknown): string | undefined {
  const resolution = parseOptionalString(value)?.toLowerCase();
  if (!resolution || resolution === "auto") {
    return resolution;
  }
  return /^(?:480p|720p|1080p|2k|4k)$/u.test(resolution) ? resolution : undefined;
}

function parseSeedanceStoryboardDurationValue(value: unknown): number | undefined {
  const duration = typeof value === "number" ? value : typeof value === "string" ? Number.parseInt(value, 10) : Number.NaN;
  if (!Number.isSafeInteger(duration) || duration <= 0) {
    return undefined;
  }
  return Math.min(duration, 6);
}

function workspaceMemberId(workspaceId: string, userId: string): string {
  return createHash("sha256").update(`${workspaceId}:${userId}`).digest("hex");
}

function parseOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
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

function parsePositiveConcurrency(value: unknown): number | undefined {
  const numericValue = typeof value === "number" ? value : typeof value === "string" ? Number.parseInt(value, 10) : Number.NaN;
  if (!Number.isSafeInteger(numericValue) || numericValue <= 0) {
    return undefined;
  }
  return numericValue;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
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
  await initializeEcommerceGenerationConcurrency();

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
