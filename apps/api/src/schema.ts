import { relations } from "drizzle-orm";
import { index, int, longtext, mysqlTable, text, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

const id = (name: string) => varchar(name, { length: 64 });
const isoDate = (name: string) => varchar(name, { length: 32 });
const shortText = (name: string, length = 255) => varchar(name, { length });

export const users = mysqlTable("users", {
  id: id("id").primaryKey(),
  email: shortText("email"),
  displayName: shortText("display_name").notNull(),
  createdAt: isoDate("created_at").notNull(),
  updatedAt: isoDate("updated_at").notNull()
});

export const workspaces = mysqlTable("workspaces", {
  id: id("id").primaryKey(),
  name: shortText("name").notNull(),
  ownerUserId: id("owner_user_id")
    .notNull()
    .references(() => users.id),
  createdAt: isoDate("created_at").notNull(),
  updatedAt: isoDate("updated_at").notNull()
});

export const workspaceMembers = mysqlTable(
  "workspace_members",
  {
    id: id("id").primaryKey(),
    workspaceId: id("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: id("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: shortText("role", 32).notNull(),
    createdAt: isoDate("created_at").notNull(),
    updatedAt: isoDate("updated_at").notNull()
  },
  (table) => ({
    workspaceUserIdx: uniqueIndex("workspace_members_workspace_user_idx").on(table.workspaceId, table.userId)
  })
);

export const products = mysqlTable(
  "products",
  {
    id: id("id").primaryKey(),
    workspaceId: id("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    createdByUserId: id("created_by_user_id")
      .notNull()
      .references(() => users.id),
    name: shortText("name").notNull(),
    snapshotJson: text("snapshot_json").notNull(),
    createdAt: isoDate("created_at").notNull(),
    updatedAt: isoDate("updated_at").notNull()
  },
  (table) => ({
    workspaceUpdatedAtIdx: index("products_workspace_updated_at_idx").on(table.workspaceId, table.updatedAt)
  })
);

// Backward-compatible export name for the project canvas API.
export const projects = products;

export const assets = mysqlTable(
  "assets",
  {
    id: id("id").primaryKey(),
    workspaceId: id("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    createdByUserId: id("created_by_user_id")
      .notNull()
      .references(() => users.id),
    fileName: shortText("file_name").notNull(),
    relativePath: shortText("relative_path", 512).notNull(),
    mimeType: shortText("mime_type", 128).notNull(),
    width: int("width").notNull(),
    height: int("height").notNull(),
    cloudProvider: shortText("cloud_provider", 32),
    cloudBucket: shortText("cloud_bucket"),
    cloudRegion: shortText("cloud_region", 64),
    cloudObjectKey: shortText("cloud_object_key", 512),
    cloudStatus: shortText("cloud_status", 32),
    cloudError: text("cloud_error"),
    cloudUploadedAt: isoDate("cloud_uploaded_at"),
    cloudEtag: shortText("cloud_etag"),
    cloudRequestId: shortText("cloud_request_id"),
    createdAt: isoDate("created_at").notNull()
  },
  (table) => ({
    workspaceCreatedAtIdx: index("assets_workspace_created_at_idx").on(table.workspaceId, table.createdAt)
  })
);

export const storageConfigs = mysqlTable(
  "storage_configs",
  {
    id: id("id").primaryKey(),
    workspaceId: id("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    provider: shortText("provider", 32).notNull(),
    enabled: int("enabled").notNull(),
    secretId: shortText("secret_id"),
    secretKey: text("secret_key"),
    bucket: shortText("bucket"),
    region: shortText("region", 64),
    keyPrefix: shortText("key_prefix", 512),
    createdAt: isoDate("created_at").notNull(),
    updatedAt: isoDate("updated_at").notNull()
  },
  (table) => ({
    workspaceProviderIdx: uniqueIndex("storage_configs_workspace_provider_idx").on(table.workspaceId, table.provider)
  })
);

export const generationRecords = mysqlTable(
  "generation_jobs",
  {
    id: id("id").primaryKey(),
    workspaceId: id("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    createdByUserId: id("created_by_user_id")
      .notNull()
      .references(() => users.id),
    productId: id("product_id").references(() => products.id, { onDelete: "set null" }),
    mode: shortText("mode", 32).notNull(),
    prompt: text("prompt").notNull(),
    effectivePrompt: text("effective_prompt").notNull(),
    presetId: shortText("preset_id", 64).notNull(),
    width: int("width").notNull(),
    height: int("height").notNull(),
    quality: shortText("quality", 32).notNull(),
    outputFormat: shortText("output_format", 32).notNull(),
    count: int("count").notNull(),
    status: shortText("status", 32).notNull(),
    error: text("error"),
    referenceAssetId: id("reference_asset_id").references(() => assets.id, { onDelete: "set null" }),
    createdAt: isoDate("created_at").notNull()
  },
  (table) => ({
    workspaceCreatedAtIdx: index("generation_jobs_workspace_created_at_idx").on(table.workspaceId, table.createdAt)
  })
);

export const generationOutputs = mysqlTable(
  "generation_outputs",
  {
    id: id("id").primaryKey(),
    workspaceId: id("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    generationId: id("generation_id")
      .notNull()
      .references(() => generationRecords.id, { onDelete: "cascade" }),
    status: shortText("status", 32).notNull(),
    assetId: id("asset_id").references(() => assets.id, { onDelete: "set null" }),
    error: text("error"),
    createdAt: isoDate("created_at").notNull()
  },
  (table) => ({
    workspaceCreatedAtIdx: index("generation_outputs_workspace_created_at_idx").on(table.workspaceId, table.createdAt),
    generationIdx: index("generation_outputs_generation_id_idx").on(table.generationId),
    assetIdx: index("generation_outputs_asset_id_idx").on(table.assetId)
  })
);

export const ecommerceBatchJobs = mysqlTable(
  "ecommerce_batch_jobs",
  {
    id: id("id").primaryKey(),
    workspaceId: id("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    createdByUserId: id("created_by_user_id")
      .notNull()
      .references(() => users.id),
    status: shortText("status", 32).notNull(),
    message: text("message").notNull(),
    productTitle: shortText("product_title", 512).notNull(),
    platform: shortText("platform", 64).notNull(),
    market: shortText("market", 64).notNull(),
    totalScenes: int("total_scenes").notNull(),
    completedScenes: int("completed_scenes").notNull(),
    succeededScenes: int("succeeded_scenes").notNull(),
    failedScenes: int("failed_scenes").notNull(),
    requestJson: longtext("request_json").notNull(),
    recordsJson: longtext("records_json").notNull(),
    createdAt: isoDate("created_at").notNull(),
    updatedAt: isoDate("updated_at").notNull(),
    completedAt: isoDate("completed_at")
  },
  (table) => ({
    workspaceCreatedAtIdx: index("ecommerce_batch_jobs_workspace_created_at_idx").on(table.workspaceId, table.createdAt),
    workspaceStatusIdx: index("ecommerce_batch_jobs_workspace_status_idx").on(table.workspaceId, table.status)
  })
);

export const generationRelations = relations(generationRecords, ({ many, one }) => ({
  outputs: many(generationOutputs),
  workspace: one(workspaces, {
    fields: [generationRecords.workspaceId],
    references: [workspaces.id]
  }),
  referenceAsset: one(assets, {
    fields: [generationRecords.referenceAssetId],
    references: [assets.id]
  })
}));

export const outputRelations = relations(generationOutputs, ({ one }) => ({
  generation: one(generationRecords, {
    fields: [generationOutputs.generationId],
    references: [generationRecords.id]
  }),
  asset: one(assets, {
    fields: [generationOutputs.assetId],
    references: [assets.id]
  })
}));
