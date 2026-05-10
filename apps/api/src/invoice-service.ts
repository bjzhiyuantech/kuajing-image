import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import type { RequestTenant } from "./auth-context.js";
import type {
  ApplyInvoiceRequest,
  InvoiceApplicationProfile,
  InvoiceApplicationRecord,
  InvoiceApplicationStatus,
  InvoiceApplicationsResponse,
  InvoiceSummary,
  UpdateInvoiceApplicationRequest
} from "./contracts.js";
import { db } from "./database.js";
import { invoiceApplications, users } from "./schema.js";

const DEFAULT_INVOICE_CONTENT = "商品图生成服务";
const DEFAULT_INVOICE_TYPE = "electronic" as const;
const DEFAULT_STATUS = "pending" as const;
const FINAL_STATUSES = new Set<InvoiceApplicationStatus>(["issued", "rejected"]);

export class InvoiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400
  ) {
    super(message);
  }
}

export async function getInvoiceApplications(tenant: RequestTenant): Promise<InvoiceApplicationsResponse> {
  const [user] = await db.select().from(users).where(eq(users.id, tenant.userId)).limit(1);
  if (!user) {
    throw new InvoiceError("user_not_found", "用户不存在。", 404);
  }
  const rows = await db
    .select()
    .from(invoiceApplications)
    .where(eq(invoiceApplications.userId, tenant.userId))
    .orderBy(desc(invoiceApplications.createdAt))
    .limit(10);

  return toApplicationsResponse(user, rows);
}

export async function applyForInvoice(tenant: RequestTenant, input: ApplyInvoiceRequest): Promise<InvoiceApplicationsResponse> {
  const profile = validateInvoiceProfile(input);

  await db.transaction(async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.id, tenant.userId)).limit(1).for("update");
    if (!user) {
      throw new InvoiceError("user_not_found", "用户不存在。", 404);
    }
    const summary = toInvoiceSummary(user);
    if (profile.amountCents > summary.requestableAmountCents) {
      throw new InvoiceError(
        "invoice_amount_exceeds_available",
        `开票金额不能超过当前可申请金额 ${formatMoney(summary.requestableAmountCents, summary.currency)}。`,
        409
      );
    }

    const now = new Date().toISOString();
    await tx.update(users).set({
      invoiceReservedCents: Number(user.invoiceReservedCents ?? 0) + profile.amountCents,
      updatedAt: now
    }).where(eq(users.id, user.id));
    await tx.insert(invoiceApplications).values({
      id: randomUUID(),
      userId: tenant.userId,
      invoiceType: DEFAULT_INVOICE_TYPE,
      headerType: profile.headerType,
      title: profile.title,
      taxNumber: profile.taxNumber ?? null,
      invoiceContent: profile.invoiceContent,
      amountCents: profile.amountCents,
      email: profile.email,
      phone: profile.phone ?? null,
      companyAddress: profile.companyAddress ?? null,
      bankName: profile.bankName ?? null,
      bankAccount: profile.bankAccount ?? null,
      remark: profile.remark ?? null,
      status: DEFAULT_STATUS,
      handledByUserId: null,
      handledAt: null,
      reviewNote: null,
      createdAt: now,
      updatedAt: now
    });
  });

  return getInvoiceApplications(tenant);
}

export async function listAdminInvoiceApplications(limit: number): Promise<InvoiceApplicationsResponse> {
  const rows = await db
    .select({
      application: invoiceApplications,
      user: users
    })
    .from(invoiceApplications)
    .leftJoin(users, eq(users.id, invoiceApplications.userId))
    .orderBy(desc(invoiceApplications.createdAt))
    .limit(limit);

  return {
    summary: sumInvoiceSummary(rows.map((row) => row.user).filter((user): user is typeof users.$inferSelect => Boolean(user))),
    applications: rows.map(({ application, user }) =>
      toRecord(application, {
        userEmail: user?.email ?? undefined,
        userDisplayName: user?.displayName ?? undefined
      })
    )
  };
}

