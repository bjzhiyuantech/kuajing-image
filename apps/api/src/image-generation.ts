import { randomUUID } from "node:crypto";
import { isAbsolute, relative, resolve } from "node:path";
import { and, eq } from "drizzle-orm";
import type { RequestTenant } from "./auth-context.js";
import type {
  GeneratedAsset,
  GeneratedAssetCloudInfo,
  GenerationOutput,
  GenerationRecord,
  GenerationResponse,
  GenerationStatus,
  OutputFormat
} from "./contracts.js";
import { db } from "./database.js";
import {
  ProviderError,
  type EditImageProviderInput,
  type ImageProvider,
  type ImageProviderInput,
  type ProviderImage
} from "./image-provider.js";
import { createConfiguredImageProvider } from "./image-provider.js";
import type { ImageModelConfigEntry } from "./image-model-config.js";
import { buildAssetCdnPreviewUrls, buildAssetCdnUrl } from "./asset-cdn.js";
import {
  type CloudAssetLocation,
  CosAssetStorageAdapter,
  LocalAssetStorageAdapter,
  OssAssetStorageAdapter,
  buildCloudObjectKey,
  storageErrorMessage,
} from "./asset-storage.js";
import { runtimePaths } from "./runtime.js";
import { assets, generationOutputs, generationRecords } from "./schema.js";
import { attachGenerationToCharge, reserveGenerationCharge } from "./billing.js";
import { getActiveStorageConfig } from "./storage-config.js";

const BATCH_CONCURRENCY = 2;
const localAssetStorage = new LocalAssetStorageAdapter();

interface StoredAssetFile {
  id: string;
  fileName: string;
  filePath: string;
  mimeType: string;
  cloud?: CloudAssetLocation & { provider: "cos" | "oss" };
}

interface BatchOutputResult {
  id: string;
  status: "succeeded" | "failed";
  asset?: GeneratedAsset;
  cloudStorage?: AssetCloudStorageRecord;
  error?: string;
}

interface SavedProviderImage {
  asset: GeneratedAsset;
  cloudStorage?: AssetCloudStorageRecord;
}

export interface ReservedGenerationCharge {
  transactionId: string;
  quotaConsumed: number;
  amountCents: number;
}

export interface GenerationBillingOptions {
  charge?: ReservedGenerationCharge;
  skipCharge?: boolean;
}

interface AssetCloudStorageRecord {
  provider: "cos" | "oss";
  bucket: string;
  region: string;
  objectKey: string;
  status: "uploaded" | "failed";
  error?: string;
  uploadedAt?: string;
  etag?: string;
  requestId?: string;
}

type PersistedGenerationInput = ImageProviderInput & {
  mode: "generate" | "edit";
  referenceAssetId?: string;
};

const mimeTypes: Record<OutputFormat, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp"
};

export async function runTextToImageGeneration(
  tenant: RequestTenant,
  input: ImageProviderInput,
  provider: ImageProvider,
  signal?: AbortSignal,
  billing?: GenerationBillingOptions
): Promise<GenerationResponse> {
  const charge = billing?.charge ?? (billing?.skipCharge ? undefined : await reserveGenerationCharge({ tenant, imageCount: input.count }));
  const outputs = await mapWithConcurrency(
    Array.from({ length: input.count }, (_, index) => index),
    BATCH_CONCURRENCY,
    async () => generateSingleOutput(tenant, input, provider, signal)
  );

  const record = await saveGenerationRecord(
    tenant,
    {
      ...input,
      mode: "generate"
    },
    outputs
  );
  await attachGenerationToCharge(charge?.transactionId, record.id);

  return {
    record
  };
}

export async function runTextToImageGenerationWithFallback(
  tenant: RequestTenant,
  input: ImageProviderInput,
  providerConfigs: ImageModelConfigEntry[],
  signal?: AbortSignal,
  billing?: GenerationBillingOptions
): Promise<GenerationResponse> {
  return runTextToImageGeneration(tenant, input, createFallbackImageProvider(providerConfigs), signal, billing);
}

