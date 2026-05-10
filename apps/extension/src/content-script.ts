import type { PageContext } from "./types";

const capturedResponseImageUrls = new Set<string>();
const capturedResourceImageUrls = new Set<string>();
const capturedProductAttributes = new Map<string, string>();
let pageCaptureScriptInjected = false;
const BRAND_PREVIEW_WINDOW_NAME_PREFIX = "kuajing-image-brand-preview:";
const WEB_AUTH_TOKEN_STORAGE_KEY = "gpt-image-canvas.authToken";
const MAX_CAPTURED_IMAGE_URLS = 1200;

interface BrandPreviewOverlayMessage {
  placement: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  logoDataUrl?: string;
  text?: string;
}

interface ExtensionProbeRequestMessage {
  source: "kuajing-image-web";
  type: "kuajing-image:probe-extension";
  token: string;
}

function rememberCapturedUrl(target: Set<string>, value: string): void {
  const normalized = absoluteUrl(normalizeUrlCandidate(value));
  if (!normalized) {
    return;
  }
  target.add(normalized);
  while (target.size > MAX_CAPTURED_IMAGE_URLS) {
    const oldest = target.values().next().value;
    if (!oldest) {
      break;
    }
    target.delete(oldest);
  }
}

function recordCapturedUrls(urls: string[]): void {
  for (const url of urls) {
    rememberCapturedUrl(capturedResponseImageUrls, url);
  }
}

function recordCapturedResourceUrl(url: string): void {
  rememberCapturedUrl(capturedResourceImageUrls, url);
}

function recordCapturedAttributes(attributes: Array<{ label: string; value: string }>): void {
  for (const attribute of attributes) {
    const label = normalizeLabel(attribute.label);
    const value = normalizeText(attribute.value);
    if (label && value && isKnownPropertyLabel(label) && !capturedProductAttributes.has(label)) {
      capturedProductAttributes.set(label, value);
    }
  }
}

function installPageCaptureListener(): void {
  window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data || event.data.source !== "kuajing-image-page-hook") {
      return;
    }
    if (event.data.type === "kuajing-image:captured-urls" && Array.isArray(event.data.urls)) {
      recordCapturedUrls(event.data.urls);
    }
    if (event.data.type === "kuajing-image:captured-urls" && Array.isArray(event.data.attributes)) {
      recordCapturedAttributes(event.data.attributes);
    }
  });
}

function installExtensionProbeListener(): void {
  window.addEventListener("message", (event) => {
    const data = event.data as ExtensionProbeRequestMessage | undefined;
    if (event.source !== window || !data || data.source !== "kuajing-image-web" || data.type !== "kuajing-image:probe-extension" || typeof data.token !== "string") {
      return;
    }

    window.postMessage(
      {
        source: "kuajing-image-extension",
        type: "kuajing-image:probe-extension-result",
        token: data.token,
        installed: true
      },
      window.location.origin
    );
  });
}

function injectPageCaptureScript(): void {
  if (pageCaptureScriptInjected) {
    return;
  }

  const root = document.documentElement || document.head || document.body;
  if (!root) {
    window.setTimeout(injectPageCaptureScript, 0);
    return;
  }

  pageCaptureScriptInjected = true;

  const script = document.createElement("script");
  script.dataset.source = "kuajing-image-page-hook";
  script.src = chrome.runtime.getURL("page-hook.js");

  root.appendChild(script);
  script.addEventListener("load", () => script.remove(), { once: true });
  script.addEventListener("error", () => script.remove(), { once: true });
}

function normalizeText(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function compactText(value: string): string {
  return normalizeText(value).replace(/[：:]+$/u, "").trim();
}

function normalizeLabel(value: string): string {
  return compactText(value)
    .replace(/\s+/gu, "")
    .replace(/[（(][^）)]*[）)]/gu, "")
    .trim();
}

function absoluteUrl(value: string): string {
  try {
    return new URL(value, location.href).toString();
  } catch {
    return "";
  }
}

function normalizeImagePath(pathname: string): string {
  return pathname
    .replace(/\/(?:resize|quality|format|fit|crop|thumbnail|imageView2|x-oss-process|imageslim)[^/]*(?=\/|$)/giu, "/")
    .replace(/\/(?:w|h|width|height|q|quality|format|fit|crop|thumbnail)[,_=-]?\d{1,5}[a-z0-9]*(?=\/|$)/giu, "/")
    .replace(/(?:[!@][^/]*?)(?=(?:\.[a-z0-9]+)?$)/giu, "")
    .replace(/\.(?:\d{2,5})x\d{2,5}\.(jpg|jpeg|png|webp|gif|avif|bmp)$/iu, ".$1")
    .replace(/\.(jpg|jpeg|png|webp|gif|avif|bmp)_(?:\d{2,5}x\d{2,5}|(?:sum|m|b|q)\d+|webp|jpg|jpeg|png|avif|gif)(?:\.[a-z0-9]+)?$/giu, ".$1")
    .replace(/_(?:\d{2,5}x\d{2,5}|\d{2,5}[wh]|[wh]\d{2,5}|q\d{1,3}|m\d{1,3}|b\d{1,3}|webp|jpg|jpeg|png|avif|gif)(?=(?:\.[a-z0-9]+)?$)/giu, "")
    .replace(/(?:!!|_)(?:\d{2,5}x\d{2,5}|(?:sum|m|b|q)\d+|webp|jpg|jpeg|png|avif|gif)+(?=(?:\.[a-z0-9]+)?$)/giu, "")
    .replace(/\/{2,}/gu, "/");
}

function normalizeImageSearchParams(search: string): string {
  if (!search) {
    return "";
  }

  const ignoredKeys = new Set([
    "w",
    "h",
    "width",
    "height",
    "size",
    "quality",
    "q",
    "fmt",
    "format",
    "fit",
    "crop",
    "thumbnail",
    "scale",
    "ratio",
    "imageslim",
    "imageview2",
    "x-oss-process",
    "x-oss-quality",
    "x-oss-resize",
    "auto-orient",
    "__r__",
    "_",
    "_t",
    "timestamp",
    "ts",
    "cache",
    "cachebuster"
  ]);

  try {
    const params = new URLSearchParams(search);
    const kept = Array.from(params.entries())
      .filter(([key, value]) => {
        const normalizedKey = key.toLowerCase();
        const normalizedValue = value.trim();
        if (!normalizedKey || ignoredKeys.has(normalizedKey) || !normalizedValue) {
          return false;
        }
        return !/^\d{1,5}(?:x\d{1,5})?(?:[wh])?$/iu.test(normalizedValue);
      })
      .sort(([leftKey, leftValue], [rightKey, rightValue]) => leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue));
    return kept.length > 0 ? `?${new URLSearchParams(kept).toString()}` : "";
  } catch {
    return "";
  }
}

