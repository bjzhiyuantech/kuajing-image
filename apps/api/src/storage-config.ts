import { eq } from "drizzle-orm";
import type { RequestTenant } from "./auth-context.js";
import type { SaveStorageConfigRequest, StorageConfigResponse, StorageTestResult } from "./contracts.js";
import { db } from "./database.js";
import {
  CosAssetStorageAdapter,
  OssAssetStorageAdapter,
  normalizeKeyPrefix,
  type CosStorageAdapterConfig,
  type OssStorageAdapterConfig,
  storageErrorMessage
} from "./asset-storage.js";
import { systemSettings } from "./schema.js";

const STORAGE_SETTINGS_KEY = "storage.config";
const DEFAULT_COS_BUCKET = process.env.COS_DEFAULT_BUCKET?.trim() || "source-1253253332";
const DEFAULT_COS_REGION = process.env.COS_DEFAULT_REGION?.trim() || "ap-nanjing";
const DEFAULT_COS_KEY_PREFIX = process.env.COS_DEFAULT_KEY_PREFIX?.trim() || "gpt-image-canvas/assets";
const DEFAULT_OSS_BUCKET = process.env.OSS_DEFAULT_BUCKET?.trim() || "";
const DEFAULT_OSS_REGION = process.env.OSS_DEFAULT_REGION?.trim() || "oss-cn-hangzhou";
const DEFAULT_OSS_KEY_PREFIX = process.env.OSS_DEFAULT_KEY_PREFIX?.trim() || "gpt-image-canvas/assets";

interface StoredStorageConfig {
  provider: "cos" | "oss";
  enabled: boolean;
  secretId?: string | null;
  secretKey?: string | null;
  bucket?: string | null;
  region?: string | null;
  keyPrefix?: string | null;
}

export async function getStorageConfig(_tenant?: RequestTenant): Promise<StorageConfigResponse> {
  return toStorageConfigResponse(await getStorageConfigRow());
}

export async function getActiveCosStorageConfig(_tenant?: RequestTenant): Promise<CosStorageAdapterConfig | undefined> {
  const row = await getStorageConfigRow();
  if (!row || !row.enabled || row.provider !== "cos" || !row.secretId || !row.secretKey || !row.bucket || !row.region) {
    return undefined;
  }

  return {
    secretId: row.secretId,
    secretKey: row.secretKey,
    bucket: row.bucket,
    region: row.region,
    keyPrefix: normalizeKeyPrefix(row.keyPrefix ?? DEFAULT_COS_KEY_PREFIX)
  };
}

export async function getActiveStorageConfig(
  _tenant?: RequestTenant
): Promise<
  | { provider: "cos"; config: CosStorageAdapterConfig }
  | { provider: "oss"; config: OssStorageAdapterConfig }
  | undefined
> {
  const row = await getStorageConfigRow();
  if (!row) {
    return getRuntimeStorageConfigFromEnv();
  }

  if (!row.enabled || !row.secretId || !row.secretKey || !row.bucket || !row.region) {
    return undefined;
  }

  if (row.provider === "cos") {
    return {
      provider: "cos",
      config: {
        secretId: row.secretId,
        secretKey: row.secretKey,
        bucket: row.bucket,
        region: row.region,
        keyPrefix: normalizeKeyPrefix(row.keyPrefix ?? DEFAULT_COS_KEY_PREFIX)
      }
    };
  }

  if (row.provider === "oss") {
    return {
      provider: "oss",
      config: {
        accessKeyId: row.secretId,
        accessKeySecret: row.secretKey,
        bucket: row.bucket,
        region: row.region,
        keyPrefix: normalizeKeyPrefix(row.keyPrefix ?? DEFAULT_OSS_KEY_PREFIX)
      }
    };
  }

  return undefined;
}

export async function saveStorageConfig(_tenant: RequestTenant | undefined, input: SaveStorageConfigRequest): Promise<StorageConfigResponse> {
  const existing = await getStorageConfigRow();

  if (!input.enabled) {
    const provider = input.provider === "oss" ? "oss" : "cos";
    await saveStorageConfigRow({
      provider,
      enabled: false,
      secretId: existing?.provider === provider ? existing.secretId : null,
      secretKey: existing?.provider === provider ? existing.secretKey : null,
      bucket: existing?.provider === provider ? existing.bucket : defaultBucket(provider),
      region: existing?.provider === provider ? existing.region : defaultRegion(provider),
      keyPrefix: normalizeKeyPrefix(existing?.provider === provider ? existing.keyPrefix ?? defaultKeyPrefix(provider) : defaultKeyPrefix(provider))
    });
    return getStorageConfig();
  }

  const parsed = resolveConfigForSave(input, existing);
  if (parsed.provider === "cos") {
    await new CosAssetStorageAdapter(parsed.config).testConfig();
  } else {
    await new OssAssetStorageAdapter(parsed.config).testConfig();
  }

  await saveStorageConfigRow({
    provider: parsed.provider,
    enabled: true,
    secretId: parsed.provider === "cos" ? parsed.config.secretId : parsed.config.accessKeyId,
    secretKey: parsed.provider === "cos" ? parsed.config.secretKey : parsed.config.accessKeySecret,
    bucket: parsed.config.bucket,
    region: parsed.config.region,
    keyPrefix: parsed.config.keyPrefix
  });

  return getStorageConfig();
}

