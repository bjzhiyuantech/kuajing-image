import { randomInt, randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { RequestTenant } from "./auth-context.js";
import type {
  AdminCreateRedemptionCodesRequest,
  AdminRedemptionCode,
  AdminRedemptionCodesResponse,
  RedemptionCodeRedeemRequest,
  RedemptionCodeRedeemResponse
} from "./contracts.js";
import { db } from "./database.js";
import { ensureUserPlanCurrent } from "./plan-expiration.js";
import { billingTransactions, redemptionCodeRedemptions, redemptionCodes, users } from "./schema.js";

const DEFAULT_CURRENCY = "CNY";
const DEFAULT_PLAN_ID = "free";
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MAX_BATCH_COUNT = 500;
const MAX_REDEMPTIONS_PER_CODE = 1_000_000;
const MAX_QUOTA_PER_REDEMPTION = 1_000_000;
const MAX_VALID_DAYS = 3650;

export class RedemptionCodeError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400
  ) {
    super(message);
  }
}

export async function listAdminRedemptionCodes(limit: number): Promise<AdminRedemptionCodesResponse> {
  const rows = await db
    .select()
    .from(redemptionCodes)
    .orderBy(desc(redemptionCodes.createdAt), desc(redemptionCodes.id))
    .limit(limit);
  return { codes: rows.map(toAdminRedemptionCode) };
}

export async function createAdminRedemptionCodes(
  adminUserId: string,
  input: AdminCreateRedemptionCodesRequest
): Promise<AdminRedemptionCodesResponse> {
  const requestedCodes = normalizeRequestedCodes(input.codes);
  const count = requestedCodes.length > 0 ? requestedCodes.length : positiveInteger(input.count, "生成数量");
  const maxRedemptions = positiveInteger(input.maxRedemptions, "总可兑换次数");
  const quota = positiveInteger(input.quota, "兑换额度");
  const validDays = positiveInteger(input.validDays, "有效天数");

  if (count > MAX_BATCH_COUNT) {
    throw new RedemptionCodeError("invalid_redemption_code_batch", `单次最多生成 ${MAX_BATCH_COUNT} 个兑换码。`);
  }
  if (maxRedemptions > MAX_REDEMPTIONS_PER_CODE) {
    throw new RedemptionCodeError("invalid_redemption_code_redemptions", "单个兑换码总可兑换次数过大。");
  }
  if (quota > MAX_QUOTA_PER_REDEMPTION) {
    throw new RedemptionCodeError("invalid_redemption_code_quota", "单次兑换额度过大。");
  }
  if (validDays > MAX_VALID_DAYS) {
    throw new RedemptionCodeError("invalid_redemption_code_valid_days", "有效天数不能超过 3650 天。");
  }

  const batchId = randomUUID();
  const now = new Date().toISOString();
  const prefix = normalizeCodePrefix(input.codePrefix);
  const generated = new Set<string>();
  const values: Array<typeof redemptionCodes.$inferInsert> = [];

  while (values.length < count) {
    const code = requestedCodes[values.length] ?? generateRedemptionCode(prefix);
    if (generated.has(code)) {
      continue;
    }
    generated.add(code);
    values.push({
      id: randomUUID(),
      code,
      batchId,
      quota,
      maxRedemptions,
      usedCount: 0,
      validDays,
      status: "active",
      note: cleanNote(input.note) ?? null,
      createdByUserId: adminUserId,
      createdAt: now,
      updatedAt: now
    });
  }

  await ensureCodesAvailable(values.map((value) => value.code));
  await db.insert(redemptionCodes).values(values);
  const rows = await db
    .select()
    .from(redemptionCodes)
    .where(eq(redemptionCodes.batchId, batchId))
    .orderBy(asc(redemptionCodes.createdAt), asc(redemptionCodes.code));
  return {
    batchId,
    codes: rows.map(toAdminRedemptionCode)
  };
}

