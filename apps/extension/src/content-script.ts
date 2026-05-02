import type { PageContext } from "./types";

function readMeta(selector: string): string {
  return document.querySelector<HTMLMetaElement>(selector)?.content.trim() ?? "";
}

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
}

function isLikelyDecorativeImage(url: string, context = ""): boolean {
  const lower = `${url} ${context}`.toLowerCase();
  return /logo|icon|sprite|avatar|qrcode|qr-code|barcode|xiaohongshu|小红书|pinduoduo|拼多多|douyin|抖音|kuaishou|快手|jd|京东|taobao|淘宝|alipay|支付|wangwang|旺旺/u.test(
    lower
  );
}

function addImageCandidate(
  candidates: ImageCandidate[],
  seen: Set<string>,
  value: string | null | undefined,
  score: number,
  context = ""
): void {
  if (!value || value.startsWith("data:") || value.startsWith("blob:")) {
    return;
  }
  const url = absoluteUrl(value.trim());
  if (!url || seen.has(url) || isLikelyDecorativeImage(url, context)) {
    return;
  }
  seen.add(url);
  candidates.push({ url, score });
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
    "lazy-src"
  ]
    .map((name) => element.getAttribute(name))
    .filter((value): value is string => Boolean(value?.trim()));
}

function readProductTitle(): string {
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
    Array.from(document.querySelectorAll<HTMLElement>(selector)).map((element) => normalizeText(element.textContent ?? ""))
  );
  candidates.push(readMeta('meta[property="og:title"], meta[name="title"]'));
  candidates.push(document.title.split(/[-_|—]/u)[0] ?? document.title);

  return (
    candidates
      .map(normalizeText)
      .filter((value) => value.length >= 4 && !/^1688|阿里巴巴|找本店|商品$/u.test(value))
      .sort((left, right) => titleScore(right) - titleScore(left))[0] ??
    normalizeText(document.title)
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

function addBackgroundImageCandidates(candidates: ImageCandidate[], seen: Set<string>): void {
  const roots = document.querySelectorAll<HTMLElement>(
    "#detail, [class*='detail'], [class*='Detail'], [class*='desc'], [class*='Desc'], [class*='content'], [class*='Content'], [class*='main'], [class*='gallery'], [class*='album'], [class*='rich'], [class*='Rich'], [id*='detail'], [id*='Detail'], [id*='desc'], [id*='Desc']"
  );
  for (const element of Array.from(roots).slice(0, 200)) {
    const background = getComputedStyle(element).backgroundImage;
    const matches = background.matchAll(/url\(["']?([^"')]+)["']?\)/gu);
    for (const match of matches) {
      addImageCandidate(candidates, seen, match[1], 55, elementContext(element));
    }
  }
}

function addDetailImageCandidates(candidates: ImageCandidate[], seen: Set<string>): void {
  const detailRoots = document.querySelectorAll<HTMLElement>(
    "#detail, [class*='detail'], [class*='Detail'], [class*='desc'], [class*='Desc'], [class*='content'], [class*='Content'], [class*='rich'], [class*='Rich'], [id*='detail'], [id*='Detail'], [id*='desc'], [id*='Desc'], [data-module*='detail'], [data-module*='Detail']"
  );
  for (const root of Array.from(detailRoots).slice(0, 80)) {
    const context = elementContext(root);
    for (const element of Array.from(root.querySelectorAll("img, source, picture, [srcset], [data-src], [data-srcset], [data-original], [data-ks-lazyload], [data-lazyload], [data-lazy-src], [data-image], [data-image-url]")).slice(0, 400)) {
      for (const value of readLazyImageAttributes(element)) {
        addImageCandidate(candidates, seen, value, 90, `${context} ${elementContext(element)}`);
      }
      addSrcsetCandidates(candidates, seen, element.getAttribute("srcset") || element.getAttribute("data-srcset"), 90, context);
    }
  }
}

function pageContext(): PageContext {
  const imageCandidates: ImageCandidate[] = [];
  const seenImageUrls = new Set<string>();
  const ogImage = readMeta('meta[property="og:image"], meta[name="og:image"]');
  addImageCandidate(imageCandidates, seenImageUrls, ogImage, 70);

  for (const image of Array.from(document.images)) {
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
  addBackgroundImageCandidates(imageCandidates, seenImageUrls);
  addDetailImageCandidates(imageCandidates, seenImageUrls);

  return {
    title: readProductTitle(),
    description: readMeta('meta[name="description"], meta[property="og:description"]'),
    url: location.href,
    imageUrls: imageCandidates
      .sort((left, right) => right.score - left.score)
      .map((candidate) => candidate.url)
      .slice(0, 64)
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "kuajing-image:get-page-context") {
    sendResponse(pageContext());
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
