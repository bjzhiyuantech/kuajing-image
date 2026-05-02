export const AUTH_TOKEN_STORAGE_KEY = "gpt-image-canvas.authToken";

export type AuthRole = "user" | "admin" | string;

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: AuthRole;
  planId?: string;
  planName?: string;
  planExpiresAt?: string;
  quotaTotal?: number;
  quotaUsed?: number;
  balanceCents?: number;
  recordCount?: number;
  packageRemaining?: number;
  storageQuotaBytes?: number;
  storageUsedBytes?: number;
}

export interface AuthSession {
  token: string;
  user: AuthUser;
}

export class UnauthorizedError extends Error {
  constructor(message = "登录已过期，请重新登录。") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export function getStoredAuthToken(): string | null {
  return window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
}

export function consumeAuthTokenFromUrl(): string | null {
  const url = new URL(window.location.href);
  const token = url.searchParams.get("authToken")?.trim() || "";
  if (!token) {
    return null;
  }

  storeAuthToken(token);
  url.searchParams.delete("authToken");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  return token;
}

export function storeAuthToken(token: string): void {
  window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
}

export function clearStoredAuthToken(): void {
  window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
}

export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const token = getStoredAuthToken();
  const headers = new Headers(init.headers);
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(input, {
    ...init,
    headers
  });

  if (response.status === 401) {
    clearStoredAuthToken();
    window.dispatchEvent(new CustomEvent("auth:unauthorized"));
    throw new UnauthorizedError();
  }

  return response;
}

export async function loginWithPassword(email: string, password: string): Promise<AuthSession> {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email: email.trim(), password })
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "登录失败，请检查邮箱和密码。"));
  }

  return parseAuthSession(await response.json());
}

export async function registerWithPassword(email: string, password: string, displayName: string): Promise<AuthSession> {
  const response = await fetch("/api/auth/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email: email.trim(), password, displayName: displayName.trim() })
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "注册失败，请稍后重试。"));
  }

  return parseAuthSession(await response.json());
}

export async function fetchCurrentUser(): Promise<AuthUser> {
  const response = await authFetch("/api/auth/me");
  if (!response.ok) {
    throw new Error(await readApiError(response, "无法获取当前账户信息。"));
  }

  return parseAuthUserFromMeResponse(await response.json());
}

export async function readApiError(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as unknown;
    if (isRecord(body)) {
      const error = body.error;
      if (isRecord(error) && typeof error.message === "string") {
        return `${error.message}（HTTP ${response.status}）`;
      }
      if (typeof body.message === "string") {
        return `${body.message}（HTTP ${response.status}）`;
      }
    }
  } catch {
    // Fall through to the caller-facing fallback.
  }

  return `${fallback}（HTTP ${response.status}）`;
}

function parseAuthSession(value: unknown): AuthSession {
  if (!isRecord(value)) {
    throw new Error("认证服务返回了无法识别的数据。");
  }

  const tokenValue = typeof value.token === "string" ? value.token : typeof value.accessToken === "string" ? value.accessToken : "";
  const userValue = isRecord(value.user) ? value.user : value;
  if (!tokenValue) {
    throw new Error("认证服务未返回 token。");
  }

  return {
    token: tokenValue,
    user: parseAuthUser(userValue)
  };
}

function parseAuthUserFromMeResponse(value: unknown): AuthUser {
  if (isRecord(value) && isRecord(value.user)) {
    return parseAuthUser(value.user);
  }

  return parseAuthUser(value);
}

export function parseAuthUser(value: unknown): AuthUser {
  if (!isRecord(value)) {
    throw new Error("用户信息格式无法识别。");
  }

  return {
    id: stringFrom(value.id) || stringFrom(value.userId) || stringFrom(value.email) || "current-user",
    email: stringFrom(value.email) || "unknown@example.com",
    displayName: stringFrom(value.displayName) || stringFrom(value.name) || stringFrom(value.email) || "未命名用户",
    role: stringFrom(value.role) || "user",
    planId: stringFrom(value.planId ?? value.plan_id),
    planName: stringFrom(value.planName ?? value.plan_name ?? (isRecord(value.plan) ? value.plan.name : undefined)),
    planExpiresAt: stringFrom(value.planExpiresAt ?? value.plan_expires_at),
    quotaTotal: numberFrom(value.quota_total ?? value.quotaTotal),
    quotaUsed: numberFrom(value.quota_used ?? value.quotaUsed),
    balanceCents: numberFrom(value.balance_cents ?? value.balanceCents ?? (isRecord(value.balance) ? value.balance.amountCents ?? value.balance.cents : undefined)),
    recordCount: numberFrom(value.record_count ?? value.recordCount ?? value.generationCount),
    packageRemaining: numberFrom(value.package_remaining ?? value.packageRemaining ?? value.quotaRemaining),
    storageQuotaBytes: numberFrom(value.storage_quota_bytes ?? value.storageQuotaBytes ?? (isRecord(value.storage) ? value.storage.quotaBytes : undefined)),
    storageUsedBytes: numberFrom(value.storage_used_bytes ?? value.storageUsedBytes ?? (isRecord(value.storage) ? value.storage.usedBytes : undefined))
  };
}

export function isAdminUser(user: AuthUser | null): boolean {
  return user?.role === "admin" || user?.role === "super_admin";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringFrom(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberFrom(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : undefined;
  }
  return undefined;
}
