import { createSign, createVerify, randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { RequestTenant } from "./auth-context.js";
import type {
  AdminAlipayConfigResponse,
  AdminBillingSettingsResponse,
  BillingOrder,
  BillingOrdersResponse,
  BillingPlan,
  BillingSummaryResponse,
  BillingSettings,
  BillingTransaction,
  BillingTransactionsResponse,
  CreateAlipayRechargeRequest,
  CreatePaymentResponse,
  PurchasePlanRequest,
  SaveAlipayConfigRequest,
  SaveBillingSettingsRequest
} from "./contracts.js";
import { db } from "./database.js";
import { billingOrders, billingTransactions, subscriptionPlans, systemSettings, users } from "./schema.js";

const BILLING_SETTINGS_KEY = "billing.imageUnitPrice";
const ALIPAY_SETTINGS_KEY = "payment.alipay";
const DEFAULT_CURRENCY = "CNY";
const DEFAULT_ALIPAY_GATEWAY = "https://openapi.alipay.com/gateway.do";
const ALIPAY_NOTIFY_SUCCESS = "success";

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

  if (value.enabled && (!value.appId || !value.privateKey || !value.publicKey || !value.notifyUrl)) {
    throw new BillingError("invalid_alipay_config", "启用支付宝时需要配置 appId、privateKey、publicKey 和 notifyUrl。");
  }

  await saveSetting(ALIPAY_SETTINGS_KEY, value);
  return getAlipayConfig();
}

export async function getBillingSummary(tenant: RequestTenant): Promise<BillingSummaryResponse> {
  const [user] = await db.select().from(users).where(eq(users.id, tenant.userId)).limit(1);
  if (!user) {
    throw new BillingError("user_not_found", "用户不存在。", 404);
  }

  const [planRows, currentPlanRow, transactions, orders, settingsResponse] = await Promise.all([
    db.select().from(subscriptionPlans).where(eq(subscriptionPlans.enabled, 1)).orderBy(subscriptionPlans.sortOrder),
    user.planId ? db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, user.planId)).limit(1) : Promise.resolve([]),
    listUserBillingTransactions(tenant, 30),
    listUserBillingOrders(tenant, 30),
    getBillingSettings()
  ]);

  return {
    balance: {
      balanceCents: Number(user.balanceCents ?? 0),
      currency: user.currency || settingsResponse.settings.currency
    },
    currentPlan: currentPlanRow[0] ? toBillingPlan(currentPlanRow[0]) : undefined,
    plans: planRows.map(toBillingPlan),
    usage: {
      quotaTotal: Number(user.quotaTotal ?? 0),
      quotaUsed: Number(user.quotaUsed ?? 0),
      packageRemaining: Math.max(0, Number(user.quotaTotal ?? 0) - Number(user.quotaUsed ?? 0))
    },
    storage: {
      quotaBytes: Number(user.storageQuotaBytes ?? 0),
      usedBytes: Number(user.storageUsedBytes ?? 0)
    },
    transactions: transactions.transactions,
    orders: orders.orders,
    settings: settingsResponse.settings
  };
}

export async function createRechargeOrder(
  tenant: RequestTenant,
  input: CreateAlipayRechargeRequest
): Promise<CreatePaymentResponse> {
  const amountCents = nonNegativeInteger(input.amountCents);
  if (!amountCents || amountCents < 100) {
    throw new BillingError("invalid_recharge_amount", "充值金额至少 1 元。");
  }

  const alipay = await getRawAlipayConfig();
  ensureAlipayEnabled(alipay);
  const { settings } = await getBillingSettings();
  const currency = input.currency?.trim().toUpperCase() || settings.currency;
  if (currency !== "CNY") {
    throw new BillingError("unsupported_currency", "支付宝充值目前仅支持 CNY。");
  }

  const order = await insertPendingOrder({
    tenant,
    type: "recharge",
    title: "账户余额充值",
    amountCents,
    currency,
    paymentProvider: "alipay",
    returnUrl: input.returnUrl,
    metadata: { channel: input.channel ?? "alipay" }
  });
  const paymentUrl = buildAlipayPagePayUrl(alipay, order, input.returnUrl);
  await db.update(billingOrders).set({ paymentUrl, updatedAt: new Date().toISOString() }).where(eq(billingOrders.id, order.id));
  const savedOrder = await getBillingOrderById(order.id);

  return {
    order: savedOrder,
    orderId: order.id,
    outTradeNo: order.outTradeNo,
    status: "pending",
    paymentUrl,
    checkoutUrl: paymentUrl
  };
}