interface ImageCandidate {
  url: string;
  score: number;
  context: string;
}

interface ImageProbeResult {
  url: string;
  width: number;
  height: number;
  ok: boolean;
  fingerprint?: string;
  sharpness?: number;
}

interface RankedImageCandidate extends ImageCandidate {
  identityKey: string;
}

interface AcceptedImageCandidate extends ImageProbeResult {
  candidateScore: number;
  context: string;
  identityKey: string;
  exactKey: string;
}

interface CommonDecorativeImageFeatureRecord {
  kind: "url" | "fingerprint";
  key: string;
  seenPages: string[];
  seenCount: number;
  width: number;
  height: number;
  lastSeenAt: number;
}

interface CommonDecorativeImageFeatureStore {
  version: 1;
  records: CommonDecorativeImageFeatureRecord[];
}

interface BackgroundImageMetricsResult {
  ok: boolean;
  width: number;
  height: number;
  fingerprint?: string;
  sharpness?: number;
}

const IMAGE_URL_PATTERN = /(?:https?:)?\/\/[^"'()<>\s\\]+?\.(?:jpg|jpeg|png|webp|gif|bmp|avif)(?:[._!-][^"'()<>\s\\?]*)?(?:\?[^"'()<>\s\\]*)?/giu;
const RESOURCE_IMAGE_URL_PATTERN =
  /\.(?:jpg|jpeg|png|webp|gif|bmp|avif)(?:[._!-][^"'()<>\s\\?]*)?(?:[?#]|$)|\/img\/|[?&](?:image|img|pic|picture|photo|src)=/iu;
const DETAIL_ROOT_SELECTOR =
  "#detail, [class*='detail'], [class*='Detail'], [class*='desc'], [class*='Desc'], [class*='content'], [class*='Content'], [class*='rich'], [class*='Rich'], [id*='detail'], [id*='Detail'], [id*='desc'], [id*='Desc'], [data-module*='detail'], [data-module*='Detail']";
const COMMON_DECORATIVE_IMAGE_FEATURE_STORAGE_KEY = "kuajing-image.common-decorative-image-features.v1";
const MAX_COMMON_DECORATIVE_IMAGE_FEATURES = 1200;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function normalizeUrlCandidate(value: string): string {
  return value
    .trim()
    .replace(/^url\(["']?/u, "")
    .replace(/["']?\)$/u, "")
    .replace(/\\u002f/giu, "/")
    .replace(/\\\//gu, "/")
    .replace(/&amp;/gu, "&")
    .replace(/\\u0026/giu, "&")
    .replace(/\\u003d/giu, "=");
}

function extractImageUrlsFromText(value: string): string[] {
  const normalizedValue = normalizeUrlCandidate(value);
  IMAGE_URL_PATTERN.lastIndex = 0;
  return Array.from(normalizedValue.matchAll(IMAGE_URL_PATTERN)).map((match) => match[0]);
}

function isLikelyDecorativeImage(url: string, context = ""): boolean {
  const lower = `${url} ${context}`.toLowerCase();
  return (
    /logo|icon|sprite|avatar|qrcode|qr-code|barcode|xiaohongshu|小红书|pinduoduo|拼多多|douyin|抖音|kuaishou|快手|jd|京东|taobao|淘宝|alipay|支付|wangwang|旺旺/u.test(
      lower
    ) ||
    /48\s*小时|发货|保障|货源|服务|售后|赔付|极速|闪电|service|promise|guarantee|delivery|insurance|官方铺货|免费福利|铺货|代发|分销|采销|店管家|掌中宝|智淘/u.test(lower)
  );
}

function isLikelyThumbnailVariant(url: string): boolean {
  const lower = decodeURIComponent(url).toLowerCase();
  return (
    /(?:^|[._-])(sum|summ|search)(?:\.[a-z0-9]+)?$/u.test(lower) ||
    /(?:\.jpg|\.jpeg|\.png|\.webp)_(?:sum|summ|search)(?:\.[a-z0-9]+)?$/u.test(lower) ||
    /-0-cib\.jpg_\.webp$/u.test(lower) ||
    /!!0-0-cib\.jpg$/u.test(lower)
  );
}

function hasTinySizeHint(url: string): boolean {
  const decodedUrl = decodeURIComponent(url);
  const matches = decodedUrl.matchAll(/(?:^|[^\d])(\d{1,3})[x_*,-](\d{1,3})(?:[^\d]|$)/gu);
  for (const match of matches) {
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (width > 0 && height > 0 && Math.max(width, height) <= 128) {
      return true;
    }
  }
  return /(?:[?&](?:w|h|width|height)=)(?:[1-9]\d?|1[01]\d|12[0-8])(?:[^\d]|$)/u.test(decodedUrl);
}

function imageIdentityKey(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.protocol = "https:";
    parsed.pathname = normalizeImagePath(parsed.pathname);
    parsed.search = normalizeImageSearchParams(parsed.search);
    return `${parsed.hostname}${parsed.pathname}${parsed.search}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

function exactImageUrlKey(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.protocol = "https:";
    return parsed.toString().toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

function imageUrlVariantRank(url: string): number {
  let rank = 0;
  try {
    const parsed = new URL(url);
    const path = parsed.pathname;
    const sizeMatch = path.match(/\.(\d{2,5})x(\d{2,5})\.(?:jpg|jpeg|png|webp|gif|avif|bmp)$/iu);
    if (sizeMatch) {
      rank += Math.max(Number(sizeMatch[1]), Number(sizeMatch[2]));
    } else {
      rank += 100000;
    }
    if (parsed.search) {
      rank -= 100;
    }
    if (/\/img\/ibank\/O1CN/iu.test(path)) {
      rank += 500;
    }
    if (isLikelyThumbnailVariant(url)) {
      rank -= 50000;
    }
  } catch {
    return rank;
  }
  return rank;
}

function isAlibabaProductResourceImage(url: string): boolean {
  try {
    const parsed = new URL(url);
    return /(?:^|\.)alicdn\.com$/iu.test(parsed.hostname) && /\/img\/ibank\/O1CN/iu.test(parsed.pathname);
  } catch {
    return false;
  }
}

function bestImageCandidates(candidates: ImageCandidate[]): ImageCandidate[] {
  const bestByIdentity = new Map<string, RankedImageCandidate>();
  for (const candidate of candidates) {
    const identityKey = imageIdentityKey(candidate.url);
    const rankedCandidate = { ...candidate, identityKey };
    const existing = bestByIdentity.get(identityKey);
    if (!existing) {
      bestByIdentity.set(identityKey, rankedCandidate);
      continue;
    }
    const currentRank = imageUrlVariantRank(candidate.url) + candidate.score;
    const existingRank = imageUrlVariantRank(existing.url) + existing.score;
    if (currentRank > existingRank) {
      bestByIdentity.set(identityKey, rankedCandidate);
    }
  }
  return Array.from(bestByIdentity.values());
}

function addImageCandidate(
  candidates: ImageCandidate[],
  seen: Set<string>,
  value: string | null | undefined,
  score: number,
  context = ""
): void {
  if (!value) {
    return;
  }
  const normalizedValue = normalizeUrlCandidate(value);
  if (!normalizedValue || normalizedValue.startsWith("data:") || normalizedValue.startsWith("blob:")) {
    return;
  }
  if (!/^(?:https?:)?\/\//iu.test(normalizedValue)) {
    for (const embeddedUrl of extractImageUrlsFromText(normalizedValue)) {
      addImageCandidate(candidates, seen, embeddedUrl, score, context);
    }
    return;
  }
  const url = absoluteUrl(normalizedValue);
  if (!url || seen.has(url) || isLikelyDecorativeImage(url, context) || hasTinySizeHint(url)) {
    return;
  }
  const exactKey = exactImageUrlKey(url);
  if (seen.has(exactKey)) {
    return;
  }
  seen.add(exactKey);
  candidates.push({ url, score, context });
}

function addSrcsetCandidates(
  candidates: ImageCandidate[],
  seen: Set<string>,
  value: string | null | undefined,
  score: number,
  context = ""
): void {
  if (!value) {
    return;
  }
  for (const candidate of value.split(",")) {
    addImageCandidate(candidates, seen, candidate.trim().split(/\s+/u)[0], score, context);
  }
}

function readLazyImageAttributes(element: Element): string[] {
  return [
    "src",
    "data-src",
    "data-lazy-src",
    "data-lazyload-src",
    "data-lazyload",
    "data-original",
    "data-original-src",
    "data-ks-lazyload",
    "data-ks-lazyload-custom",
    "data-img",
    "data-img-url",
    "data-image-url",
    "data-url",
    "data-image",
    "data-actualsrc",
    "data-lazy",
    "data-defer-src",
    "data-origin",
    "data-origin-src",
    "data-raw-src",
    "data-imgs",
    "data-images",
    "data-src-list",
    "data-lazy-image",
    "data-lazy-img",
    "data-aplus-src",
    "lazy-src"
  ]
    .map((name) => element.getAttribute(name))
    .filter((value): value is string => Boolean(value?.trim()));
}

function readDocMeta(doc: Document, selector: string): string {
  return doc.querySelector<HTMLMetaElement>(selector)?.content.trim() ?? "";
}

function textFromNode(node: Node | null): string {
  if (!node) {
    return "";
  }
  return normalizeText(node.textContent ?? "");
}

function isPropertyHeading(text: string): boolean {
  return /商品属性|产品属性|属性参数|规格参数/u.test(text) && text.length <= 20;
}

function isNextPropertySectionHeading(text: string): boolean {
  return /包装信息|商品详情|热门推荐|搭配组货|商品评价|资质证书/u.test(text) && text.length <= 30;
}

const PROPERTY_LABELS = new Set([
  "类型",
  "品牌",
  "保健功能",
  "适宜人群",
  "注意事项",
  "食用方法",
  "商品名称",
  "产品名称",
  "是否进口",
  "保质期",
  "规格",
  "厂址",
  "健字号",
  "厂名",
  "主要原料",
  "生产日期",
  "产品标准号",
  "不适宜人群",
  "食用量",
  "面料成分",
  "面料名称",
  "款式",
  "工艺",
  "风格",
  "袖长",
  "主面料成分2",
  "图案",
  "货号",
  "版型",
  "衣长",
  "领型",
  "袖型",
  "流行元素",
  "上市年份/季节",
  "颜色",
  "尺码",
  "风格类型",
  "门襟",
  "主面料成分含量",
  "跨境风格类型",
  "是否跨境货源",
  "主面料成分2含量",
  "主要下游销售地区1",
  "主要下游销售地区2",
  "材质",
  "颜色/SKU",
  "颜色分类",
  "SKU"
]);

function isKnownPropertyLabel(value: string): boolean {
  return PROPERTY_LABELS.has(normalizeLabel(value));
}

function findPropertyContainer(doc: Document): HTMLElement | null {
  const candidates = Array.from(doc.querySelectorAll("h1, h2, h3, h4, h5, h6, strong, b, div, p, span"));
  for (const node of candidates) {
    const text = normalizeText(node.textContent ?? "");
    if (!isPropertyHeading(text)) {
      continue;
    }
    const container = node.closest("section, article, div, main") as HTMLElement | null;
    if (container) {
      return container;
    }
  }
  return null;
}

function leafTextElements(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>("th, td, li, span, p, div")).filter((element) => {
    const text = normalizeText(element.textContent ?? "");
    if (!text || text.length > 160) {
      return false;
    }
    const childText = Array.from(element.children)
      .map((child) => normalizeText(child.textContent ?? ""))
      .filter(Boolean)
      .join(" ");
    return !childText || normalizeText(childText) !== text;
  });
}

function collectSequentialPropertyPairs(doc: Document): Array<{ label: string; value: string }> {
  const elements = leafTextElements(doc.body || doc.documentElement);
  const headingIndex = elements.findIndex((element) => isPropertyHeading(normalizeText(element.textContent ?? "")));
  if (headingIndex < 0) {
    return [];
  }

  const tokens: string[] = [];
  for (const element of elements.slice(headingIndex + 1)) {
    const text = normalizeText(element.textContent ?? "");
    if (!text) {
      continue;
    }
    if (isNextPropertySectionHeading(text)) {
      break;
    }
    tokens.push(text);
  }

  const pairs: Array<{ label: string; value: string }> = [];
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const label = normalizeLabel(tokens[index]);
    if (!isKnownPropertyLabel(label)) {
      continue;
    }
    const value = tokens[index + 1];
    if (!value || isKnownPropertyLabel(value) || isPropertyHeading(value)) {
      continue;
    }
    pairs.push({ label, value });
    index += 1;
  }

  return pairs;
}

function collectTablePairs(root: ParentNode): Array<{ label: string; value: string }> {
  const pairs: Array<{ label: string; value: string }> = [];
  const rows = Array.from(root.querySelectorAll("tr"));

  for (const row of rows) {
    const cells = Array.from(row.querySelectorAll("th, td"));
    if (cells.length < 2) {
      continue;
    }

    for (let index = 0; index < cells.length - 1; index += 2) {
      const label = normalizeLabel(textFromNode(cells[index]));
      const value = textFromNode(cells[index + 1]);
      if (label && value && (!PROPERTY_LABELS.size || isKnownPropertyLabel(label))) {
        pairs.push({ label, value });
      }
    }
  }

  return pairs;
}

function collectLabeledBlocks(root: ParentNode): Array<{ label: string; value: string }> {
  const pairs: Array<{ label: string; value: string }> = [];
  const nodes = Array.from(root.querySelectorAll("li, dl, div, p, span"));

  for (const node of nodes) {
    const text = normalizeText(node.textContent ?? "");
    const match = text.match(/^([^：:]{2,16})[:：]\s*(.{1,120})$/u);
    if (!match) {
      continue;
    }
    const label = normalizeLabel(match[1]);
    const value = normalizeText(match[2]);
    if (label && value && isKnownPropertyLabel(label)) {
      pairs.push({ label, value });
    }
  }

  return pairs;
}

function extractPageAttributes(doc: Document): Array<{ label: string; value: string }> {
  const propertyContainer = findPropertyContainer(doc);
  const root: ParentNode = propertyContainer ?? doc;
  const pairs = [
    ...Array.from(capturedProductAttributes.entries()).map(([label, value]) => ({ label, value })),
    ...collectSequentialPropertyPairs(doc),
    ...collectTablePairs(root),
    ...collectLabeledBlocks(root)
  ];
  const seen = new Set<string>();
  const deduped: Array<{ label: string; value: string }> = [];

  for (const pair of pairs) {
    const key = `${pair.label}::${pair.value}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(pair);
  }

  return deduped;
}

function mapPageProductContext(doc: Document): NonNullable<PageContext["product"]> {
  const attributes = extractPageAttributes(doc);
  const byLabel = new Map<string, string>();
  for (const { label, value } of attributes) {
    byLabel.set(label, value);
  }

  const pick = (...labels: string[]): string | undefined => {
    for (const label of labels) {
      const value = byLabel.get(label);
      if (value) {
        return value;
      }
    }
    return undefined;
  };

  const title = readProductTitle(doc);
  const description = attributes
    .filter(({ label, value }) => isKnownPropertyLabel(label) && value && !/^(其他|无|否)$/u.test(value))
    .slice(0, 12)
    .map(({ label, value }) => `${label}: ${value}`)
    .join("；");

  return {
    title,
    description,
    brand: pick("品牌"),
    productName: pick("商品名称", "产品名称", "规格") || title,
    targetCustomer: pick("适宜人群", "不适宜人群"),
    usageScene: pick("使用场景", "适用场景", "食用方法"),
    material: pick("主要原料", "面料名称", "材质"),
    color: pick("颜色", "颜色/SKU", "色号", "颜色分类", "SKU"),
    attributes
  };
}

function readProductTitle(doc: Document): string {
  const titleSelectors = [
    "h1",
    "[class*='title-text']",
    "[class*='titleText']",
    "[class*='TitleText']",
    "[class*='offer-title']",
    "[class*='OfferTitle']",
    "[class*='product-title']",
    "[class*='ProductTitle']",
    "[class*='subject']",
    "[class*='Subject']"
  ];
  const candidates = titleSelectors.flatMap((selector) =>
    Array.from(doc.querySelectorAll<HTMLElement>(selector)).map((element) => normalizeText(element.textContent ?? ""))
  );
  candidates.push(readDocMeta(doc, 'meta[property="og:title"], meta[name="title"]'));
  candidates.push(doc.title.split(/[-_|—]/u)[0] ?? doc.title);

  return (
    candidates
      .map(normalizeText)
      .filter((value) => value.length >= 4 && !/^1688|阿里巴巴|找本店|商品$/u.test(value))
      .sort((left, right) => titleScore(right) - titleScore(left))[0] ??
    normalizeText(doc.title)
  );
}

function titleScore(value: string): number {
  const shopPenalty = /店|厂|公司|商行|旗舰店/u.test(value) && value.length < 28 ? 80 : 0;
  const productBonus = /女|男|童|装|衣|裙|裤|鞋|包|帽|饰|家居|手机|配件|新款|跨境|韩版|欧美|ins/iu.test(value)
    ? 20
    : 0;
  return Math.min(value.length, 120) + productBonus - shopPenalty;
}

function elementContext(element: Element): string {
  return [
    element.getAttribute("alt"),
    element.getAttribute("title"),
    element.getAttribute("class"),
    element.getAttribute("id"),
    element.closest("[class], [id]")?.getAttribute("class"),
    element.closest("[class], [id]")?.getAttribute("id")
  ]
    .filter(Boolean)
    .join(" ");
}

function imageScore(image: HTMLImageElement): number {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const context = elementContext(image).toLowerCase();
  let score = 20;

  if (/main|gallery|album|thumb|sku|offer|product|detail|desc|内容|详情|主图|商品/u.test(context)) {
    score += 40;
  }
  if (/detail|desc|内容|详情/u.test(context)) {
    score += 20;
  }
  if (width >= 500 || height >= 500) {
    score += 20;
  }
  if (width < 160 || height < 160) {
    score -= 120;
  }
  if (isLikelyDecorativeImage(image.currentSrc || image.src, context)) {
    score -= 160;
  }

  return score;
}

function addBackgroundImageCandidates(doc: Document, candidates: ImageCandidate[], seen: Set<string>): void {
  const roots = doc.querySelectorAll<HTMLElement>(
    `${DETAIL_ROOT_SELECTOR}, [class*='main'], [class*='gallery'], [class*='album']`
  );
  for (const element of Array.from(roots).slice(0, 200)) {
    const background = element.ownerDocument.defaultView?.getComputedStyle(element).backgroundImage ?? "";
    const matches = background.matchAll(/url\(["']?([^"')]+)["']?\)/gu);
    for (const match of matches) {
      addImageCandidate(candidates, seen, match[1], 55, elementContext(element));
    }
  }
}

function isImageLikeResourceEntry(entry: PerformanceResourceTiming): boolean {
  const url = entry.name;
  const initiatorType = (entry.initiatorType || "").toLowerCase();
  return (
    initiatorType === "img" ||
    initiatorType === "image" ||
    RESOURCE_IMAGE_URL_PATTERN.test(url)
  );
}

function addResourceEntryImageCandidate(entry: PerformanceResourceTiming, candidates: ImageCandidate[], seen: Set<string>): void {
  if (!isImageLikeResourceEntry(entry)) {
    return;
  }

  recordCapturedResourceUrl(entry.name);
  const score = isAlibabaProductResourceImage(entry.name) ? 132 : 82;
  const context = isAlibabaProductResourceImage(entry.name) ? "captured 1688 network resource image" : "captured network resource image";
  addImageCandidate(candidates, seen, entry.name, score, context);
}

function addResourceImageCandidates(doc: Document, candidates: ImageCandidate[], seen: Set<string>): void {
  const resourceEntries = (doc.defaultView?.performance.getEntriesByType("resource") ?? []) as PerformanceResourceTiming[];
  for (const entry of resourceEntries.slice(-2500)) {
    addResourceEntryImageCandidate(entry, candidates, seen);
  }

  for (const url of capturedResourceImageUrls) {
    const score = isAlibabaProductResourceImage(url) ? 136 : 86;
    const context = isAlibabaProductResourceImage(url) ? "observed 1688 network image" : "observed network image";
    addImageCandidate(candidates, seen, url, score, context);
  }
}

function addCapturedResponseImageCandidates(candidates: ImageCandidate[], seen: Set<string>): void {
  for (const url of capturedResponseImageUrls) {
    const score = isAlibabaProductResourceImage(url) ? 140 : 92;
    const context = isAlibabaProductResourceImage(url) ? "captured response 1688 detail image" : "captured response image";
    addImageCandidate(candidates, seen, url, score, context);
  }
}

function addCapturedNetworkImageCandidates(candidates: ImageCandidate[], seen: Set<string>, urls: string[]): void {
  for (const url of urls) {
    const score = isAlibabaProductResourceImage(url) ? 150 : 96;
    const context = isAlibabaProductResourceImage(url) ? "chrome webRequest 1688 product image" : "chrome webRequest image";
    addImageCandidate(candidates, seen, url, score, context);
  }
}

function installResourceCaptureObserver(): void {
  try {
    performance.setResourceTimingBufferSize(5000);
  } catch {
    // Older pages may not expose a configurable timing buffer.
  }

  try {
    for (const entry of performance.getEntriesByType("resource") as PerformanceResourceTiming[]) {
      if (isImageLikeResourceEntry(entry)) {
        recordCapturedResourceUrl(entry.name);
      }
    }
  } catch {
    // Ignore resource timing implementations that throw while the page is loading.
  }

  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType === "resource" && isImageLikeResourceEntry(entry as PerformanceResourceTiming)) {
          recordCapturedResourceUrl((entry as PerformanceResourceTiming).name);
        }
      }
    });
    observer.observe({ type: "resource", buffered: true });
  } catch {
    // PerformanceObserver is best-effort; direct scans still run during page reads.
  }
}

async function readCapturedNetworkImageUrls(): Promise<string[]> {
  try {
    const response = (await chrome.runtime.sendMessage({ type: "kuajing-image:get-captured-network-images" })) as { urls?: unknown };
    return Array.isArray(response?.urls) ? response.urls.filter((url): url is string => typeof url === "string" && Boolean(url.trim())) : [];
  } catch {
    return [];
  }
}

function addDetailImageCandidates(doc: Document, candidates: ImageCandidate[], seen: Set<string>): void {
  const detailRoots = doc.querySelectorAll<HTMLElement>(DETAIL_ROOT_SELECTOR);
  for (const root of Array.from(detailRoots).slice(0, 80)) {
    const context = elementContext(root);
    for (const element of Array.from(root.querySelectorAll("img, source, picture, [srcset], [data-src], [data-srcset], [data-original], [data-ks-lazyload], [data-lazyload], [data-lazy-src], [data-image], [data-image-url]")).slice(0, 400)) {
      for (const value of readLazyImageAttributes(element)) {
        addImageCandidate(candidates, seen, value, 90, `${context} ${elementContext(element)}`);
      }
      for (const attribute of Array.from(element.attributes)) {
        if (/^(?:data-|lazy|original|src)/iu.test(attribute.name) && /(?:\/\/|jpg|jpeg|png|webp|avif|gif|bmp)/iu.test(attribute.value)) {
          addImageCandidate(candidates, seen, attribute.value, 88, `${context} ${attribute.name} ${elementContext(element)}`);
        }
      }
      addSrcsetCandidates(candidates, seen, element.getAttribute("srcset") || element.getAttribute("data-srcset"), 90, context);
    }
  }
}

function addMarkupImageCandidates(doc: Document, candidates: ImageCandidate[], seen: Set<string>): void {
  const roots = Array.from(doc.querySelectorAll<HTMLElement>(DETAIL_ROOT_SELECTOR)).slice(0, 20);
  const markupParts = roots.length > 0 ? roots.map((element) => element.outerHTML) : [doc.documentElement.outerHTML];

  for (const markup of markupParts) {
    for (const imageUrl of extractImageUrlsFromText(markup)) {
      const score = isAlibabaProductResourceImage(imageUrl) ? 125 : 65;
      addImageCandidate(candidates, seen, imageUrl, score, "page markup detail image");
    }
  }
}

function addScriptImageCandidates(doc: Document, candidates: ImageCandidate[], seen: Set<string>): void {
  for (const script of Array.from(doc.scripts).slice(0, 180)) {
    const text = script.textContent ?? "";
    if (!text || !/detail|desc|content|rich|offer|product|image|img|ibank|alicdn|O1CN|主图|详情|商品/iu.test(text.slice(0, 8000))) {
      continue;
    }
    for (const imageUrl of extractImageUrlsFromText(text)) {
      const score = isAlibabaProductResourceImage(imageUrl) ? 128 : 60;
      addImageCandidate(candidates, seen, imageUrl, score, "script image url");
    }
  }
}

function addGlobalStateImageCandidates(doc: Document, candidates: ImageCandidate[], seen: Set<string>): void {
  const win = doc.defaultView as (Window & Record<string, unknown>) | null;
  if (!win) {
    return;
  }

  for (const key of Object.keys(win).slice(0, 2500)) {
    if (!/offer|detail|desc|product|image|img|data|apollo|redux|__|mod/iu.test(key)) {
      continue;
    }
    try {
      const value = win[key];
      if (typeof value === "string") {
        for (const imageUrl of extractImageUrlsFromText(value)) {
          const score = isAlibabaProductResourceImage(imageUrl) ? 126 : 58;
          addImageCandidate(candidates, seen, imageUrl, score, `window state ${key}`);
        }
      } else if (value && typeof value === "object") {
        const serialized = JSON.stringify(value);
        if (serialized && /alicdn|ibank|O1CN|jpg|jpeg|png|webp/iu.test(serialized)) {
          for (const imageUrl of extractImageUrlsFromText(serialized)) {
            const score = isAlibabaProductResourceImage(imageUrl) ? 126 : 58;
            addImageCandidate(candidates, seen, imageUrl, score, `window state ${key}`);
          }
        }
      }
    } catch {
      // Some window properties throw when read or serialized.
    }
  }
}

function imageMetrics(image: HTMLImageElement): { fingerprint?: string; sharpness?: number } {
  if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
    return {};
  }

  try {
    const canvas = document.createElement("canvas");
    const size = 32;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      return {};
    }

    ctx.drawImage(image, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size).data;
    const luminance: number[] = [];
    for (let index = 0; index < data.length; index += 4) {
      luminance.push(data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114);
    }
    const hashBlockSize = 4;
    const hashLuminance: number[] = [];
    for (let blockY = 0; blockY < 8; blockY += 1) {
      for (let blockX = 0; blockX < 8; blockX += 1) {
        let total = 0;
        for (let y = 0; y < hashBlockSize; y += 1) {
          for (let x = 0; x < hashBlockSize; x += 1) {
            total += luminance[(blockY * hashBlockSize + y) * size + blockX * hashBlockSize + x];
          }
        }
        hashLuminance.push(total / (hashBlockSize * hashBlockSize));
      }
    }
    const average = hashLuminance.reduce((total, value) => total + value, 0) / hashLuminance.length;
    const fingerprint = hashLuminance.map((value) => (value >= average ? "1" : "0")).join("");

    const laplacianValues: number[] = [];
    for (let y = 1; y < size - 1; y += 1) {
      for (let x = 1; x < size - 1; x += 1) {
        const center = luminance[y * size + x] * 4;
        const neighbors = luminance[(y - 1) * size + x] + luminance[(y + 1) * size + x] + luminance[y * size + x - 1] + luminance[y * size + x + 1];
        laplacianValues.push(center - neighbors);
      }
    }
    const laplacianAverage = laplacianValues.reduce((total, value) => total + value, 0) / laplacianValues.length;
    const sharpness =
      laplacianValues.reduce((total, value) => total + (value - laplacianAverage) ** 2, 0) / Math.max(laplacianValues.length, 1);
    return { fingerprint, sharpness };
  } catch {
    return {};
  }
}

