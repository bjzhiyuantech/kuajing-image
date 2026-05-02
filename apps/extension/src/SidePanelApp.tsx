import {
  BarChart3,
  CheckCircle2,
  Coins,
  Clock3,
  CreditCard,
  Download,
  Edit3,
  ExternalLink,
  ImageIcon,
  KeyRound,
  Loader2,
  LogOut,
  Package,
  RefreshCw,
  Send,
  Settings,
  Sparkles,
  Trash2,
  Upload,
  UserCircle2,
  Wallet,
  Wand2,
  X
} from "lucide-react";
import type { ChangeEvent, FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ECOMMERCE_MARKETS,
  ECOMMERCE_PLATFORMS,
  ECOMMERCE_SCENE_TEMPLATES,
  ECOMMERCE_TEXT_LANGUAGES,
  IMAGE_SIZE_MULTIPLE,
  MAX_IMAGE_ASPECT_RATIO,
  SIZE_PRESETS,
  composeEcommercePrompt,
  type BillingOrder,
  type BillingTransaction,
  type BillingPlan,
  type EcommerceBatchGenerateResponse,
  type EcommerceGenerationMode,
  type EcommerceSceneTemplateId,
  type GeneratedAsset,
  type GenerationRecord,
  type GenerationResponse,
  type ImageQuality,
  type OutputFormat,
  type ReferenceImageInput,
  type StylePresetId
} from "@gpt-image-canvas/shared";
import type { AuthUser, BatchFormState, BatchTask, ExtensionAuthState, PageContext } from "./types";

const ACTIVE_BATCH_JOB_STORAGE_KEY = "activeBatchJob";
const AUTH_STORAGE_KEY = "auth";
const DEFAULT_API_BASE_URL = "https://imagen.neimou.com";
const MOCK_BILLING_PLANS: BillingPlan[] = [
  {
    id: "starter",
    name: "入门套餐",
    description: "适合少量商品图优化。",
    imageQuota: 120,
    storageQuotaBytes: 2 * 1024 * 1024 * 1024,
    priceCents: 9900,
    currency: "CNY",
    enabled: true,
    sortOrder: 10,
    benefits: ["120 次出图额度", "基础历史记录", "支付宝购买"],
    createdAt: "",
    updatedAt: ""
  },
  {
    id: "pro",
    name: "专业套餐",
    description: "适合稳定上新和多店铺运营。",
    imageQuota: 600,
    storageQuotaBytes: 10 * 1024 * 1024 * 1024,
    priceCents: 39900,
    currency: "CNY",
    enabled: true,
    sortOrder: 20,
    recommended: true,
    benefits: ["600 次出图额度", "批量任务优先", "适合团队协作"],
    createdAt: "",
    updatedAt: ""
  }
];

const defaultAuth: ExtensionAuthState = {
  token: "",
  user: null
};

interface StoredBatchJob {
  jobId: string;
  apiBaseUrl: string;
  token?: string;
}

type ToolTab = "account" | "billing" | "history" | "stats";
type AuthMode = "login" | "register";
type PendingAuthAction = "generate" | "billing" | "history" | "stats" | "job";

interface EcommerceJobSummary {
  id: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string;
  sourcePageUrl?: string;
  totalScenes?: number;
  completedScenes?: number;
  progress?: number;
  records?: GenerationRecord[];
}

interface EcommerceStatsSummary {
  totalJobs: number;
  succeededJobs: number;
  failedJobs: number;
  runningJobs: number;
  generatedImages: number;
}

interface BillingOverview {
  balanceCents: number;
  currency: string;
  currentPlan?: BillingPlan;
  currentPlanExpiresAt?: string;
  plans: BillingPlan[];
  transactions: BillingTransaction[];
  orders: BillingOrder[];
  imageUnitPriceCents: number;
  quotaTotal: number;
  quotaUsed: number;
  packageTotal?: number;
  packageUsed?: number;
  packageRemaining?: number;
}

interface RemoteState<T> {
  data: T;
  error: string;
  loading: boolean;
}

interface ResultImageItem {
  key: string;
  record: GenerationRecord;
  asset: GeneratedAsset;
}

interface EditImageDialogState {
  item: ResultImageItem;
  prompt: string;
  error: string;
  loading: boolean;
}

interface UploadedReferenceImage {
  id: string;
  dataUrl: string;
  fileName: string;
}

const defaultForm: BatchFormState = {
  product: {
    title: "",
    description: "",
    bulletPoints: [],
    targetCustomer: "",
    usageScene: "",
    material: "",
    color: "",
    brandTone: "premium, trustworthy, marketplace-ready"
  },
  generationMode: "enhance",
  platform: "amazon",
  market: "us",
  textLanguage: "none",
  allowTextRecreation: true,
  removeWatermarkAndLogo: true,
  sceneTemplateIds: ["marketplace-main", "logo-benefit", "feature-benefit"],
  sizeMode: "preset",
  size: { width: 1024, height: 1024 },
  stylePresetId: "product",
  quality: "auto",
  outputFormat: "png",
  countPerScene: 1,
  referenceImageUrl: "",
  referenceImageUrls: [],
  extraDirection: "",
  brandOverlay: {
    enabled: false,
    logoDataUrl: "",
    logoFileName: "",
    text: "",
    placement: "top-right"
  }
};

const defaultSceneIdsByMode: Record<EcommerceGenerationMode, EcommerceSceneTemplateId[]> = {
  enhance: ["marketplace-main", "logo-benefit", "feature-benefit"],
  creative: ["lifestyle", "model-wear", "accessory-match"]
};

const generationModes: Array<{ id: EcommerceGenerationMode; label: string; hint: string }> = [
  { id: "enhance", label: "原图增强", hint: "保留商品原貌，生成卖点文字和电商排版。" },
  { id: "creative", label: "场景创作", hint: "依据主图生成生活方式、模特穿戴和搭配场景。" }
];

const qualityOptions: Array<{ id: ImageQuality; label: string }> = [
  { id: "auto", label: "自动" },
  { id: "low", label: "快速草稿" },
  { id: "medium", label: "标准" },
  { id: "high", label: "高质量" }
];

const formatOptions: Array<{ id: OutputFormat; label: string }> = [
  { id: "png", label: "PNG" },
  { id: "jpeg", label: "JPEG" },
  { id: "webp", label: "WebP" }
];

const styleOptions: Array<{ id: StylePresetId; label: string }> = [
  { id: "product", label: "商业产品" },
  { id: "photoreal", label: "真实摄影" },
  { id: "poster", label: "海报视觉" },
  { id: "illustration", label: "精致插画" },
  { id: "none", label: "无风格" }
];

const SOURCE_ASPECT_SIZE_OPTION = "source-aspect";
const SOURCE_ASPECT_BASE_SIZE = 1024;

const isApiAssetUrl = (url: string): boolean => url.startsWith("/api/assets/");

