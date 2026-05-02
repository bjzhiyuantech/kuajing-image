import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { hashPassword, requireJwtSecret, signJwt, verifyJwt, verifyPassword } from "./auth-crypto.js";
import type { RequestTenant } from "./auth-context.js";
import type { AuthMeResponse, AuthResponse, AuthUser, AuthWorkspace } from "./contracts.js";
import { db } from "./database.js";
import { subscriptionPlans, users, workspaceMembers, workspaces } from "./schema.js";

const DEFAULT_PLAN_ID = "free";
const DEFAULT_PLAN_NAME = "Free";
const DEFAULT_STORAGE_QUOTA_BYTES = 1024 * 1024 * 1024;

export interface AuthSession {
  user: AuthUser;
  workspace: AuthWorkspace;
  tenant: RequestTenant;
}

export interface RegisterInput {
  email: string;
  password: string;
  displayName?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export async function registerUser(input: RegisterInput): Promise<AuthResponse> {
  requireJwtSecret();
  const email = normalizeEmail(input.email);
  const password = input.password;
  const displayName = normalizeDisplayName(input.displayName, email);
  validateEmail(email);
  validatePassword(password);

  const existing = await findUserByEmail(email);
  if (existing) {
    throw new AuthError("email_exists", "该邮箱已经注册。", 409);
  }

  const now = new Date().toISOString();
  const userId = randomUUID();
  const workspaceId = randomUUID();
  const defaultPlan = await getDefaultPlan();
  try {
    await db.transaction(async (tx) => {
      await tx.insert(users).values({
        id: userId,
        email,
        passwordHash: hashPassword(password),
        displayName,
        role: "user",
        planId: defaultPlan.id,
        quotaTotal: defaultPlan.imageQuota,
        quotaUsed: 0,
        balanceCents: 0,
        storageQuotaBytes: defaultPlan.storageQuotaBytes,
        storageUsedBytes: 0,
        currency: "CNY",
        createdAt: now,
        updatedAt: now
      });
      await tx.insert(workspaces).values({
        id: workspaceId,
        name: `${displayName}'s Workspace`,
        ownerUserId: userId,
        createdAt: now,
        updatedAt: now
      });
      await tx.insert(workspaceMembers).values({
        id: workspaceMemberId(workspaceId, userId),
        workspaceId,
        userId,
        role: "owner",
        createdAt: now,
        updatedAt: now
      });
    });
  } catch (error) {
    if (isDuplicateEntry(error)) {
      throw new AuthError("email_exists", "该邮箱已经注册。", 409);
    }
    throw error;
  }

  return buildAuthResponse({
    user: toAuthUser({
      id: userId,
      email,
      passwordHash: "",
      displayName,
      role: "user",
      planId: defaultPlan.id,
      quotaTotal: defaultPlan.imageQuota,
      quotaUsed: 0,
      balanceCents: 0,
      storageQuotaBytes: defaultPlan.storageQuotaBytes,
      storageUsedBytes: 0,
      currency: "CNY",
      createdAt: now,
      updatedAt: now
    }, { name: defaultPlan.name }),
    workspace: {
      id: workspaceId,
      name: `${displayName}'s Workspace`,
      role: "owner"
    }
  });
}

export async function loginUser(input: LoginInput): Promise<AuthResponse> {
  requireJwtSecret();
  const email = normalizeEmail(input.email);
  const user = await findUserByEmail(email);
  if (!user || !verifyPassword(input.password, user.passwordHash)) {
    throw new AuthError("invalid_credentials", "邮箱或密码不正确。", 401);
  }

  const workspace = await findDefaultWorkspace(user.id);
  if (!workspace) {
    throw new AuthError("workspace_missing", "用户工作区不存在。", 403);
  }

  return buildAuthResponse({
    user: toAuthUser(user, await findPlanById(user.planId)),
    workspace
  });
}

export async function getAuthSession(headers: Headers): Promise<AuthSession | undefined> {
  const token = parseBearerToken(headers);
  if (!token) {
    return undefined;
  }

  return getAuthSessionFromToken(token);
}

export async function getAuthSessionFromToken(token: string): Promise<AuthSession | undefined> {
  const payload = verifyJwt(token);
  if (!payload) {
    return undefined;
  }

  const [row] = await db
    .select({
      user: users,
      plan: subscriptionPlans,
      workspace: workspaces,
      member: workspaceMembers
    })
    .from(users)
    .leftJoin(subscriptionPlans, eq(subscriptionPlans.id, users.planId))
    .innerJoin(workspaceMembers, eq(workspaceMembers.userId, users.id))
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(and(eq(users.id, payload.sub), eq(workspaces.id, payload.workspaceId)))
    .limit(1);

  if (!row) {
    return undefined;
  }

  const user = toAuthUser(row.user, row.plan);
  const workspace = {
    id: row.workspace.id,
    name: row.workspace.name,
    role: row.member.role
  };

  return {
    user,
    workspace,
    tenant: {
      userId: user.id,
      workspaceId: workspace.id
    }
  };
}

export async function requireAuthSession(headers: Headers): Promise<AuthSession> {
  const session = await getAuthSession(headers);
  if (!session) {
    throw new AuthError("unauthorized", "请先登录，并使用 Authorization: Bearer <JWT> 访问接口。", 401);
  }

  return session;
}

export async function requireAdminSession(headers: Headers): Promise<AuthSession> {
  const session = await requireAuthSession(headers);
  if (session.user.role !== "admin") {
    throw new AuthError("forbidden", "需要管理员权限。", 403);
  }

  return session;
}

export function toMeResponse(session: AuthSession): AuthMeResponse {
  return {
    user: session.user,
    workspace: session.workspace
  };
}

export class AuthError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number
  ) {
    super(message);
  }
}

