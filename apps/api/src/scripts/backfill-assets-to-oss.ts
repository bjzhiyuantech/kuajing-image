import { access, readFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { resolve } from "node:path";
import { and, eq } from "drizzle-orm";
import { db, closeDatabase } from "../database.js";
import { assets, storageConfigs, workspaces } from "../schema.js";
import { runtimePaths } from "../runtime.js";
import { normalizeKeyPrefix, OssAssetStorageAdapter, storageErrorMessage } from "../asset-storage.js";
import { buildCloudObjectKey } from "../asset-storage.js";

type StorageRow = typeof storageConfigs.$inferSelect;
type WorkspaceRow = typeof workspaces.$inferSelect;
type OssConfig = {
  accessKeyId: string;
  accessKeySecret: string;
  bucket: string;
  region: string;
  keyPrefix: string;
};

interface WorkspaceStorage {
  workspace: WorkspaceRow;
  storage?: StorageRow;
}

async function main(): Promise<void> {
  const rows = (await db
    .select({
      workspace: workspaces
    })
    .from(workspaces)) as Array<{ workspace: WorkspaceRow }>;

  const storages = (await db
    .select()
    .from(storageConfigs)
    .where(and(eq(storageConfigs.enabled, 1), eq(storageConfigs.provider, "oss")))) as StorageRow[];
  const storageByWorkspaceId = new Map(storages.map((storage) => [storage.workspaceId, storage]));
  const fallbackStorage = storages[0];

  const workspaceStorages = rows.map(({ workspace }) => ({
    workspace,
    storage: storageByWorkspaceId.get(workspace.id)
  })) satisfies WorkspaceStorage[];
  if (workspaceStorages.length === 0) {
    console.log("No workspaces found.");
    return;
  }

  let scanned = 0;
  let uploaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const { workspace, storage } of workspaceStorages) {
    const config = resolveOssConfig(storage ?? fallbackStorage);

    if (!config.accessKeyId || !config.accessKeySecret || !config.bucket || !config.region) {
      console.log(`[${workspace.id}] skipped: incomplete OSS config`);
      continue;
    }

    const adapter = new OssAssetStorageAdapter({
      accessKeyId: config.accessKeyId,
      accessKeySecret: config.accessKeySecret,
      bucket: config.bucket,
      region: config.region,
      keyPrefix: config.keyPrefix
    });

    const assetRows = await db
      .select()
      .from(assets)
      .where(eq(assets.workspaceId, workspace.id));

    for (const asset of assetRows) {
      scanned += 1;
      const localFilePath = resolve(runtimePaths.dataDir, asset.relativePath);

      try {
        await access(localFilePath, fsConstants.R_OK);
      } catch {
        skipped += 1;
        continue;
      }

      if (asset.cloudStatus === "uploaded" && asset.cloudObjectKey) {
        skipped += 1;
        continue;
      }

      const createdAt = asset.createdAt ?? new Date().toISOString();
      const objectKey = buildCloudObjectKey(config.keyPrefix, asset.fileName, createdAt);
      const buffer = await readFile(localFilePath);

      try {
        const result = await adapter.putObject({
          key: objectKey,
          bytes: buffer,
          mimeType: asset.mimeType
        });

        await db
          .update(assets)
          .set({
            cloudProvider: "oss",
            cloudBucket: config.bucket,
            cloudRegion: config.region,
            cloudObjectKey: objectKey,
            cloudStatus: "uploaded",
            cloudError: null,
            cloudUploadedAt: new Date().toISOString(),
            cloudEtag: result.etag ?? null,
            cloudRequestId: result.requestId ?? null
          })
          .where(eq(assets.id, asset.id));

        uploaded += 1;
        console.log(`[${workspace.id}] uploaded ${asset.id} -> ${objectKey}`);
      } catch (error) {
        failed += 1;
        console.log(`[${workspace.id}] failed ${asset.id}: ${storageErrorMessage(error)}`);
      }
    }
  }

  console.log(`Done. scanned=${scanned} uploaded=${uploaded} skipped=${skipped} failed=${failed}`);
}

function resolveOssConfig(storage: StorageRow | undefined): OssConfig {
  return {
    accessKeyId: storage?.secretId?.trim() || process.env.OSS_ACCESS_KEY_ID?.trim() || "",
    accessKeySecret: storage?.secretKey?.trim() || process.env.OSS_ACCESS_KEY_SECRET?.trim() || "",
    bucket: storage?.bucket?.trim() || process.env.OSS_DEFAULT_BUCKET?.trim() || "",
    region: storage?.region?.trim() || process.env.OSS_DEFAULT_REGION?.trim() || "",
    keyPrefix: normalizeKeyPrefix(storage?.keyPrefix ?? process.env.OSS_DEFAULT_KEY_PREFIX)
  };
}

void main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
