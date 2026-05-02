import { eq } from "drizzle-orm";
import { db } from "./database.js";
import { subscriptionPlans, users } from "./schema.js";

const DEFAULT_PLAN_ID = "free";
const DEFAULT_STORAGE_QUOTA_BYTES = 1024 * 1024 * 1024;

export function planExpiryFrom(base: Date = new Date()): string {
  const expiresAt = new Date(base);
  expiresAt.setMonth(expiresAt.getMonth() + 1);
  return expiresAt.toISOString();
}

export async function ensureUserPlanCurrent(userId: string): Promise<void> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || !isExpiredPaidPlan(user)) {
    return;
  }
  await resetUserToDefaultPlan(user.id);
}

export async function resetExpiredUserPlans(): Promise<void> {
  const rows = await db.select().from(users);
  await Promise.all(rows.filter(isExpiredPaidPlan).map((user) => resetUserToDefaultPlan(user.id)));
}

function isExpiredPaidPlan(user: typeof users.$inferSelect): boolean {
  if (!user.planExpiresAt || !user.planId || user.planId === DEFAULT_PLAN_ID) {
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