function probeImage(url: string): Promise<ImageProbeResult> {
  return new Promise((resolve) => {
    const image = new Image();
    const timer = window.setTimeout(() => {
      image.onload = null;
      image.onerror = null;
      resolve({ url, width: 0, height: 0, ok: false });
    }, 2500);

    image.onload = () => {
      window.clearTimeout(timer);
      resolve({ url, width: image.naturalWidth, height: image.naturalHeight, ok: true, ...imageMetrics(image) });
    };
    image.onerror = () => {
      window.clearTimeout(timer);
      resolve({ url, width: 0, height: 0, ok: false });
    };
    image.src = url;
  });
}

async function probeImageWithBackgroundMetrics(url: string): Promise<ImageProbeResult> {
  const pageProbeResult = await probeImage(url);
  if (!pageProbeResult.ok || pageProbeResult.fingerprint) {
    return pageProbeResult;
  }

  try {
    const metrics = (await chrome.runtime.sendMessage({
      type: "kuajing-image:probe-image-metrics",
      url
    })) as BackgroundImageMetricsResult;
    if (!metrics?.ok) {
      return pageProbeResult;
    }
    return {
      ...pageProbeResult,
      width: metrics.width || pageProbeResult.width,
      height: metrics.height || pageProbeResult.height,
      fingerprint: metrics.fingerprint,
      sharpness: metrics.sharpness
    };
  } catch {
    return pageProbeResult;
  }
}

