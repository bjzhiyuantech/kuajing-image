import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { RequestTenant } from "./auth-context.js";
import type {
  AppNotification,
  AppNotificationListResponse,
  AppNotificationSeverity,
  AppNotificationType,
  EcommerceBatchJobStatus,
  NotificationChannel,
  NotificationClientConfig,
  NotificationDevicePlatform,
  NotificationDeviceRegisterRequest,
  NotificationPayload
} from "./contracts.js";
import { getWechatMiniAppConfig, getWechatMiniAppServerConfig } from "./auth-service.js";
import { db } from "./database.js";
import { getuiRuntimeConfig } from "./runtime.js";
import { appNotifications, notificationDevices, wechatAccounts } from "./schema.js";

const DEFAULT_NOTIFICATION_POLLING_INTERVAL_MS = 20_000;
const GETUI_PROVIDER = "getui";
const WECHAT_PROVIDER = "miniapp";
const WECHAT_ACCESS_TOKEN_URL = "https://api.weixin.qq.com/cgi-bin/token";
const WECHAT_SUBSCRIBE_SEND_URL = "https://api.weixin.qq.com/cgi-bin/message/subscribe/send";
const WECHAT_TOKEN_REFRESH_SKEW_SECONDS = 120;

let cachedWechatAccessToken:
  | {
      appId: string;
      token: string;
      expiresAt: number;
    }
  | undefined;

export class NotificationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400
  ) {
    super(message);
  }
}

export async function getNotificationClientConfig(): Promise<NotificationClientConfig> {
  const wechatConfig = await getWechatMiniAppConfig();
  return {
    pollingIntervalMs: DEFAULT_NOTIFICATION_POLLING_INTERVAL_MS,
    wechatMiniAppTaskCompleteTemplateId: wechatConfig.wechatMiniApp.taskCompleteTemplateId
  };
}

export async function listNotifications(tenant: RequestTenant, limit = 30): Promise<AppNotificationListResponse> {
  const [items, unread] = await Promise.all([
    db
      .select()
      .from(appNotifications)
      .where(and(eq(appNotifications.userId, tenant.userId), eq(appNotifications.workspaceId, tenant.workspaceId)))
      .orderBy(desc(appNotifications.createdAt))
      .limit(Math.max(1, Math.min(limit, 100))),
    unreadNotificationCount(tenant)
  ]);

  return {
    notifications: items.map(toNotification),
    unreadCount: unread
  };
}

export async function unreadNotificationCount(tenant: RequestTenant): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(appNotifications)
    .where(and(eq(appNotifications.userId, tenant.userId), eq(appNotifications.workspaceId, tenant.workspaceId), isNull(appNotifications.readAt)));
  return Number(row?.count ?? 0);
}

export async function markNotificationRead(tenant: RequestTenant, notificationId: string): Promise<AppNotificationListResponse> {
  const now = new Date().toISOString();
  await db
    .update(appNotifications)
    .set({ readAt: now })
    .where(
      and(
        eq(appNotifications.id, notificationId),
        eq(appNotifications.userId, tenant.userId),
        eq(appNotifications.workspaceId, tenant.workspaceId),
        isNull(appNotifications.readAt)
      )
    );
  return listNotifications(tenant);
}

export async function markAllNotificationsRead(tenant: RequestTenant): Promise<AppNotificationListResponse> {
  const now = new Date().toISOString();
  await db
    .update(appNotifications)
    .set({ readAt: now })
    .where(and(eq(appNotifications.userId, tenant.userId), eq(appNotifications.workspaceId, tenant.workspaceId), isNull(appNotifications.readAt)));
  return listNotifications(tenant);
}

