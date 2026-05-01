import {
  CheckCircle2,
  Download,
  ImageIcon,
  Loader2,
  RefreshCw,
  Send,
  Settings,
  Sparkles,
  Wand2
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  ECOMMERCE_MARKETS,
  ECOMMERCE_PLATFORMS,
  ECOMMERCE_SCENE_TEMPLATES,
  SIZE_PRESETS,
  composeEcommercePrompt,
  type EcommerceBatchGenerateResponse,
  type EcommerceSceneTemplateId,
  type GenerationRecord,
  type ImageQuality,
  type OutputFormat,
  type StylePresetId
} from "@gpt-image-canvas/shared";
import type { BatchFormState, BatchTask, ExtensionSettings, PageContext } from "./types";

const defaultSettings: ExtensionSettings = {
  apiBaseUrl: "http://127.0.0.1:8787",
  userId: "demo-user",
  workspaceId: "demo-workspace"
};

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
  platform: "amazon",
  market: "us",
  sceneTemplateIds: ["marketplace-main", "lifestyle", "feature-benefit"],
  size: { width: 1024, height: 1024 },
  stylePresetId: "product",
  quality: "auto",
  outputFormat: "png",
  countPerScene: 1,
  referenceImageUrl: "",
  extraDirection: ""
};

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

export function SidePanelApp() {
  const [settings, setSettings] = useState<ExtensionSettings>(defaultSettings);
  const [form, setForm] = useState<BatchFormState>(defaultForm);
  const [pageContext, setPageContext] = useState<PageContext | null>(null);
  const [task, setTask] = useState<BatchTask>({
    id: "idle",
    status: "idle",
    message: "选择场景后即可批量生成。",
    records: []
  });
  const [settingsOpen, setSettingsOpen] = useState(false);

  const selectedScenes = useMemo(
    () => ECOMMERCE_SCENE_TEMPLATES.filter((template) => form.sceneTemplateIds.includes(template.id)),
    [form.sceneTemplateIds]
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
    void chrome.storage.local.get(["settings"]).then((result) => {
      setSettings({
        ...defaultSettings,
        ...(result.settings as Partial<ExtensionSettings> | undefined)
      });
    });
    void refreshPageContext();
  }, []);

  async function saveSettings(nextSettings: ExtensionSettings): Promise<void> {
    setSettings(nextSettings);
    await chrome.storage.local.set({ settings: nextSettings });
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

  async function submitBatch(): Promise<void> {
    const title = form.product.title.trim();
    if (!title) {
      setTask({ id: "validation", status: "failed", message: "请先填写商品标题。", records: [] });
      return;
    }

    const taskId = crypto.randomUUID();
    setTask({ id: taskId, status: "running", message: "正在提交批量生成任务。", records: [] });

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
      const response = await fetch(`${settings.apiBaseUrl.replace(/\/$/u, "")}/api/ecommerce/images/batch-generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": settings.userId,
          "X-Workspace-Id": settings.workspaceId
        },
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
          extraDirection: form.extraDirection
        })
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const body = (await response.json()) as EcommerceBatchGenerateResponse;
      setTask({
        id: body.jobId,
        status: "succeeded",
        message: `已完成 ${body.records.length} 个场景。`,
        records: body.records
      });
    } catch {
      setTask({
        id: taskId,
        status: "failed",
        message: "后端批量接口暂不可用，已在本地生成场景 prompt 草稿。",
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
        <button className="icon-button" title="接口设置" type="button" onClick={() => setSettingsOpen((open) => !open)}>
          <Settings size={18} />
        </button>
      </header>

      {settingsOpen ? (
        <section className="panel">
          <label>
            <span>后端 API</span>
            <input value={settings.apiBaseUrl} onChange={(event) => void saveSettings({ ...settings, apiBaseUrl: event.target.value })} />
          </label>
          <div className="two-col">
            <label>
              <span>User</span>
              <input value={settings.userId} onChange={(event) => void saveSettings({ ...settings, userId: event.target.value })} />
            </label>
            <label>
              <span>Workspace</span>
              <input value={settings.workspaceId} onChange={(event) => void saveSettings({ ...settings, workspaceId: event.target.value })} />
            </label>
          </div>
        </section>
      ) : null}

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
        <h2>生成场景</h2>
        <div className="scene-grid">
          {ECOMMERCE_SCENE_TEMPLATES.map((scene) => (
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
            <span>参考图 URL</span>
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
          <span>张图像</span>
        </div>
        <button className="primary-button" disabled={task.status === "running"} type="button" onClick={() => void submitBatch()}>
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
              <a className="asset-link" href={`${settings.apiBaseUrl.replace(/\/$/u, "")}${asset.url}`} key={asset.id} target="_blank" rel="noreferrer">
                <ImageIcon size={14} />
                预览
                <Download size={14} />
              </a>
            ))}
          </article>
        ))}
      </section>
    </main>
  );
}
