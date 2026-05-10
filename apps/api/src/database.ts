import { createHash } from "node:crypto";
import { drizzle } from "drizzle-orm/mysql2";
import { createPool, type Pool, type PoolOptions } from "mysql2/promise";
import type { RowDataPacket } from "mysql2";
import { hashPassword } from "./auth-crypto.js";
import { DEMO_USER_ID, DEMO_WORKSPACE_ID, type RequestTenant } from "./auth-context.js";
import { authConfig, ensureRuntimeStorage, mysqlConfig, wechatMiniAppRuntimeConfig } from "./runtime.js";
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
    imageQuota: 2,
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
      numeric_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      email VARCHAR(255),
      phone VARCHAR(32),
      phone_verified_at VARCHAR(32),
      password_hash VARCHAR(512) NOT NULL DEFAULT '',
      display_name VARCHAR(255) NOT NULL,
      role VARCHAR(32) NOT NULL DEFAULT 'user',
      plan_id VARCHAR(64),
      plan_expires_at VARCHAR(32),
      quota_total BIGINT NOT NULL DEFAULT 0,
      quota_used BIGINT NOT NULL DEFAULT 0,
      balance_cents BIGINT NOT NULL DEFAULT 0,
      referral_balance_cents BIGINT NOT NULL DEFAULT 0,
      invoice_paid_cents BIGINT NOT NULL DEFAULT 0,
      invoice_reserved_cents BIGINT NOT NULL DEFAULT 0,
      invoice_issued_cents BIGINT NOT NULL DEFAULT 0,
      invite_code VARCHAR(64),
      inviter_user_id VARCHAR(64),
      storage_quota_bytes BIGINT NOT NULL DEFAULT 0,
      storage_used_bytes BIGINT NOT NULL DEFAULT 0,
      currency VARCHAR(16) NOT NULL DEFAULT 'CNY',
      created_at VARCHAR(32) NOT NULL,
      updated_at VARCHAR(32) NOT NULL,
      UNIQUE KEY users_numeric_id_unique_idx (numeric_id),
      UNIQUE KEY users_email_unique_idx (email),
      UNIQUE KEY users_phone_unique_idx (phone),
      UNIQUE KEY users_invite_code_unique_idx (invite_code),
      KEY users_inviter_user_id_idx (inviter_user_id),
      KEY users_plan_id_idx (plan_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await migrateUsersTable();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS wechat_accounts (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      provider VARCHAR(32) NOT NULL,
      open_id VARCHAR(255) NOT NULL,
      union_id VARCHAR(255),
      nickname VARCHAR(255),
      avatar_url TEXT,
      created_at VARCHAR(32) NOT NULL,
      updated_at VARCHAR(32) NOT NULL,
      UNIQUE KEY wechat_accounts_provider_open_id_idx (provider, open_id),
      UNIQUE KEY wechat_accounts_provider_union_id_idx (provider, union_id),
      UNIQUE KEY wechat_accounts_user_provider_idx (user_id, provider),
      CONSTRAINT wechat_accounts_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
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
    CREATE TABLE IF NOT EXISTS help_categories (
      id VARCHAR(64) PRIMARY KEY,
      slug VARCHAR(128) NOT NULL,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      audience VARCHAR(64),
      sort_order INT NOT NULL DEFAULT 0,
      enabled INT NOT NULL DEFAULT 1,
      created_at VARCHAR(32) NOT NULL,
      updated_at VARCHAR(32) NOT NULL,
      UNIQUE KEY help_categories_slug_unique_idx (slug),
      KEY help_categories_enabled_sort_idx (enabled, sort_order)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS help_articles (
      id VARCHAR(64) PRIMARY KEY,
      category_id VARCHAR(64) NOT NULL,
      slug VARCHAR(160) NOT NULL,
      title VARCHAR(255) NOT NULL,
      summary TEXT,
      content_json LONGTEXT NOT NULL,
      cover_image_url TEXT,
      video_url TEXT,
      status VARCHAR(32) NOT NULL DEFAULT 'published',
      featured INT NOT NULL DEFAULT 0,
      sort_order INT NOT NULL DEFAULT 0,
      tags_json LONGTEXT,
      created_at VARCHAR(32) NOT NULL,
      updated_at VARCHAR(32) NOT NULL,
      UNIQUE KEY help_articles_slug_unique_idx (slug),
      KEY help_articles_category_sort_idx (category_id, sort_order),
      KEY help_articles_status_featured_idx (status, featured),
      CONSTRAINT help_articles_category_fk FOREIGN KEY (category_id) REFERENCES help_categories(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await seedDefaultHelpCenter();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS email_verification_codes (
      id VARCHAR(64) PRIMARY KEY,
      email VARCHAR(255) NOT NULL,
      purpose VARCHAR(32) NOT NULL,
      code_hash VARCHAR(128) NOT NULL,
      expires_at VARCHAR(32) NOT NULL,
      consumed_at VARCHAR(32),
      attempt_count INT NOT NULL DEFAULT 0,
      sent_at VARCHAR(32) NOT NULL,
      created_at VARCHAR(32) NOT NULL,
      KEY email_verification_codes_email_purpose_idx (email, purpose),
      KEY email_verification_codes_expires_at_idx (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sms_verification_codes (
      id VARCHAR(64) PRIMARY KEY,
      phone VARCHAR(32) NOT NULL,
      purpose VARCHAR(32) NOT NULL,
      code_hash VARCHAR(128) NOT NULL,
      expires_at VARCHAR(32) NOT NULL,
      consumed_at VARCHAR(32),
      attempt_count INT NOT NULL DEFAULT 0,
      sent_at VARCHAR(32) NOT NULL,
      created_at VARCHAR(32) NOT NULL,
      KEY sms_verification_codes_phone_purpose_idx (phone, purpose),
      KEY sms_verification_codes_expires_at_idx (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
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
      model VARCHAR(255),
      model_config_id VARCHAR(64),
      model_provider VARCHAR(64),
      model_display_name VARCHAR(255),
      reference_asset_id VARCHAR(64),
      reference_mask_data_url LONGTEXT,
      created_at VARCHAR(32) NOT NULL,
      KEY generation_jobs_workspace_created_at_idx (workspace_id, created_at),
      CONSTRAINT generation_jobs_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
      CONSTRAINT generation_jobs_created_by_user_fk FOREIGN KEY (created_by_user_id) REFERENCES users(id),
      CONSTRAINT generation_jobs_product_fk FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
      CONSTRAINT generation_jobs_reference_asset_fk FOREIGN KEY (reference_asset_id) REFERENCES assets(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await migrateGenerationJobsTable();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS generation_outputs (
      id VARCHAR(64) PRIMARY KEY,
      workspace_id VARCHAR(64) NOT NULL,
      generation_id VARCHAR(64) NOT NULL,
      status VARCHAR(32) NOT NULL,
      asset_id VARCHAR(64),
      error TEXT,
      public_gallery_enabled INT NOT NULL DEFAULT 0,
      public_gallery_sort_order INT NOT NULL DEFAULT 0,
      public_gallery_updated_at VARCHAR(32),
      created_at VARCHAR(32) NOT NULL,
      KEY generation_outputs_workspace_created_at_idx (workspace_id, created_at),
      KEY generation_outputs_generation_id_idx (generation_id),
      KEY generation_outputs_asset_id_idx (asset_id),
      KEY generation_outputs_public_gallery_idx (public_gallery_enabled, public_gallery_sort_order, created_at),
      CONSTRAINT generation_outputs_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
      CONSTRAINT generation_outputs_generation_fk FOREIGN KEY (generation_id) REFERENCES generation_jobs(id) ON DELETE CASCADE,
      CONSTRAINT generation_outputs_asset_fk FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await migrateGenerationOutputsTable();

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
    CREATE TABLE IF NOT EXISTS invoice_applications (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      invoice_type VARCHAR(32) NOT NULL,
      header_type VARCHAR(32) NOT NULL,
      title VARCHAR(255) NOT NULL,
      tax_number VARCHAR(64),
      invoice_content VARCHAR(255) NOT NULL,
      amount_cents BIGINT NOT NULL DEFAULT 0,
      email VARCHAR(255) NOT NULL,
      phone VARCHAR(32),
      company_address VARCHAR(255),
      bank_name VARCHAR(255),
      bank_account VARCHAR(255),
      remark TEXT,
      status VARCHAR(32) NOT NULL,
      handled_by_user_id VARCHAR(64),
      handled_at VARCHAR(32),
      review_note TEXT,
      created_at VARCHAR(32) NOT NULL,
      updated_at VARCHAR(32) NOT NULL,
      KEY invoice_applications_user_created_at_idx (user_id, created_at),
      KEY invoice_applications_user_status_idx (user_id, status),
      CONSTRAINT invoice_applications_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT invoice_applications_handled_by_user_fk FOREIGN KEY (handled_by_user_id) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await migrateInvoiceApplicationsTable();
  await syncInvoiceLedgerCaches();

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
      INSERT INTO users (id, email, password_hash, display_name, role, plan_id, plan_expires_at, quota_total, quota_used, balance_cents, referral_balance_cents, invoice_paid_cents, invoice_reserved_cents, invoice_issued_cents, invite_code, inviter_user_id, storage_quota_bytes, storage_used_bytes, currency, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        referral_balance_cents = referral_balance_cents,
        invoice_paid_cents = invoice_paid_cents,
        invoice_reserved_cents = invoice_reserved_cents,
        invoice_issued_cents = invoice_issued_cents,
        invite_code = IF(invite_code IS NULL OR invite_code = '', VALUES(invite_code), invite_code),
        inviter_user_id = inviter_user_id,
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
      0,
      0,
      0,
      0,
      inviteCodeFromUserId(input.userId),
      null,
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

function inviteCodeFromUserId(userId: string): string {
  return createHash("sha256").update(`invite:${userId}`).digest("base64url").slice(0, 10).toUpperCase();
}

async function migrateUsersTable(): Promise<void> {
  await addColumnIfMissing("users", "password_hash", "VARCHAR(512) NOT NULL DEFAULT ''");
  await addColumnIfMissing("users", "role", "VARCHAR(32) NOT NULL DEFAULT 'user'");
  await addColumnIfMissing("users", "plan_id", "VARCHAR(64)");
  await addColumnIfMissing("users", "plan_expires_at", "VARCHAR(32)");
  await addColumnIfMissing("users", "quota_total", "BIGINT NOT NULL DEFAULT 0");
  await addColumnIfMissing("users", "quota_used", "BIGINT NOT NULL DEFAULT 0");
  await addColumnIfMissing("users", "balance_cents", "BIGINT NOT NULL DEFAULT 0");
  await addColumnIfMissing("users", "referral_balance_cents", "BIGINT NOT NULL DEFAULT 0");
  await addColumnIfMissing("users", "invoice_paid_cents", "BIGINT NOT NULL DEFAULT 0");
  await addColumnIfMissing("users", "invoice_reserved_cents", "BIGINT NOT NULL DEFAULT 0");
  await addColumnIfMissing("users", "invoice_issued_cents", "BIGINT NOT NULL DEFAULT 0");
  await addColumnIfMissing("users", "invite_code", "VARCHAR(64)");
  await addColumnIfMissing("users", "inviter_user_id", "VARCHAR(64)");
  await addColumnIfMissing("users", "storage_quota_bytes", "BIGINT NOT NULL DEFAULT 0");
  await addColumnIfMissing("users", "storage_used_bytes", "BIGINT NOT NULL DEFAULT 0");
  await addColumnIfMissing("users", "currency", "VARCHAR(16) NOT NULL DEFAULT 'CNY'");
  await addColumnIfMissing("users", "numeric_id", "BIGINT UNSIGNED NOT NULL DEFAULT 0");
  await addColumnIfMissing("users", "phone", "VARCHAR(32)");
  await addColumnIfMissing("users", "phone_verified_at", "VARCHAR(32)");
  await makeUserEmailNullable();
  await normalizeDuplicateUserEmails();
  await normalizeDuplicateUserPhones();
  await backfillInviteCodes();
  await backfillUsersNumericId();
  await addIndexIfMissing("users", "users_email_unique_idx", "UNIQUE KEY users_email_unique_idx (email)");
  await addIndexIfMissing("users", "users_phone_unique_idx", "UNIQUE KEY users_phone_unique_idx (phone)");
  await addIndexIfMissing("users", "users_invite_code_unique_idx", "UNIQUE KEY users_invite_code_unique_idx (invite_code)");
  await addIndexIfMissing("users", "users_inviter_user_id_idx", "KEY users_inviter_user_id_idx (inviter_user_id)");
  await addIndexIfMissing("users", "users_plan_id_idx", "KEY users_plan_id_idx (plan_id)");
  await addIndexIfMissing("users", "users_numeric_id_unique_idx", "UNIQUE KEY users_numeric_id_unique_idx (numeric_id)");
  await pool.query("ALTER TABLE users MODIFY COLUMN numeric_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT");
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

async function migrateGenerationJobsTable(): Promise<void> {
  await addColumnIfMissing("generation_jobs", "model", "VARCHAR(255)");
  await addColumnIfMissing("generation_jobs", "model_config_id", "VARCHAR(64)");
  await addColumnIfMissing("generation_jobs", "model_provider", "VARCHAR(64)");
  await addColumnIfMissing("generation_jobs", "model_display_name", "VARCHAR(255)");
  await addColumnIfMissing("generation_jobs", "reference_mask_data_url", "LONGTEXT");
}

async function migrateGenerationOutputsTable(): Promise<void> {
  await addColumnIfMissing("generation_outputs", "public_gallery_enabled", "INT NOT NULL DEFAULT 0");
  await addColumnIfMissing("generation_outputs", "public_gallery_sort_order", "INT NOT NULL DEFAULT 0");
  await addColumnIfMissing("generation_outputs", "public_gallery_updated_at", "VARCHAR(32)");
  await addIndexIfMissing(
    "generation_outputs",
    "generation_outputs_public_gallery_idx",
    "KEY generation_outputs_public_gallery_idx (public_gallery_enabled, public_gallery_sort_order, created_at)"
  );
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

async function migrateInvoiceApplicationsTable(): Promise<void> {
  await addColumnIfMissing("invoice_applications", "handled_by_user_id", "VARCHAR(64)");
  await addColumnIfMissing("invoice_applications", "handled_at", "VARCHAR(32)");
  await addColumnIfMissing("invoice_applications", "review_note", "TEXT");
  await addIndexIfMissing(
    "invoice_applications",
    "invoice_applications_user_created_at_idx",
    "KEY invoice_applications_user_created_at_idx (user_id, created_at)"
  );
  await addIndexIfMissing(
    "invoice_applications",
    "invoice_applications_user_status_idx",
    "KEY invoice_applications_user_status_idx (user_id, status)"
  );
}

async function syncInvoiceLedgerCaches(): Promise<void> {
  await pool.query(`
    UPDATE users u
    SET
      invoice_paid_cents = (
        SELECT COALESCE(SUM(o.amount_cents), 0)
        FROM billing_orders o
        WHERE o.user_id = u.id AND o.status = 'paid' AND o.type IN ('recharge', 'plan_purchase')
      ),
      invoice_reserved_cents = (
        SELECT COALESCE(SUM(i.amount_cents), 0)
        FROM invoice_applications i
        WHERE i.user_id = u.id AND i.status IN ('pending', 'processing')
      ),
      invoice_issued_cents = (
        SELECT COALESCE(SUM(i.amount_cents), 0)
        FROM invoice_applications i
        WHERE i.user_id = u.id AND i.status = 'issued'
      )
  `);
}

async function seedDefaultSystemSettings(): Promise<void> {
  const now = new Date().toISOString();
  const defaults = [
    ["billing.imageUnitPrice", { imageUnitPriceCents: 0, currency: "CNY" }],
    [
      "referral.rewards",
      {
        enabled: true,
        baseRegisterCredits: 2,
        inviterRegisterCredits: 4,
        inviteeRegisterCredits: 6,
        rechargeCashbackRateBps: 500,
        planPurchaseCashbackRateBps: 500,
        minCashbackOrderAmountCents: 100,
        currency: "CNY"
      }
    ],
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
    ],
    [
      "auth.wechat.miniapp",
      {
        enabled: wechatMiniAppRuntimeConfig.enabled,
        appId: wechatMiniAppRuntimeConfig.appId ?? "",
        appSecret: wechatMiniAppRuntimeConfig.appSecret ?? "",
        allowBindExistingAccount: true,
        allowRegisterNewUser: true
      }
    ],
    [
      "sms.aliyun",
      {
        enabled: false,
        accessKeyId: "",
        accessKeySecret: "",
        endpoint: "dysmsapi.aliyuncs.com",
        signName: "",
        registerTemplateCode: "",
        bindTemplateCode: ""
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

async function seedDefaultHelpCenter(): Promise<void> {
  const now = new Date().toISOString();
  const categories = [
    { id: "help-getting-started", slug: "getting-started", name: "注册与登录", description: "账号注册、登录、手机号验证和账号安全。", audience: "all", sortOrder: 10 },
    { id: "help-billing", slug: "billing", name: "充值、套餐与提现", description: "充值购买、余额、发票、邀请返现和提现说明。", audience: "all", sortOrder: 20 },
    { id: "help-extension", slug: "extension", name: "插件安装与采集", description: "浏览器插件安装、更新和网页侧商品采集。", audience: "operator", sortOrder: 30 },
    { id: "help-creation", slug: "creation-gallery", name: "生图与作品管理", description: "上传产品图、生成电商图、查看作品库和下载。", audience: "creator", sortOrder: 40 },
    { id: "help-cross-border", slug: "cross-border", name: "跨境电商场景", description: "面向 Amazon、Shopee、独立站等海外渠道的图片生产流程。", audience: "cross-border", sortOrder: 50 },
    { id: "help-1688", slug: "1688-factory", name: "1688 商家场景", description: "工厂、档口、源头商家的主图、详情图和批量出图方法。", audience: "1688", sortOrder: 60 }
  ] as const;

  for (const category of categories) {
    await pool.query(
      `
        INSERT INTO help_categories (id, slug, name, description, audience, sort_order, enabled, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
        ON DUPLICATE KEY UPDATE id = id
      `,
      [category.id, category.slug, category.name, category.description, category.audience, category.sortOrder, now, now]
    );
  }

  const articles = [
    {
      id: "help-article-register-login",
      categoryId: "help-getting-started",
      slug: "register-login",
      title: "如何注册、登录并完成手机号验证",
      summary: "新用户可用手机号注册，已有用户直接登录；进入核心功能前需要完成手机号验证。",
      tags: ["注册", "登录", "手机号"],
      featured: 1,
      sortOrder: 10,
      contentMarkdown: `## 操作步骤

1. 点击注册，填写手机号、验证码和密码。
2. 已有账号选择登录，输入手机号或邮箱和密码。
3. 进入账户页补充手机号验证，验证后可使用生图、作品库、充值等权益。

> 通过邀请链接注册时，邀请码会自动带入，双方可获得对应奖励。`
    },
    {
      id: "help-article-recharge-plan",
      categoryId: "help-billing",
      slug: "recharge-plan-balance",
      title: "如何充值、购买套餐和查看余额",
      summary: "账户页支持查看套餐、额度、余额、订单流水，并可通过支付宝充值或购买套餐。",
      tags: ["充值", "套餐", "余额"],
      featured: 1,
      sortOrder: 10,
      contentMarkdown: `## 充值流程

1. 打开账户页的“套餐与余额”。
2. 输入充值金额，点击支付宝充值。
3. 支付完成后返回页面刷新余额和订单状态。

购买套餐时可选择余额支付或支付宝支付；余额不足时建议先充值再购买。`
    },
    {
      id: "help-article-withdraw",
      categoryId: "help-billing",
      slug: "withdraw-referral-balance",
      title: "如何提现邀请返现",
      summary: "当前系统已有邀请现金返现余额记录，但暂未开放用户端自动提现入口。",
      tags: ["提现", "邀请返现", "余额"],
      featured: 1,
      sortOrder: 20,
      contentMarkdown: `> [!WARNING] 目前没有自动提现接口。邀请返现会进入现金激励账户，后台可查看返现流水；如需提现，建议先由客服或管理员人工登记处理。

## 建议后续补齐的提现规则

- 提现门槛：例如满 50 元可申请。
- 收款方式：支付宝账号、姓名、手机号。
- 审核状态：待审核、处理中、已打款、驳回。
- 风控限制：订单退款期后再结算返现。`
    },
    {
      id: "help-article-extension-install",
      categoryId: "help-extension",
      slug: "install-browser-extension",
      title: "如何安装和更新浏览器插件",
      summary: "下载插件压缩包，解压后在 Chrome 或 Edge 扩展管理页加载目录。",
      tags: ["插件", "Chrome", "Edge"],
      featured: 0,
      sortOrder: 10,
      contentMarkdown: `## 安装步骤

1. 在工具内点击下载插件。
2. 解压 zip 文件。
3. 打开 Chrome 或 Edge 的扩展管理页，启用开发者模式。
4. 选择“加载已解压的扩展程序”，选中解压后的插件目录。

插件更新时重新下载最新版压缩包，替换解压目录后在扩展管理页点击重新加载。`
    },
    {
      id: "help-article-gallery",
      categoryId: "help-creation",
      slug: "view-download-gallery",
      title: "如何查看作品、复用图片和下载",
      summary: "作品库集中展示已生成图片，可预览、下载、复用到画布或删除。",
      tags: ["作品库", "下载", "复用"],
      featured: 0,
      sortOrder: 10,
      contentMarkdown: `## 查看作品

1. 点击顶部“作品库”。
2. 按生成时间查看图片。
3. 选择图片下载，或复用回画布继续编辑。

> [!INFO] 云存储开启后，作品可跨设备查看；删除作品会移除对应记录。`
    },
    {
      id: "help-article-cross-border",
      categoryId: "help-cross-border",
      slug: "cross-border-product-images",
      title: "跨境卖家如何从工厂图生成海外电商素材",
      summary: "把中文商品图、工厂实拍图转成适合海外市场的主图、场景图、卖点图和多语言素材。",
      tags: ["跨境电商", "Amazon", "Shopee", "独立站"],
      featured: 1,
      sortOrder: 10,
      contentMarkdown: `## 推荐流程

1. 上传清晰产品图，补充英文商品标题和核心卖点。
2. 选择目标平台和市场，如 Amazon 美国站或 Shopee 东南亚。
3. 选择主图、场景图、详情图等模板，一次生成多张候选。
4. 下载合规图片后上传到店铺，保留效果好的提示词继续迭代。

## 适合场景

- 铺货前快速测试图片方向。
- 把 1688 或淘宝供货图改成海外审美。
- 为独立站、广告投放、社媒种草补齐素材。`
    },
    {
      id: "help-article-1688",
      categoryId: "help-1688",
      slug: "1688-factory-main-image",
      title: "1688 商家如何低成本做主图和详情图",
      summary: "源头工厂可用现有白底图、实拍图快速生成模特图、场景图和详情页素材。",
      tags: ["1688", "工厂", "主图", "详情页"],
      featured: 1,
      sortOrder: 10,
      contentMarkdown: `## 推荐流程

1. 上传商品白底图或实拍图。
2. 填写材质、尺寸、适用人群、使用场景。
3. 选择主图、场景图或详情页模板生成。
4. 把满意图片下载后用于 1688 店铺装修、旺铺详情、活动页。

> [!SUCCESS] 适合服饰、箱包、家居、小商品、美妆包装等需要多场景展示的类目。`
    }
  ] as const;

  for (const article of articles) {
    await pool.query(
      `
        INSERT INTO help_articles (
          id, category_id, slug, title, summary, content_json, status, featured, sort_order, tags_json, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, 'published', ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE id = id
      `,
      [
        article.id,
        article.categoryId,
        article.slug,
        article.title,
        article.summary,
        article.contentMarkdown,
        article.featured,
        article.sortOrder,
        JSON.stringify(article.tags),
        now,
        now
      ]
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

async function makeUserEmailNullable(): Promise<void> {
  await pool.query("ALTER TABLE users MODIFY COLUMN email VARCHAR(255) NULL");
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

async function normalizeDuplicateUserPhones(): Promise<void> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `
      SELECT id, phone
      FROM users
      WHERE phone IS NOT NULL AND phone <> ''
      ORDER BY phone, created_at, id
    `
  );
  const seen = new Set<string>();
  for (const row of rows) {
    const phone = String(row.phone).trim();
    if (!seen.has(phone)) {
      seen.add(phone);
      continue;
    }

    await pool.query("UPDATE users SET phone = NULL, phone_verified_at = NULL WHERE id = ?", [row.id]);
  }
}

async function backfillInviteCodes(): Promise<void> {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT id FROM users WHERE invite_code IS NULL OR invite_code = ''");
  for (const row of rows) {
    if (typeof row.id === "string") {
      await pool.query("UPDATE users SET invite_code = ? WHERE id = ?", [inviteCodeFromUserId(row.id), row.id]);
    }
  }
}

async function backfillUsersNumericId(): Promise<void> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `
      SELECT id, numeric_id
      FROM users
      WHERE numeric_id IS NULL OR numeric_id = 0
      ORDER BY created_at, id
    `
  );
  if (rows.length === 0) {
    return;
  }

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (typeof row.id === "string") {
      await pool.query("UPDATE users SET numeric_id = ? WHERE id = ?", [index + 1, row.id]);
    }
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
