import { randomUUID } from "node:crypto";
import { isAbsolute, relative, resolve } from "node:path";
import { and, eq } from "drizzle-orm";
import sharp from "sharp";
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
  type ProviderImage,
  type ProviderResult
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
import { getEcommerceGenerationConcurrencyConfig, withEcommerceGenerationSlot } from "./ecommerce-generation-concurrency.js";
import { getActiveStorageConfig } from "./storage-config.js";

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
  assetBytes?: Buffer;
  cloudStorage?: AssetCloudStorageRecord;
  providerResult?: ProviderResult;
  error?: string;
}

interface SavedProviderImage {
  asset: GeneratedAsset;
  bytes: Buffer;
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
  createComparisonCollage?: boolean;
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
  referenceMaskDataUrl?: string;
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
  const taskConcurrency = await resolveTaskConcurrency();
  const outputs = await mapWithConcurrency(
    Array.from({ length: input.count }, (_, index) => index),
    taskConcurrency,
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
  const taskConcurrency = await resolveTaskConcurrency();
  const outputs = await mapWithConcurrency(
    Array.from({ length: input.count }, (_, index) => index),
    taskConcurrency,
    async () => editSingleOutput(tenant, input, provider, signal)
  );
  const persistedOutputs = billing?.createComparisonCollage
    ? await appendComparisonCollageOutputs(tenant, input, outputs, signal)
    : outputs;

  const record = await saveGenerationRecord(
    tenant,
    {
      ...input,
      mode: "edit",
      referenceMaskDataUrl: input.referenceImage.maskDataUrl
    },
    persistedOutputs
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
    return {
      file,
      bytes
    };
  }
}

export async function saveCanvasAsset(
  tenant: RequestTenant,
  input: {
    bytes: Buffer;
    fileName: string;
    mimeType: string;
    width: number;
    height: number;
  }
): Promise<GeneratedAsset> {
  const assetId = randomUUID();
  const fileName = normalizeAssetFileName(input.fileName, input.mimeType, assetId);
  const relativePath = `assets/${fileName}`;
  const filePath = resolve(runtimePaths.dataDir, relativePath);
  const createdAt = new Date().toISOString();
  const cloudStorage = await saveAssetToConfiguredCloud(tenant, {
    fileName,
    bytes: input.bytes,
    mimeType: input.mimeType,
    createdAt
  });

  if (!cloudStorage || cloudStorage.status !== "uploaded") {
    await localAssetStorage.putObject({ filePath, bytes: input.bytes });
  }

  await db.insert(assets)
    .values({
      id: assetId,
      workspaceId: tenant.workspaceId,
      createdByUserId: tenant.userId,
      fileName,
      relativePath,
      mimeType: input.mimeType,
      width: input.width,
      height: input.height,
      cloudProvider: cloudStorage?.provider ?? null,
      cloudBucket: cloudStorage?.bucket ?? null,
      cloudRegion: cloudStorage?.region ?? null,
      cloudObjectKey: cloudStorage?.objectKey ?? null,
      cloudStatus: cloudStorage?.status ?? null,
      cloudError: cloudStorage?.error ?? null,
      cloudUploadedAt: cloudStorage?.uploadedAt ?? null,
      cloudEtag: cloudStorage?.etag ?? null,
      cloudRequestId: cloudStorage?.requestId ?? null,
      createdAt
    });

  const cdnUrl = buildAssetCdnUrl(cloudStorage);

  return {
    id: assetId,
    url: cdnUrl || `/api/assets/${assetId}`,
    cdnUrl,
    cdnPreviewUrls: buildAssetCdnPreviewUrls(cloudStorage),
    fileName,
    mimeType: input.mimeType,
    width: input.width,
    height: input.height,
    cloud: toGeneratedAssetCloud(cloudStorage)
  };
}

async function generateSingleOutput(
  tenant: RequestTenant,
  input: ImageProviderInput,
  provider: ImageProvider,
  signal?: AbortSignal
): Promise<BatchOutputResult> {
  return withEcommerceGenerationSlot(async () => {
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
        assetBytes: saved.bytes,
        cloudStorage: saved.cloudStorage,
        providerResult: result
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
  }, signal);
}

function createFallbackImageProvider(configs: ImageModelConfigEntry[]): ImageProvider {
  if (configs.length === 0) {
    throw new ProviderError("missing_api_key", "未配置可用的图像模型，请在后台模型管理中添加 API Key。", 500);
  }

  const providers = configs.map((config) => ({
    label: `${config.name} (${config.model})`,
    config,
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
  providers: Array<{ label: string; config: ImageModelConfigEntry; provider: ImageProvider }>,
  run: (provider: ImageProvider) => Promise<T>
): Promise<T> {
  const errors: string[] = [];
  for (const item of providers) {
    try {
      const result = await run(item.provider);
      if (isProviderResult(result)) {
        return {
          ...result,
          modelConfigId: item.config.id,
          modelProvider: item.config.provider,
          modelDisplayName: item.config.name
        } as T;
      }
      return result;
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
      errors.push(`${item.label}: ${errorToMessage(error)}`);
    }
  }

  throw new ProviderError("upstream_failure", `所有图像模型均生成失败。${errors.join("；")}`, 502);
}

function isProviderResult(value: unknown): value is ProviderResult {
  return typeof value === "object" && value !== null && Array.isArray((value as ProviderResult).images);
}

async function editSingleOutput(
  tenant: RequestTenant,
  input: EditImageProviderInput,
  provider: ImageProvider,
  signal?: AbortSignal
): Promise<BatchOutputResult> {
  return withEcommerceGenerationSlot(async () => {
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
        assetBytes: saved.bytes,
        cloudStorage: saved.cloudStorage,
        providerResult: result
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
  }, signal);
}

async function saveProviderImage(
  tenant: RequestTenant,
  image: ProviderImage,
  input: ImageProviderInput,
  _signal?: AbortSignal
): Promise<SavedProviderImage> {
  const assetId = randomUUID();
  const fileName = `${assetId}.${input.outputFormat === "jpeg" ? "jpg" : input.outputFormat}`;
  const mimeType = mimeTypes[input.outputFormat];
  const bytes = Buffer.from(image.b64Json, "base64");
  return saveGeneratedAssetBytes(tenant, {
    bytes,
    fileName,
    mimeType,
    width: input.size.width,
    height: input.size.height
  });
}

async function resolveTaskConcurrency(): Promise<number> {
  const concurrency = await getEcommerceGenerationConcurrencyConfig();
  return Math.max(1, concurrency.jobConcurrency);
}

async function saveGeneratedAssetBytes(
  tenant: RequestTenant,
  input: {
    bytes: Buffer;
    fileName: string;
    mimeType: string;
    width: number;
    height: number;
  }
): Promise<SavedProviderImage> {
  const relativePath = `assets/${input.fileName}`;
  const filePath = resolve(runtimePaths.dataDir, relativePath);
  const createdAt = new Date().toISOString();
  const cloudStorage = await saveAssetToConfiguredCloud(tenant, {
    fileName: input.fileName,
    bytes: input.bytes,
    mimeType: input.mimeType,
    createdAt
  });

  if (!cloudStorage || cloudStorage.status !== "uploaded") {
    await localAssetStorage.putObject({ filePath, bytes: input.bytes });
  }

  const cdnUrl = buildAssetCdnUrl(cloudStorage);

  return {
    asset: {
      id: input.fileName.replace(/\.[^.]+$/u, ""),
      url: cdnUrl || `/api/assets/${input.fileName.replace(/\.[^.]+$/u, "")}`,
      cdnUrl,
      cdnPreviewUrls: buildAssetCdnPreviewUrls(cloudStorage),
      fileName: input.fileName,
      mimeType: input.mimeType,
      width: input.width,
      height: input.height,
      cloud: toGeneratedAssetCloud(cloudStorage)
    },
    bytes: input.bytes,
    cloudStorage
  };
}

async function appendComparisonCollageOutputs(
  tenant: RequestTenant,
  input: EditImageProviderInput,
  outputs: BatchOutputResult[],
  signal?: AbortSignal
): Promise<BatchOutputResult[]> {
  const nextOutputs = [...outputs];
  for (const output of outputs) {
    throwIfAborted(signal);
    if (output.status !== "succeeded" || !output.asset || !output.assetBytes) {
      continue;
    }

    try {
      nextOutputs.push(await createComparisonCollageOutput(tenant, input, {
        ...output,
        asset: output.asset,
        assetBytes: output.assetBytes
      }));
    } catch {
      // The collage is an optional operations asset; keep the generated image result intact if composition fails.
    }
  }
  return nextOutputs;
}

async function createComparisonCollageOutput(
  tenant: RequestTenant,
  input: EditImageProviderInput,
  output: BatchOutputResult & { asset: GeneratedAsset; assetBytes: Buffer }
): Promise<BatchOutputResult> {
  const referenceBytes = dataUrlToBuffer(input.referenceImage.dataUrl);
  const referenceMetadata = await sharp(referenceBytes).rotate().metadata();
  const generatedMetadata = await sharp(output.assetBytes).metadata();
  const panelWidth = clampDimension(input.size.width || generatedMetadata.width || referenceMetadata.width || 1024);
  const panelHeight = clampDimension(input.size.height || generatedMetadata.height || referenceMetadata.height || 1024);
  const padding = Math.max(28, Math.round(panelWidth * 0.035));
  const gap = Math.max(24, Math.round(panelWidth * 0.04));
  const labelHeight = Math.max(74, Math.round(panelHeight * 0.08));
  const totalWidth = panelWidth * 2 + gap + padding * 2;
  const totalHeight = labelHeight + panelHeight + padding;
  const beforeLeft = padding;
  const afterLeft = padding + panelWidth + gap;
  const panelTop = labelHeight;
  const beforeImage = await sharp(referenceBytes)
    .rotate()
    .resize(panelWidth, panelHeight, { fit: "contain", background: "#f8fafc" })
    .png()
    .toBuffer();
  const afterImage = await sharp(output.assetBytes)
    .resize(panelWidth, panelHeight, { fit: "contain", background: "#f8fafc" })
    .png()
    .toBuffer();
  const labelFontFamily = "Noto Sans CJK SC, Noto Sans SC, Source Han Sans SC, WenQuanYi Zen Hei, PingFang SC, Microsoft YaHei, Arial, sans-serif";
  const overlay = Buffer.from(
    `<svg width="${totalWidth}" height="${totalHeight}" viewBox="0 0 ${totalWidth} ${totalHeight}" xmlns="http://www.w3.org/2000/svg">
      <text x="${beforeLeft}" y="${Math.round(labelHeight * 0.58)}" fill="#0f172a" font-family="${labelFontFamily}" font-size="${Math.max(28, Math.round(labelHeight * 0.34))}" font-weight="800">原图</text>
      <text x="${afterLeft}" y="${Math.round(labelHeight * 0.58)}" fill="#0f172a" font-family="${labelFontFamily}" font-size="${Math.max(28, Math.round(labelHeight * 0.34))}" font-weight="800">生成图</text>
      <rect x="${beforeLeft + 0.5}" y="${panelTop + 0.5}" width="${panelWidth - 1}" height="${panelHeight - 1}" fill="none" stroke="#d8e2dc" stroke-width="1"/>
      <rect x="${afterLeft + 0.5}" y="${panelTop + 0.5}" width="${panelWidth - 1}" height="${panelHeight - 1}" fill="none" stroke="#d8e2dc" stroke-width="1"/>
    </svg>`
  );
  const bytes = await sharp({
    create: {
      width: totalWidth,
      height: totalHeight,
      channels: 4,
      background: "#ffffff"
    }
  })
    .composite([
      { input: beforeImage, left: beforeLeft, top: panelTop },
      { input: afterImage, left: afterLeft, top: panelTop },
      { input: overlay, left: 0, top: 0 }
    ])
    .png()
    .toBuffer();
  const assetId = randomUUID();
  const saved = await saveGeneratedAssetBytes(tenant, {
    bytes,
    fileName: `comparison-${assetId}.png`,
    mimeType: "image/png",
    width: totalWidth,
    height: totalHeight
  });

  return {
    id: randomUUID(),
    status: "succeeded",
    asset: saved.asset,
    assetBytes: saved.bytes,
    cloudStorage: saved.cloudStorage
  };
}

function dataUrlToBuffer(dataUrl: string): Buffer {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/su.exec(dataUrl);
  if (!match) {
    throw new Error("参考图格式不受支持。");
  }
  return match[2] ? Buffer.from(match[3], "base64") : Buffer.from(decodeURIComponent(match[3]));
}

function clampDimension(value: number): number {
  return Math.max(320, Math.min(1536, Math.round(value)));
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
  const providerResult = firstSuccessfulProviderResult(outputs);

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
      model: providerResult?.model ?? null,
      modelConfigId: providerResult?.modelConfigId ?? null,
      modelProvider: providerResult?.modelProvider ?? null,
      modelDisplayName: providerResult?.modelDisplayName ?? null,
      referenceAssetId: input.referenceAssetId ?? null,
      referenceMaskDataUrl: input.referenceMaskDataUrl ?? null,
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
    model: providerResult?.model,
    modelConfigId: providerResult?.modelConfigId,
    modelProvider: providerResult?.modelProvider,
    modelDisplayName: providerResult?.modelDisplayName,
    referenceAssetId: input.referenceAssetId,
    referenceMaskDataUrl: input.referenceMaskDataUrl,
    createdAt,
    outputs: outputs.map(toGenerationOutput)
  };
}

function firstSuccessfulProviderResult(outputs: BatchOutputResult[]): ProviderResult | undefined {
  return outputs.find((output) => output.status === "succeeded" && output.providerResult)?.providerResult;
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

function normalizeAssetFileName(fileName: string, mimeType: string, fallbackName: string): string {
  const sanitized = fileName.replace(/[^a-zA-Z0-9._-]/gu, "_").slice(0, 180);
  const baseName = sanitized || fallbackName;
  const prefix = sanitized ? `${fallbackName}-` : "";
  if (/\.[a-z0-9]{2,5}$/iu.test(baseName)) {
    return `${prefix}${baseName}`;
  }

  const extension = mimeType.split("/")[1]?.replace("jpeg", "jpg").replace(/[^a-z0-9]/giu, "") || "png";
  return `${prefix}${baseName}.${extension}`;
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
