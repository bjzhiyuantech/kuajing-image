import {
  AlertTriangle,
  BadgeCheck,
  Bell,
  BookOpen,
  Brush,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Cloud,
  Copy,
  Download,
  ExternalLink,
  Globe2,
  ImageIcon,
  Loader2,
  LogOut,
  MapPin,
  Maximize2,
  Megaphone,
  Home,
  Package,
  MoreHorizontal,
  RotateCcw,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Square,
  Workflow,
  User,
  X,
  XCircle
} from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  DEFAULT_EMBED_DEFINITIONS,
  Box,
  LANGUAGES,
  defaultEditorAssetUrls,
  iconTypes,
  Tldraw,
  type Editor,
  type TLAsset,
  type TLAssetContext,
  type TLAssetId,
  type TLAssetStore,
  type TLEditorSnapshot,
  type TLImageShape,
  type TLShapePartial,
  type TLShapeId,
  type TLShape,
  type TLStoreSnapshot,
  type TLComponents,
  type TLUiAssetUrlOverrides,
  type TldrawOptions
} from "tldraw";
import {
  GENERATION_PLACEHOLDER_TYPE,
  GenerationPlaceholderShapeUtil,
  type GenerationPlaceholderShape
} from "./GenerationPlaceholderShape";
import {
  CUSTOM_SIZE_PRESET_ID,
  GENERATION_COUNTS,
  IMAGE_QUALITIES,
  MAX_IMAGE_DIMENSION,
  MIN_IMAGE_DIMENSION,
  OUTPUT_FORMATS,
  SIZE_PRESETS,
  STYLE_PRESETS,
  validateImageSize,
  type DemoCanvasConfigResponse,
  type DemoCanvasExample,
  type GalleryImageItem,
  type EcommerceBatchGenerateResponse,
  type EcommerceGenerationMode,
  type EcommerceMarket,
  type EcommercePlatform,
  type EcommerceSceneTemplateId,
  type EcommerceStatsResponse,
  type EcommerceTextLanguage,
  type GenerationCount,
  type GenerationRecord,
  type GenerationResponse,
  type GenerationStatus,
  type GeneratedAsset,
  ECOMMERCE_DETAIL_CATEGORY_KIT_SCENE_IDS,
  ECOMMERCE_MARKETS,
  ECOMMERCE_PLATFORMS,
  ECOMMERCE_SCENE_TEMPLATES,
  ECOMMERCE_TEXT_LANGUAGES,
  type ImageQuality,
  type ImageSize,
  type OutputFormat,
  type ProjectState,
  type ReferenceImageInput,
  type SizePreset,
  type StylePresetId
} from "@gpt-image-canvas/shared";
import { AccountPage, AdminPage, AuthScreen } from "./AuthViews";
import { HelpCenterPage } from "./HelpCenter";
import {
  authFetch,
  clearStoredAuthToken,
  consumeAuthTokenFromUrl,
  fetchCurrentUser,
  getStoredAuthToken,
  isAdminUser,
  loginWithPassword,
  bindPhone,
  registerWithPassword,
  sendBindPhoneSmsCode,
  sendRegisterSmsCode,
  storeAuthToken,
  type AuthSession,
  type AuthUser
} from "./authClient";
import { BRAND_NAME, BRAND_TAGLINE, BrandMark, BrandName } from "./Brand";

const AUTOSAVE_DEBOUNCE_MS = 1200;
const HISTORY_COLLAPSED_LIMIT = 3;
const MAX_REFERENCE_IMAGE_BYTES = 50 * 1024 * 1024;
const MOBILE_DRAWER_MEDIA_QUERY = "(max-width: 1023px)";
const ASSET_PREVIEW_WIDTHS = [256, 512, 1024, 2048] as const;
type AssetPreviewWidth = (typeof ASSET_PREVIEW_WIDTHS)[number];
type BrowserKind = "chrome" | "edge" | "firefox" | "other";
type InstallHelpBrowser = "chrome" | "edge";
const GENERATED_ASSET_INITIAL_PREVIEW_WIDTH: AssetPreviewWidth = 2048;
const SUPPORTED_REFERENCE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);
const EXTENSION_RELEASE_API_URL = "/api/extension-release";
const defaultPluginGuideLinks = {
  downloadUrl: "/downloads/kuajing-image-extension-prod-latest.zip",
  installHelpUrl: "/install-help.html"
};
const initialCanvasPreviewWidths = new Map<string, AssetPreviewWidth>();
const shapeUtils = [GenerationPlaceholderShapeUtil];
const tldrawOptions = {
  debouncedZoomThreshold: 80
} satisfies Partial<TldrawOptions>;
const tldrawComponents = {
  StylePanel: null
} satisfies TLComponents;
const TLDRAW_ASSET_BASE_URL = "https://aiimages.neimou.com/4.5.10";
const tldrawAssetUrls = {
  fonts: Object.entries(defaultEditorAssetUrls.fonts ?? {}).reduce<Record<string, string>>((acc, [name, url]) => {
    if (url) {
      acc[name] = url.replace(/^https:\/\/cdn\.tldraw\.com\/4\.5\.10/, TLDRAW_ASSET_BASE_URL);
    }
    return acc;
  }, {}),
  icons: Object.fromEntries(iconTypes.map((name) => [name, `${TLDRAW_ASSET_BASE_URL}/icons/icon/0_merged.svg#${name}`])),
  translations: Object.fromEntries(LANGUAGES.map((lang) => [lang.locale, `${TLDRAW_ASSET_BASE_URL}/translations/${lang.locale}.json`])),
  embedIcons: Object.fromEntries(DEFAULT_EMBED_DEFINITIONS.map((def) => [def.type, `${TLDRAW_ASSET_BASE_URL}/embed-icons/${def.type}.png`]))
} satisfies TLUiAssetUrlOverrides;
const TLDRAW_LICENSE_KEY =
  "tldraw-2026-08-08/WyJ3dGU4bldjRyIsWyIqIl0sMTYsIjIwMjYtMDgtMDgiXQ.Xt7lTydUhMnKfHfp+g8Mrs9gtJjlB8uPyYMniFEfRfruCYdYEl9J0uZl0lMAf6o7GdDB1zXOVhWLFAipssI6Cw";

const canvasAssetStore: TLAssetStore = {
  async upload(_asset, file) {
    const asset = await uploadCanvasImageAsset(file);
    initialCanvasPreviewWidths.set(asset.id, GENERATED_ASSET_INITIAL_PREVIEW_WIDTH);
    return {
      src: assetDisplayUrl(asset, GENERATED_ASSET_INITIAL_PREVIEW_WIDTH),
      meta: createImageAssetMeta(asset)
    };
  },
  resolve(asset, context) {
    return resolveCanvasAssetUrl(asset, context);
  }
};

const promptStarters = [
  {
    label: "产品海报",
    prompt: "一张高端护肤品产品海报，水面反光，精致布光，留出清晰标题空间"
  },
  {
    label: "室内空间",
    prompt: "一间安静的现代工作室，清晨自然光，木质家具，干净构图"
  },
  {
    label: "角色头像",
    prompt: "一个原创角色头像，温暖表情，清爽背景，细腻插画质感"
  },
  {
    label: "城市夜景",
    prompt: "未来城市夜景，雨后街道，霓虹倒影，电影感光影"
  }
] as const;
const demoComparisonExamples: DemoCanvasExample[] = [
  {
    id: "auto-category-listing",
    title: "AI 品类 Listing 套图",
    category: "品类套图",
    beforeLabel: "产品参考图",
    afterLabel: "自动拆解套图",
    brief: "根据参考图和描述自动拆解主图、卖点、细节、说明和场景图。",
    prompt: "根据 1-3 张产品参考图和商品描述，自动判断品类和平台要求，生成一套轻量 Listing Image Kit。",
    presetId: "product",
    size: { width: 1024, height: 1024 },
    quality: "auto",
    outputFormat: "png",
    createdAt: "2026-05-01T09:20:00.000Z",
    beforeUrl: createDemoImageDataUrl({
      title: "Product refs",
      subtitle: "source images",
      label: "BEFORE",
      tone: "amber",
      variant: "before"
    }),
    afterUrl: createDemoImageDataUrl({
      title: "Listing kit",
      subtitle: "auto planned scenes",
      label: "AFTER",
      tone: "teal",
      variant: "after"
    })
  },
  {
    id: "portable-blender-hero",
    title: "便携榨汁杯主图",
    category: "营销主图",
    beforeLabel: "普通产品照",
    afterLabel: "高点击夏季海报",
    brief: "把单品图扩展成饮品场景、利益点和移动端主图构图。",
    prompt: "以便携榨汁杯为主体，生成夏日厨房台面场景，突出轻量、可随身携带和一键清洗，文字简短醒目。",
    presetId: "poster",
    size: { width: 1344, height: 768 },
    quality: "medium",
    outputFormat: "png",
    createdAt: "2026-05-02T10:40:00.000Z",
    beforeUrl: createDemoImageDataUrl({
      title: "Portable blender",
      subtitle: "single SKU image",
      label: "BEFORE",
      tone: "blue",
      variant: "before"
    }),
    afterUrl: createDemoImageDataUrl({
      title: "Fresh juice anywhere",
      subtitle: "campaign main image",
      label: "AFTER",
      tone: "coral",
      variant: "after"
    })
  },
  {
    id: "pet-brush-detail",
    title: "宠物梳详情图",
    category: "原图增强",
    beforeLabel: "杂乱实拍图",
    afterLabel: "功能卖点详情图",
    brief: "清理背景，保留产品结构，生成卖点标注和使用前后对比。",
    prompt: "保留宠物梳真实结构和颜色，清理杂乱背景，生成干净详情图，展示除毛效果、圆润梳齿和握持舒适。",
    presetId: "product",
    size: { width: 1024, height: 1024 },
    quality: "high",
    outputFormat: "png",
    createdAt: "2026-05-03T14:05:00.000Z",
    beforeUrl: createDemoImageDataUrl({
      title: "Pet grooming brush",
      subtitle: "messy seller photo",
      label: "BEFORE",
      tone: "slate",
      variant: "before"
    }),
    afterUrl: createDemoImageDataUrl({
      title: "Gentle grooming",
      subtitle: "benefit detail page",
      label: "AFTER",
      tone: "mint",
      variant: "after"
    })
  },
  {
    id: "coffee-mug-translation",
    title: "咖啡杯多语言海报",
    category: "文字翻译",
    beforeLabel: "中文活动图",
    afterLabel: "英文市场素材",
    brief: "保持版式节奏，替换文字并整理成独立站促销图。",
    prompt: "将咖啡随行杯活动图改为英文独立站促销素材，保留产品位置和暖光氛围，文字更短、更适合海外用户。",
    presetId: "poster",
    size: { width: 768, height: 1344 },
    quality: "auto",
    outputFormat: "png",
    createdAt: "2026-05-04T16:30:00.000Z",
    beforeUrl: createDemoImageDataUrl({
      title: "咖啡随行杯",
      subtitle: "中文活动图",
      label: "BEFORE",
      tone: "brown",
      variant: "before"
    }),
    afterUrl: createDemoImageDataUrl({
      title: "Coffee on the go",
      subtitle: "English promo poster",
      label: "AFTER",
      tone: "violet",
      variant: "after"
    })
  }
];
const demoGalleryItems: GalleryImageItem[] = demoComparisonExamples.map(createDemoGalleryItem);
const quickSizePresetIds = new Set(["square-1k", "poster-portrait", "poster-landscape", "story-9-16", "video-16-9", "wide-2k"]);
const quickSizePresets = SIZE_PRESETS.filter((preset) => quickSizePresetIds.has(preset.id));
const ORIGINAL_SIZE_PRESET_ID = "original-size";
const ORIGINAL_SIZE_PRESET_LABEL = "原图尺寸";
const sidebarTabs: Array<{ id: SidebarTab; label: string; icon: typeof Package }> = [
  { id: "plugins", label: "插件能力", icon: Package },
  { id: "creative", label: "自主生图", icon: Brush }
];
const ecommerceModeCards = [
  {
    id: "enhance",
    icon: BadgeCheck,
    title: "原图增强",
    desc: "保留商品原貌，生成主图、卖点图和电商排版。"
  },
  {
    id: "creative",
    icon: ShoppingBag,
    title: "场景创作",
    desc: "依据主图生成生活方式、模特穿戴和搭配场景。"
  },
  {
    id: "category-kit",
    icon: Package,
    title: "品类套图",
    desc: "后台先识别商品，再动态规划整套详情页图片。"
  },
  {
    id: "marketing-main",
    icon: BadgeCheck,
    title: "营销主图设计",
    desc: "按产品、人群、场景、卖点和信任元素设计点击主图。"
  },
  {
    id: "single-poster",
    icon: Maximize2,
    title: "单品完整海报",
    desc: "依据产品图自动提炼卖点，生成一张高比例详情长海报。"
  },
  {
    id: "text-translation",
    icon: Globe2,
    title: "文字翻译",
    desc: "逐张翻译图片文字，保留版式和商品信息。"
  }
] as const;
const ecommerceModeLabels: Record<EcommerceGenerationMode, string> = {
  enhance: "原图增强",
  creative: "场景创作",
  "category-kit": "品类套图",
  "marketing-main": "营销主图设计",
  "single-poster": "单品完整海报",
  "text-translation": "文字翻译"
};
const mobileScenePreviewById: Partial<Record<EcommerceSceneTemplateId, string>> = {
  "category-kit-auto-main": "/images/mobile-scenes/category-main-apparel.png",
  "category-kit-auto-hero": "/images/mobile-scenes/category-hero-model.png",
  "category-kit-auto-overview": "/images/mobile-scenes/category-overview-toy.png",
  "category-kit-auto-benefits": "/images/mobile-scenes/category-benefit-skincare.png",
  "marketplace-main": "/images/mobile-scenes/category-main-apparel.png",
  "marketing-main-hero": "/images/mobile-scenes/category-hero-model.png",
  "marketing-main-people-scene": "/images/mobile-scenes/category-hero-model.png",
  "marketing-main-benefit-hook": "/images/mobile-scenes/category-benefit-skincare.png",
  lifestyle: "/images/mobile-scenes/category-overview-toy.png",
  "model-wear": "/images/mobile-scenes/category-hero-model.png"
};
const detailCategoryKitSceneIds = [...ECOMMERCE_DETAIL_CATEGORY_KIT_SCENE_IDS] as EcommerceSceneTemplateId[];
const ecommerceScenesByMode = {
  enhance: ["marketplace-main", "logo-benefit", "feature-benefit", "promo-poster"],
  creative: ["lifestyle", "model-wear", "accessory-match", "seasonal-campaign", "social-ad"],
  "category-kit": [...detailCategoryKitSceneIds],
  "marketing-main": ["marketing-main-hero", "marketing-main-people-scene", "marketing-main-benefit-hook", "marketing-main-trust-promo"],
  "single-poster": ["single-product-long-poster"],
  "text-translation": ["text-translation"]
} satisfies Record<EcommerceGenerationMode, EcommerceSceneTemplateId[]>;
const ecommerceSizePresetIds = new Set(["square-1k", "poster-landscape", "poster-portrait", "story-9-16", "ecommerce-long-poster"]);
const ecommerceSizePresets = SIZE_PRESETS.filter((preset) => ecommerceSizePresetIds.has(preset.id));
const emptyEcommerceStats: EcommerceStatsResponse = {
  totalJobs: 0,
  pendingJobs: 0,
  runningJobs: 0,
  succeededJobs: 0,
  partialJobs: 0,
  failedJobs: 0,
  totalScenes: 0,
  completedScenes: 0,
  succeededScenes: 0,
  failedScenes: 0,
  generatedImages: 0
};

type GalleryPageModule = { default: typeof import("./GalleryPage").GalleryPage };
let galleryPageModulePromise: Promise<GalleryPageModule> | undefined;

function loadGalleryPageModule(): Promise<GalleryPageModule> {
  galleryPageModulePromise ??= import("./GalleryPage").then((module) => ({ default: module.GalleryPage }));
  return galleryPageModulePromise;
}

const LazyGalleryPage = lazy(loadGalleryPageModule);

function preloadGalleryPage(): void {
  void loadGalleryPageModule();
}

function resolveExtensionReleaseLink(target: ExtensionReleaseTarget | undefined): PluginGuideLinks {
  const installHelpUrl = target?.installHelpUrl || defaultPluginGuideLinks.installHelpUrl;
  const rawDownloadUrl = target?.latestDownloadUrl || target?.downloadUrl || defaultPluginGuideLinks.downloadUrl;
  const downloadUrl = new URL(rawDownloadUrl, window.location.origin);
  if (target?.version) {
    downloadUrl.searchParams.set("v", target.version);
  }

  return {
    downloadUrl: downloadUrl.toString(),
    installHelpUrl: new URL(installHelpUrl, window.location.origin).toString()
  };
}

function detectBrowserKind(): BrowserKind {
  const userAgent = window.navigator.userAgent.toLowerCase();
  if (userAgent.includes("edg/")) {
    return "edge";
  }
  if (userAgent.includes("firefox/")) {
    return "firefox";
  }
  if (userAgent.includes("chrome/") || userAgent.includes("crios/")) {
    return "chrome";
  }
  return "other";
}

function browserLabel(browser: BrowserKind): string {
  switch (browser) {
    case "edge":
      return "Edge";
    case "firefox":
      return "Firefox";
    case "chrome":
      return "Chrome";
    default:
      return "当前浏览器";
  }
}

function installHelpBrowser(browser: BrowserKind): InstallHelpBrowser {
  return browser === "edge" ? "edge" : "chrome";
}

function installHelpUrlForBrowser(baseUrl: string, browser: BrowserKind): string {
  const url = new URL(baseUrl, window.location.origin);
  url.searchParams.set("browser", installHelpBrowser(browser));
  return url.toString();
}

function isExtensionProbeResponseMessage(value: unknown): value is ExtensionProbeResponseMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { source?: unknown }).source === "kuajing-image-extension" &&
    (value as { type?: unknown }).type === "kuajing-image:probe-extension-result" &&
    typeof (value as { token?: unknown }).token === "string" &&
    (value as { token: string }).token.trim().length > 0 &&
    typeof (value as { installed?: unknown }).installed === "boolean"
  );
}

function probeExtensionInstalled(timeoutMs = 1200): Promise<boolean> {
  return new Promise((resolve) => {
    const token =
      typeof window.crypto.randomUUID === "function"
        ? window.crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let settled = false;
    let timerId = 0;

    const cleanup = (): void => {
      window.removeEventListener("message", handleMessage);
      if (timerId) {
        window.clearTimeout(timerId);
      }
    };

    const finish = (installed: boolean): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(installed);
    };

    const handleMessage = (event: MessageEvent): void => {
      if (event.source !== window || event.origin !== window.location.origin || !isExtensionProbeResponseMessage(event.data) || event.data.token !== token) {
        return;
      }

      finish(event.data.installed);
    };

    window.addEventListener("message", handleMessage);
    window.postMessage(
      {
        source: "kuajing-image-web",
        type: "kuajing-image:probe-extension",
        token
      },
      window.location.origin
    );

    timerId = window.setTimeout(() => {
      finish(false);
    }, timeoutMs);
  });
}

type PersistedSnapshot = TLEditorSnapshot | TLStoreSnapshot;
type AppRoute = "canvas" | "gallery" | "account" | "help" | "admin";
type AuthMode = "login" | "register";
type AuthStatus = "checking" | "anonymous" | "authenticated";
type SaveStatus = "loading" | "saved" | "pending" | "saving" | "error";
type GenerationMode = "text" | "reference";
type MobileCreateTab = "home" | "ecommerce" | "creative" | "history";
type PanelStatusTone = "progress" | "success" | "warning" | "error";
type SidebarTab = "plugins" | "creative";
type EcommerceImageSource = { dataUrl: string; fileName: string; previewUrl: string };
type MobileReferenceImageSource = EcommerceImageSource & { assetId?: string };
type PluginGuideLinks = typeof defaultPluginGuideLinks;

interface ExtensionReleaseTarget {
  version?: string;
  downloadUrl?: string;
  latestDownloadUrl?: string;
  installHelpUrl?: string;
}

interface ExtensionReleaseResponse {
  prod?: ExtensionReleaseTarget;
}

interface ExtensionProbeResponseMessage {
  source: "kuajing-image-extension";
  type: "kuajing-image:probe-extension-result";
  token: string;
  installed: boolean;
}

interface PanelStatus {
  tone: PanelStatusTone;
  message: string;
  testId: "generation-progress" | "generation-message" | "generation-warning" | "validation-message" | "generation-error";
}

interface GenerationSubmitInput {
  prompt: string;
  presetId: StylePresetId;
  sizePresetId: string;
  size: {
    width: number;
    height: number;
  };
  quality: ImageQuality;
  outputFormat: OutputFormat;
  count: GenerationCount;
  modelConfigId?: string;
}

interface GenerationReferenceInput {
  referenceImage: ReferenceImageInput;
  referenceAssetId?: string;
}

interface GenerationPlaceholderPlacement {
  id: TLShapeId;
  x: number;
  y: number;
  width: number;
  height: number;
  targetWidth: number;
  targetHeight: number;
}

interface ActiveGenerationPlaceholders {
  requestId: number;
  placements: GenerationPlaceholderPlacement[];
}

interface ActiveGenerationTask {
  requestId: number;
  temporaryRecordId: string;
  controller: AbortController;
  placeholderSet: ActiveGenerationPlaceholders;
}

type ReferenceSelection =
  | {
      status: "none" | "multiple" | "non-image" | "unreadable";
      hint: string;
    }
  | {
      status: "ready";
      shapeId: TLShapeId;
      assetId: TLAssetId | null;
      localAssetId?: string;
      name: string;
      sourceUrl: string;
      width: number;
      height: number;
      selectionMode: "image" | "region";
      markerShapeIds: TLShapeId[];
      hint: string;
    };

const missingReferenceSelection: ReferenceSelection = {
  status: "none",
  hint: "选择画布中的一张图片后，可用它作为参考生成到画布。"
};

const qualityLabels: Record<ImageQuality, string> = {
  auto: "自动",
  low: "快速草稿",
  medium: "标准",
  high: "高质量"
};

const formatLabels: Record<OutputFormat, string> = {
  png: "PNG",
  jpeg: "JPEG",
  webp: "WebP"
};

const stylePresetLabels: Record<StylePresetId, string> = {
  none: "无风格",
  photoreal: "真实摄影",
  product: "商业产品",
  illustration: "精致插画",
  poster: "海报视觉",
  avatar: "头像角色"
};

const sizePresetLabels: Record<string, string> = {
  "square-1k": "方形成图 1K",
  "poster-portrait": "竖版海报",
  "poster-landscape": "横版海报",
  "story-9-16": "竖屏故事",
  "video-16-9": "视频封面",
  "wide-2k": "宽屏展示 2K",
  "portrait-2k": "高清竖图 2K",
  "square-2k": "高清方图 2K",
  "wide-4k": "宽屏展示 4K"
};

const modeLabels: Record<GenerationRecord["mode"], string> = {
  generate: "提示词到画布",
  edit: "参考图到画布"
};

const statusLabels: Record<GenerationStatus, string> = {
  pending: "等待中",
  running: "生成中",
  succeeded: "已完成",
  partial: "部分完成",
  failed: "失败",
  cancelled: "已取消"
};

const panelStatusStyles: Record<PanelStatusTone, string> = {
  progress: "panel-status--progress",
  success: "panel-status--success",
  warning: "panel-status--warning",
  error: "panel-status--error"
};

const historyStatusStyles: Record<GenerationStatus, string> = {
  pending: "history-status--pending",
  running: "history-status--running",
  succeeded: "history-status--succeeded",
  partial: "history-status--partial",
  failed: "history-status--failed",
  cancelled: "history-status--cancelled"
};

