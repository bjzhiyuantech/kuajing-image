export const IMAGE_MODEL = "gpt-image-2" as const;

export type ImageModel = string;
export type ImageMode = "generate" | "edit";
export type ImageQuality = "auto" | "low" | "medium" | "high";
export type OutputFormat = "png" | "jpeg" | "webp";
export type GenerationStatus = "pending" | "running" | "succeeded" | "partial" | "failed" | "cancelled";
export type OutputStatus = "succeeded" | "failed";
export type CloudStorageProvider = "cos" | "oss";
export type AssetCloudUploadStatus = "uploaded" | "failed";
export type EcommercePlatform = "amazon" | "shopify" | "tiktok-shop" | "temu" | "shein" | "etsy" | "aliexpress" | "other";
export type EcommerceMarket = "us" | "uk" | "eu" | "ca" | "au" | "jp" | "kr" | "sg" | "mx" | "br" | "global";
export type EcommerceGenerationMode = "enhance" | "creative";

export interface SizePreset {
  id: string;
  label: string;
  width: number;
  height: number;
  description: string;
}

export const SIZE_PRESETS: SizePreset[] = [
  { id: "square-1k", label: "Square 1K", width: 1024, height: 1024, description: "Avatar and social image" },
  { id: "poster-portrait", label: "Portrait poster", width: 1024, height: 1536, description: "Poster, cover, and mobile vertical image" },
  { id: "poster-landscape", label: "Landscape poster", width: 1536, height: 1024, description: "Wide cover and desktop image" },
  { id: "story-9-16", label: "Story 9:16", width: 1088, height: 1920, description: "Short video cover and story image" },
  { id: "video-16-9", label: "Video 16:9", width: 1920, height: 1088, description: "Video cover and presentation image" },
  { id: "wide-2k", label: "Wide 2K", width: 2560, height: 1440, description: "Display page and wide composition" },
  { id: "portrait-2k", label: "Portrait 2K", width: 1440, height: 2560, description: "High-resolution portrait image" },
  { id: "square-2k", label: "Square 2K", width: 2048, height: 2048, description: "High-resolution square image" },
  { id: "wide-4k", label: "Wide 4K", width: 3840, height: 2160, description: "Large display image" }
];

export const STYLE_PRESETS = [
  {
    id: "none",
    label: "None",
    prompt: ""
  },
  {
    id: "photoreal",
    label: "Photoreal",
    prompt: "photorealistic, natural lighting, high detail, realistic materials"
  },
  {
    id: "product",
    label: "Product",
    prompt: "premium product photography, clean studio lighting, sharp focus, commercial composition"
  },
  {
    id: "illustration",
    label: "Illustration",
    prompt: "polished editorial illustration, clear shapes, rich but balanced colors, professional finish"
  },
  {
    id: "poster",
    label: "Poster",
    prompt: "bold poster composition, strong focal point, refined typography space, cinematic color grading"
  },
  {
    id: "avatar",
    label: "Avatar",
    prompt: "character portrait, expressive face, clean background, high quality avatar style"
  }
] as const;

export type StylePresetId = (typeof STYLE_PRESETS)[number]["id"];

export const IMAGE_QUALITIES: ImageQuality[] = ["auto", "low", "medium", "high"];
export const OUTPUT_FORMATS: OutputFormat[] = ["png", "jpeg", "webp"];
export const GENERATION_COUNTS = [1, 2, 4] as const;
export type GenerationCount = (typeof GENERATION_COUNTS)[number];

export const ECOMMERCE_PLATFORMS = [
  { id: "amazon", label: "Amazon" },
  { id: "shopify", label: "Shopify" },
  { id: "tiktok-shop", label: "TikTok Shop" },
  { id: "temu", label: "Temu" },
  { id: "shein", label: "SHEIN" },
  { id: "etsy", label: "Etsy" },
  { id: "aliexpress", label: "AliExpress" },
  { id: "other", label: "Other marketplace" }
] as const satisfies ReadonlyArray<{ id: EcommercePlatform; label: string }>;