export async function purchasePlan(
  tenant: RequestTenant,
  planId: string,
  input: PurchasePlanRequest
): Promise<CreatePaymentResponse> {
  const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, planId)).limit(1);
  if (!plan || Number(plan.enabled ?? 0) !== 1) {
    throw new BillingError("plan_not_found", "套餐不存在或已停用。", 404);
  }

  const amountCents = Number(plan.priceCents ?? 0);
  const currency = plan.currency || DEFAULT_CURRENCY;
  if (input.paymentMethod === "balance") {
    await applyPlanPurchaseByBalance(tenant, plan);
    return {
      status: "paid",
      order: undefined,
      message: "套餐已通过余额购买并生效。"
    };
  }

  const alipay = await getRawAlipayConfig();
  ensureAlipayEnabled(alipay);
  const order = await insertPendingOrder({
    tenant,
    type: "plan_purchase",
    title: `${plan.name} 套餐购买`,
    amountCents,
    currency,
    paymentProvider: "alipay",
    planId: plan.id,
    imageQuota: Number(plan.imageQuota ?? 0),
    storageQuotaBytes: Number(plan.storageQuotaBytes ?? 0),
    returnUrl: input.returnUrl,
    metadata: { planName: plan.name }
  });
  const paymentUrl = buildAlipayPagePayUrl(alipay, order, input.returnUrl);
  await db.update(billingOrders).set({ paymentUrl, updatedAt: new Date().toISOString() }).where(eq(billingOrders.id, order.id));
  const savedOrder = await getBillingOrderById(order.id);

  return {
    order: savedOrder,
    orderId: order.id,
    outTradeNo: order.outTradeNo,
    status: "pending",
    paymentUrl,
    checkoutUrl: paymentUrl
  };
}

export async function listUserBillingOrders(tenant: RequestTenant, limit: number): Promise<BillingOrdersResponse> {
  const rows = await db
    .select()
    .from(billingOrders)
    .where(eq(billingOrders.userId, tenant.userId))
    .orderBy(desc(billingOrders.createdAt))
    .limit(limit);
  return { orders: rows.map((row) => toBillingOrder(row)) };
}

export async function listAdminBillingOrders(limit: number): Promise<BillingOrdersResponse> {
  const rows = await db
    .select({
      order: billingOrders,
      user: users
    })
    .from(billingOrders)
    .leftJoin(users, eq(users.id, billingOrders.userId))
    .orderBy(desc(billingOrders.createdAt))
    .limit(limit);
  return {
    orders: rows.map(({ order, user }) => toBillingOrder(order, typeof user?.email === "string" ? user.email : undefined))
  };
}