export async function redeemCode(tenant: RequestTenant, input: RedemptionCodeRedeemRequest): Promise<RedemptionCodeRedeemResponse> {
  const code = normalizeRedemptionCode(input.code);
  if (!code) {
    throw new RedemptionCodeError("invalid_redemption_code", "请输入有效兑换码。");
  }

  await ensureUserPlanCurrent(tenant.userId);

  return db.transaction(async (tx) => {
    const [redemptionCode] = await tx.select().from(redemptionCodes).where(eq(redemptionCodes.code, code)).limit(1).for("update");
    if (!redemptionCode) {
      throw new RedemptionCodeError("redemption_code_not_found", "兑换码不存在。", 404);
    }
    if (redemptionCode.status !== "active") {
      throw new RedemptionCodeError("redemption_code_disabled", "兑换码已停用。", 409);
    }
    if (Number(redemptionCode.usedCount ?? 0) >= Number(redemptionCode.maxRedemptions ?? 0)) {
      throw new RedemptionCodeError("redemption_code_exhausted", "兑换码可兑换次数已用完。", 409);
    }

    const [existingRedemption] = await tx
      .select({ id: redemptionCodeRedemptions.id })
      .from(redemptionCodeRedemptions)
      .where(and(eq(redemptionCodeRedemptions.codeId, redemptionCode.id), eq(redemptionCodeRedemptions.userId, tenant.userId)))
      .limit(1);
    if (existingRedemption) {
      throw new RedemptionCodeError("redemption_code_already_used", "你已经使用过这个兑换码。", 409);
    }

    const [user] = await tx.select().from(users).where(eq(users.id, tenant.userId)).limit(1).for("update");
    if (!user) {
      throw new RedemptionCodeError("user_not_found", "用户不存在。", 404);
    }

    const nowDate = new Date();
    const now = nowDate.toISOString();
    const expiresAt = expiresAtFrom(nowDate, Number(redemptionCode.validDays ?? 0));
    const quotaGranted = Number(redemptionCode.quota ?? 0);
    const quotaBefore = Number(user.quotaTotal ?? 0);
    const quotaAfter = quotaBefore + quotaGranted;
    const quotaUsed = Number(user.quotaUsed ?? 0);
    const nextPlanExpiresAt = laterIsoDate(user.planExpiresAt ?? undefined, expiresAt);
    const redemptionId = randomUUID();

    await tx
      .update(users)
      .set({
        planId: user.planId || DEFAULT_PLAN_ID,
        planExpiresAt: nextPlanExpiresAt,
        quotaTotal: quotaAfter,
        updatedAt: now
      })
      .where(eq(users.id, user.id));

    await tx
      .update(redemptionCodes)
      .set({
        usedCount: Number(redemptionCode.usedCount ?? 0) + 1,
        updatedAt: now
      })
      .where(eq(redemptionCodes.id, redemptionCode.id));

    await tx.insert(redemptionCodeRedemptions).values({
      id: redemptionId,
      codeId: redemptionCode.id,
      code: redemptionCode.code,
      userId: user.id,
      quotaGranted,
      expiresAt,
      createdAt: now
    });

    await tx.insert(billingTransactions).values({
      id: randomUUID(),
      userId: user.id,
      workspaceId: tenant.workspaceId,
      type: "redemption_code",
      title: "兑换码兑换",
      status: "succeeded",
      amountCents: 0,
      balanceBeforeCents: Number(user.balanceCents ?? 0),
      balanceAfterCents: Number(user.balanceCents ?? 0),
      quotaBefore,
      quotaAfter,
      quotaConsumed: 0,
      imageCount: 0,
      quotaCount: quotaGranted,
      unitPriceCents: 0,
      currency: user.currency || DEFAULT_CURRENCY,
      relatedId: redemptionCode.id,
      note: `兑换码 ${redemptionCode.code} 增加 ${quotaGranted} 张，有效期至 ${formatDate(expiresAt)}`,
      createdByUserId: user.id,
      metadataJson: JSON.stringify({
        redemptionCodeId: redemptionCode.id,
        redemptionId,
        batchId: redemptionCode.batchId,
        code: redemptionCode.code,
        expiresAt,
        validDays: Number(redemptionCode.validDays ?? 0)
      }),
      createdAt: now
    });

    return {
      redemption: {
        code: redemptionCode.code,
        quotaGranted,
        expiresAt
      },
      user: {
        quotaTotal: quotaAfter,
        quotaUsed,
        packageRemaining: Math.max(0, quotaAfter - quotaUsed),
        planExpiresAt: nextPlanExpiresAt
      }
    };
  });
}

