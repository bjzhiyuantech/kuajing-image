import { and, desc, eq, inArray } from "drizzle-orm";
import type { ResultSetHeader } from "mysql2";
import type { RequestTenant } from "./auth-context.js";
import type {
  GeneratedAsset,
  GalleryImageItem,
  GalleryResponse,
  GenerationRecord as ApiGenerationRecord,
  GenerationStatus,
  ImageMode,
  ImageQuality,
  OutputFormat,
  OutputStatus,
  ProjectState
} from "./contracts.js";
import { buildAssetCdnPreviewUrls, buildAssetCdnUrl } from "./asset-cdn.js";
import { db } from "./database.js";
import { assets, generationOutputs, generationRecords, projects, users } from "./schema.js";

export const DEFAULT_PROJECT_ID = "default";
const DEFAULT_PROJECT_NAME = "Default Project";
const fallbackWarnings = new Set<string>();

interface ProjectSnapshotInput {
  name?: string;
  snapshotJson: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function parseSnapshot(snapshotJson: string): unknown | null {
  return JSON.parse(snapshotJson) as unknown;
}

function defaultProductId(tenant: RequestTenant): string {
  return `${tenant.workspaceId}:default`.slice(0, 64);
}

export async function ensureDefaultProject(tenant: RequestTenant): Promise<void> {
  const existing = await getDefaultProjectRow(tenant);

  if (existing) {
    return;
  }
  if (await defaultProjectRowExists(tenant)) {
    return;
  }

  const createdAt = nowIso();
  await db.insert(projects)
    .values({
      id: defaultProductId(tenant),
      workspaceId: tenant.workspaceId,
      createdByUserId: tenant.userId,
      name: DEFAULT_PROJECT_NAME,
      snapshotJson: "null",
      createdAt,
      updatedAt: createdAt
    });
}

export async function saveProjectSnapshot(tenant: RequestTenant, input: ProjectSnapshotInput): Promise<ProjectState> {
  await ensureDefaultProject(tenant);

  const updatedAt = nowIso();
  const current = await getDefaultProjectRow(tenant);

  await db.update(projects)
    .set({
      name: input.name ?? current?.name ?? DEFAULT_PROJECT_NAME,
      snapshotJson: input.snapshotJson,
      updatedAt
    })
      .where(and(eq(projects.id, defaultProductId(tenant)), eq(projects.workspaceId, tenant.workspaceId)));

  return getProjectState(tenant);
}

export async function getProjectState(tenant: RequestTenant): Promise<ProjectState> {
  await ensureDefaultProject(tenant);

  const project = await getDefaultProjectRow(tenant);

  if (!project) {
    return {
      id: DEFAULT_PROJECT_ID,
      name: DEFAULT_PROJECT_NAME,
      snapshot: null,
      history: await getGenerationHistory(tenant),
      updatedAt: nowIso()
    };
  }

  return {
    id: DEFAULT_PROJECT_ID,
    name: project.name,
    snapshot: parseSnapshot(project.snapshotJson),
    history: await getGenerationHistory(tenant),
    updatedAt: project.updatedAt
  };
}

export async function getGalleryImages(tenant: RequestTenant): Promise<GalleryResponse> {
  const rows = await db
    .select({
      output: generationOutputs,
      generation: generationRecords,
      asset: assets
    })
    .from(generationOutputs)
    .innerJoin(generationRecords, eq(generationOutputs.generationId, generationRecords.id))
    .innerJoin(assets, eq(generationOutputs.assetId, assets.id))
    .where(and(eq(generationOutputs.workspaceId, tenant.workspaceId), eq(generationOutputs.status, "succeeded")))
    .orderBy(desc(generationOutputs.createdAt));

  return {
    items: rows.flatMap(({ output, generation, asset }) => {
      const generatedAsset = toGeneratedAsset(asset);
      if (!generatedAsset) {
        return [];
      }

      return [{
        outputId: output.id,
        generationId: generation.id,
        mode: generation.mode as ImageMode,
        prompt: generation.prompt,
        effectivePrompt: generation.effectivePrompt,
        presetId: generation.presetId,
        size: {
          width: generation.width,
          height: generation.height
        },
        quality: generation.quality as ImageQuality,
        outputFormat: generation.outputFormat as OutputFormat,
        model: generation.model ?? undefined,
        modelConfigId: generation.modelConfigId ?? undefined,
        modelProvider: generation.modelProvider ?? undefined,
        modelDisplayName: generation.modelDisplayName ?? undefined,
        createdAt: output.createdAt,
        asset: generatedAsset
      }];
    })
  };
}

export async function getAdminGalleryImages(): Promise<GalleryResponse> {
  const rows = await db
    .select({
      output: generationOutputs,
      generation: generationRecords,
      asset: assets,
      user: users
    })
    .from(generationOutputs)
    .innerJoin(generationRecords, eq(generationOutputs.generationId, generationRecords.id))
    .innerJoin(assets, eq(generationOutputs.assetId, assets.id))
    .leftJoin(users, eq(users.id, generationRecords.createdByUserId))
    .where(eq(generationOutputs.status, "succeeded"))
    .orderBy(desc(generationOutputs.createdAt));

  return {
    items: rows.flatMap(({ output, generation, asset, user }) => {
      const generatedAsset = toGeneratedAsset(asset);
      if (!generatedAsset) {
        return [];
      }

      return [{
        outputId: output.id,
        generationId: generation.id,
        userId: generation.createdByUserId,
        userEmail: user?.email ?? undefined,
        userDisplayName: user?.displayName,
        workspaceId: output.workspaceId,
        mode: generation.mode as ImageMode,
        prompt: generation.prompt,
        effectivePrompt: generation.effectivePrompt,
        presetId: generation.presetId,
        size: {
          width: generation.width,
          height: generation.height
        },
        quality: generation.quality as ImageQuality,
        outputFormat: generation.outputFormat as OutputFormat,
        model: generation.model ?? undefined,
        modelConfigId: generation.modelConfigId ?? undefined,
        modelProvider: generation.modelProvider ?? undefined,
        modelDisplayName: generation.modelDisplayName ?? undefined,
        createdAt: output.createdAt,
        asset: generatedAsset
      }];
    })
  };
}

export async function deleteGalleryOutput(tenant: RequestTenant, outputId: string): Promise<boolean> {
  const result = await db
    .delete(generationOutputs)
    .where(and(eq(generationOutputs.id, outputId), eq(generationOutputs.workspaceId, tenant.workspaceId)));
  return affectedRows(result) > 0;
}

export async function deleteAdminGalleryOutput(outputId: string): Promise<boolean> {
  const result = await db
    .delete(generationOutputs)
    .where(eq(generationOutputs.id, outputId));
  return affectedRows(result) > 0;
}

async function getDefaultProjectRow(tenant: RequestTenant): Promise<(typeof projects.$inferSelect) | undefined> {
  try {
    const rows = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, defaultProductId(tenant)), eq(projects.workspaceId, tenant.workspaceId)))
      .limit(1);
    return rows[0];
  } catch (error) {
    warnOnce(
      "project-read-fallback",
      `Project row could not be read; returning a blank canvas fallback. ${formatErrorSummary(error)}`
    );
    return undefined;
  }
}

