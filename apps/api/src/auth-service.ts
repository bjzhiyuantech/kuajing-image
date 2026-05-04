import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { and, eq, or } from "drizzle-orm";
import { hashPassword, requireJwtSecret, signJwt, verifyJwt, verifyPassword } from "./auth-crypto.js";
import type { RequestTenant } from "./auth-context.js";
import type {
  AdminWechatMiniAppConfigResponse,
  AuthMeResponse,
  AuthResponse,
  AuthUser,
  AuthWorkspace,
  SaveWechatMiniAppConfigRequest,
  UpdateAuthProfileRequest,
  WechatMiniAppConfigResponse,
  WechatMiniAppLoginRequest,
  WechatMiniAppLoginResponse,
  WechatMiniAppRegisterRequest
} from "./contracts.js";
import { db } from "./database.js";
import { ensureUserPlanCurrent } from "./plan-expiration.js";
import {
  inviteCodeFromUserId,
  registerQuotaTotal,
  resolveInviter,
  rewardInviterForRegistration
} from "./referral-service.js";
import { wechatMiniAppRuntimeConfig } from "./runtime.js";
import { subscriptionPlans, users, wechatAccounts, workspaceMembers, workspaces } from "./schema.js";
import { normalizePhone, validatePhone, verifyBindPhoneSmsCode, verifyRegisterSmsCode } from "./sms-service.js";
import { getSystemSetting, saveSystemSetting } from "./system-settings.js";

const DEFAULT_PLAN_ID = "free";
const DEFAULT_PLAN_NAME = "Free";
const DEFAULT_STORAGE_QUOTA_BYTES = 1024 * 1024 * 1024;
const WECHAT_MINIAPP_SETTINGS_KEY = "auth.wechat.miniapp";
const WECHAT_PROVIDER = "miniapp";
const WECHAT_BIND_TOKEN_TTL_SECONDS = 10 * 60;

export interface AuthSession {
  user: AuthUser;
  workspace: AuthWorkspace;
  tenant: RequestTenant;
}

