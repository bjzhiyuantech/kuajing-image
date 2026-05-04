import { createHash, randomInt, randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import { and, desc, eq, lt } from "drizzle-orm";
import { db } from "./database.js";
import { emailVerificationCodes, systemSettings, users } from "./schema.js";

const SMTP_SETTINGS_KEY = "email.smtp";
const REGISTER_PURPOSE = "register";
const CODE_TTL_MS = 10 * 60 * 1000;
const SEND_COOLDOWN_MS = 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 5;

export interface SmtpSettings {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password?: string;
  fromName: string;
  fromEmail: string;
}

export interface SaveSmtpSettingsInput {
  enabled: boolean;
  host?: string;
  port?: number;
  secure?: boolean;
  username?: string;
  password?: string;
  preservePassword?: boolean;
  fromName?: string;
  fromEmail?: string;
}

export async function sendRegisterEmailCode(emailInput: string): Promise<{ ok: true; expiresInSeconds: number; cooldownSeconds: number }> {
  const email = normalizeEmail(emailInput);
  validateEmail(email);

  const existingUser = await findUserByEmail(email);
  if (existingUser) {
    throw new EmailError("email_exists", "该邮箱已经注册。", 409);
  }

  const settings = await getRawSmtpSettings();
  ensureSmtpEnabled(settings);

  const latest = await findLatestCode(email, REGISTER_PURPOSE);
  const now = new Date();
  if (latest && !latest.consumedAt && now.getTime() - new Date(latest.sentAt).getTime() < SEND_COOLDOWN_MS) {
    throw new EmailError("email_code_too_frequent", "验证码发送太频繁，请稍后再试。", 429);
  }

  await deleteExpiredCodes();
  const code = randomInt(100000, 1000000).toString();
  const expiresAt = new Date(now.getTime() + CODE_TTL_MS).toISOString();
  await db.insert(emailVerificationCodes).values({
    id: randomUUID(),
    email,
    purpose: REGISTER_PURPOSE,
    codeHash: hashCode(email, REGISTER_PURPOSE, code),
    expiresAt,
    consumedAt: null,
    attemptCount: 0,
    sentAt: now.toISOString(),
    createdAt: now.toISOString()
  });

  try {
    await sendMail(settings, email, "注册验证码", `你的注册验证码是 ${code}，10 分钟内有效。`);
  } catch (error) {
    throw new EmailError("smtp_send_failed", error instanceof Error ? `验证码发送失败：${error.message}` : "验证码发送失败。", 500);
  }
  return { ok: true, expiresInSeconds: CODE_TTL_MS / 1000, cooldownSeconds: SEND_COOLDOWN_MS / 1000 };
}

export async function verifyRegisterEmailCode(emailInput: string, codeInput: string): Promise<void> {
  const email = normalizeEmail(emailInput);
  const code = codeInput.trim();
  validateEmail(email);
  if (!/^\d{6}$/u.test(code)) {
    throw new EmailError("invalid_email_code", "请输入 6 位邮箱验证码。", 400);
  }

  const latest = await findLatestCode(email, REGISTER_PURPOSE);
  if (!latest || latest.consumedAt) {
    throw new EmailError("email_code_missing", "请先获取邮箱验证码。", 400);
  }
  if (new Date(latest.expiresAt).getTime() < Date.now()) {
    throw new EmailError("email_code_expired", "验证码已过期，请重新获取。", 400);
  }
  if (latest.attemptCount >= MAX_VERIFY_ATTEMPTS) {
    throw new EmailError("email_code_locked", "验证码错误次数过多，请重新获取。", 400);
  }

  const expected = hashCode(email, REGISTER_PURPOSE, code);
  if (expected !== latest.codeHash) {
    await db
      .update(emailVerificationCodes)
      .set({ attemptCount: latest.attemptCount + 1 })
      .where(eq(emailVerificationCodes.id, latest.id));
    throw new EmailError("invalid_email_code", "邮箱验证码不正确。", 400);
  }

  await db
    .update(emailVerificationCodes)
    .set({ consumedAt: new Date().toISOString() })
    .where(eq(emailVerificationCodes.id, latest.id));
}

export async function getSmtpSettings(): Promise<{ smtp: Omit<SmtpSettings, "password"> & { passwordSaved: boolean; updatedAt?: string } }> {
  const row = await getSetting(SMTP_SETTINGS_KEY);
  const settings = parseSmtpSettings(row?.valueJson);
  return {
    smtp: {
      enabled: settings.enabled,
      host: settings.host,
      port: settings.port,
      secure: settings.secure,
      username: settings.username,
      fromName: settings.fromName,
      fromEmail: settings.fromEmail,
      passwordSaved: Boolean(settings.password),
      updatedAt: row?.updatedAt
    }
  };
}

export async function saveSmtpSettings(input: SaveSmtpSettingsInput): Promise<{ smtp: Omit<SmtpSettings, "password"> & { passwordSaved: boolean; updatedAt?: string } }> {
  const current = await getRawSmtpSettings();
  const next: SmtpSettings = {
    enabled: input.enabled,
    host: input.host?.trim() ?? current.host,
    port: input.port ?? current.port,
    secure: input.secure ?? current.secure,
    username: input.username?.trim() ?? current.username,
    password: input.preservePassword ? current.password : input.password?.trim() || undefined,
    fromName: input.fromName?.trim() ?? current.fromName,
    fromEmail: normalizeOptionalEmail(input.fromEmail) ?? current.fromEmail
  };

  if (next.enabled) {
    ensureSmtpEnabled(next);
  }

  await saveSetting(SMTP_SETTINGS_KEY, next);
  return getSmtpSettings();
}

export class EmailError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number
  ) {
    super(message);
  }
}