function createDemoImageDataUrl({
  title,
  subtitle,
  label,
  tone,
  variant
}: {
  title: string;
  subtitle: string;
  label: string;
  tone: "amber" | "blue" | "brown" | "coral" | "mint" | "slate" | "teal" | "violet";
  variant: "before" | "after";
}): string {
  const palettes = {
    amber: ["#fff7ed", "#f59e0b", "#7c2d12", "#fed7aa"],
    blue: ["#eff6ff", "#2563eb", "#172554", "#bfdbfe"],
    brown: ["#faf7f2", "#92400e", "#2c1810", "#e7d2b8"],
    coral: ["#fff1f2", "#f97316", "#7f1d1d", "#fecdd3"],
    mint: ["#ecfdf5", "#0f766e", "#064e3b", "#bbf7d0"],
    slate: ["#f8fafc", "#64748b", "#1e293b", "#cbd5e1"],
    teal: ["#f0fdfa", "#0f766e", "#042f2e", "#99f6e4"],
    violet: ["#f5f3ff", "#7c3aed", "#2e1065", "#ddd6fe"]
  } satisfies Record<typeof tone, [string, string, string, string]>;
  const [background, accent, ink, soft] = palettes[tone];
  const safeTitle = escapeDemoSvgText(title);
  const safeSubtitle = escapeDemoSvgText(subtitle);
  const safeLabel = escapeDemoSvgText(label);
  const showAfterDetails = variant === "after";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900" role="img" aria-label="${safeTitle}">
  <rect width="1200" height="900" fill="${background}"/>
  <rect x="54" y="54" width="1092" height="792" rx="44" fill="#ffffff" opacity="0.72"/>
  <rect x="94" y="96" width="1012" height="708" rx="34" fill="${soft}" opacity="0.42"/>
  <circle cx="320" cy="410" r="142" fill="${accent}" opacity="${showAfterDetails ? "0.9" : "0.5"}"/>
  <rect x="232" y="288" width="260" height="260" rx="64" fill="#ffffff" opacity="0.82"/>
  <path d="M250 536c72-108 142-162 210-162 65 0 118 39 160 118 38-42 78-63 120-63 77 0 146 54 207 162" fill="none" stroke="${ink}" stroke-width="28" stroke-linecap="round" stroke-linejoin="round" opacity="${showAfterDetails ? "0.92" : "0.42"}"/>
  <circle cx="826" cy="282" r="92" fill="#ffffff" opacity="0.82"/>
  <circle cx="826" cy="282" r="44" fill="${accent}" opacity="${showAfterDetails ? "0.9" : "0.4"}"/>
  <rect x="660" y="452" width="296" height="34" rx="17" fill="${ink}" opacity="${showAfterDetails ? "0.82" : "0.25"}"/>
  <rect x="660" y="514" width="382" height="26" rx="13" fill="${ink}" opacity="${showAfterDetails ? "0.42" : "0.18"}"/>
  <rect x="660" y="566" width="318" height="26" rx="13" fill="${ink}" opacity="${showAfterDetails ? "0.34" : "0.16"}"/>
  ${showAfterDetails ? `<path d="M166 706h868" stroke="${accent}" stroke-width="18" stroke-linecap="round" opacity="0.42"/>
  <rect x="172" y="666" width="156" height="54" rx="27" fill="${accent}" opacity="0.92"/>
  <rect x="360" y="666" width="156" height="54" rx="27" fill="#ffffff" opacity="0.82"/>
  <rect x="548" y="666" width="156" height="54" rx="27" fill="#ffffff" opacity="0.82"/>` : `<path d="M156 700h860" stroke="${ink}" stroke-width="14" stroke-linecap="round" opacity="0.15"/>`}
  <rect x="96" y="96" width="154" height="42" rx="21" fill="${ink}" opacity="0.9"/>
  <text x="173" y="124" fill="#ffffff" font-family="Arial, sans-serif" font-size="22" font-weight="700" text-anchor="middle">${safeLabel}</text>
  <text x="102" y="212" fill="${ink}" font-family="Arial, sans-serif" font-size="58" font-weight="800">${safeTitle}</text>
  <text x="104" y="264" fill="${ink}" opacity="0.68" font-family="Arial, sans-serif" font-size="30" font-weight="600">${safeSubtitle}</text>
</svg>`;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function escapeDemoSvgText(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;");
}

function createDemoGalleryItem(example: DemoCanvasExample): GalleryImageItem {
  return {
    outputId: `demo-output-${example.id}`,
    generationId: `demo-generation-${example.id}`,
    userId: "public-demo",
    userDisplayName: "官方演示",
    mode: "edit",
    prompt: example.prompt,
    effectivePrompt: example.prompt,
    presetId: example.presetId,
    size: example.size,
    quality: example.quality,
    outputFormat: example.outputFormat,
    model: "demo-curated",
    modelDisplayName: "Demo Curated",
    createdAt: example.createdAt,
    asset: {
      id: `demo-asset-${example.id}`,
      url: example.afterUrl,
      cdnUrl: example.afterUrl,
      cdnPreviewUrls: {
        "512": example.afterUrl,
        "1024": example.afterUrl
      },
      fileName: `${example.id}.svg`,
      mimeType: "image/svg+xml",
      width: example.size.width,
      height: example.size.height
    }
  };
}

function parseDemoCanvasExamples(body: DemoCanvasConfigResponse): DemoCanvasExample[] {
  const source = Array.isArray(body.examples) ? body.examples : [];
  return source
    .filter((example): example is DemoCanvasExample => Boolean(example?.id && example.beforeUrl && example.afterUrl))
    .map((example, index) => ({
      ...example,
      sortOrder: typeof example.sortOrder === "number" ? example.sortOrder : index * 10
    }))
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.createdAt.localeCompare(b.createdAt));
}

function sizePresetLabel(preset: SizePreset): string {
  return sizePresetLabels[preset.id] ?? preset.label;
}

function sizePresetOptionLabel(preset: SizePreset): string {
  return `${sizePresetLabel(preset)} - ${preset.width} x ${preset.height}`;
}

function originalSizePresetOptionLabel(widthValue: number, heightValue: number): string {
  return `${ORIGINAL_SIZE_PRESET_LABEL} - ${Math.round(widthValue)} x ${Math.round(heightValue)}`;
}

function normalizeDimension(value: string): number {
  return Number.parseInt(value, 10);
}

function sizeValidationMessage(width: number, height: number): string {
  const result = validateImageSize({ width, height });

  if (result.ok) {
    return "";
  }

  return result.message;
}

function generationValidationMessage(promptValue: string, widthValue: number, heightValue: number): string {
  return promptValue.trim() ? sizeValidationMessage(widthValue, heightValue) : "请输入提示词。";
}

function routeFromLocation(): AppRoute {
  if (window.location.pathname === "/gallery") {
    return "gallery";
  }
  if (window.location.pathname === "/account") {
    return "account";
  }
  if (window.location.pathname === "/help") {
    return "help";
  }
  if (window.location.pathname === "/admin") {
    return "admin";
  }
  return "canvas";
}

function pathForRoute(route: AppRoute): string {
  if (route === "gallery") {
    return "/gallery";
  }
  if (route === "account") {
    return "/account";
  }
  if (route === "help") {
    return "/help";
  }
  if (route === "admin") {
    return "/admin";
  }
  return "/";
}

function isPersistedSnapshot(value: unknown): value is PersistedSnapshot {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isGenerationResponse(value: unknown): value is GenerationResponse {
  return typeof value === "object" && value !== null && "record" in value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLoadingGenerationPlaceholderRecord(value: unknown): boolean {
  return (
    isRecord(value) &&
    value.typeName === "shape" &&
    value.type === GENERATION_PLACEHOLDER_TYPE &&
    isRecord(value.props) &&
    value.props.status === "loading"
  );
}

function filterLoadingPlaceholdersFromStoreSnapshot<TSnapshot>(snapshot: TSnapshot): TSnapshot {
  if (!isRecord(snapshot) || !isRecord(snapshot.store)) {
    return snapshot;
  }

  let removed = false;
  const nextStore: Record<string, unknown> = {};
  for (const [id, record] of Object.entries(snapshot.store)) {
    if (isLoadingGenerationPlaceholderRecord(record)) {
      removed = true;
      continue;
    }

    nextStore[id] = record;
  }

  return removed ? ({ ...snapshot, store: nextStore } as TSnapshot) : snapshot;
}

function filterLoadingPlaceholdersFromSnapshot<TSnapshot>(snapshot: TSnapshot): TSnapshot {
  if (!isRecord(snapshot)) {
    return snapshot;
  }

  if (isRecord(snapshot.document)) {
    const document = filterLoadingPlaceholdersFromStoreSnapshot(snapshot.document);
    return document === snapshot.document ? snapshot : ({ ...snapshot, document } as TSnapshot);
  }

  return filterLoadingPlaceholdersFromStoreSnapshot(snapshot);
}

function coerceStylePresetId(value: string): StylePresetId {
  return STYLE_PRESETS.some((preset) => preset.id === value) ? (value as StylePresetId) : "none";
}

function coerceGenerationCount(value: number): GenerationCount {
  return GENERATION_COUNTS.includes(value as GenerationCount) ? (value as GenerationCount) : 1;
}

function sizePresetIdForSize(widthValue: number, heightValue: number): string {
  return (
    SIZE_PRESETS.find((preset) => preset.width === widthValue && preset.height === heightValue)?.id ?? CUSTOM_SIZE_PRESET_ID
  );
}

function firstDownloadableAsset(record: GenerationRecord): GeneratedAsset | undefined {
  return record.outputs.find((output) => output.status === "succeeded" && output.asset)?.asset;
}

function successfulOutputCount(record: GenerationRecord): number {
  return record.outputs.filter((output) => output.status === "succeeded" && output.asset).length;
}

function cloudFailureCount(record: GenerationRecord): number {
  return record.outputs.filter((output) => output.asset?.cloud?.status === "failed").length;
}

function firstCloudFailureMessage(record: GenerationRecord): string | undefined {
  return record.outputs.find((output) => output.asset?.cloud?.status === "failed")?.asset?.cloud?.lastError;
}

function generationModeToRecordMode(mode: GenerationMode): GenerationRecord["mode"] {
  return mode === "reference" ? "edit" : "generate";
}

function createTemporaryGenerationRecord(input: {
  requestId: number;
  submitInput: GenerationSubmitInput;
  requestMode: GenerationMode;
  referenceAssetId?: string;
}): GenerationRecord {
  const promptValue = input.submitInput.prompt.trim();

  return {
    id: `local-generation-${input.requestId}`,
    mode: generationModeToRecordMode(input.requestMode),
    prompt: promptValue,
    effectivePrompt: promptValue,
    presetId: input.submitInput.presetId,
    size: input.submitInput.size,
    quality: input.submitInput.quality,
    outputFormat: input.submitInput.outputFormat,
    count: input.submitInput.count,
    status: "running",
    referenceAssetId: input.referenceAssetId,
    createdAt: new Date().toISOString(),
    outputs: []
  };
}

function createEcommerceCombinedRecord(input: {
  job: EcommerceBatchGenerateResponse;
  prompt: string;
  size: ImageSize;
  presetId: StylePresetId;
  outputFormat: OutputFormat;
  count: number;
}): GenerationRecord {
  const records = input.job.records;
  const outputs = records.flatMap((record) => record.outputs);
  const failedRecords = records.filter((record) => record.status === "failed").length;
  const status: GenerationStatus =
    input.job.status === "failed"
      ? "failed"
      : input.job.status === "partial" || failedRecords > 0
        ? "partial"
        : input.job.status === "succeeded"
          ? "succeeded"
          : "running";

  return {
    id: input.job.jobId,
    mode: "edit",
    prompt: input.prompt,
    effectivePrompt: input.prompt,
    presetId: input.presetId,
    size: input.size,
    quality: "auto",
    outputFormat: input.outputFormat,
    count: input.count,
    status,
    error: status === "failed" ? input.job.message : undefined,
    createdAt: input.job.createdAt,
    outputs
  };
}

function promptExcerpt(promptValue: string): string {
  const compact = promptValue.replace(/\s+/gu, " ").trim();
  return compact.length > 72 ? `${compact.slice(0, 72)}...` : compact;
}

async function writeClipboardText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.readOnly = true;
  textArea.style.position = "fixed";
  textArea.style.left = "-9999px";
  textArea.style.top = "0";
  document.body.append(textArea);
  textArea.select();

  try {
    const copied = document.execCommand("copy");
    if (!copied) {
      throw new Error("Copy command was not accepted.");
    }
  } finally {
    textArea.remove();
  }
}

function formatCreatedTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatCurrency(valueCents: number, currency = "CNY"): string {
  const amount = Number.isFinite(valueCents) ? valueCents / 100 : 0;
  try {
    return new Intl.NumberFormat("zh-CN", {
      style: "currency",
      currency,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2
    }).format(amount);
  } catch {
    return `¥${amount.toFixed(amount % 1 === 0 ? 0 : 2)}`;
  }
}

function createTldrawAssetId(assetId: string): TLAssetId {
  return `asset:${assetId}` as TLAssetId;
}

function createTldrawShapeId(): TLShapeId {
  return `shape:${createClientId()}` as TLShapeId;
}

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

function displaySize(size: ImageSize): { width: number; height: number } {
  const scale = Math.min(1, 340 / size.width, 300 / size.height);
  return {
    width: Math.round(size.width * scale),
    height: Math.round(size.height * scale)
  };
}

function createCenteredPlacements(editor: Editor, countValue: GenerationCount, size: ImageSize): GenerationPlaceholderPlacement[] {
  const placeholderSize = displaySize(size);
  const columns = countValue === 1 ? 1 : 2;
  const rows = Math.ceil(countValue / columns);
  const gap = 48;
  const cellWidth = placeholderSize.width;
  const cellHeight = placeholderSize.height;
  const gridWidth = columns * cellWidth + (columns - 1) * gap;
  const gridHeight = rows * cellHeight + (rows - 1) * gap;
  const viewport = editor.getViewportPageBounds();
  const originX = viewport.center.x - gridWidth / 2;
  const originY = viewport.center.y - gridHeight / 2;

  return Array.from({ length: countValue }, (_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);

    return {
      id: createTldrawShapeId(),
      x: originX + column * (cellWidth + gap),
      y: originY + row * (cellHeight + gap),
      width: placeholderSize.width,
      height: placeholderSize.height,
      targetWidth: size.width,
      targetHeight: size.height
    };
  });
}

function createGenerationPlaceholders(
  editor: Editor,
  input: GenerationSubmitInput,
  requestId: number,
  options: { selectPlaceholders?: boolean } = {}
): ActiveGenerationPlaceholders {
  const placements = createCenteredPlacements(editor, input.count, input.size);
  const placeholderIds = placements.map((placement) => placement.id);

  editor.createShapes<GenerationPlaceholderShape>(
    placements.map((placement, index) => ({
      id: placement.id,
      type: GENERATION_PLACEHOLDER_TYPE,
      x: placement.x,
      y: placement.y,
      props: {
        w: placement.width,
        h: placement.height,
        targetWidth: placement.targetWidth,
        targetHeight: placement.targetHeight,
        status: "loading",
        error: "",
        requestId: String(requestId),
        outputIndex: index
      }
    }))
  );
  editor.bringToFront(placeholderIds);
  if (options.selectPlaceholders ?? true) {
    editor.select(...placeholderIds);
  }

  return {
    requestId,
    placements
  };
}

function createEcommerceBatchPlaceholders(
  editor: Editor,
  totalCount: number,
  size: ImageSize,
  requestId: number
): ActiveGenerationPlaceholders {
  const placeholderSize = displaySize(size);
  const columns = totalCount === 1 ? 1 : 2;
  const rows = Math.ceil(totalCount / columns);
  const gap = 48;
  const gridWidth = columns * placeholderSize.width + (columns - 1) * gap;
  const gridHeight = rows * placeholderSize.height + (rows - 1) * gap;
  const viewport = editor.getViewportPageBounds();
  const placements: GenerationPlaceholderPlacement[] = Array.from({ length: totalCount }, (_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);

    return {
      id: createTldrawShapeId(),
      x: viewport.center.x - gridWidth / 2 + column * (placeholderSize.width + gap),
      y: viewport.center.y - gridHeight / 2 + row * (placeholderSize.height + gap),
      width: placeholderSize.width,
      height: placeholderSize.height,
      targetWidth: size.width,
      targetHeight: size.height
    };
  });

  editor.createShapes<GenerationPlaceholderShape>(
    placements.map((placement, index) => ({
      id: placement.id,
      type: GENERATION_PLACEHOLDER_TYPE,
      x: placement.x,
      y: placement.y,
      props: {
        w: placement.width,
        h: placement.height,
        targetWidth: placement.targetWidth,
        targetHeight: placement.targetHeight,
        status: "loading",
        error: "",
        requestId: String(requestId),
        outputIndex: index
      }
    }))
  );
  editor.bringToFront(placements.map((placement) => placement.id));
  editor.select(...placements.map((placement) => placement.id));

  return {
    requestId,
    placements
  };
}

function isGenerationPlaceholderShape(shape: unknown): shape is GenerationPlaceholderShape {
  return isRecord(shape) && shape.type === GENERATION_PLACEHOLDER_TYPE;
}

function livePlacement(editor: Editor, placement: GenerationPlaceholderPlacement): GenerationPlaceholderPlacement {
  const shape = editor.getShape(placement.id);
  if (!isGenerationPlaceholderShape(shape)) {
    return placement;
  }

  return {
    ...placement,
    x: shape.x,
    y: shape.y,
    width: shape.props.w,
    height: shape.props.h
  };
}

function createImageAsset(asset: GeneratedAsset): TLAsset {
  initialCanvasPreviewWidths.set(asset.id, GENERATED_ASSET_INITIAL_PREVIEW_WIDTH);
  const displayUrl = assetDisplayUrl(asset, GENERATED_ASSET_INITIAL_PREVIEW_WIDTH);
  const meta = createImageAssetMeta(asset);

  return {
    id: createTldrawAssetId(asset.id),
    typeName: "asset",
    type: "image",
    props: {
      src: displayUrl,
      w: asset.width,
      h: asset.height,
      name: asset.fileName,
      mimeType: asset.mimeType,
      isAnimated: false
    },
    meta
  };
}

function createImageAssetMeta(asset: GeneratedAsset): TLAsset["meta"] {
  const meta: Record<string, string | Record<string, string>> = {
    localAssetId: asset.id,
    sourceUrl: authenticatedAssetUrl(asset.url)
  };

  if (asset.cdnUrl) {
    meta.cdnUrl = asset.cdnUrl;
  }

  const cdnPreviewUrls = sanitizeStringRecord(asset.cdnPreviewUrls);
  if (cdnPreviewUrls) {
    meta.cdnPreviewUrls = cdnPreviewUrls;
  }

  return meta;
}

function sanitizeStringRecord(value: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!value) {
    return undefined;
  }

  const entries = Object.entries(value).filter((entry): entry is [string, string] => entry[0].trim().length > 0 && typeof entry[1] === "string" && entry[1].trim().length > 0);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function createImageShape(
  asset: GeneratedAsset,
  placement: GenerationPlaceholderPlacement,
  promptValue: string
): Partial<TLImageShape> & { id: TLShapeId; type: "image" } {
  const assetId = createTldrawAssetId(asset.id);
  const displayUrl = assetDisplayUrl(asset, GENERATED_ASSET_INITIAL_PREVIEW_WIDTH);

  return {
    id: createTldrawShapeId(),
    type: "image",
    x: placement.x,
    y: placement.y,
    props: {
      assetId,
      w: placement.width,
      h: placement.height,
      url: displayUrl,
      playing: true,
      crop: null,
      flipX: false,
      flipY: false,
      altText: promptValue
    }
  };
}

function isCanvasInsertableAsset(asset: GeneratedAsset): boolean {
  return (
    asset.id.trim().length > 0 &&
    assetDisplayUrl(asset, GENERATED_ASSET_INITIAL_PREVIEW_WIDTH).trim().length > 0 &&
    Number.isFinite(asset.width) &&
    Number.isFinite(asset.height) &&
    asset.width > 0 &&
    asset.height > 0
  );
}

function createCenteredImagePlacement(editor: Editor, asset: GeneratedAsset): GenerationPlaceholderPlacement {
  const imageSize = displaySize({
    width: asset.width,
    height: asset.height
  });
  const viewport = editor.getViewportPageBounds();

  return {
    id: createTldrawShapeId(),
    x: viewport.center.x - imageSize.width / 2,
    y: viewport.center.y - imageSize.height / 2,
    width: imageSize.width,
    height: imageSize.height,
    targetWidth: asset.width,
    targetHeight: asset.height
  };
}

function insertGalleryImageOnCanvas(editor: Editor, item: GalleryImageItem): TLShapeId {
  const assetId = createTldrawAssetId(item.asset.id);
  const placement = createCenteredImagePlacement(editor, item.asset);
  const imageShape = createImageShape(item.asset, placement, item.prompt);

  editor.run(() => {
    if (!editor.getAsset(assetId)) {
      editor.createAssets([createImageAsset(item.asset)]);
    }
    editor.createShapes([imageShape]);
  });
  editor.select(imageShape.id);
  editor.bringToFront([imageShape.id]);

  return imageShape.id;
}

function replaceGenerationPlaceholders(editor: Editor, placeholderSet: ActiveGenerationPlaceholders, record: GenerationRecord): number {
  const assets: TLAsset[] = [];
  const queuedAssetIds = new Set<TLAssetId>();
  const imageShapes: Array<Partial<TLImageShape> & { id: TLShapeId; type: "image" }> = [];
  const replacedPlaceholderIds: TLShapeId[] = [];
  const failedUpdates: Array<TLShapePartial<GenerationPlaceholderShape>> = [];

  placeholderSet.placements.forEach((placement, index) => {
    const output = record.outputs[index];
    if (output?.status === "succeeded" && output.asset) {
      if (!isCanvasInsertableAsset(output.asset)) {
        if (isGenerationPlaceholderShape(editor.getShape(placement.id))) {
          failedUpdates.push({
            id: placement.id,
            type: GENERATION_PLACEHOLDER_TYPE,
            props: {
              status: "failed",
              error: "生成图片资源异常，无法插入画布。"
            }
          });
        }
        return;
      }

      const assetId = createTldrawAssetId(output.asset.id);
      const resolvedPlacement = livePlacement(editor, placement);
      if (!editor.getAsset(assetId) && !queuedAssetIds.has(assetId)) {
        queuedAssetIds.add(assetId);
        assets.push(createImageAsset(output.asset));
      }
      imageShapes.push(createImageShape(output.asset, resolvedPlacement, record.prompt));
      if (isGenerationPlaceholderShape(editor.getShape(placement.id))) {
        replacedPlaceholderIds.push(placement.id);
      }
      return;
    }

    if (isGenerationPlaceholderShape(editor.getShape(placement.id))) {
      failedUpdates.push({
        id: placement.id,
        type: GENERATION_PLACEHOLDER_TYPE,
        props: {
          status: "failed",
          error: output?.error || record.error || "生成到画布失败。"
        }
      });
    }
  });

  editor.run(() => {
    if (replacedPlaceholderIds.length > 0) {
      editor.deleteShapes(replacedPlaceholderIds);
    }
    if (assets.length > 0) {
      editor.createAssets(assets);
    }
    if (imageShapes.length > 0) {
      editor.createShapes(imageShapes);
    }
    if (failedUpdates.length > 0) {
      editor.updateShapes<GenerationPlaceholderShape>(failedUpdates);
    }
  });

  if (imageShapes.length > 0) {
    editor.select(...imageShapes.map((shape) => shape.id));
  }

  return imageShapes.length;
}

function generatedAssetsForRecord(record: GenerationRecord): GeneratedAsset[] {
  return record.outputs.flatMap((output) => (output.status === "succeeded" && output.asset ? [output.asset] : []));
}

async function preloadGenerationRecordPreviews(record: GenerationRecord, signal: AbortSignal): Promise<void> {
  await Promise.all(generatedAssetsForRecord(record).map((asset) => preloadGeneratedAssetPreview(asset, signal)));
}

async function preloadGeneratedAssetPreview(asset: GeneratedAsset, signal: AbortSignal): Promise<void> {
  try {
    await preloadImageUrl(assetDisplayUrl(asset, GENERATED_ASSET_INITIAL_PREVIEW_WIDTH), signal);
  } catch (error) {
    if (signal.aborted) {
      throw error;
    }
  }
}

function preloadImageUrl(url: string, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.reject(new DOMException("Image preload was aborted.", "AbortError"));
  }

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";

    function cleanup(): void {
      image.onload = null;
      image.onerror = null;
      signal.removeEventListener("abort", abort);
    }
    function complete(): void {
      cleanup();
      resolve();
    }
    function fail(): void {
      cleanup();
      reject(new Error(`Image preload failed for ${url}`));
    }
    function abort(): void {
      cleanup();
      image.src = "";
      reject(new DOMException("Image preload was aborted.", "AbortError"));
    }

    image.onload = complete;
    image.onerror = fail;
    signal.addEventListener("abort", abort, { once: true });
    image.src = url;
  });
}

function markGenerationPlaceholdersFailed(editor: Editor, placeholderSet: ActiveGenerationPlaceholders, error: string): void {
  const updates = placeholderSet.placements.flatMap((placement) => {
    const shape = editor.getShape(placement.id);
    if (!isGenerationPlaceholderShape(shape) || shape.props.status !== "loading") {
      return [];
    }

    return [
      {
        id: placement.id,
        type: GENERATION_PLACEHOLDER_TYPE,
        props: {
          status: "failed",
          error
        }
      } satisfies TLShapePartial<GenerationPlaceholderShape>
    ];
  });

  if (updates.length > 0) {
    editor.updateShapes<GenerationPlaceholderShape>(updates);
  }
}

function deleteLoadingGenerationPlaceholders(editor: Editor, placeholderSet: ActiveGenerationPlaceholders): void {
  const loadingPlaceholderIds = placeholderSet.placements.flatMap((placement) => {
    const shape = editor.getShape(placement.id);
    return isGenerationPlaceholderShape(shape) && shape.props.status === "loading" ? [placement.id] : [];
  });

  if (loadingPlaceholderIds.length > 0) {
    editor.deleteShapes(loadingPlaceholderIds);
  }
}

function firstLiveGenerationPlaceholder(editor: Editor, placeholderSet: ActiveGenerationPlaceholders): TLShapeId | undefined {
  return placeholderSet.placements.find((placement) => isGenerationPlaceholderShape(editor.getShape(placement.id)))?.id;
}

function resolveReferenceSelection(editor: Editor): ReferenceSelection {
  const selectedShapes = editor.getSelectedShapes();

  if (selectedShapes.length === 0) {
    return missingReferenceSelection;
  }

  const imageShapes = selectedShapes.filter((shape): shape is TLImageShape => shape.type === "image");
  let imageShape: TLImageShape | undefined = chooseReferenceImageShape(editor, imageShapes, selectedShapes);
  if (imageShapes.length > 1 && !imageShape) {
    return {
      status: "multiple",
      hint: "当前选中了多张图片。只保留一张图片作为参考即可。"
    };
  }

  const regionShapeCount = selectedShapes.length - imageShapes.length;

  if (!imageShape) {
    const selectionBounds = editor.getSelectionPageBounds();
    if (selectionBounds) {
      const hitShapes = editor.getShapesAtPoint(selectionBounds.center, { hitInside: true, margin: 4 });
      imageShape = hitShapes.find((shape): shape is TLImageShape => shape.type === "image");
    }
  }

  if (!imageShape) {
    return {
      status: selectedShapes.length > 1 ? "multiple" : "non-image",
      hint: "请先选中一张图片，或者先圈出图片上的局部区域。"
    };
  }

  const asset = imageShape.props.assetId ? editor.getAsset(imageShape.props.assetId) : undefined;
  const sourceUrl = getImageSourceUrl(imageShape, asset);
  const localAssetId = getLocalAssetId(asset, sourceUrl);

  if (!sourceUrl) {
    return {
      status: "unreadable",
      hint: "这张图片缺少可读取的数据源，无法作为参考图。"
    };
  }

  if (!localAssetId && !isReadableReferenceSource(sourceUrl, asset)) {
    return {
      status: "unreadable",
      hint: "这张图片当前无法被浏览器读取，请选择本地生成或已导入的 PNG、JPEG、WebP 图片。"
    };
  }

  const markerShapes = resolveReferenceMarkerShapes(editor, imageShape, selectedShapes, {
    includeUnselectedMarkers: regionShapeCount === 0
  });
  const selectionMode = markerShapes.length > 0 ? "region" : "image";
  return {
    status: "ready",
    shapeId: imageShape.id,
    assetId: imageShape.props.assetId,
    localAssetId,
    name: getReferenceName(asset, sourceUrl),
    sourceUrl,
    width: asset?.type === "image" ? asset.props.w : imageShape.props.w,
    height: asset?.type === "image" ? asset.props.h : imageShape.props.h,
    selectionMode,
    markerShapeIds: markerShapes.map((shape) => shape.id),
    hint:
      selectionMode === "region"
        ? "已识别图片上的局部标记，生成时会把标记范围当作编辑蒙版。"
        : "已选中一张图片，将使用它作为本次参考图。"
  };
}

function areReferenceSelectionsEqual(left: ReferenceSelection, right: ReferenceSelection): boolean {
  if (left.status !== right.status) {
    return false;
  }

  if (left.status !== "ready" || right.status !== "ready") {
    return left.hint === right.hint;
  }

  return (
    left.shapeId === right.shapeId &&
    left.assetId === right.assetId &&
    left.localAssetId === right.localAssetId &&
    left.name === right.name &&
    left.sourceUrl === right.sourceUrl &&
    left.width === right.width &&
    left.height === right.height &&
    left.selectionMode === right.selectionMode &&
    areShapeIdListsEqual(left.markerShapeIds, right.markerShapeIds) &&
    left.hint === right.hint
  );
}

function areShapeIdListsEqual(left: TLShapeId[], right: TLShapeId[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function chooseReferenceImageShape(editor: Editor, imageShapes: TLImageShape[], selectedShapes: TLShape[]): TLImageShape | undefined {
  if (imageShapes.length <= 1) {
    return imageShapes[0];
  }

  const candidates = imageShapes
    .map((shape) => {
      const bounds = editor.getShapePageBounds(shape);
      return {
        shape,
        area: bounds && bounds.isValid() ? rectArea(boundsToRect(bounds)) : 0
      };
    })
    .sort((left, right) => right.area - left.area);
  const primary = candidates[0];
  if (!primary || primary.area <= 0) {
    return undefined;
  }

  const selectedMarkerCandidates = selectedShapes.filter((shape) => shape.id !== primary.shape.id);
  return selectedMarkerCandidates.every((shape) => isReferenceMarkerShape(editor, primary.shape, shape)) ? primary.shape : undefined;
}

function resolveReferenceMarkerShapes(
  editor: Editor,
  baseShape: TLImageShape,
  selectedShapes: TLShape[],
  options: { includeUnselectedMarkers: boolean }
): TLShape[] {
  const selectedShapeIds = new Set(selectedShapes.map((shape) => shape.id));
  const candidates = [
    ...selectedShapes.filter((shape) => shape.id !== baseShape.id),
    ...(options.includeUnselectedMarkers
      ? editor
          .getCurrentPageShapes()
          .filter((shape) => shape.id !== baseShape.id && shape.type !== "image" && !selectedShapeIds.has(shape.id))
      : [])
  ];
  const markerShapes = candidates.filter((shape) => isReferenceMarkerShape(editor, baseShape, shape));
  const markerShapeIds = new Set<TLShapeId>();
  return markerShapes.filter((shape) => {
    if (markerShapeIds.has(shape.id)) {
      return false;
    }
    markerShapeIds.add(shape.id);
    return true;
  });
}

function isReferenceMarkerShape(editor: Editor, baseShape: TLImageShape, shape: TLShape): boolean {
  if (shape.id === baseShape.id) {
    return false;
  }

  const baseBounds = editor.getShapePageBounds(baseShape);
  const shapeBounds = editor.getShapePageBounds(shape);
  if (!baseBounds || !shapeBounds || !baseBounds.isValid() || !shapeBounds.isValid()) {
    return false;
  }

  const baseRect = boundsToRect(baseBounds);
  const shapeRect = boundsToRect(shapeBounds);
  const shapeArea = rectArea(shapeRect);
  const baseArea = rectArea(baseRect);
  if (shapeArea <= 0 || baseArea <= 0) {
    return false;
  }

  const overlapArea = rectOverlapArea(baseRect, shapeRect);
  if (overlapArea <= 0 || overlapArea / shapeArea < 0.45) {
    return false;
  }

  return shape.type !== "image" || shapeArea / baseArea < 0.25;
}

function boundsToRect(bounds: Box): { minX: number; minY: number; maxX: number; maxY: number } {
  const xs = bounds.corners.map((point) => point.x);
  const ys = bounds.corners.map((point) => point.y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys)
  };
}

function rectArea(rect: { minX: number; minY: number; maxX: number; maxY: number }): number {
  return Math.max(0, rect.maxX - rect.minX) * Math.max(0, rect.maxY - rect.minY);
}

function rectOverlapArea(
  left: { minX: number; minY: number; maxX: number; maxY: number },
  right: { minX: number; minY: number; maxX: number; maxY: number }
): number {
  const width = Math.max(0, Math.min(left.maxX, right.maxX) - Math.max(left.minX, right.minX));
  const height = Math.max(0, Math.min(left.maxY, right.maxY) - Math.max(left.minY, right.minY));
  return width * height;
}

function getImageSourceUrl(shape: TLImageShape, asset: TLAsset | undefined): string | undefined {
  const assetSourceUrl = getCanvasAssetMetaString(asset, "sourceUrl");
  if (assetSourceUrl) {
    return assetSourceUrl;
  }

  const assetUrl = asset?.type === "image" && typeof asset.props.src === "string" ? asset.props.src : undefined;
  if (assetUrl) {
    return assetUrl;
  }

  return shape.props.url || undefined;
}

function getAssetMimeType(asset: TLAsset | undefined): string | undefined {
  return asset?.type === "image" && typeof asset.props.mimeType === "string" ? asset.props.mimeType : undefined;
}

function isReadableReferenceSource(sourceUrl: string, asset: TLAsset | undefined): boolean {
  const assetMimeType = getAssetMimeType(asset);
  if (assetMimeType && !isSupportedReferenceImageType(assetMimeType)) {
    return false;
  }

  if (sourceUrl.startsWith("data:")) {
    const mimeType = /^data:([^;,]+)/iu.exec(sourceUrl)?.[1];
    return Boolean(mimeType && isSupportedReferenceImageType(mimeType));
  }

  if (sourceUrl.startsWith("blob:")) {
    return true;
  }

  try {
    return new URL(sourceUrl, window.location.origin).origin === window.location.origin;
  } catch {
    return false;
  }
}

function getReferenceName(asset: TLAsset | undefined, sourceUrl: string): string {
  if (asset?.type === "image" && asset.props.name) {
    return asset.props.name;
  }

  try {
    const pathname = new URL(sourceUrl, window.location.origin).pathname;
    return pathname.split("/").filter(Boolean).at(-1) || "reference-image";
  } catch {
    return "reference-image";
  }
}

function getLocalAssetId(asset: TLAsset | undefined, sourceUrl?: string): string | undefined {
  const localAssetId = asset?.meta && typeof asset.meta.localAssetId === "string" ? asset.meta.localAssetId : undefined;
  if (localAssetId) {
    return localAssetId;
  }

  if (!sourceUrl) {
    return undefined;
  }

  try {
    const url = new URL(sourceUrl, window.location.origin);
    if (url.origin === window.location.origin) {
      const match = /^\/api\/assets\/([^/?#]+)(?:\/download)?$/u.exec(url.pathname);
      return match?.[1];
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function resolveCanvasAssetUrl(asset: TLAsset, context: TLAssetContext): string | null {
  if (asset.type !== "image") {
    return "src" in asset.props && typeof asset.props.src === "string" ? asset.props.src : null;
  }

  const sourceUrl = asset.props.src;
  if (!sourceUrl || context.shouldResolveToOriginal) {
    return sourceUrl || null;
  }

  const localAssetId = getLocalAssetId(asset, sourceUrl);
  if (!localAssetId) {
    return sourceUrl;
  }

  const cdnUrl = getCanvasAssetMetaString(asset, "cdnUrl");
  const cdnPreviewUrls = getCanvasAssetMetaRecord(asset, "cdnPreviewUrls");
  const previewWidth = Math.max(
    previewWidthForAssetContext(asset, context),
    initialCanvasPreviewWidths.get(localAssetId) ?? ASSET_PREVIEW_WIDTHS[0]
  );
  const cdnPreviewUrl = cdnPreviewUrls ? nearestPreviewUrl(cdnPreviewUrls, previewWidth) : undefined;
  if (cdnPreviewUrl || cdnUrl) {
    return cdnPreviewUrl || cdnUrl || null;
  }

  return assetPreviewUrl(localAssetId, previewWidth);
}

function assetPreviewUrl(assetId: string, width: number): string {
  return authenticatedAssetUrl(`/api/assets/${encodeURIComponent(assetId)}/preview?width=${width}`);
}

function assetDisplayUrl(asset: GeneratedAsset, preferredWidth?: number): string {
  return previewUrlForWidth(asset.cdnPreviewUrls, preferredWidth) || asset.cdnUrl || authenticatedAssetUrl(asset.url);
}

function authenticatedAssetUrl(url: string): string {
  if (/^https?:\/\//iu.test(url)) {
    return url;
  }

  const token = getStoredAuthToken();
  if (!token) {
    return url;
  }

  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}token=${encodeURIComponent(token)}`;
}