export async function runReferenceImageGeneration(
  tenant: RequestTenant,
  input: EditImageProviderInput,
  provider: ImageProvider,
  signal?: AbortSignal,
  billing?: GenerationBillingOptions
): Promise<GenerationResponse> {
  const charge = billing?.charge ?? (billing?.skipCharge ? undefined : await reserveGenerationCharge({ tenant, imageCount: input.count }));
  const outputs = await mapWithConcurrency(
    Array.from({ length: input.count }, (_, index) => index),
    BATCH_CONCURRENCY,
    async () => editSingleOutput(tenant, input, provider, signal)
  );

  const record = await saveGenerationRecord(
    tenant,
    {
      ...input,
      mode: "edit"
    },
    outputs
  );
  await attachGenerationToCharge(charge?.transactionId, record.id);

  return {
    record
  };
}

export async function runReferenceImageGenerationWithFallback(
  tenant: RequestTenant,
  input: EditImageProviderInput,
  providerConfigs: ImageModelConfigEntry[],
  signal?: AbortSignal,
  billing?: GenerationBillingOptions
): Promise<GenerationResponse> {
  return runReferenceImageGeneration(tenant, input, createFallbackImageProvider(providerConfigs), signal, billing);
}

export async function getStoredAssetFile(tenant: RequestTenant, assetId: string): Promise<StoredAssetFile | undefined> {
  const [asset] = await db
    .select()
    .from(assets)
    .where(and(eq(assets.id, assetId), eq(assets.workspaceId, tenant.workspaceId)))
    .limit(1);
  if (!asset) {
    return undefined;
  }

  const filePath = resolve(runtimePaths.dataDir, asset.relativePath);
  if (!isInsideDirectory(filePath, runtimePaths.assetsDir)) {
    return undefined;
  }

  return {
    id: asset.id,
    fileName: asset.fileName,
    filePath,
    mimeType: asset.mimeType,
    cloud: toCloudAssetLocation(asset)
  };
}

export async function readStoredAsset(
  tenant: RequestTenant,
  assetId: string
): Promise<{ file: StoredAssetFile; bytes: Buffer } | undefined> {
  const file = await getStoredAssetFile(tenant, assetId);
  if (!file) {
    return undefined;
  }

  try {
    return {
      file,
      bytes: await localAssetStorage.getObject({ filePath: file.filePath })
    };
  } catch {
    const bytes = await readCloudAsset(tenant, file.cloud);
    if (!bytes) {
      return undefined;
    }

    void localAssetStorage.putObject({ filePath: file.filePath, bytes }).catch(() => undefined);
    return {
      file,
      bytes
    };
  }
}

async function generateSingleOutput(
  tenant: RequestTenant,
  input: ImageProviderInput,
  provider: ImageProvider,
  signal?: AbortSignal
): Promise<BatchOutputResult> {
  const outputId = randomUUID();

  try {
    throwIfAborted(signal);
    const result = await provider.generate(
      {
        ...input,
        count: 1
      },
      signal
    );
    throwIfAborted(signal);

    const providerImage = result.images[0];
    if (!providerImage) {
      throw new ProviderError("unsupported_provider_behavior", "上游图像服务没有返回图像结果。", 502);
    }

    const saved = await saveProviderImage(tenant, providerImage, input, signal);

    return {
      id: outputId,
      status: "succeeded",
      asset: saved.asset,
      cloudStorage: saved.cloudStorage
    };
  } catch (error) {
    if (isAbortError(error) || signal?.aborted) {
      throw error;
    }

    return {
      id: outputId,
      status: "failed",
      error: errorToMessage(error)
    };
  }
}

function createFallbackImageProvider(configs: ImageModelConfigEntry[]): ImageProvider {
  if (configs.length === 0) {
    throw new ProviderError("missing_api_key", "未配置可用的图像模型，请在后台模型管理中添加 API Key。", 500);
  }

  const providers = configs.map((config) => ({
    label: `${config.name} (${config.model})`,
    provider: createConfiguredImageProvider(config)
  }));

  return {
    async generate(input, signal) {
      return runWithProviderFallback(providers, (provider) => provider.generate(input, signal));
    },
    async edit(input, signal) {
      return runWithProviderFallback(providers, (provider) => provider.edit(input, signal));
    }
  };
}

async function runWithProviderFallback<T>(
  providers: Array<{ label: string; provider: ImageProvider }>,
  run: (provider: ImageProvider) => Promise<T>
): Promise<T> {
  const errors: string[] = [];
  for (const item of providers) {
    try {
      return await run(item.provider);
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
      errors.push(`${item.label}: ${errorToMessage(error)}`);
    }
  }

  throw new ProviderError("upstream_failure", `所有图像模型均生成失败。${errors.join("；")}`, 502);
}