function fingerprintDistance(left: string, right: string): number {
  if (left.length !== right.length) {
    return Number.POSITIVE_INFINITY;
  }

  let distance = 0;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      distance += 1;
    }
  }
  return distance;
}

function isBetterImageCandidate(candidate: AcceptedImageCandidate, existing: AcceptedImageCandidate): boolean {
  const candidateArea = candidate.width * candidate.height;
  const existingArea = existing.width * existing.height;
  const largerArea = Math.max(candidateArea, existingArea);
  const areaDeltaRatio = largerArea > 0 ? Math.abs(candidateArea - existingArea) / largerArea : 0;

  if (areaDeltaRatio > 0.1) {
    return candidateArea > existingArea;
  }

  const candidateSharpness = candidate.sharpness ?? 0;
  const existingSharpness = existing.sharpness ?? 0;
  const sharperValue = Math.max(candidateSharpness, existingSharpness);
  const sharpnessDeltaRatio = sharperValue > 0 ? Math.abs(candidateSharpness - existingSharpness) / sharperValue : 0;
  if (sharpnessDeltaRatio > 0.15) {
    return candidateSharpness > existingSharpness;
  }

  const candidateRank = imageUrlVariantRank(candidate.url) + candidate.candidateScore;
  const existingRank = imageUrlVariantRank(existing.url) + existing.candidateScore;
  return candidateRank > existingRank;
}

