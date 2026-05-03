import type { PageContext } from "./types";

function normalizeText(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function absoluteUrl(value: string): string {
  try {
    return new URL(value, location.href).toString();
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
}

interface RankedImageCandidate extends ImageCandidate {
  identityKey: string;
}

const IMAGE_URL_PATTERN = /(?:https?:)?\/\/[^"'()<>\s\\]+?\.(?:jpg|jpeg|png|webp|gif|bmp|avif)(?:[._!-][^"'()<>\s\\?]*)?(?:\?[^"'()<>\s\\]*)?/giu;
const DETAIL_ROOT_SELECTOR =
  "#detail, [class*='detail'], [class*='Detail'], [class*='desc'], [class*='Desc'], [class*='content'], [class*='Content'], [class*='rich'], [class*='Rich'], [id*='detail'], [id*='Detail'], [id*='desc'], [id*='Desc'], [data-module*='detail'], [data-module*='Detail']";

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
    /48\s*小时|发货|保障|货源|服务|售后|赔付|极速|闪电|service|promise|guarantee|delivery|insurance/u.test(lower)
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
    parsed.search = "";
    parsed.protocol = "https:";
    parsed.pathname = parsed.pathname
      .replace(/\.(?:\d{2,5}x\d{2,5})\.(jpg|jpeg|png|webp|gif|avif|bmp)$/iu, ".$1")
      .replace(/_(?:\d+x\d+|(?:sum|m|b|q)\d+|webp|jpg|jpeg|png|avif|gif)(?=(?:\.[a-z0-9]+)?$)/giu, "")
      .replace(/\.(?:jpg|jpeg|png|webp|gif|avif|bmp)_(?:\d+x\d+|(?:sum|m|b|q)\d+|webp|jpg|jpeg|png|avif|gif).*$/giu, (match) => {
        const extension = match.match(/\.(jpg|jpeg|png|webp|gif|avif|bmp)/iu)?.[0] ?? "";
        return extension.toLowerCase();
      })
      .replace(/(?:!!|_)(?:\d+x\d+|(?:sum|m|b|q)\d+|webp|jpg|jpeg|png|avif|gif)+(?=(?:\.[a-z0-9]+)?$)/giu, "")
      .replace(/\/resize,m_[^/]+/giu, "")
      .replace(/\/quality,Q_[^/]+/giu, "")
      .replace(/\/format,[^/]+/giu, "");
    return `${parsed.hostname}${parsed.pathname}`.toLowerCase();
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
  } catch {
    return rank;
  }
  return rank;
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
  const roots = doc.querySelectorAll<HTMLElement>(DETAIL_ROOT_SELECTOR);
  const markupParts = Array.from(roots)
    .slice(0, 20)
    .map((element) => element.outerHTML);

  for (const markup of markupParts) {
    for (const imageUrl of extractImageUrlsFromText(markup)) {
      addImageCandidate(candidates, seen, imageUrl, 65, "page markup detail image");
    }
  }
}

function addScriptImageCandidates(doc: Document, candidates: ImageCandidate[], seen: Set<string>): void {
  for (const script of Array.from(doc.scripts).slice(0, 80)) {
    const text = script.textContent ?? "";
    if (!text || !/detail|desc|content|rich|offer|product|image|img|主图|详情|商品/iu.test(text.slice(0, 2000))) {
      continue;
    }
    for (const imageUrl of extractImageUrlsFromText(text)) {
      addImageCandidate(candidates, seen, imageUrl, 60, "script image url");
    }
  }
}

function imageFingerprint(image: HTMLImageElement): string | undefined {
  if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
    return undefined;
  }

  try {
    const canvas = document.createElement("canvas");
    const size = 8;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      return undefined;
    }

    ctx.drawImage(image, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size).data;
    const luminance: number[] = [];
    for (let index = 0; index < data.length; index += 4) {
      luminance.push(data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114);
    }
    const average = luminance.reduce((total, value) => total + value, 0) / luminance.length;
    return luminance.map((value) => (value >= average ? "1" : "0")).join("");
  } catch {
    return undefined;
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
      resolve({ url, width: image.naturalWidth, height: image.naturalHeight, ok: true, fingerprint: imageFingerprint(image) });
    };
    image.onerror = () => {
      window.clearTimeout(timer);
      resolve({ url, width: 0, height: 0, ok: false });
    };
    image.src = url;
  });
}

async function filterProductImageUrls(candidates: ImageCandidate[]): Promise<string[]> {
  const acceptedKeys = new Set<string>();
  const acceptedFingerprints = new Set<string>();
  const dedupedCandidates = bestImageCandidates(candidates);
  const sortedUrls = dedupedCandidates
    .sort((left, right) => right.score - left.score)
    .map((candidate) => candidate.url)
    .slice(0, 96);
  const accepted: string[] = [];
  const fallbackUrls = sortedUrls.filter((url) => !hasTinySizeHint(url)).slice(0, 64);

  for (let index = 0; index < sortedUrls.length && accepted.length < 64; index += 12) {
    const batch = sortedUrls.slice(index, index + 12);
    const results = await Promise.race([
      Promise.all(batch.map((url) => probeImage(url))),
      sleep(3200).then(() => [] as ImageProbeResult[])
    ]);
    for (const result of results) {
      if (!result.ok) {
        continue;
      }
      const longestSide = Math.max(result.width, result.height);
      const shortestSide = Math.min(result.width, result.height);
      const identityKey = imageIdentityKey(result.url);
      const exactKey = exactImageUrlKey(result.url);
      const fingerprint = result.fingerprint;
      if (
        longestSide >= 220 &&
        shortestSide >= 120 &&
        !acceptedKeys.has(identityKey) &&
        !acceptedKeys.has(exactKey) &&
        (!fingerprint || !acceptedFingerprints.has(fingerprint))
      ) {
        acceptedKeys.add(identityKey);
        acceptedKeys.add(exactKey);
        if (fingerprint) {
          acceptedFingerprints.add(fingerprint);
        }
        accepted.push(result.url);
      }
    }
  }

  return accepted.length > 0 ? accepted : fallbackUrls;
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
  await hydrateDetailImages(document);

  const imageCandidates: ImageCandidate[] = [];
  const seenImageUrls = new Set<string>();
  const documents = collectAccessibleDocuments(document);

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
  }

  return {
    title: readProductTitle(document),
    description: readDocMeta(document, 'meta[name="description"], meta[property="og:description"]'),
    url: location.href,
    imageUrls: await filterProductImageUrls(imageCandidates)
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "kuajing-image:get-page-context") {
    void pageContext().then(sendResponse);
    return true;
  }

  if (message?.type === "kuajing-image:sync-auth" && typeof message.token === "string") {
    window.postMessage(
      {
        source: "kuajing-image-extension",
        type: "kuajing-image:auth-token",
        token: message.token
      },
      window.location.origin
    );
    sendResponse({ ok: true });
    return true;
  }

  return false;
});
