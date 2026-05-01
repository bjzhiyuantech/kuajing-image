import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import type { RequestTenant } from "./auth-context.js";
import type {
  AdminAlipayConfigResponse,
  AdminBillingSettingsResponse,
  BillingSettings,
  BillingTransaction,
  BillingTransactionsResponse,
  SaveAlipayConfigRequest,
  SaveBillingSettingsRequest
} from "./contracts.js";
import { db } from "./database.js";
import { billingTransactions, systemSettings, users } from "./schema.js";

const BILLING_SETTINGS_KEY = "billing.imageUnitPrice";
const ALIPAY_SETTINGS_KEY = "payment.alipay";
const DEFAULT_CURRENCY = "CNY";
const DEFAULT_ALIPAY_GATEWAY = "https://openapi.alipay.com/gateway.do";

export class BillingError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400
  ) {
    super(message);
  }
}

export async function getBillingSettings(): Promise<AdminBillingSettingsResponse> {
  const row = await getSetting(BILLING_SETTINGS_KEY);
  const value = parseRecord(row?.valueJson);
  return {
    settings: {
      imageUnitPriceCents: nonNegativeInteger(value.imageUnitPriceCents) ?? 0,
      currency: stringValue(value.currency) || DEFAULT_CURRENCY,
      updatedAt: row?.updatedAt
    }
  };
}

export async function saveBillingSettings(input: SaveBillingSettingsRequest): Promise<AdminBillingSettingsResponse> {
  const imageUnitPriceCents = nonNegativeInteger(input.imageUnitPriceCents);
  if (imageUnitPriceCents === undefined) {
    throw new BillingError("invalid_billing_settings", "单张生图费用必须是非负整数分。");
  }

  const currency = (input.currency?.trim() || DEFAULT_CURRENCY).toUpperCase();
  if (!currency || currency.length > 16) {
    throw new BillingError("invalid_billing_settings", "币种不能为空，且不能超过 16 个字符。");
  }

  await saveSetting(BILLING_SETTINGS_KEY, { imageUnitPriceCents, currency });
  return getBillingSettings();
}

export async function getAlipayConfig(): Promise<AdminAlipayConfigResponse> {
  const row = await getSetting(ALIPAY_SETTINGS_KEY);
  return {
    alipay: toAlipayConfigView(parseRecord(row?.valueJson), row?.updatedAt)
  };
}

export async function saveAlipayConfig(input: SaveAlipayConfigRequest): Promise<AdminAlipayConfigResponse> {
  const existing = parseRecord((await getSetting(ALIPAY_SETTINGS_KEY))?.valueJson);
  const value = {
    enabled: input.enabled === true,
    appId: limitedString(input.appId, 255) ?? stringValue(existing.appId) ?? "",
    privateKey:
      input.preservePrivateKey === true ? stringValue(existing.privateKey) ?? "" : limitedString(input.privateKey, 20_000) ?? "",
    publicKey: input.preservePublicKey === true ? stringValue(existing.publicKey) ?? "" : limitedString(input.publicKey, 20_000) ?? "",
    notifyUrl: limitedString(input.notifyUrl, 1000) ?? "",
    returnUrl: limitedString(input.returnUrl, 1000) ?? "",
    gateway: limitedString(input.gateway, 1000) ?? DEFAULT_ALIPAY_GATEWAY,
    signType: limitedString(input.signType, 16) ?? "RSA2"
  };

  if (value.enabled && (!value.appId || !value.privateKey || !value.publicKey)) {
    throw new BillingError("invalid_alipay_config", "启用支付宝时需要配置 appId、privateKey 和 publicKey。");
  }

  await saveSetting(ALIPAY_SETTINGS_KEY, value);
  return getAlipayConfig();
}

