import {
  Copy,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  Coins,
  Clock3,
  CreditCard,
  Download,
  Edit3,
  ExternalLink,
  Gift,
  ImageIcon,
  KeyRound,
  Languages,
  Loader2,
  LogOut,
  Package,
  Phone,
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
import type { AuthUser, BatchFormState, BatchTask, ExtensionAuthState, PageContext, PageProductContext } from "./types";

const ACTIVE_BATCH_JOB_STORAGE_KEY = "activeBatchJob";
const AUTH_STORAGE_KEY = "auth";
const DEFAULT_API_BASE_URL = import.meta.env.VITE_EXTENSION_API_BASE_URL || "https://imagen.neimou.com";
const UPDATE_DIALOG_DISMISSED_STORAGE_KEY = "dismissedExtensionUpdateDialog";
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const TEXT_TRANSLATION_SCENE_ID = "text-translation" as const;
const TEXT_TRANSLATION_CONCURRENCY = 4;
const PHONE_VERIFICATION_REQUIRED_CODE = "phone_verification_required";
const PHONE_VERIFICATION_REQUIRED_MESSAGE = "为了更好提供服务，请完善手机号。";
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

type ToolTab = "account" | "billing" | "history" | "stats" | "referral" | "about";
type AuthMode = "login" | "register";
type PendingAuthAction = "generate" | "billing" | "history" | "stats" | "referral" | "job";

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

interface ReferralSummary {
  inviteCode: string;
  inviteUrl?: string;
  invitedUserCount: number;
  successfulInviteCount: number;
  invitees?: Array<{
    userId: string;
    email?: string;
    displayName?: string;
    createdAt: string;
  }>;
  referralBalanceCents: number;
  currency: string;
  settings: {
    enabled: boolean;
    baseRegisterCredits: number;
    inviterRegisterCredits: number;
    inviteeRegisterCredits: number;
    rechargeCashbackRateBps: number;
    planPurchaseCashbackRateBps: number;
    minCashbackOrderAmountCents: number;
    currency: string;
  };
}

interface RemoteState<T> {
  data: T;
  error: string;
  loading: boolean;
}

interface ExtensionUpdateInfo {
  target: string;
  version: string;
  publishedAt?: string;
  downloadUrl: string;
  latestDownloadUrl?: string;
  installHelpUrl?: string;
  fileName?: string;
  sizeBytes?: number;
  sha256?: string;
  releaseNotes?: string[];
}

interface ExtensionVersionState {
  currentVersion: string;
  checkedAt?: string;
  update: ExtensionUpdateInfo | null;
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

interface QueuedJobDialogState {
  jobId: string;
  message: string;
  totalScenes?: number;
  completedScenes?: number;
}

interface UploadedReferenceImage {
  id: string;
  dataUrl: string;
  fileName: string;
}

type CategoryKitVersion = BatchFormState["categoryKit"]["kitVersion"];
type CategoryKitStyle = BatchFormState["categoryKit"]["targetStyle"];

const allegroScarfComplianceScenes = ["allegro-scarf-main-flat", "allegro-scarf-main-styled"] as const;
const allegroScarfConversionScenes = [
  "allegro-scarf-main-flat",
  "allegro-scarf-main-styled",
  "allegro-scarf-drape-product",
  "allegro-scarf-fabric-detail",
  "allegro-scarf-edge-detail",
  "allegro-scarf-size-guide",
  "allegro-scarf-wear-grid",
  "allegro-scarf-neck-model",
  "allegro-scarf-bag-styling",
  "allegro-scarf-lifestyle",
  "allegro-scarf-sku-colors",
  "allegro-scarf-care-gift"
] as const;

const allegroScarfAdsScenes = [...allegroScarfConversionScenes, "allegro-scarf-ads-social"] as const;
const marketingMainScenes = [
  "marketing-main-hero",
  "marketing-main-people-scene",
  "marketing-main-benefit-hook",
  "marketing-main-trust-promo"
] as const;

const categoryKitScenesByVersion: Record<CategoryKitVersion, EcommerceSceneTemplateId[]> = {
  compliance: [...allegroScarfComplianceScenes],
  conversion: [...allegroScarfConversionScenes],
  ads: [...allegroScarfAdsScenes]
};

const categoryKitVersionOptions: Array<{ id: CategoryKitVersion; label: string; hint: string }> = [
  { id: "compliance", label: "Allegro 合规版", hint: "只输出可直接上架的白底主图候选。" },
  { id: "conversion", label: "Allegro 转化版", hint: "主图 + 细节、尺寸、佩戴、场景和洗护图。" },
  { id: "ads", label: "广告/社媒版", hint: "在转化版基础上增加广告和社媒扩展图。" }
];

const categoryKitStyleOptions: Array<{ id: CategoryKitStyle; label: string; prompt: string }> = [
  { id: "commute", label: "通勤", prompt: "European daily commute styling, clean office-friendly outfits" },
  { id: "french", label: "法式", prompt: "French minimal styling, elegant and understated" },
  { id: "luxury", label: "轻奢", prompt: "quiet luxury styling, premium fabric emphasis, refined details" },
  { id: "travel", label: "旅行", prompt: "light travel styling, cafe and city walk scenes" },
  { id: "gift", label: "礼品", prompt: "gift-oriented styling, warm but truthful purchase motivation" }
];

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
  categoryKit: {
    categoryId: "accessory-scarf",
    kitVersion: "conversion",
    scarfSize: "90 x 90 cm",
    skuCount: "1",
    hasPackaging: false,
    targetStyle: "french",
    allowModelImages: true,
    polishCopy: true
  },
  brandOverlay: {
    enabled: false,
    logoDataUrl: "",
    logoFileName: "",
    text: "",
    placement: "top-right"
  },
  marketingMain: {
    category: "",
    productExpression: "",
    targetCustomer: "",
    usageScene: "",
    primaryHook: "",
    supportPoints: ["", "", ""],
    trustBadges: "",
    copyTone: "auto",
    allowPeople: true,
    allowPreparedState: true,
    allowSceneProps: true
  }
};

const defaultSceneIdsByMode: Record<EcommerceGenerationMode, EcommerceSceneTemplateId[]> = {
  enhance: ["marketplace-main", "logo-benefit", "feature-benefit"],
  creative: ["lifestyle", "model-wear", "accessory-match"],
  "category-kit": [...allegroScarfConversionScenes],
  "marketing-main": [...marketingMainScenes],
  "text-translation": [TEXT_TRANSLATION_SCENE_ID]
};

const generationModes: Array<{ id: EcommerceGenerationMode; label: string; hint: string }> = [
  { id: "enhance", label: "原图增强", hint: "保留商品原貌，生成卖点文字和电商排版。" },
  { id: "creative", label: "场景创作", hint: "依据主图生成生活方式、模特穿戴和搭配场景。" },
  { id: "category-kit", label: "品类套图", hint: "按平台和类目生成整套 Listing Image Kit。" },
  { id: "marketing-main", label: "营销主图设计", hint: "按产品、人群、场景、卖点和信任元素设计点击主图。" }
];

const textTranslationMode = {
  label: "文字翻译",
  hint: "逐张翻译图片文字，可选择目标语言和是否二创。"
};

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
const MAX_REFERENCE_IMAGE_COUNT = 3;
const CHINESE_ECOMMERCE_PLATFORM_IDS = new Set<BatchFormState["platform"]>([
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<void>
): Promise<void> {
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        await mapper(items[index], index);
      }
    })
  );
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateParts(date = new Date()): { date: number; time: number } {
  const year = Math.max(date.getFullYear(), 1980);
  return {
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
  };
}

async function createZipBlob(files: Array<{ name: string; blob: Blob }>): Promise<Blob> {
  const encoder = new TextEncoder();
  const localParts: BlobPart[] = [];
  const centralParts: BlobPart[] = [];
  const { date, time } = dosDateParts();
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const bytes = new Uint8Array(await file.blob.arrayBuffer());
    const crc = crc32(bytes);
    const localOffset = offset;
    const localHeader = new ArrayBuffer(30);
    const localView = new DataView(localHeader);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, time, true);
    localView.setUint16(12, date, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, bytes.byteLength, true);
    localView.setUint32(22, bytes.byteLength, true);
    localView.setUint16(26, nameBytes.byteLength, true);
    localView.setUint16(28, 0, true);
    localParts.push(localHeader, nameBytes, bytes);
    offset += 30 + nameBytes.byteLength + bytes.byteLength;

    const centralHeader = new ArrayBuffer(46);
    const centralView = new DataView(centralHeader);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, time, true);
    centralView.setUint16(14, date, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, bytes.byteLength, true);
    centralView.setUint32(24, bytes.byteLength, true);
    centralView.setUint16(28, nameBytes.byteLength, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, localOffset, true);
    centralParts.push(centralHeader, nameBytes);
  }

  const centralDirectoryOffset = offset;
  const centralDirectorySize = centralParts.reduce((total, part) => total + (part instanceof Uint8Array ? part.byteLength : part instanceof ArrayBuffer ? part.byteLength : 0), 0);
  const endRecord = new ArrayBuffer(22);
  const endView = new DataView(endRecord);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralDirectorySize, true);
  endView.setUint32(16, centralDirectoryOffset, true);
  endView.setUint16(20, 0, true);
  return new Blob([...localParts, ...centralParts, endRecord], { type: "application/zip" });
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

  const loadedImages = await Promise.all(images.slice(0, 3).map((item) => imageFromUrl(item.dataUrl)));
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
  const trimmedUrls = urls.map((url) => url.trim()).filter(Boolean).slice(0, 3);
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

function mergeHistoryJobDetails(summary: EcommerceJobSummary, detail: EcommerceBatchGenerateResponse): EcommerceJobSummary {
  return {
    ...summary,
    status: detail.status,
    createdAt: detail.createdAt || summary.createdAt,
    updatedAt: detail.updatedAt || summary.updatedAt,
    completedAt: detail.completedAt || summary.completedAt,
    records: detail.records
  };
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

function formatBytes(value?: number): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return "未知大小";
  }
  if (value >= 1024 * 1024) {
    return `${(value / 1024 / 1024).toFixed(1)} MB`;
  }
  if (value >= 1024) {
    return `${Math.round(value / 1024)} KB`;
  }
  return `${value} B`;
}

