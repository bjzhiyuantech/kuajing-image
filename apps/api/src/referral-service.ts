import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type {
  AdminInviteRewardSettingsResponse,
  BillingTransactionsResponse,
  InviteRewardSettings,
  InviteSummaryResponse,
  SaveInviteRewardSettingsRequest
} from "./contracts.js";
import { db } from "./database.js";
import { billingTransactions, systemSettings, users } from "./schema.js";
import { getSystemSetting, saveSystemSetting } from "./system-settings.js";

const REFERRAL_SETTINGS_KEY = "referral.rewards";
const DEFAULT_CURRENCY = "CNY";

const defaultInviteSettings: InviteRewardSettings = {
  enabled: true,
  baseRegisterCredits: 2,
  inviterRegisterCredits: 4,
  inviteeRegisterCredits: 6,
  rechargeCashbackRateBps: 500,
  planPurchaseCashbackRateBps: 500,
  minCashbackOrderAmountCents: 100,
  currency: DEFAULT_CURRENCY
};

export class ReferralError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400
  ) {
    super(message);
  }
}

export async function getInviteRewardSettings(): Promise<AdminInviteRewardSettingsResponse> {
  const row = await getSystemSetting(REFERRAL_SETTINGS_KEY);
  return {
    settings: {
      ...settingsFromValue(parseRecord(row?.valueJson)),
      updatedAt: row?.updatedAt
    }
  };
}

export async function saveInviteRewardSettings(input: SaveInviteRewardSettingsRequest): Promise<AdminInviteRewardSettingsResponse> {
  const settings: InviteRewardSettings = {
    enabled: input.enabled === true,
    baseRegisterCredits: nonNegativeInteger(input.baseRegisterCredits) ?? defaultInviteSettings.baseRegisterCredits,
    inviterRegisterCredits: nonNegativeInteger(input.inviterRegisterCredits) ?? defaultInviteSettings.inviterRegisterCredits,
    inviteeRegisterCredits: nonNegativeInteger(input.inviteeRegisterCredits) ?? defaultInviteSettings.inviteeRegisterCredits,
    rechargeCashbackRateBps: basisPoints(input.rechargeCashbackRateBps),
    planPurchaseCashbackRateBps: basisPoints(input.planPurchaseCashbackRateBps),
    minCashbackOrderAmountCents: nonNegativeInteger(input.minCashbackOrderAmountCents) ?? 0,
    currency: (input.currency?.trim() || DEFAULT_CURRENCY).toUpperCase()
  };
  await saveSystemSetting(REFERRAL_SETTINGS_KEY, settings);
  return getInviteRewardSettings();
}

export async function getInviteSummary(userId: string, origin?: string): Promise<InviteSummaryResponse> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) {
    throw new ReferralError("user_not_found", "用户不存在。", 404);
  }
  const inviteCode = user.inviteCode || inviteCodeFromUserId(user.id);
  if (!user.inviteCode) {
    await db.update(users).set({ inviteCode, updatedAt: new Date().toISOString() }).where(eq(users.id, user.id));
  }
  const [invitees, invitedCountRows, successfulRows, settingsResponse] = await Promise.all([
    db
      .select({
        userId: users.id,
        email: users.email,
        displayName: users.displayName,
        createdAt: users.createdAt
      })
      .from(users)
      .where(eq(users.inviterUserId, user.id))
      .orderBy(desc(users.createdAt)),
    db.select({ count: sql<number>`count(*)` }).from(users).where(eq(users.inviterUserId, user.id)),
    db
      .select({ count: sql<number>`count(distinct ${billingTransactions.createdByUserId})` })
      .from(billingTransactions)
      .where(and(eq(billingTransactions.userId, user.id), eq(billingTransactions.type, "referral_cashback"))),
    getInviteRewardSettings()
  ]);
  return {
    invite: {
      inviteCode,
      inviteUrl: origin ? inviteUrl(origin, inviteCode) : undefined,
      invitedUserCount: Number(invitedCountRows[0]?.count ?? 0),
      successfulInviteCount: Number(successfulRows[0]?.count ?? 0),
      invitees: invitees.slice(0, 50).map((row) => ({
        userId: row.userId,
        email: row.email ?? undefined,
        displayName: row.displayName ?? undefined,
        createdAt: row.createdAt
      })),
      referralBalanceCents: Number(user.referralBalanceCents ?? 0),
      currency: user.currency || settingsResponse.settings.currency,
      settings: settingsResponse.settings
    }
  };
}