export async function registerNotificationDevice(
  tenant: RequestTenant,
  input: NotificationDeviceRegisterRequest
): Promise<{ deviceId: string; enabled: boolean }> {
  const channel = normalizeChannel(input.channel);
  const platform = normalizePlatform(input.platform);
  const provider = normalizeProvider(input.provider, channel);
  const pushToken = limitString(input.pushToken, 512);
  const deviceId = limitString(input.deviceId, 255) || stableDeviceId(tenant.userId, provider, pushToken || input.userAgent || channel);
  const now = new Date().toISOString();

  if ((channel === "native" || provider === GETUI_PROVIDER) && !pushToken) {
    throw new NotificationError("invalid_push_token", "请提供推送设备标识。");
  }

  await db
    .insert(notificationDevices)
    .values({
      id: randomUUID(),
      userId: tenant.userId,
      channel,
      platform,
      provider,
      pushToken: pushToken ?? null,
      deviceId,
      userAgent: limitString(input.userAgent, 1000) ?? null,
      enabled: 1,
      createdAt: now,
      updatedAt: now,
      lastSeenAt: now
    })
    .onDuplicateKeyUpdate({
      set: {
        channel,
        platform,
        provider,
        pushToken: pushToken ?? null,
        userAgent: limitString(input.userAgent, 1000) ?? null,
        enabled: 1,
        updatedAt: now,
        lastSeenAt: now
      }
    });

  return { deviceId, enabled: true };
}

export interface CreateNotificationInput {
  tenant: RequestTenant;
  type: AppNotificationType;
  severity: AppNotificationSeverity;
  title: string;
  body: string;
  actionUrl?: string;
  relatedType?: string;
  relatedId?: string;
  payload?: NotificationPayload;
}

export async function createNotification(input: CreateNotificationInput): Promise<AppNotification> {
  const now = new Date().toISOString();
  const row = {
    id: randomUUID(),
    workspaceId: input.tenant.workspaceId,
    userId: input.tenant.userId,
    type: input.type,
    severity: input.severity,
    title: input.title.slice(0, 255),
    body: input.body,
    actionUrl: input.actionUrl ?? null,
    relatedType: input.relatedType ?? null,
    relatedId: input.relatedId ?? null,
    payloadJson: input.payload ? JSON.stringify(input.payload) : null,
    createdAt: now,
    readAt: null,
    deliveredAt: null,
    dismissedAt: null
  } satisfies typeof appNotifications.$inferInsert;

  await db.insert(appNotifications).values(row);
  const notification = toNotification(row as typeof appNotifications.$inferSelect);
  void deliverNotification(input.tenant, notification).catch((error) => {
    console.warn(`[notifications] delivery failed notificationId=${notification.id}`, error);
  });
  return notification;
}

export async function createEcommerceJobFinishedNotification(input: {
  tenant: RequestTenant;
  jobId: string;
  status: EcommerceBatchJobStatus;
  productTitle?: string;
  totalScenes: number;
  completedScenes: number;
  succeededScenes: number;
  failedScenes: number;
}): Promise<AppNotification> {
  const productTitle = input.productTitle?.trim() || "你的生图任务";
  const failed = input.status === "failed";
  const partial = input.status === "partial";
  const title = failed ? "任务生成失败" : partial ? "任务部分完成" : "任务已完成";
  const body = failed
    ? `${productTitle} 生成失败，请稍后重试。`
    : partial
      ? `${productTitle} 已完成 ${input.succeededScenes} 个场景，${input.failedScenes} 个失败。`
      : `${productTitle} 已完成 ${input.succeededScenes || input.completedScenes} 个场景，快去查看结果。`;

  return createNotification({
    tenant: input.tenant,
    type: "ecommerce_job_finished",
    severity: failed ? "error" : partial ? "warning" : "success",
    title,
    body,
    actionUrl: `/jobs?jobId=${encodeURIComponent(input.jobId)}`,
    relatedType: "ecommerce_batch_job",
    relatedId: input.jobId,
    payload: {
      jobId: input.jobId,
      status: input.status,
      productTitle,
      totalScenes: input.totalScenes,
      completedScenes: input.completedScenes,
      succeededScenes: input.succeededScenes,
      failedScenes: input.failedScenes
    }
  });
}

