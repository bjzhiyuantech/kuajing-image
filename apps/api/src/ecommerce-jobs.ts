import { and, desc, eq, inArray } from "drizzle-orm";
import type { RequestTenant } from "./auth-context.js";
import { buildAssetCdnPreviewUrls, buildAssetCdnUrl } from "./asset-cdn.js";
import type {
  EcommerceCategoryKitPlanItem,
  EcommerceBatchReferenceImage,
  EcommerceBatchGenerateResponse,
  EcommerceJobListResponse,
  EcommerceJobSummary,
  EcommerceCategoryKitPreparationResponse,
  EcommerceMarket,
  EcommercePlatform,
  EcommerceProductBrief,
  EcommerceSceneTemplateId,
  EcommerceTextLanguage,
  EcommerceStatsResponse,
  GeneratedAsset,
  GenerationRecord,
  GenerationStatus,
  ImageQuality,
  ImageSize,
  OutputFormat,
  ReferenceImageInput,
  StylePresetId
} from "./contracts.js";
import { db } from "./database.js";
import { assets, ecommerceBatchJobs } from "./schema.js";

export type PersistedEcommerceBatchJobStatus = EcommerceBatchGenerateResponse["status"];

export interface PersistedEcommerceBatchRequest {
  product: EcommerceProductBrief;
  platform: EcommercePlatform;
  market: EcommerceMarket;
  textLanguage?: EcommerceTextLanguage;
  allowTextRecreation?: boolean;
  removeWatermarkAndLogo?: boolean;
  sceneTemplateIds: EcommerceSceneTemplateId[];
  categoryKitPlannerPending?: boolean;
  plannedImages?: EcommerceCategoryKitPlanItem[];
  categoryKit?: EcommerceCategoryKitPreparationResponse;
  sourcePageUrl?: string;
  size: ImageSize;
  stylePresetId: StylePresetId;
  quality: ImageQuality;
  outputFormat: OutputFormat;
  countPerScene: number;
  referenceImage?: ReferenceImageInput;
  referenceImages?: EcommerceBatchReferenceImage[];
  extraDirection?: string;
}

export interface CreateEcommerceBatchJobInput {
  jobId: string;
  tenant: RequestTenant;
  input: PersistedEcommerceBatchRequest;
  message: string;
  now: string;
}

export interface UpdateEcommerceBatchJobInput {
  status?: PersistedEcommerceBatchJobStatus;
  message?: string;
  productTitle?: string;
  totalScenes?: number;
  completedScenes?: number;
  records?: GenerationRecord[];
  input?: PersistedEcommerceBatchRequest;
  completedAt?: string;
}

export async function createEcommerceBatchJob(input: CreateEcommerceBatchJobInput): Promise<EcommerceBatchGenerateResponse> {
  const records: GenerationRecord[] = [];
  const totalScenes = getEcommerceBatchSceneCount(input.input);
  await db.insert(ecommerceBatchJobs).values({
    id: input.jobId,
    workspaceId: input.tenant.workspaceId,
    createdByUserId: input.tenant.userId,
    status: "pending",
    message: input.message,
    productTitle: input.input.product.title,
    platform: input.input.platform,
    market: input.input.market,
    totalScenes,
    completedScenes: 0,
    succeededScenes: 0,
    failedScenes: 0,
    requestJson: JSON.stringify(toStoredRequest(input.input)),
    recordsJson: JSON.stringify(records),
    createdAt: input.now,
    updatedAt: input.now,
    completedAt: null
  });

  return {
    jobId: input.jobId,
    status: "pending",
    message: input.message,
    totalScenes,
    completedScenes: 0,
    createdAt: input.now,
    updatedAt: input.now,
    records
  };
}

export function getEcommerceBatchSceneCount(input: PersistedEcommerceBatchRequest): number {
  if (input.referenceImages?.length) {
    return input.referenceImages.length;
  }
  return input.plannedImages?.length || input.sceneTemplateIds.length;
}

function toStoredRequest(input: PersistedEcommerceBatchRequest): Record<string, unknown> {
  const {
    referenceImage,
    referenceImages,
    categoryKit,
    ...rest
  } = input;
  return scrubInlineImageData({
    ...rest,
    referenceImage: referenceImage
      ? summarizeReferenceImage(referenceImage)
      : undefined,
    referenceImages: referenceImages?.map((item, index) => ({
      hasImage: true,
      referenceImage: summarizeReferenceImage(item.referenceImage),
      fileName: item.referenceImage.fileName,
      title: item.title,
      size: item.size,
      extraDirection: item.extraDirection,
      index
    })),
    categoryKit
  }) as Record<string, unknown>;
}

