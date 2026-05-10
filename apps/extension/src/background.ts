chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id) {
    await chrome.sidePanel.open({ tabId: tab.id });
  }
});

interface NetworkHeader {
  name: string;
  value?: string;
}

interface NetworkImageRequestDetails {
  tabId: number;
  frameId?: number;
  type?: string;
  url: string;
  statusCode?: number;
  responseHeaders?: NetworkHeader[];
  timeStamp?: number;
}

interface CapturedNetworkImage {
  url: string;
  frameId: number;
  requestType: string;
  statusCode: number;
  contentType: string;
  capturedAt: number;
}

const MAX_NETWORK_IMAGES_PER_TAB = 800;
const NETWORK_IMAGES_STORAGE_PREFIX = "kuajing-image-captured-network-images:";
const NETWORK_IMAGE_REQUEST_URL_PATTERN =
  /\.(?:jpg|jpeg|png|webp|gif|bmp|avif)(?:[._!-][^"'()<>\s\\?]*)?(?:[?#]|$)|\/img\/|[?&](?:image|img|pic|picture|photo|src)=/iu;
const capturedNetworkImagesByTab = new Map<number, CapturedNetworkImage[]>();

function headerValue(headers: NetworkHeader[] | undefined, name: string): string {
  const header = headers?.find((item) => item.name.toLowerCase() === name.toLowerCase());
  return header?.value ?? "";
}

function networkImageKey(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.toString().toLowerCase();
  } catch {
    return url.replace(/#.*$/u, "").toLowerCase();
  }
}

function networkImagesStorageKey(tabId: number): string {
  return `${NETWORK_IMAGES_STORAGE_PREFIX}${tabId}`;
}

function isCapturedNetworkImageArray(value: unknown): value is CapturedNetworkImage[] {
  return Array.isArray(value) && value.every((item) => typeof item === "object" && item !== null && typeof (item as { url?: unknown }).url === "string");
}

async function persistNetworkImage(tabId: number, image: CapturedNetworkImage): Promise<void> {
  const key = networkImagesStorageKey(tabId);
  const stored = await chrome.storage.session.get(key);
  const current = isCapturedNetworkImageArray(stored[key]) ? stored[key] : [];
  if (current.some((item) => networkImageKey(item.url) === networkImageKey(image.url))) {
    return;
  }

  const next = [...current, image].slice(-MAX_NETWORK_IMAGES_PER_TAB);
  capturedNetworkImagesByTab.set(tabId, next);
  await chrome.storage.session.set({ [key]: next });
}

async function readNetworkImages(tabId: number): Promise<string[]> {
  const cached = capturedNetworkImagesByTab.get(tabId);
  if (cached) {
    return cached.map((item) => item.url);
  }

  const key = networkImagesStorageKey(tabId);
  const stored = await chrome.storage.session.get(key);
  const loaded = isCapturedNetworkImageArray(stored[key]) ? stored[key] : [];
  capturedNetworkImagesByTab.set(tabId, loaded);
  return loaded.map((item) => item.url);
}

async function clearNetworkImages(tabId: number): Promise<void> {
  capturedNetworkImagesByTab.delete(tabId);
  await chrome.storage.session.remove(networkImagesStorageKey(tabId));
}

function isImageNetworkRequest(details: NetworkImageRequestDetails): boolean {
  if (!/^https?:\/\//iu.test(details.url)) {
    return false;
  }

  const contentType = headerValue(details.responseHeaders, "content-type");
  return /^image\//iu.test(contentType) || details.type === "image" || NETWORK_IMAGE_REQUEST_URL_PATTERN.test(details.url);
}

function recordNetworkImage(details: NetworkImageRequestDetails): void {
  if (details.tabId < 0 || !isImageNetworkRequest(details)) {
    return;
  }

  const key = networkImageKey(details.url);
  const existing = capturedNetworkImagesByTab.get(details.tabId) ?? [];
  if (existing.some((item) => networkImageKey(item.url) === key)) {
    return;
  }

  void persistNetworkImage(details.tabId, {
    url: details.url,
    frameId: details.frameId ?? 0,
    requestType: details.type ?? "unknown",
    statusCode: details.statusCode ?? 0,
    contentType: headerValue(details.responseHeaders, "content-type"),
    capturedAt: details.timeStamp ?? Date.now()
  });
}

function capturedNetworkImageUrls(tabId: number): string[] {
  return (capturedNetworkImagesByTab.get(tabId) ?? []).map((item) => item.url);
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    void clearNetworkImages(tabId);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void clearNetworkImages(tabId);
});

chrome.webRequest.onCompleted.addListener(
  recordNetworkImage,
  { urls: ["http://*/*", "https://*/*"], types: ["image", "xmlhttprequest", "media", "other"] },
  ["responseHeaders"]
);

chrome.webRequest.onBeforeRedirect.addListener(
  recordNetworkImage,
  { urls: ["http://*/*", "https://*/*"], types: ["image", "xmlhttprequest", "media", "other"] },
  ["responseHeaders"]
);

interface ImageMetricsResult {
  ok: boolean;
  width: number;
  height: number;
  fingerprint?: string;
  sharpness?: number;
  error?: string;
}

function calculateImageMetrics(data: Uint8ClampedArray): { fingerprint: string; sharpness: number } {
  const size = 32;
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
}

async function fetchImageMetrics(url: string): Promise<ImageMetricsResult> {
  if (!/^https?:\/\//iu.test(url)) {
    return { ok: false, width: 0, height: 0, error: "Unsupported image URL." };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);

  try {
    const response = await fetch(url, {
      cache: "force-cache",
      credentials: "omit",
      signal: controller.signal
    });
    if (!response.ok) {
      return { ok: false, width: 0, height: 0, error: `HTTP ${response.status}` };
    }

    const blob = await response.blob();
    if (!blob.type.startsWith("image/")) {
      return { ok: false, width: 0, height: 0, error: "Response is not an image." };
    }

    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(32, 32);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      bitmap.close();
      return { ok: false, width: bitmap.width, height: bitmap.height, error: "Canvas unavailable." };
    }

    ctx.drawImage(bitmap, 0, 0, 32, 32);
    const metrics = calculateImageMetrics(ctx.getImageData(0, 0, 32, 32).data);
    const result = {
      ok: true,
      width: bitmap.width,
      height: bitmap.height,
      ...metrics
    };
    bitmap.close();
    return result;
  } catch (error) {
    return { ok: false, width: 0, height: 0, error: error instanceof Error ? error.message : "Image metrics failed." };
  } finally {
    clearTimeout(timer);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "kuajing-image:get-captured-network-images") {
    const tabId = sender.tab?.id;
    if (typeof tabId !== "number") {
      sendResponse({ urls: [] });
      return false;
    }

    void readNetworkImages(tabId).then((urls) => sendResponse({ urls }));
    return true;
  }

  if (message?.type !== "kuajing-image:probe-image-metrics" || typeof message.url !== "string") {
    return false;
  }

  void fetchImageMetrics(message.url).then(sendResponse);
  return true;
});