export const ECOMMERCE_MARKETS = [
  { id: "us", label: "United States" },
  { id: "uk", label: "United Kingdom" },
  { id: "eu", label: "European Union" },
  { id: "ca", label: "Canada" },
  { id: "au", label: "Australia" },
  { id: "jp", label: "Japan" },
  { id: "kr", label: "South Korea" },
  { id: "sg", label: "Singapore" },
  { id: "mx", label: "Mexico" },
  { id: "br", label: "Brazil" },
  { id: "global", label: "Global" }
] as const satisfies ReadonlyArray<{ id: EcommerceMarket; label: string }>;

export const ECOMMERCE_SCENE_TEMPLATES = [
  {
    id: "marketplace-main",
    mode: "enhance",
    label: "白底主图优化",
    defaultSizePresetId: "square-1k",
    prompt:
      "Enhance the source product image into a clean marketplace main image. Keep the exact product identity, structure, color, material, proportions, and visible details from the reference image. Use a pure white background, product centered, realistic commercial lighting, no redesign, no added props, no watermark."
  },
  {
    id: "logo-benefit",
    mode: "enhance",
    label: "Logo + 卖点图",
    defaultSizePresetId: "poster-landscape",
    prompt:
      "Create an e-commerce benefit image based on the source product image. Keep the product unchanged and add a clean brand-logo area plus concise selling-point text layout. Do not invent product features. Text must be large, readable, and placed outside the product. Leave logo text as an editable placeholder if no brand is provided."
  },
  {
    id: "feature-benefit",
    mode: "enhance",
    label: "功能说明图",
    defaultSizePresetId: "poster-landscape",
    prompt:
      "Create a feature explanation image from the source product image. Preserve the product exactly, then add neat callout lines, icon-like markers, and short readable feature text around the product. Do not change the product design, material, color, or proportions."
  },
  {
    id: "promo-poster",
    mode: "enhance",
    label: "促销海报",
    defaultSizePresetId: "poster-portrait",
    prompt:
      "Create a promotional marketplace poster from the source product image. Keep the product exact and build a clean commercial layout with room for discount text, brand area, and short selling points. Do not redesign the product or add misleading claims."
  },
  {
    id: "lifestyle",
    mode: "creative",
    label: "生活方式图",
    defaultSizePresetId: "poster-landscape",
    prompt:
      "Create a realistic lifestyle image using the reference product as the hero item. Preserve the product's key shape, color, material, and recognizable details while rebuilding the environment, lighting, props, and composition. Premium e-commerce photography, authentic setting, clear product visibility, no watermark."
  },
  {
    id: "model-wear",
    mode: "creative",
    label: "国外模特穿戴图",
    defaultSizePresetId: "poster-portrait",
    prompt:
      "Create a realistic overseas model usage image with the reference product worn, held, or used naturally when appropriate for the product category. Keep the product recognizable and commercially accurate. Use tasteful international e-commerce styling, natural pose, realistic lighting, no extra hands, no distorted anatomy."
  },
  {
    id: "accessory-match",
    mode: "creative",
    label: "配饰搭配图",
    defaultSizePresetId: "poster-landscape",
    prompt:
      "Create a curated accessory-matching scene around the reference product. Keep the product as the main subject and preserve its key visual features. Add complementary props, styling elements, and a premium marketplace composition without changing the product itself."
  },
  {
    id: "seasonal-campaign",
    mode: "creative",
    label: "节日促销图",
    defaultSizePresetId: "poster-portrait",
    prompt:
      "Create a seasonal promotional product scene using the reference product as the main subject. Festive but not cluttered, premium marketplace ad style, clean space for later promotional text, no fake text, no watermark."
  },
  {
    id: "social-ad",
    mode: "creative",
    label: "社媒广告图",
    defaultSizePresetId: "story-9-16",
    prompt:
      "Create a high-converting social commerce ad creative using the reference product. Strong visual hook, mobile-first composition, realistic lighting, clear product benefit, no watermark, no unreadable text."
  }
] as const satisfies ReadonlyArray<{
  id: string;
  mode: EcommerceGenerationMode;
  label: string;
  defaultSizePresetId: ImageSizePresetId;
  prompt: string;
}>;

export type EcommerceSceneTemplateId = (typeof ECOMMERCE_SCENE_TEMPLATES)[number]["id"];

export interface EcommerceProductBrief {
  title: string;
  description?: string;
  bulletPoints?: string[];
  targetCustomer?: string;
  usageScene?: string;
  material?: string;
  color?: string;
  brandTone?: string;
}