export async function updateInvoiceApplication(
  applicationId: string,
  adminUserId: string,
  input: UpdateInvoiceApplicationRequest
): Promise<InvoiceApplicationRecord> {
  const nextStatus = normalizeStatus(input.status);
  const reviewNote = limitedString(input.reviewNote, 1000);

  return db.transaction(async (tx) => {
    const [application] = await tx.select().from(invoiceApplications).where(eq(invoiceApplications.id, applicationId)).limit(1).for("update");
    if (!application) {
      throw new InvoiceError("invoice_application_not_found", "开票申请不存在。", 404);
    }
    const currentStatus = normalizeStatus(application.status);
    if (FINAL_STATUSES.has(currentStatus) && currentStatus !== nextStatus) {
      throw new InvoiceError("invoice_application_finalized", "已完成处理的开票申请不能再次变更。", 409);
    }

    const [user] = await tx.select().from(users).where(eq(users.id, application.userId)).limit(1).for("update");
    if (!user) {
      throw new InvoiceError("user_not_found", "用户不存在。", 404);
    }

    const amountCents = Number(application.amountCents ?? 0);
    const patch: Partial<typeof users.$inferInsert> = {};
    if (!FINAL_STATUSES.has(currentStatus) && nextStatus === "issued") {
      patch.invoiceReservedCents = Math.max(0, Number(user.invoiceReservedCents ?? 0) - amountCents);
      patch.invoiceIssuedCents = Number(user.invoiceIssuedCents ?? 0) + amountCents;
    } else if (!FINAL_STATUSES.has(currentStatus) && nextStatus === "rejected") {
      patch.invoiceReservedCents = Math.max(0, Number(user.invoiceReservedCents ?? 0) - amountCents);
    }
    if (Object.keys(patch).length > 0) {
      await tx.update(users).set({ ...patch, updatedAt: new Date().toISOString() }).where(eq(users.id, user.id));
    }

    const now = new Date().toISOString();
    await tx
      .update(invoiceApplications)
      .set({
        status: nextStatus,
        handledByUserId: FINAL_STATUSES.has(nextStatus) ? adminUserId : application.handledByUserId,
        handledAt: FINAL_STATUSES.has(nextStatus) ? now : application.handledAt,
        reviewNote: reviewNote ?? application.reviewNote,
        updatedAt: now
      })
      .where(eq(invoiceApplications.id, application.id));

    const [updated] = await tx.select().from(invoiceApplications).where(eq(invoiceApplications.id, application.id)).limit(1);
    return toRecord(updated);
  });
}

function toApplicationsResponse(user: typeof users.$inferSelect, rows: Array<typeof invoiceApplications.$inferSelect>): InvoiceApplicationsResponse {
  return {
    summary: toInvoiceSummary(user),
    profile: rows[0] ? toRecord(rows[0]) : undefined,
    applications: rows.map((row) => toRecord(row))
  };
}

function toInvoiceSummary(user: typeof users.$inferSelect): InvoiceSummary {
  const paidAmountCents = Number(user.invoicePaidCents ?? 0);
  const issuedAmountCents = Number(user.invoiceIssuedCents ?? 0);
  const reservedAmountCents = Number(user.invoiceReservedCents ?? 0);
  return {
    currency: user.currency || "CNY",
    paidAmountCents,
    issuedAmountCents,
    reservedAmountCents,
    availableAmountCents: Math.max(0, paidAmountCents - issuedAmountCents),
    requestableAmountCents: Math.max(0, paidAmountCents - issuedAmountCents - reservedAmountCents)
  };
}