function getCanvasAssetMetaString(asset: TLAsset | undefined, key: string): string | undefined {
  if (!asset) {
    return undefined;
  }
  const value = (asset.meta as Record<string, unknown> | undefined)?.[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function getCanvasAssetMetaRecord(asset: TLAsset | undefined, key: string): Record<string, string> | undefined {
  if (!asset) {
    return undefined;
  }
  const value = (asset.meta as Record<string, unknown> | undefined)?.[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0));
}

function previewUrlForWidth(previewUrls: Record<string, string> | undefined, preferredWidth: number | undefined): string | undefined {
  if (!previewUrls || !preferredWidth) {
    return undefined;
  }

  return nearestPreviewUrl(previewUrls, preferredWidth);
}

function nearestPreviewUrl(previewUrls: Record<string, string>, preferredWidth: number): string | undefined {
  const widths = Object.keys(previewUrls)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  const selectedWidth = widths.find((width) => width >= preferredWidth) ?? widths[widths.length - 1];
  return selectedWidth ? previewUrls[String(selectedWidth)] : undefined;
}

function isExtensionAuthMessage(value: unknown): value is { source: string; type: string; token: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { source?: unknown }).source === "kuajing-image-extension" &&
    (value as { type?: unknown }).type === "kuajing-image:auth-token" &&
    typeof (value as { token?: unknown }).token === "string" &&
    (value as { token: string }).token.trim().length > 0
  );
}

function previewWidthForAssetContext(asset: Extract<TLAsset, { type: "image" }>, context: TLAssetContext): AssetPreviewWidth {
  const dpr = Number.isFinite(context.dpr) && context.dpr > 0 ? context.dpr : window.devicePixelRatio || 1;
  const requestedWidth = Math.max(1, Math.ceil(asset.props.w * context.screenScale * dpr));
  return ASSET_PREVIEW_WIDTHS.find((widthValue) => widthValue >= requestedWidth) ?? ASSET_PREVIEW_WIDTHS[ASSET_PREVIEW_WIDTHS.length - 1];
}

function findCanvasImageShape(editor: Editor, record: GenerationRecord): TLShapeId | undefined {
  const assetIds = new Set(
    record.outputs.flatMap((output) => (output.status === "succeeded" && output.asset ? [output.asset.id] : []))
  );
  if (assetIds.size === 0) {
    return undefined;
  }

  for (const shape of editor.getCurrentPageShapes()) {
    if (shape.type !== "image") {
      continue;
    }

    const imageShape = shape as TLImageShape;
    const asset = imageShape.props.assetId ? editor.getAsset(imageShape.props.assetId) : undefined;
    const sourceUrl = getImageSourceUrl(imageShape, asset);
    const localAssetId = getLocalAssetId(asset, sourceUrl);

    if (localAssetId && assetIds.has(localAssetId)) {
      return imageShape.id;
    }
  }

  return undefined;
}

function fileNameWithImageExtension(name: string, mimeType: string): string {
  if (/\.(png|jpe?g|webp|gif)$/iu.test(name)) {
    return name;
  }

  const extension = mimeType.split("/")[1]?.replace("jpeg", "jpg") || "png";
  return `${name}.${extension}`;
}

function isSupportedReferenceImageType(mimeType: string): boolean {
  return SUPPORTED_REFERENCE_MIME_TYPES.has(mimeType.toLowerCase());
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("无法读取参考图片数据。"));
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("无法读取参考图片数据。"));
    };
    reader.readAsDataURL(blob);
  });
}

async function imageDimensions(file: File): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("无法读取图片尺寸。"));
    });
    image.src = url;
    await loaded;
    return {
      width: image.naturalWidth,
      height: image.naturalHeight
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function uploadCanvasImageAsset(file: File): Promise<GeneratedAsset> {
  const dimensions = await imageDimensions(file);
  const formData = new FormData();
  formData.set("file", file);
  formData.set("width", String(dimensions.width));
  formData.set("height", String(dimensions.height));

  const response = await authFetch("/api/assets", {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    throw new Error("图片上传失败。");
  }

  const body = (await response.json()) as { asset?: GeneratedAsset };
  if (!body.asset) {
    throw new Error("图片上传结果异常。");
  }

  return body.asset;
}

interface LoadedReferenceImage {
  dataUrl: string;
  fileName: string;
  width: number;
  height: number;
}

async function readReferenceImage(selection: Extract<ReferenceSelection, { status: "ready" }>, signal: AbortSignal): Promise<LoadedReferenceImage> {
  if (selection.localAssetId) {
    return readStoredReferenceImage(selection.localAssetId, signal);
  }

  let response: Response;

  try {
    response = selection.sourceUrl.startsWith("/api/")
      ? await authFetch(selection.sourceUrl, { signal })
      : await fetch(selection.sourceUrl, { signal });
  } catch {
    throw new Error("无法读取当前参考图。请确认图片来自本地生成结果或浏览器可访问的图片数据。");
  }

  if (!response.ok) {
    throw new Error("无法读取当前参考图。请确认图片文件仍然存在。");
  }

  const blob = await response.blob();
  if (!isSupportedReferenceImageType(blob.type)) {
    throw new Error("当前参考资源不是可用的图片格式。");
  }
  if (blob.size > MAX_REFERENCE_IMAGE_BYTES) {
    throw new Error("参考图像不能超过 50MB。");
  }
  const dataUrl = await blobToDataUrl(blob);
  const image = await loadImageFromDataUrl(dataUrl);

  return {
    dataUrl,
    fileName: fileNameWithImageExtension(selection.name, blob.type),
    width: image.naturalWidth,
    height: image.naturalHeight
  };
}

async function readStoredReferenceImage(assetId: string, signal: AbortSignal): Promise<LoadedReferenceImage> {
  const response = await authFetch(`/api/assets/${encodeURIComponent(assetId)}`, { signal });
  if (!response.ok) {
    throw new Error("无法读取历史参考图。请确认原始资源仍然存在。");
  }

  const blob = await response.blob();
  if (!isSupportedReferenceImageType(blob.type)) {
    throw new Error("历史参考资源不是可用的图片格式。");
  }
  if (blob.size > MAX_REFERENCE_IMAGE_BYTES) {
    throw new Error("历史参考图像不能超过 50MB。");
  }
  const dataUrl = await blobToDataUrl(blob);
  const image = await loadImageFromDataUrl(dataUrl);

  return {
    dataUrl,
    fileName: fileNameWithImageExtension(assetId, blob.type),
    width: image.naturalWidth,
    height: image.naturalHeight
  };
}

async function buildReferenceGenerationInput(
  editor: Editor,
  selection: Extract<ReferenceSelection, { status: "ready" }>,
  signal: AbortSignal
): Promise<GenerationReferenceInput> {
  const baseImage = await readReferenceImage(selection, signal);
  const baseShape = editor.getShape(selection.shapeId);
  if (!baseShape || baseShape.type !== "image") {
    throw new Error("当前参考图已失效，请重新选择。");
  }

  const overlayShapes = selection.markerShapeIds.length > 0
    ? selection.markerShapeIds.flatMap((shapeId) => {
        const shape = editor.getShape(shapeId);
        return shape ? [shape] : [];
      })
    : resolveReferenceMarkerShapes(editor, baseShape as TLImageShape, editor.getSelectedShapes(), {
        includeUnselectedMarkers: true
      });
  const selectionPolygons =
    overlayShapes.length > 0
      ? createReferenceSelectionPolygons(editor, baseShape as TLImageShape, overlayShapes, baseImage.width, baseImage.height)
      : [];
  const maskDataUrl =
    selectionPolygons.length > 0 ? createReferenceSelectionMaskDataUrl(selectionPolygons, baseImage.width, baseImage.height) : undefined;

  return {
    referenceImage: {
      dataUrl: baseImage.dataUrl,
      fileName: baseImage.fileName,
      maskDataUrl
    },
    referenceAssetId: selection.localAssetId
  };
}

async function buildHistoryReferenceGenerationInput(
  record: GenerationRecord,
  signal: AbortSignal
): Promise<GenerationReferenceInput | undefined> {
  if (!record.referenceAssetId) {
    return undefined;
  }

  const baseImage = await readStoredReferenceImage(record.referenceAssetId, signal);

  return {
    referenceImage: {
      dataUrl: baseImage.dataUrl,
      fileName: baseImage.fileName,
      maskDataUrl: record.referenceMaskDataUrl
    },
    referenceAssetId: record.referenceAssetId
  };
}

type ReferenceSelectionPolygon = Array<{ x: number; y: number }>;

function createReferenceSelectionPolygons(
  editor: Editor,
  baseShape: TLImageShape,
  overlayShapes: TLShape[],
  imageWidth: number,
  imageHeight: number
): ReferenceSelectionPolygon[] {
  const pageTransform = editor.getShapePageTransform(baseShape).clone().invert();
  const scaleX = imageWidth / Math.max(1, baseShape.props.w);
  const scaleY = imageHeight / Math.max(1, baseShape.props.h);
  return overlayShapes
    .map((shape) => editor.getShapePageBounds(shape))
    .filter((bounds): bounds is Box => Boolean(bounds && bounds.isValid()))
    .map((bounds) => Box.ExpandBy(bounds, 6))
    .map((bounds) =>
      bounds.corners.map((point) => {
        const localPoint = pageTransform.applyToPoint(point);
        return {
          x: clampNumber(localPoint.x * scaleX, 0, imageWidth),
          y: clampNumber(localPoint.y * scaleY, 0, imageHeight)
        };
      })
    )
    .filter((points) => polygonArea(points) > 0.5);
}

function createReferenceSelectionMaskDataUrl(
  polygons: ReferenceSelectionPolygon[],
  imageWidth: number,
  imageHeight: number
): string | undefined {
  if (polygons.length === 0) {
    return undefined;
  }

  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = imageWidth;
  maskCanvas.height = imageHeight;
  const maskContext = maskCanvas.getContext("2d");
  if (!maskContext) {
    throw new Error("无法创建参考蒙版。");
  }

  maskContext.fillStyle = "#ffffff";
  maskContext.fillRect(0, 0, imageWidth, imageHeight);
  maskContext.fillStyle = "#000000";
  maskContext.globalCompositeOperation = "destination-out";
  for (const polygon of polygons) {
    fillPolygon(maskContext, polygon);
  }
  maskContext.globalCompositeOperation = "source-over";

  return maskCanvas.toDataURL("image/png");
}

function tracePolygon(context: CanvasRenderingContext2D, points: ReferenceSelectionPolygon): void {
  if (points.length === 0) {
    return;
  }

  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index += 1) {
    context.lineTo(points[index].x, points[index].y);
  }
  context.closePath();
}

function fillPolygon(context: CanvasRenderingContext2D, points: ReferenceSelectionPolygon): void {
  tracePolygon(context, points);
  context.fill();
}

function polygonArea(points: ReferenceSelectionPolygon): number {
  if (points.length < 3) {
    return 0;
  }

  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const next = points[(index + 1) % points.length];
    area += points[index].x * next.y - next.x * points[index].y;
  }
  return Math.abs(area) / 2;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

async function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("无法读取参考图像。"));
    image.src = dataUrl;
  });
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message ? `${body.error.message}（HTTP ${response.status}）` : `生成请求失败，状态 ${response.status}。`;
  } catch {
    return `生成请求失败，状态 ${response.status}。`;
  }
}

function requestGenerationNotificationPermission(): void {
  if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "default") {
    return;
  }

  void Notification.requestPermission().catch(() => undefined);
}

function showGenerationCompleteNotification(record: GenerationRecord, insertedCount: number, failedCount: number): void {
  if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") {
    return;
  }

  const isPartial = record.status === "partial" || failedCount > 0;
  const body = isPartial
    ? `已向画布插入 ${insertedCount} 张图像，${failedCount} 张失败。`
    : `已向画布插入 ${insertedCount} 张图像。`;

  new Notification(isPartial ? "生成到画布部分完成" : "已生成到画布", {
    body,
    icon: "/favicon.svg",
    tag: `generation-${record.id}`
  });
}

function saveStatusLabel(status: SaveStatus): string {
  switch (status) {
    case "loading":
      return "正在载入";
    case "pending":
      return "待保存";
    case "saving":
      return "保存中";
    case "error":
      return "保存失败";
    case "saved":
    default:
      return "已保存";
  }
}

function SaveStatusIcon({ status }: { status: SaveStatus }) {
  if (status === "saving" || status === "loading") {
    return <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />;
  }

  if (status === "error") {
    return <AlertTriangle className="size-3.5" aria-hidden="true" />;
  }

  if (status === "saved") {
    return <CheckCircle2 className="size-3.5" aria-hidden="true" />;
  }

  return <Cloud className="size-3.5" aria-hidden="true" />;
}

function PluginGuideOverlay({
  links,
  browserLabel: browserName,
  onClose,
  onOpenInstallHelp,
  onRetryDetection
}: {
  links: PluginGuideLinks;
  browserLabel: string;
  onClose: () => void;
  onOpenInstallHelp: () => void;
  onRetryDetection: () => void;
}) {
  return (
    <div className="plugin-guide-backdrop" data-testid="plugin-guide-overlay">
      <section aria-labelledby="plugin-guide-title" aria-modal="true" className="plugin-guide" role="dialog">
        <button aria-label="关闭插件提示" className="plugin-guide__close" type="button" onClick={onClose}>
          <X className="size-4" aria-hidden="true" />
        </button>
        <div className="plugin-guide__content">
          <div className="plugin-guide__intro">
            <span className="plugin-guide__badge">
              <ShieldCheck className="size-4" aria-hidden="true" />
              插件未安装
            </span>
            <h2 id="plugin-guide-title">安装插件，解锁更快的采集和生成</h2>
            <p>
              检测到当前浏览器还没有安装插件{browserName === "当前浏览器" ? "" : `（${browserName}）`}。安装后，你可以在商品页直接采集主图、详情图和属性信息，再把任务更快送进画布，少来回切页面。
            </p>
          </div>

          <ol className="plugin-guide__steps">
            <li>
              <span className="plugin-guide__step-number">1</span>
              <div>
                <div className="plugin-guide__step-title">
                  <Download className="size-4" aria-hidden="true" />
                  下载更方便
                </div>
                <p>获取最新版 Chrome / Edge 插件压缩包，下载后先解压。</p>
                <a className="plugin-guide__step-link" href={links.downloadUrl} target="_blank" rel="noreferrer">
                  打开下载链接
                  <ExternalLink className="size-3.5" aria-hidden="true" />
                </a>
              </div>
            </li>
            <li>
              <span className="plugin-guide__step-number">2</span>
              <div>
                <div className="plugin-guide__step-title">
                  <Package className="size-4" aria-hidden="true" />
                  安装后更省事
                </div>
                <p>打开扩展管理页，开启开发者模式，选择“加载已解压的扩展程序”。</p>
                <a className="plugin-guide__step-link" href={links.installHelpUrl} target="_blank" rel="noreferrer">
                  查看安装方法
                  <ExternalLink className="size-3.5" aria-hidden="true" />
                </a>
              </div>
            </li>
            <li>
              <span className="plugin-guide__step-number">3</span>
              <div>
                <div className="plugin-guide__step-title">
                  <ImageIcon className="size-4" aria-hidden="true" />
                  用起来更顺手
                </div>
                <p>打开浏览器插件，在商品页采集素材、带出信息并直接触发生成，速度和连贯性都会更好。</p>
              </div>
            </li>
          </ol>
        </div>

        <div className="plugin-guide__visual" aria-hidden="true">
          <div className="plugin-guide__browser">
            <div className="plugin-guide__browser-bar">
              <span />
              <span />
              <span />
            </div>
            <div className="plugin-guide__browser-body">
              <div className="plugin-guide__product-card">
                <ShoppingBag className="size-5" aria-hidden="true" />
                <strong>直接采集商品页素材</strong>
                <span>主图、详情图、商品标题</span>
              </div>
              <div className="plugin-guide__flow-line" />
              <div className="plugin-guide__canvas-card">
                <Sparkles className="size-5" aria-hidden="true" />
                <strong>少切页面就能生成</strong>
                <span>一键送入画布和场景任务</span>
              </div>
              <div className="plugin-guide__flow-line" />
              <div className="plugin-guide__canvas-card">
                <Loader2 className="size-5" aria-hidden="true" />
                <strong>自动生成并回写画布</strong>
                <span>更连贯，也更省手工操作</span>
              </div>
            </div>
          </div>
        </div>

        <div className="plugin-guide__actions">
          <button className="secondary-action h-10" type="button" onClick={onClose}>
            稍后再说
          </button>
          <button className="secondary-action h-10" type="button" onClick={onRetryDetection}>
            <RotateCcw className="size-4" aria-hidden="true" />
            我已安装，重新检测
          </button>
          <button className="primary-action h-10" type="button" onClick={onOpenInstallHelp}>
            <Megaphone className="size-4" aria-hidden="true" />
            去安装帮助
          </button>
        </div>
      </section>
    </div>
  );
}