function imageAspectRatio(candidate: AcceptedImageCandidate): number {
  return candidate.height > 0 ? candidate.width / candidate.height : 0;
}

function isLikelyDuplicateFingerprint(candidate: AcceptedImageCandidate, existing: AcceptedImageCandidate): boolean {
  if (!candidate.fingerprint || !existing.fingerprint) {
    return false;
  }

  const distance = fingerprintDistance(candidate.fingerprint, existing.fingerprint);
  if (distance === 0) {
    return true;
  }

  const candidateRatio = imageAspectRatio(candidate);
  const existingRatio = imageAspectRatio(existing);
  const widerRatio = Math.max(candidateRatio, existingRatio);
  const ratioDelta = widerRatio > 0 ? Math.abs(candidateRatio - existingRatio) / widerRatio : 0;
  return distance <= 3 && ratioDelta <= 0.08;
}

function commonDecorativeFeatureStorageKey(record: Pick<CommonDecorativeImageFeatureRecord, "kind" | "key">): string {
  return `${record.kind}:${record.key}`;
}

function currentPageFeatureKey(): string {
  try {
    const parsed = new URL(location.href);
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString();
  } catch {
    return location.href.split(/[?#]/u)[0] || location.href;
  }
}

function imageFeatureKeys(candidate: AcceptedImageCandidate): Array<Pick<CommonDecorativeImageFeatureRecord, "kind" | "key">> {
  const keys: Array<Pick<CommonDecorativeImageFeatureRecord, "kind" | "key">> = [{ kind: "url", key: candidate.identityKey }];
  if (candidate.fingerprint) {
    keys.push({ kind: "fingerprint", key: candidate.fingerprint });
  }
  return keys;
}

function hasStrongProductPlacementContext(context: string): boolean {
  return /main|gallery|album|detail|desc|content|rich|主图|详情|细节|商品详情|carousel|swiper/u.test(context);
}

function hasDecorativeSignal(candidate: AcceptedImageCandidate): boolean {
  return isLikelyDecorativeImage(candidate.url, candidate.context);
}

function isReusableDecorativeImageShape(candidate: AcceptedImageCandidate): boolean {
  const longestSide = Math.max(candidate.width, candidate.height);
  const shortestSide = Math.min(candidate.width, candidate.height);
  if (longestSide <= 0 || shortestSide <= 0) {
    return false;
  }

  const aspectRatio = candidate.width / candidate.height;
  const squareBadge = aspectRatio >= 0.72 && aspectRatio <= 1.38 && longestSide <= 640 && shortestSide >= 72;
  const bannerBadge = aspectRatio > 1.38 && aspectRatio <= 4.5 && longestSide <= 960 && shortestSide <= 360;
  return (squareBadge || bannerBadge) && !hasStrongProductPlacementContext(candidate.context);
}

function shouldTrackCommonDecorativeFeature(candidate: AcceptedImageCandidate): boolean {
  return hasDecorativeSignal(candidate) || isReusableDecorativeImageShape(candidate);
}

function isCommonDecorativeFeature(candidate: AcceptedImageCandidate, records: Map<string, CommonDecorativeImageFeatureRecord>): boolean {
  if (!shouldTrackCommonDecorativeFeature(candidate)) {
    return false;
  }

  for (const featureKey of imageFeatureKeys(candidate)) {
    const record = records.get(commonDecorativeFeatureStorageKey(featureKey));
    if (!record) {
      continue;
    }

    const requiredSeenPages = featureKey.kind === "url" || hasDecorativeSignal(candidate) ? 2 : 3;
    if (record.seenPages.length >= requiredSeenPages) {
      return true;
    }
  }

  return false;
}

function isCommonDecorativeUrlFeature(url: string, records: Map<string, CommonDecorativeImageFeatureRecord>): boolean {
  const record = records.get(commonDecorativeFeatureStorageKey({ kind: "url", key: imageIdentityKey(url) }));
  return Boolean(record && record.seenPages.length >= 2);
}

function isCommonDecorativeImageFeatureStore(value: unknown): value is CommonDecorativeImageFeatureStore {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { version?: unknown }).version === 1 &&
    Array.isArray((value as { records?: unknown }).records)
  );
}