export async function handleAlipayNotify(input: Record<string, string>): Promise<string> {
  const alipay = await getRawAlipayConfig();
  ensureAlipayEnabled(alipay);
  const publicKey = stringValue(alipay.publicKey) || "";
  if (!verifyAlipaySignature(input, publicKey)) {
    throw new BillingError("invalid_alipay_signature", "支付宝回调验签失败。", 400);
  }

  const outTradeNo = input.out_trade_no;
  if (!outTradeNo) {
    throw new BillingError("invalid_alipay_notify", "支付宝回调缺少商户订单号。");
  }

  const tradeStatus = input.trade_status;
  if (tradeStatus !== "TRADE_SUCCESS" && tradeStatus !== "TRADE_FINISHED") {
    await markOrderNotify(outTradeNo, input, tradeStatus || "unknown");
    return ALIPAY_NOTIFY_SUCCESS;
  }

  await applyPaidOrder(outTradeNo, {
    providerTradeNo: input.trade_no,
    paidAmountCents: alipayAmountToCents(input.total_amount),
    notifyPayload: input
  });
  return ALIPAY_NOTIFY_SUCCESS;
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

async function applyPlanPurchaseByBalance(tenant: RequestTenant, plan: typeof subscriptionPlans.$inferSelect): Promise<void> {
  await db.transaction(async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.id, tenant.userId)).limit(1).for("update");
    if (!user) {
      throw new BillingError("user_not_found", "用户不存在。", 404);
    }

    const amountCents = Number(plan.priceCents ?? 0);
    const balanceBefore = Number(user.balanceCents ?? 0);
    if (amountCents > balanceBefore) {
      throw new BillingError("insufficient_balance", `余额不足，还需 ${formatMoney(amountCents - balanceBefore, plan.currency)}。`, 402);
    }

    const balanceAfter = balanceBefore - amountCents;
    const quotaBefore = Number(user.quotaUsed ?? 0);
    await tx
      .update(users)
      .set({
        planId: plan.id,
        quotaTotal: Number(plan.imageQuota ?? 0),
        quotaUsed: 0,
        storageQuotaBytes: Number(plan.storageQuotaBytes ?? 0),
        balanceCents: balanceAfter,
        currency: plan.currency || DEFAULT_CURRENCY,
        updatedAt: new Date().toISOString()
      })
      .where(eq(users.id, user.id));

    await tx.insert(billingTransactions).values({
      id: randomUUID(),
      userId: user.id,
      workspaceId: tenant.workspaceId,
      type: "plan_purchase",
      title: `${plan.name} 套餐购买`,
      status: "succeeded",
      currency: plan.currency,
      amountCents: -amountCents,
      balanceBeforeCents: balanceBefore,
      balanceAfterCents: balanceAfter,
      quotaBefore,
      quotaAfter: 0,
      quotaConsumed: 0,
      imageCount: Number(plan.imageQuota ?? 0),
      quotaCount: Number(plan.imageQuota ?? 0),
      unitPriceCents: 0,
      relatedId: null,
      note: "余额购买套餐",
      createdByUserId: user.id,
      metadataJson: JSON.stringify({ planId: plan.id, storageQuotaBytes: Number(plan.storageQuotaBytes ?? 0) }),
      createdAt: new Date().toISOString()
    });
  });
}

async function applyPaidOrder(
  outTradeNo: string,
  input: { providerTradeNo?: string; paidAmountCents?: number; notifyPayload: Record<string, string> }
): Promise<void> {
  await db.transaction(async (tx) => {
    const [order] = await tx.select().from(billingOrders).where(eq(billingOrders.outTradeNo, outTradeNo)).limit(1).for("update");
    if (!order) {
      throw new BillingError("order_not_found", "订单不存在。", 404);
    }
    if (order.status === "paid") {
      return;
    }
    if (typeof input.paidAmountCents === "number" && input.paidAmountCents !== Number(order.amountCents ?? 0)) {
      throw new BillingError("invalid_alipay_amount", "支付宝回调金额与订单金额不一致。", 400);
    }

    const [user] = await tx.select().from(users).where(eq(users.id, order.userId)).limit(1).for("update");
    if (!user) {
      throw new BillingError("user_not_found", "用户不存在。", 404);
    }

    const balanceBefore = Number(user.balanceCents ?? 0);
    const quotaBefore = Number(user.quotaUsed ?? 0);
    let balanceAfter = balanceBefore;
    let quotaAfter = quotaBefore;
    const now = new Date().toISOString();

    if (order.type === "recharge") {
      balanceAfter = balanceBefore + Number(order.amountCents ?? 0);
      await tx
        .update(users)
        .set({ balanceCents: balanceAfter, currency: order.currency, updatedAt: now })
        .where(eq(users.id, user.id));
    } else if (order.type === "plan_purchase") {
      quotaAfter = 0;
      await tx
        .update(users)
        .set({
          planId: order.planId,
          quotaTotal: Number(order.imageQuota ?? 0),
          quotaUsed: 0,
          storageQuotaBytes: Number(order.storageQuotaBytes ?? 0),
          currency: order.currency,
          updatedAt: now
        })
        .where(eq(users.id, user.id));
    }

    await tx
      .update(billingOrders)
      .set({
        status: "paid",
        providerTradeNo: input.providerTradeNo ?? null,
        paidAt: now,
        notifyJson: JSON.stringify(input.notifyPayload),
        updatedAt: now
      })
      .where(eq(billingOrders.id, order.id));

    await tx.insert(billingTransactions).values({
      id: randomUUID(),
      userId: user.id,
      workspaceId: order.workspaceId,
      type: order.type,
      title: order.title,
      status: "succeeded",
      currency: order.currency,
      amountCents: order.type === "plan_purchase" ? Number(order.amountCents ?? 0) : Number(order.amountCents ?? 0),
      balanceBeforeCents: balanceBefore,
      balanceAfterCents: balanceAfter,
      quotaBefore,
      quotaAfter,
      quotaConsumed: 0,
      imageCount: Number(order.imageQuota ?? 0),
      quotaCount: Number(order.imageQuota ?? 0),
      unitPriceCents: 0,
      relatedId: null,
      note: order.type === "recharge" ? "支付宝充值到账" : "支付宝购买套餐生效",
      createdByUserId: user.id,
      metadataJson: JSON.stringify({ orderId: order.id, outTradeNo: order.outTradeNo, planId: order.planId }),
      createdAt: now
    });
  });
}