export async function listAdminReferralTransactions(limit: number): Promise<BillingTransactionsResponse> {
  const rows = await db
    .select({
      transaction: billingTransactions,
      user: users
    })
    .from(billingTransactions)
    .leftJoin(users, eq(users.id, billingTransactions.userId))
    .where(inArray(billingTransactions.type, ["referral_cashback", "referral_register_quota"]))
    .orderBy(desc(billingTransactions.createdAt))
    .limit(limit);

  return {
    transactions: rows.map(({ transaction, user }) => ({
      id: transaction.id,
      userId: transaction.userId,
      userEmail: user?.email ?? undefined,
      workspaceId: transaction.workspaceId ?? undefined,
      generationId: transaction.relatedId ?? undefined,
      type: transaction.type,
      title: transaction.title,
      amountCents: Number(transaction.amountCents ?? 0),
      currency: transaction.currency,
      balanceBeforeCents: Number(transaction.balanceBeforeCents ?? 0),
      balanceAfterCents: Number(transaction.balanceAfterCents ?? 0),
      quotaBefore: Number(transaction.quotaBefore ?? 0),
      quotaAfter: Number(transaction.quotaAfter ?? 0),
      quotaConsumed: Number(transaction.quotaConsumed ?? 0),
      quotaCount: Number(transaction.quotaCount ?? 0),
      imageCount: Number(transaction.imageCount ?? 0),
      unitPriceCents: Number(transaction.unitPriceCents ?? 0),
      note: transaction.note ?? undefined,
      status: transaction.status,
      createdByUserId: transaction.createdByUserId ?? undefined,
      createdAt: transaction.createdAt
    }))
  };
}

export async function resolveInviter(inviteCode: string | undefined, newUserId: string): Promise<typeof users.$inferSelect | undefined> {
  const normalized = normalizeInviteCode(inviteCode);
  if (!normalized) {
    return undefined;
  }
  const [inviter] = await db.select().from(users).where(eq(users.inviteCode, normalized)).limit(1);
  if (!inviter || inviter.id === newUserId) {
    return undefined;
  }
  return inviter;
}

export async function applyReferralCashback(input: {
  inviteeUserId: string;
  orderType: string;
  orderId?: string | null;
  amountCents: number;
  currency?: string;
  now?: string;
}): Promise<void> {
  const settings = (await getInviteRewardSettings()).settings;
  if (!settings.enabled || input.amountCents < settings.minCashbackOrderAmountCents) {
    return;
  }
  const rateBps = input.orderType === "plan_purchase" ? settings.planPurchaseCashbackRateBps : settings.rechargeCashbackRateBps;
  if (!rateBps) {
    return;
  }
  const [invitee] = await db.select().from(users).where(eq(users.id, input.inviteeUserId)).limit(1);
  if (!invitee?.inviterUserId) {
    return;
  }
  const amountCents = Math.floor((input.amountCents * rateBps) / 10_000);
  if (amountCents <= 0) {
    return;
  }

  const now = input.now ?? new Date().toISOString();
  await db.transaction(async (tx) => {
    const [inviter] = await tx.select().from(users).where(eq(users.id, invitee.inviterUserId ?? "")).limit(1).for("update");
    if (!inviter) {
      return;
    }
    const before = Number(inviter.referralBalanceCents ?? 0);
    const after = before + amountCents;
    await tx.update(users).set({ referralBalanceCents: after, updatedAt: now }).where(eq(users.id, inviter.id));
    await tx.insert(billingTransactions).values({
      id: randomUUID(),
      userId: inviter.id,
      workspaceId: null,
      type: "referral_cashback",
      title: "邀请返现",
      status: "succeeded",
      amountCents,
      balanceBeforeCents: before,
      balanceAfterCents: after,
      quotaBefore: Number(inviter.quotaUsed ?? 0),
      quotaAfter: Number(inviter.quotaUsed ?? 0),
      quotaConsumed: 0,
      imageCount: 0,
      quotaCount: 0,
      unitPriceCents: 0,
      currency: input.currency || inviter.currency || settings.currency,
      relatedId: input.orderId ?? null,
      note: `来自被邀请用户订单返现 ${rateBps / 100}%`,
      createdByUserId: invitee.id,
      metadataJson: JSON.stringify({ inviteeUserId: invitee.id, orderType: input.orderType, rateBps }),
      createdAt: now
    });
  });
}

