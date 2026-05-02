import { createHash } from "node:crypto";
import { drizzle } from "drizzle-orm/mysql2";
import { createPool, type Pool, type PoolOptions } from "mysql2/promise";
import type { RowDataPacket } from "mysql2";
import { hashPassword } from "./auth-crypto.js";
import { DEMO_USER_ID, DEMO_WORKSPACE_ID, type RequestTenant } from "./auth-context.js";
import { authConfig, ensureRuntimeStorage, mysqlConfig } from "./runtime.js";
import * as schema from "./schema.js";

ensureRuntimeStorage();

const pool = createMysqlPool();

export const db = drizzle(pool, { schema, mode: "default" });

const GIB = 1024 * 1024 * 1024;
const DEFAULT_PLAN_ID = "free";

const defaultSubscriptionPlans = [
  {
    id: DEFAULT_PLAN_ID,
    name: "Free",
    description: "免费体验套餐",
    imageQuota: 20,
    storageQuotaBytes: 1 * GIB,
    priceCents: 0,
    currency: "CNY",
    enabled: 1,
    sortOrder: 10,
    benefitsJson: JSON.stringify(["基础生图额度", "1GB 存图空间"])
  },
  {
    id: "starter",
    name: "Starter",
    description: "适合轻量使用的入门套餐",
    imageQuota: 300,
    storageQuotaBytes: 10 * GIB,
    priceCents: 9900,
    currency: "CNY",
    enabled: 1,
    sortOrder: 20,
    benefitsJson: JSON.stringify(["更多生图额度", "10GB 存图空间"])
  },
  {
    id: "pro",
    name: "Pro",
    description: "适合稳定出图和团队协作的专业套餐",
    imageQuota: 1500,
    storageQuotaBytes: 50 * GIB,
    priceCents: 29900,
    currency: "CNY",
    enabled: 1,
    sortOrder: 30,
    benefitsJson: JSON.stringify(["高频生图额度", "50GB 存图空间"])
  },
  {
    id: "business",
    name: "Business",
    description: "适合业务规模化使用的企业套餐",
    imageQuota: 10000,
    storageQuotaBytes: 200 * GIB,
    priceCents: 99900,
    currency: "CNY",
    enabled: 1,
    sortOrder: 40,
    benefitsJson: JSON.stringify(["大规模生图额度", "200GB 存图空间"])
  }
] as const;

export async function initializeDatabase(): Promise<void> {
  try {
    await pool.query("SELECT 1");
    await createSchema();
    await ensureConfiguredAdmin();
    if (authConfig.allowDemoAuth) {
      await ensureDemoTenant();
    }
  } catch (error) {
    throw new Error(`MySQL initialization failed. ${formatMysqlConfig()} ${formatErrorSummary(error)}`);
  }
}

export async function closeDatabase(): Promise<void> {
  await pool.end();
}

export async function ensureTenant(tenant: RequestTenant): Promise<void> {
  const now = new Date().toISOString();
  const isDemo = tenant.userId === DEMO_USER_ID && tenant.workspaceId === DEMO_WORKSPACE_ID;

  await upsertTenantRows({
    ...tenant,
    email: isDemo ? "demo@example.local" : null,
    displayName: isDemo ? "Demo User" : tenant.userId,
    workspaceName: isDemo ? "Demo Workspace" : tenant.workspaceId,
    role: isDemo ? "owner" : "member",
    now
  });
}