async function findUserByEmail(email: string): Promise<(typeof users.$inferSelect) | undefined> {
  const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return row;
}

async function findPlanById(planId: string | null | undefined): Promise<(typeof subscriptionPlans.$inferSelect) | undefined> {
  if (!planId) {
    return undefined;
  }
  const [row] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, planId)).limit(1);
  return row;
}

async function getDefaultPlan(): Promise<Pick<typeof subscriptionPlans.$inferSelect, "id" | "name" | "imageQuota" | "storageQuotaBytes">> {
  const plan = await findPlanById(DEFAULT_PLAN_ID);
  return {
    id: plan?.id ?? DEFAULT_PLAN_ID,
    name: plan?.name ?? DEFAULT_PLAN_NAME,
    imageQuota: Number(plan?.imageQuota ?? 0),
    storageQuotaBytes: Number(plan?.storageQuotaBytes ?? DEFAULT_STORAGE_QUOTA_BYTES)
  };
}

async function findDefaultWorkspace(userId: string): Promise<AuthWorkspace | undefined> {
  const [row] = await db
    .select({
      workspace: workspaces,
      member: workspaceMembers
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(eq(workspaceMembers.userId, userId))
    .limit(1);

  return row
    ? {
        id: row.workspace.id,
        name: row.workspace.name,
        role: row.member.role
      }
    : undefined;
}

function buildAuthResponse(input: { user: AuthUser; workspace: AuthWorkspace }): AuthResponse {
  return {
    user: input.user,
    workspace: input.workspace,
    token: signJwt({
      sub: input.user.id,
      workspaceId: input.workspace.id,
      role: input.user.role
    })
  };
}

function toAuthUser(row: typeof users.$inferSelect, plan?: Pick<typeof subscriptionPlans.$inferSelect, "name"> | null): AuthUser {
  return {
    id: row.id,
    email: row.email ?? "",
    displayName: row.displayName,
    role: row.role === "admin" ? "admin" : "user",
    planId: row.planId ?? undefined,
    planName: plan?.name,
    quotaTotal: Number(row.quotaTotal ?? 0),
    quotaUsed: Number(row.quotaUsed ?? 0),
    balanceCents: Number(row.balanceCents ?? 0),
    currency: row.currency ?? "CNY",
    storageQuotaBytes: Number(row.storageQuotaBytes ?? 0),
    storageUsedBytes: Number(row.storageUsedBytes ?? 0),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function parseBearerToken(headers: Headers): string | undefined {
  const authorization = headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/iu.exec(authorization);
  return match?.[1]?.trim() || undefined;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeDisplayName(displayName: string | undefined, email: string): string {
  const trimmed = displayName?.trim();
  return trimmed || email.split("@", 1)[0] || "User";
}

function validateEmail(email: string): void {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email) || email.length > 255) {
    throw new AuthError("invalid_email", "请输入有效邮箱。", 400);
  }
}

function validatePassword(password: string): void {
  if (password.length < 8) {
    throw new AuthError("weak_password", "密码至少需要 8 位。", 400);
  }
}

function workspaceMemberId(workspaceId: string, userId: string): string {
  return createHash("sha256").update(`${workspaceId}:${userId}`).digest("hex");
}

function isDuplicateEntry(error: unknown): boolean {
  return error instanceof Error && (error as { code?: unknown }).code === "ER_DUP_ENTRY";
}
