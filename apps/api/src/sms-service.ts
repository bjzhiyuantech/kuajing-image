import { createHash, createHmac, randomInt, randomUUID } from "node:crypto";
import { and, desc, eq, lt } from "drizzle-orm";
import { db } from "./database.js";
import { aliyunSmsRuntimeConfig } from "./runtime.js";
import { smsVerificationCodes, systemSettings, users } from "./schema.js";

const SMS_SETTINGS_KEY = "sms.aliyun";
const REGISTER_PURPOSE = "register";
const BIND_PURPOSE = "bind_phone";
const CODE_TTL_MS = 10 * 60 * 1000;
const SEND_COOLDOWN_MS = 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 5;

export interface AliyunSmsSettings {
  enabled: boolean;
  accessKeyId: string;
  accessKeySecret?: string;
  endpoint: string;
  signName: string;
  registerTemplateCode: string;
  bindTemplateCode: string;
}

export interface SaveAliyunSmsSettingsInput {
  enabled: boolean;
  accessKeyId?: string;
  accessKeySecret?: string;
  preserveAccessKeySecret?: boolean;
  endpoint?: string;
  signName?: string;
  registerTemplateCode?: string;
  bindTemplateCode?: string;
}

export async function sendRegisterSmsCode(phoneInput: string): Promise<{ ok: true; expiresInSeconds: number; cooldownSeconds: number }> {
  const phone = normalizePhone(phoneInput);
  validatePhone(phone);
  const existingUser = await findUserByPhone(phone);
  if (existingUser) {
    throw new SmsError("phone_exists", "该手机号已经注册。", 409);
  }
  return sendSmsCode({ phone, purpose: REGISTER_PURPOSE });
}

export async function sendBindPhoneSmsCode(phoneInput: string, currentUserId: string): Promise<{ ok: true; expiresInSeconds: number; cooldownSeconds: number }> {
  const phone = normalizePhone(phoneInput);
  validatePhone(phone);
  const existingUser = await findUserByPhone(phone);
  if (existingUser && existingUser.id !== currentUserId) {
    throw new SmsError("phone_exists", "该手机号已经被其他账号绑定。", 409);
  }
  return sendSmsCode({ phone, purpose: BIND_PURPOSE });
}

export async function verifyRegisterSmsCode(phoneInput: string, codeInput: string): Promise<void> {
  await verifySmsCode(phoneInput, codeInput, REGISTER_PURPOSE);
}

export async function verifyBindPhoneSmsCode(phoneInput: string, codeInput: string): Promise<void> {
  await verifySmsCode(phoneInput, codeInput, BIND_PURPOSE);
}

export async function getAliyunSmsSettings(): Promise<{ sms: Omit<AliyunSmsSettings, "accessKeySecret"> & { accessKeySecretSaved: boolean; updatedAt?: string } }> {
  const row = await getSetting(SMS_SETTINGS_KEY);
  const settings = parseAliyunSmsSettings(row?.valueJson);
  return {
    sms: {
      enabled: settings.enabled,
      accessKeyId: settings.accessKeyId,
      endpoint: settings.endpoint,
      signName: settings.signName,
      registerTemplateCode: settings.registerTemplateCode,
      bindTemplateCode: settings.bindTemplateCode,
      accessKeySecretSaved: Boolean(settings.accessKeySecret),
      updatedAt: row?.updatedAt
    }
  };
}

export async function saveAliyunSmsSettings(input: SaveAliyunSmsSettingsInput): Promise<{ sms: Omit<AliyunSmsSettings, "accessKeySecret"> & { accessKeySecretSaved: boolean; updatedAt?: string } }> {
  const current = await getRawAliyunSmsSettings();
  const next: AliyunSmsSettings = {
    enabled: input.enabled,
    accessKeyId: input.accessKeyId?.trim() ?? current.accessKeyId,
    accessKeySecret: input.preserveAccessKeySecret ? current.accessKeySecret : input.accessKeySecret?.trim() || undefined,
    endpoint: input.endpoint?.trim() || current.endpoint || "dysmsapi.aliyuncs.com",
    signName: input.signName?.trim() ?? current.signName,
    registerTemplateCode: input.registerTemplateCode?.trim() ?? current.registerTemplateCode,
    bindTemplateCode: input.bindTemplateCode?.trim() ?? current.bindTemplateCode
  };
  if (next.enabled) {
    ensureAliyunSmsEnabled(next, REGISTER_PURPOSE);
  }
  await saveSetting(SMS_SETTINGS_KEY, next);
  return getAliyunSmsSettings();
}