export async function testStorageConfig(_tenant: RequestTenant | undefined, input: SaveStorageConfigRequest): Promise<StorageTestResult> {
  try {
    const parsed = resolveConfigForSave(input, await getStorageConfigRow());
    if (parsed.provider === "cos") {
      await new CosAssetStorageAdapter(parsed.config).testConfig();
    } else {
      await new OssAssetStorageAdapter(parsed.config).testConfig();
    }
    return {
      ok: true,
      message: `${storageProviderLabel(parsed.provider)} configuration is available.`
    };
  } catch (error) {
    return {
      ok: false,
      message: storageErrorMessage(error)
    };
  }
}

async function getStorageConfigRow(): Promise<StoredStorageConfig | undefined> {
  const [row] = await db.select().from(systemSettings).where(eq(systemSettings.key, STORAGE_SETTINGS_KEY)).limit(1);
  if (!row) {
    return undefined;
  }
  try {
    return normalizeStoredStorageConfig(JSON.parse(row.valueJson));
  } catch {
    return undefined;
  }
}

async function saveStorageConfigRow(row: StoredStorageConfig): Promise<void> {
  const now = new Date().toISOString();
  await db.insert(systemSettings)
    .values({
      key: STORAGE_SETTINGS_KEY,
      valueJson: JSON.stringify(row),
      createdAt: now,
      updatedAt: now
    })
    .onDuplicateKeyUpdate({
      set: {
        valueJson: JSON.stringify(row),
        updatedAt: now
      }
    });
}

function resolveConfigForSave(
  input: SaveStorageConfigRequest,
  existing: StoredStorageConfig | undefined
): { provider: "cos"; config: CosStorageAdapterConfig } | { provider: "oss"; config: OssStorageAdapterConfig } {
  if (input.provider === "oss") {
    return {
      provider: "oss",
      config: resolveOssConfigForSave(input, existing)
    };
  }

  return {
    provider: "cos",
    config: resolveCosConfigForSave(input, existing)
  };
}

function resolveCosConfigForSave(input: SaveStorageConfigRequest, existing: StoredStorageConfig | undefined): CosStorageAdapterConfig {
  const cos = input.cos;
  if (!cos) {
    throw new Error("COS configuration is required.");
  }

  const secretId = requiredString(cos.secretId, "COS SecretId");
  const secretKey = cos.preserveSecret && existing?.provider === "cos" ? existing.secretKey : cos.secretKey;
  const bucket = requiredString(normalizeAsciiDashes(cos.bucket), "COS bucket");
  const region = requiredString(normalizeAsciiDashes(cos.region), "COS region");

  if (!secretKey?.trim()) {
    throw new Error("COS SecretKey is required.");
  }

  return {
    secretId,
    secretKey: secretKey.trim(),
    bucket,
    region,
    keyPrefix: normalizeKeyPrefix(cos.keyPrefix)
  };
}

function resolveOssConfigForSave(input: SaveStorageConfigRequest, existing: StoredStorageConfig | undefined): OssStorageAdapterConfig {
  const oss = input.oss;
  if (!oss) {
    throw new Error("OSS configuration is required.");
  }

  const accessKeyId = requiredString(oss.accessKeyId, "OSS AccessKey ID");
  const accessKeySecret = oss.preserveSecret && existing?.provider === "oss" ? existing.secretKey : oss.accessKeySecret;
  const bucket = requiredString(normalizeAsciiDashes(oss.bucket), "OSS bucket");
  const region = requiredString(normalizeAsciiDashes(oss.region), "OSS region");

  if (!accessKeySecret?.trim()) {
    throw new Error("OSS AccessKey Secret is required.");
  }
  validateOssBucketName(bucket);

  return {
    accessKeyId,
    accessKeySecret: accessKeySecret.trim(),
    bucket,
    region,
    keyPrefix: normalizeKeyPrefix(oss.keyPrefix)
  };
}

function requiredString(value: string | undefined, label: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`${label} is required.`);
  }

  return trimmed;
}

function normalizeAsciiDashes(value: string | undefined): string | undefined {
  return value?.replace(/[‐‑‒–—―−]/gu, "-");
}

function validateOssBucketName(bucket: string): void {
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/u.test(bucket)) {
    throw new Error("OSS bucket 名称只能包含小写字母、数字和半角短横线 -，且必须与控制台里的存储空间名称完全一致。");
  }
}