function MobileWorkbench({
  activeTab,
  canGenerate,
  count,
  ecommerceCount,
  ecommerceDescription,
  ecommerceExtraDirection,
  ecommerceImage,
  ecommerceMarket,
  ecommerceMode,
  ecommercePlatform,
  ecommerceRemoveWatermark,
  ecommerceSceneIds,
  ecommerceSizePresetId,
  ecommerceTextLanguage,
  ecommerceTitle,
  generationError,
  generationHistory,
  generationMessage,
  generationMode,
  generationWarning,
  height,
  isEcommerceGenerating,
  isGenerating,
  mobileReferenceImage,
  outputFormat,
  panelStatus,
  prompt,
  quality,
  selectedRecordId,
  sizePresetId,
  stylePreset,
  user,
  width,
  onApplyPromptStarter,
  onCopyHistoryPrompt,
  onDownloadHistoryRecord,
  onNavigate,
  onOpenGallery,
  onRerunHistoryRecord,
  onSelectEcommerceImage,
  onSelectEcommerceMode,
  onSelectEcommerceScene,
  onSelectMobileReferenceImage,
  onSelectSizePreset,
  onSetActiveTab,
  onSetCount,
  onSetEcommerceCount,
  onSetEcommerceDescription,
  onSetEcommerceExtraDirection,
  onSetEcommerceMarket,
  onSetEcommercePlatform,
  onSetEcommerceRemoveWatermark,
  onSetEcommerceSizePresetId,
  onSetEcommerceTextLanguage,
  onSetEcommerceTitle,
  onSetGenerationMode,
  onSetHeight,
  onSetOutputFormat,
  onSetPrompt,
  onSetQuality,
  onSetSelectedRecordId,
  onSetStylePreset,
  onSetWidth,
  onSubmitEcommerce,
  onSubmitGeneration
}: {
  activeTab: MobileCreateTab;
  canGenerate: boolean;
  count: GenerationCount;
  ecommerceCount: GenerationCount;
  ecommerceDescription: string;
  ecommerceExtraDirection: string;
  ecommerceImage: EcommerceImageSource | null;
  ecommerceMarket: EcommerceMarket;
  ecommerceMode: EcommerceGenerationMode;
  ecommercePlatform: EcommercePlatform;
  ecommerceRemoveWatermark: boolean;
  ecommerceSceneIds: EcommerceSceneTemplateId[];
  ecommerceSizePresetId: string;
  ecommerceTextLanguage: EcommerceTextLanguage;
  ecommerceTitle: string;
  generationError: string;
  generationHistory: GenerationRecord[];
  generationMessage: string;
  generationMode: GenerationMode;
  generationWarning: string;
  height: number;
  isEcommerceGenerating: boolean;
  isGenerating: boolean;
  mobileReferenceImage: MobileReferenceImageSource | null;
  outputFormat: OutputFormat;
  panelStatus: PanelStatus | null;
  prompt: string;
  quality: ImageQuality;
  selectedRecordId: string | null;
  sizePresetId: string;
  stylePreset: StylePresetId;
  user: AuthUser;
  width: number;
  onApplyPromptStarter: (prompt: string) => void;
  onCopyHistoryPrompt: (record: GenerationRecord) => void;
  onDownloadHistoryRecord: (record: GenerationRecord) => void;
  onNavigate: (route: AppRoute) => void;
  onOpenGallery: () => void;
  onRerunHistoryRecord: (record: GenerationRecord) => void;
  onSelectEcommerceImage: (file: File | undefined) => void;
  onSelectEcommerceMode: (mode: EcommerceGenerationMode) => void;
  onSelectEcommerceScene: (sceneId: EcommerceSceneTemplateId) => void;
  onSelectMobileReferenceImage: (file: File | undefined) => void;
  onSelectSizePreset: (presetId: string) => void;
  onSetActiveTab: (tab: MobileCreateTab) => void;
  onSetCount: (count: GenerationCount) => void;
  onSetEcommerceCount: (count: GenerationCount) => void;
  onSetEcommerceDescription: (value: string) => void;
  onSetEcommerceExtraDirection: (value: string) => void;
  onSetEcommerceMarket: (market: EcommerceMarket) => void;
  onSetEcommercePlatform: (platform: EcommercePlatform) => void;
  onSetEcommerceRemoveWatermark: (value: boolean) => void;
  onSetEcommerceSizePresetId: (presetId: string) => void;
  onSetEcommerceTextLanguage: (language: EcommerceTextLanguage) => void;
  onSetEcommerceTitle: (value: string) => void;
  onSetGenerationMode: (mode: GenerationMode) => void;
  onSetHeight: (value: string) => void;
  onSetOutputFormat: (format: OutputFormat) => void;
  onSetPrompt: (value: string) => void;
  onSetQuality: (quality: ImageQuality) => void;
  onSetSelectedRecordId: (recordId: string | null) => void;
  onSetStylePreset: (presetId: StylePresetId) => void;
  onSetWidth: (value: string) => void;
  onSubmitEcommerce: () => void;
  onSubmitGeneration: () => void;
}) {
  const selectedRecord = generationHistory.find((record) => record.id === selectedRecordId) ?? generationHistory[0] ?? null;
  const resultAssets = selectedRecord ? generatedAssetsForRecord(selectedRecord) : [];
  const packageRemaining = user.packageRemaining ?? Math.max(0, (user.quotaTotal ?? 0) - (user.quotaUsed ?? 0));
  const activeScenes = ecommerceMode === "category-kit" ? [] : ECOMMERCE_SCENE_TEMPLATES.filter((item) => item.mode === ecommerceMode);
  const ecommerceOutputCount = ecommerceMode === "category-kit" ? 0 : ecommerceSceneIds.length * (ecommerceMode === "single-poster" ? 1 : ecommerceCount);
  const isCreateTab = activeTab === "ecommerce" || activeTab === "creative" || activeTab === "history";
  const recentAssets = generationHistory
    .flatMap((record) => generatedAssetsForRecord(record).map((asset) => ({ record, asset })))
    .slice(0, 2);
  const homeSampleCards = [
    {
      id: "sample-product",
      title: "护肤品主图",
      imageUrl: "/images/auth-register-hero.png"
    },
    {
      id: "sample-lifestyle",
      title: "生活场景图",
      imageUrl: "/images/auth-carousel-product.png"
    }
  ];
  const displayName = user.displayName || user.email || "创作者";
  const homeMenuItems = [
    {
      label: "原图增强",
      icon: BadgeCheck,
      onClick: () => {
        onSelectEcommerceMode("enhance");
        onSetActiveTab("ecommerce");
      }
    },
    {
      label: "场景创作",
      icon: Brush,
      onClick: () => {
        onSelectEcommerceMode("creative");
        onSetActiveTab("ecommerce");
      }
    },
    {
      label: "品类套图",
      icon: Package,
      onClick: () => {
        onSelectEcommerceMode("category-kit");
        onSetActiveTab("ecommerce");
      }
    },
    {
      label: "营销主图",
      icon: ShoppingBag,
      onClick: () => {
        onSelectEcommerceMode("marketing-main");
        onSetActiveTab("ecommerce");
      }
    },
    {
      label: "长图海报",
      icon: Maximize2,
      onClick: () => {
        onSelectEcommerceMode("single-poster");
        onSetActiveTab("ecommerce");
      }
    },
    {
      label: "文字翻译",
      icon: Globe2,
      onClick: () => {
        onSelectEcommerceMode("text-translation");
        onSetActiveTab("ecommerce");
      }
    },
    {
      label: "作品图库",
      icon: ImageIcon,
      onClick: onOpenGallery
    },
    {
      label: "帮助教程",
      icon: BookOpen,
      onClick: () => onNavigate("help")
    }
  ];
  const homeStyleChips = [
    {
      label: "清新自然",
      active: ecommerceMode === "creative",
      onClick: () => onSelectEcommerceMode("creative")
    },
    {
      label: "极简白底",
      active: ecommerceMode === "enhance",
      onClick: () => onSelectEcommerceMode("enhance")
    },
    {
      label: "家居场景",
      active: ecommerceMode === "marketing-main",
      onClick: () => onSelectEcommerceMode("marketing-main")
    },
    {
      label: "户外场景",
      active: ecommerceMode === "category-kit",
      onClick: () => onSelectEcommerceMode("category-kit")
    }
  ];
  const homeSizeChips = [
    { label: "1:1", presetId: "square-1k" },
    { label: "3:4", presetId: "poster-portrait" },
    { label: "4:3", presetId: "poster-landscape" },
    { label: "9:16", presetId: "story-9-16" }
  ];
  const createTitle = activeTab === "history" ? "结果" : "生图";
  const mobileModeTabs: Array<{ id: MobileCreateTab; label: string; count?: number }> = [
    { id: "ecommerce", label: "电商图" },
    { id: "creative", label: "自由生图" },
    { id: "history", label: "结果", count: generationHistory.length }
  ];
  const mobileSceneCards = activeScenes.slice(0, 4);
  const mobileSizeCards = [
    { label: "1:1", presetId: "square-1k", meta: "1024 x 1024" },
    { label: "3:4", presetId: "poster-portrait", meta: "1024 x 1365" },
    { label: "4:3", presetId: "poster-landscape", meta: "1365 x 1024" },
    { label: "9:16", presetId: "story-9-16", meta: "1024 x 1820" }
  ];
  const currentEcommerceModeIndex = Math.max(0, ecommerceModeCards.findIndex((item) => item.id === ecommerceMode));
  const nextEcommerceMode: EcommerceGenerationMode = ecommerceModeCards[(currentEcommerceModeIndex + 1) % ecommerceModeCards.length]?.id ?? "enhance";

  return (
    <main className="mobile-workbench app-view" data-active-tab={activeTab} data-testid="mobile-workbench">
      <header className="mobile-workbench__header" data-variant={activeTab === "home" ? "home" : "create"}>
        {activeTab === "home" ? (
          <div className="mobile-home-topbar">
            <div className="mobile-home-topbar__brand">
              <strong>{BRAND_NAME}</strong>
              <span>AI 电商素材工作台</span>
            </div>
            <div className="mobile-home-topbar__actions" aria-label="账号入口">
              <button type="button" onClick={() => onNavigate("account")}>登录</button>
              <button type="button" data-primary="true" onClick={() => onNavigate("account")}>注册</button>
            </div>
          </div>
        ) : (
          <div className="mobile-app-header mobile-app-header--embedded">
            <div className="mobile-app-header__side">
              <button className="mobile-app-header__back" aria-label="返回首页" type="button" onClick={() => onSetActiveTab("home")}>
                <ChevronLeft className="size-5" aria-hidden="true" />
                <span>首页</span>
              </button>
            </div>
            <div className="mobile-app-header__title">
              <strong>{createTitle}</strong>
            </div>
            <button className="mobile-app-header__quota" type="button" onClick={() => onNavigate("account")}>
              剩余额度 {packageRemaining}
              <ChevronRight className="size-4" aria-hidden="true" />
            </button>
          </div>
        )}
      </header>

      <div className="mobile-workbench__content">
        {generationError ? (
          <div className="mobile-alert" role="alert">
            <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p className="m-0">{generationError}</p>
          </div>
        ) : null}
        {generationWarning ? (
          <div className="mobile-alert" role="alert">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p className="m-0">{generationWarning}</p>
          </div>
        ) : null}
        {generationMessage ? (
          <div className="mobile-alert" role="status">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p className="m-0">{generationMessage}</p>
          </div>
        ) : null}

        {activeTab === "home" ? (
          <>
            <button className="mobile-home-notice" type="button" onClick={() => onNavigate("account")}>
              <Bell className="size-5" aria-hidden="true" />
              <span>新用户注册送 20 张生图额度</span>
              <ChevronRight className="size-5" aria-hidden="true" />
            </button>

            <section className="mobile-home-banner" aria-label="电商素材生成入口">
              <div className="mobile-home-banner__copy">
                <h1>一张产品图，生成整套电商素材</h1>
                <p>主图、海报、翻译、详情长图一次完成</p>
                <button type="button" onClick={() => onSetActiveTab("ecommerce")}>
                  立即生图
                  <ChevronRight className="size-5" aria-hidden="true" />
                </button>
              </div>
              <div className="mobile-home-banner__visual" aria-hidden="true">
                <img src="/images/auth-carousel-product.png" alt="" />
                <span className="mobile-home-banner__badge mobile-home-banner__badge--main">主图</span>
                <span className="mobile-home-banner__badge mobile-home-banner__badge--scene">场景图</span>
                <span className="mobile-home-banner__ai">AI</span>
              </div>
            </section>

            <section className="mobile-home-menu" aria-label="功能菜单">
              {homeMenuItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button key={item.label} type="button" onClick={item.onClick}>
                    <Icon className="size-7" aria-hidden="true" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </section>

            <section className="mobile-home-quick" aria-label="快捷生成">
              <div className="mobile-home-section-head">
                <h2>快捷生成</h2>
              </div>
              <div className="mobile-home-quick__body">
                <label className={ecommerceImage ? "mobile-home-upload has-image" : "mobile-home-upload"}>
                  {ecommerceImage ? (
                    <img alt="产品图预览" src={ecommerceImage.previewUrl} />
                  ) : (
                    <span>
                      <Cloud className="size-8" aria-hidden="true" />
                      <strong>上传产品图</strong>
                      <small>支持 JPG / PNG</small>
                    </span>
                  )}
                  <input accept="image/png,image/jpeg,image/webp" type="file" onChange={(event) => onSelectEcommerceImage(event.target.files?.[0])} />
                </label>

                <div className="mobile-home-quick__controls">
                  <div className="mobile-home-control-group">
                    <span>选择场景或风格（可多选）</span>
                    <div className="mobile-home-chip-row">
                      {homeStyleChips.map((chip) => (
                        <button key={chip.label} data-active={chip.active} type="button" onClick={chip.onClick}>
                          {chip.label}
                        </button>
                      ))}
                      <button aria-label="更多场景" type="button" onClick={() => onSetActiveTab("ecommerce")}>
                        <ChevronDown className="size-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  <div className="mobile-home-control-group">
                    <span>选择尺寸</span>
                    <div className="mobile-home-size-row">
                      {homeSizeChips.map((chip) => (
                        <button
                          key={chip.label}
                          data-active={ecommerceSizePresetId === chip.presetId}
                          type="button"
                          onClick={() => onSetEcommerceSizePresetId(chip.presetId)}
                        >
                          {chip.label}
                        </button>
                      ))}
                      <button type="button" onClick={() => onSetActiveTab("ecommerce")}>
                        更多
                        <ChevronDown className="size-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              <button className="mobile-home-generate" disabled={isEcommerceGenerating} type="button" onClick={onSubmitEcommerce}>
                {isEcommerceGenerating ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : <Sparkles className="size-5" aria-hidden="true" />}
                {isEcommerceGenerating ? "生成中" : "生成电商图"}
              </button>
            </section>

            <section className="mobile-home-recent" aria-label="最近作品">
              <div className="mobile-home-section-head">
                <h2>最近作品</h2>
                <button type="button" onClick={onOpenGallery}>
                  查看全部
                  <ChevronRight className="size-4" aria-hidden="true" />
                </button>
              </div>
              <div className="mobile-home-recent__grid">
                {recentAssets.length > 0
                  ? recentAssets.map(({ record, asset }) => (
                      <article className="mobile-home-work-card" key={`${record.id}-${asset.id}`}>
                        <img alt={record.prompt || "生成作品"} src={assetDisplayUrl(asset, 512)} />
                        <div className="mobile-home-work-card__actions">
                          <a aria-label="下载作品" href={authenticatedAssetUrl(`/api/assets/${encodeURIComponent(asset.id)}/download`)} target="_blank" rel="noreferrer">
                            <Download className="size-5" aria-hidden="true" />
                          </a>
                          <button aria-label="查看作品" type="button" onClick={() => {
                            onSetSelectedRecordId(record.id);
                            onSetActiveTab("history");
                          }}>
                            <MoreHorizontal className="size-5" aria-hidden="true" />
                          </button>
                        </div>
                      </article>
                    ))
                  : homeSampleCards.map((item) => (
                      <article className="mobile-home-work-card" key={item.id}>
                        <img alt={item.title} src={item.imageUrl} />
                        <div className="mobile-home-work-card__actions">
                          <button aria-label="打开图库" type="button" onClick={onOpenGallery}>
                            <ImageIcon className="size-5" aria-hidden="true" />
                          </button>
                          <button aria-label="开始生成" type="button" onClick={() => onSetActiveTab("ecommerce")}>
                            <MoreHorizontal className="size-5" aria-hidden="true" />
                          </button>
                        </div>
                      </article>
                    ))}
              </div>
            </section>
          </>
        ) : null}

        {activeTab === "ecommerce" ? (
          <>
            <nav className="mobile-create-tabs" aria-label="生图页面导航">
              {mobileModeTabs.map((item) => (
                <button key={item.id} data-active={activeTab === item.id} type="button" onClick={() => onSetActiveTab(item.id)}>
                  {item.label}{typeof item.count === "number" && item.count > 0 ? ` (${item.count})` : ""}
                </button>
              ))}
            </nav>

            <section className="mobile-create-panel mobile-create-panel--mode">
              <div className="mobile-create-panel__head">
                <Sparkles className="size-5" aria-hidden="true" />
                <h2>生成方式</h2>
              </div>
              <button className="mobile-create-mode-toggle" type="button" onClick={() => onSelectEcommerceMode(nextEcommerceMode)}>
                <span>
                  <ImageIcon className="size-5" aria-hidden="true" />
                  <strong>{ecommerceModeLabels[ecommerceMode]}</strong>
                  <small>保留原图主体，智能优化画质与光影</small>
                </span>
                <i aria-hidden="true" />
              </button>
              <div className="mobile-create-mode-strip" aria-label="切换生成方式">
                {ecommerceModeCards.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button key={item.id} data-active={ecommerceMode === item.id} type="button" onClick={() => onSelectEcommerceMode(item.id)}>
                      <Icon className="size-4" aria-hidden="true" />
                      <span>{item.title}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="mobile-create-panel">
              <div className="mobile-create-panel__head">
                <Cloud className="size-5" aria-hidden="true" />
                <h2>上传产品图</h2>
              </div>
              <div className="mobile-create-upload-grid">
                <label className={ecommerceImage ? "mobile-create-product-shot has-image" : "mobile-create-product-shot"}>
                  {ecommerceImage ? (
                    <img alt="产品图预览" src={ecommerceImage.previewUrl} />
                  ) : (
                    <span className="mobile-create-upload-empty">
                      <Cloud className="size-8" aria-hidden="true" />
                      <strong>上传产品图</strong>
                      <small>支持 JPG / PNG</small>
                    </span>
                  )}
                  <input accept="image/png,image/jpeg,image/webp" type="file" onChange={(event) => onSelectEcommerceImage(event.target.files?.[0])} />
                </label>
                <label className="mobile-create-reupload">
                  <Cloud className="size-9" aria-hidden="true" />
                  <strong>{ecommerceImage ? "重新上传" : "选择图片"}</strong>
                  <small>建议正面图，效果更佳</small>
                  <input accept="image/png,image/jpeg,image/webp" type="file" onChange={(event) => onSelectEcommerceImage(event.target.files?.[0])} />
                </label>
              </div>
              {ecommerceImage ? <p className="mobile-create-image-ok"><CheckCircle2 className="size-4" aria-hidden="true" />图像清晰，主体完整</p> : null}
            </section>

            <section className="mobile-create-panel">
              <div className="mobile-create-panel__head">
                <Package className="size-5" aria-hidden="true" />
                <h2>商品信息</h2>
              </div>
              <div className="mobile-create-info-table">
                <label>
                  <span>商品名称</span>
                  <input placeholder="例如：舒缓修护精华液" value={ecommerceTitle} onChange={(event) => onSetEcommerceTitle(event.target.value)} />
                </label>
                <label>
                  <span>商品描述</span>
                  <input placeholder="核心卖点、材质、适用场景" value={ecommerceDescription} onChange={(event) => onSetEcommerceDescription(event.target.value)} />
                </label>
                <label>
                  <span>{ecommerceMode === "text-translation" ? "目标语言" : "平台模板"}</span>
                  {ecommerceMode === "text-translation" ? (
                    <select value={ecommerceTextLanguage} onChange={(event) => onSetEcommerceTextLanguage(event.target.value as EcommerceTextLanguage)}>
                      {ECOMMERCE_TEXT_LANGUAGES.filter((item) => item.id !== "none").map((item) => (
                        <option key={item.id} value={item.id}>{item.label}</option>
                      ))}
                    </select>
                  ) : (
                    <select value={ecommercePlatform} onChange={(event) => onSetEcommercePlatform(event.target.value as EcommercePlatform)}>
                      {ECOMMERCE_PLATFORMS.map((item) => (
                        <option key={item.id} value={item.id}>{item.label}</option>
                      ))}
                    </select>
                  )}
                </label>
                <div className="mobile-create-color-row">
                  <span>主色调（可选）</span>
                  <div className="mobile-create-swatches" aria-hidden="true">
                    <em style={{ background: "#b43a1c" }} />
                    <em style={{ background: "#e7c9a5" }} />
                    <em style={{ background: "#e9dfd0" }} />
                    <em style={{ background: "#73845d" }} />
                  </div>
                </div>
              </div>
            </section>

            <section className="mobile-create-panel">
              <div className="mobile-create-panel__head">
                <BadgeCheck className="size-5" aria-hidden="true" />
                <h2>生成场景</h2>
              </div>
              {ecommerceMode === "category-kit" ? (
                <p>后台会根据参考图自动识别商品并规划图片清单，不再固定选择场景模板。</p>
              ) : (
                <div className="mobile-create-scene-strip">
                  {mobileSceneCards.map((item) => {
                    const active = ecommerceSceneIds.includes(item.id);
                    const preview = mobileScenePreviewById[item.id] ?? "/images/mobile-scenes/category-overview-toy.png";
                    return (
                      <button key={item.id} data-active={active} type="button" onClick={() => onSelectEcommerceScene(item.id)}>
                        <img src={preview} alt="" aria-hidden="true" />
                        <span>{item.label}</span>
                        {active ? <CheckCircle2 className="size-5" aria-hidden="true" /> : null}
                      </button>
                    );
                  })}
                  <button className="mobile-create-scene-more" type="button">
                    <MoreHorizontal className="size-6" aria-hidden="true" />
                    <span>更多</span>
                  </button>
                </div>
              )}
            </section>

            <section className="mobile-create-panel">
              <div className="mobile-create-panel__head">
                <Square className="size-5" aria-hidden="true" />
                <h2>输出尺寸</h2>
              </div>
              <div className="mobile-create-size-strip">
                {mobileSizeCards.map((item) => (
                  <button key={item.presetId} data-active={ecommerceSizePresetId === item.presetId} type="button" onClick={() => onSetEcommerceSizePresetId(item.presetId)}>
                    <strong>{item.label}</strong>
                    <span>{item.meta}</span>
                  </button>
                ))}
                <button type="button" onClick={() => onSetActiveTab("ecommerce")}>
                  <MoreHorizontal className="size-5" aria-hidden="true" />
                  <span>自定义</span>
                </button>
              </div>
            </section>

            <section className="mobile-create-count">
              <span>生成数量</span>
              <div>
                {ecommerceMode === "category-kit" ? (
                  <strong>后台动态规划</strong>
                ) : (
                  <>
                    <button type="button" onClick={() => onSetEcommerceCount(Math.max(1, ecommerceCount - 1) as GenerationCount)}>−</button>
                    <strong>{ecommerceMode === "single-poster" ? 1 : ecommerceCount}</strong>
                    <button type="button" onClick={() => onSetEcommerceCount(Math.min(4, ecommerceCount + 1) as GenerationCount)}>+</button>
                  </>
                )}
              </div>
            </section>

            <section className="mobile-create-panel">
              <div className="mobile-create-panel__head">
                <Workflow className="size-5" aria-hidden="true" />
                <h2>细节优化</h2>
              </div>
              <label className="mobile-create-watermark-row">
                <span>
                  <strong>去水印 / Logo</strong>
                  <small>清理旧平台标识、店铺水印和无关角标</small>
                </span>
                <input checked={ecommerceRemoveWatermark} type="checkbox" onChange={(event) => onSetEcommerceRemoveWatermark(event.target.checked)} />
              </label>
              <label className="mobile-create-note">
                <span>补充方向</span>
                <textarea placeholder="例如：模特不露脸；不要新增夸大宣传文字" value={ecommerceExtraDirection} onChange={(event) => onSetEcommerceExtraDirection(event.target.value)} />
              </label>
            </section>

            <div className="mobile-sticky-action">
              <button className="mobile-create-submit" disabled={isEcommerceGenerating} type="button" onClick={onSubmitEcommerce}>
                {isEcommerceGenerating ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Workflow className="size-4" aria-hidden="true" />}
                <span>
                  <strong>{isEcommerceGenerating ? "电商图生成中" : ecommerceMode === "category-kit" ? "生成品类套图" : `生成 ${ecommerceOutputCount || 1} 张电商图`}</strong>
                  <small>{ecommerceMode === "category-kit" ? "由后台规划后按实际图片数计费" : `预计消耗 ${ecommerceOutputCount || 1} 额度`}</small>
                </span>
              </button>
            </div>
          </>
        ) : null}

        {activeTab === "creative" ? (
          <>
            <nav className="mobile-create-tabs" aria-label="生图页面导航">
              {mobileModeTabs.map((item) => (
                <button key={item.id} data-active={activeTab === item.id} type="button" onClick={() => onSetActiveTab(item.id)}>
                  {item.label}{typeof item.count === "number" && item.count > 0 ? ` (${item.count})` : ""}
                </button>
              ))}
            </nav>

            <section className="mobile-create-hero">
              <div>
                <h1>描述你的需求，AI 生成商品图</h1>
                <p>文字生成图片，也可上传参考图优化</p>
                <button type="button" onClick={onSubmitGeneration} disabled={!canGenerate || isGenerating}>
                  <Sparkles className="size-5" aria-hidden="true" />
                  生成图片
                  <ChevronRight className="size-5" aria-hidden="true" />
                </button>
              </div>
              <img src={mobileReferenceImage?.previewUrl ?? "/images/auth-register-hero.png"} alt="" aria-hidden="true" />
            </section>

            <section className="mobile-section">
              <div className="mobile-section__head">
                <div>
                  <p className="sidebar-section__eyebrow">自主生图</p>
                  <h2 className="m-0 text-lg font-black">{generationMode === "reference" ? "参考图生成" : "提示词生成"}</h2>
                </div>
                <Brush className="size-5 text-teal-700" aria-hidden="true" />
              </div>
              <div className="mobile-mode-grid" role="group" aria-label="生成模式">
                <button className={generationMode === "text" ? "segmented-control is-active" : "segmented-control"} type="button" onClick={() => onSetGenerationMode("text")}>
                  提示词
                </button>
                <button className={generationMode === "reference" ? "segmented-control is-active" : "segmented-control"} type="button" onClick={() => onSetGenerationMode("reference")}>
                  参考图
                </button>
              </div>
              <label>
                <span className="control-label">提示词</span>
                <textarea className="prompt-textarea" placeholder="描述画面主体、场景、光线、构图和关键细节" value={prompt} onChange={(event) => onSetPrompt(event.target.value)} />
              </label>
              {!prompt.trim() ? (
                <div className="mobile-chip-grid">
                  {promptStarters.map((starter) => (
                    <button className="prompt-chip" key={starter.label} type="button" title={starter.prompt} onClick={() => onApplyPromptStarter(starter.prompt)}>
                      {starter.label}
                    </button>
                  ))}
                </div>
              ) : null}
              {panelStatus ? (
                <div className={`panel-status-strip ${panelStatusStyles[panelStatus.tone]}`} role={panelStatus.tone === "error" || panelStatus.tone === "warning" ? "alert" : "status"}>
                  <PanelStatusIcon tone={panelStatus.tone} />
                  <p className="min-w-0 flex-1">{panelStatus.message}</p>
                </div>
              ) : null}
            </section>

            {generationMode === "reference" ? (
              <section className="mobile-section">
                <div className="mobile-section__head">
                  <div>
                    <p className="sidebar-section__eyebrow">参考图</p>
                    <h2 className="m-0 text-lg font-black">{mobileReferenceImage ? "已添加参考图" : "上传参考图"}</h2>
                  </div>
                  <ImageIcon className="size-5 text-teal-700" aria-hidden="true" />
                </div>
                <label className={mobileReferenceImage ? "mobile-upload ecommerce-upload has-image" : "mobile-upload ecommerce-upload"}>
                  {mobileReferenceImage ? (
                    <img alt="参考图预览" src={mobileReferenceImage.previewUrl} />
                  ) : (
                    <span className="mobile-upload__empty">
                      <ImageIcon className="size-6" aria-hidden="true" />
                      上传或拍摄参考图
                    </span>
                  )}
                  <input accept="image/png,image/jpeg,image/webp" type="file" onChange={(event) => onSelectMobileReferenceImage(event.target.files?.[0])} />
                </label>
              </section>
            ) : null}

            <section className="mobile-section">
              <div className="mobile-section__head">
                <div>
                  <p className="sidebar-section__eyebrow">参数</p>
                  <h2 className="m-0 text-lg font-black">{width} x {height}</h2>
                </div>
                <Square className="size-5 text-teal-700" aria-hidden="true" />
              </div>
              <label>
                <span className="control-label">风格</span>
                <select className="field-control" value={stylePreset} onChange={(event) => onSetStylePreset(event.target.value as StylePresetId)}>
                  {STYLE_PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id}>{stylePresetLabels[preset.id]}</option>
                  ))}
                </select>
              </label>
              <div className="mobile-chip-grid">
                {quickSizePresets.map((preset) => (
                  <button aria-pressed={sizePresetId === preset.id} className={sizePresetId === preset.id ? "quick-size-button is-active" : "quick-size-button"} key={preset.id} type="button" onClick={() => onSelectSizePreset(preset.id)}>
                    <span>{sizePresetLabel(preset)}</span>
                    <small>{preset.width} x {preset.height}</small>
                  </button>
                ))}
                <button aria-pressed={sizePresetId === CUSTOM_SIZE_PRESET_ID} className={sizePresetId === CUSTOM_SIZE_PRESET_ID ? "quick-size-button is-active" : "quick-size-button"} type="button" onClick={() => onSelectSizePreset(CUSTOM_SIZE_PRESET_ID)}>
                  <span>自定义</span>
                  <small>手动输入</small>
                </button>
              </div>
              <div className="mobile-field-grid">
                <label>
                  <span className="control-label">宽度</span>
                  <input className="field-control" min={MIN_IMAGE_DIMENSION} max={MAX_IMAGE_DIMENSION} step={1} type="number" value={Number.isNaN(width) ? "" : width} onChange={(event) => onSetWidth(event.target.value)} />
                </label>
                <label>
                  <span className="control-label">高度</span>
                  <input className="field-control" min={MIN_IMAGE_DIMENSION} max={MAX_IMAGE_DIMENSION} step={1} type="number" value={Number.isNaN(height) ? "" : height} onChange={(event) => onSetHeight(event.target.value)} />
                </label>
                <label>
                  <span className="control-label">数量</span>
                  <select className="field-control" value={count} onChange={(event) => onSetCount(Number(event.target.value) as GenerationCount)}>
                    {GENERATION_COUNTS.map((item) => (
                      <option key={item} value={item}>{item} 张</option>
                    ))}
                  </select>
                </label>
              </div>
              <details>
                <summary className="cursor-pointer text-sm font-black text-neutral-800">高级设置</summary>
                <div className="mobile-field-grid mt-3">
                  <label>
                    <span className="control-label">质量</span>
                    <select className="field-control" value={quality} onChange={(event) => onSetQuality(event.target.value as ImageQuality)}>
                      {IMAGE_QUALITIES.map((item) => (
                        <option key={item} value={item}>{qualityLabels[item]}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="control-label">输出格式</span>
                    <select className="field-control" value={outputFormat} onChange={(event) => onSetOutputFormat(event.target.value as OutputFormat)}>
                      {OUTPUT_FORMATS.map((item) => (
                        <option key={item} value={item}>{formatLabels[item]}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </details>
            </section>

            <div className="mobile-sticky-action">
              <button className="primary-action" disabled={!canGenerate || isGenerating} type="button" onClick={onSubmitGeneration}>
                {isGenerating ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Sparkles className="size-4" aria-hidden="true" />}
                {isGenerating ? "生成中" : generationMode === "reference" ? "用参考图生成" : "开始生成"}
              </button>
            </div>
          </>
        ) : null}

        {activeTab === "history" ? (
          <>
            <section className="mobile-section">
              <div className="mobile-section__head">
                <div>
                  <p className="sidebar-section__eyebrow">结果</p>
                  <h2 className="m-0 text-lg font-black">{selectedRecord ? statusLabels[selectedRecord.status] : "暂无结果"}</h2>
                </div>
                <button className="secondary-action h-9 px-3 text-xs" type="button" onClick={onOpenGallery}>
                  <ImageIcon className="size-4" aria-hidden="true" />
                  图库
                </button>
              </div>
              {resultAssets.length > 0 ? (
                <div className="mobile-result-grid">
                  {resultAssets.map((asset) => (
                    <article className="mobile-result-card" key={asset.id}>
                      <img alt={selectedRecord?.prompt ?? "生成结果"} src={assetDisplayUrl(asset, 512)} />
                      <div className="grid gap-2">
                        <p className="m-0 truncate text-xs font-bold text-neutral-600">{asset.width} x {asset.height}</p>
                        <a className="secondary-action h-9 text-xs" href={authenticatedAssetUrl(`/api/assets/${encodeURIComponent(asset.id)}/download`)} target="_blank" rel="noreferrer">
                          <Download className="size-4" aria-hidden="true" />
                          下载
                        </a>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="m-0 rounded-md border border-dashed border-neutral-300 px-3 py-5 text-sm font-semibold text-neutral-500">
                  {isGenerating || isEcommerceGenerating ? "生成中，结果会自动出现在这里。" : "生成成功的图片会出现在这里。"}
                </p>
              )}
              {selectedRecord ? (
                <div className="mobile-chip-grid">
                  <button className="secondary-action h-10" type="button" onClick={() => onCopyHistoryPrompt(selectedRecord)}>
                    <Copy className="size-4" aria-hidden="true" />
                    复制提示词
                  </button>
                  <button className="secondary-action h-10" type="button" onClick={() => onRerunHistoryRecord(selectedRecord)}>
                    <RotateCcw className="size-4" aria-hidden="true" />
                    重新生成
                  </button>
                  <button className="secondary-action h-10" type="button" onClick={() => onDownloadHistoryRecord(selectedRecord)}>
                    <Download className="size-4" aria-hidden="true" />
                    下载首图
                  </button>
                </div>
              ) : null}
            </section>

            <section className="mobile-section">
              <div className="mobile-section__head">
                <div>
                  <p className="sidebar-section__eyebrow">历史</p>
                  <h2 className="m-0 text-lg font-black">{generationHistory.length} 条记录</h2>
                </div>
                <ClockIconFallback />
              </div>
              {generationHistory.length > 0 ? (
                <div className="mobile-history-list">
                  {generationHistory.map((record) => {
                    const asset = firstDownloadableAsset(record);
                    return (
                      <button className="mobile-history-card text-left" key={record.id} type="button" onClick={() => onSetSelectedRecordId(record.id)}>
                        {asset ? <img alt={record.prompt} src={assetDisplayUrl(asset, 512)} /> : <div className="grid place-items-center bg-neutral-100"><Loader2 className={record.status === "running" ? "size-5 animate-spin" : "size-5"} aria-hidden="true" /></div>}
                        <span className="grid content-center gap-1">
                          <strong className="truncate text-sm">{promptExcerpt(record.prompt)}</strong>
                          <small className="text-xs font-semibold text-neutral-500">{statusLabels[record.status]} · {successfulOutputCount(record)} / {record.outputs.length || record.count} 张 · {formatCreatedTime(record.createdAt)}</small>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="m-0 rounded-md border border-dashed border-neutral-300 px-3 py-5 text-sm font-semibold text-neutral-500">暂无生成记录。</p>
              )}
            </section>
          </>
        ) : null}
      </div>

      <nav className="mobile-bottom-nav" aria-label="手机底部导航">
        <button className="mobile-workbench__tab" data-active={activeTab === "home"} type="button" onClick={() => onSetActiveTab("home")}>
          <Home className="size-5" aria-hidden="true" />
          <span>首页</span>
        </button>
        <button className="mobile-workbench__tab" data-active={isCreateTab} type="button" onClick={() => onSetActiveTab(activeTab === "creative" ? "creative" : "ecommerce")}>
          <Sparkles className="size-5" aria-hidden="true" />
          <span>生图</span>
        </button>
        <button className="mobile-workbench__tab" type="button" onClick={onOpenGallery}>
          <ImageIcon className="size-5" aria-hidden="true" />
          <span>图库</span>
        </button>
        <button className="mobile-workbench__tab" type="button" onClick={() => onNavigate("account")}>
          <User className="size-5" aria-hidden="true" />
          <span>我的</span>
        </button>
      </nav>
    </main>
  );
}

function ClockIconFallback() {
  return <Cloud className="size-5 text-teal-700" aria-hidden="true" />;
}

function TopNavigation({
  route,
  user,
  generationHistoryCount,
  ecommerceStats,
  onOpenGenerationHistory,
  onNavigate,
  onPreloadGallery,
  onLogout
}: {
  route: AppRoute;
  user: AuthUser;
  generationHistoryCount: number;
  ecommerceStats: EcommerceStatsResponse;
  onOpenGenerationHistory: () => void;
  onNavigate: (route: AppRoute) => void;
  onPreloadGallery: () => void;
  onLogout: () => void;
}) {
  const userQuotaTotal = user.quotaTotal ?? 0;
  const userQuotaUsed = user.quotaUsed ?? 0;
  const packageRemaining = user.packageRemaining ?? Math.max(0, userQuotaTotal - userQuotaUsed);
  const balanceCents = user.balanceCents ?? 0;

  return (
    <header className="top-navigation">
      <div className="top-navigation__inner">
        <div className="brand-lockup min-w-0">
          <BrandMark />
          <div className="min-w-0">
            <BrandName />
            <p className="brand-tagline">{BRAND_TAGLINE}</p>
          </div>
        </div>
        <nav aria-label="主要页面" className="top-navigation__links">
          <a
            aria-current={route === "canvas" ? "page" : undefined}
            className="top-navigation__link"
            data-active={route === "canvas"}
            data-testid="nav-canvas"
            href="/"
            onClick={(event) => {
              event.preventDefault();
              onNavigate("canvas");
            }}
          >
            <Square className="size-4" aria-hidden="true" />
            画布
          </a>
          <a
            aria-current={route === "gallery" ? "page" : undefined}
            className="top-navigation__link"
            data-active={route === "gallery"}
            data-testid="nav-gallery"
            href="/gallery"
            onFocus={onPreloadGallery}
            onMouseEnter={onPreloadGallery}
            onClick={(event) => {
              event.preventDefault();
              onNavigate("gallery");
            }}
          >
            <ImageIcon className="size-4" aria-hidden="true" />
            作品库
          </a>
          <a
            aria-current={route === "account" ? "page" : undefined}
            className="top-navigation__link"
            data-active={route === "account"}
            data-testid="nav-account"
            href="/account"
            onClick={(event) => {
              event.preventDefault();
              onNavigate("account");
            }}
          >
            <User className="size-4" aria-hidden="true" />
            账户
          </a>
          <a
            aria-current={route === "help" ? "page" : undefined}
            className="top-navigation__link"
            data-active={route === "help"}
            data-testid="nav-help"
            href="/help"
            onClick={(event) => {
              event.preventDefault();
              onNavigate("help");
            }}
          >
            <BookOpen className="size-4" aria-hidden="true" />
            帮助
          </a>
          {isAdminUser(user) ? (
            <a
              aria-current={route === "admin" ? "page" : undefined}
              className="top-navigation__link"
              data-active={route === "admin"}
              data-testid="nav-admin"
              href="/admin"
              onClick={(event) => {
                event.preventDefault();
                onNavigate("admin");
              }}
            >
              <ShieldCheck className="size-4" aria-hidden="true" />
              后台
            </a>
          ) : null}
        </nav>
        <div className="top-navigation__ops" aria-label="运营入口">
          <button type="button" onClick={() => onNavigate("account")}>
            <User className="size-3.5" aria-hidden="true" />
            账户
          </button>
          <button type="button" onClick={() => onNavigate("account")}>
            <Sparkles className="size-3.5" aria-hidden="true" />
            额度 {packageRemaining.toLocaleString("zh-CN")}
          </button>
          <button type="button" onClick={() => onNavigate("gallery")}>
            <ImageIcon className="size-3.5" aria-hidden="true" />
            素材历史
          </button>
          <button type="button" onClick={onOpenGenerationHistory}>
            <Workflow className="size-3.5" aria-hidden="true" />
            生成历史 {generationHistoryCount}
          </button>
          <span>任务 {ecommerceStats.totalJobs}</span>
          <span>图 {ecommerceStats.generatedImages}</span>
        </div>
        <div className="top-navigation__account">
          <button
            className="quota-chip"
            data-testid="quota-chip"
            title={`套餐剩余 ${packageRemaining.toLocaleString("zh-CN")} 次，余额 ${formatCurrency(balanceCents)}`}
            type="button"
            onClick={() => onNavigate("account")}
          >
            <Sparkles className="size-3.5" aria-hidden="true" />
            <span>{packageRemaining.toLocaleString("zh-CN")} 次</span>
          </button>
          <button
            className="account-chip"
            data-testid="account-chip"
            title={user.email || user.phone || user.displayName}
            type="button"
            onClick={() => onNavigate("account")}
          >
            <span className="account-chip__avatar">{user.displayName.slice(0, 1).toUpperCase()}</span>
            <span className="account-chip__copy">
              <strong>{user.displayName}</strong>
              <span>{user.role === "admin" || user.role === "super_admin" ? "管理员" : "成员"}</span>
            </span>
          </button>
          <button aria-label="退出登录" className="logout-button" data-testid="logout-button" type="button" onClick={onLogout}>
            <LogOut className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>
  );
}

function GuestTopNavigation({
  route,
  onNavigate,
  onAuthNavigate,
  onOpenPluginGuide
}: {
  route: "canvas" | "gallery" | "help";
  onNavigate: (route: AppRoute) => void;
  onAuthNavigate: (mode: AuthMode) => void;
  onOpenPluginGuide: () => void;
}) {
  return (
    <header className="top-navigation guest-navigation">
      <div className="top-navigation__inner">
        <a
          className="brand-lockup guest-navigation__brand min-w-0"
          href="/"
          aria-label={`${BRAND_NAME}演示工作台`}
          onClick={(event) => {
            event.preventDefault();
            onNavigate("canvas");
          }}
        >
          <BrandMark />
          <div className="min-w-0">
            <BrandName />
            <p className="brand-tagline">公开演示工作台</p>
          </div>
        </a>
        <nav aria-label="演示页面" className="top-navigation__links">
          <a
            aria-current={route === "canvas" ? "page" : undefined}
            className="top-navigation__link"
            data-active={route === "canvas"}
            href="/"
            onClick={(event) => {
              event.preventDefault();
              onNavigate("canvas");
            }}
          >
            <Square className="size-4" aria-hidden="true" />
            画布
          </a>
          <a
            aria-current={route === "gallery" ? "page" : undefined}
            className="top-navigation__link"
            data-active={route === "gallery"}
            href="/gallery"
            onClick={(event) => {
              event.preventDefault();
              onNavigate("gallery");
            }}
          >
            <ImageIcon className="size-4" aria-hidden="true" />
            案例库
          </a>
          <a
            aria-current={route === "help" ? "page" : undefined}
            className="top-navigation__link"
            data-active={route === "help"}
            href="/help"
            onClick={(event) => {
              event.preventDefault();
              onNavigate("help");
            }}
          >
            <BookOpen className="size-4" aria-hidden="true" />
            帮助
          </a>
        </nav>
        <div className="guest-navigation__actions">
          <button className="secondary-action h-9" type="button" onClick={onOpenPluginGuide}>
            <Package className="size-4" aria-hidden="true" />
            插件
          </button>
          <button className="secondary-action h-9" type="button" onClick={() => onAuthNavigate("login")}>
            登录
          </button>
          <button className="primary-action h-9" type="button" onClick={() => onAuthNavigate("register")}>
            注册试用
          </button>
        </div>
      </div>
    </header>
  );
}

function GuestDemoWorkbench({
  examples,
  selectedExampleId,
  isAiPanelOpen,
  isMobileDrawer,
  panelCloseButtonRef,
  pluginGuideLinks,
  onClosePanel,
  onGenerationBlocked,
  onOpenPanel,
  onOpenPluginGuide,
  onSelectExample
}: {
  examples: DemoCanvasExample[];
  selectedExampleId: string;
  isAiPanelOpen: boolean;
  isMobileDrawer: boolean;
  panelCloseButtonRef: RefObject<HTMLButtonElement>;
  pluginGuideLinks: PluginGuideLinks;
  onClosePanel: () => void;
  onGenerationBlocked: () => void;
  onOpenPanel: () => void;
  onOpenPluginGuide: () => void;
  onSelectExample: (exampleId: string) => void;
}) {
  const selectedExample = examples.find((example) => example.id === selectedExampleId) ?? examples[0];
  const previewImages = useMemo<GuestDemoPreviewImage[]>(
    () =>
      examples.flatMap((example) => [
        {
          key: `${example.id}:before`,
          exampleId: example.id,
          category: example.category,
          title: example.title,
          label: example.beforeLabel,
          url: example.beforeUrl,
          alt: `${example.title}${example.beforeLabel}`
        },
        {
          key: `${example.id}:after`,
          exampleId: example.id,
          category: example.category,
          title: example.title,
          label: example.afterLabel,
          url: example.afterUrl,
          alt: `${example.title}${example.afterLabel}`
        }
      ]),
    [examples]
  );
  const [previewImageKey, setPreviewImageKey] = useState<string | null>(null);
  const previewImageIndex = previewImageKey ? previewImages.findIndex((image) => image.key === previewImageKey) : -1;
  const previewImage = previewImageIndex >= 0 ? previewImages[previewImageIndex] : null;

  const openPreviewImage = (imageKey: string, exampleId: string): void => {
    onSelectExample(exampleId);
    setPreviewImageKey(imageKey);
  };

  const navigatePreviewImage = (direction: -1 | 1): void => {
    if (previewImages.length === 0) {
      return;
    }
    const currentIndex = previewImageIndex >= 0 ? previewImageIndex : 0;
    const nextIndex = (currentIndex + direction + previewImages.length) % previewImages.length;
    const nextImage = previewImages[nextIndex];
    onSelectExample(nextImage.exampleId);
    setPreviewImageKey(nextImage.key);
  };

  return (
    <main className="app-shell guest-workbench app-view relative flex min-h-0 overflow-hidden text-neutral-900" data-testid="guest-workbench">
      <section className="guest-canvas-shell relative min-w-0 flex-1 outline-none" aria-label={`${BRAND_NAME}演示画布`} tabIndex={-1}>
        <div className="guest-canvas-toolbar" aria-label="演示画布状态">
          <span>
            <Sparkles className="size-3.5" aria-hidden="true" />
            Demo Canvas
          </span>
          <button type="button" onClick={onGenerationBlocked}>
            试用生成
          </button>
        </div>
        <div className="guest-canvas-board">
          {examples.map((example) => {
            const beforePreviewKey = `${example.id}:before`;
            const afterPreviewKey = `${example.id}:after`;

            return (
              <article className="guest-comparison-card" data-selected={selectedExample.id === example.id} key={example.id}>
                <div className="guest-comparison-card__head">
                  <span>{example.category}</span>
                  <strong>{example.title}</strong>
                </div>
                <div className="guest-comparison-pair">
                  <figure>
                    <button
                      aria-label={`查看大图：${example.title}${example.beforeLabel}`}
                      className="guest-comparison-thumb"
                      type="button"
                      onClick={() => openPreviewImage(beforePreviewKey, example.id)}
                    >
                      <img alt={`${example.title}${example.beforeLabel}`} loading="lazy" src={example.beforeUrl} />
                      <span className="guest-comparison-thumb__zoom" aria-hidden="true">
                        <Maximize2 className="size-4" />
                      </span>
                    </button>
                    <figcaption>{example.beforeLabel}</figcaption>
                  </figure>
                  <figure>
                    <button
                      aria-label={`查看大图：${example.title}${example.afterLabel}`}
                      className="guest-comparison-thumb"
                      type="button"
                      onClick={() => openPreviewImage(afterPreviewKey, example.id)}
                    >
                      <img alt={`${example.title}${example.afterLabel}`} loading="lazy" src={example.afterUrl} />
                      <span className="guest-comparison-thumb__zoom" aria-hidden="true">
                        <Maximize2 className="size-4" />
                      </span>
                    </button>
                    <figcaption>{example.afterLabel}</figcaption>
                  </figure>
                </div>
                <p>{example.brief}</p>
              </article>
            );
          })}
        </div>
      </section>

      {isMobileDrawer && isAiPanelOpen ? (
        <button
          aria-label="关闭演示工作台面板"
          className="ai-panel-backdrop"
          data-testid="guest-ai-panel-backdrop"
          type="button"
          onClick={onClosePanel}
        />
      ) : null}

      <button
        aria-controls="guest-ai-panel"
        aria-expanded={isAiPanelOpen}
        aria-haspopup="dialog"
        className="mobile-ai-trigger"
        data-drawer-state={isAiPanelOpen ? "open" : "closed"}
        data-testid="open-guest-ai-panel"
        type="button"
        onClick={onOpenPanel}
      >
        <Sparkles className="size-4" aria-hidden="true" />
        体验工作台
      </button>

      <aside
        aria-hidden={isMobileDrawer && !isAiPanelOpen ? true : undefined}
        aria-labelledby="guest-ai-panel-title"
        aria-modal={isMobileDrawer && isAiPanelOpen ? true : undefined}
        className="ai-panel guest-ai-panel fixed inset-y-0 left-0 z-20 flex flex-col border-r border-neutral-200 bg-white shadow-2xl shadow-neutral-950/15"
        data-drawer-state={isAiPanelOpen ? "open" : "closed"}
        data-testid="guest-ai-panel"
        id="guest-ai-panel"
        role={isMobileDrawer ? "dialog" : "complementary"}
        {...(isMobileDrawer && !isAiPanelOpen ? { inert: "" } : {})}
      >
        <div className="ai-panel-header border-b border-neutral-200 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <span className="guest-demo-badge">
              <Sparkles className="size-3.5" aria-hidden="true" />
              演示模式
            </span>
            <button
              aria-label="关闭演示工作台面板"
              className="ai-panel-close"
              ref={panelCloseButtonRef}
              type="button"
              onClick={onClosePanel}
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
          <h1 className="mt-3 text-xl font-semibold text-neutral-950" id="guest-ai-panel-title">
            访客演示工作台
          </h1>
        </div>

        <div className="ai-panel-body flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <section className="sidebar-hero guest-sidebar-hero">
            <div className="sidebar-hero__top">
              <span>PUBLIC DEMO</span>
              <Workflow className="size-4" aria-hidden="true" />
            </div>
            <h2>先看工作流，再登录试用额度</h2>
            <p>访客可以浏览固定案例和画布结构；真正生成、保存和重跑会在登录或注册后消耗试用额度。</p>
            <div className="sidebar-hero__actions">
              <a className="sidebar-cta" href={pluginGuideLinks.downloadUrl} target="_blank" rel="noreferrer">
                <Download className="size-4" aria-hidden="true" />
                下载插件
              </a>
              <button className="sidebar-ghost" type="button" onClick={onOpenPluginGuide}>
                <ShieldCheck className="size-4" aria-hidden="true" />
                安装提示
              </button>
            </div>
          </section>

          <section className="plugin-flow-card" aria-label="访客试用流程">
            <div className="plugin-flow-card__item">
              <span>1</span>
              <strong>浏览案例</strong>
              <small>对比生成前后</small>
            </div>
            <div className="plugin-flow-card__item">
              <span>2</span>
              <strong>注册试用</strong>
              <small>领取生图额度</small>
            </div>
            <div className="plugin-flow-card__item">
              <span>3</span>
              <strong>安装插件</strong>
              <small>获取更多额度</small>
            </div>
          </section>

          <section className="sidebar-section">
            <div className="sidebar-section__head">
              <div>
                <p className="sidebar-section__eyebrow">固定演示</p>
                <h3>{selectedExample.title}</h3>
              </div>
              <ImageIcon className="size-4 text-amber-700" aria-hidden="true" />
            </div>
            <div className="guest-example-list">
              {examples.map((example) => (
                <button
                  aria-pressed={selectedExample.id === example.id}
                  className="guest-example-button"
                  data-active={selectedExample.id === example.id}
                  key={example.id}
                  type="button"
                  onClick={() => onSelectExample(example.id)}
                >
                  <img alt="" src={example.afterUrl} />
                  <span>
                    <strong>{example.title}</strong>
                    <small>{example.category}</small>
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="sidebar-section">
            <div className="sidebar-section__head">
              <div>
                <p className="sidebar-section__eyebrow">演示提示词</p>
                <h3>生成依据</h3>
              </div>
              <Brush className="size-4 text-amber-700" aria-hidden="true" />
            </div>
            <textarea className="prompt-textarea guest-prompt-preview" readOnly value={selectedExample.prompt} />
          </section>

          <section className="sidebar-section">
            <div className="sidebar-section__head">
              <div>
                <p className="sidebar-section__eyebrow">输出设置</p>
                <h3>演示参数</h3>
              </div>
              <Square className="size-4 text-amber-700" aria-hidden="true" />
            </div>
            <div className="guest-setting-grid">
              <span>{stylePresetLabels[selectedExample.presetId]}</span>
              <span>{selectedExample.size.width} x {selectedExample.size.height}</span>
              <span>{qualityLabels[selectedExample.quality]}</span>
              <span>{selectedExample.outputFormat.toUpperCase()}</span>
            </div>
          </section>
        </div>

        <div className="ai-panel-actions grid grid-cols-1 gap-3 border-t border-neutral-200 bg-white px-5 py-4">
          <button className="primary-action" type="button" onClick={onGenerationBlocked}>
            <Sparkles className="size-4" aria-hidden="true" />
            登录后生成到画布
          </button>
        </div>
      </aside>

      {previewImage ? (
        <GuestImagePreviewDialog
          image={previewImage}
          imageCount={previewImages.length}
          imageIndex={previewImageIndex}
          onClose={() => setPreviewImageKey(null)}
          onNext={() => navigatePreviewImage(1)}
          onPrevious={() => navigatePreviewImage(-1)}
        />
      ) : null}
    </main>
  );
}

interface GuestDemoPreviewImage {
  key: string;
  exampleId: string;
  category: string;
  title: string;
  label: string;
  url: string;
  alt: string;
}

function GuestImagePreviewDialog({
  image,
  imageCount,
  imageIndex,
  onClose,
  onNext,
  onPrevious
}: {
  image: GuestDemoPreviewImage;
  imageCount: number;
  imageIndex: number;
  onClose: () => void;
  onNext: () => void;
  onPrevious: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        onPrevious();
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        onNext();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, onNext, onPrevious]);

  return (
    <div
      className="guest-image-preview-backdrop"
      data-testid="guest-image-preview"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div aria-labelledby="guest-image-preview-title" aria-modal="true" className="guest-image-preview" role="dialog">
        <header className="guest-image-preview__header">
          <div className="guest-image-preview__title">
            <span>{image.category}</span>
            <h2 id="guest-image-preview-title">{image.title}</h2>
            <p>
              {image.label}
              {imageCount > 1 ? <small>{imageIndex + 1} / {imageCount}</small> : null}
            </p>
          </div>
          <button aria-label="关闭大图预览" className="guest-image-preview__close" type="button" onClick={onClose}>
            <X className="size-4" aria-hidden="true" />
          </button>
        </header>
        <div className="guest-image-preview__stage">
          {imageCount > 1 ? (
            <button
              aria-label="上一张大图"
              className="guest-image-preview__nav guest-image-preview__nav--previous"
              type="button"
              onClick={onPrevious}
            >
              <ChevronLeft className="size-5" aria-hidden="true" />
            </button>
          ) : null}
          <img alt={image.alt} src={image.url} />
          {imageCount > 1 ? (
            <button aria-label="下一张大图" className="guest-image-preview__nav guest-image-preview__nav--next" type="button" onClick={onNext}>
              <ChevronRight className="size-5" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function GuestQuotaOverlay({
  links,
  onAuthNavigate,
  onClose,
  onOpenInstallHelp
}: {
  links: PluginGuideLinks;
  onAuthNavigate: (mode: AuthMode) => void;
  onClose: () => void;
  onOpenInstallHelp: () => void;
}) {
  return (
    <div className="plugin-guide-backdrop guest-quota-backdrop" data-testid="guest-quota-overlay">
      <section aria-labelledby="guest-quota-title" aria-modal="true" className="plugin-guide guest-quota-dialog" role="dialog">
        <button aria-label="关闭试用额度提示" className="plugin-guide__close" type="button" onClick={onClose}>
          <X className="size-4" aria-hidden="true" />
        </button>
        <div className="plugin-guide__content">
          <div className="plugin-guide__intro">
            <span className="plugin-guide__badge">
              <Sparkles className="size-4" aria-hidden="true" />
              需要试用额度
            </span>
            <h2 id="guest-quota-title">登录或注册后再开始生成</h2>
            <p>
              当前是公开演示工作台，可以浏览案例和参数。真正生成、重跑和保存作品需要账号试用额度；安装浏览器插件后可获得更多额度和商品页采集能力，需要更高额度时可以联系支持处理。
            </p>
          </div>

          <ol className="plugin-guide__steps">
            <li>
              <span className="plugin-guide__step-number">1</span>
              <div>
                <div className="plugin-guide__step-title">
                  <User className="size-4" aria-hidden="true" />
                  登录或注册领取试用
                </div>
                <p>注册后进入正式工作台，生成任务会从账号额度中扣减，作品也会同步到图库。</p>
              </div>
            </li>
            <li>
              <span className="plugin-guide__step-number">2</span>
              <div>
                <div className="plugin-guide__step-title">
                  <Package className="size-4" aria-hidden="true" />
                  安装插件获得更多额度
                </div>
                <p>插件会把商品页采集、素材回传和生成任务串起来，同时提供更多使用额度入口。</p>
                <a className="plugin-guide__step-link" href={links.downloadUrl} target="_blank" rel="noreferrer">
                  打开下载链接
                  <ExternalLink className="size-3.5" aria-hidden="true" />
                </a>
              </div>
            </li>
            <li>
              <span className="plugin-guide__step-number">3</span>
              <div>
                <div className="plugin-guide__step-title">
                  <Megaphone className="size-4" aria-hidden="true" />
                  需要更多额度请联系支持
                </div>
                <p>如果要批量生成、团队试用或提高额度，可以联系客户支持申请更适合的额度方案。</p>
              </div>
            </li>
          </ol>
        </div>

        <div className="plugin-guide__visual" aria-hidden="true">
          <div className="plugin-guide__browser">
            <div className="plugin-guide__browser-bar">
              <span />
              <span />
              <span />
            </div>
            <div className="plugin-guide__browser-body">
              <div className="plugin-guide__product-card">
                <User className="size-5" aria-hidden="true" />
                <strong>注册试用账号</strong>
                <span>领取额度并保存作品</span>
              </div>
              <div className="plugin-guide__flow-line" />
              <div className="plugin-guide__canvas-card">
                <Package className="size-5" aria-hidden="true" />
                <strong>安装浏览器插件</strong>
                <span>更多额度和商品页入口</span>
              </div>
              <div className="plugin-guide__flow-line" />
              <div className="plugin-guide__canvas-card">
                <Sparkles className="size-5" aria-hidden="true" />
                <strong>开始正式生成</strong>
                <span>同步画布和作品图库</span>
              </div>
            </div>
          </div>
        </div>

        <div className="plugin-guide__actions">
          <button className="secondary-action h-10" type="button" onClick={onClose}>
            继续看演示
          </button>
          <button className="secondary-action h-10" type="button" onClick={onOpenInstallHelp}>
            <Package className="size-4" aria-hidden="true" />
            安装帮助
          </button>
          <button className="secondary-action h-10" type="button" onClick={() => onAuthNavigate("login")}>
            登录
          </button>
          <button className="primary-action h-10" type="button" onClick={() => onAuthNavigate("register")}>
            注册领取额度
          </button>
        </div>
      </section>
    </div>
  );
}

function PanelStatusIcon({ tone }: { tone: PanelStatusTone }) {
  if (tone === "progress") {
    return <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" aria-hidden="true" />;
  }

  if (tone === "success") {
    return <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />;
  }

  if (tone === "warning") {
    return <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />;
  }

  return <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />;
}

export function App() {
  const [route, setRoute] = useState<AppRoute>(() => routeFromLocation());
  const [publicPath, setPublicPath] = useState(() => window.location.pathname);
  const [authStatus, setAuthStatus] = useState<AuthStatus>(() => (consumeAuthTokenFromUrl() || getStoredAuthToken() ? "checking" : "anonymous"));
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [generationMode, setGenerationMode] = useState<GenerationMode>("text");
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("plugins");
  const [ecommerceMode, setEcommerceMode] = useState<EcommerceGenerationMode>("enhance");
  const [ecommerceImage, setEcommerceImage] = useState<EcommerceImageSource | null>(null);
  const [ecommerceTitle, setEcommerceTitle] = useState("");
  const [ecommerceDescription, setEcommerceDescription] = useState("");
  const [ecommerceTargetCustomer, setEcommerceTargetCustomer] = useState("");
  const [ecommerceUsageScene, setEcommerceUsageScene] = useState("");
  const [ecommerceMaterial, setEcommerceMaterial] = useState("");
  const [ecommerceColor, setEcommerceColor] = useState("");
  const [ecommercePlatform, setEcommercePlatform] = useState<EcommercePlatform>("taobao");
  const [ecommerceMarket, setEcommerceMarket] = useState<EcommerceMarket>("cn");
  const [ecommerceTextLanguage, setEcommerceTextLanguage] = useState<EcommerceTextLanguage>("en");
  const [ecommerceSceneIds, setEcommerceSceneIds] = useState<EcommerceSceneTemplateId[]>(() => ecommerceScenesByMode.enhance);
  const [ecommerceSizePresetId, setEcommerceSizePresetId] = useState("square-1k");
  const [ecommerceCount, setEcommerceCount] = useState<GenerationCount>(1);
  const [ecommerceRemoveWatermark, setEcommerceRemoveWatermark] = useState(true);
  const [ecommerceExtraDirection, setEcommerceExtraDirection] = useState("");
  const [isEcommerceGenerating, setIsEcommerceGenerating] = useState(false);
  const [ecommerceStats, setEcommerceStats] = useState<EcommerceStatsResponse>(emptyEcommerceStats);
  const [mobileCreateTab, setMobileCreateTab] = useState<MobileCreateTab>("home");
  const [mobileReferenceImage, setMobileReferenceImage] = useState<MobileReferenceImageSource | null>(null);
  const [mobileSelectedRecordId, setMobileSelectedRecordId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [stylePreset, setStylePreset] = useState<StylePresetId>("none");
  const [sizePresetId, setSizePresetId] = useState(SIZE_PRESETS[0].id);
  const [width, setWidth] = useState(SIZE_PRESETS[0].width);
  const [height, setHeight] = useState(SIZE_PRESETS[0].height);
  const [count, setCount] = useState<GenerationCount>(1);
  const [quality, setQuality] = useState<ImageQuality>("auto");
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("png");
  const [activeGenerationCount, setActiveGenerationCount] = useState(0);
  const [isProjectLoaded, setIsProjectLoaded] = useState(false);
  const [projectSnapshot, setProjectSnapshot] = useState<PersistedSnapshot | undefined>();
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("loading");
  const [saveError, setSaveError] = useState("");
  const [generationError, setGenerationError] = useState("");
  const [generationMessage, setGenerationMessage] = useState("");
  const [generationWarning, setGenerationWarning] = useState("");
  const [generationHistory, setGenerationHistory] = useState<GenerationRecord[]>([]);
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);
  const [isMobileDrawer, setIsMobileDrawer] = useState(false);
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(false);
  const [pluginGuideLinks, setPluginGuideLinks] = useState<PluginGuideLinks>(defaultPluginGuideLinks);
  const [isPluginGuideOpen, setIsPluginGuideOpen] = useState(false);
  const [isGuestQuotaModalOpen, setIsGuestQuotaModalOpen] = useState(false);
  const [demoCanvasExamples, setDemoCanvasExamples] = useState<DemoCanvasExample[]>(demoComparisonExamples);
  const [selectedDemoExampleId, setSelectedDemoExampleId] = useState(demoComparisonExamples[0]?.id ?? "");
  const [referenceSelection, setReferenceSelection] = useState<ReferenceSelection>(missingReferenceSelection);
  const browserKind = useMemo(() => detectBrowserKind(), []);
  const pluginGuideDisplayLinks = useMemo(
    () => ({
      ...pluginGuideLinks,
      installHelpUrl: installHelpUrlForBrowser(pluginGuideLinks.installHelpUrl, browserKind)
    }),
    [browserKind, pluginGuideLinks]
  );
  const pluginBrowserLabel = useMemo(() => browserLabel(browserKind), [browserKind]);
  const dismissedPluginPromptRef = useRef(false);
  const pluginProbeRequestRef = useRef(0);
  const canvasShellRef = useRef<HTMLElement | null>(null);
  const panelCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const generationModeRef = useRef<GenerationMode>("text");
  const activeGenerationsRef = useRef<Map<number, ActiveGenerationTask>>(new Map());
  const generationRequestRef = useRef(0);
  const saveTimerRef = useRef<number | undefined>();
  const saveRequestRef = useRef(0);
  const navigateToRoute = useCallback((nextRoute: AppRoute): void => {
    const nextPath = pathForRoute(nextRoute);
    if (window.location.pathname !== nextPath) {
      window.history.pushState(null, "", nextPath);
    }
    setRoute(nextRoute);
    setPublicPath(nextPath);
  }, []);
  const navigateToAuth = useCallback((mode: AuthMode): void => {
    const nextPath = mode === "register" ? "/register" : "/login";
    if (window.location.pathname !== nextPath) {
      window.history.pushState(null, "", nextPath);
    }
    setAuthMode(mode);
    setPublicPath(nextPath);
  }, []);
  const isGenerating = activeGenerationCount > 0;
  const isAuthenticated = authStatus === "authenticated" && currentUser !== null;

  const closePluginGuide = useCallback((): void => {
    dismissedPluginPromptRef.current = true;
    setIsPluginGuideOpen(false);
  }, []);

  const openPluginGuide = useCallback((): void => {
    dismissedPluginPromptRef.current = false;
    setSidebarTab("plugins");
    setIsAiPanelOpen(true);
    setIsPluginGuideOpen(true);
  }, []);

  const openGuestQuotaModal = useCallback((): void => {
    setIsGuestQuotaModalOpen(true);
  }, []);

  const navigateFromGuestQuota = useCallback(
    (mode: AuthMode): void => {
      setIsGuestQuotaModalOpen(false);
      navigateToAuth(mode);
    },
    [navigateToAuth]
  );

  const probeAndMaybeShowPluginPrompt = useCallback(
    async (forceShowPrompt: boolean): Promise<void> => {
      const requestId = ++pluginProbeRequestRef.current;
      const installed = await probeExtensionInstalled();
      if (requestId !== pluginProbeRequestRef.current) {
        return;
      }
      if (installed) {
        dismissedPluginPromptRef.current = false;
        setIsPluginGuideOpen(false);
        return;
      }

      if (forceShowPrompt || !dismissedPluginPromptRef.current) {
        setIsPluginGuideOpen(true);
      }
    },
    []
  );

  useEffect(() => {
    const controller = new AbortController();

    async function loadDemoCanvasExamples(): Promise<void> {
      try {
        const response = await fetch("/api/public/demo-canvas", { signal: controller.signal });
        if (!response.ok) {
          return;
        }
        const examples = parseDemoCanvasExamples((await response.json()) as DemoCanvasConfigResponse);
        if (!controller.signal.aborted && examples.length > 0) {
          setDemoCanvasExamples(examples);
          setSelectedDemoExampleId((current) => (examples.some((example) => example.id === current) ? current : examples[0]?.id ?? ""));
        }
      } catch {
        // Keep bundled examples when the public config is unavailable.
      }
    }

    void loadDemoCanvasExamples();
    return () => {
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const resolvedRoute = route === "admin" && !isAdminUser(currentUser) ? "canvas" : route;
    const requiresPhoneVerification = !!currentUser && !currentUser.phone && !isAdminUser(currentUser);
    const visibleRoute = requiresPhoneVerification && resolvedRoute !== "help" ? "account" : resolvedRoute;
    if (visibleRoute !== "canvas") {
      return;
    }

    pluginProbeRequestRef.current += 1;
    const timerId = window.setTimeout(() => {
      void probeAndMaybeShowPluginPrompt(false);
    }, 240);

    return () => {
      pluginProbeRequestRef.current += 1;
      window.clearTimeout(timerId);
    };
  }, [currentUser, isAuthenticated, probeAndMaybeShowPluginPrompt, route]);

  const handleAuthenticated = useCallback((session: AuthSession): void => {
    storeAuthToken(session.token);
    setCurrentUser(session.user);
    setAuthStatus("authenticated");
    setSaveStatus("loading");
    setSaveError("");
    setIsProjectLoaded(false);
    if (route === "admin" && !isAdminUser(session.user)) {
      navigateToRoute("canvas");
    } else if (window.location.pathname === "/login" || window.location.pathname === "/register") {
      navigateToRoute("canvas");
    }
  }, [navigateToRoute, route]);

  const handleLogout = useCallback((): void => {
    clearStoredAuthToken();
    setCurrentUser(null);
    setAuthStatus("anonymous");
    setProjectSnapshot(undefined);
    setGenerationHistory([]);
    setIsProjectLoaded(false);
    setGenerationError("");
    setGenerationMessage("");
    setGenerationWarning("");
    if (route !== "canvas") {
      navigateToRoute("canvas");
    }
  }, [navigateToRoute, route]);

  const restoreStoredSession = useCallback(async (): Promise<void> => {
    if (!getStoredAuthToken()) {
      setAuthStatus("anonymous");
      return;
    }

    try {
      const user = await fetchCurrentUser();
      setCurrentUser(user);
      setAuthStatus("authenticated");
    } catch {
      clearStoredAuthToken();
      setCurrentUser(null);
      setAuthStatus("anonymous");
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function restoreSession(): Promise<void> {
      if (!getStoredAuthToken()) {
        setAuthStatus("anonymous");
        return;
      }

      try {
        const user = await fetchCurrentUser();
        if (!isMounted) {
          return;
        }
        setCurrentUser(user);
        setAuthStatus("authenticated");
      } catch {
        if (!isMounted) {
          return;
        }
        clearStoredAuthToken();
        setCurrentUser(null);
        setAuthStatus("anonymous");
      }
    }

    void restoreSession();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const handleExtensionAuthMessage = (event: MessageEvent): void => {
      if (event.origin !== window.location.origin || !isExtensionAuthMessage(event.data)) {
        return;
      }

      storeAuthToken(event.data.token);
      setAuthStatus("checking");
      void restoreStoredSession();
    };

    window.addEventListener("message", handleExtensionAuthMessage);
    return () => {
      window.removeEventListener("message", handleExtensionAuthMessage);
    };
  }, [restoreStoredSession]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadExtensionRelease(): Promise<void> {
      try {
        const response = await fetch(`${EXTENSION_RELEASE_API_URL}?t=${Date.now()}`, {
          cache: "no-store",
          signal: controller.signal
        });
        if (!response.ok) {
          return;
        }
        const manifest = (await response.json()) as ExtensionReleaseResponse;
        if (!controller.signal.aborted) {
          setPluginGuideLinks(resolveExtensionReleaseLink(manifest.prod));
        }
      } catch {
        // Keep the baked-in links if release settings are unavailable.
      }
    }

    void loadExtensionRelease();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const handleUnauthorized = (): void => {
      setCurrentUser(null);
      setAuthStatus("anonymous");
      setAuthMode("login");
      setGenerationError("登录已过期，请重新登录。");
      setGenerationMessage("");
      setGenerationWarning("");
      if (route !== "canvas") {
        navigateToRoute("canvas");
      }
    };

    window.addEventListener("auth:unauthorized", handleUnauthorized);
    return () => {
      window.removeEventListener("auth:unauthorized", handleUnauthorized);
    };
  }, [navigateToRoute, route]);

  useEffect(() => {
    if (isAuthenticated && (window.location.pathname === "/login" || window.location.pathname === "/register")) {
      navigateToRoute("canvas");
      return;
    }
    if (isAuthenticated && route === "admin" && !isAdminUser(currentUser)) {
      navigateToRoute("canvas");
    }
  }, [currentUser, isAuthenticated, navigateToRoute, route]);

  const refreshCurrentUser = useCallback(async (): Promise<void> => {
    if (!getStoredAuthToken()) {
      return;
    }
    try {
      const user = await fetchCurrentUser();
      setCurrentUser(user);
    } catch {
      // Auth expiration is handled globally by authFetch.
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const refreshWhenVisible = (): void => {
      if (document.visibilityState === "visible") {
        void refreshCurrentUser();
      }
    };

    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [isAuthenticated, refreshCurrentUser]);

  useEffect(() => {
    if (!isAuthenticated || !currentUser || currentUser.phone || isAdminUser(currentUser)) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void refreshCurrentUser();
    }, 5000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [currentUser, isAuthenticated, refreshCurrentUser]);

  useEffect(() => {
    if (!isAuthenticated) {
      setEcommerceStats(emptyEcommerceStats);
      return;
    }

    const controller = new AbortController();
    async function loadEcommerceStats(): Promise<void> {
      try {
        const response = await authFetch("/api/ecommerce/stats", { signal: controller.signal });
        if (!response.ok) {
          return;
        }
        const body = (await response.json()) as EcommerceStatsResponse;
        if (!controller.signal.aborted) {
          setEcommerceStats(body);
        }
      } catch {
        if (!controller.signal.aborted) {
          setEcommerceStats(emptyEcommerceStats);
        }
      }
    }

    void loadEcommerceStats();
    return () => controller.abort();
  }, [isAuthenticated]);

  const trimmedPrompt = prompt.trim();
  const promptValidationMessage = prompt.trim() ? "" : "请输入提示词。";
  const dimensionValidationMessage = sizeValidationMessage(width, height);
  const isReferenceMode = generationMode === "reference";
  const isReferenceReady = isReferenceMode && referenceSelection.status === "ready";
  const isMobileReferenceReady = isReferenceMode && Boolean(mobileReferenceImage);
  const canUseReferenceGeneration = isMobileDrawer ? isMobileReferenceReady : isReferenceReady;
  const referenceValidationMessage =
    isReferenceMode && !canUseReferenceGeneration
      ? isMobileDrawer
        ? "请先上传一张参考图，或从历史结果中选择一张继续生成。"
        : referenceSelection.hint
      : "";
  const validationMessage = promptValidationMessage || dimensionValidationMessage || referenceValidationMessage;
  const shouldShowValidation = Boolean(validationMessage);
  const canGenerate = !validationMessage;
  const referenceSelectionWidth = referenceSelection.status === "ready" ? referenceSelection.width : undefined;
  const referenceSelectionHeight = referenceSelection.status === "ready" ? referenceSelection.height : undefined;

  useEffect(() => {
    if (sizePresetId !== ORIGINAL_SIZE_PRESET_ID) {
      return;
    }

    if (referenceSelectionWidth === undefined || referenceSelectionHeight === undefined) {
      setSizePresetId(CUSTOM_SIZE_PRESET_ID);
      return;
    }

    const nextWidth = Math.round(referenceSelectionWidth);
    const nextHeight = Math.round(referenceSelectionHeight);
    if (width !== nextWidth) {
      setWidth(nextWidth);
    }
    if (height !== nextHeight) {
      setHeight(nextHeight);
    }
  }, [height, referenceSelectionHeight, referenceSelectionWidth, sizePresetId, width]);

  const visibleHistory = useMemo(
    () => (isHistoryExpanded ? generationHistory : generationHistory.slice(0, HISTORY_COLLAPSED_LIMIT)),
    [generationHistory, isHistoryExpanded]
  );
  const hiddenHistoryCount = Math.max(0, generationHistory.length - HISTORY_COLLAPSED_LIMIT);
  const hasAdditionalHistory = hiddenHistoryCount > 0;
  const panelStatus = useMemo<PanelStatus | null>(() => {
    if (isGenerating) {
      return {
        tone: "progress",
        message: isMobileDrawer
          ? `当前 ${activeGenerationCount} 个任务正在生成，结果会保存到图库。`
          : `当前 ${activeGenerationCount} 个任务正在生成到画布，可继续下发新任务。`,
        testId: "generation-progress"
      };
    }

    if (generationError) {
      return {
        tone: "error",
        message: generationError,
        testId: "generation-error"
      };
    }

    if (shouldShowValidation && validationMessage) {
      return {
        tone: "warning",
        message: validationMessage,
        testId: "validation-message"
      };
    }

    if (generationWarning) {
      return {
        tone: "warning",
        message: generationWarning,
        testId: "generation-warning"
      };
    }

    if (generationMessage) {
      return {
        tone: "success",
        message: generationMessage,
        testId: "generation-message"
      };
    }

    return null;
  }, [
    activeGenerationCount,
    generationError,
    generationMessage,
    generationWarning,
    isGenerating,
    isMobileDrawer,
    shouldShowValidation,
    validationMessage
  ]);

  useEffect(() => {
    const updateRoute = (): void => {
      setPublicPath(window.location.pathname);
      if (!isAuthenticated) {
        if (window.location.pathname === "/register") {
          setAuthMode("register");
        } else if (window.location.pathname === "/login") {
          setAuthMode("login");
        }
        return;
      }
      const nextRoute = routeFromLocation();
      if (nextRoute === "admin" && !isAdminUser(currentUser)) {
        navigateToRoute("canvas");
        return;
      }
      setRoute(nextRoute);
    };

    window.addEventListener("popstate", updateRoute);
    return () => {
      window.removeEventListener("popstate", updateRoute);
    };
  }, [currentUser, isAuthenticated, navigateToRoute]);

  useEffect(() => {
    return () => {
      for (const task of activeGenerationsRef.current.values()) {
        task.controller.abort();
      }
      activeGenerationsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      setIsProjectLoaded(false);
      return;
    }

    const controller = new AbortController();

    async function loadProject(): Promise<void> {
      setSaveStatus("loading");
      setSaveError("");

      try {
        const response = await authFetch("/api/project", {
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error(`Project load failed with ${response.status}`);
        }

        const project = (await response.json()) as ProjectState;
        const snapshot = filterLoadingPlaceholdersFromSnapshot(project.snapshot);
        if (isPersistedSnapshot(snapshot)) {
          setProjectSnapshot(snapshot);
        }
        setGenerationHistory(project.history);
        setSaveStatus("saved");
      } catch {
        if (controller.signal.aborted) {
          return;
        }

        setSaveStatus("error");
        setSaveError("无法载入已保存项目，将使用空白画布。");
      } finally {
        if (!controller.signal.aborted) {
          setIsProjectLoaded(true);
        }
      }
    }

    void loadProject();

    return () => {
      controller.abort();
    };
  }, [currentUser?.id, isAuthenticated]);

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_DRAWER_MEDIA_QUERY);
    const updateDrawerMode = (): void => {
      setIsMobileDrawer(mediaQuery.matches);
    };

    updateDrawerMode();
    mediaQuery.addEventListener("change", updateDrawerMode);

    return () => {
      mediaQuery.removeEventListener("change", updateDrawerMode);
    };
  }, []);

  const closeAiPanel = useCallback((): void => {
    setIsAiPanelOpen(false);
    window.requestAnimationFrame(() => {
      canvasShellRef.current?.focus({ preventScroll: true });
    });
  }, []);

  useEffect(() => {
    if (!isMobileDrawer || !isAiPanelOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeAiPanel();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeAiPanel, isAiPanelOpen, isMobileDrawer]);

  useEffect(() => {
    if (!isMobileDrawer || !isAiPanelOpen) {
      return;
    }

    const focusFrame = window.requestAnimationFrame(() => {
      panelCloseButtonRef.current?.focus({ preventScroll: true });
    });

    return () => {
      window.cancelAnimationFrame(focusFrame);
    };
  }, [isAiPanelOpen, isMobileDrawer]);

  useEffect(() => {
    generationModeRef.current = generationMode;

    const editor = editorRef.current;
    if (generationMode === "reference" && editor) {
      const nextSelection = resolveReferenceSelection(editor);
      setReferenceSelection((currentSelection) =>
        areReferenceSelectionsEqual(currentSelection, nextSelection) ? currentSelection : nextSelection
      );
      return;
    }

    setReferenceSelection((currentSelection) =>
      areReferenceSelectionsEqual(currentSelection, missingReferenceSelection) ? currentSelection : missingReferenceSelection
    );
  }, [generationMode]);

  useEffect(() => {
    if (generationMode === "reference" || sizePresetId !== ORIGINAL_SIZE_PRESET_ID) {
      return;
    }

    setSizePresetId(CUSTOM_SIZE_PRESET_ID);
  }, [generationMode, sizePresetId]);

  const handleEditorMount = useCallback((editor: Editor) => {
    editorRef.current = editor;
    if (!editor.user.getIsSnapMode()) {
      editor.user.updateUserPreferences({ isSnapMode: true });
    }

    let referenceSelectionFrame: number | undefined;
    const commitReferenceSelection = (): void => {
      if (generationModeRef.current !== "reference") {
        return;
      }

      const nextSelection = resolveReferenceSelection(editor);
      setReferenceSelection((currentSelection) =>
        areReferenceSelectionsEqual(currentSelection, nextSelection) ? currentSelection : nextSelection
      );
    };
    const updateReferenceSelection = (): void => {
      if (generationModeRef.current !== "reference" || referenceSelectionFrame !== undefined) {
        return;
      }

      referenceSelectionFrame = window.requestAnimationFrame(() => {
        referenceSelectionFrame = undefined;
        commitReferenceSelection();
      });
    };

    async function saveProject(): Promise<void> {
      const requestId = saveRequestRef.current + 1;
      saveRequestRef.current = requestId;
      setSaveStatus("saving");
      setSaveError("");

      try {
        const response = await authFetch("/api/project", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            snapshot: filterLoadingPlaceholdersFromSnapshot(editor.getSnapshot())
          })
        });

        if (!response.ok) {
          throw new Error(`Project save failed with ${response.status}`);
        }

        if (saveRequestRef.current === requestId) {
          setSaveStatus("saved");
        }
      } catch {
        if (saveRequestRef.current === requestId) {
          setSaveStatus("error");
          setSaveError("自动保存失败，当前画布已保留，请稍后继续编辑。");
        }
      }
    }

    const removeListener = editor.store.listen(
      () => {
        window.clearTimeout(saveTimerRef.current);
        setSaveStatus((status) => (status === "pending" ? status : "pending"));
        setSaveError((error) => (error ? "" : error));
        saveTimerRef.current = window.setTimeout(() => {
          void saveProject();
        }, AUTOSAVE_DEBOUNCE_MS);
      },
      {
        source: "user",
        scope: "document"
      }
    );
    const removeReferenceStoreListener = editor.store.listen(updateReferenceSelection, {
      source: "all",
      scope: "all"
    });
    editor.on("change", updateReferenceSelection);
    commitReferenceSelection();

    return () => {
      window.clearTimeout(saveTimerRef.current);
      if (referenceSelectionFrame !== undefined) {
        window.cancelAnimationFrame(referenceSelectionFrame);
      }
      if (editorRef.current === editor) {
        editorRef.current = null;
      }
      editor.off("change", updateReferenceSelection);
      removeReferenceStoreListener();
      removeListener();
    };
  }, []);

  function selectScenePreset(nextPresetId: string): void {
    if (nextPresetId === CUSTOM_SIZE_PRESET_ID) {
      setSizePresetId(CUSTOM_SIZE_PRESET_ID);
      return;
    }

    if (nextPresetId === ORIGINAL_SIZE_PRESET_ID) {
      if (referenceSelection.status !== "ready") {
        return;
      }

      setSizePresetId(ORIGINAL_SIZE_PRESET_ID);
      setWidth(Math.round(referenceSelection.width));
      setHeight(Math.round(referenceSelection.height));
      return;
    }

    const preset = SIZE_PRESETS.find((item) => item.id === nextPresetId);
    if (!preset) {
      return;
    }

    setSizePresetId(preset.id);
    setWidth(preset.width);
    setHeight(preset.height);
  }

  function updateWidth(value: string): void {
    setWidth(normalizeDimension(value));
    setSizePresetId(CUSTOM_SIZE_PRESET_ID);
  }

  function updateHeight(value: string): void {
    setHeight(normalizeDimension(value));
    setSizePresetId(CUSTOM_SIZE_PRESET_ID);
  }

  function applyPromptStarter(starter: string): void {
    setPrompt(starter);
    setGenerationError("");
    setGenerationMessage("");
    setGenerationWarning("");
  }

  function selectEcommerceMode(nextMode: EcommerceGenerationMode): void {
    const nextScenes = ecommerceScenesByMode[nextMode];
    const firstScene = ECOMMERCE_SCENE_TEMPLATES.find((item) => item.id === nextScenes[0]);
    const nextPreset = firstScene ? SIZE_PRESETS.find((item) => item.id === firstScene.defaultSizePresetId) : undefined;

    setEcommerceMode(nextMode);
    setEcommerceSceneIds(nextScenes);
    setEcommerceSizePresetId(nextPreset?.id ?? "square-1k");
    if (nextMode === "single-poster" || nextMode === "category-kit") {
      setEcommerceCount(1);
    }
    setEcommerceTextLanguage(nextMode === "text-translation" ? ecommerceTextLanguage === "none" ? "en" : ecommerceTextLanguage : "none");
  }

  async function selectEcommerceImage(file: File | undefined): Promise<void> {
    if (!file) {
      return;
    }
    if (!isSupportedReferenceImageType(file.type)) {
      setGenerationError("请上传 PNG、JPEG 或 WebP 图片。");
      return;
    }
    if (file.size > MAX_REFERENCE_IMAGE_BYTES) {
      setGenerationError("商品图不能超过 50MB。");
      return;
    }

    const previousPreviewUrl = ecommerceImage?.previewUrl;
    const previewUrl = URL.createObjectURL(file);
    setEcommerceImage({
      dataUrl: await blobToDataUrl(file),
      fileName: fileNameWithImageExtension(file.name || "product-image", file.type),
      previewUrl
    });
    if (previousPreviewUrl) {
      URL.revokeObjectURL(previousPreviewUrl);
    }
    setGenerationError("");
  }

  async function selectMobileReferenceImage(file: File | undefined): Promise<void> {
    if (!file) {
      return;
    }
    if (!isSupportedReferenceImageType(file.type)) {
      setGenerationError("请上传 PNG、JPEG 或 WebP 图片。");
      return;
    }
    if (file.size > MAX_REFERENCE_IMAGE_BYTES) {
      setGenerationError("参考图不能超过 50MB。");
      return;
    }

    const previousPreviewUrl = mobileReferenceImage?.previewUrl;
    const previewUrl = URL.createObjectURL(file);
    setMobileReferenceImage({
      dataUrl: await blobToDataUrl(file),
      fileName: fileNameWithImageExtension(file.name || "reference-image", file.type),
      previewUrl
    });
    if (previousPreviewUrl) {
      URL.revokeObjectURL(previousPreviewUrl);
    }
    setGenerationMode("reference");
    setGenerationError("");
    setGenerationMessage("已添加参考图。");
    setGenerationWarning("");
  }

  function toggleEcommerceScene(sceneId: EcommerceSceneTemplateId): void {
    setEcommerceSceneIds((sceneIds) =>
      sceneIds.includes(sceneId) ? sceneIds.filter((id) => id !== sceneId) : [...sceneIds, sceneId]
    );
  }

  async function pollEcommerceJob(jobId: string, signal: AbortSignal): Promise<EcommerceBatchGenerateResponse> {
    for (;;) {
      if (signal.aborted) {
        throw new DOMException("Ecommerce generation was aborted.", "AbortError");
      }
      const response = await authFetch(`/api/ecommerce/images/batch-generate/${encodeURIComponent(jobId)}`, { signal });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }
      const body = (await response.json()) as EcommerceBatchGenerateResponse;
      if (body.status === "succeeded" || body.status === "partial" || body.status === "failed") {
        return body;
      }
      setGenerationMessage(body.message || `电商任务生成中：${body.completedScenes}/${body.totalScenes}`);
      await new Promise((resolve) => window.setTimeout(resolve, 1400));
    }
  }

  function buildEcommerceGenerationPayload(input: {
    selectedSize: SizePreset;
    outputCountPerScene: number;
    ecommercePresetId: StylePresetId;
    title: string;
  }) {
    return {
      product: {
        title: input.title || (ecommerceMode === "category-kit" ? "AI 自拆品类套图" : ecommerceMode === "single-poster" ? "单品完整电商海报" : `${ecommerceModeLabels[ecommerceMode]}产品`),
        description: ecommerceDescription.trim(),
        targetCustomer: ecommerceTargetCustomer.trim(),
        usageScene: ecommerceUsageScene.trim(),
        material: ecommerceMaterial.trim(),
        color: ecommerceColor.trim()
      },
      platform: ecommerceMode === "text-translation" ? "other" : ecommercePlatform,
      market: ecommerceMode === "text-translation" ? "global" : ecommerceMarket,
      textLanguage: ecommerceMode === "text-translation" ? ecommerceTextLanguage : "none",
      allowTextRecreation: ecommerceMode !== "text-translation",
      removeWatermarkAndLogo: ecommerceRemoveWatermark,
      sceneTemplateIds: ecommerceMode === "category-kit" && ecommerceSceneIds.length === 0 ? ecommerceScenesByMode["category-kit"] : ecommerceSceneIds,
      sizePresetId: input.selectedSize.id,
      size: {
        width: input.selectedSize.width,
        height: input.selectedSize.height
      },
      stylePresetId: input.ecommercePresetId,
      quality: "auto" as const,
      outputFormat: "png" as const,
      countPerScene: input.outputCountPerScene,
      referenceImage: ecommerceImage
        ? {
            dataUrl: ecommerceImage.dataUrl,
            fileName: ecommerceImage.fileName
          }
        : undefined,
      extraDirection: ecommerceExtraDirection.trim()
    };
  }

  async function submitEcommerceGeneration(): Promise<void> {
    const title = ecommerceTitle.trim();
    const selectedSize = SIZE_PRESETS.find((item) => item.id === ecommerceSizePresetId) ?? SIZE_PRESETS[0];
    const outputCountPerScene = ecommerceMode === "single-poster" || ecommerceMode === "category-kit" ? 1 : ecommerceCount;
    const ecommercePresetId: StylePresetId =
      ecommerceMode === "creative" ? "photoreal" : ecommerceMode === "single-poster" ? "poster" : "product";
    const effectiveEcommerceSceneIds = ecommerceMode === "category-kit" && ecommerceSceneIds.length === 0 ? ecommerceScenesByMode["category-kit"] : ecommerceSceneIds;
    const totalOutputs = effectiveEcommerceSceneIds.length * outputCountPerScene;

    setGenerationError("");
    setGenerationMessage("");
    setGenerationWarning("");

    if (!ecommerceImage) {
      setGenerationError("请先上传一张产品图。");
      return;
    }
    const titleOptionalMode = ecommerceMode === "single-poster" || ecommerceMode === "category-kit";
    if (!title && !titleOptionalMode && !isMobileDrawer) {
      setGenerationError("请输入商品标题。");
      return;
    }
    if (ecommerceMode !== "category-kit" && ecommerceSceneIds.length === 0) {
      setGenerationError("请至少选择一个生成场景。");
      return;
    }

    const payload = buildEcommerceGenerationPayload({
      selectedSize,
      outputCountPerScene,
      ecommercePresetId,
      title
    });

    const generateEndpoint = ecommerceMode === "category-kit" ? "/api/ecommerce/images/category-kit-generate" : "/api/ecommerce/images/batch-generate";

    if (isMobileDrawer) {
      const controller = new AbortController();
      setIsEcommerceGenerating(true);
      setActiveGenerationCount((value) => value + 1);
      setMobileCreateTab("history");
      setMobileSelectedRecordId(null);

      try {
        const response = await authFetch(generateEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        });
        if (!response.ok) {
          throw new Error(await readErrorMessage(response));
        }
        const createdJob = (await response.json()) as EcommerceBatchGenerateResponse;
        setGenerationMessage(createdJob.message || "电商批量任务已创建。");
        const completedJob = await pollEcommerceJob(createdJob.jobId, controller.signal);
        await Promise.all(
          completedJob.records.flatMap((record) =>
            record.outputs.flatMap((output) => (output.asset ? [preloadGeneratedAssetPreview(output.asset, controller.signal)] : []))
          )
        );
        const succeededCount = completedJob.records.reduce((total, record) => total + successfulOutputCount(record), 0);
        setGenerationHistory((history) => [
          ...completedJob.records,
          ...history.filter((record) => !completedJob.records.some((item) => item.id === record.id))
        ].slice(0, 20));
        setMobileSelectedRecordId(completedJob.records[0]?.id ?? null);
        if (succeededCount > 0) {
          setGenerationMessage(`已生成 ${succeededCount} 张电商图，结果已保存到作品图库。`);
        } else {
          setGenerationError(completedJob.message || "电商生成未返回可用图片。");
        }
      } catch (error) {
        setGenerationError(error instanceof Error ? error.message : "电商生成失败，请重试。");
      } finally {
        setIsEcommerceGenerating(false);
        setActiveGenerationCount((value) => Math.max(0, value - 1));
      }
      return;
    }

    if (!editorRef.current) {
      setGenerationError("画布未就绪。");
      return;
    }

    const editor = editorRef.current;
    const requestId = generationRequestRef.current + 1;
    generationRequestRef.current = requestId;
    const controller = new AbortController();
    let placeholderSet: ActiveGenerationPlaceholders | undefined;

    setIsEcommerceGenerating(true);
    setActiveGenerationCount((value) => value + 1);
    try {
      const response = await authFetch(generateEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }
      const createdJob = (await response.json()) as EcommerceBatchGenerateResponse;
      const placeholderCount = ecommerceMode === "category-kit" ? Math.max(1, createdJob.totalScenes || totalOutputs) : totalOutputs;
      placeholderSet = createEcommerceBatchPlaceholders(editor, placeholderCount, selectedSize, requestId);
      setGenerationMessage(createdJob.message || "电商批量任务已创建。");
      const completedJob = await pollEcommerceJob(createdJob.jobId, controller.signal);
      const finalOutputCount = ecommerceMode === "category-kit" ? Math.max(1, completedJob.totalScenes || completedJob.records.length) : placeholderCount;
      const combinedRecord = createEcommerceCombinedRecord({
        job: completedJob,
        prompt: `${ecommerceModeLabels[ecommerceMode]}：${title || "移动端快捷生成"}`,
        size: {
          width: selectedSize.width,
          height: selectedSize.height
        },
        presetId: ecommercePresetId,
        outputFormat: "png",
        count: finalOutputCount
      });
      if (!placeholderSet) {
        throw new Error("生成占位内容失败。");
      }
      await Promise.all(combinedRecord.outputs.flatMap((output) => (output.asset ? [preloadGeneratedAssetPreview(output.asset, controller.signal)] : [])));
      const insertedCount = replaceGenerationPlaceholders(editor, placeholderSet, combinedRecord);
      const failedCount = Math.max(0, finalOutputCount - insertedCount);
      setGenerationHistory((history) => [
        ...completedJob.records,
        ...history.filter((record) => !completedJob.records.some((item) => item.id === record.id))
      ].slice(0, 20));
      if (insertedCount > 0) {
        setGenerationMessage(
          failedCount > 0
            ? `已生成并插入 ${insertedCount} 张电商图，${failedCount} 张失败。`
            : `已生成并插入 ${insertedCount} 张电商图。`
        );
      } else {
        setGenerationError(completedJob.message || "电商生成未返回可插入图片。");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "电商生成失败，请重试。";
      if (placeholderSet) {
        markGenerationPlaceholdersFailed(editor, placeholderSet, message);
      }
      setGenerationError(message);
    } finally {
      setIsEcommerceGenerating(false);
      setActiveGenerationCount((value) => Math.max(0, value - 1));
    }
  }

  async function executeMobileGeneration(
    input: GenerationSubmitInput,
    requestMode: GenerationMode,
    referenceForRequest?: GenerationReferenceInput,
    referenceAssetId?: string
  ): Promise<void> {
    setGenerationError("");
    setGenerationMessage("");
    setGenerationWarning("");

    const inputValidationMessage = generationValidationMessage(input.prompt, input.size.width, input.size.height);
    if (inputValidationMessage) {
      setGenerationError(inputValidationMessage);
      return;
    }
    if (requestMode === "reference" && !referenceForRequest) {
      setGenerationError("请先上传一张可用的参考图。");
      return;
    }

    requestGenerationNotificationPermission();

    const controller = new AbortController();
    const requestId = generationRequestRef.current + 1;
    generationRequestRef.current = requestId;
    const temporaryRecord = createTemporaryGenerationRecord({
      requestId,
      submitInput: input,
      requestMode,
      referenceAssetId
    });

    setMobileCreateTab("history");
    setMobileSelectedRecordId(temporaryRecord.id);
    setActiveGenerationCount((value) => value + 1);
    setGenerationHistory((history) => [temporaryRecord, ...history.filter((record) => record.id !== temporaryRecord.id)].slice(0, 20));

    try {
      const requestBody: Record<string, unknown> = {
        prompt: input.prompt.trim(),
        presetId: input.presetId,
        sizePresetId: input.sizePresetId === ORIGINAL_SIZE_PRESET_ID ? CUSTOM_SIZE_PRESET_ID : input.sizePresetId,
        size: input.size,
        quality: input.quality,
        outputFormat: input.outputFormat,
        count: input.count,
        modelConfigId: input.modelConfigId
      };

      if (requestMode === "reference" && referenceForRequest) {
        requestBody.referenceImage = referenceForRequest.referenceImage;
        if (referenceForRequest.referenceAssetId) {
          requestBody.referenceAssetId = referenceForRequest.referenceAssetId;
        }
      }

      const response = await authFetch(requestMode === "reference" ? "/api/images/edit" : "/api/images/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const body = (await response.json()) as unknown;
      if (!isGenerationResponse(body)) {
        throw new Error("生成服务返回了无法识别的结果。");
      }

      await preloadGenerationRecordPreviews(body.record, controller.signal);
      const succeededCount = successfulOutputCount(body.record);
      const failedCount = body.record.outputs.filter((output) => output.status === "failed").length;
      setGenerationHistory((history) =>
        [body.record, ...history.filter((record) => record.id !== temporaryRecord.id && record.id !== body.record.id)].slice(0, 20)
      );
      setMobileSelectedRecordId(body.record.id);

      if (succeededCount > 0) {
        setGenerationMessage(
          failedCount > 0
            ? `已生成 ${succeededCount} 张图，${failedCount} 张失败。结果已保存到作品图库。`
            : `已生成 ${succeededCount} 张图，结果已保存到作品图库。`
        );
      } else {
        setGenerationError(body.record.error || "没有生成成功的图片。");
      }
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      const message = error instanceof Error ? error.message : "生成失败，请重试。";
      setGenerationHistory((history) =>
        history.map((record) => (record.id === temporaryRecord.id ? { ...record, status: "failed", error: message } : record))
      );
      setGenerationError(message);
    } finally {
      setActiveGenerationCount((value) => Math.max(0, value - 1));
    }
  }

  async function executeGeneration(
    input: GenerationSubmitInput,
    requestMode: GenerationMode,
    resolveReference?: (signal: AbortSignal) => Promise<GenerationReferenceInput | undefined>,
    referenceAssetId?: string
  ): Promise<void> {
    setGenerationError("");
    setGenerationMessage("");
    setGenerationWarning("");

    const inputValidationMessage = generationValidationMessage(input.prompt, input.size.width, input.size.height);
    if (inputValidationMessage) {
      return;
    }

    const editor = editorRef.current;
    if (!editor) {
      setGenerationError("画布未就绪。");
      return;
    }

    requestGenerationNotificationPermission();

    const controller = new AbortController();
    const requestId = generationRequestRef.current + 1;
    generationRequestRef.current = requestId;
    const placeholderSet = createGenerationPlaceholders(editor, input, requestId, {
      selectPlaceholders: requestMode !== "reference"
    });
    const temporaryRecord = createTemporaryGenerationRecord({
      requestId,
      submitInput: input,
      requestMode,
      referenceAssetId
    });

    activeGenerationsRef.current.set(requestId, {
      requestId,
      temporaryRecordId: temporaryRecord.id,
      controller,
      placeholderSet
    });
    setActiveGenerationCount(activeGenerationsRef.current.size);
    setGenerationHistory((history) => [temporaryRecord, ...history.filter((record) => record.id !== temporaryRecord.id)].slice(0, 20));

    try {
      const referenceForRequest = requestMode === "reference" ? await resolveReference?.(controller.signal) : undefined;
      if (requestMode === "reference" && !referenceForRequest) {
        throw new Error("请先选择一张可用的参考图像。");
      }

      const requestBody: Record<string, unknown> = {
        prompt: input.prompt.trim(),
        presetId: input.presetId,
        sizePresetId: input.sizePresetId === ORIGINAL_SIZE_PRESET_ID ? CUSTOM_SIZE_PRESET_ID : input.sizePresetId,
        size: input.size,
        quality: input.quality,
        outputFormat: input.outputFormat,
        count: input.count,
        modelConfigId: input.modelConfigId
      };

      if (requestMode === "reference" && referenceForRequest) {
        requestBody.referenceImage = referenceForRequest.referenceImage;
        if (referenceForRequest.referenceAssetId) {
          requestBody.referenceAssetId = referenceForRequest.referenceAssetId;
        }
      }

      const response = await authFetch(requestMode === "reference" ? "/api/images/edit" : "/api/images/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      if (!response.ok) {
        const message = await readErrorMessage(response);
        console.error("Image generation request failed", {
          endpoint: requestMode === "reference" ? "/api/images/edit" : "/api/images/generate",
          status: response.status,
          message,
          requestBody
        });
        throw new Error(message);
      }

      const body = (await response.json()) as unknown;
      if (!isGenerationResponse(body)) {
        throw new Error("生成服务返回了无法识别的结果。");
      }

      if (controller.signal.aborted || !activeGenerationsRef.current.has(requestId)) {
        return;
      }

      await preloadGenerationRecordPreviews(body.record, controller.signal);
      if (controller.signal.aborted || !activeGenerationsRef.current.has(requestId)) {
        return;
      }

      setGenerationHistory((history) =>
        [body.record, ...history.filter((record) => record.id !== temporaryRecord.id && record.id !== body.record.id)].slice(0, 20)
      );
      const insertedCount = replaceGenerationPlaceholders(editor, placeholderSet, body.record);
      const failedCount =
        body.record.outputs.filter((output) => output.status === "failed").length +
        Math.max(0, placeholderSet.placements.length - body.record.outputs.length);
      const cloudFailedCount = cloudFailureCount(body.record);
      if (insertedCount > 0) {
        if (cloudFailedCount > 0) {
          setGenerationWarning(`已向画布插入 ${insertedCount} 张图像，${cloudFailedCount} 张云端上传失败，已保留本地副本。`);
        } else {
          setGenerationMessage(
            failedCount > 0
              ? `已向画布插入 ${insertedCount} 张图像，${failedCount} 张失败。`
              : `已向画布插入 ${insertedCount} 张图像。`
          );
        }
        showGenerationCompleteNotification(body.record, insertedCount, failedCount);
      } else {
        setGenerationError(body.record.error || "没有可插入的成功图像。");
      }
    } catch (error) {
      if (controller.signal.aborted || !activeGenerationsRef.current.has(requestId)) {
        return;
      }

      const message = error instanceof Error ? error.message : "生成失败，请重试。";
      markGenerationPlaceholdersFailed(editor, placeholderSet, message);
      setGenerationHistory((history) =>
        history.map((record) => (record.id === temporaryRecord.id ? { ...record, status: "failed", error: message } : record))
      );
      setGenerationError(message);
    } finally {
      if (activeGenerationsRef.current.delete(requestId)) {
        setActiveGenerationCount(activeGenerationsRef.current.size);
      }
    }
  }

  async function submitGeneration(): Promise<void> {
    const input: GenerationSubmitInput = {
      prompt: trimmedPrompt,
      presetId: stylePreset,
      sizePresetId,
      size: {
        width,
        height
      },
      quality,
      outputFormat,
      count
    };

    if (isMobileDrawer) {
      if (generationMode === "reference") {
        await executeMobileGeneration(
          input,
          "reference",
          mobileReferenceImage
            ? {
                referenceImage: {
                  dataUrl: mobileReferenceImage.dataUrl,
                  fileName: mobileReferenceImage.fileName
                },
                referenceAssetId: mobileReferenceImage.assetId
              }
            : undefined,
          mobileReferenceImage?.assetId
        );
        return;
      }

      await executeMobileGeneration(input, "text");
      return;
    }

    if (generationMode === "reference") {
      await executeGeneration(
        input,
        "reference",
        async (signal) => {
        const editor = editorRef.current;
        if (!editor) {
          return undefined;
        }

        const currentSelection = resolveReferenceSelection(editor);
        if (currentSelection.status !== "ready") {
          return undefined;
        }

        return buildReferenceGenerationInput(editor, currentSelection, signal);
      },
        referenceSelection.status === "ready" ? referenceSelection.localAssetId : undefined
      );
      return;
    }

    await executeGeneration(input, "text");
  }

  function cancelReferenceSelection(): void {
    editorRef.current?.selectNone();
    setReferenceSelection(missingReferenceSelection);
    setGenerationError("");
    setGenerationMessage("");
    setGenerationWarning("");
  }

  function locateHistoryRecord(record: GenerationRecord): void {
    setGenerationError("");
    setGenerationMessage("");
    setGenerationWarning("");

    const editor = editorRef.current;
    if (!editor) {
      setGenerationError("画布未就绪。");
      return;
    }

    const shapeId = findCanvasImageShape(editor, record);
    if (!shapeId) {
      const activeTask = Array.from(activeGenerationsRef.current.values()).find((task) => task.temporaryRecordId === record.id);
      const placeholderId = activeTask ? firstLiveGenerationPlaceholder(editor, activeTask.placeholderSet) : undefined;
      if (!placeholderId) {
        setGenerationError("画布上找不到这张历史图片，可能已被删除。");
        return;
      }

      const bounds = editor.getShapePageBounds(placeholderId);
      editor.select(placeholderId);
      if (bounds) {
        editor.zoomToBounds(bounds, {
          animation: { duration: 220 },
          inset: 96
        });
      } else {
        editor.zoomToSelection({ animation: { duration: 220 } });
      }
      setGenerationMessage("已定位到生成中的任务。");
      return;
    }

    const bounds = editor.getShapePageBounds(shapeId);
    editor.select(shapeId);
    if (bounds) {
      editor.zoomToBounds(bounds, {
        animation: { duration: 220 },
        inset: 96
      });
    } else {
      editor.zoomToSelection({ animation: { duration: 220 } });
    }
    setGenerationMessage("已定位到历史图像。");
  }

  async function rerunHistoryRecord(record: GenerationRecord): Promise<void> {
    const nextPresetId = coerceStylePresetId(record.presetId);
    const nextSizePresetId = sizePresetIdForSize(record.size.width, record.size.height);
    const nextCount = coerceGenerationCount(record.count);

    setPrompt(record.prompt);
    setStylePreset(nextPresetId);
    setSizePresetId(nextSizePresetId);
    setWidth(record.size.width);
    setHeight(record.size.height);
    setQuality(record.quality);
    setOutputFormat(record.outputFormat);
    setCount(nextCount);

    const nextGenerationMode: GenerationMode = record.referenceAssetId ? "reference" : "text";
    setGenerationMode(nextGenerationMode);

    if (isMobileDrawer) {
      await executeMobileGeneration(
        {
          prompt: record.prompt,
          presetId: nextPresetId,
          sizePresetId: nextSizePresetId,
          size: record.size,
          quality: record.quality,
          outputFormat: record.outputFormat,
          count: nextCount
        },
        nextGenerationMode,
        record.referenceAssetId ? await buildHistoryReferenceGenerationInput(record, new AbortController().signal) : undefined,
        record.referenceAssetId
      );
      return;
    }

    await executeGeneration(
      {
        prompt: record.prompt,
        presetId: nextPresetId,
        sizePresetId: nextSizePresetId,
        size: record.size,
        quality: record.quality,
        outputFormat: record.outputFormat,
        count: nextCount
      },
      nextGenerationMode,
      record.referenceAssetId
        ? async (signal) => buildHistoryReferenceGenerationInput(record, signal)
        : undefined,
      record.referenceAssetId
    );
  }

  function downloadHistoryRecord(record: GenerationRecord): void {
    const asset = firstDownloadableAsset(record);
    setGenerationWarning("");
    if (!asset) {
      setGenerationError("这条历史记录没有可下载的本地资源。");
      return;
    }

    window.open(authenticatedAssetUrl(`/api/assets/${encodeURIComponent(asset.id)}/download`), "_blank", "noopener,noreferrer");
    setGenerationMessage("已打开原始资源下载。");
  }

  function reuseGalleryImage(item: GalleryImageItem, modelConfigId?: string): void {
    const nextPresetId = coerceStylePresetId(item.presetId);
    const nextSizePresetId = sizePresetIdForSize(item.size.width, item.size.height);
    const shouldRetryWithModel = Boolean(modelConfigId);

    setPrompt(item.prompt);
    setStylePreset(nextPresetId);
    setSizePresetId(nextSizePresetId);
    setWidth(item.size.width);
    setHeight(item.size.height);
    setQuality(item.quality);
    setOutputFormat(item.outputFormat);
    setCount(1);
    setGenerationError("");
    setGenerationWarning("");
    setGenerationMode("text");
    navigateToRoute("canvas");

    if (isMobileDrawer) {
      setMobileCreateTab("creative");

      if (shouldRetryWithModel) {
        setGenerationMessage("已按所选模型重新提交生成。");
        void executeMobileGeneration(
          {
            prompt: item.prompt,
            presetId: nextPresetId,
            sizePresetId: nextSizePresetId,
            size: item.size,
            quality: item.quality,
            outputFormat: item.outputFormat,
            count: 1,
            modelConfigId
          },
          "text"
        );
        return;
      }

      setGenerationMode("reference");
      setGenerationMessage("正在把图库图片设为参考图。");
      void (async () => {
        try {
          const reference = await readStoredReferenceImage(item.asset.id, new AbortController().signal);
          setMobileReferenceImage({
            dataUrl: reference.dataUrl,
            fileName: reference.fileName,
            previewUrl: assetDisplayUrl(item.asset, 512),
            assetId: item.asset.id
          });
          setGenerationMessage("已从图库填入参数，并把图片设为参考图。");
        } catch (error) {
          setGenerationError(error instanceof Error ? error.message : "无法读取图库图片。");
          setGenerationMessage("");
        }
      })();
      return;
    }

    window.requestAnimationFrame(() => {
      const editor = editorRef.current;
      if (!editor) {
        setGenerationMessage(
          shouldRetryWithModel ? "已提交重新生成任务，画布载入后可查看结果。" : "已从 Gallery 填入生成参数。"
        );
        return;
      }

      if (shouldRetryWithModel) {
        setGenerationMessage("已按所选模型重新提交生成。");
        void executeGeneration(
          {
            prompt: item.prompt,
            presetId: nextPresetId,
            sizePresetId: nextSizePresetId,
            size: item.size,
            quality: item.quality,
            outputFormat: item.outputFormat,
            count: 1,
            modelConfigId
          },
          "text"
        );
        return;
      }

      const shapeId = insertGalleryImageOnCanvas(editor, item);
      const bounds = editor.getShapePageBounds(shapeId);
      if (bounds) {
        editor.zoomToBounds(bounds, {
          animation: { duration: 220 },
          inset: 96
        });
      } else {
        editor.zoomToSelection({ animation: { duration: 220 } });
      }

      setGenerationMode("reference");
      setReferenceSelection(resolveReferenceSelection(editor));
      setGenerationMessage("已把 Gallery 图片放到画布，并设为本次参考图。");
    });

    if (isMobileDrawer) {
      setIsAiPanelOpen(true);
    }
  }

  function removeGalleryOutputFromHistory(outputId: string): void {
    setGenerationHistory((history) =>
      history.flatMap((record) => {
        const nextOutputs = record.outputs.filter((output) => output.id !== outputId);
        if (nextOutputs.length === record.outputs.length) {
          return [record];
        }
        if (nextOutputs.length === 0) {
          return [];
        }
        return [
          {
            ...record,
            outputs: nextOutputs
          }
        ];
      })
    );
  }

  async function copyHistoryPrompt(record: GenerationRecord): Promise<void> {
    const promptText = record.prompt.trim();
    setGenerationError("");
    setGenerationMessage("");
    setGenerationWarning("");

    if (!promptText) {
      setGenerationError("这条历史记录没有可复制的提示词。");
      return;
    }

    try {
      await writeClipboardText(promptText);
      setGenerationMessage("已复制提示词。");
    } catch {
      setGenerationError("复制失败，请手动复制提示词。");
    }
  }

  function cancelGeneration(requestId: number): void {
    const task = activeGenerationsRef.current.get(requestId);
    if (!task) {
      return;
    }

    task.controller.abort();
    const editor = editorRef.current;
    if (editor) {
      deleteLoadingGenerationPlaceholders(editor, task.placeholderSet);
    }

    activeGenerationsRef.current.delete(requestId);
    setActiveGenerationCount(activeGenerationsRef.current.size);
    setGenerationHistory((history) =>
      history.map((record) =>
        record.id === task.temporaryRecordId ? { ...record, status: "cancelled", error: "已取消本次生成。" } : record
      )
    );
    setGenerationError("");
    setGenerationMessage("已取消本次生成。");
    setGenerationWarning("");
  }

  if (authStatus === "checking") {
    return (
      <div className="app-root">
        <main className="auth-workspace app-view">
          <div className="canvas-loading-state">
            <BrandMark className="brand-mark--large" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-neutral-800">正在恢复登录状态</p>
              <p className="mt-1 text-xs text-neutral-500">请稍候</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!isAuthenticated) {
    const publicAuthMode = publicPath === "/register" ? "register" : publicPath === "/login" ? "login" : null;
    const guestVisibleRoute = publicPath === "/gallery" ? "gallery" : publicPath === "/help" ? "help" : "canvas";

    return (
      <div className="app-root">
        {publicAuthMode ? (
          <AuthScreen
            mode={publicAuthMode === authMode ? authMode : publicAuthMode}
            onAuthenticated={handleAuthenticated}
            onLogin={loginWithPassword}
            onModeChange={navigateToAuth}
            onRegister={registerWithPassword}
            onSendSmsCode={sendRegisterSmsCode}
          />
        ) : (
          <>
            <GuestTopNavigation
              route={guestVisibleRoute}
              onAuthNavigate={navigateToAuth}
              onNavigate={navigateToRoute}
              onOpenPluginGuide={openPluginGuide}
            />
            {guestVisibleRoute === "help" ? (
              <HelpCenterPage />
            ) : guestVisibleRoute === "gallery" ? (
              <Suspense
                fallback={
                  <main className="gallery-page app-view" data-testid="gallery-loading-page">
                    <div className="gallery-empty-state gallery-empty-state--boot" role="status">
                      <Loader2 className="size-5 animate-spin" aria-hidden="true" />
                      <p>正在载入案例库...</p>
                    </div>
                  </main>
                }
              >
                <LazyGalleryPage
                  demoItems={demoGalleryItems}
                  fetcher={fetch}
                  mode="demo"
                  onAuthRequired={openGuestQuotaModal}
                  onDeleted={() => undefined}
                  onReuse={() => openGuestQuotaModal()}
                />
              </Suspense>
            ) : (
              <GuestDemoWorkbench
                examples={demoCanvasExamples}
                isAiPanelOpen={isAiPanelOpen}
                isMobileDrawer={isMobileDrawer}
                panelCloseButtonRef={panelCloseButtonRef}
                pluginGuideLinks={pluginGuideDisplayLinks}
                selectedExampleId={selectedDemoExampleId}
                onClosePanel={closeAiPanel}
                onGenerationBlocked={openGuestQuotaModal}
                onOpenPanel={() => setIsAiPanelOpen(true)}
                onOpenPluginGuide={openPluginGuide}
                onSelectExample={setSelectedDemoExampleId}
              />
            )}
            {isGuestQuotaModalOpen ? (
              <GuestQuotaOverlay
                links={pluginGuideDisplayLinks}
                onAuthNavigate={navigateFromGuestQuota}
                onClose={() => setIsGuestQuotaModalOpen(false)}
                onOpenInstallHelp={() => {
                  const opened = window.open(pluginGuideDisplayLinks.installHelpUrl, "_blank", "noopener,noreferrer");
                  if (!opened) {
                    window.location.assign(pluginGuideDisplayLinks.installHelpUrl);
                  }
                }}
              />
            ) : null}
            {isPluginGuideOpen ? (
              <PluginGuideOverlay
                browserLabel={pluginBrowserLabel}
                links={pluginGuideDisplayLinks}
                onClose={closePluginGuide}
                onOpenInstallHelp={() => {
                  const opened = window.open(pluginGuideDisplayLinks.installHelpUrl, "_blank", "noopener,noreferrer");
                  if (!opened) {
                    window.location.assign(pluginGuideDisplayLinks.installHelpUrl);
                  }
                }}
                onRetryDetection={() => {
                  dismissedPluginPromptRef.current = false;
                  void probeAndMaybeShowPluginPrompt(true);
                }}
              />
            ) : null}
          </>
        )}
      </div>
    );
  }

  const resolvedRoute = route === "admin" && !isAdminUser(currentUser) ? "canvas" : route;
  const requiresPhoneVerification = !currentUser.phone && !isAdminUser(currentUser);
  const visibleRoute = requiresPhoneVerification && resolvedRoute !== "help" ? "account" : resolvedRoute;
  const showMobileWorkbench = isMobileDrawer && visibleRoute === "canvas";
  const showMobileAppShell = isMobileDrawer && (visibleRoute === "canvas" || visibleRoute === "gallery" || visibleRoute === "account");
  const packageRemaining = currentUser.packageRemaining ?? Math.max(0, (currentUser.quotaTotal ?? 0) - (currentUser.quotaUsed ?? 0));

  return (
    <div className="app-root">
      {!showMobileAppShell ? (
        <TopNavigation
          ecommerceStats={ecommerceStats}
          generationHistoryCount={generationHistory.length}
          route={visibleRoute}
          user={currentUser}
          onLogout={handleLogout}
          onNavigate={navigateToRoute}
          onOpenGenerationHistory={() => {
            navigateToRoute("canvas");
            setSidebarTab("creative");
            setIsHistoryExpanded(true);
            setMobileCreateTab("history");
          }}
          onPreloadGallery={preloadGalleryPage}
        />
      ) : null}
      {showMobileWorkbench ? (
        <MobileWorkbench
          activeTab={mobileCreateTab}
          canGenerate={canGenerate}
          count={count}
          ecommerceCount={ecommerceCount}
          ecommerceDescription={ecommerceDescription}
          ecommerceExtraDirection={ecommerceExtraDirection}
          ecommerceImage={ecommerceImage}
          ecommerceMarket={ecommerceMarket}
          ecommerceMode={ecommerceMode}
          ecommercePlatform={ecommercePlatform}
          ecommerceRemoveWatermark={ecommerceRemoveWatermark}
          ecommerceSceneIds={ecommerceSceneIds}
          ecommerceSizePresetId={ecommerceSizePresetId}
          ecommerceTextLanguage={ecommerceTextLanguage}
          ecommerceTitle={ecommerceTitle}
          generationError={generationError}
          generationHistory={generationHistory}
          generationMessage={generationMessage}
          generationMode={generationMode}
          generationWarning={generationWarning}
          height={height}
          isEcommerceGenerating={isEcommerceGenerating}
          isGenerating={isGenerating}
          mobileReferenceImage={mobileReferenceImage}
          outputFormat={outputFormat}
          panelStatus={panelStatus}
          prompt={prompt}
          quality={quality}
          selectedRecordId={mobileSelectedRecordId}
          sizePresetId={sizePresetId}
          stylePreset={stylePreset}
          user={currentUser}
          width={width}
          onApplyPromptStarter={applyPromptStarter}
          onCopyHistoryPrompt={(record) => void copyHistoryPrompt(record)}
          onDownloadHistoryRecord={downloadHistoryRecord}
          onNavigate={navigateToRoute}
          onOpenGallery={() => navigateToRoute("gallery")}
          onRerunHistoryRecord={(record) => void rerunHistoryRecord(record)}
          onSelectEcommerceImage={(file) => void selectEcommerceImage(file)}
          onSelectEcommerceMode={selectEcommerceMode}
          onSelectEcommerceScene={toggleEcommerceScene}
          onSelectMobileReferenceImage={(file) => void selectMobileReferenceImage(file)}
          onSelectSizePreset={selectScenePreset}
          onSetActiveTab={setMobileCreateTab}
          onSetCount={setCount}
          onSetEcommerceCount={setEcommerceCount}
          onSetEcommerceDescription={setEcommerceDescription}
          onSetEcommerceExtraDirection={setEcommerceExtraDirection}
          onSetEcommerceMarket={setEcommerceMarket}
          onSetEcommercePlatform={setEcommercePlatform}
          onSetEcommerceRemoveWatermark={setEcommerceRemoveWatermark}
          onSetEcommerceSizePresetId={setEcommerceSizePresetId}
          onSetEcommerceTextLanguage={setEcommerceTextLanguage}
          onSetEcommerceTitle={setEcommerceTitle}
          onSetGenerationMode={setGenerationMode}
          onSetHeight={updateHeight}
          onSetOutputFormat={setOutputFormat}
          onSetPrompt={setPrompt}
          onSetQuality={setQuality}
          onSetSelectedRecordId={setMobileSelectedRecordId}
          onSetStylePreset={setStylePreset}
          onSetWidth={updateWidth}
          onSubmitEcommerce={() => void submitEcommerceGeneration()}
          onSubmitGeneration={() => void submitGeneration()}
        />
      ) : null}
      <main className="app-shell app-view relative flex min-h-0 overflow-hidden bg-neutral-950 text-neutral-900" data-active-route={visibleRoute} hidden={visibleRoute !== "canvas" || showMobileWorkbench}>
      <section
        className="relative min-w-0 flex-1 bg-neutral-100 outline-none"
        aria-label={`${BRAND_NAME}创作画布`}
        data-testid="canvas-shell"
        ref={canvasShellRef}
        tabIndex={-1}
      >
        {isProjectLoaded ? (
          <Tldraw
            assets={canvasAssetStore}
            assetUrls={tldrawAssetUrls}
            components={tldrawComponents}
            licenseKey={TLDRAW_LICENSE_KEY}
            options={tldrawOptions}
            snapshot={projectSnapshot}
            shapeUtils={shapeUtils}
            onMount={handleEditorMount}
          />
        ) : (
          <div className="canvas-loading-state">
            <BrandMark className="brand-mark--large" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-neutral-800">正在载入{BRAND_NAME}</p>
              <p className="mt-1 text-xs text-neutral-500">{BRAND_TAGLINE}</p>
            </div>
          </div>
        )}
      </section>

      {isMobileDrawer && isAiPanelOpen ? (
        <button
          aria-label="关闭生成到画布面板"
          className="ai-panel-backdrop"
          data-testid="ai-panel-backdrop"
          type="button"
          onClick={closeAiPanel}
        />
      ) : null}

      <button
        aria-controls="ai-panel"
        aria-expanded={isAiPanelOpen}
        aria-haspopup="dialog"
        className="mobile-ai-trigger"
        data-drawer-state={isAiPanelOpen ? "open" : "closed"}
        data-testid="open-ai-panel"
        type="button"
        onClick={() => setIsAiPanelOpen(true)}
      >
        <Sparkles className="size-4" aria-hidden="true" />
        生成到画布
      </button>

      <aside
        aria-hidden={isMobileDrawer && !isAiPanelOpen ? true : undefined}
        aria-labelledby="ai-panel-title"
        aria-modal={isMobileDrawer && isAiPanelOpen ? true : undefined}
        className="ai-panel fixed inset-y-0 left-0 z-20 flex flex-col border-r border-neutral-200 bg-white shadow-2xl shadow-neutral-950/15"
        data-drawer-state={isAiPanelOpen ? "open" : "closed"}
        data-testid="ai-panel"
        id="ai-panel"
        role={isMobileDrawer ? "dialog" : "complementary"}
        {...(isMobileDrawer && !isAiPanelOpen ? { inert: "" } : {})}
      >
        <div className="ai-panel-header border-b border-neutral-200 px-5 py-4">
          <div className="flex items-start justify-end gap-3">
            <div className="flex shrink-0 items-center gap-2">
              <div
                className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium ${
                  saveStatus === "error" ? "bg-red-50 text-red-700" : "bg-neutral-100 text-neutral-600"
                }`}
                data-testid="save-status"
                role="status"
              >
                <SaveStatusIcon status={saveStatus} />
                {saveStatusLabel(saveStatus)}
              </div>
              <button
                aria-label="关闭生成到画布面板"
                className="ai-panel-close"
                ref={panelCloseButtonRef}
                type="button"
                onClick={closeAiPanel}
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
          </div>
          <h1 className="mt-1 text-xl font-semibold text-neutral-950" id="ai-panel-title">
            {sidebarTab === "plugins" ? "插件能力整合" : "自主生图与编辑"}
          </h1>
          <div className="ai-panel-tabs" role="tablist" aria-label="左侧功能菜单">
            {sidebarTabs.map((tab) => {
              const Icon = tab.icon;
              const active = sidebarTab === tab.id;
              return (
                <button
                  aria-pressed={active}
                  className={active ? "ai-panel-tab is-active" : "ai-panel-tab"}
                  key={tab.id}
                  type="button"
                  onClick={() => setSidebarTab(tab.id)}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="ai-panel-body flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {sidebarTab === "plugins" ? (
            <>
              <section className="sidebar-hero">
                <div className="sidebar-hero__top">
                  <span>AI PRODUCT IMAGE SUITE</span>
                  <Workflow className="size-4" aria-hidden="true" />
                </div>
                <h2>一张产品图，串起整套电商素材</h2>
                <p>PC 主站可直接上传产品图、录入商品信息、选择场景并生成到画布；浏览器插件继续保留采集和网页侧入口。</p>
                <div className="sidebar-hero__actions">
                  <a className="sidebar-cta" href={pluginGuideLinks.downloadUrl} target="_blank" rel="noreferrer">
                    <Download className="size-4" aria-hidden="true" />
                    下载插件
                  </a>
                  <button className="sidebar-ghost" type="button" onClick={openPluginGuide}>
                    <ShieldCheck className="size-4" aria-hidden="true" />
                    安装提示
                  </button>
                </div>
              </section>

              <section className="plugin-flow-card" aria-label="插件使用流程">
                <div className="plugin-flow-card__item">
                  <span>1</span>
                  <strong>下载插件</strong>
                  <small>打开最新安装包</small>
                </div>
                <div className="plugin-flow-card__item">
                  <span>2</span>
                  <strong>安装插件</strong>
                  <small>解压并加载扩展</small>
                </div>
                <div className="plugin-flow-card__item">
                  <span>3</span>
                  <strong>使用插件</strong>
                  <small>打开插件直接使用</small>
                </div>
              </section>

              <section className="sidebar-section">
                <div className="sidebar-section__head">
                  <div>
                    <p className="sidebar-section__eyebrow">生成方式</p>
                    <h3>{ecommerceModeLabels[ecommerceMode]}</h3>
                  </div>
                  <Megaphone className="size-4 text-amber-700" aria-hidden="true" />
                </div>
                <div className="sidebar-grid">
                  {ecommerceModeCards.map((card) => {
                    const Icon = card.icon;
                    const active = ecommerceMode === card.id;
                    return (
                      <button
                        aria-pressed={active}
                        className={active ? "sidebar-card is-active" : "sidebar-card"}
                        type="button"
                        key={card.id}
                        onClick={() => selectEcommerceMode(card.id)}
                      >
                        <Icon className="sidebar-card__icon" aria-hidden="true" />
                        <span className="sidebar-card__title">{card.title}</span>
                        <span className="sidebar-card__desc">{card.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="sidebar-section">
                <div className="sidebar-section__head">
                  <div>
                    <p className="sidebar-section__eyebrow">上传图片</p>
                    <h3>产品参考图</h3>
                  </div>
                  <ImageIcon className="size-4 text-amber-700" aria-hidden="true" />
                </div>
                <label className={ecommerceImage ? "ecommerce-upload has-image" : "ecommerce-upload"}>
                  {ecommerceImage ? (
                    <img alt="产品参考图预览" src={ecommerceImage.previewUrl} />
                  ) : (
                    <span className="ecommerce-upload__empty">
                      <ImageIcon className="size-5" aria-hidden="true" />
                      上传 1 张产品图
                    </span>
                  )}
                  <input
                    accept="image/png,image/jpeg,image/webp"
                    type="file"
                    onChange={(event) => void selectEcommerceImage(event.target.files?.[0])}
                  />
                </label>
              </section>

              <section className="sidebar-section">
                <div className="sidebar-section__head">
                  <div>
                    <p className="sidebar-section__eyebrow">商品信息</p>
                    <h3>生成依据</h3>
                  </div>
                  <Package className="size-4 text-amber-700" aria-hidden="true" />
	                </div>
	                <label className="block">
	                  <span className="control-label">{ecommerceMode === "single-poster" || ecommerceMode === "category-kit" ? "商品标题（可选）" : "商品标题"}</span>
	                  <input
	                    className="field-control"
	                    placeholder={ecommerceMode === "single-poster" || ecommerceMode === "category-kit" ? "可留空，由模型依据产品图和描述归纳" : "例如：便携榨汁杯 / 雪地靴"}
	                    value={ecommerceTitle}
	                    onChange={(event) => setEcommerceTitle(event.target.value)}
	                  />
	                </label>
                <label className="mt-3 block">
                  <span className="control-label">商品描述</span>
                  <textarea
                    className="prompt-textarea mt-2 h-24 w-full resize-none rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm leading-6 text-neutral-950 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                    placeholder="核心卖点、尺寸、包装、注意事项等"
                    value={ecommerceDescription}
                    onChange={(event) => setEcommerceDescription(event.target.value)}
                  />
                </label>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <label>
                    <span className="control-label">目标人群</span>
                    <input className="field-control" value={ecommerceTargetCustomer} onChange={(event) => setEcommerceTargetCustomer(event.target.value)} />
                  </label>
                  <label>
                    <span className="control-label">使用场景</span>
                    <input className="field-control" value={ecommerceUsageScene} onChange={(event) => setEcommerceUsageScene(event.target.value)} />
                  </label>
                  <label>
                    <span className="control-label">材质</span>
                    <input className="field-control" value={ecommerceMaterial} onChange={(event) => setEcommerceMaterial(event.target.value)} />
                  </label>
                  <label>
                    <span className="control-label">颜色 / SKU</span>
                    <input className="field-control" value={ecommerceColor} onChange={(event) => setEcommerceColor(event.target.value)} />
                  </label>
                </div>
              </section>

              <section className="sidebar-section">
                <div className="sidebar-section__head">
                  <div>
                    <p className="sidebar-section__eyebrow">{ecommerceMode === "text-translation" ? "翻译设置" : "平台与市场"}</p>
                    <h3>{ecommerceMode === "text-translation" ? "目标语言" : "输出目标"}</h3>
                  </div>
                  <Globe2 className="size-4 text-amber-700" aria-hidden="true" />
                </div>
                {ecommerceMode === "text-translation" ? (
                  <label className="block">
                    <span className="control-label">目标语言</span>
                    <select className="field-control" value={ecommerceTextLanguage} onChange={(event) => setEcommerceTextLanguage(event.target.value as EcommerceTextLanguage)}>
                      {ECOMMERCE_TEXT_LANGUAGES.filter((item) => item.id !== "none").map((item) => (
                        <option key={item.id} value={item.id}>{item.label}</option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <label>
                      <span className="control-label">平台</span>
                      <select className="field-control" value={ecommercePlatform} onChange={(event) => setEcommercePlatform(event.target.value as EcommercePlatform)}>
                        {ECOMMERCE_PLATFORMS.map((item) => (
                          <option key={item.id} value={item.id}>{item.label}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span className="control-label">市场</span>
                      <select className="field-control" value={ecommerceMarket} onChange={(event) => setEcommerceMarket(event.target.value as EcommerceMarket)}>
                        {ECOMMERCE_MARKETS.map((item) => (
                          <option key={item.id} value={item.id}>{item.label}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}
              </section>

              <section className="sidebar-section">
                <div className="sidebar-section__head">
                  <div>
                    <p className="sidebar-section__eyebrow">生成场景</p>
                    <h3>{ecommerceMode === "category-kit" ? "后台动态规划" : `${ecommerceSceneIds.length} 个场景`}</h3>
                  </div>
                  <BadgeCheck className="size-4 text-emerald-600" aria-hidden="true" />
                </div>
                {ecommerceMode === "category-kit" ? (
                  <p>后台会根据参考图自动识别商品并规划图片清单，不再固定选择场景模板。</p>
                ) : (
                  <div className="sidebar-template-grid">
                    {ECOMMERCE_SCENE_TEMPLATES.filter((item) => item.mode === ecommerceMode).map((item) => {
                      const active = ecommerceSceneIds.includes(item.id);
                      return (
                        <button
                          key={item.id}
                          className={active ? "sidebar-template is-active" : "sidebar-template"}
                          type="button"
                          aria-pressed={active}
                          onClick={() => toggleEcommerceScene(item.id)}
                        >
                          <span className="sidebar-template__title">{item.label}</span>
                          <span className="sidebar-template__desc">{active ? "已选择" : "点击加入"}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className="sidebar-section">
                <div className="sidebar-section__head">
                  <div>
                    <p className="sidebar-section__eyebrow">输出设置</p>
                    <h3>尺寸、张数与约束</h3>
                  </div>
                  <Square className="size-4 text-amber-700" aria-hidden="true" />
                </div>
                <div className="grid grid-cols-2 gap-3">
	                  <label>
	                    <span className="control-label">输出尺寸</span>
	                    <select className="field-control" value={ecommerceSizePresetId} onChange={(event) => setEcommerceSizePresetId(event.target.value)}>
	                      {ecommerceSizePresets.map((item) => (
	                        <option key={item.id} value={item.id}>{sizePresetLabel(item)}</option>
	                      ))}
	                    </select>
	                  </label>
	                  <label>
	                    <span className="control-label">{ecommerceMode === "single-poster" || ecommerceMode === "category-kit" ? "输出张数" : "每场景张数"}</span>
	                    {ecommerceMode === "category-kit" ? (
	                      <input className="field-control" readOnly value="后台动态规划" />
	                    ) : (
	                      <select
	                        className="field-control"
	                        disabled={ecommerceMode === "single-poster"}
	                        value={ecommerceMode === "single-poster" ? 1 : ecommerceCount}
	                        onChange={(event) => setEcommerceCount(Number(event.target.value) as GenerationCount)}
	                      >
	                        {(ecommerceMode === "single-poster" ? [1] : GENERATION_COUNTS).map((item) => (
	                          <option key={item} value={item}>{item} 张</option>
	                        ))}
	                      </select>
	                    )}
	                  </label>
                </div>
                <label className="ecommerce-switch-row">
                  <span>
                    <strong>去水印 / Logo</strong>
                    <small>清理平台标识、旧店铺水印和无关角标。</small>
                  </span>
                  <input checked={ecommerceRemoveWatermark} type="checkbox" onChange={(event) => setEcommerceRemoveWatermark(event.target.checked)} />
                </label>
                <label className="mt-3 block">
                  <span className="control-label">补充方向</span>
                  <textarea
                    className="prompt-textarea mt-2 h-24 w-full resize-none rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm leading-6 text-neutral-950 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                    placeholder="例如：保留原构图；模特不露脸；不要新增夸大宣传文字"
                    value={ecommerceExtraDirection}
                    onChange={(event) => setEcommerceExtraDirection(event.target.value)}
                  />
                </label>
              </section>
            </>
          ) : null}

          {sidebarTab === "creative" ? (
            <>
          {saveError ? (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" data-testid="save-error">
              {saveError}
            </p>
          ) : null}

          <div data-testid="generation-mode-control">
            <span className="control-label">模式</span>
            <div className="mt-2 grid grid-cols-2 gap-2" role="group" aria-label="模式">
              <button
                className={generationMode === "text" ? "segmented-control h-9 text-xs is-active" : "segmented-control h-9 text-xs"}
                type="button"
                aria-pressed={generationMode === "text"}
                data-testid="mode-text"
                onClick={() => setGenerationMode("text")}
              >
                提示词到画布
              </button>
              <button
                className={
                  generationMode === "reference" ? "segmented-control h-9 text-xs is-active" : "segmented-control h-9 text-xs"
                }
                type="button"
                aria-pressed={generationMode === "reference"}
                data-testid="mode-reference"
                onClick={() => setGenerationMode("reference")}
              >
                参考图到画布
              </button>
            </div>
          </div>

          <label className="block">
            <span className="control-label">提示词</span>
            <textarea
              aria-invalid={Boolean(promptValidationMessage)}
              className="prompt-textarea mt-2 h-32 w-full resize-none rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm leading-6 text-neutral-950 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
              id="prompt-input"
              name="prompt"
              placeholder="描述画面主体、场景、光线、构图和关键细节"
              value={prompt}
              data-testid="prompt-input"
              onChange={(event) => setPrompt(event.target.value)}
            />
          </label>

          {!trimmedPrompt ? (
            <div className="-mt-3 flex flex-wrap gap-2" data-testid="prompt-starters">
              {promptStarters.map((starter) => (
                <button
                  className="prompt-chip"
                  key={starter.label}
                  type="button"
                  title={starter.prompt}
                  data-testid="prompt-starter-chip"
                  onClick={() => applyPromptStarter(starter.prompt)}
                >
                  {starter.label}
                </button>
              ))}
            </div>
          ) : null}

          {panelStatus ? (
            <div
              aria-live={panelStatus.tone === "progress" ? "polite" : "assertive"}
              className={`panel-status-strip ${panelStatusStyles[panelStatus.tone]}`}
              data-testid={panelStatus.testId}
              role={panelStatus.tone === "success" || panelStatus.tone === "progress" ? "status" : "alert"}
            >
              <PanelStatusIcon tone={panelStatus.tone} />
              <p className="min-w-0 flex-1">{panelStatus.message}</p>
            </div>
          ) : null}

          {isReferenceMode ? (
            <section
              className={`rounded-md border px-3 py-3 ${
                isReferenceReady ? "border-blue-200 bg-blue-50 text-blue-800" : "border-neutral-200 bg-neutral-50 text-neutral-600"
              }`}
              data-reference-state={referenceSelection.status}
              data-testid="reference-state"
            >
              <div className="flex items-start gap-2">
                <ImageIcon className={`mt-0.5 size-4 ${isReferenceReady ? "text-blue-600" : "text-neutral-400"}`} aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{isReferenceReady ? "参考图到画布已就绪" : "请选择一张参考图"}</p>
                  <p className="mt-1 text-xs leading-5" data-testid="reference-hint">
                    {referenceSelection.hint}
                  </p>
                  {referenceSelection.status === "ready" ? (
                    <div className="reference-preview-card">
                      <img
                        alt={`参考图：${referenceSelection.name}`}
                        className="reference-preview-card__image"
                        src={referenceSelection.sourceUrl}
                      />
                      <p className="min-w-0 flex-1 truncate text-xs font-medium" data-testid="reference-name">
                        {referenceSelection.name}
                        <span>{Math.round(referenceSelection.width)} x {Math.round(referenceSelection.height)}</span>
                      </p>
                      <button
                        className="secondary-action h-8 shrink-0 px-2 text-xs"
                        type="button"
                        data-testid="cancel-reference"
                        onClick={cancelReferenceSelection}
                      >
                        <X className="size-3.5" aria-hidden="true" />
                        取消参考
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </section>
          ) : null}

          <label className="block">
            <span className="control-label">风格</span>
            <select
              className="field-control"
              id="style-preset"
              name="stylePreset"
              value={stylePreset}
              data-testid="style-preset"
              onChange={(event) => setStylePreset(event.target.value as StylePresetId)}
            >
              {STYLE_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {stylePresetLabels[preset.id]}
                </option>
              ))}
            </select>
          </label>

          <div>
            <span className="control-label">尺寸</span>
            <div className="quick-size-grid" data-testid="quick-size-presets">
              {quickSizePresets.map((preset) => (
                <button
                  aria-pressed={sizePresetId === preset.id}
                  className={sizePresetId === preset.id ? "quick-size-button is-active" : "quick-size-button"}
                  key={preset.id}
                  type="button"
                  onClick={() => selectScenePreset(preset.id)}
                >
                  <span>{sizePresetLabel(preset)}</span>
                  <small>
                    {preset.width} x {preset.height}
                  </small>
                </button>
              ))}
              {isReferenceMode ? (
                <button
                  aria-pressed={sizePresetId === ORIGINAL_SIZE_PRESET_ID}
                  className={sizePresetId === ORIGINAL_SIZE_PRESET_ID ? "quick-size-button is-active" : "quick-size-button"}
                  disabled={!isReferenceReady}
                  type="button"
                  onClick={() => selectScenePreset(ORIGINAL_SIZE_PRESET_ID)}
                >
                  <span>{ORIGINAL_SIZE_PRESET_LABEL}</span>
                  <small>
                    {referenceSelection.status === "ready"
                      ? originalSizePresetOptionLabel(referenceSelection.width, referenceSelection.height)
                      : "选择参考图后可用"}
                  </small>
                </button>
              ) : null}
              <button
                aria-pressed={sizePresetId === CUSTOM_SIZE_PRESET_ID}
                className={sizePresetId === CUSTOM_SIZE_PRESET_ID ? "quick-size-button is-active" : "quick-size-button"}
                type="button"
                onClick={() => selectScenePreset(CUSTOM_SIZE_PRESET_ID)}
              >
                <span>自定义</span>
                <small>手动输入</small>
              </button>
            </div>
            <label className="mt-3 block">
              <span className="sr-only">全部尺寸</span>
              <select
                className="field-control"
                id="scene-preset"
                name="scenePreset"
                value={sizePresetId}
                data-testid="scene-preset"
                onChange={(event) => selectScenePreset(event.target.value)}
              >
                {SIZE_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {sizePresetOptionLabel(preset)}
                  </option>
                ))}
                {isReferenceMode ? (
                  <option disabled={!isReferenceReady} value={ORIGINAL_SIZE_PRESET_ID}>
                    {referenceSelection.status === "ready"
                      ? originalSizePresetOptionLabel(referenceSelection.width, referenceSelection.height)
                      : ORIGINAL_SIZE_PRESET_LABEL}
                  </option>
                ) : null}
                <option value={CUSTOM_SIZE_PRESET_ID}>自定义尺寸</option>
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className="control-label">宽度</span>
              <input
                className="field-control"
                id="custom-width"
                min={MIN_IMAGE_DIMENSION}
                max={MAX_IMAGE_DIMENSION}
                name="width"
                step={1}
                type="number"
                value={Number.isNaN(width) ? "" : width}
                data-testid="custom-width"
                onChange={(event) => updateWidth(event.target.value)}
              />
            </label>
            <label>
              <span className="control-label">高度</span>
              <input
                className="field-control"
                id="custom-height"
                min={MIN_IMAGE_DIMENSION}
                max={MAX_IMAGE_DIMENSION}
                name="height"
                step={1}
                type="number"
                value={Number.isNaN(height) ? "" : height}
                data-testid="custom-height"
                onChange={(event) => updateHeight(event.target.value)}
              />
            </label>
          </div>

          <div>
            <span className="control-label">数量</span>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {GENERATION_COUNTS.map((item) => (
                <button
                  className={item === count ? "segmented-control is-active" : "segmented-control"}
                  key={item}
                  type="button"
                  onClick={() => setCount(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <details className="rounded-md border border-neutral-200 bg-neutral-50">
            <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-3 text-sm font-medium text-neutral-800">
              高级设置
              <ChevronDown className="size-4 text-neutral-500" aria-hidden="true" />
            </summary>
            <div className="space-y-4 border-t border-neutral-200 px-3 py-4">
              <label className="block">
                <span className="control-label">质量</span>
                <select
                  className="field-control"
                  id="quality-select"
                  name="quality"
                  value={quality}
                  data-testid="quality-select"
                  onChange={(event) => setQuality(event.target.value as ImageQuality)}
                >
                  {IMAGE_QUALITIES.map((item) => (
                    <option key={item} value={item}>
                      {qualityLabels[item]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="control-label">输出格式</span>
                <select
                  className="field-control"
                  id="format-select"
                  name="outputFormat"
                  value={outputFormat}
                  data-testid="format-select"
                  onChange={(event) => setOutputFormat(event.target.value as OutputFormat)}
                >
                  {OUTPUT_FORMATS.map((item) => (
                    <option key={item} value={item}>
                      {formatLabels[item]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </details>

          <section className="space-y-3" data-history-expanded={isHistoryExpanded} data-testid="generation-history">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-neutral-950">生成历史</h2>
              <div className="flex items-center gap-2">
                <span className="text-xs text-neutral-500">{generationHistory.length} 条</span>
                {hasAdditionalHistory ? (
                  <button
                    aria-expanded={isHistoryExpanded}
                    className="history-toggle"
                    data-testid="history-toggle"
                    type="button"
                    onClick={() => setIsHistoryExpanded((expanded) => !expanded)}
                  >
                    {isHistoryExpanded ? "收起" : `展开 ${hiddenHistoryCount} 条`}
                    <ChevronDown className={`size-3.5 transition ${isHistoryExpanded ? "rotate-180" : ""}`} aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            </div>

            {generationHistory.length === 0 ? (
              <p className="rounded-md border border-dashed border-neutral-300 px-3 py-4 text-sm text-neutral-500">
                暂无记录。
              </p>
            ) : (
              <div className="history-list">
                {visibleHistory.map((record) => {
                  const downloadableAsset = firstDownloadableAsset(record);
                  const excerpt = promptExcerpt(record.prompt);
                  const totalOutputs = record.outputs.length || record.count;
                  const activeTask = Array.from(activeGenerationsRef.current.values()).find((task) => task.temporaryRecordId === record.id);
                  const isRecordRunning = record.status === "running" && Boolean(activeTask);
                  const cloudFailedCount = cloudFailureCount(record);
                  const cloudFailureMessage = firstCloudFailureMessage(record);

                  return (
                    <article
                      className="history-item"
                      data-testid="history-record"
                      key={record.id}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className={`history-status-pill ${historyStatusStyles[record.status]}`}>
                            {statusLabels[record.status]}
                          </span>
                          <span className="truncate text-xs text-neutral-500">{modeLabels[record.mode]}</span>
                        </div>
                        <p className="mt-1 truncate text-sm font-medium leading-5 text-neutral-950" title={record.prompt}>
                          {excerpt}
                        </p>
                        <dl className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-xs leading-5 text-neutral-500">
                          <div className="inline-flex items-center gap-1">
                            <dt className="sr-only">尺寸</dt>
                            <dd>
                              {record.size.width} x {record.size.height}
                            </dd>
                          </div>
                          <div className="inline-flex items-center gap-1">
                            <dt className="sr-only">输出数量</dt>
                            <dd>
                              {successfulOutputCount(record)} / {totalOutputs} 张
                            </dd>
                          </div>
                          <div className="inline-flex items-center gap-1">
                            <dt className="sr-only">创建时间</dt>
                            <dd>{formatCreatedTime(record.createdAt)}</dd>
                          </div>
                          {cloudFailedCount > 0 ? (
                            <div className="inline-flex items-center gap-1 text-amber-700" title={cloudFailureMessage}>
                              <dt className="sr-only">云端备份</dt>
                              <dd className="inline-flex items-center gap-1">
                                <Cloud className="size-3" aria-hidden="true" />
                                云端失败 {cloudFailedCount}
                              </dd>
                            </div>
                          ) : null}
                        </dl>
                      </div>

                      <div className="history-actions">
                        <button
                          aria-label={`复制历史提示词：${excerpt}`}
                          className="history-icon-action"
                          type="button"
                          data-testid="history-copy-prompt"
                          title="复制提示词"
                          onClick={() => void copyHistoryPrompt(record)}
                        >
                          <Copy className="size-4" aria-hidden="true" />
                        </button>
                        <button
                          aria-label={`定位历史记录：${excerpt}`}
                          className="history-icon-action"
                          type="button"
                          data-testid="history-locate"
                          title="定位"
                          onClick={() => locateHistoryRecord(record)}
                        >
                          <MapPin className="size-4" aria-hidden="true" />
                        </button>
                        <button
                          aria-label={`重跑历史记录：${excerpt}`}
                          className="history-icon-action"
                          type="button"
                          data-testid="history-rerun"
                          disabled={isRecordRunning}
                          title={isRecordRunning ? "任务运行中" : "重跑"}
                          onClick={() => void rerunHistoryRecord(record)}
                        >
                          <RotateCcw className="size-4" aria-hidden="true" />
                        </button>
                        {activeTask && record.status === "running" ? (
                          <button
                            aria-label={`取消生成任务：${excerpt}`}
                            className="history-icon-action"
                            type="button"
                            data-testid="history-cancel"
                            title="取消"
                            onClick={() => cancelGeneration(activeTask.requestId)}
                          >
                            <XCircle className="size-4" aria-hidden="true" />
                          </button>
                        ) : (
                          <button
                            aria-label={`下载历史记录：${excerpt}`}
                            className="history-icon-action"
                            type="button"
                            data-testid="history-download"
                            disabled={!downloadableAsset}
                            title={downloadableAsset ? "下载" : "没有可下载的本地资源"}
                            onClick={() => downloadHistoryRecord(record)}
                          >
                            <Download className="size-4" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
            </>
          ) : null}
        </div>

        <div className="ai-panel-actions grid grid-cols-1 gap-3 border-t border-neutral-200 bg-white px-5 py-4">
          {sidebarTab === "plugins" ? (
            <button className="primary-action" disabled={isEcommerceGenerating} type="button" onClick={() => void submitEcommerceGeneration()}>
              {isEcommerceGenerating ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Workflow className="size-4" aria-hidden="true" />}
              {isEcommerceGenerating ? "电商图生成中" : ecommerceMode === "category-kit" ? "生成品类套图到画布" : "生成电商图到画布"}
            </button>
          ) : (
            <button
              className="primary-action"
              disabled={!canGenerate}
              type="button"
              data-generation-mode={generationMode}
              data-reference-mode={isReferenceReady ? "edit" : "generate"}
              data-testid="generate-button"
              title={validationMessage || undefined}
              onClick={submitGeneration}
            >
              {isReferenceReady ? (
                <ImageIcon className="size-4" aria-hidden="true" />
              ) : (
                <Square className="size-4" aria-hidden="true" />
              )}
              {generationMode === "reference" ? "参考图生成到画布" : "生成到画布"}
            </button>
          )}
        </div>
      </aside>

      </main>
      {visibleRoute === "gallery" ? (
        <Suspense
          fallback={
            <main className="gallery-page app-view" data-testid="gallery-loading-page">
              <div className="gallery-empty-state gallery-empty-state--boot" role="status">
                <Loader2 className="size-5 animate-spin" aria-hidden="true" />
                <p>正在载入 Gallery...</p>
              </div>
            </main>
          }
        >
          <LazyGalleryPage
            fetcher={authFetch}
            mobile={isMobileDrawer}
            mobileQuota={packageRemaining}
            onDeleted={removeGalleryOutputFromHistory}
            onMobileAccount={() => navigateToRoute("account")}
            onMobileCreate={() => {
              navigateToRoute("canvas");
              setMobileCreateTab("ecommerce");
            }}
            onMobileHome={() => {
              navigateToRoute("canvas");
              setMobileCreateTab("home");
            }}
            onReuse={reuseGalleryImage}
          />
        </Suspense>
      ) : null}
      {visibleRoute === "help" ? <HelpCenterPage onBack={() => navigateToRoute("canvas")} /> : null}
      {visibleRoute === "account" ? (
        <AccountPage
          mobile={isMobileDrawer}
          user={currentUser}
          onLogout={handleLogout}
          onNavigate={(nextRoute) => {
            navigateToRoute(nextRoute);
            if (nextRoute === "canvas") {
              setMobileCreateTab("home");
            }
          }}
          onUserUpdated={setCurrentUser}
          onSendPhoneCode={sendBindPhoneSmsCode}
          onBindPhone={bindPhone}
        />
      ) : null}
      {visibleRoute === "admin" && isAdminUser(currentUser) ? <AdminPage /> : null}
      {isPluginGuideOpen && visibleRoute === "canvas" ? (
        <PluginGuideOverlay
          browserLabel={pluginBrowserLabel}
          links={pluginGuideDisplayLinks}
          onClose={closePluginGuide}
          onOpenInstallHelp={() => {
            const opened = window.open(pluginGuideDisplayLinks.installHelpUrl, "_blank", "noopener,noreferrer");
            if (!opened) {
              window.location.assign(pluginGuideDisplayLinks.installHelpUrl);
            }
          }}
          onRetryDetection={() => {
            dismissedPluginPromptRef.current = false;
            void probeAndMaybeShowPluginPrompt(true);
          }}
        />
      ) : null}
    </div>
  );
}