function summarizeReferenceImage(input: ReferenceImageInput): Record<string, unknown> {
  return {
    hasImage: true,
    fileName: input.fileName,
    mimeType: dataUrlMimeType(input.dataUrl),
    approxBytes: dataUrlApproxBytes(input.dataUrl),
    hasMask: Boolean(input.maskDataUrl),
    hasMaskedImage: Boolean(input.maskedDataUrl),
    hasAnnotatedImage: Boolean(input.annotatedDataUrl)
  };
}

function scrubInlineImageData(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(scrubInlineImageData);
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => {
      if (/dataUrl$/iu.test(key) && typeof item === "string") {
        return [key, { redacted: true, mimeType: dataUrlMimeType(item), approxBytes: dataUrlApproxBytes(item) }];
      }
      return [key, scrubInlineImageData(item)];
    })
  );
}

function dataUrlMimeType(value: string): string | undefined {
  const match = /^data:([^;,]+)[;,]/iu.exec(value);
  return match?.[1];
}

function dataUrlApproxBytes(value: string): number | undefined {
  const commaIndex = value.indexOf(",");
  if (commaIndex < 0) {
    return undefined;
  }
  return Math.round(((value.length - commaIndex - 1) * 3) / 4);
}

export async function updateEcommerceBatchJob(
  tenant: RequestTenant,
  jobId: string,
  patch: UpdateEcommerceBatchJobInput
): Promise<void> {
  const records = patch.records;
  const counts = records ? countRecords(records) : undefined;
  const update: Partial<typeof ecommerceBatchJobs.$inferInsert> = {
    updatedAt: new Date().toISOString()
  };

  if (patch.status) {
    update.status = patch.status;
  }
  if (patch.message) {
    update.message = patch.message;
  }
  if (patch.productTitle) {
    update.productTitle = patch.productTitle;
  }
  if (typeof patch.totalScenes === "number") {
    update.totalScenes = patch.totalScenes;
  }
  if (typeof patch.completedScenes === "number") {
    update.completedScenes = patch.completedScenes;
  }
  if (patch.input) {
    update.requestJson = JSON.stringify(toStoredRequest(patch.input));
  }
  if (records) {
    update.recordsJson = JSON.stringify(records);
    update.succeededScenes = counts?.succeeded ?? 0;
    update.failedScenes = counts?.failed ?? 0;
  }
  if (patch.completedAt) {
    update.completedAt = patch.completedAt;
  }

  await db
    .update(ecommerceBatchJobs)
    .set(update)
    .where(and(eq(ecommerceBatchJobs.id, jobId), eq(ecommerceBatchJobs.workspaceId, tenant.workspaceId)));
}

export async function getEcommerceBatchJob(
  tenant: RequestTenant,
  jobId: string
): Promise<EcommerceBatchGenerateResponse | undefined> {
  const [row] = await db
    .select()
    .from(ecommerceBatchJobs)
    .where(
      and(
        eq(ecommerceBatchJobs.id, jobId),
        eq(ecommerceBatchJobs.workspaceId, tenant.workspaceId),
        eq(ecommerceBatchJobs.createdByUserId, tenant.userId)
      )
    )
    .limit(1);

  return row ? toBatchJobResponse(tenant, row) : undefined;
}

export async function listEcommerceBatchJobs(tenant: RequestTenant, limit = 50): Promise<EcommerceJobListResponse> {
  const rows = await db
    .select()
    .from(ecommerceBatchJobs)
    .where(and(eq(ecommerceBatchJobs.workspaceId, tenant.workspaceId), eq(ecommerceBatchJobs.createdByUserId, tenant.userId)))
    .orderBy(desc(ecommerceBatchJobs.createdAt))
    .limit(Math.max(1, Math.min(limit, 100)));

  return {
    jobs: rows.map(toJobSummary)
  };
}

export async function getEcommerceStats(tenant: RequestTenant): Promise<EcommerceStatsResponse> {
  const rows = await db
    .select()
    .from(ecommerceBatchJobs)
    .where(and(eq(ecommerceBatchJobs.workspaceId, tenant.workspaceId), eq(ecommerceBatchJobs.createdByUserId, tenant.userId)))
    .limit(5000);

  const stats: EcommerceStatsResponse = {
    totalJobs: rows.length,
    pendingJobs: 0,
    runningJobs: 0,
    succeededJobs: 0,
    partialJobs: 0,
    failedJobs: 0,
    totalScenes: 0,
    completedScenes: 0,
    succeededScenes: 0,
    failedScenes: 0,
    generatedImages: 0
  };

  for (const row of rows) {
    if (row.status === "pending") stats.pendingJobs += 1;
    if (row.status === "running") stats.runningJobs += 1;
    if (row.status === "succeeded") stats.succeededJobs += 1;
    if (row.status === "partial") stats.partialJobs += 1;
    if (row.status === "failed") stats.failedJobs += 1;
    stats.totalScenes += row.totalScenes;
    stats.completedScenes += row.completedScenes;
    stats.succeededScenes += row.succeededScenes;
    stats.failedScenes += row.failedScenes;
    stats.generatedImages += countGeneratedImages(row.recordsJson);
  }

  return stats;
}

