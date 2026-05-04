const IMAGE_URL_PATTERN = /(?:https?:)?\/\/[^"'()<>\s\\]+?\.(?:jpg|jpeg|png|webp|gif|bmp|avif)(?:[._!-][^"'()<>\s\\?]*)?(?:\?[^"'()<>\s\\]*)?/giu;
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

interface ProductAttribute {
  label: string;
  value: string;
}

function normalize(value: string): string {
  return String(value || "")
    .trim()
    .replace(/^url\(["']?/u, "")
    .replace(/["']?\)$/u, "")
    .replace(/\\u002f/giu, "/")
    .replace(/\\\//gu, "/")
    .replace(/&amp;/gu, "&")
    .replace(/\\u0026/giu, "&")
    .replace(/\\u003d/giu, "=");
}

function normalizeText(value: string): string {
  return normalize(value).replace(/\s+/gu, " ").trim();
}

function normalizeLabel(value: string): string {
  return normalizeText(value)
    .replace(/[：:]+$/u, "")
    .replace(/\s+/gu, "")
    .replace(/[（(][^）)]*[）)]/gu, "")
    .trim();
}

function extract(text: string): string[] {
  const normalized = normalize(text);
  IMAGE_URL_PATTERN.lastIndex = 0;
  return Array.from(normalized.matchAll(IMAGE_URL_PATTERN))
    .map((match) => match[0])
    .filter((url) => /alicdn|ibank|O1CN|cbu01/i.test(url));
}

function emit(urls: string[], attributes: ProductAttribute[] = []): void {
  if (urls.length === 0) {
    if (attributes.length === 0) {
      return;
    }
  }
  window.postMessage(
    { source: "kuajing-image-page-hook", type: "kuajing-image:captured-urls", urls, attributes },
    window.location.origin
  );
}

function textLooksInteresting(text: string): boolean {
  return /alicdn|ibank|O1CN|cbu01|offer_details|img\/ibank|商品属性|面料成分|面料名称|颜色|尺码|款式|风格|袖长|主面料|货号|属性参数|sku/i.test(text);
}

function addAttribute(target: ProductAttribute[], label: string, value: unknown): void {
  const normalizedLabel = normalizeLabel(label);
  const normalizedValue = normalizeText(typeof value === "string" || typeof value === "number" ? String(value) : "");
  if (!PROPERTY_LABELS.has(normalizedLabel) || !normalizedValue || PROPERTY_LABELS.has(normalizeLabel(normalizedValue))) {
    return;
  }
  if (normalizedValue.length > 160 || /^(null|undefined)$/iu.test(normalizedValue)) {
    return;
  }
  if (!target.some((item) => item.label === normalizedLabel && item.value === normalizedValue)) {
    target.push({ label: normalizedLabel, value: normalizedValue });
  }
}

function parseJsonLike(text: string): unknown[] {
  const normalized = normalize(text);
  const candidates = [normalized];
  const callbackMatch = normalized.match(/^[^(]+\(([\s\S]+)\)\s*;?\s*$/u);
  if (callbackMatch) {
    candidates.push(callbackMatch[1]);
  }
  const firstBrace = normalized.indexOf("{");
  const lastBrace = normalized.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(normalized.slice(firstBrace, lastBrace + 1));
  }
  const firstBracket = normalized.indexOf("[");
  const lastBracket = normalized.lastIndexOf("]");
  if (firstBracket >= 0 && lastBracket > firstBracket) {
    candidates.push(normalized.slice(firstBracket, lastBracket + 1));
  }

  const parsed: unknown[] = [];
  for (const candidate of candidates) {
    try {
      parsed.push(JSON.parse(candidate));
    } catch {}
  }
  return parsed;
}

function stringFromKeys(source: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = source[key];
    if ((typeof value === "string" || typeof value === "number") && String(value).trim()) {
      return String(value);
    }
  }
  return "";
}

function collectAttributesFromValue(value: unknown, attributes: ProductAttribute[], depth = 0): void {
  if (!value || depth > 8) {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 500)) {
      collectAttributesFromValue(item, attributes, depth + 1);
    }
    return;
  }
  if (typeof value !== "object") {
    return;
  }

  const source = value as Record<string, unknown>;
  const label = stringFromKeys(source, [
    "label",
    "name",
    "key",
    "title",
    "attrName",
    "attributeName",
    "propertyName",
    "propName",
    "featureName",
    "specName"
  ]);
  const attrValue = stringFromKeys(source, [
    "value",
    "text",
    "content",
    "attrValue",
    "attributeValue",
    "propertyValue",
    "propValue",
    "featureValue",
    "specValue",
    "valueName"
  ]);
  if (label && attrValue) {
    addAttribute(attributes, label, attrValue);
  }

  for (const child of Object.values(source).slice(0, 500)) {
    collectAttributesFromValue(child, attributes, depth + 1);
  }
}

function extractAttributesFromText(text: string): ProductAttribute[] {
  const attributes: ProductAttribute[] = [];
  const normalized = normalize(text);

  for (const parsed of parseJsonLike(normalized)) {
    collectAttributesFromValue(parsed, attributes);
  }

  for (const label of PROPERTY_LABELS) {
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    const patterns = [
      new RegExp(`["'](?:label|name|key|title|attrName|propertyName|propName)["']\\s*:\\s*["']${escapedLabel}["'][\\s\\S]{0,180}?["'](?:value|text|content|attrValue|propertyValue|propValue|valueName)["']\\s*:\\s*["']([^"']{1,160})["']`, "giu"),
      new RegExp(`["']${escapedLabel}["']\\s*[:：]\\s*["']([^"']{1,160})["']`, "giu"),
      new RegExp(`${escapedLabel}\\s*[:：]\\s*([^,，;；\\n\\r<>{}\\[\\]\"]{1,80})`, "giu")
    ];
    for (const pattern of patterns) {
      for (const match of normalized.matchAll(pattern)) {
        addAttribute(attributes, label, match[1]);
      }
    }
  }

  return attributes;
}

function inspectText(text: string): void {
  if (!text || !textLooksInteresting(String(text))) {
    return;
  }
  emit(extract(text), extractAttributesFromText(text));
}

if (!(window as Window & { __kuajingImagePageHookInstalled?: boolean }).__kuajingImagePageHookInstalled) {
  (window as Window & { __kuajingImagePageHookInstalled?: boolean }).__kuajingImagePageHookInstalled = true;

  const originalFetch = window.fetch;
  if (typeof originalFetch === "function") {
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      try {
        const clone = response.clone();
        const contentType = clone.headers.get("content-type") || "";
        if (/json|javascript|text|html/i.test(contentType)) {
          clone.text().then(inspectText).catch(() => {});
        }
      } catch {}
      return response;
    };
  }

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (
    this: HookedXMLHttpRequest,
    method: string,
    url: string | URL,
    async?: boolean,
    username?: string | null,
    password?: string | null
  ) {
    this.__kuajingImageRequestUrl = url;
    return originalOpen.call(this, method, url, async ?? true, username, password);
  };
  XMLHttpRequest.prototype.send = function (this: HookedXMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
    this.addEventListener("load", function () {
      try {
        const responseType = this.responseType || "";
        const contentType = this.getResponseHeader("content-type") || "";
        if ((!responseType || responseType === "text") && /json|javascript|text|html/i.test(contentType)) {
          inspectText(this.responseText || "");
        }
      } catch {}
    });
    return originalSend.call(this, body);
  };

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of Array.from(record.addedNodes)) {
        if (node instanceof HTMLScriptElement) {
          inspectText(node.textContent || "");
          if (node.src) emit([node.src]);
        } else if (node instanceof HTMLElement) {
          inspectText(node.outerHTML || "");
        }
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  inspectText(document.documentElement?.outerHTML || "");
  for (const scriptNode of Array.from(document.scripts)) {
    inspectText(scriptNode.textContent || "");
    if (scriptNode.src) emit([scriptNode.src]);
  }
}
interface HookedXMLHttpRequest extends XMLHttpRequest {
  __kuajingImageRequestUrl?: string | URL;
}