export async function registerQuotaTotal(input: { baseQuota: number; inviter?: typeof users.$inferSelect }): Promise<number> {
  const settings = (await getInviteRewardSettings()).settings;
  if (!settings.enabled) {
    return input.baseQuota;
  }
  return settings.baseRegisterCredits + (input.inviter ? settings.inviteeRegisterCredits : 0);
}

export async function rewardInviterForRegistration(input: {
  inviter: typeof users.$inferSelect | undefined;
  inviteeUserId: string;
  now: string;
}): Promise<void> {
  if (!input.inviter) {
    return;
  }
  const settings = (await getInviteRewardSettings()).settings;
  if (!settings.enabled || settings.inviterRegisterCredits <= 0) {
    return;
  }
  await db.transaction(async (tx) => {
    const [inviter] = await tx.select().from(users).where(eq(users.id, input.inviter?.id ?? "")).limit(1).for("update");
    if (!inviter) {
      return;
    }
    const before = Number(inviter.quotaTotal ?? 0);
    const after = before + settings.inviterRegisterCredits;
    await tx.update(users).set({ quotaTotal: after, updatedAt: input.now }).where(eq(users.id, inviter.id));
    await tx.insert(billingTransactions).values({
      id: randomUUID(),
      userId: inviter.id,
      workspaceId: null,
      type: "referral_register_quota",
      title: "邀请注册生图奖励",
      status: "succeeded",
      amountCents: 0,
      balanceBeforeCents: Number(inviter.balanceCents ?? 0),
      balanceAfterCents: Number(inviter.balanceCents ?? 0),
      quotaBefore: before,
      quotaAfter: after,
      quotaConsumed: 0,
      imageCount: 0,
      quotaCount: settings.inviterRegisterCredits,
      unitPriceCents: 0,
      currency: inviter.currency || settings.currency,
      relatedId: null,
      note: `邀请用户注册奖励 ${settings.inviterRegisterCredits} 张`,
      createdByUserId: input.inviteeUserId,
      metadataJson: JSON.stringify({ inviteeUserId: input.inviteeUserId }),
      createdAt: input.now
    });
  });
}

export function inviteCodeFromUserId(userId: string): string {
  return createHash("sha256").update(`invite:${userId}`).digest("base64url").slice(0, 10).toUpperCase();
}

export function normalizeInviteCode(value: string | undefined): string {
  return value?.trim().replace(/\s+/gu, "").toUpperCase().slice(0, 64) ?? "";
}

function inviteUrl(origin: string, inviteCode: string): string {
  const url = new URL("/register", origin);
  url.searchParams.set("inviteCode", inviteCode);
  return url.toString();
}

function settingsFromValue(value: Record<string, unknown>): InviteRewardSettings {
  return {
    enabled: value.enabled !== false,
    baseRegisterCredits: nonNegativeInteger(value.baseRegisterCredits) ?? defaultInviteSettings.baseRegisterCredits,
    inviterRegisterCredits: nonNegativeInteger(value.inviterRegisterCredits) ?? defaultInviteSettings.inviterRegisterCredits,
    inviteeRegisterCredits: nonNegativeInteger(value.inviteeRegisterCredits) ?? defaultInviteSettings.inviteeRegisterCredits,
    rechargeCashbackRateBps: basisPoints(value.rechargeCashbackRateBps),
    planPurchaseCashbackRateBps: basisPoints(value.planPurchaseCashbackRateBps),
    minCashbackOrderAmountCents: nonNegativeInteger(value.minCashbackOrderAmountCents) ?? defaultInviteSettings.minCashbackOrderAmountCents,
    currency: stringValue(value.currency)?.toUpperCase() || DEFAULT_CURRENCY
  };
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

function nonNegativeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function basisPoints(value: unknown): number {
  const parsed = nonNegativeInteger(value);
  return parsed === undefined ? 0 : Math.min(10_000, parsed);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
