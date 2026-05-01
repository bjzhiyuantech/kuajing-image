import { createHash } from "node:crypto";
import { drizzle } from "drizzle-orm/mysql2";
import { createPool, type Pool, type PoolOptions } from "mysql2/promise";
import { DEMO_USER_ID, DEMO_WORKSPACE_ID, type RequestTenant } from "./auth-context.js";
import { ensureRuntimeStorage, mysqlConfig } from "./runtime.js";
import * as schema from "./schema.js";

ensureRuntimeStorage();

const pool = createMysqlPool();

export const db = drizzle(pool, { schema, mode: "default" });

export async function initializeDatabase(): Promise<void> {
  try {
    await pool.query("SELECT 1");
    await createSchema();
    await ensureDemoTenant();
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
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(64) PRIMARY KEY,
      email VARCHAR(255),
      display_name VARCHAR(255) NOT NULL,
      created_at VARCHAR(32) NOT NULL,
      updated_at VARCHAR(32) NOT NULL
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
  await upsertTenantRows({
    userId: DEMO_USER_ID,
    workspaceId: DEMO_WORKSPACE_ID,
    email: "demo@example.local",
    displayName: "Demo User",
    workspaceName: "Demo Workspace",
    role: "owner",
    now
  });
}

async function upsertTenantRows(input: {
  userId: string;
  workspaceId: string;
  email: string | null;
  displayName: string;
  workspaceName: string;
  role: string;
  now: string;
}): Promise<void> {
  await pool.query(
    `
      INSERT INTO users (id, email, display_name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE display_name = VALUES(display_name), updated_at = VALUES(updated_at)
    `,
    [input.userId, input.email, input.displayName, input.now, input.now]
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