export interface EcommercePromptContext {
  product: EcommerceProductBrief;
  platform: EcommercePlatform;
  market: EcommerceMarket;
  sceneTemplateId: EcommerceSceneTemplateId;
  extraDirection?: string;
}

export interface ImageSize {
  width: number;
  height: number;
}

export const CUSTOM_SIZE_PRESET_ID = "custom" as const;
export type ImageSizePresetId = (typeof SIZE_PRESETS)[number]["id"] | typeof CUSTOM_SIZE_PRESET_ID;

export type ValidationResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      code: string;
      message: string;
    };

export type ImageSizeValidationResult =
  | {
      ok: true;
      size: ImageSize;
      apiValue: string;
      source: "preset" | "custom";
      presetId?: ImageSizePresetId;
    }
  | {
      ok: false;
      code: "invalid_size" | "invalid_size_preset";
      message: string;
    };

export const MIN_IMAGE_DIMENSION = 512;
export const MAX_IMAGE_DIMENSION = 3840;
export const IMAGE_SIZE_MULTIPLE = 16;
export const MIN_TOTAL_PIXELS = 655_360;
export const MAX_TOTAL_PIXELS = 8_294_400;
export const MAX_IMAGE_ASPECT_RATIO = 3;

export function validateImageSize(size: ImageSize): ValidationResult {
  if (!Number.isInteger(size.width) || !Number.isInteger(size.height)) {
    return { ok: false, code: "invalid_size", message: "宽度和高度必须是整数。" };
  }
  if (size.width < MIN_IMAGE_DIMENSION || size.height < MIN_IMAGE_DIMENSION) {
    return { ok: false, code: "invalid_size", message: `宽度和高度不能小于 ${MIN_IMAGE_DIMENSION}px。` };
  }
  if (size.width > MAX_IMAGE_DIMENSION || size.height > MAX_IMAGE_DIMENSION) {
    return { ok: false, code: "invalid_size", message: `宽度和高度不能大于 ${MAX_IMAGE_DIMENSION}px。` };
  }
  if (size.width % IMAGE_SIZE_MULTIPLE !== 0 || size.height % IMAGE_SIZE_MULTIPLE !== 0) {
    return { ok: false, code: "invalid_size", message: `宽度和高度必须是 ${IMAGE_SIZE_MULTIPLE}px 的倍数。` };
  }
  if (Math.max(size.width, size.height) / Math.min(size.width, size.height) > MAX_IMAGE_ASPECT_RATIO) {
    return { ok: false, code: "invalid_size", message: `长边和短边比例不能超过 ${MAX_IMAGE_ASPECT_RATIO}:1。` };
  }
  if (size.width * size.height < MIN_TOTAL_PIXELS) {
    return { ok: false, code: "invalid_size", message: `总像素不能小于 ${MIN_TOTAL_PIXELS.toLocaleString()}。` };
  }
  if (size.width * size.height > MAX_TOTAL_PIXELS) {
    return { ok: false, code: "invalid_size", message: `总像素不能超过 ${MAX_TOTAL_PIXELS.toLocaleString()}。` };
  }
  return { ok: true };
}

export function sizeToApiValue(size: ImageSize): string {
  return `${size.width}x${size.height}`;
}

export function validateSceneImageSize(input: {
  size: ImageSize;
  sizePresetId?: string | null;
}): ImageSizeValidationResult {
  const requestedPresetId = input.sizePresetId?.trim();
  const requestedPreset =
    requestedPresetId && requestedPresetId !== CUSTOM_SIZE_PRESET_ID
      ? SIZE_PRESETS.find((preset) => preset.id === requestedPresetId)
      : undefined;

  if (requestedPresetId && requestedPresetId !== CUSTOM_SIZE_PRESET_ID && !requestedPreset) {
    return {
      ok: false,
      code: "invalid_size_preset",
      message: "不支持的场景尺寸预设。"
    };
  }

  const sizeValidation = validateImageSize(input.size);
  if (!sizeValidation.ok) {
    return {
      ok: false,
      code: "invalid_size",
      message: sizeValidation.message
    };
  }

  const matchingPreset = SIZE_PRESETS.find(
    (preset) => preset.width === input.size.width && preset.height === input.size.height
  );

  return {
    ok: true,
    size: input.size,
    apiValue: sizeToApiValue(input.size),
    source: matchingPreset ? "preset" : "custom",
    presetId: matchingPreset?.id ?? CUSTOM_SIZE_PRESET_ID
  };
}

