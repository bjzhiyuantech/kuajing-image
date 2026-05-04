import { relations } from "drizzle-orm";
import { bigint, index, int, longtext, mysqlTable, text, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

const id = (name: string) => varchar(name, { length: 64 });
const isoDate = (name: string) => varchar(name, { length: 32 });
const shortText = (name: string, length = 255) => varchar(name, { length });

export const users = mysqlTable(
  "users",
  {
    id: id("id").primaryKey(),
    email: shortText("email"),
    passwordHash: shortText("password_hash", 512).notNull(),
    displayName: shortText("display_name").notNull(),
    role: shortText("role", 32).notNull(),
    planId: id("plan_id"),
    planExpiresAt: isoDate("plan_expires_at"),
    quotaTotal: bigint("quota_total", { mode: "number" }).notNull(),
    quotaUsed: bigint("quota_used", { mode: "number" }).notNull(),
    balanceCents: bigint("balance_cents", { mode: "number" }).notNull(),
    referralBalanceCents: bigint("referral_balance_cents", { mode: "number" }).notNull(),
    inviteCode: shortText("invite_code", 64),
    inviterUserId: id("inviter_user_id"),
    storageQuotaBytes: bigint("storage_quota_bytes", { mode: "number" }).notNull(),
    storageUsedBytes: bigint("storage_used_bytes", { mode: "number" }).notNull(),
    currency: shortText("currency", 16).notNull(),
    createdAt: isoDate("created_at").notNull(),
    updatedAt: isoDate("updated_at").notNull()
  },
  (table) => ({
    emailIdx: uniqueIndex("users_email_unique_idx").on(table.email),
    inviteCodeIdx: uniqueIndex("users_invite_code_unique_idx").on(table.inviteCode),
    inviterIdx: index("users_inviter_user_id_idx").on(table.inviterUserId),
    planIdx: index("users_plan_id_idx").on(table.planId)
  })
);

export const wechatAccounts = mysqlTable(
  "wechat_accounts",
  {
    id: id("id").primaryKey(),
    userId: id("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: shortText("provider", 32).notNull(),
    openId: shortText("open_id", 255).notNull(),
    unionId: shortText("union_id", 255),
    nickname: shortText("nickname"),
    avatarUrl: text("avatar_url"),
    createdAt: isoDate("created_at").notNull(),
    updatedAt: isoDate("updated_at").notNull()
  },
  (table) => ({
    providerOpenIdIdx: uniqueIndex("wechat_accounts_provider_open_id_idx").on(table.provider, table.openId),
    providerUnionIdIdx: uniqueIndex("wechat_accounts_provider_union_id_idx").on(table.provider, table.unionId),
    userProviderIdx: uniqueIndex("wechat_accounts_user_provider_idx").on(table.userId, table.provider)
  })
);

export const systemSettings = mysqlTable("system_settings", {
  key: varchar("setting_key", { length: 128 }).primaryKey(),
  valueJson: longtext("value_json").notNull(),
  createdAt: isoDate("created_at").notNull(),
  updatedAt: isoDate("updated_at").notNull()
});

export const emailVerificationCodes = mysqlTable(
  "email_verification_codes",
  {
    id: id("id").primaryKey(),
    email: shortText("email").notNull(),
    purpose: shortText("purpose", 32).notNull(),
    codeHash: shortText("code_hash", 128).notNull(),
    expiresAt: isoDate("expires_at").notNull(),
    consumedAt: isoDate("consumed_at"),
    attemptCount: int("attempt_count").notNull(),
    sentAt: isoDate("sent_at").notNull(),
    createdAt: isoDate("created_at").notNull()
  },
  (table) => ({
    emailPurposeIdx: index("email_verification_codes_email_purpose_idx").on(table.email, table.purpose),
    expiresAtIdx: index("email_verification_codes_expires_at_idx").on(table.expiresAt)
  })
);

export const subscriptionPlans = mysqlTable(
  "subscription_plans",
  {
    id: id("id").primaryKey(),
    name: shortText("name").notNull(),
    description: text("description"),
    imageQuota: bigint("image_quota", { mode: "number" }).notNull(),
    storageQuotaBytes: bigint("storage_quota_bytes", { mode: "number" }).notNull(),
    priceCents: bigint("price_cents", { mode: "number" }).notNull(),
    currency: shortText("currency", 16).notNull(),
    enabled: int("enabled").notNull(),
    sortOrder: int("sort_order").notNull(),
    benefitsJson: longtext("benefits_json"),
    createdAt: isoDate("created_at").notNull(),
    updatedAt: isoDate("updated_at").notNull()
  },
  (table) => ({
    enabledSortIdx: index("subscription_plans_enabled_sort_idx").on(table.enabled, table.sortOrder)
  })
);

export const billingTransactions = mysqlTable(
  "billing_transactions",
  {
    id: id("id").primaryKey(),
    userId: id("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: id("workspace_id"),
    type: shortText("type", 64).notNull(),
    title: shortText("title", 255).notNull(),
    status: shortText("status", 32).notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    balanceBeforeCents: bigint("balance_before_cents", { mode: "number" }).notNull(),
    balanceAfterCents: bigint("balance_after_cents", { mode: "number" }).notNull(),
    quotaBefore: bigint("quota_before", { mode: "number" }).notNull(),
    quotaAfter: bigint("quota_after", { mode: "number" }).notNull(),
    quotaConsumed: bigint("quota_consumed", { mode: "number" }).notNull(),
    imageCount: int("image_count").notNull(),
    quotaCount: int("quota_count").notNull(),
    unitPriceCents: bigint("unit_price_cents", { mode: "number" }).notNull(),
    currency: shortText("currency", 16).notNull(),
    relatedId: id("generation_id"),
    note: text("note"),
    createdByUserId: id("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    metadataJson: longtext("metadata_json"),
    createdAt: isoDate("created_at").notNull()
  },
  (table) => ({
    userCreatedAtIdx: index("billing_transactions_user_created_at_idx").on(table.userId, table.createdAt),
    workspaceCreatedAtIdx: index("billing_transactions_workspace_created_at_idx").on(table.workspaceId, table.createdAt),
    generationIdx: index("billing_transactions_generation_id_idx").on(table.relatedId),
    typeCreatedAtIdx: index("billing_transactions_type_created_at_idx").on(table.type, table.createdAt)
  })
);

export const billingOrders = mysqlTable(
  "billing_orders",
  {
    id: id("id").primaryKey(),
    outTradeNo: shortText("out_trade_no", 128).notNull(),
    userId: id("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: id("workspace_id"),
    type: shortText("type", 64).notNull(),
    status: shortText("status", 32).notNull(),
    title: shortText("title", 255).notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    currency: shortText("currency", 16).notNull(),
    planId: id("plan_id"),
    imageQuota: bigint("image_quota", { mode: "number" }).notNull(),
    storageQuotaBytes: bigint("storage_quota_bytes", { mode: "number" }).notNull(),
    paymentProvider: shortText("payment_provider", 32).notNull(),
    paymentUrl: text("payment_url"),
    providerTradeNo: shortText("provider_trade_no", 128),
    paidAt: isoDate("paid_at"),
    closedAt: isoDate("closed_at"),
    metadataJson: longtext("metadata_json"),
    notifyJson: longtext("notify_json"),
    createdAt: isoDate("created_at").notNull(),
    updatedAt: isoDate("updated_at").notNull()
  },
  (table) => ({
    outTradeNoIdx: uniqueIndex("billing_orders_out_trade_no_unique_idx").on(table.outTradeNo),
    userCreatedAtIdx: index("billing_orders_user_created_at_idx").on(table.userId, table.createdAt),
    statusCreatedAtIdx: index("billing_orders_status_created_at_idx").on(table.status, table.createdAt)
  })
);

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
    model: shortText("model", 255),
    modelConfigId: id("model_config_id"),
    modelProvider: shortText("model_provider", 64),
    modelDisplayName: shortText("model_display_name", 255),
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
