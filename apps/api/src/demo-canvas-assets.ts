import { randomUUID } from "node:crypto";
import {
  buildCloudObjectKey,
  CosAssetStorageAdapter,
  normalizeKeyPrefix,
  OssAssetStorageAdapter,
  storageErrorMessage
} from "./asset-storage.js";
import { buildAssetCdnUrl } from "./asset-cdn.js";
import type { DemoCanvasAssetUploadResponse } from "./contracts.js";
import { getActiveStorageConfig } from "./storage-config.js";

const DEMO_CANVAS_ASSET_PREFIX = normalizeKeyPrefix(process.env.DEMO_CANVAS_ASSET_PREFIX?.trim() || "demo-canvas");
const MAX_DEMO_CANVAS_ASSET_BYTES = 20 * 1024 * 1024;
const DEMO_CANVAS_IMAGE_MIME_TYPES = new Set(["image/gif", "image/jpeg", "image/png", "image/webp"]);

export class DemoCanvasAssetError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number
  ) {
    super(message);
  }
}

export async function uploadDemoCanvasAsset(input: {
  bytes: Buffer;
  fileName: string;
  mimeType: string;
}): Promise<DemoCanvasAssetUploadResponse> {
  if (!DEMO_CANVAS_IMAGE_MIME_TYPES.has(input.mimeType)) {
    throw new DemoCanvasAssetError("invalid_demo_canvas_asset_type", "请上传 PNG、JPG、WebP 或 GIF 图片。", 400);
  }

  if (input.bytes.length <= 0) {
    throw new DemoCanvasAssetError("empty_demo_canvas_asset", "上传图片不能为空。", 400);
  }

  if (input.bytes.length > MAX_DEMO_CANVAS_ASSET_BYTES) {
    throw new DemoCanvasAssetError("demo_canvas_asset_too_large", "游客画布图片不能超过 20MB。", 413);
  }

  const activeStorage = await getActiveStorageConfig();
  if (!activeStorage) {
    throw new DemoCanvasAssetError("demo_canvas_storage_unavailable", "请先在后台配置并启用 OSS/COS 云存储。", 400);
  }

  const createdAt = new Date().toISOString();
  const objectKey = buildCloudObjectKey(DEMO_CANVAS_ASSET_PREFIX, buildSafeObjectFileName(input.fileName, input.mimeType), createdAt);
  const adapter =
    activeStorage.provider === "cos" ? new CosAssetStorageAdapter(activeStorage.config) : new OssAssetStorageAdapter(activeStorage.config);

  try {
    const result = await adapter.putObject({
      key: objectKey,
      bytes: input.bytes,
      mimeType: input.mimeType
    });
    const url =
      buildAssetCdnUrl({ objectKey, provider: activeStorage.provider, status: "uploaded" }) ??
      buildCloudPublicUrl(activeStorage.provider, activeStorage.config.bucket, activeStorage.config.region, objectKey);

    return {
      provider: activeStorage.provider,
      bucket: activeStorage.config.bucket,
      region: activeStorage.config.region,
      objectKey,
      url,
      etag: result.etag,
      requestId: result.requestId
    };
  } catch (error) {
    throw new DemoCanvasAssetError("demo_canvas_asset_upload_failed", `游客画布图片上传失败：${storageErrorMessage(error)}`, 502);
  }
}

function buildSafeObjectFileName(fileName: string, mimeType: string): string {
  const extension = extensionForMimeType(mimeType);
  const baseName = fileName
    .trim()
    .replace(/\.[^.\\/]+$/u, "")
    .replace(/[^\w.-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80);
  return `${randomUUID()}-${baseName || "demo-canvas-image"}${extension}`;
}

function extensionForMimeType(mimeType: string): string {
  if (mimeType === "image/jpeg") {
    return ".jpg";
  }
  if (mimeType === "image/png") {
    return ".png";
  }
  if (mimeType === "image/webp") {
    return ".webp";
  }
  if (mimeType === "image/gif") {
    return ".gif";
  }
  return ".png";
}

function buildCloudPublicUrl(provider: "cos" | "oss", bucket: string, region: string, objectKey: string): string {
  const encodedKey = encodeObjectKey(objectKey);
  if (provider === "oss") {
    return `https://${bucket}.${region}.aliyuncs.com/${encodedKey}`;
  }
  return `https://${bucket}.cos.${region}.myqcloud.com/${encodedKey}`;
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