async function deliverNotification(tenant: RequestTenant, notification: AppNotification): Promise<void> {
  await Promise.allSettled([
    deliverGetuiNotification(tenant, notification),
    deliverWechatMiniAppSubscribeNotification(tenant, notification)
  ]);
  await db.update(appNotifications).set({ deliveredAt: new Date().toISOString() }).where(eq(appNotifications.id, notification.id));
}

async function deliverGetuiNotification(tenant: RequestTenant, notification: AppNotification): Promise<void> {
  if (!getuiRuntimeConfig.enabled || !getuiRuntimeConfig.appId || !getuiRuntimeConfig.appKey || !getuiRuntimeConfig.masterSecret) {
    return;
  }

  const rows = await db
    .select()
    .from(notificationDevices)
    .where(and(eq(notificationDevices.userId, tenant.userId), eq(notificationDevices.provider, GETUI_PROVIDER), eq(notificationDevices.enabled, 1)));
  const cids = rows.flatMap((row) => (row.pushToken ? [row.pushToken] : []));
  if (!cids.length) {
    return;
  }

  const token = await getGetuiAuthToken();
  await Promise.all(
    cids.map((cid) =>
      fetch(`${getuiRuntimeConfig.baseUrl}/${getuiRuntimeConfig.appId}/push/single/cid`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          token
        },
        body: JSON.stringify({
          request_id: notification.id,
          settings: {
            ttl: 24 * 60 * 60 * 1000
          },
          audience: { cid: [cid] },
          push_message: {
            notification: {
              title: notification.title,
              body: notification.body,
              click_type: "intent",
              intent: `intent:#Intent;scheme=shangtuai;package=com.neimou.shangtuai;S.route=jobs;S.notificationId=${notification.id};end`
            },
            transmission: JSON.stringify({
              notificationId: notification.id,
              type: notification.type,
              actionUrl: notification.actionUrl,
              payload: notification.payload
            })
          },
          push_channel: {
            android: {
              ups: {
                notification: {
                  title: notification.title,
                  body: notification.body,
                  click_type: "intent",
                  intent: `intent:#Intent;scheme=shangtuai;package=com.neimou.shangtuai;S.route=jobs;S.notificationId=${notification.id};end`
                }
              }
            }
          }
        })
      }).then(async (response) => {
        if (!response.ok) {
          throw new Error(`Getui push failed: HTTP ${response.status} ${await response.text()}`);
        }
      })
    )
  );
}

async function getGetuiAuthToken(): Promise<string> {
  const timestamp = Date.now();
  const sign = createHash("sha256")
    .update(`${getuiRuntimeConfig.appKey}${timestamp}${getuiRuntimeConfig.masterSecret}`)
    .digest("hex");
  const response = await fetch(`${getuiRuntimeConfig.baseUrl}/${getuiRuntimeConfig.appId}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sign,
      timestamp,
      appkey: getuiRuntimeConfig.appKey
    })
  });
  const body = (await response.json().catch(() => undefined)) as { data?: { token?: string }; msg?: string } | undefined;
  const token = body?.data?.token;
  if (!response.ok || !token) {
    throw new Error(`Getui auth failed: ${body?.msg || response.status}`);
  }
  return token;
}

async function deliverWechatMiniAppSubscribeNotification(tenant: RequestTenant, notification: AppNotification): Promise<void> {
  if (notification.type !== "ecommerce_job_finished") {
    return;
  }
  const config = await getWechatMiniAppServerConfig();
  const templateId = config.taskCompleteTemplateId;
  if (!config.enabled || !config.appId || !config.appSecret || !templateId) {
    return;
  }

  const [account] = await db
    .select()
    .from(wechatAccounts)
    .where(and(eq(wechatAccounts.userId, tenant.userId), eq(wechatAccounts.provider, WECHAT_PROVIDER)))
    .limit(1);
  if (!account?.openId) {
    return;
  }

  const token = await getWechatAccessToken(config.appId, config.appSecret);
  const response = await fetch(`${WECHAT_SUBSCRIBE_SEND_URL}?access_token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      touser: account.openId,
      template_id: templateId,
      page: notification.actionUrl?.startsWith("/jobs") ? `pages/jobs/jobs?notificationId=${encodeURIComponent(notification.id)}` : "pages/jobs/jobs",
      miniprogram_state: "formal",
      lang: "zh_CN",
      data: buildWechatSubscribeData(notification)
    })
  });
  const body = (await response.json().catch(() => undefined)) as { errcode?: number; errmsg?: string } | undefined;
  if (!response.ok || (typeof body?.errcode === "number" && body.errcode !== 0)) {
    throw new Error(`WeChat subscribe send failed: ${body?.errmsg || response.status}`);
  }
}