async function loadCommonDecorativeImageFeatures(): Promise<Map<string, CommonDecorativeImageFeatureRecord>> {
  try {
    const stored = await chrome.storage.local.get(COMMON_DECORATIVE_IMAGE_FEATURE_STORAGE_KEY);
    const value = stored[COMMON_DECORATIVE_IMAGE_FEATURE_STORAGE_KEY];
    if (!isCommonDecorativeImageFeatureStore(value)) {
      return new Map();
    }

    return new Map(
      value.records
        .filter((record) => record.kind && record.key)
        .map((record) => [commonDecorativeFeatureStorageKey(record), record])
    );
  } catch {
    return new Map();
  }
}

async function saveCommonDecorativeImageFeatures(records: Map<string, CommonDecorativeImageFeatureRecord>): Promise<void> {
  const prunedRecords = Array.from(records.values())
    .sort((left, right) => right.lastSeenAt - left.lastSeenAt)
    .slice(0, MAX_COMMON_DECORATIVE_IMAGE_FEATURES);

  try {
    await chrome.storage.local.set({
      [COMMON_DECORATIVE_IMAGE_FEATURE_STORAGE_KEY]: {
        version: 1,
        records: prunedRecords
      } satisfies CommonDecorativeImageFeatureStore
    });
  } catch {
    // Feature learning is best-effort; image collection still works without it.
  }
}

