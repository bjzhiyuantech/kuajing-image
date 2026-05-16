import { and, asc, desc, eq, inArray } from "drizzle-orm";
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
import { saveCanvasAsset } from "./image-generation.js";
import { assets, generationOutputs, generationRecords, projects, users } from "./schema.js";

export const DEFAULT_PROJECT_ID = "default";
const DEFAULT_PROJECT_NAME = "Default Project";
const PUBLIC_GALLERY_LIMIT = 60;
const PUBLIC_PREVIEW_WIDTHS = [512, 1024] as const;
const fallbackWarnings = new Set<string>();

interface ProjectSnapshotInput {
  name?: string;
  snapshotJson: string;
}

const DATA_IMAGE_SRC_PATTERN = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=]+)$/iu;

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
  const snapshot = await externalizeInlineImageAssets(tenant, parseSnapshot(input.snapshotJson));

  await db.update(projects)
    .set({
      name: input.name ?? current?.name ?? DEFAULT_PROJECT_NAME,
      snapshotJson: JSON.stringify(snapshot),
      updatedAt
    })
      .where(and(eq(projects.id, defaultProductId(tenant)), eq(projects.workspaceId, tenant.workspaceId)));

  return getProjectState(tenant);
}

export async function externalizeInlineImageAssets(tenant: RequestTenant, snapshot: unknown): Promise<unknown> {
  const assetCache = new Map<string, GeneratedAsset>();
  const result = await externalizeInlineImageValue(tenant, snapshot, assetCache, undefined);
  return result.changed ? result.value : snapshot;
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
    snapshot: await enrichSnapshotWithAssetCdn(tenant, parseSnapshot(project.snapshotJson)),
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

  const referenceAssetById = await loadGalleryReferenceAssets(
    rows.map(({ generation }) => generation.referenceAssetId ?? undefined),
    tenant
  );

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
        asset: generatedAsset,
        referenceAssetId: generation.referenceAssetId ?? undefined,
        referenceAsset: generation.referenceAssetId ? referenceAssetById.get(generation.referenceAssetId) : undefined
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

  const referenceAssetById = await loadGalleryReferenceAssets(
    rows.map(({ generation }) => generation.referenceAssetId ?? undefined)
  );

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
        publicGalleryEnabled: output.publicGalleryEnabled === 1,
        publicGallerySortOrder: output.publicGallerySortOrder,
        publicGalleryUpdatedAt: output.publicGalleryUpdatedAt ?? undefined,
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
        asset: generatedAsset,
        referenceAssetId: generation.referenceAssetId ?? undefined,
        referenceAsset: generation.referenceAssetId ? referenceAssetById.get(generation.referenceAssetId) : undefined
      }];
    })
  };
}

