import {
  BarChart3,
  CheckCircle2,
  Clock3,
  Download,
  ImageIcon,
  KeyRound,
  Loader2,
  LogOut,
  RefreshCw,
  Send,
  Settings,
  Sparkles,
  UserCircle2,
  Wand2
} from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  ECOMMERCE_MARKETS,
  ECOMMERCE_PLATFORMS,
  ECOMMERCE_SCENE_TEMPLATES,
  SIZE_PRESETS,
  composeEcommercePrompt,
  type EcommerceBatchGenerateResponse,
  type EcommerceGenerationMode,
  type EcommerceSceneTemplateId,
  type GenerationRecord,
  type ImageQuality,
  type OutputFormat,
  type StylePresetId
} from "@gpt-image-canvas/shared";
import type { AuthUser, BatchFormState, BatchTask, ExtensionAuthState, ExtensionSettings, PageContext } from "./types";

const ACTIVE_BATCH_JOB_STORAGE_KEY = "activeBatchJob";
const AUTH_STORAGE_KEY = "auth";

const defaultSettings: ExtensionSettings = {
  apiBaseUrl: "http://127.0.0.1:8787"
};

const defaultAuth: ExtensionAuthState = {
  token: "",
  user: null
};

interface StoredBatchJob {
  jobId: string;
  apiBaseUrl: string;
  token?: string;
}

type ToolTab = "account" | "history" | "stats" | "settings";
type AuthMode = "login" | "register";
type PendingAuthAction = "generate" | "history" | "stats" | "job";

interface EcommerceJobSummary {
  id: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string;
  totalScenes?: number;
  completedScenes?: number;
  progress?: number;
  records?: GenerationRecord[];
}

interface EcommerceStatsSummary {
  totalJobs: number;
  succeededJobs: number;
  failedJobs: number;
  runningJobs: number;
  generatedImages: number;
}

interface RemoteState<T> {
  data: T;
  error: string;
  loading: boolean;
}

const defaultForm: BatchFormState = {
  product: {
    title: "",
    description: "",
    bulletPoints: [],
    targetCustomer: "",
    usageScene: "",
    material: "",
    color: "",
    brandTone: "premium, trustworthy, marketplace-ready"
  },
  generationMode: "enhance",
  platform: "amazon",
  market: "us",
  sceneTemplateIds: ["marketplace-main", "logo-benefit", "feature-benefit"],
  size: { width: 1024, height: 1024 },
  stylePresetId: "product",
  quality: "auto",
  outputFormat: "png",
  countPerScene: 1,
  referenceImageUrl: "",
  extraDirection: ""
};

const defaultSceneIdsByMode: Record<EcommerceGenerationMode, EcommerceSceneTemplateId[]> = {
  enhance: ["marketplace-main", "logo-benefit", "feature-benefit"],
  creative: ["lifestyle", "model-wear", "accessory-match"]
};

const generationModes: Array<{ id: EcommerceGenerationMode; label: string; hint: string }> = [
  { id: "enhance", label: "原图增强", hint: "保留商品原貌，加 Logo、卖点文字和电商排版。" },
  { id: "creative", label: "场景创作", hint: "依据主图生成生活方式、模特穿戴和搭配场景。" }
];

const qualityOptions: Array<{ id: ImageQuality; label: string }> = [
  { id: "auto", label: "自动" },
  { id: "low", label: "快速草稿" },
  { id: "medium", label: "标准" },
  { id: "high", label: "高质量" }
];

const formatOptions: Array<{ id: OutputFormat; label: string }> = [
  { id: "png", label: "PNG" },
  { id: "jpeg", label: "JPEG" },
  { id: "webp", label: "WebP" }
];

const styleOptions: Array<{ id: StylePresetId; label: string }> = [
  { id: "product", label: "商业产品" },
  { id: "photoreal", label: "真实摄影" },
  { id: "poster", label: "海报视觉" },
  { id: "illustration", label: "精致插画" },
  { id: "none", label: "无风格" }
];