export class SmsError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number
  ) {
    super(message);
  }
}

export function normalizePhone(phone: string): string {
  return phone.trim().replace(/[\s-]/gu, "");
}

export function validatePhone(phone: string): void {
  if (!/^1[3-9]\d{9}$/u.test(phone)) {
    throw new SmsError("invalid_phone", "请输入有效的中国大陆手机号。", 400);
  }
}

async function sendSmsCode(input: { phone: string; purpose: string }): Promise<{ ok: true; expiresInSeconds: number; cooldownSeconds: number }> {
  const settings = await getRawAliyunSmsSettings();
  ensureAliyunSmsEnabled(settings, input.purpose);
  const latest = await findLatestCode(input.phone, input.purpose);
  const now = new Date();
  if (latest && !latest.consumedAt && now.getTime() - new Date(latest.sentAt).getTime() < SEND_COOLDOWN_MS) {
    throw new SmsError("sms_code_too_frequent", "验证码发送太频繁，请稍后再试。", 429);
  }

  await deleteExpiredCodes();
  const code = randomInt(100000, 1000000).toString();
  const expiresAt = new Date(now.getTime() + CODE_TTL_MS).toISOString();
  await db.insert(smsVerificationCodes).values({
    id: randomUUID(),
    phone: input.phone,
    purpose: input.purpose,
    codeHash: hashCode(input.phone, input.purpose, code),
    expiresAt,
    consumedAt: null,
    attemptCount: 0,
    sentAt: now.toISOString(),
    createdAt: now.toISOString()
  });

  try {
    await sendAliyunSms(settings, input.phone, templateCodeForPurpose(settings, input.purpose), code);
  } catch (error) {
    throw new SmsError("aliyun_sms_send_failed", error instanceof Error ? `短信验证码发送失败：${error.message}` : "短信验证码发送失败。", 500);
  }
  return { ok: true, expiresInSeconds: CODE_TTL_MS / 1000, cooldownSeconds: SEND_COOLDOWN_MS / 1000 };
}

async function verifySmsCode(phoneInput: string, codeInput: string, purpose: string): Promise<void> {
  const phone = normalizePhone(phoneInput);
  const code = codeInput.trim();
  validatePhone(phone);
  if (!/^\d{6}$/u.test(code)) {
    throw new SmsError("invalid_sms_code", "请输入 6 位短信验证码。", 400);
  }

  const latest = await findLatestCode(phone, purpose);
  if (!latest || latest.consumedAt) {
    throw new SmsError("sms_code_missing", "请先获取短信验证码。", 400);
  }
  if (new Date(latest.expiresAt).getTime() < Date.now()) {
    throw new SmsError("sms_code_expired", "验证码已过期，请重新获取。", 400);
  }
  if (latest.attemptCount >= MAX_VERIFY_ATTEMPTS) {
    throw new SmsError("sms_code_locked", "验证码错误次数过多，请重新获取。", 400);
  }

  const expected = hashCode(phone, purpose, code);
  if (expected !== latest.codeHash) {
    await db.update(smsVerificationCodes).set({ attemptCount: latest.attemptCount + 1 }).where(eq(smsVerificationCodes.id, latest.id));
    throw new SmsError("invalid_sms_code", "短信验证码不正确。", 400);
  }

  await db.update(smsVerificationCodes).set({ consumedAt: new Date().toISOString() }).where(eq(smsVerificationCodes.id, latest.id));
}

async function sendAliyunSms(settings: AliyunSmsSettings, phone: string, templateCode: string, code: string): Promise<void> {
  const params: Record<string, string> = {
    AccessKeyId: settings.accessKeyId,
    Action: "SendSms",
    Format: "JSON",
    PhoneNumbers: phone,
    RegionId: "cn-hangzhou",
    SignName: settings.signName,
    SignatureMethod: "HMAC-SHA1",
    SignatureNonce: randomUUID(),
    SignatureVersion: "1.0",
    TemplateCode: templateCode,
    TemplateParam: JSON.stringify({ code }),
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/u, "Z"),
    Version: "2017-05-25"
  };
  params.Signature = signAliyunRequest(params, settings.accessKeySecret ?? "");
  const url = `https://${settings.endpoint}/?${new URLSearchParams(params).toString()}`;
  const response = await fetch(url);
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  const codeValue = typeof body.Code === "string" ? body.Code : "";
  if (!response.ok || codeValue !== "OK") {
    const message = typeof body.Message === "string" ? body.Message : `Aliyun SMS responded ${response.status}`;
    throw new Error(message);
  }
}