async function rememberCommonDecorativeImageFeatures(
  candidates: AcceptedImageCandidate[],
  records: Map<string, CommonDecorativeImageFeatureRecord>
): Promise<Map<string, CommonDecorativeImageFeatureRecord>> {
  const pageKey = currentPageFeatureKey();
  const now = Date.now();
  let changed = false;

  for (const candidate of candidates) {
    if (!shouldTrackCommonDecorativeFeature(candidate)) {
      continue;
    }

    for (const featureKey of imageFeatureKeys(candidate)) {
      const storageKey = commonDecorativeFeatureStorageKey(featureKey);
      const record = records.get(storageKey) ?? {
        kind: featureKey.kind,
        key: featureKey.key,
        seenPages: [],
        seenCount: 0,
        width: candidate.width,
        height: candidate.height,
        lastSeenAt: now
      };

      if (!record.seenPages.includes(pageKey)) {
        record.seenPages = [...record.seenPages, pageKey].slice(-8);
      }
      record.seenCount += 1;
      record.width = Math.max(record.width, candidate.width);
      record.height = Math.max(record.height, candidate.height);
      record.lastSeenAt = now;
      records.set(storageKey, record);
      changed = true;
    }
  }

  if (changed) {
    await saveCommonDecorativeImageFeatures(records);
  }
  return records;
}

function dedupeProbedImages(candidates: AcceptedImageCandidate[]): AcceptedImageCandidate[] {
  const groups: AcceptedImageCandidate[] = [];

  for (const candidate of candidates) {
    const groupIndex = groups.findIndex(
      (group) =>
        group.identityKey === candidate.identityKey ||
        group.exactKey === candidate.exactKey ||
        isLikelyDuplicateFingerprint(candidate, group)
    );

    if (groupIndex < 0) {
      groups.push(candidate);
      continue;
    }

    if (isBetterImageCandidate(candidate, groups[groupIndex])) {
      groups[groupIndex] = candidate;
    }
  }

  return groups.sort((left, right) => right.candidateScore - left.candidateScore || right.width * right.height - left.width * left.height);
}

async function filterProductImageUrls(candidates: ImageCandidate[]): Promise<string[]> {
  const commonDecorativeFeatures = await loadCommonDecorativeImageFeatures();
  const dedupedCandidates = bestImageCandidates(candidates);
  const sortedCandidates = dedupedCandidates
    .sort((left, right) => right.score - left.score)
    .slice(0, 180);
  const accepted: AcceptedImageCandidate[] = [];
  const fallbackUrlCandidates = sortedCandidates.map((candidate) => candidate.url).filter((url) => !hasTinySizeHint(url));

  for (let index = 0; index < sortedCandidates.length; index += 12) {
    const batch = sortedCandidates.slice(index, index + 12);
    const results = await Promise.race([
      Promise.all(batch.map((candidate) => probeImageWithBackgroundMetrics(candidate.url).then((result) => ({ ...result, candidateScore: candidate.score, context: candidate.context })))),
      sleep(5200).then(() => [] as ImageProbeResult[])
    ]);
    for (const result of results) {
      if (!result.ok) {
        continue;
      }
      const longestSide = Math.max(result.width, result.height);
      const shortestSide = Math.min(result.width, result.height);
      const identityKey = imageIdentityKey(result.url);
      const exactKey = exactImageUrlKey(result.url);
      const context = (result as ImageProbeResult & { candidateScore?: number; context?: string }).context?.toLowerCase() ?? "";
      const allowSmallImage = /gallery|album|thumb|sku|offer|product|detail|desc|content|rich|主图|商品|图片|image|img|carousel|swiper|thumbnail/u.test(context);
      const minLongestSide = allowSmallImage ? 80 : 220;
      const minShortestSide = allowSmallImage ? 60 : 120;
      if (
        longestSide >= minLongestSide &&
        shortestSide >= minShortestSide
      ) {
        accepted.push({
          ...result,
          candidateScore: (result as ImageProbeResult & { candidateScore?: number }).candidateScore ?? 0,
          context,
          identityKey,
          exactKey
        });
      }
    }
  }

  const updatedCommonDecorativeFeatures = await rememberCommonDecorativeImageFeatures(accepted, commonDecorativeFeatures);
  const filtered = dedupeProbedImages(accepted.filter((candidate) => !isCommonDecorativeFeature(candidate, updatedCommonDecorativeFeatures)))
    .map((candidate) => candidate.url)
    .slice(0, 120);
  const fallbackUrls = fallbackUrlCandidates.filter((url) => !isCommonDecorativeUrlFeature(url, updatedCommonDecorativeFeatures)).slice(0, 120);
  return filtered.length > 0 ? filtered : fallbackUrls;
}