async function editSingleOutput(
  tenant: RequestTenant,
  input: EditImageProviderInput,
  provider: ImageProvider,
  signal?: AbortSignal
): Promise<BatchOutputResult> {
  const outputId = randomUUID();

  try {
    throwIfAborted(signal);
    const result = await provider.edit(
      {
        ...input,
        count: 1
      },
      signal
    );
    throwIfAborted(signal);

    const providerImage = result.images[0];
    if (!providerImage) {
      throw new ProviderError("unsupported_provider_behavior", "上游图像服务没有返回图像结果。", 502);
    }

    const saved = await saveProviderImage(tenant, providerImage, input, signal);

    return {
      id: outputId,
      status: "succeeded",
      asset: saved.asset,
      cloudStorage: saved.cloudStorage
    };
  } catch (error) {
    if (isAbortError(error) || signal?.aborted) {
      throw error;
    }

    return {
      id: outputId,
      status: "failed",
      error: errorToMessage(error)
    };
  }
}

async function saveProviderImage(
  tenant: RequestTenant,
  image: ProviderImage,
  input: ImageProviderInput,
  _signal?: AbortSignal
): Promise<SavedProviderImage> {
  const assetId = randomUUID();
  const fileName = `${assetId}.${input.outputFormat === "jpeg" ? "jpg" : input.outputFormat}`;
  const relativePath = `assets/${fileName}`;
  const filePath = resolve(runtimePaths.dataDir, relativePath);
  const mimeType = mimeTypes[input.outputFormat];
  const bytes = Buffer.from(image.b64Json, "base64");

  await localAssetStorage.putObject({ filePath, bytes });
  const cloudStorage = await saveAssetToConfiguredCloud(tenant, {
    fileName,
    bytes,
    mimeType,
    createdAt: new Date().toISOString()
  });

  return {
    asset: {
      id: assetId,
      url: `/api/assets/${assetId}`,
      cdnUrl: buildAssetCdnUrl(cloudStorage),
      cdnPreviewUrls: buildAssetCdnPreviewUrls(cloudStorage),
      fileName,
      mimeType,
      width: input.size.width,
      height: input.size.height,
      cloud: toGeneratedAssetCloud(cloudStorage)
    },
    cloudStorage
  };
}

async function saveGenerationRecord(
  tenant: RequestTenant,
  input: PersistedGenerationInput,
  outputs: BatchOutputResult[]
): Promise<GenerationRecord> {
  const createdAt = new Date().toISOString();
  const generationId = randomUUID();
  const successCount = outputs.filter((output) => output.status === "succeeded").length;
  const failureCount = outputs.length - successCount;
  const status = resolveGenerationStatus(successCount, failureCount);
  const error = failureCount > 0 ? `${failureCount} 张图像生成失败。` : undefined;

  await db.insert(generationRecords)
    .values({
      id: generationId,
      workspaceId: tenant.workspaceId,
      createdByUserId: tenant.userId,
      productId: null,
      mode: input.mode,
      prompt: input.originalPrompt,
      effectivePrompt: input.prompt,
      presetId: input.presetId,
      width: input.size.width,
      height: input.size.height,
      quality: input.quality,
      outputFormat: input.outputFormat,
      count: input.count,
      status,
      error,
      referenceAssetId: input.referenceAssetId ?? null,
      createdAt
    });

  for (const output of outputs) {
    if (output.asset) {
      await db.insert(assets)
        .values({
          id: output.asset.id,
          workspaceId: tenant.workspaceId,
          createdByUserId: tenant.userId,
          fileName: output.asset.fileName,
          relativePath: `assets/${output.asset.fileName}`,
          mimeType: output.asset.mimeType,
          width: output.asset.width,
          height: output.asset.height,
          cloudProvider: output.cloudStorage?.provider ?? null,
          cloudBucket: output.cloudStorage?.bucket ?? null,
          cloudRegion: output.cloudStorage?.region ?? null,
          cloudObjectKey: output.cloudStorage?.objectKey ?? null,
          cloudStatus: output.cloudStorage?.status ?? null,
          cloudError: output.cloudStorage?.error ?? null,
          cloudUploadedAt: output.cloudStorage?.uploadedAt ?? null,
          cloudEtag: output.cloudStorage?.etag ?? null,
          cloudRequestId: output.cloudStorage?.requestId ?? null,
          createdAt
        });
    }

    await db.insert(generationOutputs)
      .values({
        id: output.id,
        workspaceId: tenant.workspaceId,
        generationId,
        status: output.status,
        assetId: output.asset?.id ?? null,
        error: output.error ?? null,
        createdAt
      });
  }

  return {
    id: generationId,
    mode: input.mode,
    prompt: input.originalPrompt,
    effectivePrompt: input.prompt,
    presetId: input.presetId,
    size: input.size,
    quality: input.quality,
    outputFormat: input.outputFormat,
    count: input.count,
    status,
    error,
    referenceAssetId: input.referenceAssetId,
    createdAt,
    outputs: outputs.map(toGenerationOutput)
  };
}