async function defaultProjectRowExists(tenant: RequestTenant): Promise<boolean> {
  try {
    const [row] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, defaultProductId(tenant)), eq(projects.workspaceId, tenant.workspaceId)))
      .limit(1);
    return Boolean(row);
  } catch {
    return true;
  }
}

async function getGenerationHistory(tenant: RequestTenant): Promise<ApiGenerationRecord[]> {
  try {
    return await readGenerationHistory(tenant);
  } catch (error) {
    warnOnce(
      "history-read-fallback",
      `Generation history could not be read; returning an empty history. ${formatErrorSummary(error)}`
    );
    return [];
  }
}

function warnOnce(key: string, message: string): void {
  if (fallbackWarnings.has(key)) {
    return;
  }

  fallbackWarnings.add(key);
  console.warn(message);
}

function formatErrorSummary(error: unknown): string {
  if (error instanceof Error) {
    const codeValue = (error as { code?: unknown }).code;
    const code = typeof codeValue === "string" ? `${codeValue}: ` : "";
    return `${code}${error.message}`;
  }

  return String(error);
}

async function readGenerationHistory(tenant: RequestTenant): Promise<ApiGenerationRecord[]> {
  const records = await db
    .select()
    .from(generationRecords)
    .where(eq(generationRecords.workspaceId, tenant.workspaceId))
    .orderBy(desc(generationRecords.createdAt))
    .limit(20);
  if (records.length === 0) {
    return [];
  }

  const generationIds = records.map((record) => record.id);
  const outputs = await db
    .select()
    .from(generationOutputs)
    .where(and(eq(generationOutputs.workspaceId, tenant.workspaceId), inArray(generationOutputs.generationId, generationIds)))
    .orderBy(generationOutputs.createdAt);

  const assetIds = outputs.flatMap((output) => (output.assetId ? [output.assetId] : []));
  const assetRows =
    assetIds.length > 0
      ? await db
          .select()
          .from(assets)
          .where(and(eq(assets.workspaceId, tenant.workspaceId), inArray(assets.id, assetIds)))
      : [];
  const assetById = new Map(assetRows.map((asset) => [asset.id, asset]));

  const outputsByGenerationId = new Map<string, typeof outputs>();
  for (const output of outputs) {
    const existing = outputsByGenerationId.get(output.generationId) ?? [];
    existing.push(output);
    outputsByGenerationId.set(output.generationId, existing);
  }

  return records.flatMap((record) => {
    const mappedOutputs = (outputsByGenerationId.get(record.id) ?? []).map((output) => ({
      id: output.id,
      status: output.status as OutputStatus,
      asset: output.assetId ? toGeneratedAsset(assetById.get(output.assetId)) : undefined,
      error: output.error ?? undefined
    }));

    if (mappedOutputs.length === 0) {
      return [];
    }

    return [
      {
        id: record.id,
        mode: record.mode as ImageMode,
        prompt: record.prompt,
        effectivePrompt: record.effectivePrompt,
        presetId: record.presetId,
        size: {
          width: record.width,
          height: record.height
        },
        quality: record.quality as ImageQuality,
        outputFormat: record.outputFormat as OutputFormat,
        count: record.count,
        status: record.status as GenerationStatus,
        error: record.error ?? undefined,
        model: record.model ?? undefined,
        modelConfigId: record.modelConfigId ?? undefined,
        modelProvider: record.modelProvider ?? undefined,
        modelDisplayName: record.modelDisplayName ?? undefined,
        referenceAssetId: record.referenceAssetId ?? undefined,
        createdAt: record.createdAt,
        outputs: mappedOutputs
      }
    ];
  });
}

function affectedRows(result: unknown): number {
  const raw = Array.isArray(result) ? result[0] : result;
  const affected = (raw as ResultSetHeader | undefined)?.affectedRows;
  return typeof affected === "number" ? affected : 0;
}

function toGeneratedAsset(asset: (typeof assets.$inferSelect) | undefined): GeneratedAsset | undefined {
  if (!asset) {
    return undefined;
  }

  return {
    id: asset.id,
    url: `/api/assets/${asset.id}`,
    cdnUrl: buildAssetCdnUrl({ objectKey: asset.cloudObjectKey, provider: asset.cloudProvider, status: asset.cloudStatus }),
    cdnPreviewUrls: buildAssetCdnPreviewUrls({ objectKey: asset.cloudObjectKey, provider: asset.cloudProvider, status: asset.cloudStatus }),
    fileName: asset.fileName,
    mimeType: asset.mimeType,
    width: asset.width,
    height: asset.height,
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
