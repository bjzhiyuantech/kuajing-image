import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { rm, readFile, writeFile } from "node:fs/promises";
import COS from "cos-nodejs-sdk-v5";

const require = createRequire(import.meta.url);
const OSS = require("ali-oss") as new (config: {
  accessKeyId: string;
  accessKeySecret: string;
  bucket: string;
  region: string;
  secure?: boolean;
}) => {
  put: (key: string, bytes: Buffer, options?: { headers?: Record<string, string> }) => Promise<{
    res?: { requestId?: string; headers?: Record<string, string | string[] | undefined> };
  }>;
  get: (key: string) => Promise<{
    content: Buffer | string;
    res?: { requestId?: string };
  }>;
  delete: (key: string) => Promise<void>;
};

export interface AssetStorageAdapter<TPutInput, TLocation> {
  putObject(input: TPutInput): Promise<AssetStoragePutResult>;
  getObject(location: TLocation): Promise<Buffer>;
  deleteObject(location: TLocation): Promise<void>;
}

export interface AssetStoragePutResult {
  etag?: string;
  requestId?: string;
}

export interface LocalAssetPutInput {
  filePath: string;
  bytes: Buffer;
}

export interface LocalAssetLocation {
  filePath: string;
}

export interface CosStorageAdapterConfig {
  secretId: string;
  secretKey: string;
  bucket: string;
  region: string;
  keyPrefix: string;
}

export interface OssStorageAdapterConfig {
  accessKeyId: string;
  accessKeySecret: string;
  bucket: string;
  region: string;
  keyPrefix: string;
}

export interface CloudAssetPutInput {
  key: string;
  bytes: Buffer;
  mimeType: string;
}

export interface CloudAssetLocation {
  bucket: string;
  region: string;
  key: string;
}

export class LocalAssetStorageAdapter implements AssetStorageAdapter<LocalAssetPutInput, LocalAssetLocation> {
  async putObject(input: LocalAssetPutInput): Promise<AssetStoragePutResult> {
    await writeFile(input.filePath, input.bytes);
    return {};
  }

  async getObject(location: LocalAssetLocation): Promise<Buffer> {
    return readFile(location.filePath);
  }

  async deleteObject(location: LocalAssetLocation): Promise<void> {
    await rm(location.filePath, { force: true });
  }
}

export class CosAssetStorageAdapter implements AssetStorageAdapter<CloudAssetPutInput, CloudAssetLocation> {
  private readonly client: COS;

  constructor(private readonly config: CosStorageAdapterConfig) {
    this.client = new COS({
      SecretId: config.secretId,
      SecretKey: config.secretKey,
      Protocol: "https:"
    });
  }

  async putObject(input: CloudAssetPutInput): Promise<AssetStoragePutResult> {
    const result = await this.client.putObject({
      Bucket: this.config.bucket,
      Region: this.config.region,
      Key: input.key,
      Body: input.bytes,
      ContentLength: input.bytes.length,
      ContentType: input.mimeType
    });

    return {
      etag: result.ETag,
      requestId: result.RequestId
    };
  }

  async getObject(location: CloudAssetLocation): Promise<Buffer> {
    const result = await this.client.getObject({
      Bucket: location.bucket,
      Region: location.region,
      Key: location.key
    });

    return Buffer.isBuffer(result.Body) ? result.Body : Buffer.from(result.Body);
  }

  async deleteObject(location: CloudAssetLocation): Promise<void> {
    await this.client.deleteObject({
      Bucket: location.bucket,
      Region: location.region,
      Key: location.key
    });
  }

  async testConfig(): Promise<void> {
    const key = buildCosObjectKey(this.config.keyPrefix, `.storage-test-${randomUUID()}.txt`, new Date().toISOString());
    await this.putObject({
      key,
      bytes: Buffer.from("gpt-image-canvas storage test\n", "utf8"),
      mimeType: "text/plain; charset=utf-8"
    });
    await this.deleteObject({
      bucket: this.config.bucket,
      region: this.config.region,
      key
    });
  }
}

export class OssAssetStorageAdapter implements AssetStorageAdapter<CloudAssetPutInput, CloudAssetLocation> {
  private readonly client: InstanceType<typeof OSS>;

  constructor(private readonly config: OssStorageAdapterConfig) {
    this.client = new OSS({
      accessKeyId: config.accessKeyId,
      accessKeySecret: config.accessKeySecret,
      bucket: config.bucket,
      region: config.region,
      secure: true
    });
  }

  async putObject(input: CloudAssetPutInput): Promise<AssetStoragePutResult> {
    const result = await this.client.put(input.key, input.bytes, {
      headers: {
        "Content-Type": input.mimeType
      }
    });
    const etagHeader = result.res?.headers?.etag;

    return {
      etag: Array.isArray(etagHeader) ? etagHeader[0] : etagHeader,
      requestId: result.res?.requestId
    };
  }

  async getObject(location: CloudAssetLocation): Promise<Buffer> {
    const result = await this.client.get(location.key);
    return Buffer.isBuffer(result.content) ? result.content : Buffer.from(result.content);
  }

  async deleteObject(location: CloudAssetLocation): Promise<void> {
    await this.client.delete(location.key);
  }

  async testConfig(): Promise<void> {
    const key = buildCloudObjectKey(this.config.keyPrefix, `.storage-test-${randomUUID()}.txt`, new Date().toISOString());
    await this.putObject({
      key,
      bytes: Buffer.from("gpt-image-canvas storage test\n", "utf8"),
      mimeType: "text/plain; charset=utf-8"
    });
    await this.deleteObject({
      bucket: this.config.bucket,
      region: this.config.region,
      key
    });
  }
}

export function buildCloudObjectKey(keyPrefix: string, fileName: string, createdAt: string): string {
  const date = new Date(createdAt);
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const year = String(safeDate.getUTCFullYear()).padStart(4, "0");
  const month = String(safeDate.getUTCMonth() + 1).padStart(2, "0");
  const normalizedPrefix = normalizeKeyPrefix(keyPrefix);
  return [normalizedPrefix, year, month, fileName].filter(Boolean).join("/");
}

export const buildCosObjectKey = buildCloudObjectKey;

export function normalizeKeyPrefix(value: string | undefined): string {
  const normalized = (value ?? "gpt-image-canvas/assets")
    .trim()
    .replace(/\\/gu, "/")
    .replace(/^\/+/u, "")
    .replace(/\/+$/u, "")
    .replace(/\/{2,}/gu, "/");

  return normalized || "gpt-image-canvas/assets";
}

export function storageErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
    return error.message;
  }

  return "Cloud storage request failed.";
}
