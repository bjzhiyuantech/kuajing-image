import {
  AlertTriangle,
  BarChart3,
  Database,
  HardDrive,
  ImageIcon,
  Loader2,
  Lock,
  Mail,
  Package,
  ShieldCheck,
  Sparkles,
  User,
  Users
} from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { authFetch, readApiError, type AuthSession, type AuthUser } from "./authClient";

type AuthMode = "login" | "register";

export function AuthScreen({
  mode,
  onModeChange,
  onAuthenticated,
  onLogin,
  onRegister
}: {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  onAuthenticated: (session: AuthSession) => void;
  onLogin: (email: string, password: string) => Promise<AuthSession>;
  onRegister: (email: string, password: string, displayName: string) => Promise<AuthSession>;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isRegister = mode === "register";

  async function submitForm(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError("");

    if (!email.trim() || !password) {
      setError("请输入邮箱和密码。");
      return;
    }
    if (isRegister && !displayName.trim()) {
      setError("请输入显示名。");
      return;
    }

    setIsSubmitting(true);
    try {
      const session = isRegister ? await onRegister(email, password, displayName) : await onLogin(email, password);
      onAuthenticated(session);
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : isRegister ? "注册失败。" : "登录失败。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-workspace app-view">
      <section className="auth-panel" aria-labelledby="auth-title">
        <div className="auth-panel__intro">
          <div className="brand-lockup">
            <span className="brand-mark" aria-hidden="true" />
            <div>
              <p className="brand-name">gpt-image-canvas</p>
              <p className="brand-tagline">团队图像工作台</p>
            </div>
          </div>
          <div className="auth-panel__summary">
            <p className="auth-eyebrow">
              <Sparkles className="size-3.5" aria-hidden="true" />
              Workspace
            </p>
            <h1 id="auth-title">{isRegister ? "创建账户后进入工作台" : "登录后继续创作"}</h1>
            <p>画布、图库、生成记录和云存储设置会绑定到你的账户。</p>
          </div>
        </div>

        <form className="auth-form" onSubmit={(event) => void submitForm(event)}>
          <div className="auth-switch" role="tablist" aria-label="认证方式">
            <button
              aria-selected={!isRegister}
              className="auth-switch__tab"
              data-active={!isRegister}
              role="tab"
              type="button"
              onClick={() => {
                setError("");
                onModeChange("login");
              }}
            >
              登录
            </button>
            <button
              aria-selected={isRegister}
              className="auth-switch__tab"
              data-active={isRegister}
              role="tab"
              type="button"
              onClick={() => {
                setError("");
                onModeChange("register");
              }}
            >
              注册
            </button>
          </div>

          {isRegister ? (
            <label className="auth-field">
              <span>显示名</span>
              <div className="auth-input">
                <User className="size-4" aria-hidden="true" />
                <input
                  autoComplete="name"
                  name="displayName"
                  placeholder="例如：Mia Chen"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                />
              </div>
            </label>
          ) : null}

          <label className="auth-field">
            <span>邮箱</span>
            <div className="auth-input">
              <Mail className="size-4" aria-hidden="true" />
              <input
                autoComplete="email"
                name="email"
                placeholder="you@example.com"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
          </label>

          <label className="auth-field">
            <span>密码</span>
            <div className="auth-input">
              <Lock className="size-4" aria-hidden="true" />
              <input
                autoComplete={isRegister ? "new-password" : "current-password"}
                minLength={6}
                name="password"
                placeholder="至少 6 位"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
          </label>

          {error ? (
            <div className="auth-alert" role="alert">
              <AlertTriangle className="size-4" aria-hidden="true" />
              <p>{error}</p>
            </div>
          ) : null}

          <button className="primary-action h-11" disabled={isSubmitting} type="submit">
            {isSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="size-4" aria-hidden="true" />}
            {isRegister ? "注册并进入" : "登录工作台"}
          </button>
        </form>
      </section>
    </main>
  );
}

export function AccountPage({ user }: { user: AuthUser }) {
  const quotaTotal = user.quotaTotal ?? 0;
  const quotaUsed = user.quotaUsed ?? 0;
  const quotaPercent = quotaTotal > 0 ? Math.min(100, Math.round((quotaUsed / quotaTotal) * 100)) : 0;

  return (
    <main className="account-page app-view">
      <section className="settings-panel" aria-labelledby="account-title">
        <div className="settings-panel__header">
          <div>
            <p className="settings-eyebrow">Account</p>
            <h1 id="account-title">个人中心</h1>
          </div>
          <span className="role-badge">{roleLabel(user.role)}</span>
        </div>

        <div className="account-grid">
          <InfoTile label="邮箱" value={user.email} icon={<Mail className="size-4" aria-hidden="true" />} />
          <InfoTile label="显示名" value={user.displayName} icon={<User className="size-4" aria-hidden="true" />} />
          <InfoTile label="角色" value={roleLabel(user.role)} icon={<ShieldCheck className="size-4" aria-hidden="true" />} />
        </div>

        <section className="quota-panel" aria-labelledby="quota-title">
          <div>
            <p className="settings-eyebrow">Quota</p>
            <h2 id="quota-title">图片额度</h2>
          </div>
          <div className="quota-meter" aria-label={`已使用 ${quotaUsed}，总额度 ${quotaTotal}`}>
            <span style={{ width: `${quotaPercent}%` }} />
          </div>
          <div className="quota-row">
            <span>{quotaUsed.toLocaleString("zh-CN")} 已用</span>
            <span>{quotaTotal > 0 ? quotaTotal.toLocaleString("zh-CN") : "未设置"} 总额度</span>
          </div>
          <button className="secondary-action h-10" type="button">
            <Package className="size-4" aria-hidden="true" />
            套餐入口
          </button>
        </section>
      </section>
    </main>
  );
}

export function AdminPage() {
  const [stats, setStats] = useState<AdminStats>({});
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [jobs, setJobs] = useState<AdminJobRow[]>([]);
  const [assets, setAssets] = useState<AdminAssetRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadAdminData(): Promise<void> {
      setIsLoading(true);
      setError("");
      try {
        const [statsResponse, usersResponse, jobsResponse, assetsResponse] = await Promise.all([
          authFetch("/api/admin/stats"),
          authFetch("/api/admin/users"),
          authFetch("/api/admin/ecommerce/jobs"),
          authFetch("/api/admin/assets")
        ]);

        const responses = [statsResponse, usersResponse, jobsResponse, assetsResponse];
        const failedResponse = responses.find((response) => !response.ok);
        if (failedResponse) {
          throw new Error(await readApiError(failedResponse, "管理员数据加载失败。"));
        }

        const [statsBody, usersBody, jobsBody, assetsBody] = await Promise.all(responses.map((response) => response.json()));
        if (!isMounted) {
          return;
        }

        setStats(parseAdminStats(statsBody));
        setUsers(parseUsers(usersBody));
        setJobs(parseJobs(jobsBody));
        setAssets(parseAssets(assetsBody));
      } catch (loadError) {
        if (isMounted) {
          setError(loadError instanceof Error ? loadError.message : "管理员数据加载失败。");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadAdminData();

    return () => {
      isMounted = false;
    };
  }, []);

  const statCards = useMemo(
    () => [
      { label: "用户", value: stats.totalUsers ?? users.length, icon: <Users className="size-4" aria-hidden="true" /> },
      { label: "任务", value: stats.totalJobs ?? jobs.length, icon: <BarChart3 className="size-4" aria-hidden="true" /> },
      { label: "资产", value: stats.totalAssets ?? assets.length, icon: <ImageIcon className="size-4" aria-hidden="true" /> },
      { label: "空间", value: formatBytes(stats.storageBytes ?? sumAssetBytes(assets)), icon: <HardDrive className="size-4" aria-hidden="true" /> }
    ],
    [assets, jobs.length, stats.storageBytes, stats.totalAssets, stats.totalJobs, stats.totalUsers, users.length]
  );

  return (
    <main className="admin-page app-view">
      <section className="admin-shell" aria-labelledby="admin-title">
        <div className="settings-panel__header">
          <div>
            <p className="settings-eyebrow">Admin</p>
            <h1 id="admin-title">后台概览</h1>
          </div>
          {isLoading ? (
            <span className="loading-pill">
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              正在同步
            </span>
          ) : null}
        </div>

        {error ? (
          <div className="auth-alert" role="alert">
            <AlertTriangle className="size-4" aria-hidden="true" />
            <p>{error}</p>
          </div>
        ) : null}

        <div className="admin-stats">
          {statCards.map((card) => (
            <div className="admin-stat-card" key={card.label}>
              <span>{card.icon}</span>
              <p>{card.label}</p>
              <strong>{card.value}</strong>
            </div>
          ))}
        </div>

        <DataTable
          columns={["邮箱", "显示名", "角色", "额度", "创建时间"]}
          emptyLabel="暂无用户"
          rows={users.map((item) => [item.email, item.displayName, roleLabel(item.role), quotaLabel(item), formatDateTime(item.createdAt)])}
          title="用户"
        />
        <DataTable
          columns={["任务", "状态", "商品", "进度", "更新时间"]}
          emptyLabel="暂无任务"
          rows={jobs.map((item) => [item.id, item.status, item.productTitle, `${item.completedScenes}/${item.totalScenes}`, formatDateTime(item.updatedAt)])}
          title="作品 / 任务"
        />
        <DataTable
          columns={["资产", "文件", "大小", "所属用户", "创建时间"]}
          emptyLabel="暂无资产"
          rows={assets.map((item) => [item.id, item.fileName, formatBytes(item.sizeBytes), item.userEmail || item.userId, formatDateTime(item.createdAt)])}
          title="资产"
        />
      </section>
    </main>
  );
}

function InfoTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="info-tile">
      <span>{icon}</span>
      <p>{label}</p>
      <strong>{value}</strong>
    </div>
  );
}

function DataTable({ columns, emptyLabel, rows, title }: { columns: string[]; emptyLabel: string; rows: string[][]; title: string }) {
  return (
    <section className="admin-table-card" aria-labelledby={`${title}-table-title`}>
      <div className="admin-table-card__title">
        <Database className="size-4" aria-hidden="true" />
        <h2 id={`${title}-table-title`}>{title}</h2>
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length > 0 ? (
              rows.slice(0, 20).map((row, rowIndex) => (
                <tr key={`${title}-${rowIndex}`}>
                  {row.map((cell, cellIndex) => (
                    <td key={`${title}-${rowIndex}-${cellIndex}`}>{cell || "-"}</td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length}>{emptyLabel}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

interface AdminStats {
  totalUsers?: number;
  totalJobs?: number;
  totalAssets?: number;
  storageBytes?: number;
}

interface AdminUserRow {
  id: string;
  email: string;
  displayName: string;
  role: string;
  quotaTotal?: number;
  quotaUsed?: number;
  createdAt: string;
}

interface AdminJobRow {
  id: string;
  status: string;
  productTitle: string;
  totalScenes: number;
  completedScenes: number;
  updatedAt: string;
}

interface AdminAssetRow {
  id: string;
  fileName: string;
  sizeBytes: number;
  userId: string;
  userEmail: string;
  createdAt: string;
}

function parseAdminStats(value: unknown): AdminStats {
  const body = firstRecord(value, "stats") ?? {};
  return {
    totalUsers: numberFrom(body.totalUsers ?? body.users ?? body.userCount),
    totalJobs: numberFrom(body.totalJobs ?? body.jobs ?? body.jobCount),
    totalAssets: numberFrom(body.totalAssets ?? body.assets ?? body.assetCount),
    storageBytes: numberFrom(body.storageBytes ?? body.totalStorageBytes ?? body.usedBytes)
  };
}

function parseUsers(value: unknown): AdminUserRow[] {
  return arrayFrom(value, ["users", "items"]).map((item, index) => ({
    id: stringFrom(item.id) || stringFrom(item.userId) || `user-${index}`,
    email: stringFrom(item.email),
    displayName: stringFrom(item.displayName) || stringFrom(item.name),
    role: stringFrom(item.role) || "user",
    quotaTotal: numberFrom(item.quota_total ?? item.quotaTotal),
    quotaUsed: numberFrom(item.quota_used ?? item.quotaUsed),
    createdAt: stringFrom(item.createdAt) || stringFrom(item.created_at)
  }));
}

function parseJobs(value: unknown): AdminJobRow[] {
  return arrayFrom(value, ["jobs", "items"]).map((item, index) => ({
    id: stringFrom(item.jobId) || stringFrom(item.id) || `job-${index}`,
    status: stringFrom(item.status) || "-",
    productTitle: stringFrom(item.productTitle) || stringFrom(item.title) || "-",
    totalScenes: numberFrom(item.totalScenes) ?? 0,
    completedScenes: numberFrom(item.completedScenes) ?? 0,
    updatedAt: stringFrom(item.updatedAt) || stringFrom(item.updated_at)
  }));
}

function parseAssets(value: unknown): AdminAssetRow[] {
  return arrayFrom(value, ["assets", "items"]).map((item, index) => ({
    id: stringFrom(item.id) || stringFrom(item.assetId) || `asset-${index}`,
    fileName: stringFrom(item.fileName) || stringFrom(item.filename) || stringFrom(item.name),
    sizeBytes: numberFrom(item.sizeBytes ?? item.bytes ?? item.size) ?? 0,
    userId: stringFrom(item.userId) || stringFrom(item.ownerId),
    userEmail: stringFrom(item.userEmail) || stringFrom(item.email),
    createdAt: stringFrom(item.createdAt) || stringFrom(item.created_at)
  }));
}

function arrayFrom(value: unknown, keys: string[]): Record<string, unknown>[] {
  const source = Array.isArray(value)
    ? value
    : isRecord(value)
      ? keys.map((key) => value[key]).find(Array.isArray) ?? []
      : [];
  return source.filter(isRecord);
}

function firstRecord(value: unknown, key: string): Record<string, unknown> | undefined {
  if (isRecord(value) && isRecord(value[key])) {
    return value[key];
  }
  return isRecord(value) ? value : undefined;
}

function quotaLabel(user: Pick<AdminUserRow, "quotaTotal" | "quotaUsed">): string {
  const used = user.quotaUsed ?? 0;
  return user.quotaTotal ? `${used}/${user.quotaTotal}` : `${used}/未设置`;
}

function roleLabel(role: string): string {
  if (role === "admin" || role === "super_admin") {
    return "管理员";
  }
  return "成员";
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) {
    return "-";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
  return `${(value / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function sumAssetBytes(assets: AdminAssetRow[]): number {
  return assets.reduce((total, asset) => total + asset.sizeBytes, 0);
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