async function createSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS subscription_plans (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      image_quota BIGINT NOT NULL DEFAULT 0,
      storage_quota_bytes BIGINT NOT NULL DEFAULT 0,
      price_cents BIGINT NOT NULL DEFAULT 0,
      currency VARCHAR(16) NOT NULL DEFAULT 'CNY',
      enabled INT NOT NULL DEFAULT 1,
      sort_order INT NOT NULL DEFAULT 0,
      benefits_json LONGTEXT,
      created_at VARCHAR(32) NOT NULL,
      updated_at VARCHAR(32) NOT NULL,
      KEY subscription_plans_enabled_sort_idx (enabled, sort_order)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await migrateSubscriptionPlansTable();
  await seedDefaultSubscriptionPlans();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(64) PRIMARY KEY,
      email VARCHAR(255) NOT NULL,
      password_hash VARCHAR(512) NOT NULL DEFAULT '',
      display_name VARCHAR(255) NOT NULL,
      role VARCHAR(32) NOT NULL DEFAULT 'user',
      plan_id VARCHAR(64),
      plan_expires_at VARCHAR(32),
      quota_total BIGINT NOT NULL DEFAULT 0,
      quota_used BIGINT NOT NULL DEFAULT 0,
      balance_cents BIGINT NOT NULL DEFAULT 0,
      storage_quota_bytes BIGINT NOT NULL DEFAULT 0,
      storage_used_bytes BIGINT NOT NULL DEFAULT 0,
      currency VARCHAR(16) NOT NULL DEFAULT 'CNY',
      created_at VARCHAR(32) NOT NULL,
      updated_at VARCHAR(32) NOT NULL,
      UNIQUE KEY users_email_unique_idx (email),
      KEY users_plan_id_idx (plan_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await migrateUsersTable();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS system_settings (
      setting_key VARCHAR(128) PRIMARY KEY,
      value_json LONGTEXT NOT NULL,
      created_at VARCHAR(32) NOT NULL,
      updated_at VARCHAR(32) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await seedDefaultSystemSettings();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      owner_user_id VARCHAR(64) NOT NULL,
      created_at VARCHAR(32) NOT NULL,
      updated_at VARCHAR(32) NOT NULL,
      CONSTRAINT workspaces_owner_user_fk FOREIGN KEY (owner_user_id) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS workspace_members (
      id VARCHAR(64) PRIMARY KEY,
      workspace_id VARCHAR(64) NOT NULL,
      user_id VARCHAR(64) NOT NULL,
      role VARCHAR(32) NOT NULL,
      created_at VARCHAR(32) NOT NULL,
      updated_at VARCHAR(32) NOT NULL,
      UNIQUE KEY workspace_members_workspace_user_idx (workspace_id, user_id),
      CONSTRAINT workspace_members_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
      CONSTRAINT workspace_members_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id VARCHAR(64) PRIMARY KEY,
      workspace_id VARCHAR(64) NOT NULL,
      created_by_user_id VARCHAR(64) NOT NULL,
      name VARCHAR(255) NOT NULL,
      snapshot_json LONGTEXT NOT NULL,
      created_at VARCHAR(32) NOT NULL,
      updated_at VARCHAR(32) NOT NULL,
      KEY products_workspace_updated_at_idx (workspace_id, updated_at),
      CONSTRAINT products_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
      CONSTRAINT products_created_by_user_fk FOREIGN KEY (created_by_user_id) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS assets (
      id VARCHAR(64) PRIMARY KEY,
      workspace_id VARCHAR(64) NOT NULL,
      created_by_user_id VARCHAR(64) NOT NULL,
      file_name VARCHAR(255) NOT NULL,
      relative_path VARCHAR(512) NOT NULL,
      mime_type VARCHAR(128) NOT NULL,
      width INT NOT NULL,
      height INT NOT NULL,
      cloud_provider VARCHAR(32),
      cloud_bucket VARCHAR(255),
      cloud_region VARCHAR(64),
      cloud_object_key VARCHAR(512),
      cloud_status VARCHAR(32),
      cloud_error TEXT,
      cloud_uploaded_at VARCHAR(32),
      cloud_etag VARCHAR(255),
      cloud_request_id VARCHAR(255),
      created_at VARCHAR(32) NOT NULL,
      KEY assets_workspace_created_at_idx (workspace_id, created_at),
      CONSTRAINT assets_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
      CONSTRAINT assets_created_by_user_fk FOREIGN KEY (created_by_user_id) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS storage_configs (
      id VARCHAR(64) PRIMARY KEY,
      workspace_id VARCHAR(64) NOT NULL,
      provider VARCHAR(32) NOT NULL,
      enabled INT NOT NULL,
      secret_id VARCHAR(255),
      secret_key TEXT,
      bucket VARCHAR(255),
      region VARCHAR(64),
      key_prefix VARCHAR(512),
      created_at VARCHAR(32) NOT NULL,
      updated_at VARCHAR(32) NOT NULL,
      UNIQUE KEY storage_configs_workspace_provider_idx (workspace_id, provider),
      CONSTRAINT storage_configs_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS generation_jobs (
      id VARCHAR(64) PRIMARY KEY,
      workspace_id VARCHAR(64) NOT NULL,
      created_by_user_id VARCHAR(64) NOT NULL,
      product_id VARCHAR(64),
      mode VARCHAR(32) NOT NULL,
      prompt LONGTEXT NOT NULL,
      effective_prompt LONGTEXT NOT NULL,
      preset_id VARCHAR(64) NOT NULL,
      width INT NOT NULL,
      height INT NOT NULL,
      quality VARCHAR(32) NOT NULL,
      output_format VARCHAR(32) NOT NULL,
      count INT NOT NULL,
      status VARCHAR(32) NOT NULL,
      error TEXT,
      reference_asset_id VARCHAR(64),
      created_at VARCHAR(32) NOT NULL,
      KEY generation_jobs_workspace_created_at_idx (workspace_id, created_at),
      CONSTRAINT generation_jobs_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
      CONSTRAINT generation_jobs_created_by_user_fk FOREIGN KEY (created_by_user_id) REFERENCES users(id),
      CONSTRAINT generation_jobs_product_fk FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
      CONSTRAINT generation_jobs_reference_asset_fk FOREIGN KEY (reference_asset_id) REFERENCES assets(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS generation_outputs (
      id VARCHAR(64) PRIMARY KEY,
      workspace_id VARCHAR(64) NOT NULL,
      generation_id VARCHAR(64) NOT NULL,
      status VARCHAR(32) NOT NULL,
      asset_id VARCHAR(64),
      error TEXT,
      created_at VARCHAR(32) NOT NULL,
      KEY generation_outputs_workspace_created_at_idx (workspace_id, created_at),
      KEY generation_outputs_generation_id_idx (generation_id),
      KEY generation_outputs_asset_id_idx (asset_id),
      CONSTRAINT generation_outputs_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
      CONSTRAINT generation_outputs_generation_fk FOREIGN KEY (generation_id) REFERENCES generation_jobs(id) ON DELETE CASCADE,
      CONSTRAINT generation_outputs_asset_fk FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS billing_transactions (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      workspace_id VARCHAR(64),
      generation_id VARCHAR(64),
      type VARCHAR(64) NOT NULL,
      title VARCHAR(255) NOT NULL,
      status VARCHAR(32) NOT NULL,
      currency VARCHAR(16) NOT NULL DEFAULT 'CNY',
      amount_cents BIGINT NOT NULL DEFAULT 0,
      balance_before_cents BIGINT NOT NULL DEFAULT 0,
      balance_after_cents BIGINT NOT NULL DEFAULT 0,
      quota_before BIGINT NOT NULL DEFAULT 0,
      quota_after BIGINT NOT NULL DEFAULT 0,
      quota_consumed BIGINT NOT NULL DEFAULT 0,
      image_count INT NOT NULL DEFAULT 0,
      quota_count INT NOT NULL DEFAULT 0,
      unit_price_cents BIGINT NOT NULL DEFAULT 0,
      note TEXT,
      created_by_user_id VARCHAR(64),
      metadata_json LONGTEXT,
      created_at VARCHAR(32) NOT NULL,
      KEY billing_transactions_user_created_at_idx (user_id, created_at),
      KEY billing_transactions_workspace_created_at_idx (workspace_id, created_at),
      KEY billing_transactions_generation_id_idx (generation_id),
      KEY billing_transactions_type_created_at_idx (type, created_at),
      CONSTRAINT billing_transactions_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT billing_transactions_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL,
      CONSTRAINT billing_transactions_created_by_user_fk FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await migrateBillingTransactionsTable();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS billing_orders (
      id VARCHAR(64) PRIMARY KEY,
      out_trade_no VARCHAR(128) NOT NULL,
      user_id VARCHAR(64) NOT NULL,
      workspace_id VARCHAR(64),
      type VARCHAR(64) NOT NULL,
      status VARCHAR(32) NOT NULL,
      title VARCHAR(255) NOT NULL,
      amount_cents BIGINT NOT NULL DEFAULT 0,
      currency VARCHAR(16) NOT NULL DEFAULT 'CNY',
      plan_id VARCHAR(64),
      image_quota BIGINT NOT NULL DEFAULT 0,
      storage_quota_bytes BIGINT NOT NULL DEFAULT 0,
      payment_provider VARCHAR(32) NOT NULL DEFAULT 'alipay',
      payment_url TEXT,
      provider_trade_no VARCHAR(128),
      paid_at VARCHAR(32),
      closed_at VARCHAR(32),
      metadata_json LONGTEXT,
      notify_json LONGTEXT,
      created_at VARCHAR(32) NOT NULL,
      updated_at VARCHAR(32) NOT NULL,
      UNIQUE KEY billing_orders_out_trade_no_unique_idx (out_trade_no),
      KEY billing_orders_user_created_at_idx (user_id, created_at),
      KEY billing_orders_status_created_at_idx (status, created_at),
      CONSTRAINT billing_orders_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await migrateBillingOrdersTable();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ecommerce_batch_jobs (
      id VARCHAR(64) PRIMARY KEY,
      workspace_id VARCHAR(64) NOT NULL,
      created_by_user_id VARCHAR(64) NOT NULL,
      status VARCHAR(32) NOT NULL,
      message TEXT NOT NULL,
      product_title VARCHAR(512) NOT NULL,
      platform VARCHAR(64) NOT NULL,
      market VARCHAR(64) NOT NULL,
      total_scenes INT NOT NULL,
      completed_scenes INT NOT NULL,
      succeeded_scenes INT NOT NULL,
      failed_scenes INT NOT NULL,
      request_json LONGTEXT NOT NULL,
      records_json LONGTEXT NOT NULL,
      created_at VARCHAR(32) NOT NULL,
      updated_at VARCHAR(32) NOT NULL,
      completed_at VARCHAR(32),
      KEY ecommerce_batch_jobs_workspace_created_at_idx (workspace_id, created_at),
      KEY ecommerce_batch_jobs_workspace_status_idx (workspace_id, status),
      CONSTRAINT ecommerce_batch_jobs_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
      CONSTRAINT ecommerce_batch_jobs_created_by_user_fk FOREIGN KEY (created_by_user_id) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const now = new Date().toISOString();
  await pool.query(
    `
      UPDATE ecommerce_batch_jobs
      SET status = 'failed',
        message = '服务已重启，未完成的批量任务已中断，请重新提交。',
        updated_at = ?,
        completed_at = ?
      WHERE status IN ('pending', 'running')
    `,
    [now, now]
  );
}

async function ensureDemoTenant(): Promise<void> {
  const now = new Date().toISOString();
  const defaultPlan = await getDefaultSubscriptionPlan();
  await upsertTenantRows({
    userId: DEMO_USER_ID,
    workspaceId: DEMO_WORKSPACE_ID,
    email: "demo@example.local",
    passwordHash: "",
    displayName: "Demo User",
    userRole: "user",
    workspaceName: "Demo Workspace",
    role: "owner",
    planId: DEFAULT_PLAN_ID,
    quotaTotal: defaultPlan.imageQuota,
    quotaUsed: 0,
    balanceCents: 0,
    storageQuotaBytes: defaultPlan.storageQuotaBytes,
    storageUsedBytes: 0,
    now
  });
}

async function ensureConfiguredAdmin(): Promise<void> {
  if (!authConfig.adminEmail || !authConfig.adminPassword) {
    return;
  }

  const email = authConfig.adminEmail.toLowerCase();
  const userId = (await findUserIdByEmail(email)) ?? stableId("admin-user", email);
  const workspaceId = stableId("admin-workspace", email);
  const now = new Date().toISOString();
  const defaultPlan = await getDefaultSubscriptionPlan();
  await upsertTenantRows({
    userId,
    workspaceId,
    email,
    passwordHash: hashPassword(authConfig.adminPassword),
    displayName: authConfig.adminDisplayName,
    userRole: "admin",
    workspaceName: `${authConfig.adminDisplayName}'s Workspace`,
    role: "owner",
    planId: DEFAULT_PLAN_ID,
    quotaTotal: defaultPlan.imageQuota,
    quotaUsed: 0,
    balanceCents: 0,
    storageQuotaBytes: defaultPlan.storageQuotaBytes,
    storageUsedBytes: 0,
    now
  });
}

async function upsertTenantRows(input: {
  userId: string;
  workspaceId: string;
  email: string | null;
  passwordHash?: string;
  displayName: string;
  userRole?: "user" | "admin";
  workspaceName: string;
  role: string;
  planId?: string | null;
  quotaTotal?: number;
  quotaUsed?: number;
  balanceCents?: number;
  storageQuotaBytes?: number;
  storageUsedBytes?: number;
  now: string;
}): Promise<void> {
  await pool.query(
    `
      INSERT INTO users (id, email, password_hash, display_name, role, plan_id, plan_expires_at, quota_total, quota_used, balance_cents, storage_quota_bytes, storage_used_bytes, currency, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        email = VALUES(email),
        password_hash = IF(VALUES(password_hash) <> '', VALUES(password_hash), password_hash),
        display_name = VALUES(display_name),
        role = VALUES(role),
        plan_id = IF(plan_id IS NULL OR plan_id = '', VALUES(plan_id), plan_id),
        plan_expires_at = plan_expires_at,
        quota_total = IF(quota_total = 0, VALUES(quota_total), quota_total),
        quota_used = quota_used,
        balance_cents = balance_cents,
        storage_quota_bytes = IF(storage_quota_bytes = 0, VALUES(storage_quota_bytes), storage_quota_bytes),
        storage_used_bytes = storage_used_bytes,
        currency = IF(currency IS NULL OR currency = '', VALUES(currency), currency),
        updated_at = VALUES(updated_at)
    `,
    [
      input.userId,
      input.email,
      input.passwordHash ?? "",
      input.displayName,
      input.userRole ?? "user",
      input.planId ?? DEFAULT_PLAN_ID,
      null,
      input.quotaTotal ?? defaultSubscriptionPlans[0].imageQuota,
      input.quotaUsed ?? 0,
      input.balanceCents ?? 0,
      input.storageQuotaBytes ?? defaultSubscriptionPlans[0].storageQuotaBytes,
      input.storageUsedBytes ?? 0,
      "CNY",
      input.now,
      input.now
    ]
  );

  await pool.query(
    `
      INSERT INTO workspaces (id, name, owner_user_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE name = VALUES(name), owner_user_id = VALUES(owner_user_id), updated_at = VALUES(updated_at)
    `,
    [input.workspaceId, input.workspaceName, input.userId, input.now, input.now]
  );

  await pool.query(
    `
      INSERT INTO workspace_members (id, workspace_id, user_id, role, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE role = VALUES(role), updated_at = VALUES(updated_at)
    `,
    [workspaceMemberId(input.workspaceId, input.userId), input.workspaceId, input.userId, input.role, input.now, input.now]
  );
}

function workspaceMemberId(workspaceId: string, userId: string): string {
  return createHash("sha256").update(`${workspaceId}:${userId}`).digest("hex");
}

function stableId(prefix: string, value: string): string {
  return createHash("sha256").update(`${prefix}:${value}`).digest("hex");
}

async function migrateUsersTable(): Promise<void> {
  await addColumnIfMissing("users", "password_hash", "VARCHAR(512) NOT NULL DEFAULT ''");
  await addColumnIfMissing("users", "role", "VARCHAR(32) NOT NULL DEFAULT 'user'");
  await addColumnIfMissing("users", "plan_id", "VARCHAR(64)");
  await addColumnIfMissing("users", "plan_expires_at", "VARCHAR(32)");
  await addColumnIfMissing("users", "quota_total", "BIGINT NOT NULL DEFAULT 0");
  await addColumnIfMissing("users", "quota_used", "BIGINT NOT NULL DEFAULT 0");
  await addColumnIfMissing("users", "balance_cents", "BIGINT NOT NULL DEFAULT 0");
  await addColumnIfMissing("users", "storage_quota_bytes", "BIGINT NOT NULL DEFAULT 0");
  await addColumnIfMissing("users", "storage_used_bytes", "BIGINT NOT NULL DEFAULT 0");
  await addColumnIfMissing("users", "currency", "VARCHAR(16) NOT NULL DEFAULT 'CNY'");
  await normalizeDuplicateUserEmails();
  await addIndexIfMissing("users", "users_email_unique_idx", "UNIQUE KEY users_email_unique_idx (email)");
  await addIndexIfMissing("users", "users_plan_id_idx", "KEY users_plan_id_idx (plan_id)");
  const defaultPlan = await getDefaultSubscriptionPlan();
  await pool.query(
    "UPDATE users SET plan_id = ?, quota_total = IF(quota_total = 0, ?, quota_total), storage_quota_bytes = IF(storage_quota_bytes = 0, ?, storage_quota_bytes) WHERE plan_id IS NULL OR plan_id = ''",
    [DEFAULT_PLAN_ID, defaultPlan.imageQuota, defaultPlan.storageQuotaBytes]
  );
  await pool.query("UPDATE users SET plan_expires_at = ? WHERE plan_id <> ? AND (plan_expires_at IS NULL OR plan_expires_at = '')", [
    defaultPlanExpiryFrom(new Date()),
    DEFAULT_PLAN_ID
  ]);
  if (defaultPlan.imageQuota !== defaultSubscriptionPlans[0].imageQuota) {
    await pool.query("UPDATE users SET quota_total = ? WHERE plan_id = ? AND quota_total = ?", [
      defaultPlan.imageQuota,
      DEFAULT_PLAN_ID,
      defaultSubscriptionPlans[0].imageQuota
    ]);
  }
}

function defaultPlanExpiryFrom(base: Date): string {
  const expiresAt = new Date(base);
  expiresAt.setMonth(expiresAt.getMonth() + 1);
  return expiresAt.toISOString();
}

async function migrateBillingTransactionsTable(): Promise<void> {
  await addColumnIfMissing("billing_transactions", "workspace_id", "VARCHAR(64)");
  await addColumnIfMissing("billing_transactions", "generation_id", "VARCHAR(64)");
  await addColumnIfMissing("billing_transactions", "currency", "VARCHAR(16) NOT NULL DEFAULT 'CNY'");
  await addColumnIfMissing("billing_transactions", "amount_cents", "BIGINT NOT NULL DEFAULT 0");
  await addColumnIfMissing("billing_transactions", "balance_before_cents", "BIGINT NOT NULL DEFAULT 0");
  await addColumnIfMissing("billing_transactions", "balance_after_cents", "BIGINT NOT NULL DEFAULT 0");
  await addColumnIfMissing("billing_transactions", "quota_before", "BIGINT NOT NULL DEFAULT 0");
  await addColumnIfMissing("billing_transactions", "quota_after", "BIGINT NOT NULL DEFAULT 0");
  await addColumnIfMissing("billing_transactions", "quota_consumed", "BIGINT NOT NULL DEFAULT 0");
  await addColumnIfMissing("billing_transactions", "image_count", "INT NOT NULL DEFAULT 0");
  await addColumnIfMissing("billing_transactions", "quota_count", "INT NOT NULL DEFAULT 0");
  await addColumnIfMissing("billing_transactions", "unit_price_cents", "BIGINT NOT NULL DEFAULT 0");
  await addColumnIfMissing("billing_transactions", "note", "TEXT");
  await addColumnIfMissing("billing_transactions", "created_by_user_id", "VARCHAR(64)");
  await addColumnIfMissing("billing_transactions", "metadata_json", "LONGTEXT");
  await addIndexIfMissing(
    "billing_transactions",
    "billing_transactions_user_created_at_idx",
    "KEY billing_transactions_user_created_at_idx (user_id, created_at)"
  );
  await addIndexIfMissing(
    "billing_transactions",
    "billing_transactions_workspace_created_at_idx",
    "KEY billing_transactions_workspace_created_at_idx (workspace_id, created_at)"
  );
  await addIndexIfMissing(
    "billing_transactions",
    "billing_transactions_generation_id_idx",
    "KEY billing_transactions_generation_id_idx (generation_id)"
  );
  await addIndexIfMissing(
    "billing_transactions",
    "billing_transactions_type_created_at_idx",
    "KEY billing_transactions_type_created_at_idx (type, created_at)"
  );
}

async function migrateBillingOrdersTable(): Promise<void> {
  await addColumnIfMissing("billing_orders", "workspace_id", "VARCHAR(64)");
  await addColumnIfMissing("billing_orders", "plan_id", "VARCHAR(64)");
  await addColumnIfMissing("billing_orders", "image_quota", "BIGINT NOT NULL DEFAULT 0");
  await addColumnIfMissing("billing_orders", "storage_quota_bytes", "BIGINT NOT NULL DEFAULT 0");
  await addColumnIfMissing("billing_orders", "payment_url", "TEXT");
  await addColumnIfMissing("billing_orders", "provider_trade_no", "VARCHAR(128)");
  await addColumnIfMissing("billing_orders", "paid_at", "VARCHAR(32)");
  await addColumnIfMissing("billing_orders", "closed_at", "VARCHAR(32)");
  await addColumnIfMissing("billing_orders", "metadata_json", "LONGTEXT");
  await addColumnIfMissing("billing_orders", "notify_json", "LONGTEXT");
  await addIndexIfMissing(
    "billing_orders",
    "billing_orders_out_trade_no_unique_idx",
    "UNIQUE KEY billing_orders_out_trade_no_unique_idx (out_trade_no)"
  );
  await addIndexIfMissing(
    "billing_orders",
    "billing_orders_user_created_at_idx",
    "KEY billing_orders_user_created_at_idx (user_id, created_at)"
  );
  await addIndexIfMissing(
    "billing_orders",
    "billing_orders_status_created_at_idx",
    "KEY billing_orders_status_created_at_idx (status, created_at)"
  );
}

async function seedDefaultSystemSettings(): Promise<void> {
  const now = new Date().toISOString();
  const defaults = [
    ["billing.imageUnitPrice", { imageUnitPriceCents: 0, currency: "CNY" }],
    [
      "payment.alipay",
      {
        enabled: false,
        appId: "",
        privateKey: "",
        publicKey: "",
        notifyUrl: "",
        returnUrl: "",
        gateway: "https://openapi.alipay.com/gateway.do",
        signType: "RSA2"
      }
    ]
  ] as const;

  for (const [key, value] of defaults) {
    await pool.query(
      `
        INSERT INTO system_settings (setting_key, value_json, created_at, updated_at)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE setting_key = setting_key
      `,
      [key, JSON.stringify(value), now, now]
    );
  }
}

async function migrateSubscriptionPlansTable(): Promise<void> {
  await addColumnIfMissing("subscription_plans", "description", "TEXT");
  await addColumnIfMissing("subscription_plans", "image_quota", "BIGINT NOT NULL DEFAULT 0");
  await addColumnIfMissing("subscription_plans", "storage_quota_bytes", "BIGINT NOT NULL DEFAULT 0");
  await addColumnIfMissing("subscription_plans", "price_cents", "BIGINT NOT NULL DEFAULT 0");
  await addColumnIfMissing("subscription_plans", "currency", "VARCHAR(16) NOT NULL DEFAULT 'CNY'");
  await addColumnIfMissing("subscription_plans", "enabled", "INT NOT NULL DEFAULT 1");
  await addColumnIfMissing("subscription_plans", "sort_order", "INT NOT NULL DEFAULT 0");
  await addColumnIfMissing("subscription_plans", "benefits_json", "LONGTEXT");
  await addColumnIfMissing("subscription_plans", "created_at", "VARCHAR(32) NOT NULL DEFAULT ''");
  await addColumnIfMissing("subscription_plans", "updated_at", "VARCHAR(32) NOT NULL DEFAULT ''");
  await addIndexIfMissing(
    "subscription_plans",
    "subscription_plans_enabled_sort_idx",
    "KEY subscription_plans_enabled_sort_idx (enabled, sort_order)"
  );
}

async function seedDefaultSubscriptionPlans(): Promise<void> {
  const now = new Date().toISOString();
  for (const plan of defaultSubscriptionPlans) {
    await pool.query(
      `
        INSERT INTO subscription_plans (
          id, name, description, image_quota, storage_quota_bytes, price_cents, currency, enabled, sort_order, benefits_json, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          id = id
      `,
      [
        plan.id,
        plan.name,
        plan.description,
        plan.imageQuota,
        plan.storageQuotaBytes,
        plan.priceCents,
        plan.currency,
        plan.enabled,
        plan.sortOrder,
        plan.benefitsJson,
        now,
        now
      ]
    );
  }
}

async function getDefaultSubscriptionPlan(): Promise<{ imageQuota: number; storageQuotaBytes: number }> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT image_quota AS imageQuota, storage_quota_bytes AS storageQuotaBytes FROM subscription_plans WHERE id = ? LIMIT 1",
    [DEFAULT_PLAN_ID]
  );
  const row = rows[0];
  return {
    imageQuota: Number(row?.imageQuota ?? defaultSubscriptionPlans[0].imageQuota),
    storageQuotaBytes: Number(row?.storageQuotaBytes ?? defaultSubscriptionPlans[0].storageQuotaBytes)
  };
}

async function addColumnIfMissing(tableName: string, columnName: string, definition: string): Promise<void> {
  if (await columnExists(tableName, columnName)) {
    return;
  }

  await pool.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

async function addIndexIfMissing(tableName: string, indexName: string, definition: string): Promise<void> {
  if (await indexExists(tableName, indexName)) {
    return;
  }

  await pool.query(`ALTER TABLE ${tableName} ADD ${definition}`);
}

async function columnExists(tableName: string, columnName: string): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `
      SELECT COUNT(*) AS count
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
    `,
    [tableName, columnName]
  );
  return Number(rows[0]?.count ?? 0) > 0;
}

async function indexExists(tableName: string, indexName: string): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `
      SELECT COUNT(*) AS count
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?
    `,
    [tableName, indexName]
  );
  return Number(rows[0]?.count ?? 0) > 0;
}

async function normalizeDuplicateUserEmails(): Promise<void> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `
      SELECT id, email
      FROM users
      WHERE email IS NOT NULL AND email <> ''
      ORDER BY email, created_at, id
    `
  );
  const seen = new Set<string>();
  for (const row of rows) {
    const email = String(row.email).toLowerCase();
    if (!seen.has(email)) {
      seen.add(email);
      continue;
    }

    await pool.query("UPDATE users SET email = NULL WHERE id = ?", [row.id]);
  }
}

async function findUserIdByEmail(email: string): Promise<string | undefined> {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT id FROM users WHERE email = ? LIMIT 1", [email]);
  const id = rows[0]?.id;
  return typeof id === "string" ? id : undefined;
}

function createMysqlPool(): Pool {
  if (mysqlConfig.databaseUrl) {
    return createPool(mysqlConfig.databaseUrl);
  }

  const options: PoolOptions = {
    host: mysqlConfig.host,
    port: mysqlConfig.port,
    user: mysqlConfig.user,
    password: mysqlConfig.password,
    database: mysqlConfig.database,
    connectionLimit: 10,
    namedPlaceholders: false
  };

  return createPool(options);
}

function formatMysqlConfig(): string {
  if (mysqlConfig.databaseUrl) {
    return "Check DATABASE_URL and ensure the target database exists.";
  }

  return `Check MYSQL_HOST=${mysqlConfig.host}, MYSQL_PORT=${mysqlConfig.port}, MYSQL_USER=${mysqlConfig.user}, MYSQL_DATABASE=${mysqlConfig.database}.`;
}

function formatErrorSummary(error: unknown): string {
  if (error instanceof Error) {
    const codeValue = (error as { code?: unknown }).code;
    const code = typeof codeValue === "string" ? `${codeValue}: ` : "";
    return `${code}${error.message}`;
  }

  return String(error);
}