export function normalizeRedemptionCode(value: string | undefined): string {
  const code = value?.trim().replace(/\s+/gu, "").toUpperCase() ?? "";
  return /^[A-Z0-9_-]{4,64}$/u.test(code) ? code : "";
}

function toAdminRedemptionCode(row: typeof redemptionCodes.$inferSelect): AdminRedemptionCode {
  const maxRedemptions = Number(row.maxRedemptions ?? 0);
  const usedCount = Number(row.usedCount ?? 0);
  return {
    id: row.id,
    code: row.code,
    batchId: row.batchId ?? undefined,
    quota: Number(row.quota ?? 0),
    maxRedemptions,
    usedCount,
    redeemedUserCount: usedCount,
    remainingCount: Math.max(0, maxRedemptions - usedCount),
    validDays: Number(row.validDays ?? 0),
    status: row.status,
    note: row.note ?? undefined,
    createdByUserId: row.createdByUserId ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function positiveInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new RedemptionCodeError("invalid_redemption_code_settings", `${label}必须是正整数。`);
  }
  return value;
}

function normalizeRequestedCodes(codes: string[] | undefined): string[] {
  if (!codes || codes.length === 0) {
    return [];
  }

  const normalizedCodes = codes.map((code) => normalizeRedemptionCode(code));
  if (normalizedCodes.some((code) => !code)) {
    throw new RedemptionCodeError("invalid_redemption_code", "指定兑换码只能包含 4 到 64 位字母、数字、下划线或中划线。");
  }

  const uniqueCodes = new Set(normalizedCodes);
  if (uniqueCodes.size !== normalizedCodes.length) {
    throw new RedemptionCodeError("duplicate_redemption_code", "指定兑换码中存在重复项。");
  }

  return normalizedCodes;
}

async function ensureCodesAvailable(codes: string[]): Promise<void> {
  if (codes.length === 0) {
    return;
  }
  const existingRows = await db
    .select({ code: redemptionCodes.code })
    .from(redemptionCodes)
    .where(inArray(redemptionCodes.code, codes));
  if (existingRows.length === 0) {
    return;
  }

  const sample = existingRows.map((row) => row.code).slice(0, 5).join("、");
  throw new RedemptionCodeError("redemption_code_exists", `兑换码 ${sample} 已存在。`, 409);
}

function normalizeCodePrefix(value: string | undefined): string {
  if (!value) {
    return "";
  }
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/gu, "")
    .slice(0, 20);
}

function cleanNote(value: string | undefined): string | undefined {
  const note = value?.trim();
  return note ? note.slice(0, 1000) : undefined;
}

function generateRedemptionCode(prefix: string): string {
  const body = Array.from({ length: 3 }, () => randomCodeSegment(4)).join("-");
  return prefix ? `${prefix}-${body}` : body;
}

function randomCodeSegment(length: number): string {
  let segment = "";
  for (let index = 0; index < length; index += 1) {
    segment += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)];
  }
  return segment;
}

function expiresAtFrom(base: Date, validDays: number): string {
  const expiresAt = new Date(base);
  expiresAt.setDate(expiresAt.getDate() + validDays);
  return expiresAt.toISOString();
}

function laterIsoDate(current: string | undefined, next: string): string {
  const currentTime = current ? new Date(current).getTime() : Number.NaN;
  const nextTime = new Date(next).getTime();
  return Number.isFinite(currentTime) && currentTime > nextTime ? current as string : next;
}

function formatDate(value: string): string {
  return value.slice(0, 10);
}