async function markOrderNotify(outTradeNo: string, payload: Record<string, string>, tradeStatus: string): Promise<void> {
  const [order] = await db.select().from(billingOrders).where(eq(billingOrders.outTradeNo, outTradeNo)).limit(1);
  if (!order || order.status === "paid") {
    return;
  }
  await db
    .update(billingOrders)
    .set({
      status: tradeStatus === "TRADE_CLOSED" ? "cancelled" : order.status,
      notifyJson: JSON.stringify(payload),
      closedAt: tradeStatus === "TRADE_CLOSED" ? new Date().toISOString() : order.closedAt,
      updatedAt: new Date().toISOString()
    })
    .where(eq(billingOrders.id, order.id));
}

async function insertPendingOrder(input: {
  tenant: RequestTenant;
  type: "recharge" | "plan_purchase";
  title: string;
  amountCents: number;
  currency: string;
  paymentProvider: "alipay";
  planId?: string;
  imageQuota?: number;
  storageQuotaBytes?: number;
  returnUrl?: string;
  metadata?: Record<string, unknown>;
}): Promise<BillingOrder> {
  const now = new Date().toISOString();
  const id = randomUUID();
  const outTradeNo = createOutTradeNo(input.type);
  await db.insert(billingOrders).values({
    id,
    outTradeNo,
    userId: input.tenant.userId,
    workspaceId: input.tenant.workspaceId,
    type: input.type,
    status: "pending",
    title: input.title,
    amountCents: input.amountCents,
    currency: input.currency,
    planId: input.planId ?? null,
    imageQuota: input.imageQuota ?? 0,
    storageQuotaBytes: input.storageQuotaBytes ?? 0,
    paymentProvider: input.paymentProvider,
    paymentUrl: null,
    providerTradeNo: null,
    paidAt: null,
    closedAt: null,
    metadataJson: JSON.stringify({ ...input.metadata, returnUrl: input.returnUrl }),
    notifyJson: null,
    createdAt: now,
    updatedAt: now
  });
  return getBillingOrderById(id);
}