function toStorageConfigResponse(row: StoredStorageConfig | undefined): StorageConfigResponse {
  const isCos = row?.provider === "cos";
  const isOss = !row || row.provider === "oss";

  return {
    enabled: row?.enabled === true,
    provider: isOss ? "oss" : "cos",
    cos: {
      secretId: isCos ? row?.secretId ?? "" : "",
      secretKey: {
        hasSecret: Boolean(isCos && row?.secretKey),
        value: isCos && row?.secretKey ? maskSecret(row.secretKey) : undefined
      },
      bucket: isCos ? row?.bucket ?? DEFAULT_COS_BUCKET : DEFAULT_COS_BUCKET,
      region: isCos ? row?.region ?? DEFAULT_COS_REGION : DEFAULT_COS_REGION,
      keyPrefix: normalizeKeyPrefix(isCos ? row?.keyPrefix ?? DEFAULT_COS_KEY_PREFIX : DEFAULT_COS_KEY_PREFIX)
    },
    oss: {
      accessKeyId: isOss ? row?.secretId ?? "" : "",
      accessKeySecret: {
        hasSecret: Boolean(isOss && row?.secretKey),
        value: isOss && row?.secretKey ? maskSecret(row.secretKey) : undefined
      },
      bucket: isOss ? row?.bucket ?? DEFAULT_OSS_BUCKET : DEFAULT_OSS_BUCKET,
      region: isOss ? row?.region ?? DEFAULT_OSS_REGION : DEFAULT_OSS_REGION,
      keyPrefix: normalizeKeyPrefix(isOss ? row?.keyPrefix ?? DEFAULT_OSS_KEY_PREFIX : DEFAULT_OSS_KEY_PREFIX)
    }
  };
}

function defaultBucket(provider: "cos" | "oss"): string {
  return provider === "cos" ? DEFAULT_COS_BUCKET : DEFAULT_OSS_BUCKET;
}

function defaultRegion(provider: "cos" | "oss"): string {
  return provider === "cos" ? DEFAULT_COS_REGION : DEFAULT_OSS_REGION;
}

function defaultKeyPrefix(provider: "cos" | "oss"): string {
  return provider === "cos" ? DEFAULT_COS_KEY_PREFIX : DEFAULT_OSS_KEY_PREFIX;
}

function storageProviderLabel(provider: "cos" | "oss"): string {
  return provider === "cos" ? "COS" : "OSS";
}

function normalizeStoredStorageConfig(value: unknown): StoredStorageConfig | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const provider = value.provider === "cos" ? "cos" : "oss";
  return {
    provider,
    enabled: value.enabled === true,
    secretId: typeof value.secretId === "string" ? value.secretId : null,
    secretKey: typeof value.secretKey === "string" ? value.secretKey : null,
    bucket: typeof value.bucket === "string" ? value.bucket : null,
    region: typeof value.region === "string" ? value.region : null,
    keyPrefix: typeof value.keyPrefix === "string" ? value.keyPrefix : null
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getRuntimeStorageConfigFromEnv():
  | { provider: "cos"; config: CosStorageAdapterConfig }
  | { provider: "oss"; config: OssStorageAdapterConfig }
  | undefined {
  const ossAccessKeyId = process.env.OSS_ACCESS_KEY_ID?.trim();
  const ossAccessKeySecret = process.env.OSS_ACCESS_KEY_SECRET?.trim();
  const ossBucket = process.env.OSS_DEFAULT_BUCKET?.trim();
  const ossRegion = process.env.OSS_DEFAULT_REGION?.trim();
  if (ossAccessKeyId && ossAccessKeySecret && ossBucket && ossRegion) {
    return {
      provider: "oss",
      config: {
        accessKeyId: ossAccessKeyId,
        accessKeySecret: ossAccessKeySecret,
        bucket: ossBucket,
        region: ossRegion,
        keyPrefix: normalizeKeyPrefix(process.env.OSS_DEFAULT_KEY_PREFIX)
      }
    };
  }

  const cosSecretId = process.env.COS_SECRET_ID?.trim();
  const cosSecretKey = process.env.COS_SECRET_KEY?.trim();
  const cosBucket = process.env.COS_DEFAULT_BUCKET?.trim();
  const cosRegion = process.env.COS_DEFAULT_REGION?.trim();
  if (cosSecretId && cosSecretKey && cosBucket && cosRegion) {
    return {
      provider: "cos",
      config: {
        secretId: cosSecretId,
        secretKey: cosSecretKey,
        bucket: cosBucket,
        region: cosRegion,
        keyPrefix: normalizeKeyPrefix(process.env.COS_DEFAULT_KEY_PREFIX)
      }
    };
  }

  return undefined;
}

function maskSecret(value: string): string {
  if (value.length <= 8) {
    return "*".repeat(value.length);
  }

  return `${value.slice(0, 4)}${"*".repeat(Math.min(8, Math.max(4, value.length - 8)))}${value.slice(-4)}`;
}
