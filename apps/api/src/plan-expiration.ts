import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, lte } from "drizzle-orm";
import { db } from "./database.js";
import { billingTransactions, redemptionCodeRedemptions, subscriptionPlans, users } from "./schema.js";

const DEFAULT_PLAN_ID = "free";
const DEFAULT_CURRENCY = "CNY";
const DEFAULT_STORAGE_QUOTA_BYTES = 1024 * 1024 * 1024;

export function planExpiryFrom(base: Date = new Date()): string {
  const expiresAt = new Date(base);
  expiresAt.setMonth(expiresAt.getMonth() + 1);
  return expiresAt.toISOString();
}

export async function ensureUserPlanCurrent(userId: string): Promise<void> {
  await settleExpiredRedemptionQuotas(userId);
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || !isExpiredUserPlan(user)) {
    return;
  }
  await resetUserToDefaultPlan(user.id);
}

export async function resetExpiredUserPlans(): Promise<void> {
  const rows = await db.select().from(users);
  await Promise.all(rows.map((user) => settleExpiredRedemptionQuotas(user.id)));
  await Promise.all(rows.filter(isExpiredUserPlan).map((user) => resetUserToDefaultPlan(user.id)));
}

export async function settleExpiredRedemptionQuotas(userId: string, baseDate: Date = new Date()): Promise<void> {
  const now = baseDate.toISOString();
  await db.transaction(async (tx) => {
    const expiredGrants = await tx
      .select()
      .from(redemptionCodeRedemptions)
      .where(and(eq(redemptionCodeRedemptions.userId, userId), lte(redemptionCodeRedemptions.expiresAt, now), isNull(redemptionCodeRedemptions.settledAt)))
      .for("update");
    if (expiredGrants.length === 0) {
      return;
    }

    const [user] = await tx.select().from(users).where(eq(users.id, userId)).limit(1).for("update");
    if (!user) {
      return;
    }

    const totalExpiredQuota = expiredGrants.reduce((total, grant) => total + Number(grant.quotaGranted ?? 0), 0);
    const quotaBefore = Number(user.quotaTotal ?? 0);
    const quotaUsed = Number(user.quotaUsed ?? 0);
    const unusedQuota = Math.max(0, quotaBefore - quotaUsed);
    const quotaDeduction = Math.min(totalExpiredQuota, unusedQuota);
    const quotaAfter = quotaBefore - quotaDeduction;
    const expiredGrantIds = expiredGrants.map((grant) => grant.id);

    if (quotaDeduction > 0) {
      await tx.update(users).set({ quotaTotal: quotaAfter, updatedAt: now }).where(eq(users.id, user.id));
      await tx.insert(billingTransactions).values({
        id: randomUUID(),
        userId: user.id,
        workspaceId: null,
        type: "redemption_code_expiration",
        title: "兑换码额度到期",
        status: "succeeded",
        amountCents: 0,
        balanceBeforeCents: Number(user.balanceCents ?? 0),
        balanceAfterCents: Number(user.balanceCents ?? 0),
        quotaBefore,
        quotaAfter,
        quotaConsumed: 0,
        imageCount: 0,
        quotaCount: -quotaDeduction,
        unitPriceCents: 0,
        currency: user.currency || DEFAULT_CURRENCY,
        relatedId: null,
        note: `已到期兑换码额度扣减 ${quotaDeduction} 张`,
        createdByUserId: null,
        metadataJson: JSON.stringify({
          redemptionIds: expiredGrantIds,
          totalExpiredQuota,
          settledAt: now
        }),
        createdAt: now
      });
    }

    await tx
      .update(redemptionCodeRedemptions)
      .set({ settledAt: now })
      .where(inArray(redemptionCodeRedemptions.id, expiredGrantIds));
  });
}

function isExpiredUserPlan(user: typeof users.$inferSelect): boolean {
  if (!user.planExpiresAt) {
    return false;
  }
  const expiresAt = new Date(user.planExpiresAt).getTime();
  return Number.isFinite(expiresAt) && expiresAt <= Date.now();
}

async function resetUserToDefaultPlan(userId: string): Promise<void> {
  const defaultPlan = await getDefaultPlan();
  await db
    .update(users)
    .set({
      planId: defaultPlan.id,
      planExpiresAt: null,
      quotaTotal: defaultPlan.imageQuota,
      quotaUsed: 0,
      storageQuotaBytes: defaultPlan.storageQuotaBytes,
      updatedAt: new Date().toISOString()
    })
    .where(eq(users.id, userId));
}

async function getDefaultPlan(): Promise<Pick<typeof subscriptionPlans.$inferSelect, "id" | "imageQuota" | "storageQuotaBytes">> {
  const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, DEFAULT_PLAN_ID)).limit(1);
  return {
    id: plan?.id ?? DEFAULT_PLAN_ID,
    imageQuota: Number(plan?.imageQuota ?? 0),
    storageQuotaBytes: Number(plan?.storageQuotaBytes ?? DEFAULT_STORAGE_QUOTA_BYTES)
  };
}