async function getWechatAccessToken(appId: string, appSecret: string): Promise<string> {
  const now = Date.now();
  if (cachedWechatAccessToken?.appId === appId && cachedWechatAccessToken.expiresAt > now) {
    return cachedWechatAccessToken.token;
  }

  const url = new URL(WECHAT_ACCESS_TOKEN_URL);
  url.searchParams.set("grant_type", "client_credential");
  url.searchParams.set("appid", appId);
  url.searchParams.set("secret", appSecret);
  const response = await fetch(url);
  const body = (await response.json().catch(() => undefined)) as
    | { access_token?: string; expires_in?: number; errcode?: number; errmsg?: string }
    | undefined;
  if (!response.ok || !body?.access_token) {
    throw new Error(`WeChat access token failed: ${body?.errmsg || response.status}`);
  }

  cachedWechatAccessToken = {
    appId,
    token: body.access_token,
    expiresAt: now + Math.max(60, Number(body.expires_in ?? 7200) - WECHAT_TOKEN_REFRESH_SKEW_SECONDS) * 1000
  };
  return body.access_token;
}

function buildWechatSubscribeData(notification: AppNotification): Record<string, { value: string }> {
  const payload = notification.payload ?? {};
  const productTitle = stringPayload(payload.productTitle) || "生图任务";
  const status = stringPayload(payload.status) || "succeeded";
  const completedText = `${numberPayload(payload.succeededScenes) || numberPayload(payload.completedScenes) || 0}/${numberPayload(payload.totalScenes) || 0}`;
  return {
    thing1: { value: productTitle.slice(0, 20) },
    phrase2: { value: status === "failed" ? "失败" : status === "partial" ? "部分完成" : "已完成" },
    thing3: { value: notification.title.slice(0, 20) },
    character_string4: { value: completedText.slice(0, 32) },
    thing5: { value: notification.body.slice(0, 20) }
  };
}

function stringPayload(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function numberPayload(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function toNotification(row: typeof appNotifications.$inferSelect): AppNotification {
  return {
    id: row.id,
    type: row.type as AppNotificationType,
    severity: row.severity as AppNotificationSeverity,
    title: row.title,
    body: row.body,
    actionUrl: row.actionUrl ?? undefined,
    relatedType: row.relatedType ?? undefined,
    relatedId: row.relatedId ?? undefined,
    payload: parsePayload(row.payloadJson),
    createdAt: row.createdAt,
    readAt: row.readAt ?? undefined,
    deliveredAt: row.deliveredAt ?? undefined,
    dismissedAt: row.dismissedAt ?? undefined
  };
}

function parsePayload(value: string | null | undefined): NotificationPayload | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as NotificationPayload) : undefined;
  } catch {
    return undefined;
  }
}

function normalizeChannel(value: unknown): NotificationChannel {
  return value === "web" || value === "native" || value === "wechat_miniapp" ? value : "native";
}

function normalizePlatform(value: unknown): NotificationDevicePlatform {
  return value === "web" || value === "ios" || value === "android" || value === "wechat_miniapp" || value === "unknown" ? value : "unknown";
}

function normalizeProvider(value: unknown, channel: NotificationChannel): string {
  const provider = limitString(value, 64);
  if (provider) return provider;
  return channel === "native" ? GETUI_PROVIDER : channel;
}

function stableDeviceId(userId: string, provider: string, seed: string): string {
  return createHash("sha256").update(`${userId}:${provider}:${seed}`).digest("hex").slice(0, 48);
}

function limitString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
}