async function sendMail(settings: SmtpSettings, to: string, subject: string, text: string): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    auth: settings.username || settings.password ? { user: settings.username, pass: settings.password ?? "" } : undefined
  });
  await transporter.sendMail({
    from: formatAddress(settings.fromName, settings.fromEmail),
    to,
    subject,
    text
  });
}

function ensureSmtpEnabled(settings: SmtpSettings): void {
  if (!settings.enabled) {
    throw new EmailError("smtp_disabled", "邮箱验证码未启用，请联系管理员。", 503);
  }
  if (!settings.host || !settings.port || !settings.fromEmail) {
    throw new EmailError("smtp_not_configured", "SMTP 配置不完整，请联系管理员。", 503);
  }
  validateEmail(settings.fromEmail);
}

async function getRawSmtpSettings(): Promise<SmtpSettings> {
  const row = await getSetting(SMTP_SETTINGS_KEY);
  return parseSmtpSettings(row?.valueJson);
}

async function getSetting(key: string): Promise<typeof systemSettings.$inferSelect | undefined> {
  const [row] = await db.select().from(systemSettings).where(eq(systemSettings.key, key)).limit(1);
  return row;
}

async function saveSetting(key: string, value: unknown): Promise<void> {
  const now = new Date().toISOString();
  await db
    .insert(systemSettings)
    .values({ key, valueJson: JSON.stringify(value), createdAt: now, updatedAt: now })
    .onDuplicateKeyUpdate({ set: { valueJson: JSON.stringify(value), updatedAt: now } });
}

async function findLatestCode(email: string, purpose: string): Promise<typeof emailVerificationCodes.$inferSelect | undefined> {
  const [row] = await db
    .select()
    .from(emailVerificationCodes)
    .where(and(eq(emailVerificationCodes.email, email), eq(emailVerificationCodes.purpose, purpose)))
    .orderBy(desc(emailVerificationCodes.createdAt))
    .limit(1);
  return row;
}

async function deleteExpiredCodes(): Promise<void> {
  await db.delete(emailVerificationCodes).where(lt(emailVerificationCodes.expiresAt, new Date(Date.now() - CODE_TTL_MS).toISOString()));
}

async function findUserByEmail(email: string): Promise<(typeof users.$inferSelect) | undefined> {
  const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return row;
}

function parseSmtpSettings(valueJson: string | undefined): SmtpSettings {
  const value = parseRecord(valueJson);
  return {
    enabled: value.enabled === true,
    host: stringValue(value.host) ?? "",
    port: numberValue(value.port) ?? 465,
    secure: value.secure !== false,
    username: stringValue(value.username) ?? "",
    password: stringValue(value.password),
    fromName: stringValue(value.fromName) ?? "商图 AI 助手",
    fromEmail: stringValue(value.fromEmail) ?? ""
  };
}

function parseRecord(valueJson: string | undefined): Record<string, unknown> {
  if (!valueJson) {
    return {};
  }
  try {
    const value = JSON.parse(valueJson) as unknown;
    return isRecord(value) ? value : {};
  } catch {
    return {};
  }
}

function hashCode(email: string, purpose: string, code: string): string {
  return createHash("sha256").update(`${email}:${purpose}:${code}`).digest("hex");
}

function formatAddress(name: string, email: string): string {
  return name ? `"${name.replaceAll("\"", "'")}" <${email}>` : email;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeOptionalEmail(value: string | undefined): string | undefined {
  const email = value?.trim().toLowerCase();
  return email || undefined;
}

function validateEmail(email: string): void {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email) || email.length > 255) {
    throw new EmailError("invalid_email", "请输入有效邮箱。", 400);
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