export async function reserveGenerationCharge(input: {
  tenant: RequestTenant;
  imageCount: number;
}): Promise<{ transactionId: string; quotaConsumed: number; amountCents: number }> {
  const imageCount = nonNegativeInteger(input.imageCount);
  if (!imageCount || imageCount < 1) {
    throw new BillingError("invalid_billing_quantity", "生图数量必须大于 0。");
  }

  const { settings } = await getBillingSettings();
  return db.transaction(async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.id, input.tenant.userId)).limit(1).for("update");
    if (!user) {
      throw new BillingError("user_not_found", "用户不存在。", 404);
    }

    const quotaTotal = Number(user.quotaTotal ?? 0);
    const quotaUsed = Number(user.quotaUsed ?? 0);
    const balanceBefore = Number(user.balanceCents ?? 0);
    const quotaRemaining = Math.max(0, quotaTotal - quotaUsed);
    const quotaConsumed = Math.min(imageCount, quotaRemaining);
    const balanceImageCount = imageCount - quotaConsumed;
    const amountCents = balanceImageCount * settings.imageUnitPriceCents;

    if (amountCents > balanceBefore) {
      throw new BillingError(
        "insufficient_balance",
        `生图额度不足，余额也不足。还需 ${formatMoney(amountCents - balanceBefore, settings.currency)}。`,
        402
      );
    }

    const quotaAfter = quotaUsed + quotaConsumed;
    const balanceAfter = balanceBefore - amountCents;
    await tx
      .update(users)
      .set({
        quotaUsed: quotaAfter,
        balanceCents: balanceAfter,
        updatedAt: new Date().toISOString()
      })
      .where(eq(users.id, user.id));

    const transactionId = randomUUID();
    await tx.insert(billingTransactions).values({
      id: transactionId,
      userId: user.id,
      workspaceId: input.tenant.workspaceId,
      type: "generation",
      title: "图像生成扣费",
      status: "succeeded",
      currency: settings.currency,
      amountCents: -amountCents,
      balanceBeforeCents: balanceBefore,
      balanceAfterCents: balanceAfter,
      quotaBefore: quotaUsed,
      quotaAfter,
      quotaConsumed,
      imageCount,
      quotaCount: quotaConsumed,
      unitPriceCents: settings.imageUnitPriceCents,
      relatedId: null,
      note: balanceImageCount > 0 ? `${balanceImageCount} 张按余额扣费` : "使用套餐额度",
      createdByUserId: user.id,
      metadataJson: JSON.stringify({ balanceImageCount }),
      createdAt: new Date().toISOString()
    });

    return { transactionId, quotaConsumed, amountCents };
  });
}

export async function attachGenerationToCharge(transactionId: string | undefined, generationId: string): Promise<void> {
  if (!transactionId) {
    return;
  }
  await db.update(billingTransactions).set({ relatedId: generationId }).where(eq(billingTransactions.id, transactionId));
}

export async function adjustUserBalance(input: {
  userId: string;
  adminUserId: string;
  balanceCents?: number;
  deltaCents?: number;
  note?: string;
}): Promise<void> {
  if (input.balanceCents === undefined && input.deltaCents === undefined) {
    throw new BillingError("invalid_balance_adjustment", "请提供 balanceCents 或 deltaCents。");
  }
  if (input.balanceCents !== undefined && nonNegativeInteger(input.balanceCents) === undefined) {
    throw new BillingError("invalid_balance_adjustment", "余额必须是非负整数分。");
  }
  if (input.deltaCents !== undefined && (!Number.isSafeInteger(input.deltaCents) || input.deltaCents === 0)) {
    throw new BillingError("invalid_balance_adjustment", "余额增减值必须是非零整数分。");
  }

  await db.transaction(async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.id, input.userId)).limit(1).for("update");
    if (!user) {
      throw new BillingError("user_not_found", "用户不存在。", 404);
    }

    const before = Number(user.balanceCents ?? 0);
    const after = input.balanceCents ?? before + (input.deltaCents ?? 0);
    if (!Number.isSafeInteger(after) || after < 0) {
      throw new BillingError("invalid_balance_adjustment", "调整后的余额不能小于 0。");
    }

    await tx.update(users).set({ balanceCents: after, updatedAt: new Date().toISOString() }).where(eq(users.id, user.id));
    await tx.insert(billingTransactions).values({
      id: randomUUID(),
      userId: user.id,
      workspaceId: null,
      type: "admin_adjustment",
      title: "后台余额调整",
      status: "succeeded",
      currency: DEFAULT_CURRENCY,
      amountCents: after - before,
      balanceBeforeCents: before,
      balanceAfterCents: after,
      quotaBefore: Number(user.quotaUsed ?? 0),
      quotaAfter: Number(user.quotaUsed ?? 0),
      quotaConsumed: 0,
      imageCount: 0,
      quotaCount: 0,
      unitPriceCents: 0,
      relatedId: null,
      note: input.note?.trim() || null,
      createdByUserId: input.adminUserId,
      metadataJson: null,
      createdAt: new Date().toISOString()
    });
  });
}