export async function getPublicGalleryImages(): Promise<GalleryResponse> {
  const rows = await db
    .select({
      output: generationOutputs,
      generation: generationRecords,
      asset: assets
    })
    .from(generationOutputs)
    .innerJoin(generationRecords, eq(generationOutputs.generationId, generationRecords.id))
    .innerJoin(assets, eq(generationOutputs.assetId, assets.id))
    .where(and(eq(generationOutputs.status, "succeeded"), eq(generationOutputs.publicGalleryEnabled, 1)))
    .orderBy(asc(generationOutputs.publicGallerySortOrder), desc(generationOutputs.publicGalleryUpdatedAt), desc(generationOutputs.createdAt))
    .limit(PUBLIC_GALLERY_LIMIT);

  return {
    items: rows.flatMap(({ output, generation, asset }) => {
      const generatedAsset = toPublicGeneratedAsset(asset);
      if (!generatedAsset) {
        return [];
      }

      return [{
        outputId: output.id,
        generationId: generation.id,
        userDisplayName: "官方案例",
        publicGalleryEnabled: true,
        publicGallerySortOrder: output.publicGallerySortOrder,
        publicGalleryUpdatedAt: output.publicGalleryUpdatedAt ?? undefined,
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

export async function getPublicGalleryAssetTenant(assetId: string): Promise<RequestTenant | undefined> {
  if (!assetId.trim()) {
    return undefined;
  }

  const [row] = await db
    .select({
      workspaceId: assets.workspaceId,
      userId: assets.createdByUserId
    })
    .from(generationOutputs)
    .innerJoin(assets, eq(generationOutputs.assetId, assets.id))
    .where(and(eq(generationOutputs.assetId, assetId), eq(generationOutputs.status, "succeeded"), eq(generationOutputs.publicGalleryEnabled, 1)))
    .limit(1);

  return row
    ? {
        workspaceId: row.workspaceId,
        userId: row.userId
      }
    : undefined;
}

async function loadGalleryReferenceAssets(
  referenceAssetIds: Array<string | undefined>,
  tenant?: RequestTenant
): Promise<Map<string, GeneratedAsset>> {
  const uniqueReferenceAssetIds = Array.from(
    new Set(referenceAssetIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0))
  );

  if (uniqueReferenceAssetIds.length === 0) {
    return new Map();
  }

  const assetRows = await db
    .select()
    .from(assets)
    .where(
      tenant
        ? and(eq(assets.workspaceId, tenant.workspaceId), inArray(assets.id, uniqueReferenceAssetIds))
        : inArray(assets.id, uniqueReferenceAssetIds)
    );

  const referenceAssetById = new Map<string, GeneratedAsset>();
  for (const asset of assetRows) {
    const generatedAsset = toGeneratedAsset(asset);
    if (generatedAsset) {
      referenceAssetById.set(asset.id, generatedAsset);
    }
  }

  return referenceAssetById;
}

export async function updateAdminGalleryPublicStatus(
  outputId: string,
  input: { enabled: boolean; sortOrder?: number }
): Promise<GalleryImageItem | undefined> {
  const [existing] = await db
    .select({ id: generationOutputs.id, status: generationOutputs.status })
    .from(generationOutputs)
    .where(eq(generationOutputs.id, outputId))
    .limit(1);
  if (!existing || existing.status !== "succeeded") {
    return undefined;
  }

  await db
    .update(generationOutputs)
    .set({
      publicGalleryEnabled: input.enabled ? 1 : 0,
      publicGallerySortOrder: normalizePublicGallerySortOrder(input.sortOrder),
      publicGalleryUpdatedAt: input.enabled ? nowIso() : null
    })
    .where(eq(generationOutputs.id, outputId));

  return getAdminGalleryImage(outputId);
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
        referenceMaskDataUrl: record.referenceMaskDataUrl ?? undefined,
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

  const cdnUrl = buildAssetCdnUrl({ objectKey: asset.cloudObjectKey, provider: asset.cloudProvider, status: asset.cloudStatus });
  const isImage = asset.mimeType.startsWith("image/");
  return {
    id: asset.id,
    url: cdnUrl || `/api/assets/${asset.id}`,
    cdnUrl,
    cdnPreviewUrls: isImage ? buildAssetCdnPreviewUrls({ objectKey: asset.cloudObjectKey, provider: asset.cloudProvider, status: asset.cloudStatus }) : undefined,
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

function toPublicGeneratedAsset(asset: (typeof assets.$inferSelect) | undefined): GeneratedAsset | undefined {
  const generatedAsset = toGeneratedAsset(asset);
  if (!generatedAsset || !asset) {
    return undefined;
  }

  if (generatedAsset.cdnUrl) {
    return generatedAsset;
  }

  if (!asset.mimeType.startsWith("image/")) {
    return {
      ...generatedAsset,
      url: publicAssetUrl(asset.id),
      cdnPreviewUrls: undefined
    };
  }

  return {
    ...generatedAsset,
    url: publicAssetUrl(asset.id),
    cdnPreviewUrls: Object.fromEntries(PUBLIC_PREVIEW_WIDTHS.map((width) => [String(width), publicAssetPreviewUrl(asset.id, width)]))
  };
}

async function getAdminGalleryImage(outputId: string): Promise<GalleryImageItem | undefined> {
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
    .where(and(eq(generationOutputs.id, outputId), eq(generationOutputs.status, "succeeded")))
    .limit(1);

  if (rows.length === 0) {
    return undefined;
  }

  const referenceAssetById = await loadGalleryReferenceAssets([rows[0].generation.referenceAssetId ?? undefined]);

  return rows.flatMap(({ output, generation, asset, user }) => {
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
      publicGalleryEnabled: output.publicGalleryEnabled === 1,
      publicGallerySortOrder: output.publicGallerySortOrder,
      publicGalleryUpdatedAt: output.publicGalleryUpdatedAt ?? undefined,
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
      asset: generatedAsset,
      referenceAssetId: generation.referenceAssetId ?? undefined,
      referenceAsset: generation.referenceAssetId ? referenceAssetById.get(generation.referenceAssetId) : undefined
    }];
  })[0];
}

function publicAssetUrl(assetId: string): string {
  return `/api/public/assets/${encodeURIComponent(assetId)}`;
}

function publicAssetPreviewUrl(assetId: string, width: number): string {
  return `${publicAssetUrl(assetId)}/preview?width=${width}`;
}

function normalizePublicGallerySortOrder(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return 0;
  }
  return Math.min(value, 9999);
}

async function enrichSnapshotWithAssetCdn(tenant: RequestTenant, snapshot: unknown): Promise<unknown> {
  const store = getSnapshotStore(snapshot);
  if (!store) {
    return snapshot;
  }

  const localAssetIds = Array.from(
    new Set(
      Object.values(store)
        .filter(isAssetRecord)
        .map(getLocalAssetIdFromSnapshotRecord)
        .filter((value): value is string => Boolean(value))
    )
  );

  if (localAssetIds.length === 0) {
    return snapshot;
  }

  const assetRows = await db
    .select()
    .from(assets)
    .where(and(eq(assets.workspaceId, tenant.workspaceId), inArray(assets.id, localAssetIds)));
  const assetById = new Map(assetRows.map((asset) => [asset.id, asset]));

  let changed = false;
  const nextStore: Record<string, unknown> = { ...store };

  for (const [recordId, record] of Object.entries(store)) {
    if (!isAssetRecord(record)) {
      continue;
    }

    const assetId = getLocalAssetIdFromSnapshotRecord(record);
    if (!assetId) {
      continue;
    }

    const asset = assetById.get(assetId);
    if (!asset) {
      continue;
    }

    const generatedAsset = toGeneratedAsset(asset);
    if (!generatedAsset) {
      continue;
    }

    const nextMeta = createSnapshotAssetMeta(record.meta, generatedAsset);
    if (nextMeta !== record.meta) {
      nextStore[recordId] = {
        ...record,
        meta: nextMeta
      };
      changed = true;
    }
  }

  if (!changed) {
    return snapshot;
  }

  return replaceSnapshotStore(snapshot, nextStore);
}

function getSnapshotStore(snapshot: unknown): Record<string, unknown> | undefined {
  if (!isRecord(snapshot)) {
    return undefined;
  }

  if (isRecord(snapshot.document) && isRecord(snapshot.document.store)) {
    return snapshot.document.store;
  }

  if (isRecord(snapshot.store)) {
    return snapshot.store;
  }

  return undefined;
}

interface ExternalizeInlineImageResult {
  value: unknown;
  changed: boolean;
}

async function externalizeInlineImageValue(
  tenant: RequestTenant,
  value: unknown,
  assetCache: Map<string, GeneratedAsset>,
  recordId: string | undefined
): Promise<ExternalizeInlineImageResult> {
  if (typeof value === "string") {
    const asset = await externalizeInlineImageDataUrl(tenant, value, assetCache, recordId);
    if (!asset) {
      return { value, changed: false };
    }

    return { value: asset.url, changed: true };
  }

  if (Array.isArray(value)) {
    let changed = false;
    const next: unknown[] = [];

    for (let index = 0; index < value.length; index += 1) {
      const result = await externalizeInlineImageValue(tenant, value[index], assetCache, `${recordId ?? "item"}_${index}`);
      next.push(result.value);
      changed ||= result.changed;
    }

    return changed ? { value: next, changed: true } : { value, changed: false };
  }

  if (!isRecord(value)) {
    return { value, changed: false };
  }

  if (isAssetRecord(value) && isRecord(value.props) && typeof value.props.src === "string") {
    const asset = await externalizeInlineImageDataUrl(tenant, value.props.src, assetCache, recordId);
    if (asset) {
      const nextProps = {
        ...value.props,
        src: asset.url,
        name: asset.fileName,
        mimeType: asset.mimeType,
        w: asset.width,
        h: asset.height
      };

      return {
        value: {
          ...value,
          props: nextProps,
          meta: createSnapshotAssetMeta(value.meta, asset)
        },
        changed: true
      };
    }
  }

  let changed = false;
  const next: Record<string, unknown> = {};

  for (const [key, child] of Object.entries(value)) {
    const result = await externalizeInlineImageValue(tenant, child, assetCache, key === "props" && isAssetRecord(value) ? recordId : recordId ?? key);
    next[key] = result.value;
    changed ||= result.changed;
  }

  return changed ? { value: next, changed: true } : { value, changed: false };
}

async function externalizeInlineImageDataUrl(
  tenant: RequestTenant,
  value: string,
  assetCache: Map<string, GeneratedAsset>,
  fileNameHint: string | undefined
): Promise<GeneratedAsset | undefined> {
  const match = DATA_IMAGE_SRC_PATTERN.exec(value);
  if (!match) {
    return undefined;
  }

  const cached = assetCache.get(value);
  if (cached) {
    return cached;
  }

  const bytes = Buffer.from(match[2], "base64");
  const asset = await saveCanvasAsset(tenant, {
    bytes,
    fileName: fileNameHint?.trim() ? fileNameHint : "inline-image.png",
    mimeType: match[1].toLowerCase(),
    width: 1,
    height: 1
  });
  assetCache.set(value, asset);
  return asset;
}

function replaceSnapshotStore(snapshot: unknown, store: Record<string, unknown>): unknown {
  if (isRecord(snapshot) && isRecord(snapshot.document) && isRecord(snapshot.document.store)) {
    return {
      ...(snapshot as Record<string, unknown>),
      document: {
        ...(snapshot.document as Record<string, unknown>),
        store
      }
    };
  }

  if (isRecord(snapshot)) {
    return {
      ...(snapshot as Record<string, unknown>),
      store
    };
  }

  return snapshot;
}

function isAssetRecord(value: unknown): value is { type: string; meta?: unknown; props?: unknown } {
  return isRecord(value) && value.type === "asset";
}

function numberFromRecord(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

function getLocalAssetIdFromSnapshotRecord(record: { props?: unknown; meta?: unknown }): string | undefined {
  if (isRecord(record.meta) && typeof record.meta.localAssetId === "string" && record.meta.localAssetId.trim()) {
    return record.meta.localAssetId.trim();
  }

  if (!isRecord(record.props) || typeof record.props.src !== "string") {
    return undefined;
  }

  try {
    const url = new URL(record.props.src, "http://localhost");
    const match = /^\/api\/assets\/([^/?#]+)(?:\/download)?$/u.exec(url.pathname);
    return match?.[1];
  } catch {
    return undefined;
  }
}

function createSnapshotAssetMeta(existingMeta: unknown, asset: GeneratedAsset): Record<string, string | Record<string, string>> {
  const meta: Record<string, string | Record<string, string>> = isRecord(existingMeta) ? { ...(existingMeta as Record<string, string | Record<string, string>>) } : {};
  meta.localAssetId = asset.id;
  meta.sourceUrl = asset.url;

  if (asset.cdnUrl) {
    meta.cdnUrl = asset.cdnUrl;
  }

  if (asset.cdnPreviewUrls && Object.keys(asset.cdnPreviewUrls).length > 0) {
    meta.cdnPreviewUrls = asset.cdnPreviewUrls;
  }

  return meta;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