export interface ReferenceImageInput {
  dataUrl: string;
  fileName?: string;
}

export interface GenerateImageRequest {
  prompt: string;
  presetId: StylePresetId;
  size: ImageSize;
  quality: ImageQuality;
  outputFormat: OutputFormat;
  outputCompression?: number;
  count: GenerationCount;
}

export interface EditImageRequest extends GenerateImageRequest {
  referenceImage: ReferenceImageInput;
  referenceAssetId?: string;
}

export interface GeneratedAsset {
  id: string;
  url: string;
  fileName: string;
  mimeType: string;
  width: number;
  height: number;
  cloud?: GeneratedAssetCloudInfo;
}

export interface GeneratedAssetCloudInfo {
  provider: CloudStorageProvider;
  status: AssetCloudUploadStatus;
  lastError?: string;
  uploadedAt?: string;
}

export interface GenerationOutput {
  id: string;
  status: OutputStatus;
  asset?: GeneratedAsset;
  error?: string;
}

export interface GenerationRecord {
  id: string;
  mode: ImageMode;
  prompt: string;
  effectivePrompt: string;
  presetId: string;
  size: ImageSize;
  quality: ImageQuality;
  outputFormat: OutputFormat;
  count: number;
  status: GenerationStatus;
  error?: string;
  referenceAssetId?: string;
  createdAt: string;
  outputs: GenerationOutput[];
}

export interface GenerationResponse {
  record: GenerationRecord;
}

export interface GalleryImageItem {
  outputId: string;
  generationId: string;
  mode: ImageMode;
  prompt: string;
  effectivePrompt: string;
  presetId: string;
  size: ImageSize;
  quality: ImageQuality;
  outputFormat: OutputFormat;
  createdAt: string;
  asset: GeneratedAsset;
}

export interface GalleryResponse {
  items: GalleryImageItem[];
}

export interface ProjectState {
  id: string;
  name: string;
  snapshot: unknown | null;
  history: GenerationRecord[];
  updatedAt: string;
}

export interface AppConfig {
  model: ImageModel;
  models: ImageModel[];
  sizePresets: SizePreset[];
  stylePresets: typeof STYLE_PRESETS;
  qualities: ImageQuality[];
  outputFormats: OutputFormat[];
  counts: readonly GenerationCount[];
}

export type UserRole = "user" | "admin";

export interface Plan {
  id: string;
  name: string;
  description?: string;
  imageQuota: number;
  storageQuotaBytes: number;
  priceCents: number;
  currency: string;
  enabled: boolean;
  sortOrder: number;
  benefits?: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  planId?: string;
  planName?: string;
  quotaTotal: number;
  quotaUsed: number;
  balanceCents: number;
  currency?: string;
  storageQuotaBytes: number;
  storageUsedBytes: number;
  createdAt: string;
  updatedAt: string;
}

export interface AuthWorkspace {
  id: string;
  name: string;
  role: string;
}

export interface AuthResponse {
  user: AuthUser;
  workspace: AuthWorkspace;
  token: string;
}

export interface AuthMeResponse {
  user: AuthUser;
  workspace: AuthWorkspace;
}

export interface AdminStatsResponse {
  userCount: number;
  assetCount: number;
  estimatedStorageBytes: number;
  totalStorageQuotaBytes: number;
  totalStorageUsedBytes: number;
  ecommerceJobStatus: Record<EcommerceBatchJobStatus, number>;
  recentJobs: EcommerceJobSummary[];
}

export interface AdminUserItem extends AuthUser {
  workspaceCount: number;
}

export interface AdminUsersResponse {
  users: AdminUserItem[];
}

export interface AdminPlansResponse {
  plans: Plan[];
}

export interface BillingSettings {
  imageUnitPriceCents: number;
  currency: string;
  updatedAt?: string;
}

export interface AdminBillingSettingsResponse {
  settings: BillingSettings;
}

export interface SaveBillingSettingsRequest {
  imageUnitPriceCents: number;
  currency?: string;
}