export interface RegisterInput {
  phone: string;
  password: string;
  displayName?: string;
  smsCode: string;
  inviteCode?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface BindPhoneInput {
  phone: string;
  smsCode: string;
}

interface WechatSession {
  openid: string;
  unionid?: string;
}

interface WechatBindTokenPayload {
  openId: string;
  unionId?: string;
  iat: number;
  exp: number;
}

export async function registerUser(input: RegisterInput): Promise<AuthResponse> {
  requireJwtSecret();
  const phone = normalizePhone(input.phone);
  const password = input.password;
  const displayName = normalizeDisplayName(input.displayName, phone);
  validatePhone(phone);
  validatePassword(password);

  const existing = await findUserByPhone(phone);
  if (existing) {
    throw new AuthError("phone_exists", "该手机号已经注册。", 409);
  }
  await verifyRegisterSmsCode(phone, input.smsCode);

  const now = new Date().toISOString();
  const userId = randomUUID();
  const workspaceId = randomUUID();
  const defaultPlan = await getDefaultPlan();
  const inviter = await resolveInviter(input.inviteCode, userId);
  const quotaTotal = await registerQuotaTotal({ baseQuota: defaultPlan.imageQuota, inviter });
  try {
    await db.transaction(async (tx) => {
      await tx.insert(users).values({
        id: userId,
        numericId: undefined,
        email: null,
        phone,
        phoneVerifiedAt: now,
        passwordHash: hashPassword(password),
        displayName,
        role: "user",
        planId: defaultPlan.id,
        planExpiresAt: null,
        quotaTotal,
        quotaUsed: 0,
        balanceCents: 0,
        referralBalanceCents: 0,
        inviteCode: inviteCodeFromUserId(userId),
        inviterUserId: inviter?.id,
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
      throw new AuthError("phone_exists", "该手机号已经注册。", 409);
    }
    throw error;
  }
  await rewardInviterForRegistration({ inviter, inviteeUserId: userId, now });

  return buildAuthResponse({
    user: toAuthUser({
      id: userId,
      numericId: 0,
      email: null,
      phone,
      phoneVerifiedAt: now,
      passwordHash: "",
      displayName,
      role: "user",
      planId: defaultPlan.id,
      planExpiresAt: null,
      quotaTotal,
      quotaUsed: 0,
      balanceCents: 0,
      referralBalanceCents: 0,
      inviteCode: inviteCodeFromUserId(userId),
      inviterUserId: inviter?.id ?? null,
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
  await ensureUserPlanCurrent(user.id);
  const currentUser = (await findUserByEmail(email)) ?? user;

  const workspace = await findDefaultWorkspace(currentUser.id);
  if (!workspace) {
    throw new AuthError("workspace_missing", "用户工作区不存在。", 403);
  }

  return buildAuthResponse({
    user: toAuthUser(currentUser, await findPlanById(currentUser.planId)),
    workspace
  });
}

export async function updateAuthProfile(headers: Headers, input: UpdateAuthProfileRequest): Promise<AuthMeResponse> {
  const session = await requireAuthSession(headers);
  const now = new Date().toISOString();
  const patch: Partial<typeof users.$inferInsert> = { updatedAt: now };

  if (typeof input.displayName === "string" && input.displayName.trim()) {
    patch.displayName = input.displayName.trim().slice(0, 255);
  }
  if (typeof input.email === "string" && input.email.trim()) {
    const email = normalizeEmail(input.email);
    validateEmail(email);
    const existing = await findUserByEmail(email);
    if (existing && existing.id !== session.user.id) {
      throw new AuthError("email_exists", "该邮箱已经被其他账号绑定。", 409);
    }
    patch.email = email;
  }
  if (typeof input.password === "string" && input.password) {
    validatePassword(input.password);
    patch.passwordHash = hashPassword(input.password);
  }

  await db.update(users).set(patch).where(eq(users.id, session.user.id));
  return toMeResponse(await requireAuthSession(new Headers({ authorization: `Bearer ${parseBearerToken(headers) ?? ""}` })));
}

export async function bindCurrentUserPhone(headers: Headers, input: BindPhoneInput): Promise<AuthMeResponse> {
  const session = await requireAuthSession(headers);
  const phone = normalizePhone(input.phone);
  validatePhone(phone);
  const existing = await findUserByPhone(phone);
  if (existing && existing.id !== session.user.id) {
    throw new AuthError("phone_exists", "该手机号已经被其他账号绑定。", 409);
  }
  await verifyBindPhoneSmsCode(phone, input.smsCode);
  await db
    .update(users)
    .set({ phone, phoneVerifiedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    .where(eq(users.id, session.user.id));
  return toMeResponse(await requireAuthSession(new Headers({ authorization: `Bearer ${parseBearerToken(headers) ?? ""}` })));
}

export async function getWechatMiniAppConfig(): Promise<WechatMiniAppConfigResponse> {
  return {
    wechatMiniApp: toWechatMiniAppPublicConfig(await getRawWechatMiniAppConfig())
  };
}

export async function getAdminWechatMiniAppConfig(): Promise<AdminWechatMiniAppConfigResponse> {
  const row = await getSystemSetting(WECHAT_MINIAPP_SETTINGS_KEY);
  const config = parseRecord(row?.valueJson);
  return {
    wechatMiniApp: {
      ...toWechatMiniAppPublicConfig(config, row?.updatedAt),
      appId: stringValue(config.appId) ?? "",
      appSecret: {
        hasSecret: Boolean(stringValue(config.appSecret)),
        value: maskSecret(stringValue(config.appSecret))
      }
    }
  };
}

export async function saveWechatMiniAppConfig(input: SaveWechatMiniAppConfigRequest): Promise<AdminWechatMiniAppConfigResponse> {
  const existing = parseRecord((await getSystemSetting(WECHAT_MINIAPP_SETTINGS_KEY))?.valueJson);
  const value = {
    enabled: input.enabled === true,
    appId: limitedString(input.appId, 255) ?? stringValue(existing.appId) ?? "",
    appSecret: input.preserveAppSecret === true ? stringValue(existing.appSecret) ?? "" : limitedString(input.appSecret, 512) ?? "",
    allowBindExistingAccount: input.allowBindExistingAccount !== false,
    allowRegisterNewUser: input.allowRegisterNewUser !== false
  };
  if (value.enabled && (!value.appId || !value.appSecret)) {
    throw new AuthError("invalid_wechat_config", "启用微信小程序登录时需要配置 appId 和 appSecret。", 400);
  }
  await saveSystemSetting(WECHAT_MINIAPP_SETTINGS_KEY, value);
  return getAdminWechatMiniAppConfig();
}

export async function loginWithWechatMiniApp(input: WechatMiniAppLoginRequest): Promise<WechatMiniAppLoginResponse> {
  requireJwtSecret();
  const config = await getRawWechatMiniAppConfig();
  ensureWechatMiniAppEnabled(config);
  const session = await fetchWechatSession(input.code, config);
  const account = await findWechatAccount(session);
  if (account) {
    const user = await findUserById(account.userId);
    const workspace = user ? await findDefaultWorkspace(user.id) : undefined;
    if (user && workspace) {
      return {
        status: "bound",
        session: buildAuthResponse({ user: toAuthUser(user, await findPlanById(user.planId)), workspace })
      };
    }
  }
  return {
    status: "needs_bind",
    bindToken: signWechatBindToken(session),
    allowBindExistingAccount: config.allowBindExistingAccount !== false,
    allowRegisterNewUser: config.allowRegisterNewUser !== false
  };
}

export async function bindWechatMiniAppToCurrentUser(headers: Headers, input: { bindToken: string }): Promise<AuthResponse> {
  const session = await requireAuthSession(headers);
  const wechat = verifyWechatBindToken(input.bindToken);
  await linkWechatAccount(session.user.id, wechat);
  return buildAuthResponse({ user: session.user, workspace: session.workspace });
}

export async function registerWechatMiniAppUser(input: WechatMiniAppRegisterRequest): Promise<AuthResponse> {
  requireJwtSecret();
  const config = await getRawWechatMiniAppConfig();
  ensureWechatMiniAppEnabled(config);
  if (config.allowRegisterNewUser === false) {
    throw new AuthError("wechat_register_disabled", "暂未开启微信新用户注册。", 403);
  }
  const wechat = verifyWechatBindToken(input.bindToken);
  const existing = await findWechatAccount(wechat);
  if (existing) {
    const user = await findUserById(existing.userId);
    const workspace = user ? await findDefaultWorkspace(user.id) : undefined;
    if (user && workspace) {
      return buildAuthResponse({ user: toAuthUser(user, await findPlanById(user.planId)), workspace });
    }
  }

  const email = input.email?.trim() ? normalizeEmail(input.email) : undefined;
  if (email) {
    validateEmail(email);
    const existingEmailUser = await findUserByEmail(email);
    if (existingEmailUser) {
      throw new AuthError("email_exists", "该邮箱已经注册，请先登录后绑定微信。", 409);
    }
  }

  const now = new Date().toISOString();
  const userId = randomUUID();
  const workspaceId = randomUUID();
  const defaultPlan = await getDefaultPlan();
  const displayName = input.displayName?.trim() || `微信用户${wechat.openId.slice(-4)}`;
  const inviter = await resolveInviter(input.inviteCode, userId);
  const quotaTotal = await registerQuotaTotal({ baseQuota: defaultPlan.imageQuota, inviter });
  await db.transaction(async (tx) => {
    await tx.insert(users).values({
      id: userId,
      numericId: undefined,
      email: email ?? null,
      passwordHash: "",
      displayName,
      role: "user",
      planId: defaultPlan.id,
      planExpiresAt: null,
      quotaTotal,
      quotaUsed: 0,
      balanceCents: 0,
      referralBalanceCents: 0,
      inviteCode: inviteCodeFromUserId(userId),
      inviterUserId: inviter?.id ?? null,
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
    await tx.insert(wechatAccounts).values({
      id: randomUUID(),
      userId,
      provider: WECHAT_PROVIDER,
      openId: wechat.openId,
      unionId: wechat.unionId,
      nickname: displayName,
      avatarUrl: null,
      createdAt: now,
      updatedAt: now
    });
  });
  await rewardInviterForRegistration({ inviter, inviteeUserId: userId, now });

  return buildAuthResponse({
    user: toAuthUser({
      id: userId,
      numericId: 0,
      email: email ?? null,
      phone: null,
      phoneVerifiedAt: null,
      passwordHash: "",
      displayName,
      role: "user",
      planId: defaultPlan.id,
      planExpiresAt: null,
      quotaTotal,
      quotaUsed: 0,
      balanceCents: 0,
      referralBalanceCents: 0,
      inviteCode: inviteCodeFromUserId(userId),
      inviterUserId: inviter?.id ?? null,
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

  await ensureUserPlanCurrent(payload.sub);
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

async function findUserByPhone(phone: string): Promise<(typeof users.$inferSelect) | undefined> {
  const [row] = await db.select().from(users).where(eq(users.phone, phone)).limit(1);
  return row;
}

async function findUserById(userId: string): Promise<(typeof users.$inferSelect) | undefined> {
  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return row;
}

async function findWechatAccount(input: Pick<WechatSession, "openid"> | { openId: string; unionId?: string }): Promise<typeof wechatAccounts.$inferSelect | undefined> {
  const openId = "openid" in input ? input.openid : input.openId;
  const unionId = "unionId" in input ? input.unionId : undefined;
  const where = unionId
    ? or(and(eq(wechatAccounts.provider, WECHAT_PROVIDER), eq(wechatAccounts.openId, openId)), and(eq(wechatAccounts.provider, WECHAT_PROVIDER), eq(wechatAccounts.unionId, unionId)))
    : and(eq(wechatAccounts.provider, WECHAT_PROVIDER), eq(wechatAccounts.openId, openId));
  const [row] = await db.select().from(wechatAccounts).where(where).limit(1);
  return row;
}

async function linkWechatAccount(userId: string, input: WechatBindTokenPayload): Promise<void> {
  const existing = await findWechatAccount(input);
  if (existing && existing.userId !== userId) {
    throw new AuthError("wechat_already_bound", "该微信账号已经绑定其他用户。", 409);
  }
  const now = new Date().toISOString();
  await db
    .insert(wechatAccounts)
    .values({
      id: existing?.id ?? randomUUID(),
      userId,
      provider: WECHAT_PROVIDER,
      openId: input.openId,
      unionId: input.unionId,
      nickname: null,
      avatarUrl: null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    })
    .onDuplicateKeyUpdate({
      set: {
        userId,
        unionId: input.unionId,
        updatedAt: now
      }
    });
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
    phone: row.phone ?? "",
    phoneVerifiedAt: row.phoneVerifiedAt ?? undefined,
    displayName: row.displayName,
    role: row.role === "admin" ? "admin" : "user",
    planId: row.planId ?? undefined,
    planName: plan?.name,
    planExpiresAt: row.planExpiresAt ?? undefined,
    quotaTotal: Number(row.quotaTotal ?? 0),
    quotaUsed: Number(row.quotaUsed ?? 0),
    balanceCents: Number(row.balanceCents ?? 0),
    referralBalanceCents: Number(row.referralBalanceCents ?? 0),
    currency: row.currency ?? "CNY",
    inviteCode: row.inviteCode ?? undefined,
    inviterUserId: row.inviterUserId ?? undefined,
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

function parseRecord(value: string | undefined | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function limitedString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
}

function maskSecret(value: string | undefined): string {
  if (!value) return "";
  if (value.length <= 8) return "********";
  return `${value.slice(0, 4)}********${value.slice(-4)}`;
}

async function getRawWechatMiniAppConfig(): Promise<Record<string, unknown>> {
  const saved = parseRecord((await getSystemSetting(WECHAT_MINIAPP_SETTINGS_KEY))?.valueJson);
  if (saved.enabled === true || !wechatMiniAppRuntimeConfig.enabled) {
    return saved;
  }
  return {
    ...saved,
    enabled: true,
    appId: stringValue(saved.appId) ?? wechatMiniAppRuntimeConfig.appId ?? "",
    appSecret: stringValue(saved.appSecret) ?? wechatMiniAppRuntimeConfig.appSecret ?? "",
    allowBindExistingAccount: saved.allowBindExistingAccount !== false,
    allowRegisterNewUser: saved.allowRegisterNewUser !== false
  };
}

function toWechatMiniAppPublicConfig(value: Record<string, unknown>, updatedAt?: string): WechatMiniAppConfigResponse["wechatMiniApp"] {
  return {
    enabled: value.enabled === true,
    allowBindExistingAccount: value.allowBindExistingAccount !== false,
    allowRegisterNewUser: value.allowRegisterNewUser !== false,
    updatedAt
  };
}

function ensureWechatMiniAppEnabled(config: Record<string, unknown>): void {
  if (config.enabled !== true) {
    throw new AuthError("wechat_disabled", "微信小程序登录暂未启用。", 403);
  }
  if (!stringValue(config.appId) || !stringValue(config.appSecret)) {
    throw new AuthError("wechat_not_configured", "微信小程序登录配置不完整。", 500);
  }
}

async function fetchWechatSession(code: string, config: Record<string, unknown>): Promise<WechatSession> {
  const cleanCode = code.trim();
  if (!cleanCode) {
    throw new AuthError("invalid_wechat_code", "微信登录 code 不能为空。", 400);
  }
  const url = new URL("https://api.weixin.qq.com/sns/jscode2session");
  url.searchParams.set("appid", stringValue(config.appId) ?? "");
  url.searchParams.set("secret", stringValue(config.appSecret) ?? "");
  url.searchParams.set("js_code", cleanCode);
  url.searchParams.set("grant_type", "authorization_code");
  const response = await fetch(url);
  const body = (await response.json()) as unknown;
  if (!response.ok || typeof body !== "object" || body === null) {
    throw new AuthError("wechat_session_failed", "微信登录校验失败。", 502);
  }
  const data = body as Record<string, unknown>;
  if (typeof data.errcode === "number" && data.errcode !== 0) {
    throw new AuthError("wechat_session_failed", typeof data.errmsg === "string" ? data.errmsg : "微信登录校验失败。", 502);
  }
  if (typeof data.openid !== "string" || !data.openid) {
    throw new AuthError("wechat_session_failed", "微信未返回 openid。", 502);
  }
  return {
    openid: data.openid,
    unionid: typeof data.unionid === "string" ? data.unionid : undefined
  };
}

function signWechatBindToken(input: WechatSession): string {
  const secret = requireJwtSecret();
  const now = Math.floor(Date.now() / 1000);
  const payload: WechatBindTokenPayload = {
    openId: input.openid,
    unionId: input.unionid,
    iat: now,
    exp: now + WECHAT_BIND_TOKEN_TTL_SECONDS
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}

function verifyWechatBindToken(token: string): WechatBindTokenPayload {
  const secret = requireJwtSecret();
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    throw new AuthError("invalid_bind_token", "微信绑定凭证无效。", 401);
  }
  const expected = createHmac("sha256", secret).update(encodedPayload).digest("base64url");
  if (!safeEqualString(signature, expected)) {
    throw new AuthError("invalid_bind_token", "微信绑定凭证无效。", 401);
  }
  const parsed = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as unknown;
  if (!isWechatBindTokenPayload(parsed) || parsed.exp <= Math.floor(Date.now() / 1000)) {
    throw new AuthError("invalid_bind_token", "微信绑定凭证已过期，请重新授权。", 401);
  }
  return parsed;
}

function isWechatBindTokenPayload(value: unknown): value is WechatBindTokenPayload {
  if (typeof value !== "object" || value === null) return false;
  const payload = value as Partial<WechatBindTokenPayload>;
  return typeof payload.openId === "string" && typeof payload.iat === "number" && typeof payload.exp === "number";
}

function safeEqualString(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function workspaceMemberId(workspaceId: string, userId: string): string {
  return createHash("sha256").update(`${workspaceId}:${userId}`).digest("hex");
}

function isDuplicateEntry(error: unknown): boolean {
  return error instanceof Error && (error as { code?: unknown }).code === "ER_DUP_ENTRY";
}