function resolveGenerationStatus(successCount: number, failureCount: number): GenerationStatus {
  if (successCount > 0 && failureCount > 0) {
    return "partial";
  }
  if (successCount > 0) {
    return "succeeded";
  }
  return "failed";
}

function toGenerationOutput(output: BatchOutputResult): GenerationOutput {
  return {
    id: output.id,
    status: output.status,
    asset: output.asset,
    error: output.error
  };
}

async function saveAssetToConfiguredCloud(tenant: RequestTenant, input: {
  fileName: string;
  bytes: Buffer;
  mimeType: string;
  createdAt: string;
}): Promise<AssetCloudStorageRecord | undefined> {
  const activeStorage = await getActiveStorageConfig(tenant);
  if (!activeStorage) {
    return undefined;
  }

  const config = activeStorage.config;
  const objectKey = buildCloudObjectKey(config.keyPrefix, input.fileName, input.createdAt);
  const adapter =
    activeStorage.provider === "cos" ? new CosAssetStorageAdapter(activeStorage.config) : new OssAssetStorageAdapter(activeStorage.config);

  try {
    const result = await adapter.putObject({
      key: objectKey,
      bytes: input.bytes,
      mimeType: input.mimeType
    });

    return {
      provider: activeStorage.provider,
      bucket: config.bucket,
      region: config.region,
      objectKey,
      status: "uploaded",
      uploadedAt: new Date().toISOString(),
      etag: result.etag,
      requestId: result.requestId
    };
  } catch (error) {
    return {
      provider: activeStorage.provider,
      bucket: config.bucket,
      region: config.region,
      objectKey,
      status: "failed",
      error: storageErrorMessage(error)
    };
  }
}

async function readCloudAsset(tenant: RequestTenant, location: (CloudAssetLocation & { provider: "cos" | "oss" }) | undefined): Promise<Buffer | undefined> {
  const activeStorage = await getActiveStorageConfig(tenant);
  if (!location || !activeStorage || activeStorage.provider !== location.provider) {
    return undefined;
  }

  try {
    return activeStorage.provider === "cos"
      ? await new CosAssetStorageAdapter(activeStorage.config).getObject(location)
      : await new OssAssetStorageAdapter(activeStorage.config).getObject(location);
  } catch {
    return undefined;
  }
}

function toCloudAssetLocation(asset: typeof assets.$inferSelect): (CloudAssetLocation & { provider: "cos" | "oss" }) | undefined {
  if (
    (asset.cloudProvider !== "cos" && asset.cloudProvider !== "oss") ||
    asset.cloudStatus !== "uploaded" ||
    !asset.cloudBucket ||
    !asset.cloudRegion ||
    !asset.cloudObjectKey
  ) {
    return undefined;
  }

  return {
    provider: asset.cloudProvider,
    bucket: asset.cloudBucket,
    region: asset.cloudRegion,
    key: asset.cloudObjectKey
  };
}

function toGeneratedAssetCloud(cloudStorage: AssetCloudStorageRecord | undefined): GeneratedAssetCloudInfo | undefined {
  if (!cloudStorage) {
    return undefined;
  }

  return {
    provider: cloudStorage.provider,
    status: cloudStorage.status,
    lastError: cloudStorage.error,
    uploadedAt: cloudStorage.uploadedAt
  };
}

async function mapWithConcurrency<T, TResult>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<TResult>
): Promise<TResult[]> {
  const results = new Array<TResult>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

function errorToMessage(error: unknown): string {
  if (error instanceof ProviderError) {
    return error.message;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "图像生成失败，请重试。";
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new DOMException("The operation was aborted.", "AbortError");
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function isInsideDirectory(filePath: string, directory: string): boolean {
  const localPath = relative(directory, filePath);
  return Boolean(localPath) && !localPath.startsWith("..") && !isAbsolute(localPath);
}