function compareVersions(left: string, right: string): number {
  const leftParts = left.split(/[.-]/u).map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = right.split(/[.-]/u).map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

function extensionTarget(): "dev" | "prod" {
  return chrome.runtime.getManifest().name.toLowerCase().includes("dev") ? "dev" : "prod";
}

function extensionVersionManifestUrl(baseUrl: string): string {
  return new URL(`/downloads/kuajing-image-extension-${extensionTarget()}-latest.json`, `${baseUrl.replace(/\/$/u, "")}/`).toString();
}

function absoluteAppUrl(pathOrUrl: string, baseUrl: string): string {
  return new URL(pathOrUrl, `${baseUrl.replace(/\/$/u, "")}/`).toString();
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
  const email = firstString(source, ["email", "mail", "username"]) ?? "";
  const phone = firstString(source, ["phone", "mobile"]);
  if (!email && !phone) {
    return null;
  }

  return {
    id: firstString(source, ["id", "userId", "sub"]),
    email,
    phone,
    phoneVerifiedAt: firstString(source, ["phoneVerifiedAt", "phone_verified_at"]),
    displayName: firstString(source, ["displayName", "display_name", "name", "nickname"]),
    role: firstString(source, ["role", "plan"]),
    planId: firstString(source, ["planId", "plan_id"]),
    planName: firstString(source, ["planName", "plan_name"]),
    planExpiresAt: firstString(source, ["planExpiresAt", "plan_expires_at"]),
    quotaTotal: firstNumber(source, ["quotaTotal", "quota_total", "totalQuota"]),
    quotaUsed: firstNumber(source, ["quotaUsed", "quota_used", "usedQuota"]),
    balanceCents: firstNumber(source, ["balanceCents", "balance_cents", "balance"]),
    referralBalanceCents: firstNumber(source, ["referralBalanceCents", "referral_balance_cents"]),
    currency: firstString(source, ["currency"]),
    inviteCode: firstString(source, ["inviteCode", "invite_code"]),
    inviterUserId: firstString(source, ["inviterUserId", "inviter_user_id"]),
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

function normalizeReferralSummary(payload: unknown): ReferralSummary {
  const root = asRecord(payload);
  const invite = asRecord(root.invite ?? root.data ?? payload);
  const settings = asRecord(invite.settings);
  return {
    inviteCode: firstString(invite, ["inviteCode", "invite_code"]) ?? "",
    inviteUrl: firstString(invite, ["inviteUrl", "invite_url"]),
    invitedUserCount: firstNumber(invite, ["invitedUserCount", "invited_user_count"]) ?? 0,
    successfulInviteCount: firstNumber(invite, ["successfulInviteCount", "successful_invite_count"]) ?? 0,
    invitees: Array.isArray(invite.invitees)
      ? invite.invitees.map((item: unknown) => {
          const entry = asRecord(item);
          return {
            userId: firstString(entry, ["userId", "user_id"]) ?? "",
            email: firstString(entry, ["email"]),
            displayName: firstString(entry, ["displayName", "display_name"]),
            createdAt: firstString(entry, ["createdAt", "created_at"]) ?? ""
          };
        })
      : undefined,
    referralBalanceCents: firstNumber(invite, ["referralBalanceCents", "referral_balance_cents"]) ?? 0,
    currency: firstString(invite, ["currency"]) || firstString(settings, ["currency"]) || "CNY",
    settings: {
      enabled: settings.enabled !== false,
      baseRegisterCredits: firstNumber(settings, ["baseRegisterCredits", "base_register_credits"]) ?? 2,
      inviterRegisterCredits: firstNumber(settings, ["inviterRegisterCredits", "inviter_register_credits"]) ?? 4,
      inviteeRegisterCredits: firstNumber(settings, ["inviteeRegisterCredits", "invitee_register_credits"]) ?? 6,
      rechargeCashbackRateBps: firstNumber(settings, ["rechargeCashbackRateBps", "recharge_cashback_rate_bps"]) ?? 0,
      planPurchaseCashbackRateBps: firstNumber(settings, ["planPurchaseCashbackRateBps", "plan_purchase_cashback_rate_bps"]) ?? 0,
      minCashbackOrderAmountCents: firstNumber(settings, ["minCashbackOrderAmountCents", "min_cashback_order_amount_cents"]) ?? 0,
      currency: firstString(settings, ["currency"]) || "CNY"
    }
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
  const [authForm, setAuthForm] = useState({ email: "", phone: "", password: "", displayName: "", smsCode: "", inviteCode: "" });
  const [authLoading, setAuthLoading] = useState(false);
  const [authCodeLoading, setAuthCodeLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  const [bindPhoneForm, setBindPhoneForm] = useState({ phone: "", smsCode: "" });
  const [bindPhoneError, setBindPhoneError] = useState("");
  const [bindPhoneNotice, setBindPhoneNotice] = useState("");
  const [bindPhoneCodeLoading, setBindPhoneCodeLoading] = useState(false);
  const [bindPhoneLoading, setBindPhoneLoading] = useState(false);
  const [phoneDialogOpen, setPhoneDialogOpen] = useState(false);
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
  const [referralState, setReferralState] = useState<RemoteState<ReferralSummary | null>>({
    data: null,
    error: "",
    loading: false
  });
  const [referralAction, setReferralAction] = useState("");
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [batchGenerationLocked, setBatchGenerationLocked] = useState(false);
  const [hiddenResultKeys, setHiddenResultKeys] = useState<Set<string>>(() => new Set());
  const [localResultRecords, setLocalResultRecords] = useState<GenerationRecord[]>([]);
  const [editDialog, setEditDialog] = useState<EditImageDialogState | null>(null);
  const [queuedJobDialog, setQueuedJobDialog] = useState<QueuedJobDialogState | null>(null);
  const [uploadedReferenceImages, setUploadedReferenceImages] = useState<UploadedReferenceImage[]>([]);
  const [worksViewOpen, setWorksViewOpen] = useState(false);
  const [textTranslationViewOpen, setTextTranslationViewOpen] = useState(false);
  const [translationReturnMode, setTranslationReturnMode] = useState<EcommerceGenerationMode>("enhance");
  const [translationImageUrls, setTranslationImageUrls] = useState<string[]>([]);
  const [zipDownloadLoading, setZipDownloadLoading] = useState(false);
  const [extensionVersionState, setExtensionVersionState] = useState<ExtensionVersionState>({
    currentVersion: chrome.runtime.getManifest().version,
    update: null,
    error: "",
    loading: false
  });
  const [extensionUpdateDialogOpen, setExtensionUpdateDialogOpen] = useState(false);
  const historyPlaceholderImage = useMemo(() => {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" role="img" aria-label="生成中">
        <defs>
          <linearGradient id="bg" x1="24" y1="22" x2="216" y2="218" gradientUnits="userSpaceOnUse">
            <stop offset="0" stop-color="#eef4f1"/>
            <stop offset="1" stop-color="#e1ece7"/>
          </linearGradient>
          <linearGradient id="panel" x1="54" y1="58" x2="186" y2="182" gradientUnits="userSpaceOnUse">
            <stop offset="0" stop-color="#ffffff"/>
            <stop offset="1" stop-color="#f6fbf8"/>
          </linearGradient>
        </defs>
        <rect width="240" height="240" rx="24" fill="url(#bg)"/>
        <rect x="28" y="28" width="184" height="184" rx="22" fill="url(#panel)" stroke="#cfe0d9" stroke-width="3"/>
        <path d="M120 78v22m0 40v22m-32-56h22m40 0h22m-18.5-31.5 15.5 15.5m-15.5 94 15.5-15.5m-94 0 15.5 15.5m0-94L62.5 93.5" fill="none" stroke="#18a678" stroke-linecap="round" stroke-width="8"/>
        <circle cx="120" cy="120" r="26" fill="#dff4ec"/>
        <path d="M108 120h24m-12-12v24" stroke="#18a678" stroke-linecap="round" stroke-width="7"/>
        <text x="120" y="176" text-anchor="middle" font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="22" font-weight="800" fill="#5d6b62">生成中</text>
      </svg>
    `;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }, []);

  const availableScenes = useMemo(
    () => ECOMMERCE_SCENE_TEMPLATES.filter((template) => template.mode === form.generationMode),
    [form.generationMode]
  );

  const selectedScenes = useMemo(
    () => availableScenes.filter((template) => form.sceneTemplateIds.includes(template.id)),
    [availableScenes, form.sceneTemplateIds]
  );
  const effectiveSceneTemplateIds =
    form.generationMode === "category-kit" ? categoryKitScenesByVersion[form.categoryKit.kitVersion] : form.sceneTemplateIds;
  const effectiveCountPerScene = form.generationMode === "category-kit" ? 1 : form.countPerScene;
  const effectiveSelectedScenes = availableScenes.filter((template) => effectiveSceneTemplateIds.includes(template.id));

  const pageImageUrls = pageContext?.imageUrls ?? [];
  const selectedReferenceImageUrl = form.referenceImageUrl.trim();
  const selectedReferenceImageUrls = form.referenceImageUrls.length > 0 ? form.referenceImageUrls : selectedReferenceImageUrl ? [selectedReferenceImageUrl] : [];
  const selectedReferenceImageUrlsKey = selectedReferenceImageUrls.join("|");
  const maxReferenceImageCount = MAX_REFERENCE_IMAGE_COUNT;
  const referenceImageOptions = useMemo(
    () => [
      ...uploadedReferenceImages.map((image) => ({ key: image.id, url: image.dataUrl, label: image.fileName, uploaded: true })),
      ...pageImageUrls.map((url, index) => ({ key: url, url, label: `候选商品图 ${index + 1}`, uploaded: false }))
    ],
    [pageImageUrls, uploadedReferenceImages]
  );
  const selectedTranslationImageUrls = translationImageUrls.map((url) => url.trim()).filter(Boolean);

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
  const requiresPhoneVerification = Boolean(auth.token && auth.user && !auth.user.phone);

  useEffect(() => {
    if (requiresPhoneVerification) {
      setPhoneDialogOpen(true);
    }
  }, [requiresPhoneVerification]);

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
  }, []);

  useEffect(() => {
    void checkExtensionUpdate("silent");
    const timer = window.setInterval(() => {
      void checkExtensionUpdate("silent");
    }, UPDATE_CHECK_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const inviteCode = params.get("inviteCode") || params.get("invite") || params.get("ref");
    if (inviteCode) {
      setAuthMode("register");
      setAuthForm((current) => ({ ...current, inviteCode }));
    }
  }, []);

  useEffect(() => {
    const update = extensionVersionState.update;
    if (!update) {
      setExtensionUpdateDialogOpen(false);
      return;
    }
    const updateKey = `${update.target}:${update.version}`;
    if (window.localStorage.getItem(UPDATE_DIALOG_DISMISSED_STORAGE_KEY) !== updateKey) {
      setExtensionUpdateDialogOpen(true);
    }
  }, [extensionVersionState.update]);

  useEffect(() => {
    if (textTranslationViewOpen) {
      return;
    }
    if (task.status !== "pending" && task.status !== "running") {
      setBatchGenerationLocked(false);
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
  }, [auth.token, task.id, task.status, textTranslationViewOpen]);

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
    if (activeTool === "billing" || activeTool === "stats") {
      void refreshBilling();
    }
    if ((activeTool === "account" || activeTool === "referral") && auth.token.trim()) {
      void refreshReferral();
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
    const cdnPreviewUrl = previewUrlForWidth(asset.cdnPreviewUrls, width);
    if (cdnPreviewUrl) {
      return cdnPreviewUrl;
    }
    if (asset.cdnUrl) {
      return asset.cdnUrl;
    }
    if (!isApiAssetUrl(asset.url)) {
      return asset.url;
    }

    return authenticatedApiUrl(`/api/assets/${encodeURIComponent(asset.id)}/preview?width=${width}`);
  }

  function previewUrlForWidth(previewUrls: Record<string, string> | undefined, preferredWidth: number): string | undefined {
    if (!previewUrls) {
      return undefined;
    }

    const widths = Object.keys(previewUrls)
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value))
      .sort((a, b) => a - b);
    const selectedWidth = widths.find((candidate) => candidate >= preferredWidth) ?? widths[widths.length - 1];
    return selectedWidth ? previewUrls[String(selectedWidth)] : undefined;
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
      const detail = await parseApiError(response);
      if (detail.code === PHONE_VERIFICATION_REQUIRED_CODE) {
        setPhoneDialogOpen(true);
      }
      throw new Error(detail.message);
    }
    return response.json();
  }

  async function parseApiError(response: Response): Promise<{ code?: string; message: string }> {
    try {
      const body = (await response.json()) as unknown;
      const root = asRecord(body);
      const error = asRecord(root.error);
      const code = firstString(error, ["code"]);
      if (code === PHONE_VERIFICATION_REQUIRED_CODE) {
        return { code, message: PHONE_VERIFICATION_REQUIRED_MESSAGE };
      }
      const message = firstString(error, ["message"]) ?? firstString(root, ["message"]);
      if (message) {
        return { code, message };
      }
    } catch {
      // Fall through to a friendly generic message.
    }
    return { message: `请求失败，请稍后重试（HTTP ${response.status}）。` };
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

  function normalizeExtensionUpdateInfo(payload: unknown): ExtensionUpdateInfo {
    const root = asRecord(payload);
    const version = firstString(root, ["version", "latestVersion"]);
    const downloadUrl = firstString(root, ["downloadUrl", "download_url"]);
    if (!version || !downloadUrl) {
      throw new Error("版本清单格式不完整。");
    }
    const notes = root.releaseNotes;
    return {
      target: firstString(root, ["target"]) ?? extensionTarget(),
      version,
      publishedAt: firstString(root, ["publishedAt", "published_at"]),
      downloadUrl,
      latestDownloadUrl: firstString(root, ["latestDownloadUrl", "latest_download_url"]),
      installHelpUrl: firstString(root, ["installHelpUrl", "install_help_url"]),
      fileName: firstString(root, ["fileName", "file_name"]),
      sizeBytes: firstNumber(root, ["sizeBytes", "size_bytes"]),
      sha256: firstString(root, ["sha256"]),
      releaseNotes: Array.isArray(notes) ? notes.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).slice(0, 6) : []
    };
  }

  async function checkExtensionUpdate(mode: "silent" | "manual" = "manual"): Promise<void> {
    setExtensionVersionState((current) => ({
      ...current,
      error: mode === "manual" ? "" : current.error,
      loading: mode === "manual"
    }));
    try {
      const response = await fetch(extensionVersionManifestUrl(apiBaseUrl()), { cache: "no-store" });
      if (!response.ok) {
        throw new Error("版本清单读取失败。");
      }
      const latest = normalizeExtensionUpdateInfo(await response.json());
      const hasUpdate = compareVersions(latest.version, chrome.runtime.getManifest().version) > 0;
      setExtensionVersionState({
        currentVersion: chrome.runtime.getManifest().version,
        checkedAt: new Date().toISOString(),
        update: hasUpdate ? latest : null,
        error: "",
        loading: false
      });
    } catch (error) {
      setExtensionVersionState((current) => ({
        ...current,
        checkedAt: new Date().toISOString(),
        error: mode === "manual" ? (error instanceof Error ? error.message : "版本检查失败。") : current.error,
        loading: false
      }));
    }
  }

  async function upgradeExtension(): Promise<void> {
    const update = extensionVersionState.update;
    if (!update) {
      await checkExtensionUpdate("manual");
      return;
    }
    const downloadHref = absoluteAppUrl(update.latestDownloadUrl || update.downloadUrl, apiBaseUrl());
    downloadUrl(downloadHref, update.fileName || `kuajing-image-extension-${extensionTarget()}-v${update.version}.zip`);
    if (update.installHelpUrl) {
      await chrome.tabs.create({ url: absoluteAppUrl(update.installHelpUrl, apiBaseUrl()) });
    }
  }

  function dismissExtensionUpdateDialog(): void {
    const update = extensionVersionState.update;
    if (update) {
      window.localStorage.setItem(UPDATE_DIALOG_DISMISSED_STORAGE_KEY, `${update.target}:${update.version}`);
    }
    setExtensionUpdateDialogOpen(false);
  }

  async function downloadExtensionUpdateFromDialog(): Promise<void> {
    dismissExtensionUpdateDialog();
    await upgradeExtension();
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
    setAuthNotice("");
    if (authMode === "register" && !authForm.smsCode.trim()) {
      setAuthError("请输入短信验证码。");
      return;
    }
    setAuthLoading(true);
    try {
      const response = await fetch(`${apiBaseUrl()}/api/auth/${authMode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: authMode === "login" ? authForm.email.trim() : undefined,
          phone: authMode === "register" ? authForm.phone.trim() : undefined,
          password: authForm.password,
          displayName: authMode === "register" ? authForm.displayName.trim() || undefined : undefined,
          smsCode: authMode === "register" ? authForm.smsCode.trim() : undefined,
          inviteCode: authMode === "register" ? authForm.inviteCode.trim() || undefined : undefined
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
      void refreshReferral(true, nextAuth.token);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "登录失败，请稍后重试。");
    } finally {
      setAuthLoading(false);
    }
  }

  async function sendAuthSmsCode(): Promise<void> {
    setAuthError("");
    setAuthNotice("");
    if (!authForm.phone.trim()) {
      setAuthError("请先输入手机号。");
      return;
    }

    setAuthCodeLoading(true);
    try {
      const response = await fetch(`${apiBaseUrl()}/api/auth/sms-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: authForm.phone.trim() })
      });
      await parseResponseOrThrow(response);
      setAuthNotice("验证码已发送，请查收短信。");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "验证码发送失败。");
    } finally {
      setAuthCodeLoading(false);
    }
  }

  async function sendBindPhoneCode(): Promise<void> {
    setBindPhoneError("");
    setBindPhoneNotice("");
    if (!bindPhoneForm.phone.trim()) {
      setBindPhoneError("请先输入手机号。");
      return;
    }
    setBindPhoneCodeLoading(true);
    try {
      const response = await fetch(`${apiBaseUrl()}/api/auth/phone-code`, {
        method: "POST",
        headers: apiHeaders(true),
        body: JSON.stringify({ phone: bindPhoneForm.phone.trim() })
      });
      await parseResponseOrThrow(response);
      setBindPhoneNotice("验证码已发送，请查收短信。");
    } catch (error) {
      setBindPhoneError(error instanceof Error ? error.message : "验证码发送失败。");
    } finally {
      setBindPhoneCodeLoading(false);
    }
  }

  async function submitBindPhone(): Promise<void> {
    setBindPhoneError("");
    setBindPhoneNotice("");
    if (!bindPhoneForm.phone.trim() || !bindPhoneForm.smsCode.trim()) {
      setBindPhoneError("请输入手机号和短信验证码。");
      return;
    }
    setBindPhoneLoading(true);
    try {
      const response = await fetch(`${apiBaseUrl()}/api/auth/phone`, {
        method: "POST",
        headers: apiHeaders(true),
        body: JSON.stringify({ phone: bindPhoneForm.phone.trim(), smsCode: bindPhoneForm.smsCode.trim() })
      });
      const body = await parseResponseOrThrow(response);
      const user = normalizeUser(body);
      if (user) {
        const nextAuth = { token: auth.token, user };
        setAuth(nextAuth);
        await chrome.storage.local.set({ [AUTH_STORAGE_KEY]: nextAuth });
      } else {
        await refreshMe(auth.token);
      }
      setBindPhoneForm({ phone: "", smsCode: "" });
      setBindPhoneNotice("手机号已完善。");
      setPhoneDialogOpen(false);
      void refreshBilling(true);
      void refreshReferral(true);
    } catch (error) {
      setBindPhoneError(error instanceof Error ? error.message : "手机号验证失败。");
    } finally {
      setBindPhoneLoading(false);
    }
  }

  async function pollBatchJob(jobId: string, token = auth.token): Promise<void> {
    if (!token.trim() && !requireAuth("job")) {
      return;
    }
    const body = await fetchBatchJob(jobId, token);
    applyBatchJob(body, token);
  }

  async function fetchBatchJob(jobId: string, token = auth.token): Promise<EcommerceBatchGenerateResponse> {
    const response = await fetch(`${apiBaseUrl()}/api/ecommerce/images/batch-generate/${jobId}`, {
      headers: apiHeaders(false, token)
    });
    return (await parseResponseOrThrow(response)) as EcommerceBatchGenerateResponse;
  }

  async function waitForBatchJob(jobId: string, token = auth.token): Promise<EcommerceBatchGenerateResponse> {
    let body = await fetchBatchJob(jobId, token);
    while (body.status === "pending" || body.status === "running") {
      await delay(2200);
      body = await fetchBatchJob(jobId, token);
    }
    return body;
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
      const summaries = normalizeJobsResponse(body);

      const hydratedJobs = await Promise.all(
        summaries.slice(0, 12).map(async (job) => {
          try {
            return mergeHistoryJobDetails(job, await fetchBatchJob(job.id, token));
          } catch {
            return job;
          }
        })
      );

      setHistoryState((current) => ({
        ...current,
        data: summaries.map((job) => hydratedJobs.find((item) => item.id === job.id) ?? job),
        error: "",
        loading: false
      }));
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
    if (requiresPhoneVerification) {
      setPhoneDialogOpen(true);
      setBillingState((current) => ({ ...current, error: "", loading: false }));
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

  async function refreshReferral(authAlreadyChecked = false, token = auth.token): Promise<void> {
    if (!token.trim() && !authAlreadyChecked && !requireAuth("billing")) {
      return;
    }
    if (requiresPhoneVerification) {
      setPhoneDialogOpen(true);
      setReferralState((current) => ({ ...current, error: "", loading: false }));
      return;
    }
    setReferralState((current) => ({ ...current, error: "", loading: true }));
    try {
      const response = await fetch(`${apiBaseUrl()}/api/referral/summary`, {
        headers: apiHeaders(false, token)
      });
      const body = await parseResponseOrThrow(response);
      setReferralState({ data: normalizeReferralSummary(body), error: "", loading: false });
    } catch (error) {
      setReferralState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : "邀请信息读取失败。",
        loading: false
      }));
    }
  }

  async function copyInviteLink(): Promise<void> {
    const invite = referralState.data;
    const link = invite?.inviteUrl || (invite?.inviteCode ? `${apiBaseUrl().replace(/\/$/u, "")}/register?inviteCode=${encodeURIComponent(invite.inviteCode)}` : "");
    if (!link) {
      setReferralAction("邀请链接还没准备好，请刷新后再试。");
      return;
    }
    await navigator.clipboard.writeText(link);
    setReferralAction("邀请链接已复制。");
  }

  function openInviteDialog(): void {
    setInviteDialogOpen(true);
    setActiveTool("referral");
    setToolPanelOpen(true);
    void refreshReferral();
  }

  function closeInviteDialog(): void {
    setInviteDialogOpen(false);
  }

  function openInviteInPanel(): void {
    setInviteDialogOpen(false);
    setActiveTool("referral");
    setToolPanelOpen(true);
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
    if ((tab === "billing" || tab === "history" || tab === "stats" || tab === "referral") && !auth.token.trim()) {
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

  function openReferralCampaign(): void {
    openTool("referral");
  }

  function openQueuedJobHistory(): void {
    setQueuedJobDialog(null);
    openTool("history");
    window.requestAnimationFrame(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }));
  }

  function toolTitle(tab: ToolTab): string {
    if (tab === "account") return "账户";
    if (tab === "billing") return "套餐";
    if (tab === "history") return "任务";
    if (tab === "stats") return "统计概览";
    if (tab === "referral") return "邀请活动";
    return "关于";
  }

  function openReferralCampaignPage(): void {
    const inviteCode = referralState.data?.inviteCode || auth.user?.inviteCode;
    const url = inviteCode ? `${apiBaseUrl().replace(/\/$/u, "")}/register?inviteCode=${encodeURIComponent(inviteCode)}` : `${apiBaseUrl().replace(/\/$/u, "")}/register`;
    void chrome.tabs.create({ url });
  }

  function scrollToPanel(panelId: string): void {
    document.getElementById(panelId)?.scrollIntoView({ behavior: "smooth", block: "start" });
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

  function renderExtensionUpdateDialog(): JSX.Element | null {
    const update = extensionVersionState.update;
    if (!extensionUpdateDialogOpen || !update) {
      return null;
    }

    return (
      <div className="edit-modal" role="dialog" aria-modal="true" aria-labelledby="extension-update-title">
        <div className="edit-modal-card update-dialog-card">
          <div className="edit-modal-header">
            <div>
              <strong id="extension-update-title">发现插件新版本 v{update.version}</strong>
              <span>当前版本 v{extensionVersionState.currentVersion}，建议下载新版压缩包后重新加载插件。</span>
            </div>
            <button className="mini-button icon-mini" type="button" onClick={dismissExtensionUpdateDialog}>
              <X size={14} />
            </button>
          </div>
          {update.releaseNotes && update.releaseNotes.length > 0 ? (
            <ul className="version-notes update-dialog-notes">
              {update.releaseNotes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          ) : null}
          <div className="update-dialog-meta">
            <span>{extensionTarget() === "dev" ? "Dev" : "Prod"} 通道</span>
            <span>{formatBytes(update.sizeBytes)}</span>
          </div>
          <div className="edit-modal-actions">
            <button className="mini-button" type="button" onClick={dismissExtensionUpdateDialog}>
              稍后
            </button>
            <button className="primary-button" type="button" onClick={() => void downloadExtensionUpdateFromDialog()}>
              <Download size={15} />
              下载升级包
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderQueuedJobDialog(): JSX.Element | null {
    if (!queuedJobDialog) {
      return null;
    }

    return (
      <div className="edit-modal" role="dialog" aria-modal="true" aria-labelledby="queued-job-title">
        <div className="edit-modal-card queued-job-dialog-card">
          <div className="edit-modal-header">
            <div>
              <strong id="queued-job-title">任务已进入后端队列</strong>
              <span>按钮已释放，可以继续提交下一组；服务端会继续生成当前任务。</span>
            </div>
            <button className="mini-button icon-mini" type="button" onClick={() => setQueuedJobDialog(null)}>
              <X size={14} />
            </button>
          </div>
          <div className="queued-job-summary">
            <Loader2 className="spin" size={18} />
            <div>
              <strong>{queuedJobDialog.message}</strong>
              <span>
                {queuedJobDialog.completedScenes ?? 0}/{queuedJobDialog.totalScenes ?? effectiveSelectedScenes.length} 场景 · {queuedJobDialog.jobId}
              </span>
            </div>
          </div>
          <div className="edit-modal-actions">
            <button className="mini-button" type="button" onClick={() => setQueuedJobDialog(null)}>
              继续生成
            </button>
            <button className="primary-button" type="button" onClick={openQueuedJobHistory}>
              <Clock3 size={15} />
              查看历史任务
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

  function handleQueuedBatchJob(body: EcommerceBatchGenerateResponse, token = auth.token): void {
    applyBatchJob(body, token);
    setBatchGenerationLocked(false);
    setQueuedJobDialog({
      jobId: body.jobId,
      message: body.message || "批量任务已进入后端队列，服务端正在生成。",
      totalScenes: body.totalScenes,
      completedScenes: body.completedScenes
    });
    if (auth.token.trim() || token.trim()) {
      void refreshHistory(true, token);
      void refreshStats(true, token);
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
      const product: PageProductContext = context.product ?? { attributes: [] };
      setForm((current) => ({
        ...current,
        product: {
          ...current.product,
          title: context.title || current.product.title,
          description: product.description || current.product.description,
          targetCustomer: product.targetCustomer || current.product.targetCustomer,
          usageScene: product.usageScene || current.product.usageScene,
          material: product.material || current.product.material,
          color: product.color || current.product.color
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

  async function applySourceAspectSize(urls = selectedReferenceImageUrls, options: { force?: boolean } = {}): Promise<void> {
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
      setForm((current) => (options.force || current.sizeMode === "source" ? { ...current, size: nextSize } : current));
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

  async function sizeFromSourceUrl(url: string): Promise<{ width: number; height: number }> {
    const image = await imageFromUrl(url);
    return sizeFromImageAspect(image.naturalWidth, image.naturalHeight);
  }

  function toggleReferenceImage(url: string): void {
    setForm((current) => {
      const exists = current.referenceImageUrls.includes(url);
      const nextUrls = exists
        ? current.referenceImageUrls.filter((item) => item !== url)
        : [...current.referenceImageUrls, url].slice(-MAX_REFERENCE_IMAGE_COUNT);
      return {
        ...current,
        referenceImageUrl: nextUrls[0] ?? "",
        referenceImageUrls: nextUrls
      };
    });
  }

  function updateTextReplacementMode(value: string): void {
    if (value === "replace") {
      setForm((current) => ({
        ...current,
        textLanguage: current.textLanguage === "none" ? "ko" : current.textLanguage,
        sceneTemplateIds: ["logo-benefit"],
        sizeMode: "source",
        countPerScene: 1
      }));
      void applySourceAspectSize(selectedReferenceImageUrls, { force: true });
      return;
    }

    setForm((current) => ({
      ...current,
      textLanguage: "none"
    }));
  }

  function categoryKitDirection(kit: BatchFormState["categoryKit"]): string {
    const stylePrompt = categoryKitStyleOptions.find((item) => item.id === kit.targetStyle)?.prompt ?? "";
    const copyRule = kit.polishCopy
      ? "Use Polish copy only on non-main images where the template allows text. Main images must have no text."
      : "Do not add Polish copy or marketing text unless the scene is a required size or care guide.";
    const modelRule = kit.allowModelImages
      ? "Model images are allowed only after the main images; avoid identifiable faces and prefer neck-down or detail crops."
      : "Do not create model-worn images; replace model scenes with faceless product-only usage details.";
    const packageRule = kit.hasPackaging
      ? "Packaging is available; show gift packaging only when useful and keep it realistic."
      : "No real packaging is provided; do not invent gift boxes, branded bags, tags, or packaging.";

    return [
      "Category kit: Allegro Poland scarf / silk scarf listing image kit.",
      "Allegro compliance: first image candidates must use white or very light gray background, no text, no icons, no borders, no shop logo, no watermark, one sellable scarf only, square marketplace thumbnail composition.",
      "Recommended output target: square 2000 x 2000 or 2560 x 2560 look, within Allegro's image upload constraints.",
      "If a person appears in later images, avoid identifiable faces because images with recognized faces may be excluded from Allegro Product Catalog.",
      `Scarf size: ${kit.scarfSize.trim() || "not provided"}.`,
      `Material: ${form.product.material?.trim() || "use product material if visible from reference"}.`,
      `Color / SKU count: ${kit.skuCount.trim() || "1"}.`,
      `Target style: ${stylePrompt}.`,
      copyRule,
      modelRule,
      packageRule
    ].join("\n");
  }

  function updateCategoryKit(patch: Partial<BatchFormState["categoryKit"]>): void {
    setForm((current) => {
      const nextKit = { ...current.categoryKit, ...patch };
      const nextScenes = patch.kitVersion ? categoryKitScenesByVersion[nextKit.kitVersion] : current.sceneTemplateIds;
      return {
        ...current,
        categoryKit: nextKit,
        countPerScene: 1,
        sceneTemplateIds: nextScenes
      };
    });
  }

  function inferMarketingMainExpression(category: string): string {
    const value = category.trim().toLowerCase();
    if (!value) {
      return "Autonomously decide the strongest visual expression from the product category and reference images.";
    }
    if (/(服装|女装|男装|童装|连衣裙|衬衫|外套|内衣|apparel|clothing|dress|shirt|coat)/i.test(value)) {
      return "Show the garment worn on a suitable model or body crop when possible; make fit, drape, fabric, and style instantly visible.";
    }
    if (/(鞋|靴|运动鞋|凉鞋|拖鞋|shoe|sneaker|boot|sandals?)/i.test(value)) {
      return "Show the shoe or boot worn on foot, with a secondary clear product angle if useful; emphasize foot comfort, shape, sole, and outfit context.";
    }
    if (/(茶|茶叶|乌龙|普洱|绿茶|红茶|tea|oolong|pu.?erh|matcha)/i.test(value)) {
      return "Show both the real package or loose tea and the brewed tea liquor; use a tea cup, gaiwan, glass cup, or gongfu tea vessel when it matches the product grade.";
    }
    if (/(食品|零食|饮料|咖啡|酒|food|snack|drink|coffee|wine)/i.test(value)) {
      return "Show the edible or drinkable prepared state together with the package, so the taste, freshness, portion, and consumption scene are immediately understandable.";
    }
    if (/(礼品|礼盒|gift|present)/i.test(value)) {
      return "Show a believable gifting scenario, recipient context, and packaging only when real packaging is provided or described.";
    }
    if (/(护肤|美妆|彩妆|香水|beauty|skincare|makeup|perfume)/i.test(value)) {
      return "Show the product texture, application result, premium bottle or package, and target-user beauty routine without fake before-after medical claims.";
    }
    if (/(家居|收纳|家具|床品|home|furniture|storage|bedding)/i.test(value)) {
      return "Show the product in a real home scenario with scale, placement, texture, and before-use clarity.";
    }
    return "Autonomously choose product-only, in-use, model-worn, prepared-state, detail, or scene expression according to what would make the category easiest to understand and most clickable.";
  }

  function marketingMainToneLabel(tone: BatchFormState["marketingMain"]["copyTone"]): string {
    if (tone === "direct") return "direct value-focused domestic marketplace copy";
    if (tone === "premium") return "premium, restrained, trustworthy copy";
    if (tone === "gift") return "gift-oriented warm copy";
    if (tone === "young") return "younger trend-aware copy";
    if (tone === "elder") return "clear respectful copy suitable for older recipients or family gifting";
    return "auto-select copy tone from target customer, platform, category, and scene";
  }

  function marketingMainDirection(marketingMain: BatchFormState["marketingMain"]): string {
    const category = marketingMain.category.trim();
    const expression = marketingMain.productExpression.trim() || inferMarketingMainExpression(category || form.product.title);
    const supportPoints = marketingMain.supportPoints.map((point) => point.trim()).filter(Boolean);
    const targetCustomer = marketingMain.targetCustomer.trim() || form.product.targetCustomer?.trim() || "infer from product title, price cues, category, and usage context";
    const usageScene = marketingMain.usageScene.trim() || form.product.usageScene?.trim() || "infer the most clickable purchase or usage scenario";
    const primaryHook = marketingMain.primaryHook.trim() || "infer one strongest buying reason from product title, description, visible reference, and selling points";
    const trustBadges = marketingMain.trustBadges.trim() || "none provided; do not invent official, certification, platform, or service badges";
    const peopleRule = marketingMain.allowPeople
      ? "People, body parts, or model-worn presentation are allowed when category-appropriate; keep anatomy natural and product truthful."
      : "Do not add people, faces, hands, or body parts; express usage through product, scene, props, and copy.";
    const preparedRule = marketingMain.allowPreparedState
      ? "Prepared or usage-result state is allowed when category-appropriate, such as brewed tea, plated food, opened package, texture swatch, worn shoes, or assembled product."
      : "Do not show a prepared or transformed state unless it is already visible in the reference image.";
    const sceneRule = marketingMain.allowSceneProps
      ? "Scene props are allowed only to clarify customer, usage, season, gift, travel, party, home, commute, or outdoor context; do not let props steal attention."
      : "Use a clean product-led composition with minimal or no scene props.";

    return [
      "Marketing main image methodology for domestic Chinese e-commerce:",
      "Start by deciding how the product should be expressed: product itself, on-model/worn, in-use, prepared state, detail proof, packaging, gift state, or scene outcome.",
      "Then define the target customer, usage or gifting scenario, one strongest click hook, visual proof, concise selling copy, and optional trust/service badges.",
      "Element priority: product clarity first; then target customer fit; then scene and purchase occasion; then strongest selling point; then trust, promo, service, corner badge, package, or official mark only if explicitly supported.",
      `Product category: ${category || "infer from title and reference image"}.`,
      `Recommended product expression: ${expression}.`,
      `Target customer: ${targetCustomer}.`,
      `Usage / purchase scene: ${usageScene}.`,
      `Primary click hook: ${primaryHook}.`,
      supportPoints.length ? `Supporting selling points: ${supportPoints.join("; ")}.` : "Supporting selling points: infer 2-3 concise, non-exaggerated points only from provided product info and visible reference.",
      `Trust / promo / service badges explicitly allowed: ${trustBadges}.`,
      `Copy tone: ${marketingMainToneLabel(marketingMain.copyTone)}.`,
      peopleRule,
      preparedRule,
      sceneRule,
      "Thumbnail rule: design for search-feed click-through. The product must be recognizable at small size, text must be large and short, composition should have strong contrast and clear hierarchy.",
      "Compliance rule: do not invent absolute claims, medical efficacy, ranking, fake official status, fake platform badge, fake certification, counterfeit logo, celebrity, or unsupported discount."
    ].join("\n");
  }

  function updateMarketingMain(patch: Partial<BatchFormState["marketingMain"]>): void {
    setForm((current) => ({
      ...current,
      marketingMain: {
        ...current.marketingMain,
        ...patch
      }
    }));
  }

  function updateMarketingSupportPoint(index: number, value: string): void {
    setForm((current) => {
      const supportPoints = [...current.marketingMain.supportPoints];
      supportPoints[index] = value;
      return {
        ...current,
        marketingMain: {
          ...current.marketingMain,
          supportPoints
        }
      };
    });
  }

  async function uploadReferenceImages(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    try {
      const maxReferenceImages = MAX_REFERENCE_IMAGE_COUNT;
      const files = Array.from(event.target.files ?? []).filter((file) => file.type.startsWith("image/")).slice(0, maxReferenceImages);
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
        const nextUrls = [...uploadedImages.map((image) => image.dataUrl), ...current.referenceImageUrls].slice(0, maxReferenceImages);
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

  async function uploadTranslationImages(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    try {
      const files = Array.from(event.currentTarget.files ?? []).filter((file) => file.type.startsWith("image/")).slice(0, 12);
      event.currentTarget.value = "";
      if (files.length === 0) {
        return;
      }

      const uploadedImages = await Promise.all(
        files.map(async (file) => {
          if (file.size > 50 * 1024 * 1024) {
            throw new Error("上传图片超过 50MB，请换一张较小的图片。");
          }
          return {
            id: createClientId(),
            dataUrl: await blobToDataUrl(file, "上传图片转换失败。"),
            fileName: file.name || "uploaded-image.png"
          } satisfies UploadedReferenceImage;
        })
      );
      setUploadedReferenceImages((current) => [...uploadedImages, ...current].slice(0, 24));
      setTranslationImageUrls((current) => [...uploadedImages.map((image) => image.dataUrl), ...current].filter(Boolean).slice(0, 24));
      setTask((current) => ({
        ...current,
        message: `已上传 ${uploadedImages.length} 张图片，可直接逐张翻译。`
      }));
    } catch (error) {
      setTask((current) => ({
        ...current,
        message: error instanceof Error ? error.message : "上传翻译图片失败。"
      }));
    }
  }

  function toggleTranslationImage(url: string): void {
    setTranslationImageUrls((current) => {
      const exists = current.includes(url);
      return exists ? current.filter((item) => item !== url) : [...current, url];
    });
  }

  function selectAllTranslationImages(): void {
    const urls = [...uploadedReferenceImages.map((image) => image.dataUrl), ...pageImageUrls];
    setTranslationImageUrls(Array.from(new Set(urls)).slice(0, 24));
  }

  function clearTranslationImages(): void {
    setTranslationImageUrls([]);
  }

  function openTextTranslationPage(): void {
    setTranslationReturnMode(form.generationMode === "text-translation" ? "enhance" : form.generationMode);
    setForm((current) => ({
      ...current,
      generationMode: "text-translation",
      sceneTemplateIds: defaultSceneIdsByMode["text-translation"],
      textLanguage: current.textLanguage === "none" ? "ko" : current.textLanguage,
      allowTextRecreation: true,
      removeWatermarkAndLogo: true,
      sizeMode: "source",
      countPerScene: 1,
      stylePresetId: "product"
    }));
    setTranslationImageUrls((current) => {
      if (current.length > 0) {
        return current;
      }
      if (selectedReferenceImageUrls.length > 0) {
        return selectedReferenceImageUrls;
      }
      return pageImageUrls.slice(0, 1);
    });
    setTextTranslationViewOpen(true);
    setWorksViewOpen(false);
    setToolPanelOpen(false);
    setHiddenResultKeys(new Set());
    setLocalResultRecords([]);
    setTask({
      id: "text-translation",
      status: "idle",
      message: "选择多张图片后，会逐张翻译并分别返回结果。",
      records: []
    });
  }

  function closeTextTranslationPage(): void {
    setTextTranslationViewOpen(false);
    setForm((current) =>
      current.generationMode === "text-translation"
        ? {
            ...current,
            generationMode: translationReturnMode,
            sceneTemplateIds: defaultSceneIdsByMode[translationReturnMode],
            textLanguage: translationReturnMode === "category-kit" ? "pl" : "none"
          }
        : current
    );
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

  function uniqueArchiveFileName(fileName: string, usedNames: Set<string>): string {
    const index = fileName.lastIndexOf(".");
    const baseName = index > 0 ? fileName.slice(0, index) : fileName;
    const extension = index > 0 ? fileName.slice(index) : "";
    let attempt = fileName;
    let counter = 2;
    while (usedNames.has(attempt)) {
      attempt = `${baseName}-${counter}${extension}`;
      counter += 1;
    }
    usedNames.add(attempt);
    return attempt;
  }

  async function downloadTranslationArchive(): Promise<void> {
    if (resultImages.length === 0) {
      setTask((current) => ({ ...current, message: "没有可打包的翻译结果。" }));
      return;
    }

    setZipDownloadLoading(true);
    try {
      const usedNames = new Set<string>();
      const files = await Promise.all(
        resultImages.map(async (item, index) => {
          const response = await fetch(assetDownloadUrl(item.asset));
          if (!response.ok) {
            throw new Error("打包下载时读取图片失败。");
          }
          const blob = await response.blob();
          const fileName = uniqueArchiveFileName(item.asset.fileName || `translation-${index + 1}.png`, usedNames);
          return { name: fileName, blob };
        })
      );
      const zipBlob = await createZipBlob(files);
      downloadBlob(zipBlob, `text-translation-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.zip`);
    } catch (error) {
      setTask((current) => ({
        ...current,
        message: error instanceof Error ? error.message : "一键打包下载失败。"
      }));
    } finally {
      setZipDownloadLoading(false);
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

  function updatePlatform(platform: BatchFormState["platform"]): void {
    const isChinesePlatform = CHINESE_ECOMMERCE_PLATFORM_IDS.has(platform);
    setForm((current) => ({
      ...current,
      platform,
      market: isChinesePlatform ? "cn" : current.market,
      textLanguage: isChinesePlatform && current.textLanguage === "none" ? "zh-hans" : current.textLanguage
    }));
  }

  function updateGenerationMode(generationMode: EcommerceGenerationMode): void {
    setForm((current) => ({
      ...current,
      generationMode,
      sceneTemplateIds: defaultSceneIdsByMode[generationMode],
      platform: generationMode === "category-kit" ? "allegro" : current.platform,
      market: generationMode === "category-kit" ? "pl" : generationMode === "marketing-main" ? "cn" : current.market,
      sizeMode: generationMode === "category-kit" ? "preset" : current.sizeMode,
      size: generationMode === "category-kit" ? { width: 2048, height: 2048 } : generationMode === "marketing-main" ? { width: 1024, height: 1024 } : current.size,
      countPerScene: generationMode === "category-kit" ? 1 : current.countPerScene,
      stylePresetId: generationMode === "enhance" || generationMode === "category-kit" || generationMode === "marketing-main" || generationMode === "text-translation" ? "product" : "photoreal",
      textLanguage:
        generationMode === "enhance"
          ? "none"
          : generationMode === "category-kit"
            ? "pl"
            : generationMode === "marketing-main"
              ? "zh-hans"
              : generationMode === "text-translation"
                ? current.textLanguage === "none"
                  ? "ko"
                  : current.textLanguage
                : "none",
      allowTextRecreation: true,
      removeWatermarkAndLogo: generationMode === "enhance" ? current.removeWatermarkAndLogo : true
    }));
    setTask((current) => ({
      ...current,
      message:
        generationMode === "enhance"
          ? "原图增强会优先保留商品原貌。"
          : generationMode === "category-kit"
            ? "品类套图会按 Allegro 丝巾类目生成整套上架图片。"
            : generationMode === "marketing-main"
              ? "营销主图会按产品表达、人群、场景、卖点和信任元素生成点击主图。"
            : generationMode === "text-translation"
              ? "文字翻译会逐张输出，每张图都会单独翻译并返回。"
            : "场景创作会依据主图重建营销场景。"
    }));
  }

  async function submitBatch(authAlreadyChecked = false, token = auth.token): Promise<void> {
    if (batchGenerationLocked) {
      return;
    }
    if (!token.trim() && !authAlreadyChecked && !requireAuth("generate")) {
      return;
    }
    const title = form.product.title.trim();
    if (!title) {
      setTask({ id: "validation", status: "failed", message: "请先填写商品标题。", records: [] });
      return;
    }
    if ((form.generationMode === "enhance" || form.generationMode === "category-kit" || form.generationMode === "marketing-main") && selectedReferenceImageUrls.length === 0) {
      setTask({ id: "validation", status: "failed", message: "当前模式需要参考图 URL，请先读取商品页、选择候选图，或手动上传商品主图。", records: [] });
      return;
    }

    const taskId = createClientId();
    const effectiveExtraDirection = [
      form.extraDirection.trim(),
      form.generationMode === "category-kit" ? categoryKitDirection(form.categoryKit) : "",
      form.generationMode === "marketing-main" ? marketingMainDirection(form.marketingMain) : ""
    ]
      .filter(Boolean)
      .join("\n\n");
    setBatchGenerationLocked(true);
    setHiddenResultKeys(new Set());
    setLocalResultRecords([]);
    setTask({
      id: taskId,
      status: "running",
      message: selectedReferenceImageUrls.length > 0 ? "正在读取参考图并提交批量生成任务。" : "正在提交批量生成任务。",
      records: []
    });

    const fallbackRecords = effectiveSelectedScenes.map((scene): GenerationRecord => ({
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
        extraDirection: effectiveExtraDirection
      }),
      effectivePrompt: scene.prompt,
      presetId: form.stylePresetId,
      size: form.size,
      quality: form.quality,
      outputFormat: form.outputFormat,
      count: effectiveCountPerScene,
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
          sceneTemplateIds: effectiveSceneTemplateIds,
          sourcePageUrl: pageContext?.url,
          size: form.size,
          stylePresetId: form.stylePresetId,
          quality: form.quality,
          outputFormat: form.outputFormat,
          countPerScene: effectiveCountPerScene,
          referenceImage,
          extraDirection: effectiveExtraDirection
        })
      });

      const body = (await parseResponseOrThrow(response)) as EcommerceBatchGenerateResponse;
      handleQueuedBatchJob(body, token);
    } catch (error) {
      setTask({
        id: taskId,
        status: "failed",
        message: error instanceof Error ? `${error.message} 已在本地生成场景 prompt 草稿。` : "后端批量接口暂不可用，已在本地生成场景 prompt 草稿。",
        records: fallbackRecords
      });
      setBatchGenerationLocked(false);
    }
  }

  async function submitTextTranslationBatch(authAlreadyChecked = false, token = auth.token): Promise<void> {
    if (batchGenerationLocked) {
      return;
    }
    if (!token.trim() && !authAlreadyChecked && !requireAuth("generate")) {
      return;
    }
    if (selectedTranslationImageUrls.length === 0) {
      setTask({ id: "validation", status: "failed", message: "请先选择至少一张待翻译图片。", records: [] });
      return;
    }

    const taskId = createClientId();
    const targetLanguage = form.textLanguage === "none" ? "ko" : form.textLanguage;
    const translatedRecordsByIndex: GenerationRecord[][] = selectedTranslationImageUrls.map(() => []);
    let completedCount = 0;
    let failedImageCount = 0;
    setBatchGenerationLocked(true);
    setHiddenResultKeys(new Set());
    setLocalResultRecords([]);
    setTask({
      id: taskId,
      status: "running",
      message: `正在翻译 ${selectedTranslationImageUrls.length} 张图片，最多 ${TEXT_TRANSLATION_CONCURRENCY} 张并发。`,
      records: [],
      totalScenes: selectedTranslationImageUrls.length,
      completedScenes: 0
    });

    try {
      await mapWithConcurrency(selectedTranslationImageUrls, TEXT_TRANSLATION_CONCURRENCY, async (sourceUrl, index) => {
        try {
          const referenceImage = await referenceImageFromSources([sourceUrl]);
          if (!referenceImage) {
            throw new Error("翻译参考图读取失败。");
          }
          const size = form.sizeMode === "source" ? await sizeFromSourceUrl(sourceUrl) : form.size;
          const requestProduct = {
            ...form.product,
            title: form.product.title.trim() || `文字翻译 ${index + 1}`
          };
          const response = await fetch(`${apiBaseUrl()}/api/ecommerce/images/batch-generate`, {
            method: "POST",
            headers: apiHeaders(true, token),
            body: JSON.stringify({
              product: requestProduct,
              platform: form.platform,
              market: form.market,
              textLanguage: targetLanguage,
              allowTextRecreation: form.allowTextRecreation,
              removeWatermarkAndLogo: form.removeWatermarkAndLogo,
              sceneTemplateIds: [TEXT_TRANSLATION_SCENE_ID],
              size,
              stylePresetId: "product",
              quality: form.quality,
              outputFormat: form.outputFormat,
              countPerScene: 1,
              referenceImage,
              extraDirection: [form.extraDirection.trim(), `Source image ${index + 1}/${selectedTranslationImageUrls.length}`].filter(Boolean).join("\n\n")
            })
          });
          const body = (await parseResponseOrThrow(response)) as EcommerceBatchGenerateResponse;
          const finishedJob = await waitForBatchJob(body.jobId, token);
          translatedRecordsByIndex[index] = finishedJob.records;
          if (finishedJob.status === "failed") {
            failedImageCount += 1;
          }
        } catch (error) {
          failedImageCount += 1;
          translatedRecordsByIndex[index] = [
            {
              id: `${taskId}-${index + 1}-failed`,
              mode: "edit",
              prompt: composeEcommercePrompt({
                product: {
                  ...form.product,
                  title: form.product.title.trim() || `文字翻译 ${index + 1}`
                },
                platform: form.platform,
                market: form.market,
                textLanguage: targetLanguage,
                allowTextRecreation: form.allowTextRecreation,
                removeWatermarkAndLogo: form.removeWatermarkAndLogo,
                sceneTemplateId: TEXT_TRANSLATION_SCENE_ID,
                extraDirection: form.extraDirection
              }),
              effectivePrompt: "",
              presetId: "product",
              size: form.size,
              quality: form.quality,
              outputFormat: form.outputFormat,
              count: 1,
              status: "failed",
              error: error instanceof Error ? error.message : "文字翻译失败。",
              createdAt: new Date().toISOString(),
              outputs: [
                {
                  id: `${taskId}-${index + 1}-failed-output`,
                  status: "failed",
                  error: error instanceof Error ? error.message : "文字翻译失败。"
                }
              ]
            }
          ];
        } finally {
          completedCount += 1;
          setTask((current) => ({
            ...current,
            status: "running",
            message: `已完成 ${completedCount}/${selectedTranslationImageUrls.length} 张图片翻译，${Math.min(TEXT_TRANSLATION_CONCURRENCY, selectedTranslationImageUrls.length)} 张并发处理中。`,
            records: translatedRecordsByIndex.flat(),
            completedScenes: completedCount,
            totalScenes: selectedTranslationImageUrls.length
          }));
        }
      });

      const translatedRecords = translatedRecordsByIndex.flat();
      const finalStatus =
        failedImageCount === 0 ? "succeeded" : failedImageCount === selectedTranslationImageUrls.length ? "failed" : "partial";
      setTask({
        id: taskId,
        status: finalStatus,
        message:
          finalStatus === "succeeded"
            ? `已完成 ${selectedTranslationImageUrls.length} 张图片翻译，可一键打包下载。`
            : `已完成 ${selectedTranslationImageUrls.length} 张图片翻译，其中 ${failedImageCount} 张失败。`,
        records: translatedRecords,
        totalScenes: selectedTranslationImageUrls.length,
        completedScenes: selectedTranslationImageUrls.length
      });
    } catch (error) {
      setTask({
        id: taskId,
        status: "failed",
        message: error instanceof Error ? error.message : "文字翻译失败，请稍后重试。",
        records: translatedRecordsByIndex.flat(),
        totalScenes: selectedTranslationImageUrls.length,
        completedScenes: completedCount
      });
    } finally {
      setBatchGenerationLocked(false);
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

  if (textTranslationViewOpen) {
    return (
      <main className="app-shell">
        <header className="topbar works-topbar">
          <div>
            <p className="eyebrow">Text translation</p>
            <h1>文字翻译</h1>
          </div>
          <button className="secondary-button" type="button" onClick={() => closeTextTranslationPage()}>
            <ArrowLeft size={15} />
            返回
          </button>
        </header>

        <section className="panel page-panel">
          <div>
            <h2>当前页面</h2>
            <p>{pageContext?.url ?? "可从商品页自动读取图片，也可以手动上传多张图片。"}</p>
            {pageContext ? <span>{pageImageUrls.length > 0 ? `${pageImageUrls.length} 张候选图可选` : "未发现候选图"}</span> : null}
          </div>
          <button className="secondary-button" type="button" onClick={() => void refreshPageContext()}>
            <RefreshCw size={15} />
            读取
          </button>
        </section>

        <section className="panel">
          <h2>翻译设置</h2>
          <div className="two-col">
            <label>
              <span>目标语言</span>
              <select
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
                value={form.allowTextRecreation ? "yes" : "no"}
                onChange={(event) => setForm({ ...form, allowTextRecreation: event.target.value === "yes" })}
              >
                <option value="yes">是，允许润色重排</option>
                <option value="no">否，尽量逐字保留</option>
              </select>
            </label>
          </div>
        </section>

        <section className="panel reference-panel">
          <div className="reference-upload-row translation-upload-row">
            <label className="mini-button reference-upload-button">
              <Upload size={13} />
              上传图片
              <input accept="image/*" multiple type="file" onChange={(event) => void uploadTranslationImages(event)} />
            </label>
            <span>支持多选，每张图会单独翻译并分别返回。</span>
          </div>
          {referenceImageOptions.length > 0 ? (
            <div className="reference-image-picker" aria-label="待翻译图片候选">
              <div className="reference-image-picker-header">
                <strong>选择待翻译图片</strong>
                <span>已选 {selectedTranslationImageUrls.length} 张</span>
              </div>
              <div className="translation-picker-actions">
                <button className="mini-button" type="button" onClick={() => selectAllTranslationImages()}>全选</button>
                <button className="mini-button" type="button" onClick={() => clearTranslationImages()}>清空</button>
              </div>
              <div className="reference-image-grid">
                {referenceImageOptions.map((item, index) => (
                  <button
                    className={selectedTranslationImageUrls.includes(item.url) ? "reference-image-option active" : "reference-image-option"}
                    key={item.key}
                    title={item.label}
                    type="button"
                    onClick={() => toggleTranslationImage(item.url)}
                  >
                    <img alt={item.uploaded ? item.label : `候选商品图 ${index + 1}`} loading="lazy" src={item.url} />
                    {selectedTranslationImageUrls.includes(item.url) ? <CheckCircle2 size={16} /> : null}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="reference-image-empty">
              <ImageIcon size={15} />
              <span>读取当前页或上传图片后，这里会显示待翻译图片。</span>
            </div>
          )}
        </section>

        <section className="sticky-actions">
          <div>
            <strong>{selectedTranslationImageUrls.length}</strong>
            <span>
              {task.status === "pending" || task.status === "running"
                ? `${task.completedScenes ?? 0}/${task.totalScenes ?? selectedTranslationImageUrls.length} 张`
                : "待翻译图片"}
            </span>
          </div>
          <button className="primary-button" disabled={batchGenerationLocked} type="button" onClick={() => void submitTextTranslationBatch()}>
            {batchGenerationLocked ? <Loader2 className="spin" size={17} /> : <Languages size={17} />}
            开始翻译
          </button>
        </section>

        <section className="panel results-panel">
          <div className={`status status-${task.status}`}>
            {task.status === "succeeded" ? <CheckCircle2 size={16} /> : task.status === "running" ? <Loader2 className="spin" size={16} /> : <Sparkles size={16} />}
            {task.message}
          </div>
          {renderResultImages(task.status === "running" ? "翻译完成后会逐张显示在这里。" : "翻译结果会显示在这里。")}
          {resultImages.length > 0 ? (
            <div className="translation-download-row">
              <button className="primary-button archive-download-button" disabled={zipDownloadLoading} type="button" onClick={() => void downloadTranslationArchive()}>
                {zipDownloadLoading ? <Loader2 className="spin" size={15} /> : <Download size={15} />}
                一键打包下载
              </button>
            </div>
          ) : null}
        </section>

        {renderEditDialog()}
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">电商图片AI助手</p>
          <h1>商图AI助手</h1>
        </div>
        <div className="topbar-actions">
          {extensionVersionState.update ? (
            <button className="update-badge" title={`发现新版本 ${extensionVersionState.update.version}`} type="button" onClick={() => openTool("about")}>
              <Download size={14} />
              <span>升级</span>
            </button>
          ) : null}
          <button className="plan-badge" title="查看套餐" type="button" onClick={() => openTool("billing")}>
            <Package size={14} />
            <span>{currentPlanLabel}</span>
          </button>
          <button className="icon-button" title="账户" type="button" onClick={() => openTool("account")}>
            <UserCircle2 size={18} />
          </button>
        </div>
      </header>

      <section className="panel page-panel" id="page-context-panel">
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

      <section className="panel reference-panel" id="reference-panel">
        <div className="reference-image-field reference-image-field-standalone">
          <label>
            <span>{form.generationMode === "creative" ? "商品主图 URL" : "商品主图 URL（必填）"}</span>
            <input value={form.referenceImageUrl} onChange={(event) => updateReferenceImageUrl(event.target.value)} />
          </label>
          <div className="reference-upload-row">
            <label className="mini-button reference-upload-button">
              <Upload size={13} />
              上传图片
              <input accept="image/*" multiple type="file" onChange={(event) => void uploadReferenceImages(event)} />
            </label>
            <span>可选 1-3 张，作为不同角度的出图参考。</span>
          </div>
          {referenceImageOptions.length > 0 ? (
            <div className="reference-image-picker" aria-label="商品主图候选">
              <div className="reference-image-picker-header">
                <strong>从当前页图片选择参考图</strong>
                <span>已选 {selectedReferenceImageUrls.length}/{maxReferenceImageCount} 张，超出会替换最早选择</span>
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

      <section className="panel" id="product-panel">
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
        <div className="two-col">
          <label>
            <span>材质</span>
            <input placeholder="例如 silk / satin / polyester" value={form.product.material ?? ""} onChange={(event) => updateProduct({ material: event.target.value })} />
          </label>
          <label>
            <span>颜色/SKU</span>
            <input placeholder="例如 navy floral, beige, 3 colors" value={form.product.color ?? ""} onChange={(event) => updateProduct({ color: event.target.value })} />
          </label>
        </div>
      </section>

      <section className="panel" id="market-panel">
        <h2>平台与市场</h2>
        <div className="two-col">
          <label>
            <span>平台</span>
            <select value={form.platform} onChange={(event) => updatePlatform(event.target.value as BatchFormState["platform"])}>
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

      <section className="panel" id="generation-mode-panel">
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
        <button className="translation-entry" type="button" onClick={() => openTextTranslationPage()}>
          <Languages size={18} />
          <div>
            <strong>{textTranslationMode.label}</strong>
            <span>{textTranslationMode.hint}</span>
          </div>
        </button>
      </section>

      {form.generationMode === "category-kit" ? (
        <section className="panel category-kit-panel" id="scene-panel">
          <div className="kit-heading">
            <div>
              <h2>配饰-丝巾类目套图</h2>
              <p>Allegro Poland Listing Image Kit：第一张严格合规，后续图片负责点击率和转化。</p>
            </div>
            <span>{effectiveSelectedScenes.length} 张</span>
          </div>
          <label>
            <span>套图版本</span>
            <select value={form.categoryKit.kitVersion} onChange={(event) => updateCategoryKit({ kitVersion: event.target.value as CategoryKitVersion })}>
              {categoryKitVersionOptions.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </label>
          <p className="kit-version-hint">
            {categoryKitVersionOptions.find((item) => item.id === form.categoryKit.kitVersion)?.hint}
          </p>
          <div className="two-col">
            <label>
              <span>丝巾尺寸</span>
              <input value={form.categoryKit.scarfSize} onChange={(event) => updateCategoryKit({ scarfSize: event.target.value })} />
            </label>
            <label>
              <span>颜色/SKU 数量</span>
              <input inputMode="numeric" value={form.categoryKit.skuCount} onChange={(event) => updateCategoryKit({ skuCount: event.target.value })} />
            </label>
          </div>
          <label>
            <span>目标风格</span>
            <select value={form.categoryKit.targetStyle} onChange={(event) => updateCategoryKit({ targetStyle: event.target.value as CategoryKitStyle })}>
              {categoryKitStyleOptions.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </label>
          <div className="kit-toggle-list">
            <label className="checkbox-row">
              <input checked={form.categoryKit.hasPackaging} type="checkbox" onChange={(event) => updateCategoryKit({ hasPackaging: event.target.checked })} />
              <span>有真实包装，可生成包装/礼品图</span>
            </label>
            <label className="checkbox-row">
              <input checked={form.categoryKit.allowModelImages} type="checkbox" onChange={(event) => updateCategoryKit({ allowModelImages: event.target.checked })} />
              <span>允许模特图（默认无明显正脸）</span>
            </label>
            <label className="checkbox-row">
              <input checked={form.categoryKit.polishCopy} type="checkbox" onChange={(event) => updateCategoryKit({ polishCopy: event.target.checked })} />
              <span>需要波兰语文案（不用于第 1 图）</span>
            </label>
          </div>
          <div className="scene-grid kit-scene-grid">
            {effectiveSelectedScenes.map((scene) => (
              <div className="scene-button active kit-scene-item" key={scene.id}>
                <Wand2 size={15} />
                {scene.label}
              </div>
            ))}
          </div>
        </section>
      ) : form.generationMode === "marketing-main" ? (
        <section className="panel marketing-main-panel" id="scene-panel">
          <div className="kit-heading">
            <div>
              <h2>营销主图方法论</h2>
              <p>先判断产品如何表达，再定义人群、场景、点击理由和可信元素；留空项会自主判断改写。</p>
            </div>
            <span>{effectiveSelectedScenes.length} 版</span>
          </div>
          <div className="methodology-grid">
            <div><strong>产品</strong><span>单品、穿戴、冲泡、食用、开箱、细节或包装。</span></div>
            <div><strong>人群</strong><span>年轻女性、学生、老师、长辈、宝妈、商务人群等。</span></div>
            <div><strong>场景</strong><span>送礼、通勤、旅行、聚会、居家、户外、节日等。</span></div>
            <div><strong>卖点</strong><span>为什么现在点进来：材质、效果、舒适、礼品、服务。</span></div>
          </div>
          <div className="two-col">
            <label>
              <span>产品类目</span>
              <input placeholder="例如 女装 / 茶叶 / 雪地靴 / 礼盒" value={form.marketingMain.category} onChange={(event) => updateMarketingMain({ category: event.target.value })} />
            </label>
            <label>
              <span>文案语气</span>
              <select value={form.marketingMain.copyTone} onChange={(event) => updateMarketingMain({ copyTone: event.target.value as BatchFormState["marketingMain"]["copyTone"] })}>
                <option value="auto">自动判断</option>
                <option value="direct">直接利益点</option>
                <option value="premium">高级质感</option>
                <option value="gift">送礼温暖</option>
                <option value="young">年轻潮流</option>
                <option value="elder">长辈友好</option>
              </select>
            </label>
          </div>
          <label>
            <span>产品如何表达</span>
            <textarea
              placeholder="可留空自动判断。例如：服装穿在模特身上；茶要有泡好的茶汤和功夫碗；鞋靴穿脚上并展示鞋底。"
              rows={3}
              value={form.marketingMain.productExpression}
              onChange={(event) => updateMarketingMain({ productExpression: event.target.value })}
            />
          </label>
          <div className="two-col">
            <label>
              <span>目标人群</span>
              <input placeholder="例如 年轻女性 / 老师 / 长辈 / 新手妈妈" value={form.marketingMain.targetCustomer} onChange={(event) => updateMarketingMain({ targetCustomer: event.target.value })} />
            </label>
            <label>
              <span>核心场景</span>
              <input placeholder="例如 送礼 / 外出旅游 / 聚会 / 通勤" value={form.marketingMain.usageScene} onChange={(event) => updateMarketingMain({ usageScene: event.target.value })} />
            </label>
          </div>
          <label>
            <span>主卖点 / 点击理由</span>
            <input placeholder="一句话说明为什么买；留空则结合商品信息自动提炼" value={form.marketingMain.primaryHook} onChange={(event) => updateMarketingMain({ primaryHook: event.target.value })} />
          </label>
          <div className="three-col">
            {form.marketingMain.supportPoints.map((point, index) => (
              <label key={index}>
                <span>辅助卖点 {index + 1}</span>
                <input value={point} onChange={(event) => updateMarketingSupportPoint(index, event.target.value)} />
              </label>
            ))}
          </div>
          <label>
            <span>角标 / 信任 / 服务元素</span>
            <input placeholder="例如 官方旗舰店、包邮、7天无理由、现货速发；没有就留空，系统不会编造" value={form.marketingMain.trustBadges} onChange={(event) => updateMarketingMain({ trustBadges: event.target.value })} />
          </label>
          <div className="kit-toggle-list">
            <label className="checkbox-row">
              <input checked={form.marketingMain.allowPeople} type="checkbox" onChange={(event) => updateMarketingMain({ allowPeople: event.target.checked })} />
              <span>允许出现人物、模特、手部或穿戴展示</span>
            </label>
            <label className="checkbox-row">
              <input checked={form.marketingMain.allowPreparedState} type="checkbox" onChange={(event) => updateMarketingMain({ allowPreparedState: event.target.checked })} />
              <span>允许展示冲泡、食用、开箱、穿脚、上身等使用状态</span>
            </label>
            <label className="checkbox-row">
              <input checked={form.marketingMain.allowSceneProps} type="checkbox" onChange={(event) => updateMarketingMain({ allowSceneProps: event.target.checked })} />
              <span>允许加入场景道具，但商品必须是第一视觉主体</span>
            </label>
          </div>
          <div className="scene-grid kit-scene-grid">
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
      ) : (
        <section className="panel" id="scene-panel">
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
      )}

      {form.generationMode === "enhance" ? (
        <section className="panel">
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

      <section className="panel brand-overlay-panel" id="brand-panel">
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

      <section className="panel" id="output-panel">
        <h2>输出设置</h2>
        <div className="two-col">
          <label>
            <span>尺寸</span>
            <select
              value={form.sizeMode === "source" ? SOURCE_ASPECT_SIZE_OPTION : `${form.size.width}x${form.size.height}`}
              onChange={(event) => {
                if (event.target.value === SOURCE_ASPECT_SIZE_OPTION) {
                  setForm({ ...form, sizeMode: "source" });
                  void applySourceAspectSize(selectedReferenceImageUrls, { force: true });
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
          {form.generationMode === "category-kit" ? null : (
            <label>
              <span>每场景数量</span>
              <select value={form.countPerScene} onChange={(event) => setForm({ ...form, countPerScene: Number(event.target.value) as 1 | 2 | 4 })}>
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={4}>4</option>
              </select>
            </label>
          )}
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
          <strong>{effectiveSelectedScenes.length * effectiveCountPerScene}</strong>
          <span>
            {task.status === "pending" || task.status === "running"
              ? `${task.completedScenes ?? 0}/${task.totalScenes ?? effectiveSelectedScenes.length} 场景`
              : "张图像"}
          </span>
        </div>
        <button className="primary-button" disabled={batchGenerationLocked} type="button" onClick={() => void submitBatch()}>
          {batchGenerationLocked ? <Loader2 className="spin" size={17} /> : <Send size={17} />}
          批量生成
        </button>
      </section>

      <section className="panel results-panel" id="results-panel">
        <div className={`status status-${task.status}`}>
          {task.status === "succeeded" ? <CheckCircle2 size={16} /> : task.status === "running" ? <Loader2 className="spin" size={16} /> : <Sparkles size={16} />}
          {task.message}
        </div>
        {renderResultImages(task.status === "running" ? "图片生成中，完成后会显示在这里。" : "生成成功的图片会显示在这里。")}
      </section>

      {renderEditDialog()}

      <aside className="tool-dock" aria-label="商图AI助手导航">
        <div className="workflow-tabs" aria-label="生成流程">
          <button className="workflow-tab" title="选图" type="button" onClick={() => scrollToPanel("reference-panel")}>
            <ImageIcon size={20} />
            <span>选图</span>
          </button>
          <button className="workflow-tab" title="信息" type="button" onClick={() => scrollToPanel("product-panel")}>
            <Edit3 size={20} />
            <span>信息</span>
          </button>
          <button className="workflow-tab" title="生成" type="button" onClick={() => scrollToPanel("scene-panel")}>
            <Wand2 size={20} />
            <span>生成</span>
          </button>
          <button className="workflow-tab" title="结果" type="button" onClick={() => scrollToPanel("results-panel")}>
            <Send size={20} />
            <span>结果</span>
          </button>
        </div>

        <div className="tool-tabs" aria-label="账户工具">
          <button className={activeTool === "account" && toolPanelOpen ? "tool-tab active" : "tool-tab"} type="button" onClick={() => openTool("account")}>
            <UserCircle2 size={20} />
            <span>账户</span>
          </button>
          <button className={activeTool === "billing" && toolPanelOpen ? "tool-tab active" : "tool-tab"} type="button" onClick={() => openTool("billing")}>
            <Package size={20} />
            <span>套餐</span>
          </button>
          <button className={activeTool === "history" && toolPanelOpen ? "tool-tab active" : "tool-tab"} type="button" onClick={() => openTool("history")}>
            <Clock3 size={20} />
            <span>任务</span>
          </button>
          <button className={activeTool === "stats" && toolPanelOpen ? "tool-tab active" : "tool-tab"} type="button" onClick={() => openTool("stats")}>
            <BarChart3 size={20} />
            <span>统计</span>
          </button>
          <button className={activeTool === "referral" && toolPanelOpen ? "tool-tab active" : "tool-tab"} type="button" onClick={() => openReferralCampaign()}>
            <Gift size={20} />
            <span>邀请</span>
          </button>
          <button className={activeTool === "about" && toolPanelOpen ? "tool-tab active" : "tool-tab"} type="button" onClick={() => openTool("about")}>
            <Download size={20} />
            <span>关于</span>
          </button>
        </div>

        {toolPanelOpen ? (
          <div className="tool-panel">
            <div className="tool-panel-header">
              <strong>{toolTitle(activeTool)}</strong>
              <button className="tool-close" title="收起" type="button" onClick={() => setToolPanelOpen(false)}>
                <X size={17} />
              </button>
            </div>

            {activeTool === "account" ? (
              <div>
                {auth.token ? (
                  <div className="account-card">
                    <div className="account-heading">
                      <div>
                        <strong>{auth.user?.displayName || auth.user?.email || auth.user?.phone || "已登录"}</strong>
                        <span>{auth.user?.phone || auth.user?.email || "正在同步账户信息"}</span>
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
                    {requiresPhoneVerification ? (
                      <div className="phone-required-card">
                        <div>
                          <strong>完善手机号</strong>
                          <span>{PHONE_VERIFICATION_REQUIRED_MESSAGE}</span>
                        </div>
                        <button className="mini-button" type="button" onClick={() => setPhoneDialogOpen(true)}>
                          <Phone size={13} />
                          去完善
                        </button>
                      </div>
                    ) : null}
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
                      <button className="mini-button" type="button" onClick={() => openTool("referral")}>
                        <Gift size={13} />
                        邀请活动
                      </button>
                    </div>
                  </div>
                ) : (
                  <form className="auth-form" onSubmit={(event) => void submitAuth(event)}>
                    <div className="auth-switch">
                      <button className={authMode === "login" ? "active" : ""} type="button" onClick={() => setAuthMode("login")}>登录</button>
                      <button className={authMode === "register" ? "active" : ""} type="button" onClick={() => setAuthMode("register")}>注册</button>
                    </div>
                    {authMode === "register" ? (
                      <label>
                        <span>手机号</span>
                        <input autoComplete="tel" inputMode="tel" value={authForm.phone} onChange={(event) => setAuthForm({ ...authForm, phone: event.target.value })} required />
                      </label>
                    ) : (
                      <label>
                        <span>邮箱</span>
                        <input autoComplete="email" type="email" value={authForm.email} onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })} required />
                      </label>
                    )}
                    {authMode === "register" ? (
                      <label>
                        <span>显示名</span>
                        <input autoComplete="name" value={authForm.displayName} onChange={(event) => setAuthForm({ ...authForm, displayName: event.target.value })} />
                      </label>
                    ) : null}
                    {authMode === "register" ? (
                      <label>
                        <span>短信验证码</span>
                        <div className="auth-code-row">
                          <input
                            autoComplete="one-time-code"
                            inputMode="numeric"
                            maxLength={6}
                            value={authForm.smsCode}
                            onChange={(event) => setAuthForm({ ...authForm, smsCode: event.target.value })}
                            required
                          />
                          <button className="mini-button" disabled={authCodeLoading} type="button" onClick={() => void sendAuthSmsCode()}>
                            {authCodeLoading ? <Loader2 className="spin" size={13} /> : <Send size={13} />}
                            发送
                          </button>
                        </div>
                      </label>
                    ) : null}
                    {authMode === "register" ? (
                      <label>
                        <span>邀请码</span>
                        <input
                          autoComplete="off"
                          value={authForm.inviteCode}
                          onChange={(event) => setAuthForm({ ...authForm, inviteCode: event.target.value })}
                          placeholder="可选"
                        />
                      </label>
                    ) : null}
                    <label>
                      <span>密码</span>
                      <input autoComplete={authMode === "login" ? "current-password" : "new-password"} type="password" value={authForm.password} onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })} required />
                    </label>
                    {authError ? <p className="tool-error">{authError}</p> : null}
                    {authNotice ? <p className="settings-note">{authNotice}</p> : null}
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
                  <span>充值、购买套餐与订单</span>
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
                  const thumbnails = assets.slice(0, 4);
                  const showPlaceholder = thumbnails.length === 0 && (job.status === "running" || job.status === "pending");
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
                      {thumbnails.length > 0 ? (
                        <div className="asset-list">
                          {thumbnails.map((asset, index) => (
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
                      ) : showPlaceholder ? (
                        <div className="asset-list">
                          <div className="asset-thumb asset-thumb--placeholder" aria-hidden="true">
                            <img alt="" src={historyPlaceholderImage} />
                          </div>
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
                <div className="billing-usage-card">
                  <div className="tool-actions compact">
                    <span>生图与扣费明细</span>
                    <CreditCard size={13} />
                  </div>
                  {billingState.data.transactions.length === 0 ? (
                    <p className="tool-empty">暂无扣费明细。</p>
                  ) : (
                    <div className="billing-ledger-list">
                      {billingState.data.transactions.slice(0, 10).map((transaction) => (
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
              </div>
            ) : null}

            {activeTool === "referral" ? (
              <div>
                <div className="tool-actions">
                  <span>邀请好友注册与充值返现</span>
                  <button className="mini-button" disabled={referralState.loading} type="button" onClick={() => void refreshReferral()}>
                    {referralState.loading ? <Loader2 className="spin" size={13} /> : <RefreshCw size={13} />}
                    刷新
                  </button>
                </div>
                <div className="invite-summary-card">
                  <div>
                    <span>已邀请</span>
                    <strong>{formatCount(referralState.data?.invitedUserCount)} 人</strong>
                  </div>
                  <div>
                    <span>获得现金激励</span>
                    <strong>{formatMoney(referralState.data?.referralBalanceCents ?? auth.user?.referralBalanceCents ?? 0, referralState.data?.currency || auth.user?.currency)}</strong>
                  </div>
                  <div>
                    <span>注册送图</span>
                    <strong>{formatCount(referralState.data?.settings.inviterRegisterCredits)} 张</strong>
                  </div>
                </div>
                <div className="invite-card">
                  <div>
                    <span>我的邀请码</span>
                    <strong>{referralState.data?.inviteCode || auth.user?.inviteCode || "生成中"}</strong>
                  </div>
                  <div>
                    <span>好友奖励</span>
                    <strong>{formatCount(referralState.data?.settings.inviteeRegisterCredits)} 张</strong>
                  </div>
                  <div>
                    <span>充值返现</span>
                    <strong>{((referralState.data?.settings.rechargeCashbackRateBps ?? 0) / 100).toFixed(0)}%</strong>
                  </div>
                </div>
                <div className="invite-action-banner" id="referral-campaign">
                  <div>
                    <strong>邀请活动</strong>
                    <span>好友通过你的链接注册后，双方获得生图张数；好友充值或买套餐后，你获得现金返现激励。</span>
                  </div>
                  <div className="invite-action-banner__buttons">
                    <button className="mini-button" type="button" onClick={openReferralCampaignPage}>
                      <ExternalLink size={13} />
                      打开 PC 页面
                    </button>
                    <button className="mini-button" type="button" onClick={() => void copyInviteLink()}>
                      <Gift size={13} />
                      复制邀请链接
                    </button>
                  </div>
                </div>
                <div className="invite-list">
                  <div className="invite-list__head">
                    <strong>我邀请的人</strong>
                    <span>{formatCount(referralState.data?.invitedUserCount)} 人</span>
                  </div>
                  <div className="invite-list__body">
                    {(referralState.data?.invitees || []).length > 0 ? (
                      referralState.data!.invitees!.map((item) => (
                        <div className="invite-list__item" key={item.userId}>
                          <div className="invite-list__main">
                            <strong>{item.displayName || item.email || item.userId}</strong>
                            <span>{item.email || item.userId}</span>
                          </div>
                          <time>{formatDateTime(item.createdAt)}</time>
                        </div>
                      ))
                    ) : (
                      <p className="settings-note">暂无邀请记录。</p>
                    )}
                  </div>
                </div>
                {referralAction ? <p className="settings-note">{referralAction}</p> : null}
                {referralState.error ? <p className="tool-error">{referralState.error}</p> : null}
              </div>
            ) : null}

            {activeTool === "about" ? (
              <div>
                <div className="about-card">
                  <div className="about-card__brand">
                    <Settings size={18} />
                    <div>
                      <strong>商图AI助手</strong>
                      <span>面向跨境与电商运营的商品图批量生成工具。</span>
                    </div>
                  </div>
                  <p>插件会读取当前商品页信息与候选图片，帮助你生成主图、场景图、卖点图、营销主图和多语言图片翻译结果。账户、套餐、任务、统计和邀请活动都集中在右侧侧栏管理。</p>
                </div>
                <div className="about-contact-grid">
                  <div>
                    <span>官网</span>
                    <strong>imagen.neimou.com</strong>
                  </div>
                  <div>
                    <span>客服微信</span>
                    <strong>扫码添加</strong>
                  </div>
                </div>
                <div className="customer-service-card">
                  <div>
                    <strong>客服微信二维码</strong>
                    <span>用于咨询套餐、任务状态和产品使用问题。</span>
                  </div>
                  <img alt="客服微信二维码" src="/images/customer-service-qr.png" />
                </div>
                <div className="tool-actions">
                  <span>自动检测插件更新</span>
                  <button className="mini-button" disabled={extensionVersionState.loading} type="button" onClick={() => void checkExtensionUpdate("manual")}>
                    {extensionVersionState.loading ? <Loader2 className="spin" size={13} /> : <RefreshCw size={13} />}
                    检查
                  </button>
                </div>
                <div className={extensionVersionState.update ? "version-card update-available" : "version-card"}>
                  <div className="version-card-top">
                    <div>
                      <span>当前版本</span>
                      <strong>v{extensionVersionState.currentVersion}</strong>
                    </div>
                    <div>
                      <span>发布通道</span>
                      <strong>{extensionTarget() === "dev" ? "Dev" : "Prod"}</strong>
                    </div>
                  </div>
                  {extensionVersionState.update ? (
                    <>
                      <div className="version-update-title">
                        <strong>发现 v{extensionVersionState.update.version}</strong>
                        <span>{formatBytes(extensionVersionState.update.sizeBytes)}</span>
                      </div>
                      {extensionVersionState.update.releaseNotes && extensionVersionState.update.releaseNotes.length > 0 ? (
                        <ul className="version-notes">
                          {extensionVersionState.update.releaseNotes.map((note) => (
                            <li key={note}>{note}</li>
                          ))}
                        </ul>
                      ) : null}
                      <button className="primary-button version-upgrade-button" type="button" onClick={() => void upgradeExtension()}>
                        <Download size={15} />
                        下载并查看升级步骤
                      </button>
                    </>
                  ) : (
                    <p className="tool-empty">当前已是最新版本。</p>
                  )}
                </div>
                {extensionVersionState.checkedAt ? <p className="settings-note">上次检查：{formatDateTime(extensionVersionState.checkedAt)}</p> : null}
                {extensionVersionState.error ? <p className="tool-error">{extensionVersionState.error}</p> : null}
                <p className="settings-note">浏览器不允许手动安装的扩展静默替换自身，升级按钮会下载新版压缩包并打开安装帮助。</p>
              </div>
            ) : null}

          </div>
        ) : null}
      </aside>
      {requiresPhoneVerification && phoneDialogOpen ? (
        <div className="phone-dialog-backdrop" role="presentation">
          <section aria-labelledby="extension-phone-dialog-title" aria-modal="true" className="phone-dialog" role="dialog">
            <div className="phone-dialog-icon">
              <Phone size={20} />
            </div>
            <div className="phone-dialog-copy">
              <span>Phone Verification</span>
              <h2 id="extension-phone-dialog-title">完善手机号</h2>
              <p>{PHONE_VERIFICATION_REQUIRED_MESSAGE}</p>
            </div>
            <label>
              <span>手机号</span>
              <input inputMode="tel" value={bindPhoneForm.phone} onChange={(event) => setBindPhoneForm({ ...bindPhoneForm, phone: event.target.value })} />
            </label>
            <label>
              <span>短信验证码</span>
              <div className="auth-code-row">
                <input inputMode="numeric" maxLength={6} value={bindPhoneForm.smsCode} onChange={(event) => setBindPhoneForm({ ...bindPhoneForm, smsCode: event.target.value })} />
                <button className="mini-button" disabled={bindPhoneCodeLoading} type="button" onClick={() => void sendBindPhoneCode()}>
                  {bindPhoneCodeLoading ? <Loader2 className="spin" size={13} /> : <Send size={13} />}
                  发送
                </button>
              </div>
            </label>
            {bindPhoneError ? <p className="tool-error">{bindPhoneError}</p> : null}
            {bindPhoneNotice ? <p className="settings-note">{bindPhoneNotice}</p> : null}
            <button className="primary-button auth-submit" disabled={bindPhoneLoading} type="button" onClick={() => void submitBindPhone()}>
              {bindPhoneLoading ? <Loader2 className="spin" size={15} /> : <CheckCircle2 size={15} />}
              完成验证
            </button>
          </section>
        </div>
      ) : null}
      {inviteDialogOpen ? (
        <div className="invite-dialog-backdrop" role="presentation" onClick={closeInviteDialog}>
          <section
            aria-labelledby="extension-invite-dialog-title"
            aria-modal="true"
            className="invite-dialog"
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <button aria-label="关闭邀请活动弹窗" className="invite-dialog__close" type="button" onClick={closeInviteDialog}>
              <X size={16} />
            </button>
            <div className="invite-dialog__hero">
              <Gift size={18} />
              <span>邀请活动</span>
            </div>
            <div className="invite-dialog__body">
              <h2 id="extension-invite-dialog-title">邀请好友注册，双方都能拿到生图张数</h2>
              <p className="invite-dialog__lead">
                好友通过邀请链接注册后，你和好友都会得到张数激励；好友后续充值或购买套餐，你还能获得现金返现进入邀请激励账户。
              </p>
              <div className="invite-rule-grid">
                <div>
                  <span>你获得</span>
                  <strong>{formatCount(referralState.data?.settings.inviterRegisterCredits)} 张</strong>
                </div>
                <div>
                  <span>好友获得</span>
                  <strong>{formatCount(referralState.data?.settings.inviteeRegisterCredits)} 张</strong>
                </div>
                <div>
                  <span>充值返现</span>
                  <strong>{((referralState.data?.settings.rechargeCashbackRateBps ?? 0) / 100).toFixed(0)}%</strong>
                </div>
              </div>
              <div className="invite-share-card">
                <div className="invite-share-card__text">
                  <span>我的邀请码</span>
                  <strong>{referralState.data?.inviteCode || auth.user?.inviteCode || "生成中"}</strong>
                  <p>{referralState.data?.inviteUrl || "刷新后可生成邀请链接。"}</p>
                  <em>当前邀请人数 {formatCount(referralState.data?.invitedUserCount)} 人</em>
                </div>
                <div className="invite-share-card__code">
                  <span>分享方式</span>
                  <strong>链接 / 二维码 / 海报</strong>
                </div>
              </div>
              {referralAction ? <p className="settings-note">{referralAction}</p> : null}
              {referralState.error ? <p className="tool-error">{referralState.error}</p> : null}
              <div className="invite-dialog__actions">
                <button className="primary-button" disabled={referralState.loading} type="button" onClick={() => void copyInviteLink()}>
                  <Copy size={15} />
                  复制邀请链接
                </button>
                <button className="secondary-button" type="button" onClick={openInviteInPanel}>
                  <UserCircle2 size={15} />
                  插件内查看
                </button>
                <button className="secondary-button" type="button" onClick={openReferralCampaignPage}>
                  <ExternalLink size={15} />
                  打开 PC 页面
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
      {renderExtensionUpdateDialog()}
      {renderQueuedJobDialog()}
    </main>
  );
}
