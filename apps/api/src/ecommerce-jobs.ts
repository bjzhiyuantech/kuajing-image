import { and, desc, eq } from "drizzle-orm";
import type { RequestTenant } from "./auth-context.js";
import type {
  EcommerceBatchGenerateResponse,
  EcommerceJobListResponse,
  EcommerceJobSummary,
  EcommerceMarket,
  EcommercePlatform,
  EcommerceProductBrief,
  EcommerceSceneTemplateId,
  EcommerceTextLanguage,
  EcommerceStatsResponse,
  GenerationRecord,
  GenerationStatus,
  ImageQuality,
  ImageSize,
  OutputFormat,
  ReferenceImageInput,
  StylePresetId
} from "./contracts.js";
import { db } from "./database.js";
import { ecommerceBatchJobs } from "./schema.js";

export type PersistedEcommerceBatchJobStatus = EcommerceBatchGenerateResponse["status"];

export interface PersistedEcommerceBatchRequest {
  product: EcommerceProductBrief;
  platform: EcommercePlatform;
  market: EcommerceMarket;
  textLanguage?: EcommerceTextLanguage;
  sceneTemplateIds: EcommerceSceneTemplateId[];
  sourcePageUrl?: string;
  size: ImageSize;
  stylePresetId: StylePresetId;
  quality: ImageQuality;
  outputFormat: OutputFormat;
  countPerScene: number;
  referenceImage?: ReferenceImageInput;
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
  completedScenes?: number;
  records?: GenerationRecord[];
  completedAt?: string;
}

export async function createEcommerceBatchJob(input: CreateEcommerceBatchJobInput): Promise<EcommerceBatchGenerateResponse> {
  const records: GenerationRecord[] = [];
  await db.insert(ecommerceBatchJobs).values({
    id: input.jobId,
    workspaceId: input.tenant.workspaceId,
    createdByUserId: input.tenant.userId,
    status: "pending",
    message: input.message,
    productTitle: input.input.product.title,
    platform: input.input.platform,
    market: input.input.market,
    totalScenes: input.input.sceneTemplateIds.length,
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
    totalScenes: input.input.sceneTemplateIds.length,
    completedScenes: 0,
    createdAt: input.now,
    updatedAt: input.now,
    records
  };
}

function toStoredRequest(input: PersistedEcommerceBatchRequest): Record<string, unknown> {
  return {
    ...input,
    referenceImage: input.referenceImage
      ? {
          hasImage: true,
          fileName: input.referenceImage.fileName
        }
      : undefined
  };
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
  if (typeof patch.completedScenes === "number") {
    update.completedScenes = patch.completedScenes;
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

  return row ? toBatchJobResponse(row) : undefined;
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

function toBatchJobResponse(row: typeof ecommerceBatchJobs.$inferSelect): EcommerceBatchGenerateResponse {
  return {
    jobId: row.id,
    status: row.status as PersistedEcommerceBatchJobStatus,
    message: row.message,
    totalScenes: row.totalScenes,
    completedScenes: row.completedScenes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    completedAt: row.completedAt ?? undefined,
    records: parseRecords(row.recordsJson)
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