function createClientId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
    return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex
      .slice(8, 10)
      .join("")}-${hex.slice(10, 16).join("")}`;
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function referenceImageFromUrl(url: string): Promise<ReferenceImageInput> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("参考图读取失败，请换一张商品主图。");
  }

  const blob = await response.blob();
  if (!blob.type.startsWith("image/")) {
    throw new Error("参考图 URL 返回的不是图片。");
  }
  if (blob.size > 50 * 1024 * 1024) {
    throw new Error("参考图超过 50MB，请换一张较小的商品主图。");
  }

  return {
    dataUrl: await blobToDataUrl(blob, "参考图转换失败。"),
    fileName: fileNameFromUrl(url)
  };
}

function blobToDataUrl(blob: Blob, errorMessage = "图片转换失败。"): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(errorMessage));
    reader.readAsDataURL(blob);
  });
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadUrl(url: string, fileName: string): void {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.target = "_blank";
  anchor.rel = "noreferrer";
  anchor.click();
}

function imageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片载入失败。"));
    image.src = url;
  });
}

function roundToImageSizeMultiple(value: number): number {
  return Math.max(IMAGE_SIZE_MULTIPLE, Math.round(value / IMAGE_SIZE_MULTIPLE) * IMAGE_SIZE_MULTIPLE);
}

function sizeFromImageAspect(width: number, height: number): { width: number; height: number } {
  const rawRatio = width > 0 && height > 0 ? width / height : 1;
  const ratio = Math.min(MAX_IMAGE_ASPECT_RATIO, Math.max(1 / MAX_IMAGE_ASPECT_RATIO, rawRatio));
  if (ratio >= 1) {
    return {
      width: roundToImageSizeMultiple(SOURCE_ASPECT_BASE_SIZE * ratio),
      height: SOURCE_ASPECT_BASE_SIZE
    };
  }

  return {
    width: SOURCE_ASPECT_BASE_SIZE,
    height: roundToImageSizeMultiple(SOURCE_ASPECT_BASE_SIZE / ratio)
  };
}

function drawContainedImage(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number): void {
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

async function mergeReferenceImages(images: ReferenceImageInput[]): Promise<ReferenceImageInput> {
  if (images.length === 0) {
    throw new Error("请先选择参考图。");
  }
  if (images.length === 1) {
    return images[0];
  }

  const loadedImages = await Promise.all(images.slice(0, 2).map((item) => imageFromUrl(item.dataUrl)));
  const cellSize = 720;
  const gap = 18;
  const padding = 28;
  const canvas = document.createElement("canvas");
  canvas.width = cellSize * loadedImages.length + gap * (loadedImages.length - 1) + padding * 2;
  canvas.height = cellSize + padding * 2;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("参考图合成失败。");
  }

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  loadedImages.forEach((image, index) => {
    const x = padding + index * (cellSize + gap);
    ctx.fillStyle = "#f7faf8";
    ctx.fillRect(x, padding, cellSize, cellSize);
    drawContainedImage(ctx, image, x + 18, padding + 18, cellSize - 36, cellSize - 36);
  });

  return {
    dataUrl: canvas.toDataURL("image/png"),
    fileName: "reference-angles.png"
  };
}

async function referenceImageFromSources(urls: string[]): Promise<ReferenceImageInput | undefined> {
  const trimmedUrls = urls.map((url) => url.trim()).filter(Boolean).slice(0, 2);
  if (trimmedUrls.length === 0) {
    return undefined;
  }

  const images = await Promise.all(trimmedUrls.map((url) => referenceImageFromUrl(url)));
  return mergeReferenceImages(images);
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.lineTo(x + width - safeRadius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  ctx.lineTo(x + width, y + height - safeRadius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  ctx.lineTo(x + safeRadius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  ctx.lineTo(x, y + safeRadius);
  ctx.quadraticCurveTo(x, y, x + safeRadius, y);
  ctx.closePath();
}

function brandedFileName(fileName: string): string {
  const index = fileName.lastIndexOf(".");
  if (index <= 0) {
    return `${fileName}-brand`;
  }
  return `${fileName.slice(0, index)}-brand${fileName.slice(index)}`;
}

function fileNameFromUrl(url: string): string | undefined {
  try {
    const pathname = new URL(url).pathname;
    const name = pathname.split("/").filter(Boolean).at(-1);
    return name || undefined;
  } catch {
    return undefined;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function firstString(source: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return undefined;
}

function firstNumber(source: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }
  return undefined;
}

function normalizeJobsResponse(payload: unknown): EcommerceJobSummary[] {
  const root = asRecord(payload);
  const items = Array.isArray(payload)
    ? payload
    : Array.isArray(root.jobs)
      ? root.jobs
      : Array.isArray(root.items)
        ? root.items
        : Array.isArray(root.data)
          ? root.data
          : [];

  return items.map((item) => {
    const source = asRecord(item);
    const records = Array.isArray(source.records) ? (source.records as GenerationRecord[]) : undefined;
    const totalScenes = firstNumber(source, ["totalScenes", "total", "sceneCount"]);
    const completedScenes = firstNumber(source, ["completedScenes", "completed", "finishedScenes"]);
    const progress = firstNumber(source, ["progress", "percent"]);
    return {
      id: firstString(source, ["id", "jobId"]) ?? createClientId(),
      status: firstString(source, ["status"]) ?? "unknown",
      createdAt: firstString(source, ["createdAt", "created_at"]),
      updatedAt: firstString(source, ["updatedAt", "updated_at"]),
      completedAt: firstString(source, ["completedAt", "completed_at"]),
      sourcePageUrl: firstString(source, ["sourcePageUrl", "source_page_url", "productUrl", "product_url", "pageUrl", "page_url"]),
      totalScenes,
      completedScenes,
      progress,
      records
    };
  });
}

function normalizeStatsResponse(payload: unknown): EcommerceStatsSummary {
  const root = asRecord(payload);
  const source = asRecord(root.stats ?? root.data ?? payload);
  return {
    totalJobs: firstNumber(source, ["totalJobs", "jobs", "total"]) ?? 0,
    succeededJobs: firstNumber(source, ["succeededJobs", "successJobs", "succeeded", "success"]) ?? 0,
    failedJobs: firstNumber(source, ["failedJobs", "failJobs", "failed", "failures"]) ?? 0,
    runningJobs: firstNumber(source, ["runningJobs", "pendingJobs", "running", "pending"]) ?? 0,
    generatedImages: firstNumber(source, ["generatedImages", "imageCount", "images", "outputs"]) ?? 0
  };
}

function normalizePlan(value: unknown, index = 0): BillingPlan | null {
  const source = asRecord(value);
  const id = firstString(source, ["id", "planId", "code"]);
  const name = firstString(source, ["name", "title", "label"]);
  if (!id || !name) {
    return null;
  }

  return {
    id,
    name,
    description: firstString(source, ["description", "desc", "subtitle"]),
    imageQuota: firstNumber(source, ["imageQuota", "quotaTotal", "quota", "generationQuota"]) ?? 0,
    storageQuotaBytes: firstNumber(source, ["storageQuotaBytes", "storageQuota", "storageBytes"]) ?? 0,
    priceCents: firstNumber(source, ["priceCents", "amountCents", "price"]) ?? 0,
    currency: firstString(source, ["currency"]) ?? "CNY",
    enabled: source.enabled === undefined ? true : Boolean(source.enabled),
    sortOrder: firstNumber(source, ["sortOrder", "sort"]) ?? index,
    benefits: source.benefits ?? source.features,
    createdAt: firstString(source, ["createdAt", "created_at"]) ?? "",
    updatedAt: firstString(source, ["updatedAt", "updated_at"]) ?? "",
    recommended: Boolean(source.recommended || source.isRecommended),
    purchaseUrl: firstString(source, ["purchaseUrl", "checkoutUrl", "paymentUrl"])
  };
}

function normalizeBillingResponse(payload: unknown, user: AuthUser | null): BillingOverview {
  const root = asRecord(payload);
  const data = asRecord(root.data ?? root.billing ?? payload);
  const balance = asRecord(data.balance ?? root.balance);
  const usage = asRecord(data.usage ?? root.usage ?? data.quota ?? root.quota);
  const settings = asRecord(data.settings ?? root.settings);
  const currentPlan = normalizePlan(data.currentPlan ?? data.plan ?? root.currentPlan ?? root.plan);
  const transactions = normalizeBillingTransactions(data.transactions ?? root.transactions);
  const orders = normalizeBillingOrders(data.orders ?? root.orders);
  const latestBalance = transactions.find((transaction) => typeof transaction.balanceAfterCents === "number")?.balanceAfterCents;
  const planItems = Array.isArray(data.plans)
    ? data.plans
    : Array.isArray(root.plans)
      ? root.plans
      : Array.isArray(data.items)
        ? data.items
        : MOCK_BILLING_PLANS;

  return {
    balanceCents:
      firstNumber(balance, ["balanceCents", "amountCents", "availableCents"]) ??
      firstNumber(data, ["balanceCents", "balance", "availableBalance"]) ??
      latestBalance ??
      user?.balanceCents ??
      0,
    currency: firstString(balance, ["currency"]) ?? firstString(data, ["currency"]) ?? user?.currency ?? "CNY",
    currentPlan: currentPlan ?? undefined,
    currentPlanExpiresAt: firstString(data, ["currentPlanExpiresAt", "current_plan_expires_at"]) ?? user?.planExpiresAt,
    plans: planItems.map((item, index) => normalizePlan(item, index)).filter((plan): plan is BillingPlan => Boolean(plan)),
    transactions,
    orders,
    imageUnitPriceCents: firstNumber(settings, ["imageUnitPriceCents", "image_unit_price_cents", "singleImagePriceCents"]) ?? 0,
    quotaTotal: firstNumber(usage, ["quotaTotal", "total", "imageQuota"]) ?? user?.quotaTotal ?? 0,
    quotaUsed: firstNumber(usage, ["quotaUsed", "used", "usedQuota"]) ?? user?.quotaUsed ?? 0,
    packageTotal: firstNumber(usage, ["packageTotal", "planQuota", "packageQuota"]) ?? user?.packageTotal,
    packageUsed: firstNumber(usage, ["packageUsed", "planUsed"]) ?? user?.packageUsed,
    packageRemaining:
      firstNumber(usage, ["packageRemaining", "remaining", "quotaRemaining"]) ??
      user?.packageRemaining ??
      Math.max((user?.quotaTotal ?? 0) - (user?.quotaUsed ?? 0), 0)
  };
}

function mergeBillingOrders(overview: BillingOverview, payload: unknown): BillingOverview {
  const orders = normalizeBillingOrders(payload);
  return orders.length > 0 ? { ...overview, orders } : overview;
}

function normalizeBillingTransactions(value: unknown): BillingTransaction[] {
  const items = Array.isArray(value) ? value : [];
  return items.map((item, index) => {
    const source = asRecord(item);
    return {
      id: firstString(source, ["id"]) ?? `transaction-${index}`,
      userId: firstString(source, ["userId", "user_id"]),
      userEmail: firstString(source, ["userEmail", "user_email"]),
      workspaceId: firstString(source, ["workspaceId", "workspace_id"]),
      generationId: firstString(source, ["generationId", "generation_id"]),
      type: firstString(source, ["type"]) ?? "-",
      title: firstString(source, ["title"]) ?? "-",
      amountCents: firstNumber(source, ["amountCents", "amount_cents"]) ?? 0,
      currency: firstString(source, ["currency"]) ?? "CNY",
      balanceBeforeCents: firstNumber(source, ["balanceBeforeCents", "balance_before_cents"]),
      balanceAfterCents: firstNumber(source, ["balanceAfterCents", "balance_after_cents"]),
      quotaBefore: firstNumber(source, ["quotaBefore", "quota_before"]),
      quotaAfter: firstNumber(source, ["quotaAfter", "quota_after"]),
      quotaConsumed: firstNumber(source, ["quotaConsumed", "quota_consumed"]),
      imageCount: firstNumber(source, ["imageCount", "image_count"]),
      unitPriceCents: firstNumber(source, ["unitPriceCents", "unit_price_cents"]),
      note: firstString(source, ["note"]),
      status: firstString(source, ["status"]) ?? "-",
      createdByUserId: firstString(source, ["createdByUserId", "created_by_user_id"]),
      createdAt: firstString(source, ["createdAt", "created_at"]) ?? ""
    };
  });
}

function normalizeBillingOrders(value: unknown): BillingOrder[] {
  const root = asRecord(value);
  const items = Array.isArray(value)
    ? value
    : Array.isArray(root.orders)
      ? root.orders
      : Array.isArray(root.items)
        ? root.items
        : Array.isArray(root.data)
          ? root.data
          : [];
  return items.map((item, index) => {
    const source = asRecord(item);
    return {
      id: firstString(source, ["id", "orderId"]) ?? `order-${index}`,
      outTradeNo: firstString(source, ["outTradeNo", "out_trade_no"]) ?? "",
      userId: firstString(source, ["userId", "user_id"]),
      userEmail: firstString(source, ["userEmail", "user_email"]),
      workspaceId: firstString(source, ["workspaceId", "workspace_id"]),
      type: firstString(source, ["type"]) ?? "-",
      status: firstString(source, ["status"]) ?? "-",
      title: firstString(source, ["title"]) ?? "-",
      amountCents: firstNumber(source, ["amountCents", "amount_cents", "priceCents"]) ?? 0,
      currency: firstString(source, ["currency"]) ?? "CNY",
      planId: firstString(source, ["planId", "plan_id"]),
      imageQuota: firstNumber(source, ["imageQuota", "image_quota"]),
      storageQuotaBytes: firstNumber(source, ["storageQuotaBytes", "storage_quota_bytes"]),
      paymentProvider: firstString(source, ["paymentProvider", "payment_provider", "provider"]) ?? "-",
      paymentUrl: firstString(source, ["paymentUrl", "payment_url", "checkoutUrl", "checkout_url"]),
      providerTradeNo: firstString(source, ["providerTradeNo", "provider_trade_no"]),
      paidAt: firstString(source, ["paidAt", "paid_at"]),
      closedAt: firstString(source, ["closedAt", "closed_at"]),
      createdAt: firstString(source, ["createdAt", "created_at"]) ?? "",
      updatedAt: firstString(source, ["updatedAt", "updated_at"]) ?? ""
    };
  });
}

function paymentUrlFrom(payload: unknown): string {
  const root = asRecord(payload);
  const data = asRecord(root.data);
  const order = asRecord(root.order ?? data.order);
  const payment = asRecord(root.payment ?? data.payment);
  return (
    firstString(root, ["paymentUrl", "payment_url", "checkoutUrl", "checkout_url", "payUrl", "pay_url"]) ??
    firstString(data, ["paymentUrl", "payment_url", "checkoutUrl", "checkout_url", "payUrl", "pay_url"]) ??
    firstString(order, ["paymentUrl", "payment_url", "checkoutUrl", "checkout_url"]) ??
    firstString(payment, ["paymentUrl", "payment_url", "checkoutUrl", "checkout_url"]) ??
    ""
  );
}

function formatMoney(cents: number, currency = "CNY"): string {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency,
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2
  }).format(cents / 100);
}

function formatCount(value?: number): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString("zh-CN") : "0";
}

function planBenefits(plan: BillingPlan): string[] {
  if (Array.isArray(plan.benefits)) {
    return plan.benefits.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).slice(0, 3);
  }
  const source = asRecord(plan.benefits);
  const features = source.features;
  return Array.isArray(features) ? features.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).slice(0, 3) : [];
}

function billingTransactionLabel(type: string): string {
  if (type === "generation") return "生图扣费";
  if (type === "admin_adjustment") return "后台调整";
  if (type === "recharge") return "充值";
  if (type === "plan_purchase") return "套餐购买";
  return type || "明细";
}

function billingOrderStatusLabel(status: string): string {
  if (status === "pending") return "等待支付";
  if (status === "paid" || status === "succeeded") return "支付成功";
  if (status === "failed") return "支付失败";
  if (status === "cancelled" || status === "canceled") return "已取消";
  return status || "未知";
}

function normalizeUser(value: unknown): AuthUser | null {
  const root = asRecord(value);
  const source = asRecord(root.user ?? root.data ?? root.profile ?? value);
  const email = firstString(source, ["email", "mail", "username"]);
  if (!email) {
    return null;
  }

  return {
    id: firstString(source, ["id", "userId", "sub"]),
    email,
    displayName: firstString(source, ["displayName", "display_name", "name", "nickname"]),
    role: firstString(source, ["role", "plan"]),
    planId: firstString(source, ["planId", "plan_id"]),
    planName: firstString(source, ["planName", "plan_name"]),
    planExpiresAt: firstString(source, ["planExpiresAt", "plan_expires_at"]),
    quotaTotal: firstNumber(source, ["quotaTotal", "quota_total", "totalQuota"]),
    quotaUsed: firstNumber(source, ["quotaUsed", "quota_used", "usedQuota"]),
    balanceCents: firstNumber(source, ["balanceCents", "balance_cents", "balance"]),
    currency: firstString(source, ["currency"]),
    packageTotal: firstNumber(source, ["packageTotal", "package_total", "planQuota"]),
    packageUsed: firstNumber(source, ["packageUsed", "package_used", "planUsed"]),
    packageRemaining: firstNumber(source, ["packageRemaining", "package_remaining", "remainingQuota"])
  };
}

function normalizeAuthResponse(payload: unknown): ExtensionAuthState {
  const root = asRecord(payload);
  const data = asRecord(root.data);
  const token =
    firstString(root, ["token", "accessToken", "access_token", "jwt"]) ??
    firstString(data, ["token", "accessToken", "access_token", "jwt"]) ??
    "";

  return {
    token,
    user: normalizeUser(root) ?? normalizeUser(data)
  };
}

function formatDateTime(value?: string): string {
  if (!value) {
    return "未知时间";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatSourceUrl(url: string): string {
  try {
    const parsedUrl = new URL(url);
    return `${parsedUrl.hostname}${parsedUrl.pathname}`;
  } catch {
    return url;
  }
}

export function SidePanelApp() {
  const [auth, setAuth] = useState<ExtensionAuthState>(defaultAuth);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authForm, setAuthForm] = useState({ email: "", password: "", displayName: "" });
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [pendingAuthAction, setPendingAuthAction] = useState<PendingAuthAction | null>(null);
  const [form, setForm] = useState<BatchFormState>(defaultForm);
  const [pageContext, setPageContext] = useState<PageContext | null>(null);
  const [task, setTask] = useState<BatchTask>({
    id: "idle",
    status: "idle",
    message: "选择场景后即可批量生成。",
    records: []
  });
  const [activeTool, setActiveTool] = useState<ToolTab>("account");
  const [toolPanelOpen, setToolPanelOpen] = useState(false);
  const [historyState, setHistoryState] = useState<RemoteState<EcommerceJobSummary[]>>({
    data: [],
    error: "",
    loading: false
  });
  const [statsState, setStatsState] = useState<RemoteState<EcommerceStatsSummary>>({
    data: {
      totalJobs: 0,
      succeededJobs: 0,
      failedJobs: 0,
      runningJobs: 0,
      generatedImages: 0
    },
    error: "",
    loading: false
  });
  const [billingState, setBillingState] = useState<RemoteState<BillingOverview>>({
    data: {
      balanceCents: 0,
      currency: "CNY",
      plans: MOCK_BILLING_PLANS,
      transactions: [],
      orders: [],
      imageUnitPriceCents: 0,
      quotaTotal: 0,
      quotaUsed: 0
    },
    error: "",
    loading: false
  });
  const [rechargeAmount, setRechargeAmount] = useState("50");
  const [billingAction, setBillingAction] = useState("");
  const [billingActionLoading, setBillingActionLoading] = useState(false);
  const [hiddenResultKeys, setHiddenResultKeys] = useState<Set<string>>(() => new Set());
  const [localResultRecords, setLocalResultRecords] = useState<GenerationRecord[]>([]);
  const [editDialog, setEditDialog] = useState<EditImageDialogState | null>(null);
  const [uploadedReferenceImages, setUploadedReferenceImages] = useState<UploadedReferenceImage[]>([]);
  const [worksViewOpen, setWorksViewOpen] = useState(false);

  const availableScenes = useMemo(
    () => ECOMMERCE_SCENE_TEMPLATES.filter((template) => template.mode === form.generationMode),
    [form.generationMode]
  );

  const selectedScenes = useMemo(
    () => availableScenes.filter((template) => form.sceneTemplateIds.includes(template.id)),
    [availableScenes, form.sceneTemplateIds]
  );

  const pageImageUrls = pageContext?.imageUrls ?? [];
  const selectedReferenceImageUrl = form.referenceImageUrl.trim();
  const selectedReferenceImageUrls = form.referenceImageUrls.length > 0 ? form.referenceImageUrls : selectedReferenceImageUrl ? [selectedReferenceImageUrl] : [];
  const selectedReferenceImageUrlsKey = selectedReferenceImageUrls.join("|");
  const referenceImageOptions = useMemo(
    () => [
      ...uploadedReferenceImages.map((image) => ({ key: image.id, url: image.dataUrl, label: image.fileName, uploaded: true })),
      ...pageImageUrls.map((url, index) => ({ key: url, url, label: `候选商品图 ${index + 1}`, uploaded: false }))
    ],
    [pageImageUrls, uploadedReferenceImages]
  );

  const resultImages = useMemo(() => {
    const records = [...task.records, ...localResultRecords];
    return records.flatMap((record) =>
      record.outputs.flatMap((output) => {
        if (!output.asset) {
          return [];
        }
        const key = `${record.id}:${output.id}:${output.asset.id}`;
        return hiddenResultKeys.has(key) ? [] : [{ key, record, asset: output.asset }];
      })
    );
  }, [hiddenResultKeys, localResultRecords, task.records]);

  const brandOverlayReady = form.brandOverlay.enabled && Boolean(form.brandOverlay.logoDataUrl || form.brandOverlay.text.trim());

  useEffect(() => {
    if (form.sizeMode !== "source") {
      return;
    }
    void applySourceAspectSize(selectedReferenceImageUrls);
  }, [form.sizeMode, selectedReferenceImageUrlsKey]);

  const accountQuota = useMemo(() => {
    const quotaTotal = billingState.data.quotaTotal ?? auth.user?.quotaTotal ?? 0;
    const quotaUsed = billingState.data.quotaUsed ?? auth.user?.quotaUsed ?? 0;
    const remaining = Math.max(quotaTotal - quotaUsed, 0);
    const percent = quotaTotal > 0 ? Math.min(100, Math.round((quotaUsed / quotaTotal) * 100)) : 0;
    return { quotaTotal, quotaUsed, remaining, percent };
  }, [auth.user, billingState.data.quotaTotal, billingState.data.quotaUsed]);
  const activePlanBlocksPurchase = useMemo(() => {
    const expiresAt = billingState.data.currentPlanExpiresAt || auth.user?.planExpiresAt;
    const currentPlanId = billingState.data.currentPlan?.id || auth.user?.planId;
    return Boolean(
      currentPlanId &&
        currentPlanId !== "free" &&
        expiresAt &&
        new Date(expiresAt).getTime() > Date.now() &&
        accountQuota.remaining > 0
    );
  }, [accountQuota.remaining, auth.user, billingState.data.currentPlan, billingState.data.currentPlanExpiresAt]);
  const currentPlanLabel = auth.token ? billingState.data.currentPlan?.name || auth.user?.planName || auth.user?.planId || "套餐" : "套餐";

  useEffect(() => {
    void chrome.storage.local.get([AUTH_STORAGE_KEY, ACTIVE_BATCH_JOB_STORAGE_KEY]).then((result) => {
      const storedAuth = result[AUTH_STORAGE_KEY] as Partial<ExtensionAuthState> | undefined;
      const activeJob = result[ACTIVE_BATCH_JOB_STORAGE_KEY] as StoredBatchJob | undefined;
      const nextAuth = {
        token: storedAuth?.token || activeJob?.token || "",
        user: storedAuth?.user ?? null
      };
      setAuth(nextAuth);
      if (nextAuth.token && !nextAuth.user) {
        void refreshMe(nextAuth.token, DEFAULT_API_BASE_URL);
      }
      if (nextAuth.token) {
        void syncWebAuth(nextAuth.token, DEFAULT_API_BASE_URL);
      }
      if (activeJob?.jobId) {
        setTask({
          id: activeJob.jobId,
          status: "running",
          message: "正在恢复服务端批量任务，稍后会自动刷新进度。",
          records: []
        });
      }
    });
    void refreshPageContext();
  }, []);

  useEffect(() => {
    if (task.status !== "pending" && task.status !== "running") {
      return;
    }
    if (!auth.token) {
      setPendingAuthAction("job");
      setActiveTool("account");
      setToolPanelOpen(true);
      setAuthError("请登录后继续查看服务端任务进度。");
      return;
    }

    let cancelled = false;
    const timer = window.setInterval(() => {
      void pollBatchJob(task.id).catch((error) => {
        if (!cancelled) {
          setTask((current) => ({
            ...current,
            message: error instanceof Error ? `任务仍在服务端执行，轮询失败：${error.message}` : "任务仍在服务端执行，轮询暂时失败。"
          }));
        }
      });
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [auth.token, task.id, task.status]);

  useEffect(() => {
    if (!toolPanelOpen) {
      return;
    }
    if (activeTool === "history") {
      void refreshHistory();
    }
    if (activeTool === "stats") {
      void refreshStats();
    }
    if (activeTool === "billing") {
      void refreshBilling();
    }
  }, [activeTool, auth.token, toolPanelOpen]);

  function apiBaseUrl(): string {
    return DEFAULT_API_BASE_URL;
  }

  function apiHeaders(json = false, token = auth.token): HeadersInit {
    const headers: Record<string, string> = {};
    if (json) {
      headers["Content-Type"] = "application/json";
    }
    if (token.trim()) {
      headers.Authorization = `Bearer ${token.trim()}`;
    }
    return headers;
  }

  function authenticatedApiUrl(path: string, token = auth.token): string {
    const url = `${apiBaseUrl()}${path}`;
    const trimmedToken = token.trim();
    if (!trimmedToken || !isApiAssetUrl(path)) {
      return url;
    }

    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}token=${encodeURIComponent(trimmedToken)}`;
  }

  function assetPreviewUrl(asset: GeneratedAsset, width = 512): string {
    if (!isApiAssetUrl(asset.url)) {
      return asset.url;
    }

    return authenticatedApiUrl(`/api/assets/${encodeURIComponent(asset.id)}/preview?width=${width}`);
  }

  function assetDownloadUrl(asset: GeneratedAsset): string {
    if (!isApiAssetUrl(asset.url)) {
      return asset.url;
    }

    return authenticatedApiUrl(`/api/assets/${encodeURIComponent(asset.id)}/download`);
  }

  function galleryDetailUrl(asset: GeneratedAsset): string {
    const url = new URL("/gallery", `${apiBaseUrl()}/`);
    url.searchParams.set("assetId", asset.id);
    if (auth.token.trim()) {
      url.searchParams.set("authToken", auth.token.trim());
    }
    return url.toString();
  }

  function webAuthUrl(token: string, baseUrl = apiBaseUrl()): string {
    const url = new URL("/", `${baseUrl.replace(/\/$/u, "")}/`);
    url.searchParams.set("authToken", token.trim());
    return url.toString();
  }

  async function syncWebAuth(token: string, baseUrl = apiBaseUrl()): Promise<void> {
    const trimmedToken = token.trim();
    if (!trimmedToken) {
      return;
    }

    const normalizedBaseUrl = baseUrl.replace(/\/$/u, "");
    const appOrigin = new URL(normalizedBaseUrl).origin;
    const tabs = await chrome.tabs.query({});
    const appTabs = tabs.filter((tab) => {
      if (!tab.url) {
        return false;
      }
      try {
        return new URL(tab.url).origin === appOrigin;
      } catch {
        return false;
      }
    });

    if (appTabs.length === 0) {
      await chrome.tabs.create({ url: webAuthUrl(trimmedToken, normalizedBaseUrl), active: false });
      return;
    }

    await Promise.all(
      appTabs.map(async (tab) => {
        if (!tab.id) {
          return;
        }
        try {
          await chrome.tabs.sendMessage(tab.id, {
            type: "kuajing-image:sync-auth",
            token: trimmedToken
          });
        } catch {
          await chrome.tabs.update(tab.id, { url: webAuthUrl(trimmedToken, normalizedBaseUrl) });
        }
      })
    );
  }

  async function openGalleryPreview(asset: GeneratedAsset): Promise<void> {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab.id) {
      await chrome.tabs.update(tab.id, { url: galleryDetailUrl(asset) });
      return;
    }

    await chrome.tabs.create({ url: galleryDetailUrl(asset) });
  }

  async function saveAuth(nextAuth: ExtensionAuthState): Promise<void> {
    setAuth(nextAuth);
    await chrome.storage.local.set({ [AUTH_STORAGE_KEY]: nextAuth });
  }

  async function clearAuth(message = "登录状态已失效，请重新登录。"): Promise<void> {
    await chrome.storage.local.remove([AUTH_STORAGE_KEY, ACTIVE_BATCH_JOB_STORAGE_KEY]);
    setAuth(defaultAuth);
    setActiveTool("account");
    setToolPanelOpen(true);
    setAuthError(message);
  }

  function requireAuth(action: PendingAuthAction): boolean {
    if (auth.token.trim()) {
      return true;
    }
    setPendingAuthAction(action);
    setActiveTool("account");
    setToolPanelOpen(true);
    setAuthMode("login");
    setAuthError("请先登录账号，插件会使用你的个人 JWT 访问后端。");
    return false;
  }

  async function parseResponseOrThrow(response: Response): Promise<unknown> {
    if (response.status === 401) {
      await clearAuth("登录已过期，请重新登录。");
      throw new Error("登录已过期，请重新登录。");
    }
    if (!response.ok) {
      throw new Error(await response.text());
    }
    return response.json();
  }

  async function fetchAssetAsReferenceImage(asset: GeneratedAsset): Promise<ReferenceImageInput> {
    const response = await fetch(assetDownloadUrl(asset));
    if (!response.ok) {
      throw new Error("原图读取失败，请稍后重试。");
    }

    const blob = await response.blob();
    if (!blob.type.startsWith("image/")) {
      throw new Error("原图资源不是可用图片。");
    }
    if (blob.size > 50 * 1024 * 1024) {
      throw new Error("原图超过 50MB，无法作为参考图重新生成。");
    }

    return {
      dataUrl: await blobToDataUrl(blob),
      fileName: asset.fileName
    };
  }

  async function refreshMe(token = auth.token, baseUrl = apiBaseUrl()): Promise<AuthUser | null> {
    if (!token.trim()) {
      return null;
    }
    const response = await fetch(`${baseUrl.replace(/\/$/u, "")}/api/auth/me`, {
      headers: {
        Authorization: `Bearer ${token.trim()}`
      }
    });
    const body = await parseResponseOrThrow(response);
    const user = normalizeUser(body);
    if (user) {
      const nextAuth = { token, user };
      setAuth(nextAuth);
      await chrome.storage.local.set({ [AUTH_STORAGE_KEY]: nextAuth });
    }
    return user;
  }

  async function submitAuth(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setAuthError("");
    setAuthLoading(true);
    try {
      const response = await fetch(`${apiBaseUrl()}/api/auth/${authMode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: authForm.email.trim(),
          password: authForm.password,
          displayName: authMode === "register" ? authForm.displayName.trim() || undefined : undefined
        })
      });
      const body = await parseResponseOrThrow(response);
      const nextAuth = normalizeAuthResponse(body);
      if (!nextAuth.token) {
        throw new Error("登录响应缺少 token。");
      }
      const user = nextAuth.user ?? (await refreshMe(nextAuth.token));
      await saveAuth({ token: nextAuth.token, user });
      void syncWebAuth(nextAuth.token);
      setAuthForm((current) => ({ ...current, password: "" }));
      setAuthError("");
      const action = pendingAuthAction;
      setPendingAuthAction(null);
      if (action === "generate") {
        void submitBatch(true, nextAuth.token);
      } else if (action === "history") {
        setActiveTool("history");
        void refreshHistory(true, nextAuth.token);
      } else if (action === "stats") {
        setActiveTool("stats");
        void refreshStats(true, nextAuth.token);
      } else if (action === "billing") {
        setActiveTool("billing");
        void refreshBilling(true, nextAuth.token);
      } else if (action === "job" && task.id !== "idle") {
        void pollBatchJob(task.id, nextAuth.token);
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "登录失败，请稍后重试。");
    } finally {
      setAuthLoading(false);
    }
  }

  async function pollBatchJob(jobId: string, token = auth.token): Promise<void> {
    if (!token.trim() && !requireAuth("job")) {
      return;
    }
    const response = await fetch(`${apiBaseUrl()}/api/ecommerce/images/batch-generate/${jobId}`, {
      headers: apiHeaders(false, token)
    });

    const body = (await parseResponseOrThrow(response)) as EcommerceBatchGenerateResponse;
    applyBatchJob(body, token);
  }

  async function refreshHistory(authAlreadyChecked = false, token = auth.token): Promise<void> {
    if (!token.trim() && !authAlreadyChecked && !requireAuth("history")) {
      return;
    }
    setHistoryState((current) => ({ ...current, error: "", loading: true }));
    try {
      const response = await fetch(`${apiBaseUrl()}/api/ecommerce/jobs`, {
        headers: apiHeaders(false, token)
      });
      const body = await parseResponseOrThrow(response);
      setHistoryState({ data: normalizeJobsResponse(body), error: "", loading: false });
    } catch (error) {
      setHistoryState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : "历史任务读取失败。",
        loading: false
      }));
    }
  }

  async function refreshStats(authAlreadyChecked = false, token = auth.token): Promise<void> {
    if (!token.trim() && !authAlreadyChecked && !requireAuth("stats")) {
      return;
    }
    setStatsState((current) => ({ ...current, error: "", loading: true }));
    try {
      const response = await fetch(`${apiBaseUrl()}/api/ecommerce/stats`, {
        headers: apiHeaders(false, token)
      });
      const body = await parseResponseOrThrow(response);
      setStatsState({ data: normalizeStatsResponse(body), error: "", loading: false });
    } catch (error) {
      setStatsState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : "统计数据读取失败。",
        loading: false
      }));
    }
  }

  async function refreshBilling(authAlreadyChecked = false, token = auth.token): Promise<void> {
    if (!token.trim() && !authAlreadyChecked && !requireAuth("billing")) {
      return;
    }
    setBillingState((current) => ({ ...current, error: "", loading: true }));
    try {
      const [summaryResult, ordersResult] = await Promise.allSettled([
        fetch(`${apiBaseUrl()}/api/billing/summary`, {
          headers: apiHeaders(false, token)
        }),
        fetch(`${apiBaseUrl()}/api/billing/orders`, {
          headers: apiHeaders(false, token)
        })
      ]);
      if (summaryResult.status !== "fulfilled") {
        throw summaryResult.reason instanceof Error ? summaryResult.reason : new Error("计费数据读取失败。");
      }
      const summaryResponse = summaryResult.value;
      const body = await parseResponseOrThrow(summaryResponse);
      let ordersBody: unknown = {};
      if (ordersResult.status === "fulfilled" && ordersResult.value.ok) {
        ordersBody = await ordersResult.value.json();
      }
      const overview = mergeBillingOrders(normalizeBillingResponse(body, auth.user), ordersBody);
      setBillingState({
        data: overview,
        error: "",
        loading: false
      });
      void refreshMe(token);
      setBillingAction("");
    } catch (error) {
      setBillingState({
        data: normalizeBillingResponse({}, auth.user),
        error: error instanceof Error ? error.message : "计费数据读取失败。",
        loading: false
      });
    }
  }

  async function openPaymentUrl(url: string): Promise<void> {
    await chrome.tabs.create({ url });
  }

  function billingReturnUrl(): string {
    const url = new URL("/account", `${apiBaseUrl()}/`);
    url.searchParams.set("billingReturn", "1");
    url.searchParams.set("source", "extension");
    return url.toString();
  }

  async function submitRecharge(): Promise<void> {
    if (!auth.token.trim() && !requireAuth("billing")) {
      return;
    }
    const amountCents = Math.round(Number(rechargeAmount) * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      setBillingAction("请输入有效充值金额。");
      return;
    }

    setBillingActionLoading(true);
    setBillingAction("");
    try {
      const response = await fetch(`${apiBaseUrl()}/api/billing/recharge`, {
        method: "POST",
        headers: apiHeaders(true),
        body: JSON.stringify({ amountCents, returnUrl: billingReturnUrl() })
      });
      const body = await parseResponseOrThrow(response);
      const paymentUrl = paymentUrlFrom(body);
      if (paymentUrl) {
        setBillingAction("充值订单已创建，正在打开支付页面。支付完成回到个人中心后会刷新，也可点这里刷新。");
        await openPaymentUrl(paymentUrl);
        return;
      }
      setBillingAction("充值订单已创建，请在订单列表查看支付状态。");
      await refreshBilling(true);
    } catch (error) {
      setBillingAction(error instanceof Error ? error.message : "充值下单失败。");
    } finally {
      setBillingActionLoading(false);
    }
  }

  async function purchasePlan(plan: BillingPlan, paymentMethod: "balance" | "alipay"): Promise<void> {
    if (!auth.token.trim() && !requireAuth("billing")) {
      return;
    }
    if (activePlanBlocksPurchase) {
      setBillingAction("当前套餐未到期且仍有余量，新购无法叠加，只能取高。建议等套餐到期或额度用完后再购买。");
      return;
    }
    if (paymentMethod === "balance" && billingState.data.balanceCents < plan.priceCents) {
      setBillingAction(`余额不足，还差 ${formatMoney(plan.priceCents - billingState.data.balanceCents, plan.currency)}。可先充值或用支付宝购买。`);
      return;
    }
    setBillingActionLoading(true);
    setBillingAction("");
    try {
      const response = await fetch(`${apiBaseUrl()}/api/billing/plans/${encodeURIComponent(plan.id)}/purchase`, {
        method: "POST",
        headers: apiHeaders(true),
        body: JSON.stringify({ paymentMethod, returnUrl: billingReturnUrl() })
      });
      const body = await parseResponseOrThrow(response);
      const paymentUrl = paymentUrlFrom(body);
      if (paymentMethod === "alipay" && paymentUrl) {
        setBillingAction("套餐订单已创建，正在打开支付页面。支付完成后会刷新个人中心权益。");
        await openPaymentUrl(paymentUrl);
        return;
      }
      setBillingAction(paymentMethod === "balance" ? "套餐已使用余额购买成功，正在刷新权益。" : "套餐订单已创建，请完成支付后刷新。");
      await refreshBilling(true);
    } catch (error) {
      setBillingAction(error instanceof Error ? error.message : "套餐购买失败。");
    } finally {
      setBillingActionLoading(false);
    }
  }

  function openTool(tab: ToolTab): void {
    if ((tab === "billing" || tab === "history" || tab === "stats") && !auth.token.trim()) {
      setPendingAuthAction(tab);
      setAuthMode("login");
      setAuthError("请先登录账号，再查看个人数据。");
      setActiveTool("account");
      setToolPanelOpen(true);
      return;
    }
    setActiveTool(tab);
    setToolPanelOpen(true);
  }

  function openHistoryJob(job: EcommerceJobSummary): void {
    if (!requireAuth("job")) {
      return;
    }
    setTask({
      id: job.id,
      status: job.status as BatchTask["status"],
      message: job.status === "pending" || job.status === "running" ? "已切换到历史任务，正在继续轮询服务端状态。" : "已打开历史任务。",
      records: job.records ?? [],
      totalScenes: job.totalScenes,
      completedScenes: job.completedScenes
    });
    void chrome.storage.local.set({
      [ACTIVE_BATCH_JOB_STORAGE_KEY]: {
        jobId: job.id,
        apiBaseUrl: DEFAULT_API_BASE_URL,
        token: auth.token
      } satisfies StoredBatchJob
    });
    setToolPanelOpen(false);
    setWorksViewOpen(true);
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" }));
    void pollBatchJob(job.id);
  }

  function hideResultImage(key: string): void {
    setHiddenResultKeys((current) => {
      const next = new Set(current);
      next.add(key);
      return next;
    });
  }

  function renderResultImages(emptyText: string): JSX.Element {
    if (resultImages.length === 0) {
      return <p className="result-empty">{emptyText}</p>;
    }

    return (
      <div className="result-grid">
        {resultImages.map((item) => (
          <article className="result-image-card" key={item.key}>
            <button className="result-image-preview" type="button" onClick={() => void openGalleryPreview(item.asset)}>
              <img alt={item.record.prompt} height={item.asset.height} src={assetPreviewUrl(item.asset)} width={item.asset.width} />
              {brandOverlayReady ? (
                <span className={`brand-result-overlay brand-result-overlay-${form.brandOverlay.placement}`}>
                  {form.brandOverlay.logoDataUrl ? <img alt="" src={form.brandOverlay.logoDataUrl} /> : <strong>{form.brandOverlay.text.trim()}</strong>}
                </span>
              ) : null}
            </button>
            <div className="result-image-meta">
              <span>{item.asset.width} x {item.asset.height} · {item.record.outputFormat}</span>
              <div className="result-actions">
                <button className="mini-button icon-mini" type="button" title="预览" onClick={() => void openGalleryPreview(item.asset)}>
                  <ImageIcon size={13} />
                </button>
                <button
                  className="mini-button icon-mini"
                  type="button"
                  title={brandOverlayReady ? "下载带品牌图" : "下载"}
                  onClick={() => void downloadResultImage(item)}
                >
                  <Download size={13} />
                </button>
                <button className="mini-button icon-mini" type="button" title="修改重新生成" onClick={() => openEditImageDialog(item)}>
                  <Edit3 size={13} />
                </button>
                <button className="mini-button icon-mini danger-mini" type="button" title="从当前列表移除" onClick={() => hideResultImage(item.key)}>
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    );
  }

  function renderEditDialog(): JSX.Element | null {
    if (!editDialog) {
      return null;
    }

    return (
      <div className="edit-modal" role="dialog" aria-modal="true" aria-labelledby="edit-image-title">
        <div className="edit-modal-card">
          <div className="edit-modal-header">
            <div>
              <strong id="edit-image-title">修改提示词重新生成</strong>
              <span>会以当前图片为参考生成一张新图，并追加到列表。</span>
            </div>
            <button className="mini-button icon-mini" disabled={editDialog.loading} type="button" onClick={() => setEditDialog(null)}>
              <X size={14} />
            </button>
          </div>
          <img
            alt="当前参考图"
            className="edit-modal-preview"
            height={editDialog.item.asset.height}
            src={assetPreviewUrl(editDialog.item.asset)}
            width={editDialog.item.asset.width}
          />
          <label>
            <span>提示词</span>
            <textarea
              rows={7}
              value={editDialog.prompt}
              onChange={(event) => setEditDialog({ ...editDialog, prompt: event.target.value, error: "" })}
            />
          </label>
          {editDialog.error ? <p className="tool-error">{editDialog.error}</p> : null}
          <div className="edit-modal-actions">
            <button className="mini-button" disabled={editDialog.loading} type="button" onClick={() => setEditDialog(null)}>
              取消
            </button>
            <button className="primary-button" disabled={editDialog.loading} type="button" onClick={() => void submitEditImage()}>
              {editDialog.loading ? <Loader2 className="spin" size={15} /> : <Wand2 size={15} />}
              重新生成
            </button>
          </div>
        </div>
      </div>
    );
  }

  function openEditImageDialog(item: ResultImageItem): void {
    setEditDialog({
      item,
      prompt: item.record.prompt,
      error: "",
      loading: false
    });
  }

  async function submitEditImage(): Promise<void> {
    if (!editDialog) {
      return;
    }
    if (!auth.token.trim() && !requireAuth("generate")) {
      return;
    }

    const prompt = editDialog.prompt.trim();
    if (!prompt) {
      setEditDialog({ ...editDialog, error: "请输入提示词。", loading: false });
      return;
    }

    setEditDialog({ ...editDialog, error: "", loading: true });
    try {
      const referenceImage = await fetchAssetAsReferenceImage(editDialog.item.asset);
      const response = await fetch(`${apiBaseUrl()}/api/images/edit`, {
        method: "POST",
        headers: apiHeaders(true),
        body: JSON.stringify({
          prompt,
          presetId: editDialog.item.record.presetId || form.stylePresetId,
          size: editDialog.item.record.size,
          quality: editDialog.item.record.quality,
          outputFormat: editDialog.item.record.outputFormat,
          count: 1,
          referenceImage
        })
      });
      const body = (await parseResponseOrThrow(response)) as GenerationResponse;
      setLocalResultRecords((current) => [...current, body.record]);
      setTask((current) => ({
        ...current,
        message: "已根据修改后的提示词重新生成，并追加到当前结果列表。"
      }));
      setEditDialog(null);
    } catch (error) {
      setEditDialog((current) =>
        current
          ? {
              ...current,
              error: error instanceof Error ? error.message : "重新生成失败，请稍后重试。",
              loading: false
            }
          : current
      );
    }
  }

  function applyBatchJob(body: EcommerceBatchGenerateResponse, token = auth.token): void {
    setHiddenResultKeys(new Set());
    setLocalResultRecords([]);
    setTask({
      id: body.jobId,
      status: body.status,
      message:
        body.status === "pending" || body.status === "running"
          ? `${body.message} 可以放心离开，稍后回来会继续查看任务状态。`
          : body.message,
      records: body.records,
      totalScenes: body.totalScenes,
      completedScenes: body.completedScenes
    });

    if (body.status === "pending" || body.status === "running") {
      void chrome.storage.local.set({
        [ACTIVE_BATCH_JOB_STORAGE_KEY]: {
          jobId: body.jobId,
          apiBaseUrl: DEFAULT_API_BASE_URL,
          token
        } satisfies StoredBatchJob
      });
    } else {
      void chrome.storage.local.remove(ACTIVE_BATCH_JOB_STORAGE_KEY);
      if (toolPanelOpen) {
        void refreshHistory();
        void refreshStats();
      }
    }
  }

  async function refreshPageContext(): Promise<void> {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.id) {
      return;
    }

    try {
      const context = (await chrome.tabs.sendMessage(tab.id, { type: "kuajing-image:get-page-context" })) as PageContext;
      setPageContext(context);
      setForm((current) => ({
        ...current,
        product: {
          ...current.product,
          title: context.title || current.product.title,
          description: context.description || current.product.description
        },
        referenceImageUrl: context.imageUrls[0] || current.referenceImageUrl,
        referenceImageUrls: context.imageUrls[0] ? [context.imageUrls[0]] : current.referenceImageUrls
      }));
      setTask((current) => ({
        ...current,
        message: context.imageUrls.length > 0 ? `已读取当前页信息，并找到 ${context.imageUrls.length} 张候选商品图。` : "已读取当前页信息，未发现可用商品图。"
      }));
    } catch {
      setTask((current) => ({
        ...current,
        message: "当前页面暂时无法读取商品信息，可手动填写。"
      }));
    }
  }

  function updateProduct(patch: Partial<BatchFormState["product"]>): void {
    setForm((current) => ({
      ...current,
      product: {
        ...current.product,
        ...patch
      }
    }));
  }

  function updateReferenceImageUrl(url: string): void {
    const trimmedUrl = url.trim();
    setForm((current) => ({
      ...current,
      referenceImageUrl: url,
      referenceImageUrls: trimmedUrl ? [trimmedUrl] : []
    }));
  }

  async function applySourceAspectSize(urls = selectedReferenceImageUrls): Promise<void> {
    const sourceUrl = urls[0]?.trim();
    if (!sourceUrl) {
      setTask((current) => ({
        ...current,
        message: "原图比例需要先选择一张参考图。"
      }));
      return;
    }

    try {
      const image = await imageFromUrl(sourceUrl);
      const nextSize = sizeFromImageAspect(image.naturalWidth, image.naturalHeight);
      setForm((current) => (current.sizeMode === "source" ? { ...current, size: nextSize } : current));
      setTask((current) => ({
        ...current,
        message: `已按原图比例设置尺寸：${nextSize.width} x ${nextSize.height}。`
      }));
    } catch {
      setTask((current) => ({
        ...current,
        message: "原图比例读取失败，请换一张参考图或手动选择固定尺寸。"
      }));
    }
  }

  function toggleReferenceImage(url: string): void {
    setForm((current) => {
      const exists = current.referenceImageUrls.includes(url);
      const nextUrls = exists
        ? current.referenceImageUrls.filter((item) => item !== url)
        : [...current.referenceImageUrls, url].slice(-2);
      return {
        ...current,
        referenceImageUrl: nextUrls[0] ?? "",
        referenceImageUrls: nextUrls
      };
    });
  }

  async function uploadReferenceImages(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    try {
      const files = Array.from(event.target.files ?? []).filter((file) => file.type.startsWith("image/")).slice(0, 2);
      event.target.value = "";
      if (files.length === 0) {
        return;
      }

      const uploadedImages = await Promise.all(
        files.map(async (file) => {
          if (file.size > 50 * 1024 * 1024) {
            throw new Error("上传参考图超过 50MB，请换一张较小的图片。");
          }
          return {
            id: createClientId(),
            dataUrl: await blobToDataUrl(file, "上传参考图转换失败。"),
            fileName: file.name || "uploaded-reference.png"
          } satisfies UploadedReferenceImage;
        })
      );
      setUploadedReferenceImages((current) => [...uploadedImages, ...current].slice(0, 8));
      setForm((current) => {
        const nextUrls = [...uploadedImages.map((image) => image.dataUrl), ...current.referenceImageUrls].slice(0, 2);
        return {
          ...current,
          referenceImageUrl: nextUrls[0] ?? "",
          referenceImageUrls: nextUrls
        };
      });
    } catch (error) {
      setTask((current) => ({
        ...current,
        message: error instanceof Error ? error.message : "上传参考图失败。"
      }));
    }
  }

  function updateBrandOverlay(patch: Partial<BatchFormState["brandOverlay"]>): void {
    setForm((current) => ({
      ...current,
      brandOverlay: {
        ...current.brandOverlay,
        ...patch
      }
    }));
  }

  async function handleLogoUpload(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.currentTarget.files?.[0];
    if (!file) {
      return;
    }
    if (!file.type.startsWith("image/")) {
      setTask((current) => ({ ...current, message: "Logo 文件需要是图片格式。" }));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setTask((current) => ({ ...current, message: "Logo 图片超过 5MB，请换一张更小的图片。" }));
      return;
    }

    try {
      updateBrandOverlay({
        enabled: true,
        logoDataUrl: await blobToDataUrl(file, "Logo 转换失败。"),
        logoFileName: file.name
      });
    } catch (error) {
      setTask((current) => ({
        ...current,
        message: error instanceof Error ? error.message : "Logo 转换失败。"
      }));
    }
  }

  async function downloadResultImage(item: ResultImageItem): Promise<void> {
    if (!brandOverlayReady) {
      downloadUrl(assetDownloadUrl(item.asset), item.asset.fileName);
      return;
    }

    try {
      const sourceResponse = await fetch(assetDownloadUrl(item.asset));
      if (!sourceResponse.ok) {
        throw new Error("原图下载失败。");
      }
      const sourceBlob = await sourceResponse.blob();
      const sourceUrl = URL.createObjectURL(sourceBlob);
      try {
        const sourceImage = await imageFromUrl(sourceUrl);
        const canvas = document.createElement("canvas");
        const width = sourceImage.naturalWidth || item.asset.width;
        const height = sourceImage.naturalHeight || item.asset.height;
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          throw new Error("无法创建图片画布。");
        }
        if (item.asset.mimeType === "image/jpeg") {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, width, height);
        }
        ctx.drawImage(sourceImage, 0, 0, width, height);
        await drawBrandOverlay(ctx, width, height);
        const mimeType = item.asset.mimeType === "image/jpeg" || item.asset.mimeType === "image/webp" ? item.asset.mimeType : "image/png";
        canvas.toBlob((blob) => {
          if (!blob) {
            setTask((current) => ({ ...current, message: "品牌叠加图导出失败。" }));
            return;
          }
          downloadBlob(blob, brandedFileName(item.asset.fileName));
        }, mimeType, 0.94);
      } finally {
        URL.revokeObjectURL(sourceUrl);
      }
    } catch (error) {
      setTask((current) => ({
        ...current,
        message: error instanceof Error ? error.message : "品牌叠加图导出失败。"
      }));
    }
  }

  async function drawBrandOverlay(ctx: CanvasRenderingContext2D, width: number, height: number): Promise<void> {
    const margin = Math.round(Math.min(width, height) * 0.045);
    const paddingX = Math.round(Math.min(width, height) * 0.026);
    const paddingY = Math.round(Math.min(width, height) * 0.018);
    let overlayWidth = 0;
    let overlayHeight = 0;
    const logoUrl = form.brandOverlay.logoDataUrl;
    const brandText = form.brandOverlay.text.trim();
    let logoImage: HTMLImageElement | undefined;

    if (logoUrl) {
      logoImage = await imageFromUrl(logoUrl);
      const maxLogoWidth = Math.round(width * 0.2);
      const maxLogoHeight = Math.round(height * 0.1);
      const scale = Math.min(maxLogoWidth / logoImage.naturalWidth, maxLogoHeight / logoImage.naturalHeight, 1);
      overlayWidth = Math.round(logoImage.naturalWidth * scale);
      overlayHeight = Math.round(logoImage.naturalHeight * scale);
    } else {
      const fontSize = Math.round(Math.max(24, Math.min(width, height) * 0.045));
      ctx.font = `800 ${fontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      overlayWidth = Math.ceil(ctx.measureText(brandText).width);
      overlayHeight = Math.ceil(fontSize * 1.2);
    }

    const chipWidth = overlayWidth + paddingX * 2;
    const chipHeight = overlayHeight + paddingY * 2;
    const left = form.brandOverlay.placement.endsWith("right") ? width - margin - chipWidth : margin;
    const top = form.brandOverlay.placement.startsWith("bottom") ? height - margin - chipHeight : margin;
    ctx.save();
    ctx.fillStyle = "rgba(255, 255, 255, 0.88)";
    ctx.shadowColor = "rgba(0, 0, 0, 0.16)";
    ctx.shadowBlur = Math.round(Math.min(width, height) * 0.014);
    ctx.shadowOffsetY = Math.round(Math.min(width, height) * 0.004);
    roundedRect(ctx, left, top, chipWidth, chipHeight, Math.round(Math.min(width, height) * 0.018));
    ctx.fill();
    ctx.shadowColor = "transparent";
    if (logoImage) {
      ctx.drawImage(logoImage, left + paddingX, top + paddingY, overlayWidth, overlayHeight);
    } else {
      ctx.fillStyle = "#10251d";
      ctx.textBaseline = "middle";
      ctx.fillText(brandText, left + paddingX, top + chipHeight / 2);
    }
    ctx.restore();
  }

  function toggleScene(sceneId: EcommerceSceneTemplateId): void {
    setForm((current) => {
      const exists = current.sceneTemplateIds.includes(sceneId);
      const next = exists
        ? current.sceneTemplateIds.filter((id) => id !== sceneId)
        : [...current.sceneTemplateIds, sceneId];
      return {
        ...current,
        sceneTemplateIds: next.length > 0 ? next : current.sceneTemplateIds
      };
    });
  }

  function updateGenerationMode(generationMode: EcommerceGenerationMode): void {
    setForm((current) => ({
      ...current,
      generationMode,
      sceneTemplateIds: defaultSceneIdsByMode[generationMode],
      stylePresetId: generationMode === "enhance" ? "product" : "photoreal",
      textLanguage: generationMode === "enhance" ? current.textLanguage : "none",
      allowTextRecreation: generationMode === "enhance" ? current.allowTextRecreation : true,
      removeWatermarkAndLogo: generationMode === "enhance" ? current.removeWatermarkAndLogo : true
    }));
    setTask((current) => ({
      ...current,
      message: generationMode === "enhance" ? "原图增强会优先保留商品原貌。" : "场景创作会依据主图重建营销场景。"
    }));
  }

  async function submitBatch(authAlreadyChecked = false, token = auth.token): Promise<void> {
    if (!token.trim() && !authAlreadyChecked && !requireAuth("generate")) {
      return;
    }
    const title = form.product.title.trim();
    if (!title) {
      setTask({ id: "validation", status: "failed", message: "请先填写商品标题。", records: [] });
      return;
    }
    if (form.generationMode === "enhance" && selectedReferenceImageUrls.length === 0) {
      setTask({ id: "validation", status: "failed", message: "原图增强需要参考图 URL，请先读取商品页或手动填写主图地址。", records: [] });
      return;
    }

    const taskId = createClientId();
    setHiddenResultKeys(new Set());
    setLocalResultRecords([]);
    setTask({
      id: taskId,
      status: "running",
      message: selectedReferenceImageUrls.length > 0 ? "正在读取参考图并提交批量生成任务。" : "正在提交批量生成任务。",
      records: []
    });

    const fallbackRecords = selectedScenes.map((scene): GenerationRecord => ({
      id: `${taskId}-${scene.id}`,
      mode: selectedReferenceImageUrls.length > 0 ? "edit" : "generate",
      prompt: composeEcommercePrompt({
        product: form.product,
        platform: form.platform,
        market: form.market,
        textLanguage: form.textLanguage,
        allowTextRecreation: form.allowTextRecreation,
        removeWatermarkAndLogo: form.removeWatermarkAndLogo,
        sceneTemplateId: scene.id,
        extraDirection: form.extraDirection
      }),
      effectivePrompt: scene.prompt,
      presetId: form.stylePresetId,
      size: form.size,
      quality: form.quality,
      outputFormat: form.outputFormat,
      count: form.countPerScene,
      status: "pending",
      createdAt: new Date().toISOString(),
      outputs: []
    }));

    try {
      const referenceImage = await referenceImageFromSources(selectedReferenceImageUrls);
      const response = await fetch(`${apiBaseUrl()}/api/ecommerce/images/batch-generate`, {
        method: "POST",
        headers: apiHeaders(true, token),
        body: JSON.stringify({
          product: form.product,
          platform: form.platform,
          market: form.market,
          textLanguage: form.textLanguage,
          allowTextRecreation: form.allowTextRecreation,
          removeWatermarkAndLogo: form.removeWatermarkAndLogo,
          sceneTemplateIds: form.sceneTemplateIds,
          sourcePageUrl: pageContext?.url,
          size: form.size,
          stylePresetId: form.stylePresetId,
          quality: form.quality,
          outputFormat: form.outputFormat,
          countPerScene: form.countPerScene,
          referenceImage,
          extraDirection: form.extraDirection
        })
      });

      const body = (await parseResponseOrThrow(response)) as EcommerceBatchGenerateResponse;
      applyBatchJob(body, token);
    } catch (error) {
      setTask({
        id: taskId,
        status: "failed",
        message: error instanceof Error ? `${error.message} 已在本地生成场景 prompt 草稿。` : "后端批量接口暂不可用，已在本地生成场景 prompt 草稿。",
        records: fallbackRecords
      });
    }
  }

  if (worksViewOpen) {
    return (
      <main className="app-shell works-shell">
        <header className="topbar works-topbar">
          <div>
            <p className="eyebrow">Generated works</p>
            <h1>作品结果</h1>
          </div>
          <div className="topbar-actions">
            <button className="secondary-button" type="button" onClick={() => setWorksViewOpen(false)}>
              <X size={15} />
              返回
            </button>
            <button
              className="primary-button works-refresh-button"
              type="button"
              onClick={() => void pollBatchJob(task.id)}
            >
              <RefreshCw size={15} />
              刷新
            </button>
          </div>
        </header>

        <section className="panel works-panel">
          <div className={`status status-${task.status}`}>
            {task.status === "succeeded" ? <CheckCircle2 size={16} /> : task.status === "running" ? <Loader2 className="spin" size={16} /> : <Sparkles size={16} />}
            {task.message}
          </div>
          <div className="works-meta">
            <span>{task.id}</span>
            <strong>
              {task.status === "pending" || task.status === "running"
                ? `${task.completedScenes ?? 0}/${task.totalScenes ?? resultImages.length} 场景`
                : `${resultImages.length} 张作品`}
            </strong>
          </div>
          {renderResultImages(task.status === "running" ? "图片生成中，完成后会显示在这里。" : "这个历史任务暂无可展示图片。")}
        </section>

        {renderEditDialog()}
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Cross-border image studio</p>
          <h1>跨境图片助手</h1>
        </div>
        <div className="topbar-actions">
          <button className="plan-badge" title="查看套餐" type="button" onClick={() => openTool("billing")}>
            <Package size={14} />
            <span>{currentPlanLabel}</span>
          </button>
          <button className="icon-button" title="账户" type="button" onClick={() => openTool("account")}>
            <UserCircle2 size={18} />
          </button>
        </div>
      </header>

      <section className="panel page-panel">
        <div>
          <h2>当前页面</h2>
          <p>{pageContext?.url ?? "可从商品页自动读取标题、描述和图片。"}</p>
          {pageContext ? <span>{pageImageUrls.length > 0 ? `${pageImageUrls.length} 张候选图可选` : "未发现候选图"}</span> : null}
        </div>
        <button className="secondary-button" type="button" onClick={() => void refreshPageContext()}>
          <RefreshCw size={15} />
          读取
        </button>
      </section>

      <section className="panel reference-panel">
        <div className="reference-image-field reference-image-field-standalone">
          <label>
            <span>{form.generationMode === "enhance" ? "商品主图 URL（必填）" : "商品主图 URL"}</span>
            <input value={form.referenceImageUrl} onChange={(event) => updateReferenceImageUrl(event.target.value)} />
          </label>
          <div className="reference-upload-row">
            <label className="mini-button reference-upload-button">
              <Upload size={13} />
              上传图片
              <input accept="image/*" multiple type="file" onChange={(event) => void uploadReferenceImages(event)} />
            </label>
            <span>可选 1-2 张，第二张会作为不同角度参考。</span>
          </div>
          {referenceImageOptions.length > 0 ? (
            <div className="reference-image-picker" aria-label="商品主图候选">
              <div className="reference-image-picker-header">
                <strong>从当前页图片选择参考图</strong>
                <span>已选 {selectedReferenceImageUrls.length}/2 张，第三张会替换最早选择</span>
              </div>
              <div className="reference-image-grid">
                {referenceImageOptions.map((item, index) => (
                  <button
                    className={selectedReferenceImageUrls.includes(item.url) ? "reference-image-option active" : "reference-image-option"}
                    key={item.key}
                    title={item.label}
                    type="button"
                    onClick={() => toggleReferenceImage(item.url)}
                  >
                    <img alt={item.uploaded ? item.label : `候选商品图 ${index + 1}`} loading="lazy" src={item.url} />
                    {selectedReferenceImageUrls.includes(item.url) ? <CheckCircle2 size={16} /> : null}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="reference-image-empty">
              <ImageIcon size={15} />
              <span>读取当前页后，这里会显示可选商品图。</span>
            </div>
          )}
        </div>
      </section>

      <section className="panel">
        <h2>商品信息</h2>
        <label>
          <span>商品标题</span>
          <input value={form.product.title} onChange={(event) => updateProduct({ title: event.target.value })} />
        </label>
        <label>
          <span>商品描述</span>
          <textarea rows={4} value={form.product.description ?? ""} onChange={(event) => updateProduct({ description: event.target.value })} />
        </label>
        <div className="two-col">
          <label>
            <span>目标人群</span>
            <input value={form.product.targetCustomer ?? ""} onChange={(event) => updateProduct({ targetCustomer: event.target.value })} />
          </label>
          <label>
            <span>使用场景</span>
            <input value={form.product.usageScene ?? ""} onChange={(event) => updateProduct({ usageScene: event.target.value })} />
          </label>
        </div>
      </section>

      <section className="panel">
        <h2>平台与市场</h2>
        <div className="two-col">
          <label>
            <span>平台</span>
            <select value={form.platform} onChange={(event) => setForm({ ...form, platform: event.target.value as BatchFormState["platform"] })}>
              {ECOMMERCE_PLATFORMS.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>市场</span>
            <select value={form.market} onChange={(event) => setForm({ ...form, market: event.target.value as BatchFormState["market"] })}>
              {ECOMMERCE_MARKETS.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="panel">
        <h2>生成方式</h2>
        <div className="mode-grid">
          {generationModes.map((mode) => (
            <button
              className={form.generationMode === mode.id ? "mode-button active" : "mode-button"}
              key={mode.id}
              type="button"
              onClick={() => updateGenerationMode(mode.id)}
            >
              <strong>{mode.label}</strong>
              <span>{mode.hint}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>生成场景</h2>
        <div className="scene-grid">
          {availableScenes.map((scene) => (
            <button
              className={form.sceneTemplateIds.includes(scene.id) ? "scene-button active" : "scene-button"}
              key={scene.id}
              type="button"
              onClick={() => toggleScene(scene.id)}
            >
              <Wand2 size={15} />
              {scene.label}
            </button>
          ))}
        </div>
      </section>

      {form.generationMode === "enhance" ? (
        <section className="panel">
          <h2>文字翻译</h2>
          <div className="two-col">
            <label>
              <span>文字替换</span>
              <select
                value={form.textLanguage === "none" ? "none" : "replace"}
                onChange={(event) => setForm({ ...form, textLanguage: event.target.value === "replace" ? "ko" : "none" })}
              >
                <option value="none">不替换原图文字</option>
                <option value="replace">替换为目标文字</option>
              </select>
            </label>
            <label>
              <span>目标文字</span>
              <select
                disabled={form.textLanguage === "none"}
                value={form.textLanguage === "none" ? "ko" : form.textLanguage}
                onChange={(event) => setForm({ ...form, textLanguage: event.target.value as BatchFormState["textLanguage"] })}
              >
                {ECOMMERCE_TEXT_LANGUAGES.filter((item) => item.id !== "none").map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span>是否二创</span>
              <select
                disabled={form.textLanguage === "none"}
                value={form.allowTextRecreation ? "yes" : "no"}
                onChange={(event) => setForm({ ...form, allowTextRecreation: event.target.value === "yes" })}
              >
                <option value="yes">是</option>
                <option value="no">否</option>
              </select>
            </label>
          </div>
          <div className="toggle-row">
            <div>
              <h2>去水印 / Logo</h2>
              <p>勾选后，会移除水印、Logo、非卖点介绍文字以及无关图片元素。</p>
            </div>
            <label className="switch-control">
              <input
                checked={form.removeWatermarkAndLogo}
                type="checkbox"
                onChange={(event) => setForm({ ...form, removeWatermarkAndLogo: event.target.checked })}
              />
              <span />
            </label>
          </div>
        </section>
      ) : null}

      <section className="panel brand-overlay-panel">
        <div className="toggle-row">
          <div>
            <h2>品牌叠加</h2>
            <p>开启后，所有生成图会在结果预览和下载时统一附加 Logo 或品牌文字。</p>
          </div>
          <label className="switch-control">
            <input
              checked={form.brandOverlay.enabled}
              type="checkbox"
              onChange={(event) => updateBrandOverlay({ enabled: event.target.checked })}
            />
            <span />
          </label>
        </div>
        {form.brandOverlay.enabled ? (
          <>
            <div className="two-col">
              <label>
                <span>上传 Logo</span>
                <input accept="image/*" type="file" onChange={(event) => void handleLogoUpload(event)} />
              </label>
              <label>
                <span>叠加位置</span>
                <select
                  value={form.brandOverlay.placement}
                  onChange={(event) => updateBrandOverlay({ placement: event.target.value as BatchFormState["brandOverlay"]["placement"] })}
                >
                  <option value="top-left">左上角</option>
                  <option value="top-right">右上角</option>
                  <option value="bottom-left">左下角</option>
                  <option value="bottom-right">右下角</option>
                </select>
              </label>
            </div>
            <label>
              <span>品牌文字（未上传 Logo 时使用）</span>
              <input
                placeholder="例如 Brand name"
                value={form.brandOverlay.text}
                onChange={(event) => updateBrandOverlay({ text: event.target.value })}
              />
            </label>
            {form.brandOverlay.logoDataUrl || form.brandOverlay.text.trim() ? (
              <div className="brand-overlay-preview">
                {form.brandOverlay.logoDataUrl ? (
                  <img alt="Logo 预览" src={form.brandOverlay.logoDataUrl} />
                ) : (
                  <strong>{form.brandOverlay.text.trim()}</strong>
                )}
                <span>{form.brandOverlay.logoFileName || "品牌文字"}</span>
              </div>
            ) : (
              <p className="brand-overlay-hint">开启后请上传 Logo，或填写品牌文字。</p>
            )}
          </>
        ) : null}
      </section>

      <section className="panel">
        <h2>输出设置</h2>
        <div className="two-col">
          <label>
            <span>尺寸</span>
            <select
              value={form.sizeMode === "source" ? SOURCE_ASPECT_SIZE_OPTION : `${form.size.width}x${form.size.height}`}
              onChange={(event) => {
                if (event.target.value === SOURCE_ASPECT_SIZE_OPTION) {
                  setForm({ ...form, sizeMode: "source" });
                  void applySourceAspectSize();
                  return;
                }
                const [width, height] = event.target.value.split("x").map((value) => Number.parseInt(value, 10));
                setForm({ ...form, sizeMode: "preset", size: { width, height } });
              }}
            >
              <option disabled={selectedReferenceImageUrls.length === 0} value={SOURCE_ASPECT_SIZE_OPTION}>
                原图比例{form.sizeMode === "source" ? ` (${form.size.width}x${form.size.height})` : ""}
              </option>
              {SIZE_PRESETS.slice(0, 6).map((preset) => (
                <option key={preset.id} value={`${preset.width}x${preset.height}`}>{preset.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>每场景数量</span>
            <select value={form.countPerScene} onChange={(event) => setForm({ ...form, countPerScene: Number(event.target.value) as 1 | 2 | 4 })}>
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={4}>4</option>
            </select>
          </label>
          <label>
            <span>风格</span>
            <select value={form.stylePresetId} onChange={(event) => setForm({ ...form, stylePresetId: event.target.value as StylePresetId })}>
              {styleOptions.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>格式</span>
            <select value={form.outputFormat} onChange={(event) => setForm({ ...form, outputFormat: event.target.value as OutputFormat })}>
              {formatOptions.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>质量</span>
            <select value={form.quality} onChange={(event) => setForm({ ...form, quality: event.target.value as ImageQuality })}>
              {qualityOptions.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </label>
        </div>
        <label>
          <span>补充方向</span>
          <textarea rows={3} value={form.extraDirection} onChange={(event) => setForm({ ...form, extraDirection: event.target.value })} />
        </label>
      </section>

      <section className="sticky-actions">
        <div>
          <strong>{selectedScenes.length * form.countPerScene}</strong>
          <span>
            {task.status === "pending" || task.status === "running"
              ? `${task.completedScenes ?? 0}/${task.totalScenes ?? selectedScenes.length} 场景`
              : "张图像"}
          </span>
        </div>
        <button className="primary-button" disabled={task.status === "pending" || task.status === "running"} type="button" onClick={() => void submitBatch()}>
          {task.status === "running" ? <Loader2 className="spin" size={17} /> : <Send size={17} />}
          批量生成
        </button>
      </section>

      <section className="panel results-panel">
        <div className={`status status-${task.status}`}>
          {task.status === "succeeded" ? <CheckCircle2 size={16} /> : task.status === "running" ? <Loader2 className="spin" size={16} /> : <Sparkles size={16} />}
          {task.message}
        </div>
        {renderResultImages(task.status === "running" ? "图片生成中，完成后会显示在这里。" : "生成成功的图片会显示在这里。")}
      </section>

      {renderEditDialog()}

      <section className="tool-dock" aria-label="扩展工具">
        <div className="tool-tabs">
          <button className={activeTool === "account" && toolPanelOpen ? "tool-tab active" : "tool-tab"} type="button" onClick={() => openTool("account")}>
            <UserCircle2 size={15} />
            账户
          </button>
          <button className={activeTool === "billing" && toolPanelOpen ? "tool-tab active" : "tool-tab"} type="button" onClick={() => openTool("billing")}>
            <Wallet size={15} />
            额度
          </button>
          <button className={activeTool === "history" && toolPanelOpen ? "tool-tab active" : "tool-tab"} type="button" onClick={() => openTool("history")}>
            <Clock3 size={15} />
            历史
          </button>
          <button className={activeTool === "stats" && toolPanelOpen ? "tool-tab active" : "tool-tab"} type="button" onClick={() => openTool("stats")}>
            <BarChart3 size={15} />
            统计
          </button>
        </div>

        {toolPanelOpen ? (
          <div className="tool-panel">
            <div className="tool-panel-header">
              <strong>{activeTool === "account" ? "账户" : activeTool === "billing" ? "套餐与余额" : activeTool === "history" ? "历史任务" : "统计概览"}</strong>
              <button className="tool-close" type="button" onClick={() => setToolPanelOpen(false)}>收起</button>
            </div>

            {activeTool === "account" ? (
              <div>
                {auth.token ? (
                  <div className="account-card">
                    <div className="account-heading">
                      <div>
                        <strong>{auth.user?.displayName || auth.user?.email || "已登录"}</strong>
                        <span>{auth.user?.email || "正在同步账户信息"}</span>
                      </div>
                      <button
                        className="mini-button"
                        type="button"
                        onClick={() => {
                          void clearAuth("已退出登录。");
                          setAuthError("");
                        }}
                      >
                        <LogOut size={13} />
                        退出
                      </button>
                    </div>
                    <div className="account-meta">
                      <div><span>当前套餐</span><strong>{billingState.data.currentPlan?.name || auth.user?.planName || auth.user?.planId || "未设置"}</strong></div>
                      <div><span>套餐到期</span><strong>{billingState.data.currentPlanExpiresAt || auth.user?.planExpiresAt ? formatDateTime(billingState.data.currentPlanExpiresAt || auth.user?.planExpiresAt) : "长期"}</strong></div>
                      <div><span>账户余额</span><strong>{formatMoney(billingState.data.balanceCents ?? auth.user?.balanceCents ?? 0, billingState.data.currency || auth.user?.currency)}</strong></div>
                      <div><span>已用张数</span><strong>{formatCount(accountQuota.quotaUsed)}/{formatCount(accountQuota.quotaTotal)}</strong></div>
                      <div><span>套餐余量</span><strong>{formatCount(accountQuota.remaining)}</strong></div>
                    </div>
                    <div className="button-row">
                      <button className="mini-button" type="button" onClick={() => void refreshMe()}>
                        <RefreshCw size={13} />
                        刷新账户
                      </button>
                      <button className="mini-button" type="button" onClick={() => openTool("billing")}>
                        <CreditCard size={13} />
                        购买/充值
                      </button>
                    </div>
                  </div>
                ) : (
                  <form className="auth-form" onSubmit={(event) => void submitAuth(event)}>
                    <div className="auth-switch">
                      <button className={authMode === "login" ? "active" : ""} type="button" onClick={() => setAuthMode("login")}>登录</button>
                      <button className={authMode === "register" ? "active" : ""} type="button" onClick={() => setAuthMode("register")}>注册</button>
                    </div>
                    <label>
                      <span>邮箱</span>
                      <input autoComplete="email" type="email" value={authForm.email} onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })} required />
                    </label>
                    {authMode === "register" ? (
                      <label>
                        <span>显示名</span>
                        <input autoComplete="name" value={authForm.displayName} onChange={(event) => setAuthForm({ ...authForm, displayName: event.target.value })} />
                      </label>
                    ) : null}
                    <label>
                      <span>密码</span>
                      <input autoComplete={authMode === "login" ? "current-password" : "new-password"} type="password" value={authForm.password} onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })} required />
                    </label>
                    {authError ? <p className="tool-error">{authError}</p> : null}
                    <button className="primary-button auth-submit" disabled={authLoading} type="submit">
                      {authLoading ? <Loader2 className="spin" size={15} /> : <KeyRound size={15} />}
                      {authMode === "login" ? "登录" : "注册并登录"}
                    </button>
                  </form>
                )}
                {!auth.token ? <p className="settings-note">登录后会把个人 JWT 保存在本地，并自动附加到后端请求。</p> : null}
              </div>
            ) : null}

            {activeTool === "billing" ? (
              <div>
                <div className="tool-actions">
                  <span>套餐购买与支付宝余额充值</span>
                  <button className="mini-button" disabled={billingState.loading} type="button" onClick={() => void refreshBilling()}>
                    {billingState.loading ? <Loader2 className="spin" size={13} /> : <RefreshCw size={13} />}
                    刷新
                  </button>
                </div>
                {billingState.error ? <p className="tool-error">{billingState.error}</p> : null}
                {billingState.loading ? <p className="tool-empty">正在读取额度数据...</p> : null}
                <div className="billing-balance-card">
                  <div>
                    <span>账户余额</span>
                    <strong>{formatMoney(billingState.data.balanceCents, billingState.data.currency)}</strong>
                  </div>
                  <div>
                    <span>单张费用</span>
                    <strong>{formatMoney(billingState.data.imageUnitPriceCents, billingState.data.currency)}</strong>
                  </div>
                  <Coins size={22} />
                </div>
                <div className="recharge-row">
                  <label>
                    <span>支付宝充值金额</span>
                    <input inputMode="decimal" value={rechargeAmount} onChange={(event) => setRechargeAmount(event.target.value)} />
                  </label>
                  <button className="primary-button recharge-button" disabled={billingActionLoading} type="button" onClick={() => void submitRecharge()}>
                    {billingActionLoading ? <Loader2 className="spin" size={15} /> : <Wallet size={15} />}
                    充值
                  </button>
                </div>
                <div className="billing-usage-card">
                  <div className="quota-title-row">
                    <div>
                      <strong>图片生成张数</strong>
                      <span>{formatCount(accountQuota.remaining)} 张可用</span>
                    </div>
                    <span>{accountQuota.percent}% 已用</span>
                  </div>
                  <div className="quota-meter">
                    <span style={{ width: `${accountQuota.percent}%` }} />
                  </div>
                  <div className="quota-row">
                    <span>{formatCount(accountQuota.quotaUsed)} 已用</span>
                    <span>{formatCount(accountQuota.quotaTotal)} 总额度</span>
                  </div>
                </div>
                <div className="plan-list">
                  {billingState.data.plans.map((plan) => (
                    <article className={plan.recommended ? "plan-card recommended" : "plan-card"} key={plan.id}>
                      <div className="plan-card-top">
                        <div>
                          <strong>{plan.name}</strong>
                          <span>{plan.description || `${formatCount(plan.imageQuota)} 次图片生成`}</span>
                        </div>
                        {plan.recommended ? <em>推荐</em> : null}
                      </div>
                      <div className="plan-price">{formatMoney(plan.priceCents, plan.currency)}</div>
                      <div className="plan-benefits">
                        {(planBenefits(plan).length > 0 ? planBenefits(plan) : [`${formatCount(plan.imageQuota)} 次图片生成额度`]).map((benefit) => (
                          <span key={benefit}>{benefit}</span>
                        ))}
                      </div>
                      <div className="plan-buy-row">
                        <button className="mini-button plan-buy" disabled={billingActionLoading || !plan.enabled} type="button" onClick={() => void purchasePlan(plan, "balance")}>
                          <Wallet size={13} />
                          余额
                        </button>
                        <button className="mini-button plan-buy" disabled={billingActionLoading || !plan.enabled} type="button" onClick={() => void purchasePlan(plan, "alipay")}>
                          <ExternalLink size={13} />
                          支付宝
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
                <div className="billing-usage-card">
                  <div className="tool-actions compact">
                    <span>订单</span>
                    <CreditCard size={13} />
                  </div>
                  {billingState.data.orders.length === 0 ? (
                    <p className="tool-empty">暂无订单。</p>
                  ) : (
                    <div className="billing-ledger-list">
                      {billingState.data.orders.slice(0, 6).map((order) => (
                        <article className="billing-ledger-item" key={order.id}>
                          <div>
                            <strong>{order.title || billingTransactionLabel(order.type)}</strong>
                            <span>{billingOrderStatusLabel(order.status)} · {formatDateTime(order.createdAt)}</span>
                          </div>
                          <div>
                            <strong>{formatMoney(order.amountCents, order.currency)}</strong>
                            <span>{order.paymentProvider}</span>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
                <div className="billing-usage-card">
                  <div className="tool-actions compact">
                    <span>生图与扣费明细</span>
                    <CreditCard size={13} />
                  </div>
                  {billingState.data.transactions.length === 0 ? (
                    <p className="tool-empty">暂无扣费明细。</p>
                  ) : (
                    <div className="billing-ledger-list">
                      {billingState.data.transactions.slice(0, 8).map((transaction) => (
                        <article className="billing-ledger-item" key={transaction.id}>
                          <div>
                            <strong>{billingTransactionLabel(transaction.type)}</strong>
                            <span>{transaction.note || transaction.title}</span>
                          </div>
                          <div>
                            <strong>{formatMoney(transaction.amountCents, transaction.currency)}</strong>
                            <span>{formatDateTime(transaction.createdAt)}</span>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
                {billingAction ? <p className="settings-note">{billingAction}</p> : null}
              </div>
            ) : null}

            {activeTool === "history" ? (
              <div>
                <div className="tool-actions">
                  <span>当前账号的批量任务</span>
                  <button className="mini-button" disabled={historyState.loading} type="button" onClick={() => void refreshHistory()}>
                    {historyState.loading ? <Loader2 className="spin" size={13} /> : <RefreshCw size={13} />}
                    刷新
                  </button>
                </div>
                {historyState.error ? <p className="tool-error">{historyState.error}</p> : null}
                {historyState.loading && historyState.data.length === 0 ? <p className="tool-empty">正在读取历史任务...</p> : null}
                {!historyState.loading && !historyState.error && historyState.data.length === 0 ? <p className="tool-empty">暂无历史任务。</p> : null}
                {historyState.data.map((job) => {
                  const completed = job.completedScenes ?? 0;
                  const total = job.totalScenes ?? job.records?.length ?? 0;
                  const progress = job.progress ?? (total > 0 ? Math.round((completed / total) * 100) : undefined);
                  const assets = job.records?.flatMap((record) => record.outputs.flatMap((output) => output.asset ? [output.asset] : [])) ?? [];
                  return (
                    <article
                      className="history-card"
                      key={job.id}
                      onClick={() => openHistoryJob(job)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openHistoryJob(job);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="history-card-top">
                        <strong>{job.status}</strong>
                        <span>{formatDateTime(job.createdAt)}</span>
                      </div>
                      <div className="progress-row">
                        <span>{total > 0 ? `${completed}/${total}` : "进度待返回"}</span>
                        <div className="progress-track">
                          <div className="progress-fill" style={{ width: `${Math.min(progress ?? 0, 100)}%` }} />
                        </div>
                      </div>
                      <p>{job.id}</p>
                      <button
                        className="mini-button history-open"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          openHistoryJob(job);
                        }}
                      >
                        <ImageIcon size={13} />
                        打开作品
                      </button>
                      {job.sourcePageUrl ? (
                        <a
                          className="source-link"
                          href={job.sourcePageUrl}
                          target="_blank"
                          rel="noreferrer"
                          title={job.sourcePageUrl}
                          onClick={(event) => event.stopPropagation()}
                        >
                          <ExternalLink size={13} />
                          <span>{formatSourceUrl(job.sourcePageUrl)}</span>
                        </a>
                      ) : (
                        <span className="muted-line">暂无来源商品链接</span>
                      )}
                      {assets.length > 0 ? (
                        <div className="asset-list">
                          {assets.map((asset, index) => (
                            <button
                              className="asset-thumb"
                              key={asset.id}
                              title={`打开第 ${index + 1} 张图片`}
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                void openGalleryPreview(asset);
                              }}
                            >
                              <img alt={`任务图片 ${index + 1}`} loading="lazy" src={assetPreviewUrl(asset, 192)} />
                            </button>
                          ))}
                        </div>
                      ) : (
                        <span className="muted-line">暂无图片链接</span>
                      )}
                    </article>
                  );
                })}
              </div>
            ) : null}

            {activeTool === "stats" ? (
              <div>
                <div className="tool-actions">
                  <span>生成表现与任务量</span>
                  <button className="mini-button" disabled={statsState.loading} type="button" onClick={() => void refreshStats()}>
                    {statsState.loading ? <Loader2 className="spin" size={13} /> : <RefreshCw size={13} />}
                    刷新
                  </button>
                </div>
                {statsState.error ? <p className="tool-error">{statsState.error}</p> : null}
                {statsState.loading ? <p className="tool-empty">正在读取统计数据...</p> : null}
                <div className="stats-grid">
                  <div><span>总任务</span><strong>{statsState.data.totalJobs}</strong></div>
                  <div><span>成功</span><strong>{statsState.data.succeededJobs}</strong></div>
                  <div><span>失败</span><strong>{statsState.data.failedJobs}</strong></div>
                  <div><span>进行中</span><strong>{statsState.data.runningJobs}</strong></div>
                  <div className="wide-stat"><span>生成图片</span><strong>{statsState.data.generatedImages}</strong></div>
                </div>
              </div>
            ) : null}

          </div>
        ) : null}
      </section>
    </main>
  );
}