export interface AlipayConfigView {
  enabled: boolean;
  appId: string;
  privateKey: MaskedSecret;
  publicKey: MaskedSecret;
  notifyUrl: string;
  returnUrl: string;
  gateway: string;
  signType: "RSA2" | "RSA" | string;
  updatedAt?: string;
}

export interface AdminAlipayConfigResponse {
  alipay: AlipayConfigView;
}

export interface SaveAlipayConfigRequest {
  enabled: boolean;
  appId?: string;
  privateKey?: string;
  preservePrivateKey?: boolean;
  publicKey?: string;
  preservePublicKey?: boolean;
  notifyUrl?: string;
  returnUrl?: string;
  gateway?: string;
  signType?: "RSA2" | "RSA" | string;
}

export interface AdminAdjustBalanceRequest {
  balanceCents?: number;
  deltaCents?: number;
  note?: string;
}

export interface BillingPlan extends Plan {
  recommended?: boolean;
  purchaseUrl?: string;
}

export interface BillingBalance {
  balanceCents: number;
  currency: string;
  updatedAt?: string;
}

export interface BillingUsage {
  quotaTotal: number;
  quotaUsed: number;
  packageTotal?: number;
  packageUsed?: number;
  packageRemaining?: number;
}

export interface BillingStorageUsage {
  quotaBytes: number;
  usedBytes: number;
}

export interface BillingTransaction {
  id: string;
  userId?: string;
  userEmail?: string;
  workspaceId?: string;
  generationId?: string;
  type: "plan_purchase" | "recharge" | "generation" | "admin_adjustment" | string;
  title: string;
  amountCents: number;
  currency: string;
  balanceBeforeCents?: number;
  balanceAfterCents?: number;
  quotaBefore?: number;
  quotaAfter?: number;
  quotaConsumed?: number;
  imageCount?: number;
  unitPriceCents?: number;
  note?: string;
  status: "pending" | "succeeded" | "failed" | "cancelled" | "paid" | string;
  createdByUserId?: string;
  createdAt: string;
}

export interface BillingTransactionsResponse {
  transactions: BillingTransaction[];
}

export interface BillingSummaryResponse {
  balance: BillingBalance;
  currentPlan?: BillingPlan;
  plans?: BillingPlan[];
  usage?: BillingUsage;
  storage?: BillingStorageUsage;
  transactions?: BillingTransaction[];
}

export type PaymentChannel = "alipay";

export interface CreateAlipayRechargeRequest {
  amountCents: number;
  currency?: string;
  returnUrl?: string;
  channel?: PaymentChannel;
}

export interface CreatePaymentResponse {
  orderId?: string;
  status?: "pending" | "paid" | "failed";
  paymentUrl?: string;
  checkoutUrl?: string;
  qrCodeUrl?: string;
  message?: string;
}

export interface PurchasePlanRequest {
  planId: string;
  paymentMethod: "balance" | "alipay";
  returnUrl?: string;
}

export interface AdminAssetItem {
  id: string;
  userId: string;
  userEmail?: string;
  workspaceId: string;
  fileName: string;
  mimeType: string;
  width: number;
  height: number;
  estimatedBytes: number;
  cloudProvider?: CloudStorageProvider;
  cloudStatus?: AssetCloudUploadStatus;
  createdAt: string;
}

export interface AdminAssetsResponse {
  assets: AdminAssetItem[];
}

export interface MaskedSecret {
  hasSecret: boolean;
  value?: string;
}

export interface CosStorageConfigView {
  secretId: string;
  secretKey: MaskedSecret;
  bucket: string;
  region: string;
  keyPrefix: string;
}

export interface OssStorageConfigView {
  accessKeyId: string;
  accessKeySecret: MaskedSecret;
  bucket: string;
  region: string;
  keyPrefix: string;
}

export interface StorageConfigResponse {
  enabled: boolean;
  provider: CloudStorageProvider;
  cos: CosStorageConfigView;
  oss: OssStorageConfigView;
}

export interface SaveCosStorageConfig {
  secretId: string;
  secretKey?: string;
  preserveSecret?: boolean;
  bucket: string;
  region: string;
  keyPrefix: string;
}

export interface SaveOssStorageConfig {
  accessKeyId: string;
  accessKeySecret?: string;
  preserveSecret?: boolean;
  bucket: string;
  region: string;
  keyPrefix: string;
}