export async function listUserBillingTransactions(tenant: RequestTenant, limit: number): Promise<BillingTransactionsResponse> {
  const rows = await db
    .select()
    .from(billingTransactions)
    .where(eq(billingTransactions.userId, tenant.userId))
    .orderBy(desc(billingTransactions.createdAt))
    .limit(limit);
  return { transactions: rows.map((row) => toBillingTransaction(row)) };
}

export async function listAdminBillingTransactions(limit: number): Promise<BillingTransactionsResponse> {
  const rows = await db
    .select({
      transaction: billingTransactions,
      user: users
    })
    .from(billingTransactions)
    .leftJoin(users, eq(users.id, billingTransactions.userId))
    .orderBy(desc(billingTransactions.createdAt))
    .limit(limit);
  return {
    transactions: rows.map(({ transaction, user }) => toBillingTransaction(transaction, user?.email ?? undefined))
  };
}

function toBillingTransaction(row: typeof billingTransactions.$inferSelect, userEmail?: string): BillingTransaction {
  return {
    id: row.id,
    userId: row.userId,
    userEmail,
    workspaceId: row.workspaceId ?? undefined,
    generationId: row.relatedId ?? undefined,
    type: row.type,
    title: row.title,
    amountCents: Number(row.amountCents ?? 0),
    currency: row.currency,
    balanceBeforeCents: Number(row.balanceBeforeCents ?? 0),
    balanceAfterCents: Number(row.balanceAfterCents ?? 0),
    quotaBefore: Number(row.quotaBefore ?? 0),
    quotaAfter: Number(row.quotaAfter ?? 0),
    quotaConsumed: Number(row.quotaConsumed ?? 0),
    imageCount: Number(row.imageCount ?? 0),
    unitPriceCents: Number(row.unitPriceCents ?? 0),
    note: row.note ?? undefined,
    status: row.status,
    createdByUserId: row.createdByUserId ?? undefined,
    createdAt: row.createdAt
  };
}

async function getSetting(key: string): Promise<typeof systemSettings.$inferSelect | undefined> {
  const [row] = await db.select().from(systemSettings).where(eq(systemSettings.key, key)).limit(1);
  return row;
}

async function saveSetting(key: string, value: unknown): Promise<void> {
  const now = new Date().toISOString();
  await db
    .insert(systemSettings)
    .values({
      key,
      valueJson: JSON.stringify(value),
      createdAt: now,
      updatedAt: now
    })
    .onDuplicateKeyUpdate({
      set: {
        valueJson: JSON.stringify(value),
        updatedAt: now
      }
    });
}

function toAlipayConfigView(value: Record<string, unknown>, updatedAt?: string): AdminAlipayConfigResponse["alipay"] {
  return {
    enabled: value.enabled === true,
    appId: stringValue(value.appId) ?? "",
    privateKey: maskSecret(stringValue(value.privateKey)),
    publicKey: maskSecret(stringValue(value.publicKey)),
    notifyUrl: stringValue(value.notifyUrl) ?? "",
    returnUrl: stringValue(value.returnUrl) ?? "",
    gateway: stringValue(value.gateway) || DEFAULT_ALIPAY_GATEWAY,
    signType: stringValue(value.signType) || "RSA2",
    updatedAt
  };
}

function maskSecret(value: string | undefined): { hasSecret: boolean; value?: string } {
  if (!value) {
    return { hasSecret: false };
  }
  const compact = value.replace(/\s+/gu, "");
  const preview = compact.length <= 8 ? "****" : `${compact.slice(0, 4)}****${compact.slice(-4)}`;
  return { hasSecret: true, value: preview };
}

function parseRecord(valueJson: string | undefined): Record<string, unknown> {
  if (!valueJson) {
    return {};
  }
  try {
    const parsed = JSON.parse(valueJson) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function nonNegativeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() : undefined;
}

function limitedString(value: unknown, maxLength: number): string | undefined {
  const text = stringValue(value);
  return text !== undefined && text.length <= maxLength ? text : undefined;
}

function formatMoney(amountCents: number, currency: string): string {
  return `${(amountCents / 100).toFixed(2)} ${currency}`;
}