function createClientId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
    return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex
      .slice(8, 10)
      .join("")}-${hex.slice(10, 16).join("")}`;
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function referenceImageFromUrl(url: string): Promise<{ dataUrl: string; fileName?: string }> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("参考图读取失败，请换一张商品主图。");
  }

  const blob = await response.blob();
  if (!blob.type.startsWith("image/")) {
    throw new Error("参考图 URL 返回的不是图片。");
  }
  if (blob.size > 50 * 1024 * 1024) {
    throw new Error("参考图超过 50MB，请换一张较小的商品主图。");
  }

  return {
    dataUrl: await blobToDataUrl(blob),
    fileName: fileNameFromUrl(url)
  };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("参考图转换失败。"));
    reader.readAsDataURL(blob);
  });
}

function fileNameFromUrl(url: string): string | undefined {
  try {
    const pathname = new URL(url).pathname;
    const name = pathname.split("/").filter(Boolean).at(-1);
    return name || undefined;
  } catch {
    return undefined;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function firstString(source: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return undefined;
}

function firstNumber(source: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }
  return undefined;
}

function normalizeJobsResponse(payload: unknown): EcommerceJobSummary[] {
  const root = asRecord(payload);
  const items = Array.isArray(payload)
    ? payload
    : Array.isArray(root.jobs)
      ? root.jobs
      : Array.isArray(root.items)
        ? root.items
        : Array.isArray(root.data)
          ? root.data
          : [];

  return items.map((item) => {
    const source = asRecord(item);
    const records = Array.isArray(source.records) ? (source.records as GenerationRecord[]) : undefined;
    const totalScenes = firstNumber(source, ["totalScenes", "total", "sceneCount"]);
    const completedScenes = firstNumber(source, ["completedScenes", "completed", "finishedScenes"]);
    const progress = firstNumber(source, ["progress", "percent"]);
    return {
      id: firstString(source, ["id", "jobId"]) ?? createClientId(),
      status: firstString(source, ["status"]) ?? "unknown",
      createdAt: firstString(source, ["createdAt", "created_at"]),
      updatedAt: firstString(source, ["updatedAt", "updated_at"]),
      completedAt: firstString(source, ["completedAt", "completed_at"]),
      totalScenes,
      completedScenes,
      progress,
      records
    };
  });
}

function normalizeStatsResponse(payload: unknown): EcommerceStatsSummary {
  const root = asRecord(payload);
  const source = asRecord(root.stats ?? root.data ?? payload);
  return {
    totalJobs: firstNumber(source, ["totalJobs", "jobs", "total"]) ?? 0,
    succeededJobs: firstNumber(source, ["succeededJobs", "successJobs", "succeeded", "success"]) ?? 0,
    failedJobs: firstNumber(source, ["failedJobs", "failJobs", "failed", "failures"]) ?? 0,
    runningJobs: firstNumber(source, ["runningJobs", "pendingJobs", "running", "pending"]) ?? 0,
    generatedImages: firstNumber(source, ["generatedImages", "imageCount", "images", "outputs"]) ?? 0
  };
}

function normalizeUser(value: unknown): AuthUser | null {
  const root = asRecord(value);
  const source = asRecord(root.user ?? root.data ?? root.profile ?? value);
  const email = firstString(source, ["email", "mail", "username"]);
  if (!email) {
    return null;
  }

  return {
    id: firstString(source, ["id", "userId", "sub"]),
    email,
    displayName: firstString(source, ["displayName", "display_name", "name", "nickname"]),
    role: firstString(source, ["role", "plan"]),
    quotaTotal: firstNumber(source, ["quotaTotal", "quota_total", "totalQuota"]),
    quotaUsed: firstNumber(source, ["quotaUsed", "quota_used", "usedQuota"])
  };
}

function normalizeAuthResponse(payload: unknown): ExtensionAuthState {
  const root = asRecord(payload);
  const data = asRecord(root.data);
  const token =
    firstString(root, ["token", "accessToken", "access_token", "jwt"]) ??
    firstString(data, ["token", "accessToken", "access_token", "jwt"]) ??
    "";

  return {
    token,
    user: normalizeUser(root) ?? normalizeUser(data)
  };
}

function formatDateTime(value?: string): string {
  if (!value) {
    return "未知时间";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function SidePanelApp() {
  const [settings, setSettings] = useState<ExtensionSettings>(defaultSettings);
  const [auth, setAuth] = useState<ExtensionAuthState>(defaultAuth);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authForm, setAuthForm] = useState({ email: "", password: "", displayName: "" });
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [pendingAuthAction, setPendingAuthAction] = useState<PendingAuthAction | null>(null);
  const [form, setForm] = useState<BatchFormState>(defaultForm);
  const [pageContext, setPageContext] = useState<PageContext | null>(null);
  const [task, setTask] = useState<BatchTask>({
    id: "idle",
    status: "idle",
    message: "选择场景后即可批量生成。",
    records: []
  });
  const [activeTool, setActiveTool] = useState<ToolTab>("account");
  const [toolPanelOpen, setToolPanelOpen] = useState(false);
  const [historyState, setHistoryState] = useState<RemoteState<EcommerceJobSummary[]>>({
    data: [],
    error: "",
    loading: false
  });
  const [statsState, setStatsState] = useState<RemoteState<EcommerceStatsSummary>>({
    data: {
      totalJobs: 0,
      succeededJobs: 0,
      failedJobs: 0,
      runningJobs: 0,
      generatedImages: 0
    },
    error: "",
    loading: false
  });

  const availableScenes = useMemo(
    () => ECOMMERCE_SCENE_TEMPLATES.filter((template) => template.mode === form.generationMode),
    [form.generationMode]
  );

  const selectedScenes = useMemo(
    () => availableScenes.filter((template) => form.sceneTemplateIds.includes(template.id)),
    [availableScenes, form.sceneTemplateIds]
  );

  const previewPrompt = useMemo(() => {
    const firstScene = form.sceneTemplateIds[0];
    if (!firstScene || !form.product.title.trim()) {
      return "";
    }

    return composeEcommercePrompt({
      product: form.product,
      platform: form.platform,
      market: form.market,
      sceneTemplateId: firstScene,
      extraDirection: form.extraDirection
    });
  }, [form]);

  useEffect(() => {
    void chrome.storage.local.get(["settings", AUTH_STORAGE_KEY, ACTIVE_BATCH_JOB_STORAGE_KEY]).then((result) => {
      const nextSettings = {
        ...defaultSettings,
        ...(result.settings as Partial<ExtensionSettings> | undefined)
      };
      const storedAuth = result[AUTH_STORAGE_KEY] as Partial<ExtensionAuthState> | undefined;
      const activeJob = result[ACTIVE_BATCH_JOB_STORAGE_KEY] as StoredBatchJob | undefined;
      const nextAuth = {
        token: storedAuth?.token || activeJob?.token || "",
        user: storedAuth?.user ?? null
      };
      setSettings({ apiBaseUrl: activeJob?.apiBaseUrl ?? nextSettings.apiBaseUrl });
      setAuth(nextAuth);
      if (nextAuth.token && !nextAuth.user) {
        void refreshMe(nextAuth.token, activeJob?.apiBaseUrl ?? nextSettings.apiBaseUrl);
      }
      if (activeJob?.jobId) {
        setTask({
          id: activeJob.jobId,
          status: "running",
          message: "正在恢复服务端批量任务，稍后会自动刷新进度。",
          records: []
        });
      }
    });
    void refreshPageContext();
  }, []);

  useEffect(() => {
    if (task.status !== "pending" && task.status !== "running") {
      return;
    }
    if (!auth.token) {
      setPendingAuthAction("job");
      setActiveTool("account");
      setToolPanelOpen(true);
      setAuthError("请登录后继续查看服务端任务进度。");
      return;
    }

    let cancelled = false;
    const timer = window.setInterval(() => {
      void pollBatchJob(task.id).catch((error) => {
        if (!cancelled) {
          setTask((current) => ({
            ...current,
            message: error instanceof Error ? `任务仍在服务端执行，轮询失败：${error.message}` : "任务仍在服务端执行，轮询暂时失败。"
          }));
        }
      });
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [auth.token, settings.apiBaseUrl, task.id, task.status]);

  useEffect(() => {
    if (!toolPanelOpen) {
      return;
    }
    if (activeTool === "history") {
      void refreshHistory();
    }
    if (activeTool === "stats") {
      void refreshStats();
    }
  }, [activeTool, auth.token, toolPanelOpen, settings.apiBaseUrl]);

  function apiBaseUrl(): string {
    return settings.apiBaseUrl.replace(/\/$/u, "");
  }

  function apiHeaders(json = false, token = auth.token): HeadersInit {
    const headers: Record<string, string> = {};
    if (json) {
      headers["Content-Type"] = "application/json";
    }
    if (token.trim()) {
      headers.Authorization = `Bearer ${token.trim()}`;
    }
    return headers;
  }

  async function saveSettings(nextSettings: ExtensionSettings): Promise<void> {
    setSettings(nextSettings);
    await chrome.storage.local.set({ settings: nextSettings });
  }

  async function saveAuth(nextAuth: ExtensionAuthState): Promise<void> {
    setAuth(nextAuth);
    await chrome.storage.local.set({ [AUTH_STORAGE_KEY]: nextAuth });
  }

  async function clearAuth(message = "登录状态已失效，请重新登录。"): Promise<void> {
    await chrome.storage.local.remove([AUTH_STORAGE_KEY, ACTIVE_BATCH_JOB_STORAGE_KEY]);
    setAuth(defaultAuth);
    setActiveTool("account");
    setToolPanelOpen(true);
    setAuthError(message);
  }

  function requireAuth(action: PendingAuthAction): boolean {
    if (auth.token.trim()) {
      return true;
    }
    setPendingAuthAction(action);
    setActiveTool("account");
    setToolPanelOpen(true);
    setAuthMode("login");
    setAuthError("请先登录账号，插件会使用你的个人 JWT 访问后端。");
    return false;
  }

  async function parseResponseOrThrow(response: Response): Promise<unknown> {
    if (response.status === 401) {
      await clearAuth("登录已过期，请重新登录。");
      throw new Error("登录已过期，请重新登录。");
    }
    if (!response.ok) {
      throw new Error(await response.text());
    }
    return response.json();
  }

  async function refreshMe(token = auth.token, baseUrl = apiBaseUrl()): Promise<AuthUser | null> {
    if (!token.trim()) {
      return null;
    }
    const response = await fetch(`${baseUrl.replace(/\/$/u, "")}/api/auth/me`, {
      headers: {
        Authorization: `Bearer ${token.trim()}`
      }
    });
    const body = await parseResponseOrThrow(response);
    const user = normalizeUser(body);
    if (user) {
      const nextAuth = { token, user };
      setAuth(nextAuth);
      await chrome.storage.local.set({ [AUTH_STORAGE_KEY]: nextAuth });
    }
    return user;
  }

  async function submitAuth(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setAuthError("");
    setAuthLoading(true);
    try {
      const response = await fetch(`${apiBaseUrl()}/api/auth/${authMode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: authForm.email.trim(),
          password: authForm.password,
          displayName: authMode === "register" ? authForm.displayName.trim() || undefined : undefined
        })
      });
      const body = await parseResponseOrThrow(response);
      const nextAuth = normalizeAuthResponse(body);
      if (!nextAuth.token) {
        throw new Error("登录响应缺少 token。");
      }
      const user = nextAuth.user ?? (await refreshMe(nextAuth.token));
      await saveAuth({ token: nextAuth.token, user });
      setAuthForm((current) => ({ ...current, password: "" }));
      setAuthError("");
      const action = pendingAuthAction;
      setPendingAuthAction(null);
      if (action === "generate") {
        void submitBatch(true, nextAuth.token);
      } else if (action === "history") {
        setActiveTool("history");
        void refreshHistory(true, nextAuth.token);
      } else if (action === "stats") {
        setActiveTool("stats");
        void refreshStats(true, nextAuth.token);
      } else if (action === "job" && task.id !== "idle") {
        void pollBatchJob(task.id, nextAuth.token);
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "登录失败，请稍后重试。");
    } finally {
      setAuthLoading(false);
    }
  }

  async function pollBatchJob(jobId: string, token = auth.token): Promise<void> {
    if (!token.trim() && !requireAuth("job")) {
      return;
    }
    const response = await fetch(`${apiBaseUrl()}/api/ecommerce/images/batch-generate/${jobId}`, {
      headers: apiHeaders(false, token)
    });

    const body = (await parseResponseOrThrow(response)) as EcommerceBatchGenerateResponse;
    applyBatchJob(body, token);
  }

  async function refreshHistory(authAlreadyChecked = false, token = auth.token): Promise<void> {
    if (!token.trim() && !authAlreadyChecked && !requireAuth("history")) {
      return;
    }
    setHistoryState((current) => ({ ...current, error: "", loading: true }));
    try {
      const response = await fetch(`${apiBaseUrl()}/api/ecommerce/jobs`, {
        headers: apiHeaders(false, token)
      });
      const body = await parseResponseOrThrow(response);
      setHistoryState({ data: normalizeJobsResponse(body), error: "", loading: false });
    } catch (error) {
      setHistoryState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : "历史任务读取失败。",
        loading: false
      }));
    }
  }

  async function refreshStats(authAlreadyChecked = false, token = auth.token): Promise<void> {
    if (!token.trim() && !authAlreadyChecked && !requireAuth("stats")) {
      return;
    }
    setStatsState((current) => ({ ...current, error: "", loading: true }));
    try {
      const response = await fetch(`${apiBaseUrl()}/api/ecommerce/stats`, {
        headers: apiHeaders(false, token)
      });
      const body = await parseResponseOrThrow(response);
      setStatsState({ data: normalizeStatsResponse(body), error: "", loading: false });
    } catch (error) {
      setStatsState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : "统计数据读取失败。",
        loading: false
      }));
    }
  }

  function openTool(tab: ToolTab): void {
    if ((tab === "history" || tab === "stats") && !auth.token.trim()) {
      setPendingAuthAction(tab);
      setAuthMode("login");
      setAuthError("请先登录账号，再查看个人数据。");
      setActiveTool("account");
      setToolPanelOpen(true);
      return;
    }
    setActiveTool(tab);
    setToolPanelOpen(true);
  }

  function openHistoryJob(job: EcommerceJobSummary): void {
    if (!requireAuth("job")) {
      return;
    }
    setTask({
      id: job.id,
      status: job.status as BatchTask["status"],
      message: job.status === "pending" || job.status === "running" ? "已切换到历史任务，正在继续轮询服务端状态。" : "已打开历史任务。",
      records: job.records ?? [],
      totalScenes: job.totalScenes,
      completedScenes: job.completedScenes
    });
    void chrome.storage.local.set({
      [ACTIVE_BATCH_JOB_STORAGE_KEY]: {
        jobId: job.id,
        apiBaseUrl: settings.apiBaseUrl,
        token: auth.token
      } satisfies StoredBatchJob
    });
    void pollBatchJob(job.id);
  }

  function applyBatchJob(body: EcommerceBatchGenerateResponse, token = auth.token): void {
    setTask({
      id: body.jobId,
      status: body.status,
      message:
        body.status === "pending" || body.status === "running"
          ? `${body.message} 可以放心离开，稍后回来会继续查看任务状态。`
          : body.message,
      records: body.records,
      totalScenes: body.totalScenes,
      completedScenes: body.completedScenes
    });

    if (body.status === "pending" || body.status === "running") {
      void chrome.storage.local.set({
        [ACTIVE_BATCH_JOB_STORAGE_KEY]: {
          jobId: body.jobId,
          apiBaseUrl: settings.apiBaseUrl,
          token
        } satisfies StoredBatchJob
      });
    } else {
      void chrome.storage.local.remove(ACTIVE_BATCH_JOB_STORAGE_KEY);
      if (toolPanelOpen) {
        void refreshHistory();
        void refreshStats();
      }
    }
  }

  async function refreshPageContext(): Promise<void> {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.id) {
      return;
    }

    try {
      const context = (await chrome.tabs.sendMessage(tab.id, { type: "kuajing-image:get-page-context" })) as PageContext;
      setPageContext(context);
      setForm((current) => ({
        ...current,
        product: {
          ...current.product,
          title: current.product.title || context.title,
          description: current.product.description || context.description
        },
        referenceImageUrl: current.referenceImageUrl || context.imageUrls[0] || ""
      }));
    } catch {
      setTask((current) => ({
        ...current,
        message: "当前页面暂时无法读取商品信息，可手动填写。"
      }));
    }
  }

  function updateProduct(patch: Partial<BatchFormState["product"]>): void {
    setForm((current) => ({
      ...current,
      product: {
        ...current.product,
        ...patch
      }
    }));
  }

  function toggleScene(sceneId: EcommerceSceneTemplateId): void {
    setForm((current) => {
      const exists = current.sceneTemplateIds.includes(sceneId);
      const next = exists
        ? current.sceneTemplateIds.filter((id) => id !== sceneId)
        : [...current.sceneTemplateIds, sceneId];
      return {
        ...current,
        sceneTemplateIds: next.length > 0 ? next : current.sceneTemplateIds
      };
    });
  }

  function updateGenerationMode(generationMode: EcommerceGenerationMode): void {
    setForm((current) => ({
      ...current,
      generationMode,
      sceneTemplateIds: defaultSceneIdsByMode[generationMode],
      stylePresetId: generationMode === "enhance" ? "product" : "photoreal"
    }));
    setTask((current) => ({
      ...current,
      message: generationMode === "enhance" ? "原图增强会优先保留商品原貌。" : "场景创作会依据主图重建营销场景。"
    }));
  }

  async function submitBatch(authAlreadyChecked = false, token = auth.token): Promise<void> {
    if (!token.trim() && !authAlreadyChecked && !requireAuth("generate")) {
      return;
    }
    const title = form.product.title.trim();
    if (!title) {
      setTask({ id: "validation", status: "failed", message: "请先填写商品标题。", records: [] });
      return;
    }
    if (form.generationMode === "enhance" && !form.referenceImageUrl.trim()) {
      setTask({ id: "validation", status: "failed", message: "原图增强需要参考图 URL，请先读取商品页或手动填写主图地址。", records: [] });
      return;
    }

    const taskId = createClientId();
    setTask({
      id: taskId,
      status: "running",
      message: form.referenceImageUrl.trim() ? "正在读取参考图并提交批量生成任务。" : "正在提交批量生成任务。",
      records: []
    });

    const fallbackRecords = selectedScenes.map((scene): GenerationRecord => ({
      id: `${taskId}-${scene.id}`,
      mode: form.referenceImageUrl ? "edit" : "generate",
      prompt: composeEcommercePrompt({
        product: form.product,
        platform: form.platform,
        market: form.market,
        sceneTemplateId: scene.id,
        extraDirection: form.extraDirection
      }),
      effectivePrompt: scene.prompt,
      presetId: form.stylePresetId,
      size: form.size,
      quality: form.quality,
      outputFormat: form.outputFormat,
      count: form.countPerScene,
      status: "pending",
      createdAt: new Date().toISOString(),
      outputs: []
    }));

    try {
      const referenceImage = form.referenceImageUrl.trim()
        ? await referenceImageFromUrl(form.referenceImageUrl.trim())
        : undefined;
      const response = await fetch(`${apiBaseUrl()}/api/ecommerce/images/batch-generate`, {
        method: "POST",
        headers: apiHeaders(true, token),
        body: JSON.stringify({
          product: form.product,
          platform: form.platform,
          market: form.market,
          sceneTemplateIds: form.sceneTemplateIds,
          size: form.size,
          stylePresetId: form.stylePresetId,
          quality: form.quality,
          outputFormat: form.outputFormat,
          countPerScene: form.countPerScene,
          referenceImage,
          extraDirection: form.extraDirection
        })
      });

      const body = (await parseResponseOrThrow(response)) as EcommerceBatchGenerateResponse;
      applyBatchJob(body, token);
    } catch (error) {
      setTask({
        id: taskId,
        status: "failed",
        message: error instanceof Error ? `${error.message} 已在本地生成场景 prompt 草稿。` : "后端批量接口暂不可用，已在本地生成场景 prompt 草稿。",
        records: fallbackRecords
      });
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Cross-border image studio</p>
          <h1>跨境图片助手</h1>
        </div>
        <button className="icon-button" title="账户" type="button" onClick={() => openTool("account")}>
          <UserCircle2 size={18} />
        </button>
      </header>

      <section className="panel page-panel">
        <div>
          <h2>当前页面</h2>
          <p>{pageContext?.url ?? "可从商品页自动读取标题、描述和图片。"}</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => void refreshPageContext()}>
          <RefreshCw size={15} />
          读取
        </button>
      </section>

      <section className="panel">
        <h2>商品信息</h2>
        <label>
          <span>商品标题</span>
          <input value={form.product.title} onChange={(event) => updateProduct({ title: event.target.value })} />
        </label>
        <label>
          <span>商品描述</span>
          <textarea rows={4} value={form.product.description ?? ""} onChange={(event) => updateProduct({ description: event.target.value })} />
        </label>
        <div className="two-col">
          <label>
            <span>目标人群</span>
            <input value={form.product.targetCustomer ?? ""} onChange={(event) => updateProduct({ targetCustomer: event.target.value })} />
          </label>
          <label>
            <span>使用场景</span>
            <input value={form.product.usageScene ?? ""} onChange={(event) => updateProduct({ usageScene: event.target.value })} />
          </label>
        </div>
      </section>

      <section className="panel">
        <h2>平台与市场</h2>
        <div className="two-col">
          <label>
            <span>平台</span>
            <select value={form.platform} onChange={(event) => setForm({ ...form, platform: event.target.value as BatchFormState["platform"] })}>
              {ECOMMERCE_PLATFORMS.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>市场</span>
            <select value={form.market} onChange={(event) => setForm({ ...form, market: event.target.value as BatchFormState["market"] })}>
              {ECOMMERCE_MARKETS.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="panel">
        <h2>生成方式</h2>
        <div className="mode-grid">
          {generationModes.map((mode) => (
            <button
              className={form.generationMode === mode.id ? "mode-button active" : "mode-button"}
              key={mode.id}
              type="button"
              onClick={() => updateGenerationMode(mode.id)}
            >
              <strong>{mode.label}</strong>
              <span>{mode.hint}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>生成场景</h2>
        <div className="scene-grid">
          {availableScenes.map((scene) => (
            <button
              className={form.sceneTemplateIds.includes(scene.id) ? "scene-button active" : "scene-button"}
              key={scene.id}
              type="button"
              onClick={() => toggleScene(scene.id)}
            >
              <Wand2 size={15} />
              {scene.label}
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>输出设置</h2>
        <div className="two-col">
          <label>
            <span>尺寸</span>
            <select
              value={`${form.size.width}x${form.size.height}`}
              onChange={(event) => {
                const [width, height] = event.target.value.split("x").map((value) => Number.parseInt(value, 10));
                setForm({ ...form, size: { width, height } });
              }}
            >
              {SIZE_PRESETS.slice(0, 6).map((preset) => (
                <option key={preset.id} value={`${preset.width}x${preset.height}`}>{preset.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>每场景数量</span>
            <select value={form.countPerScene} onChange={(event) => setForm({ ...form, countPerScene: Number(event.target.value) as 1 | 2 | 4 })}>
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={4}>4</option>
            </select>
          </label>
          <label>
            <span>风格</span>
            <select value={form.stylePresetId} onChange={(event) => setForm({ ...form, stylePresetId: event.target.value as StylePresetId })}>
              {styleOptions.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>格式</span>
            <select value={form.outputFormat} onChange={(event) => setForm({ ...form, outputFormat: event.target.value as OutputFormat })}>
              {formatOptions.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>质量</span>
            <select value={form.quality} onChange={(event) => setForm({ ...form, quality: event.target.value as ImageQuality })}>
              {qualityOptions.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>{form.generationMode === "enhance" ? "商品主图 URL（必填）" : "商品主图 URL"}</span>
            <input value={form.referenceImageUrl} onChange={(event) => setForm({ ...form, referenceImageUrl: event.target.value })} />
          </label>
        </div>
        <label>
          <span>补充方向</span>
          <textarea rows={3} value={form.extraDirection} onChange={(event) => setForm({ ...form, extraDirection: event.target.value })} />
        </label>
      </section>

      {previewPrompt ? (
        <section className="panel prompt-preview">
          <h2>Prompt 预览</h2>
          <p>{previewPrompt}</p>
        </section>
      ) : null}

      <section className="sticky-actions">
        <div>
          <strong>{selectedScenes.length * form.countPerScene}</strong>
          <span>
            {task.status === "pending" || task.status === "running"
              ? `${task.completedScenes ?? 0}/${task.totalScenes ?? selectedScenes.length} 场景`
              : "张图像"}
          </span>
        </div>
        <button className="primary-button" disabled={task.status === "pending" || task.status === "running"} type="button" onClick={() => void submitBatch()}>
          {task.status === "running" ? <Loader2 className="spin" size={17} /> : <Send size={17} />}
          批量生成
        </button>
      </section>

      <section className="panel results-panel">
        <div className={`status status-${task.status}`}>
          {task.status === "succeeded" ? <CheckCircle2 size={16} /> : task.status === "running" ? <Loader2 className="spin" size={16} /> : <Sparkles size={16} />}
          {task.message}
        </div>
        {task.records.map((record) => (
          <article className="result-card" key={record.id}>
            <div>
              <p>{record.prompt}</p>
              <span>{record.size.width} x {record.size.height} · {record.outputFormat}</span>
            </div>
            {record.outputs.flatMap((output) => output.asset ? [output.asset] : []).map((asset) => (
              <a className="asset-link" href={`${apiBaseUrl()}${asset.url}`} key={asset.id} target="_blank" rel="noreferrer">
                <ImageIcon size={14} />
                预览
                <Download size={14} />
              </a>
            ))}
          </article>
        ))}
      </section>

      <section className="tool-dock" aria-label="扩展工具">
        <div className="tool-tabs">
          <button className={activeTool === "account" && toolPanelOpen ? "tool-tab active" : "tool-tab"} type="button" onClick={() => openTool("account")}>
            <UserCircle2 size={15} />
            账户
          </button>
          <button className={activeTool === "history" && toolPanelOpen ? "tool-tab active" : "tool-tab"} type="button" onClick={() => openTool("history")}>
            <Clock3 size={15} />
            历史
          </button>
          <button className={activeTool === "stats" && toolPanelOpen ? "tool-tab active" : "tool-tab"} type="button" onClick={() => openTool("stats")}>
            <BarChart3 size={15} />
            统计
          </button>
          <button className={activeTool === "settings" && toolPanelOpen ? "tool-tab active" : "tool-tab"} type="button" onClick={() => openTool("settings")}>
            <KeyRound size={15} />
            设置
          </button>
        </div>

        {toolPanelOpen ? (
          <div className="tool-panel">
            <div className="tool-panel-header">
              <strong>{activeTool === "account" ? "账户" : activeTool === "history" ? "历史任务" : activeTool === "stats" ? "统计概览" : "设置"}</strong>
              <button className="tool-close" type="button" onClick={() => setToolPanelOpen(false)}>收起</button>
            </div>

            {activeTool === "account" ? (
              <div>
                {auth.token ? (
                  <div className="account-card">
                    <div className="account-heading">
                      <div>
                        <strong>{auth.user?.displayName || auth.user?.email || "已登录"}</strong>
                        <span>{auth.user?.email || "正在同步账户信息"}</span>
                      </div>
                      <button
                        className="mini-button"
                        type="button"
                        onClick={() => {
                          void clearAuth("已退出登录。");
                          setAuthError("");
                        }}
                      >
                        <LogOut size={13} />
                        退出
                      </button>
                    </div>
                    <div className="account-meta">
                      <div><span>角色</span><strong>{auth.user?.role || "user"}</strong></div>
                      <div><span>Quota</span><strong>{auth.user?.quotaUsed ?? 0}/{auth.user?.quotaTotal ?? 0}</strong></div>
                    </div>
                    <button className="mini-button" type="button" onClick={() => void refreshMe()}>
                      <RefreshCw size={13} />
                      刷新账户
                    </button>
                  </div>
                ) : (
                  <form className="auth-form" onSubmit={(event) => void submitAuth(event)}>
                    <div className="auth-switch">
                      <button className={authMode === "login" ? "active" : ""} type="button" onClick={() => setAuthMode("login")}>登录</button>
                      <button className={authMode === "register" ? "active" : ""} type="button" onClick={() => setAuthMode("register")}>注册</button>
                    </div>
                    <label>
                      <span>邮箱</span>
                      <input autoComplete="email" type="email" value={authForm.email} onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })} required />
                    </label>
                    {authMode === "register" ? (
                      <label>
                        <span>显示名</span>
                        <input autoComplete="name" value={authForm.displayName} onChange={(event) => setAuthForm({ ...authForm, displayName: event.target.value })} />
                      </label>
                    ) : null}
                    <label>
                      <span>密码</span>
                      <input autoComplete={authMode === "login" ? "current-password" : "new-password"} type="password" value={authForm.password} onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })} required />
                    </label>
                    {authError ? <p className="tool-error">{authError}</p> : null}
                    <button className="primary-button auth-submit" disabled={authLoading} type="submit">
                      {authLoading ? <Loader2 className="spin" size={15} /> : <KeyRound size={15} />}
                      {authMode === "login" ? "登录" : "注册并登录"}
                    </button>
                  </form>
                )}
                {!auth.token ? <p className="settings-note">登录后会把个人 JWT 保存在本地，并自动附加到后端请求。</p> : null}
              </div>
            ) : null}

            {activeTool === "history" ? (
              <div>
                <div className="tool-actions">
                  <span>当前账号的批量任务</span>
                  <button className="mini-button" disabled={historyState.loading} type="button" onClick={() => void refreshHistory()}>
                    {historyState.loading ? <Loader2 className="spin" size={13} /> : <RefreshCw size={13} />}
                    刷新
                  </button>
                </div>
                {historyState.error ? <p className="tool-error">{historyState.error}</p> : null}
                {historyState.loading && historyState.data.length === 0 ? <p className="tool-empty">正在读取历史任务...</p> : null}
                {!historyState.loading && !historyState.error && historyState.data.length === 0 ? <p className="tool-empty">暂无历史任务。</p> : null}
                {historyState.data.map((job) => {
                  const completed = job.completedScenes ?? 0;
                  const total = job.totalScenes ?? job.records?.length ?? 0;
                  const progress = job.progress ?? (total > 0 ? Math.round((completed / total) * 100) : undefined);
                  const assets = job.records?.flatMap((record) => record.outputs.flatMap((output) => output.asset ? [output.asset] : [])) ?? [];
                  return (
                    <article className="history-card" key={job.id}>
                      <div className="history-card-top">
                        <strong>{job.status}</strong>
                        <span>{formatDateTime(job.createdAt)}</span>
                      </div>
                      <div className="progress-row">
                        <span>{total > 0 ? `${completed}/${total}` : "进度待返回"}</span>
                        <div className="progress-track">
                          <div className="progress-fill" style={{ width: `${Math.min(progress ?? 0, 100)}%` }} />
                        </div>
                      </div>
                      <p>{job.id}</p>
                      <button className="mini-button history-open" type="button" onClick={() => openHistoryJob(job)}>
                        <RefreshCw size={13} />
                        打开/刷新
                      </button>
                      {assets.length > 0 ? (
                        <div className="asset-list">
                          {assets.slice(0, 6).map((asset) => (
                            <a href={`${apiBaseUrl()}${asset.url}`} key={asset.id} target="_blank" rel="noreferrer">
                              图片
                            </a>
                          ))}
                        </div>
                      ) : (
                        <span className="muted-line">暂无图片链接</span>
                      )}
                    </article>
                  );
                })}
              </div>
            ) : null}

            {activeTool === "stats" ? (
              <div>
                <div className="tool-actions">
                  <span>生成表现与任务量</span>
                  <button className="mini-button" disabled={statsState.loading} type="button" onClick={() => void refreshStats()}>
                    {statsState.loading ? <Loader2 className="spin" size={13} /> : <RefreshCw size={13} />}
                    刷新
                  </button>
                </div>
                {statsState.error ? <p className="tool-error">{statsState.error}</p> : null}
                {statsState.loading ? <p className="tool-empty">正在读取统计数据...</p> : null}
                <div className="stats-grid">
                  <div><span>总任务</span><strong>{statsState.data.totalJobs}</strong></div>
                  <div><span>成功</span><strong>{statsState.data.succeededJobs}</strong></div>
                  <div><span>失败</span><strong>{statsState.data.failedJobs}</strong></div>
                  <div><span>进行中</span><strong>{statsState.data.runningJobs}</strong></div>
                  <div className="wide-stat"><span>生成图片</span><strong>{statsState.data.generatedImages}</strong></div>
                </div>
              </div>
            ) : null}

            {activeTool === "settings" ? (
              <div>
                <label>
                  <span>后端 API</span>
                  <input value={settings.apiBaseUrl} onChange={(event) => void saveSettings({ apiBaseUrl: event.target.value })} />
                </label>
                <p className="settings-note">登录后插件会使用当前账号访问后端，历史任务和统计按账号隔离。</p>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
    </main>
  );
}
