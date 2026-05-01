import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
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
import { storageConfigs } from "./schema.js";

const ACTIVE_STORAGE_CONFIG_ID = "active";
const DEFAULT_COS_BUCKET = process.env.COS_DEFAULT_BUCKET?.trim() || "source-1253253332";
const DEFAULT_COS_REGION = process.env.COS_DEFAULT_REGION?.trim() || "ap-nanjing";
const DEFAULT_COS_KEY_PREFIX = process.env.COS_DEFAULT_KEY_PREFIX?.trim() || "gpt-image-canvas/assets";
const DEFAULT_OSS_BUCKET = process.env.OSS_DEFAULT_BUCKET?.trim() || "";
const DEFAULT_OSS_REGION = process.env.OSS_DEFAULT_REGION?.trim() || "oss-cn-hangzhou";
const DEFAULT_OSS_KEY_PREFIX = process.env.OSS_DEFAULT_KEY_PREFIX?.trim() || "gpt-image-canvas/assets";

type StorageConfigRow = typeof storageConfigs.$inferSelect;

export async function getStorageConfig(tenant: RequestTenant): Promise<StorageConfigResponse> {
  return toStorageConfigResponse(await getStorageConfigRow(tenant));
}

export async function getActiveCosStorageConfig(tenant: RequestTenant): Promise<CosStorageAdapterConfig | undefined> {
  const row = await getStorageConfigRow(tenant);
  if (!row || row.enabled !== 1 || row.provider !== "cos" || !row.secretId || !row.secretKey || !row.bucket || !row.region) {
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
  tenant: RequestTenant
): Promise<
  | { provider: "cos"; config: CosStorageAdapterConfig }
  | { provider: "oss"; config: OssStorageAdapterConfig }
  | undefined
> {
  const row = await getStorageConfigRow(tenant);
  if (!row || row.enabled !== 1 || !row.secretId || !row.secretKey || !row.bucket || !row.region) {
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

export async function saveStorageConfig(tenant: RequestTenant, input: SaveStorageConfigRequest): Promise<StorageConfigResponse> {
  const now = new Date().toISOString();
  const existing = await getStorageConfigRow(tenant);

  if (!input.enabled) {
    const provider = input.provider === "oss" ? "oss" : "cos";
    await upsertStorageConfig({
      id: activeStorageConfigId(tenant),
      workspaceId: tenant.workspaceId,
      provider,
      enabled: 0,
      secretId: existing?.provider === provider ? existing.secretId : null,
      secretKey: existing?.provider === provider ? existing.secretKey : null,
      bucket: existing?.provider === provider ? existing.bucket : defaultBucket(provider),
      region: existing?.provider === provider ? existing.region : defaultRegion(provider),
      keyPrefix: normalizeKeyPrefix(existing?.provider === provider ? existing.keyPrefix ?? defaultKeyPrefix(provider) : defaultKeyPrefix(provider)),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    });
    return getStorageConfig(tenant);
  }

  const parsed = resolveConfigForSave(input, existing);
  if (parsed.provider === "cos") {
    await new CosAssetStorageAdapter(parsed.config).testConfig();
  } else {
    await new OssAssetStorageAdapter(parsed.config).testConfig();
  }

  await upsertStorageConfig({
    id: activeStorageConfigId(tenant),
    workspaceId: tenant.workspaceId,
    provider: parsed.provider,
    enabled: 1,
    secretId: parsed.provider === "cos" ? parsed.config.secretId : parsed.config.accessKeyId,
    secretKey: parsed.provider === "cos" ? parsed.config.secretKey : parsed.config.accessKeySecret,
    bucket: parsed.config.bucket,
    region: parsed.config.region,
    keyPrefix: parsed.config.keyPrefix,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  });

  return getStorageConfig(tenant);
}

export async function testStorageConfig(tenant: RequestTenant, input: SaveStorageConfigRequest): Promise<StorageTestResult> {
  try {
    const parsed = resolveConfigForSave(input, await getStorageConfigRow(tenant));
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

async function getStorageConfigRow(tenant: RequestTenant): Promise<StorageConfigRow | undefined> {
  const [row] = await db
    .select()
    .from(storageConfigs)
    .where(and(eq(storageConfigs.id, activeStorageConfigId(tenant)), eq(storageConfigs.workspaceId, tenant.workspaceId)))
    .limit(1);
  return row;
}

function activeStorageConfigId(tenant: RequestTenant): string {
  return createHash("sha256").update(`${tenant.workspaceId}:${ACTIVE_STORAGE_CONFIG_ID}`).digest("hex");
}

async function upsertStorageConfig(row: StorageConfigRow): Promise<void> {
  await db.insert(storageConfigs)
    .values(row)
    .onDuplicateKeyUpdate({
      set: {
        provider: row.provider,
        enabled: row.enabled,
        secretId: row.secretId,
        secretKey: row.secretKey,
        bucket: row.bucket,
        region: row.region,
        keyPrefix: row.keyPrefix,
        updatedAt: row.updatedAt
      }
    });
}

function resolveConfigForSave(
  input: SaveStorageConfigRequest,
  existing: StorageConfigRow | undefined
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

function resolveCosConfigForSave(input: SaveStorageConfigRequest, existing: StorageConfigRow | undefined): CosStorageAdapterConfig {
  const cos = input.cos;
  if (!cos) {
    throw new Error("COS configuration is required.");
  }

  const secretId = requiredString(cos.secretId, "COS SecretId");
  const secretKey = cos.preserveSecret && existing?.provider === "cos" ? existing.secretKey : cos.secretKey;
  const bucket = requiredString(cos.bucket, "COS bucket");
  const region = requiredString(cos.region, "COS region");

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

function resolveOssConfigForSave(input: SaveStorageConfigRequest, existing: StorageConfigRow | undefined): OssStorageAdapterConfig {
  const oss = input.oss;
  if (!oss) {
    throw new Error("OSS configuration is required.");
  }

  const accessKeyId = requiredString(oss.accessKeyId, "OSS AccessKey ID");
  const accessKeySecret = oss.preserveSecret && existing?.provider === "oss" ? existing.secretKey : oss.accessKeySecret;
  const bucket = requiredString(oss.bucket, "OSS bucket");
  const region = requiredString(oss.region, "OSS region");

  if (!accessKeySecret?.trim()) {
    throw new Error("OSS AccessKey Secret is required.");
  }

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

function toStorageConfigResponse(row: StorageConfigRow | undefined): StorageConfigResponse {
  const isCos = row?.provider === "cos";
  const isOss = !row || row.provider === "oss";

  return {
    enabled: row?.enabled === 1,
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

function maskSecret(value: string): string {
  if (value.length <= 8) {
    return "*".repeat(value.length);
  }

  return `${value.slice(0, 4)}${"*".repeat(Math.min(8, Math.max(4, value.length - 8)))}${value.slice(-4)}`;
}