async function toBatchJobResponse(tenant: RequestTenant, row: typeof ecommerceBatchJobs.$inferSelect): Promise<EcommerceBatchGenerateResponse> {
  const records = await hydrateRecordAssetCdnFields(tenant, parseRecords(row.recordsJson));
  const storedRequest = parseStoredRequest(row.requestJson);
  return {
    jobId: row.id,
    status: row.status as PersistedEcommerceBatchJobStatus,
    message: row.message,
    totalScenes: row.totalScenes,
    completedScenes: row.completedScenes,
    categoryKitPreparation: storedRequest.categoryKit,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    completedAt: row.completedAt ?? undefined,
    records
  };
}

async function hydrateRecordAssetCdnFields(tenant: RequestTenant, records: GenerationRecord[]): Promise<GenerationRecord[]> {
  const assetIds = Array.from(
    new Set(
      records.flatMap((record) =>
        record.outputs.flatMap((output) => {
          const assetId = output.asset?.id;
          return assetId ? [assetId] : [];
        })
      )
    )
  );

  if (assetIds.length === 0) {
    return records;
  }

  const rows = await db
    .select()
    .from(assets)
    .where(and(eq(assets.workspaceId, tenant.workspaceId), inArray(assets.id, assetIds)));
  const assetById = new Map(rows.map((asset) => [asset.id, asset]));

  return records.map((record) => ({
    ...record,
    outputs: record.outputs.map((output) => {
      if (!output.asset) {
        return output;
      }

      const currentAsset = assetById.get(output.asset.id);
      if (!currentAsset) {
        return output;
      }

      return {
        ...output,
        asset: {
          ...output.asset,
          ...toCurrentAssetCdnFields(currentAsset)
        }
      };
    })
  }));
}

function toCurrentAssetCdnFields(asset: typeof assets.$inferSelect): Pick<GeneratedAsset, "cdnUrl" | "cdnPreviewUrls" | "cloud"> {
  return {
    cdnUrl: buildAssetCdnUrl({
      objectKey: asset.cloudObjectKey,
      provider: asset.cloudProvider,
      status: asset.cloudStatus
    }),
    cdnPreviewUrls: buildAssetCdnPreviewUrls({
      objectKey: asset.cloudObjectKey,
      provider: asset.cloudProvider,
      status: asset.cloudStatus
    }),
    cloud:
      (asset.cloudProvider === "cos" || asset.cloudProvider === "oss") && (asset.cloudStatus === "uploaded" || asset.cloudStatus === "failed")
        ? {
            provider: asset.cloudProvider,
            status: asset.cloudStatus,
            lastError: asset.cloudError ?? undefined,
            uploadedAt: asset.cloudUploadedAt ?? undefined
          }
        : undefined
  };
}

function toJobSummary(row: typeof ecommerceBatchJobs.$inferSelect): EcommerceJobSummary {
  return {
    jobId: row.id,
    status: row.status as PersistedEcommerceBatchJobStatus,
    message: row.message,
    productTitle: row.productTitle,
    platform: row.platform as EcommercePlatform,
    market: row.market as EcommerceMarket,
    totalScenes: row.totalScenes,
    completedScenes: row.completedScenes,
    succeededScenes: row.succeededScenes,
    failedScenes: row.failedScenes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    completedAt: row.completedAt ?? undefined,
    sourcePageUrl: parseStoredRequest(row.requestJson).sourcePageUrl
  };
}

function parseStoredRequest(requestJson: string): Partial<PersistedEcommerceBatchRequest> {
  try {
    const parsed = JSON.parse(requestJson) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Partial<PersistedEcommerceBatchRequest>) : {};
  } catch {
    return {};
  }
}

function parseRecords(recordsJson: string): GenerationRecord[] {
  try {
    const parsed = JSON.parse(recordsJson) as unknown;
    return Array.isArray(parsed) ? (parsed as GenerationRecord[]) : [];
  } catch {
    return [];
  }
}

function countGeneratedImages(recordsJson: string): number {
  return parseRecords(recordsJson).reduce(
    (total, record) => total + record.outputs.filter((output) => output.status === "succeeded" && output.asset).length,
    0
  );
}

function countRecords(records: GenerationRecord[]): { succeeded: number; failed: number } {
  let succeeded = 0;
  let failed = 0;

  for (const record of records) {
    if ((record.status as GenerationStatus) === "failed") {
      failed += 1;
    } else if (record.status === "succeeded" || record.status === "partial") {
      succeeded += 1;
    }
  }

  return { succeeded, failed };
}
