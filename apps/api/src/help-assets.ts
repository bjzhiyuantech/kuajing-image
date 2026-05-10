import { randomUUID } from "node:crypto";
import {
  buildCloudObjectKey,
  CosAssetStorageAdapter,
  normalizeKeyPrefix,
  OssAssetStorageAdapter,
  storageErrorMessage
} from "./asset-storage.js";
import { buildAssetCdnUrl } from "./asset-cdn.js";
import type { HelpAssetUploadResponse } from "./contracts.js";
import { getActiveStorageConfig } from "./storage-config.js";

const HELP_ASSET_PREFIX = normalizeKeyPrefix(process.env.HELP_CENTER_ASSET_PREFIX?.trim() || "help-center");
const MAX_HELP_ASSET_BYTES = 12 * 1024 * 1024;
const HELP_IMAGE_MIME_TYPES = new Set(["image/gif", "image/jpeg", "image/png", "image/webp"]);

export class HelpAssetError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number
  ) {
    super(message);
  }
}

export async function uploadHelpCenterAsset(input: {
  bytes: Buffer;
  fileName: string;
  mimeType: string;
}): Promise<HelpAssetUploadResponse> {
  if (!HELP_IMAGE_MIME_TYPES.has(input.mimeType)) {
    throw new HelpAssetError("invalid_help_asset_type", "请上传 PNG、JPG、WebP 或 GIF 图片。", 400);
  }

  if (input.bytes.length <= 0) {
    throw new HelpAssetError("empty_help_asset", "上传图片不能为空。", 400);
  }

  if (input.bytes.length > MAX_HELP_ASSET_BYTES) {
    throw new HelpAssetError("help_asset_too_large", "帮助中心图片不能超过 12MB。", 413);
  }

  const activeStorage = await getActiveStorageConfig();
  if (!activeStorage) {
    throw new HelpAssetError("help_asset_storage_unavailable", "请先在后台配置并启用 OSS/COS 云存储。", 400);
  }

  const createdAt = new Date().toISOString();
  const objectKey = buildCloudObjectKey(HELP_ASSET_PREFIX, buildSafeObjectFileName(input.fileName, input.mimeType), createdAt);
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
    throw new HelpAssetError("help_asset_upload_failed", `帮助中心图片上传失败：${storageErrorMessage(error)}`, 502);
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
  return `${randomUUID()}-${baseName || "help-image"}${extension}`;
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