function collectAccessibleDocuments(doc: Document, depth = 0, seen = new Set<Document>()): Document[] {
  if (seen.has(doc) || depth > 2) {
    return [];
  }

  seen.add(doc);
  const docs = [doc];
  for (const frame of Array.from(doc.querySelectorAll<HTMLIFrameElement>("iframe"))) {
    try {
      const frameDocument = frame.contentDocument;
      if (frameDocument) {
        docs.push(...collectAccessibleDocuments(frameDocument, depth + 1, seen));
      }
    } catch {
      // Cross-origin iframes cannot be inspected from the content script.
    }
  }
  return docs;
}

async function hydrateDetailImages(doc: Document): Promise<void> {
  const firstDetailRoot = doc.querySelector<HTMLElement>(DETAIL_ROOT_SELECTOR);
  const originalX = window.scrollX;
  const originalY = window.scrollY;
  const detailRoots = Array.from(doc.querySelectorAll<HTMLElement>(DETAIL_ROOT_SELECTOR)).slice(0, 12);
  const step = Math.max(Math.floor(window.innerHeight * 0.8), 600);

  if (firstDetailRoot) {
    firstDetailRoot.scrollIntoView({ block: "start", inline: "nearest" });
    await sleep(300);
  }

  for (const root of detailRoots) {
    root.scrollIntoView({ block: "center", inline: "nearest" });
    await sleep(80);
  }
  const maxScrollY = Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight);
  for (let top = Math.max(0, originalY); top <= maxScrollY; top += step) {
    window.scrollTo({ top });
    await sleep(120);
  }
  await sleep(300);

  window.scrollTo({ left: originalX, top: originalY });
}

async function pageContext(): Promise<PageContext> {
  injectPageCaptureScript();
  await sleep(800);
  await hydrateDetailImages(document);

  const imageCandidates: ImageCandidate[] = [];
  const seenImageUrls = new Set<string>();
  const documents = collectAccessibleDocuments(document);
  const networkImageUrls = await readCapturedNetworkImageUrls();

  addCapturedNetworkImageCandidates(imageCandidates, seenImageUrls, networkImageUrls);
  addCapturedResponseImageCandidates(imageCandidates, seenImageUrls);

  for (const doc of documents) {
    const ogImage = readDocMeta(doc, 'meta[property="og:image"], meta[name="og:image"]');
    addImageCandidate(imageCandidates, seenImageUrls, ogImage, 70);

    for (const image of Array.from(doc.images)) {
      const score = imageScore(image);
      if (score > 0) {
        const context = elementContext(image);
        addImageCandidate(imageCandidates, seenImageUrls, image.currentSrc || image.src, score, context);
        addImageCandidate(imageCandidates, seenImageUrls, image.getAttribute("data-src"), score + 10, context);
        addImageCandidate(imageCandidates, seenImageUrls, image.getAttribute("data-lazy-src"), score + 10, context);
        addImageCandidate(imageCandidates, seenImageUrls, image.getAttribute("data-original"), score + 10, context);
        addSrcsetCandidates(imageCandidates, seenImageUrls, image.srcset || image.getAttribute("data-srcset"), score + 10, context);
      }
    }
    addBackgroundImageCandidates(doc, imageCandidates, seenImageUrls);
    addDetailImageCandidates(doc, imageCandidates, seenImageUrls);
    addMarkupImageCandidates(doc, imageCandidates, seenImageUrls);
    addScriptImageCandidates(doc, imageCandidates, seenImageUrls);
    addGlobalStateImageCandidates(doc, imageCandidates, seenImageUrls);
    addResourceImageCandidates(doc, imageCandidates, seenImageUrls);
    addCapturedResponseImageCandidates(imageCandidates, seenImageUrls);
  }
  addCapturedNetworkImageCandidates(imageCandidates, seenImageUrls, await readCapturedNetworkImageUrls());

  return {
    title: readProductTitle(document),
    description: readDocMeta(document, 'meta[name="description"], meta[property="og:description"]'),
    url: location.href,
    imageUrls: await filterProductImageUrls(imageCandidates),
    product: mapPageProductContext(document)
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "kuajing-image:get-page-context") {
    void pageContext().then(sendResponse);
    return true;
  }

  if (message?.type === "kuajing-image:sync-auth" && typeof message.token === "string") {
    let persisted = false;
    try {
      window.localStorage.setItem(WEB_AUTH_TOKEN_STORAGE_KEY, message.token);
      persisted = true;
    } catch {
      persisted = false;
    }
    window.postMessage(
      {
        source: "kuajing-image-extension",
        type: "kuajing-image:auth-token",
        token: message.token
      },
      window.location.origin
    );
    sendResponse({ ok: true, persisted });
    return true;
  }

  if (message?.type === "kuajing-image:set-preview-overlay") {
    const overlay = message.overlay as BrandPreviewOverlayMessage | undefined;
    if (!overlay || !overlay.placement) {
      sendResponse({ ok: false });
      return false;
    }

    const payload = {
      placement: overlay.placement,
      logoDataUrl: typeof overlay.logoDataUrl === "string" ? overlay.logoDataUrl : "",
      text: typeof overlay.text === "string" ? overlay.text : ""
    };
    window.name = `${BRAND_PREVIEW_WINDOW_NAME_PREFIX}${JSON.stringify(payload)}`;
    window.postMessage(
      {
        source: "kuajing-image-extension",
        type: "kuajing-image:preview-overlay",
        overlay: payload
      },
      window.location.origin
    );
    sendResponse({ ok: true });
    return false;
  }

  return false;
});

installPageCaptureListener();
installExtensionProbeListener();
installResourceCaptureObserver();
injectPageCaptureScript();