function sumInvoiceSummary(userRows: Array<typeof users.$inferSelect>): InvoiceSummary {
  const seen = new Set<string>();
  const summary = {
    currency: "CNY",
    paidAmountCents: 0,
    issuedAmountCents: 0,
    reservedAmountCents: 0,
    availableAmountCents: 0,
    requestableAmountCents: 0
  };
  for (const user of userRows) {
    if (seen.has(user.id)) {
      continue;
    }
    seen.add(user.id);
    const userSummary = toInvoiceSummary(user);
    summary.currency = userSummary.currency || summary.currency;
    summary.paidAmountCents += userSummary.paidAmountCents;
    summary.issuedAmountCents += userSummary.issuedAmountCents;
    summary.reservedAmountCents += userSummary.reservedAmountCents;
    summary.availableAmountCents += userSummary.availableAmountCents;
    summary.requestableAmountCents += userSummary.requestableAmountCents;
  }
  return summary;
}

function validateInvoiceProfile(input: ApplyInvoiceRequest): InvoiceApplicationProfile {
  const headerType = input.headerType === "personal" ? "personal" : "company";
  const title = limitedString(input.title, 255);
  const invoiceContent = limitedString(input.invoiceContent, 255) || DEFAULT_INVOICE_CONTENT;
  const email = limitedString(input.email, 255);
  const amountCents = nonNegativeInteger(input.amountCents);

  if (!title) {
    throw new InvoiceError("invalid_invoice_profile", "请填写发票抬头。");
  }
  if (!email || !isEmail(email)) {
    throw new InvoiceError("invalid_invoice_profile", "请填写正确的接收邮箱。");
  }
  if (amountCents === undefined || amountCents <= 0) {
    throw new InvoiceError("invalid_invoice_profile", "请填写有效的开票金额。");
  }

  const taxNumber = limitedString(input.taxNumber, 64);
  if (headerType === "company" && !taxNumber) {
    throw new InvoiceError("invalid_invoice_profile", "企业抬头需要填写纳税人识别号。");
  }

  return {
    headerType,
    title,
    taxNumber: taxNumber || undefined,
    invoiceContent,
    amountCents,
    email,
    phone: limitedString(input.phone, 32) || undefined,
    companyAddress: limitedString(input.companyAddress, 255) || undefined,
    bankName: limitedString(input.bankName, 255) || undefined,
    bankAccount: limitedString(input.bankAccount, 255) || undefined,
    remark: limitedString(input.remark, 1000) || undefined
  };
}

function toProfile(row: typeof invoiceApplications.$inferSelect): InvoiceApplicationProfile {
  return {
    headerType: row.headerType === "personal" ? "personal" : "company",
    title: row.title,
    taxNumber: row.taxNumber ?? undefined,
    invoiceContent: row.invoiceContent,
    amountCents: Number(row.amountCents ?? 0),
    email: row.email,
    phone: row.phone ?? undefined,
    companyAddress: row.companyAddress ?? undefined,
    bankName: row.bankName ?? undefined,
    bankAccount: row.bankAccount ?? undefined,
    remark: row.remark ?? undefined
  };
}

function toRecord(
  row: typeof invoiceApplications.$inferSelect,
  user?: { userEmail?: string; userDisplayName?: string }
): InvoiceApplicationRecord {
  return {
    id: row.id,
    userId: row.userId,
    userEmail: user?.userEmail,
    userDisplayName: user?.userDisplayName,
    invoiceType: "electronic",
    status: normalizeStatus(row.status),
    handledByUserId: row.handledByUserId ?? undefined,
    handledAt: row.handledAt ?? undefined,
    reviewNote: row.reviewNote ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...toProfile(row)
  };
}

function normalizeStatus(value: unknown): InvoiceApplicationStatus {
  if (value === "processing" || value === "issued" || value === "rejected") {
    return value;
  }
  return "pending";
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function limitedString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.slice(0, maxLength);
}

function nonNegativeInteger(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return undefined;
  }
  return value;
}

function formatMoney(amountCents: number, currency: string): string {
  return `${(amountCents / 100).toFixed(2)} ${currency}`;
}