export interface SaveStorageConfigRequest {
  enabled: boolean;
  provider: CloudStorageProvider;
  cos?: SaveCosStorageConfig;
  oss?: SaveOssStorageConfig;
}

export interface StorageTestResult {
  ok: boolean;
  message: string;
}

export interface EcommerceBatchGenerateRequest {
  product: EcommerceProductBrief;
  platform: EcommercePlatform;
  market: EcommerceMarket;
  sceneTemplateIds: EcommerceSceneTemplateId[];
  sourcePageUrl?: string;
  sizePresetId?: ImageSizePresetId;
  size?: ImageSize;
  stylePresetId?: StylePresetId;
  quality?: ImageQuality;
  outputFormat?: OutputFormat;
  countPerScene?: GenerationCount;
  referenceImage?: ReferenceImageInput;
  extraDirection?: string;
}

export type EcommerceBatchJobStatus = "pending" | "running" | "succeeded" | "partial" | "failed";

export interface EcommerceBatchGenerateResponse {
  jobId: string;
  status: EcommerceBatchJobStatus;
  message: string;
  totalScenes: number;
  completedScenes: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  records: GenerationRecord[];
}

export interface EcommerceJobSummary {
  jobId: string;
  status: EcommerceBatchJobStatus;
  message: string;
  productTitle: string;
  platform: EcommercePlatform;
  market: EcommerceMarket;
  totalScenes: number;
  completedScenes: number;
  succeededScenes: number;
  failedScenes: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  sourcePageUrl?: string;
}

export interface EcommerceJobListResponse {
  jobs: EcommerceJobSummary[];
}

export interface EcommerceStatsResponse {
  totalJobs: number;
  pendingJobs: number;
  runningJobs: number;
  succeededJobs: number;
  partialJobs: number;
  failedJobs: number;
  totalScenes: number;
  completedScenes: number;
  succeededScenes: number;
  failedScenes: number;
  generatedImages: number;
}

export function composePrompt(prompt: string, presetId: string): string {
  const trimmedPrompt = prompt.trim();
  const preset = STYLE_PRESETS.find((item) => item.id === presetId);
  if (!preset || preset.id === "none" || !preset.prompt) {
    return trimmedPrompt;
  }
  return `${trimmedPrompt}\n\nStyle direction: ${preset.prompt}`;
}

export function composeEcommercePrompt(context: EcommercePromptContext): string {
  const template = ECOMMERCE_SCENE_TEMPLATES.find((item) => item.id === context.sceneTemplateId);
  const platform = ECOMMERCE_PLATFORMS.find((item) => item.id === context.platform)?.label ?? context.platform;
  const market = ECOMMERCE_MARKETS.find((item) => item.id === context.market)?.label ?? context.market;
  const product = context.product;
  const details = [
    `Product title: ${product.title.trim()}`,
    product.description ? `Description: ${product.description.trim()}` : "",
    product.bulletPoints?.length ? `Selling points: ${product.bulletPoints.map((point) => point.trim()).filter(Boolean).join("; ")}` : "",
    product.targetCustomer ? `Target customer: ${product.targetCustomer.trim()}` : "",
    product.usageScene ? `Usage scene: ${product.usageScene.trim()}` : "",
    product.material ? `Material: ${product.material.trim()}` : "",
    product.color ? `Color: ${product.color.trim()}` : "",
    product.brandTone ? `Brand tone: ${product.brandTone.trim()}` : "",
    context.extraDirection ? `Additional direction: ${context.extraDirection.trim()}` : ""
  ].filter(Boolean);

  const modeGuard =
    template?.mode === "enhance"
      ? "Reference image rule: treat the source product image as the single source of truth. Preserve the original product exactly. Only improve lighting, background, layout, logo area, selling-point text, callouts, and marketplace composition. Do not redesign the product."
      : "Reference image rule: use the source product image to preserve the product's key identity, shape, color, material, and recognizable details while creating a new commercial scene.";

  return [
    template?.prompt ?? "Create a professional cross-border e-commerce product image.",
    `Optimize for ${platform} in the ${market} market.`,
    ...details,
    modeGuard,
    "Keep the result accurate and commercially usable. Avoid watermarks, unreadable text, misleading claims, and extra hands or people unless explicitly requested."
  ].join("\n");
}