function signAliyunRequest(params: Record<string, string>, accessKeySecret: string): string {
  const canonicalizedQuery = Object.keys(params)
    .filter((key) => key !== "Signature")
    .sort()
    .map((key) => `${percentEncode(key)}=${percentEncode(params[key] ?? "")}`)
    .join("&");
  const stringToSign = `GET&${percentEncode("/")}&${percentEncode(canonicalizedQuery)}`;
  return createHmac("sha1", `${accessKeySecret}&`).update(stringToSign).digest("base64");
}

function percentEncode(value: string): string {
  return encodeURIComponent(value).replace(/\+/gu, "%20").replace(/\*/gu, "%2A").replace(/%7E/gu, "~");
}

function ensureAliyunSmsEnabled(settings: AliyunSmsSettings, purpose: string): void {
  if (!settings.enabled) {
    throw new SmsError("sms_disabled", "短信验证码未启用，请联系管理员。", 503);
  }
  if (!settings.accessKeyId || !settings.accessKeySecret || !settings.endpoint || !settings.signName || !templateCodeForPurpose(settings, purpose)) {
    throw new SmsError("sms_not_configured", "阿里云短信配置不完整，请联系管理员。", 503);
  }
}

function templateCodeForPurpose(settings: AliyunSmsSettings, purpose: string): string {
  return purpose === BIND_PURPOSE ? settings.bindTemplateCode || settings.registerTemplateCode : settings.registerTemplateCode;
}

async function getRawAliyunSmsSettings(): Promise<AliyunSmsSettings> {
  const row = await getSetting(SMS_SETTINGS_KEY);
  return parseAliyunSmsSettings(row?.valueJson);
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

async function findLatestCode(phone: string, purpose: string): Promise<typeof smsVerificationCodes.$inferSelect | undefined> {
  const [row] = await db
    .select()
    .from(smsVerificationCodes)
    .where(and(eq(smsVerificationCodes.phone, phone), eq(smsVerificationCodes.purpose, purpose)))
    .orderBy(desc(smsVerificationCodes.createdAt))
    .limit(1);
  return row;
}

async function deleteExpiredCodes(): Promise<void> {
  await db.delete(smsVerificationCodes).where(lt(smsVerificationCodes.expiresAt, new Date(Date.now() - CODE_TTL_MS).toISOString()));
}

async function findUserByPhone(phone: string): Promise<(typeof users.$inferSelect) | undefined> {
  const [row] = await db.select().from(users).where(eq(users.phone, phone)).limit(1);
  return row;
}

function parseAliyunSmsSettings(valueJson: string | undefined): AliyunSmsSettings {
  const value = parseRecord(valueJson);
  const hasSavedSettings = Object.keys(value).length > 0;
  return {
    enabled: hasSavedSettings ? value.enabled === true : aliyunSmsRuntimeConfig.enabled,
    accessKeyId: stringValue(value.accessKeyId) ?? aliyunSmsRuntimeConfig.accessKeyId ?? "",
    accessKeySecret: stringValue(value.accessKeySecret) ?? aliyunSmsRuntimeConfig.accessKeySecret,
    endpoint: stringValue(value.endpoint) ?? aliyunSmsRuntimeConfig.endpoint,
    signName: stringValue(value.signName) ?? aliyunSmsRuntimeConfig.signName ?? "",
    registerTemplateCode: stringValue(value.registerTemplateCode) ?? aliyunSmsRuntimeConfig.registerTemplateCode ?? "",
    bindTemplateCode: stringValue(value.bindTemplateCode) ?? aliyunSmsRuntimeConfig.bindTemplateCode ?? ""
  };
}

function parseRecord(valueJson: string | undefined): Record<string, unknown> {
  if (!valueJson) return {};
  try {
    const value = JSON.parse(valueJson) as unknown;
    return isRecord(value) ? value : {};
  } catch {
    return {};
  }
}

function hashCode(phone: string, purpose: string, code: string): string {
  return createHash("sha256").update(`${phone}:${purpose}:${code}`).digest("hex");
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