async function getBillingOrderById(orderId: string): Promise<BillingOrder> {
  const [row] = await db.select().from(billingOrders).where(eq(billingOrders.id, orderId)).limit(1);
  if (!row) {
    throw new BillingError("order_not_found", "订单不存在。", 404);
  }
  return toBillingOrder(row);
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

function toBillingOrder(row: typeof billingOrders.$inferSelect, userEmail?: string): BillingOrder {
  return {
    id: row.id,
    outTradeNo: row.outTradeNo,
    userId: row.userId,
    userEmail,
    workspaceId: row.workspaceId ?? undefined,
    type: row.type,
    status: row.status,
    title: row.title,
    amountCents: Number(row.amountCents ?? 0),
    currency: row.currency,
    planId: row.planId ?? undefined,
    imageQuota: Number(row.imageQuota ?? 0),
    storageQuotaBytes: Number(row.storageQuotaBytes ?? 0),
    paymentProvider: row.paymentProvider,
    paymentUrl: row.paymentUrl ?? undefined,
    providerTradeNo: row.providerTradeNo ?? undefined,
    paidAt: row.paidAt ?? undefined,
    closedAt: row.closedAt ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function toBillingPlan(plan: typeof subscriptionPlans.$inferSelect): BillingPlan {
  return {
    id: plan.id,
    name: plan.name,
    description: plan.description ?? undefined,
    imageQuota: Number(plan.imageQuota ?? 0),
    storageQuotaBytes: Number(plan.storageQuotaBytes ?? 0),
    priceCents: Number(plan.priceCents ?? 0),
    currency: plan.currency,
    enabled: Number(plan.enabled ?? 0) === 1,
    sortOrder: Number(plan.sortOrder ?? 0),
    benefits: parseJsonValue(plan.benefitsJson),
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt
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

function getRawAlipayConfig(): Promise<Record<string, unknown>> {
  return getSetting(ALIPAY_SETTINGS_KEY).then((row) => parseRecord(row?.valueJson));
}

function ensureAlipayEnabled(config: Record<string, unknown>): void {
  if (config.enabled !== true) {
    throw new BillingError("alipay_disabled", "支付宝支付未启用。");
  }
  if (!stringValue(config.appId) || !stringValue(config.privateKey) || !stringValue(config.publicKey)) {
    throw new BillingError("alipay_not_configured", "支付宝支付配置不完整。");
  }
}

function buildAlipayPagePayUrl(
  config: Record<string, unknown>,
  order: BillingOrder,
  returnUrl?: string
): string {
  const baseUrl = stringValue(config.gateway) || DEFAULT_ALIPAY_GATEWAY;
  const params: Record<string, string> = {
    app_id: stringValue(config.appId) || "",
    method: "alipay.trade.page.pay",
    format: "JSON",
    charset: "utf-8",
    sign_type: stringValue(config.signType) || "RSA2",
    timestamp: formatTimestamp(new Date()),
    version: "1.0",
    notify_url: stringValue(config.notifyUrl) || "",
    return_url: returnUrl || stringValue(config.returnUrl) || "",
    biz_content: JSON.stringify({
      out_trade_no: order.outTradeNo,
      product_code: "FAST_INSTANT_TRADE_PAY",
      total_amount: (order.amountCents / 100).toFixed(2),
      subject: order.title,
      body: order.type
    })
  };
  const sign = signAlipayParams(params, stringValue(config.privateKey) || "", stringValue(config.signType) || "RSA2");
  const query = new URLSearchParams({ ...params, sign });
  return `${baseUrl}?${query.toString()}`;
}

function signAlipayParams(params: Record<string, string>, privateKey: string, signType: string): string {
  const content = canonicalQuery(params);
  const signer = createSign(signType === "RSA" ? "RSA-SHA1" : "RSA-SHA256");
  signer.update(content, "utf8");
  signer.end();
  return signer.sign(normalizePrivateKey(privateKey), "base64");
}

function verifyAlipaySignature(params: Record<string, string>, publicKey: string): boolean {
  const sign = params.sign;
  if (!sign) {
    return false;
  }
  const { sign: _ignoredSign, sign_type: _ignoredSignType, ...rest } = params;
  const content = canonicalQuery(rest);
  const verify = createVerify(params.sign_type === "RSA" ? "RSA-SHA1" : "RSA-SHA256");
  verify.update(content, "utf8");
  verify.end();
  return safeBooleanEqual(verify.verify(normalizePublicKey(publicKey), sign, "base64"), true);
}

function safeBooleanEqual(actual: boolean, expected: boolean): boolean {
  return actual === expected;
}

function normalizePrivateKey(value: string): string {
  return normalizePem(value, "PRIVATE KEY");
}

function normalizePublicKey(value: string): string {
  return normalizePem(value, "PUBLIC KEY");
}

function normalizePem(value: string, label: string): string {
  const trimmed = value.trim().replace(/\\n/gu, "\n");
  if (trimmed.includes(`-----BEGIN ${label}-----`)) {
    return trimmed;
  }
  const cleaned = trimmed.replace(/\s+/gu, "");
  const chunks = cleaned.match(/.{1,64}/gu) ?? [];
  return `-----BEGIN ${label}-----\n${chunks.join("\n")}\n-----END ${label}-----`;
}

function canonicalQuery(params: Record<string, string>): string {
  return Object.keys(params)
    .filter((key) => params[key] !== "" && params[key] !== undefined && key !== "sign")
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
}

function formatTimestamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function createOutTradeNo(type: string): string {
  return `${type.slice(0, 3)}_${Date.now()}_${randomUUID().slice(0, 8)}`;
}

function alipayAmountToCents(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) : undefined;
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

function parseJsonValue(value: string | null): unknown {
  if (!value) {
    return undefined;
  }
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}
