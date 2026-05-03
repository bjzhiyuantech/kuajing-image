type CdnAssetLocation = {
  objectKey?: string | null;
  provider?: string | null;
  status?: string | null;
};

const assetCdnBaseUrl = normalizeCdnBaseUrl(process.env.ASSET_CDN_BASE_URL);
const OSS_PREVIEW_WIDTHS = [192, 256, 512, 1024] as const;

export function buildAssetCdnUrl(location: CdnAssetLocation | undefined): string | undefined {
  if (!assetCdnBaseUrl || !location || location.status !== "uploaded" || !location.objectKey?.trim()) {
    return undefined;
  }

  return `${assetCdnBaseUrl}/${encodeObjectKey(location.objectKey)}`;
}

export function buildAssetCdnPreviewUrls(location: CdnAssetLocation | undefined): Record<string, string> | undefined {
  const baseUrl = buildAssetCdnUrl(location);
  if (!baseUrl || location?.provider !== "oss") {
    return undefined;
  }

  return Object.fromEntries(OSS_PREVIEW_WIDTHS.map((width) => [String(width), appendOssResizeProcess(baseUrl, width)]));
}

function normalizeCdnBaseUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim().replace(/\/+$/u, "");
  if (!trimmed) {
    return undefined;
  }

  try {
    const parsed = new URL(trimmed);
    return parsed.toString().replace(/\/+$/u, "");
  } catch {
    return undefined;
  }
}

function appendOssResizeProcess(url: string, width: number): string {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}x-oss-process=${encodeURIComponent(`image/resize,w_${width}/format,webp`)}`;
}

function encodeObjectKey(objectKey: string): string {
  return objectKey
    .trim()
    .replace(/^\/+/u, "")
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}
