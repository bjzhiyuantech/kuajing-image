import {
  AlertTriangle,
  CheckCircle2,
  Download,
  ImageIcon,
  Loader2,
  Sparkles,
  Trash2,
  Upload,
  Video,
  X,
  XCircle
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GeneratedAsset, GenerationRecord, GenerationResponse } from "@gpt-image-canvas/shared";
import { authFetch, getStoredAuthToken, readApiErrorDetail, UnauthorizedError } from "./authClient";

const MAX_REFERENCE_IMAGES = 4;

type SeedanceVideoMode = "reference" | "first-last";
type SeedanceStatusTone = "progress" | "success" | "warning" | "error";

interface SeedanceStatus {
  tone: SeedanceStatusTone;
  message: string;
}

interface ReferenceImageItem {
  id: string;
  file: File;
}

interface VideoResult {
  asset: GeneratedAsset;
  fileName: string;
  url: string;
}

interface SeedanceVideoPanelProps {
  onGenerated?: (record: GenerationRecord) => void;
}

const ratioOptions = [
  { label: "16:9", value: "16:9" },
  { label: "9:16", value: "9:16" },
  { label: "1:1", value: "1:1" },
  { label: "4:3", value: "4:3" }
] as const;

const resolutionOptions = [
  { label: "自动", value: "auto" },
  { label: "标清 480p", value: "480p" },
  { label: "高清 720p", value: "720p" },
  { label: "超清 1080p", value: "1080p" },
  { label: "2K", value: "2k" },
  { label: "4K", value: "4k" }
] as const;

export function SeedanceVideoPanel({ onGenerated }: SeedanceVideoPanelProps) {
  const [mode, setMode] = useState<SeedanceVideoMode>("reference");
  const [referenceImages, setReferenceImages] = useState<ReferenceImageItem[]>([]);
  const [firstFrame, setFirstFrame] = useState<File | null>(null);
  const [lastFrame, setLastFrame] = useState<File | null>(null);
  const [overview, setOverview] = useState("");
  const [scene, setScene] = useState("");
  const [camera, setCamera] = useState("");
  const [plot, setPlot] = useState("");
  const [extra, setExtra] = useState("");
  const [ratio, setRatio] = useState("16:9");
  const [resolution, setResolution] = useState("auto");
  const [duration, setDuration] = useState(11);
  const [generateAudio, setGenerateAudio] = useState(true);
  const [watermark, setWatermark] = useState(false);
  const [status, setStatus] = useState<SeedanceStatus | null>(null);
  const [result, setResult] = useState<VideoResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const prompt = useMemo(() => {
    const sections = [
      overview.trim() ? `总纲：${overview.trim()}` : "",
      scene.trim() ? `场景：${scene.trim()}` : "",
      camera.trim() ? `运镜：${camera.trim()}` : "",
      plot.trim() ? `情节：${plot.trim()}` : "",
      extra.trim() ? `补充：${extra.trim()}` : ""
    ].filter(Boolean);
    const modeNote =
      mode === "first-last"
        ? "请严格遵循首帧与尾帧，保持第一张图的开场与最后一张图的收束，中段过渡自然。"
        : "请以参考图作为主体、风格与身份锚点，保持画面一致性与连续性。";

    return [sections.join("\n"), modeNote].filter(Boolean).join("\n\n");
  }, [camera, extra, mode, overview, plot, scene]);

  const sourceReady = mode === "reference" ? referenceImages.length > 0 : Boolean(firstFrame && lastFrame);
  const validationMessage = sourceReady ? "" : mode === "reference" ? "请先上传参考图。" : "请先同时上传首帧和尾帧。";
  const isGenerating = status?.tone === "progress";

  const clearResult = useCallback(() => {
    setResult(null);
    setStatus(null);
  }, []);

  const cancelGeneration = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleReferenceSelection = useCallback((files: FileList | null) => {
    if (!files?.length) {
      return;
    }

    const accepted = Array.from(files).filter((file) => file.type.startsWith("image/"));
    if (accepted.length === 0) {
      return;
    }

    setReferenceImages((current) => {
      const next = [...current];
      const seen = new Set(current.map((item) => fileSignature(item.file)));

      for (const file of accepted) {
        const signature = fileSignature(file);
        if (seen.has(signature)) {
          continue;
        }
        next.push({ id: makeId(), file });
        seen.add(signature);
        if (next.length >= MAX_REFERENCE_IMAGES) {
          break;
        }
      }

      return next.slice(0, MAX_REFERENCE_IMAGES);
    });
  }, []);

  const handleFrameSelection = useCallback((target: "first" | "last", file: File | null) => {
    if (target === "first") {
      setFirstFrame(file);
    } else {
      setLastFrame(file);
    }
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!sourceReady) {
      setStatus({ tone: "warning", message: validationMessage });
      return;
    }

    clearResult();
    const controller = new AbortController();
    abortRef.current = controller;

    const formData = new FormData();
    formData.set("mode", mode);
    formData.set("prompt", prompt);
    formData.set("ratio", ratio);
    formData.set("resolution", resolution);
    formData.set("duration", String(duration));
    formData.set("generate_audio", String(generateAudio));
    formData.set("watermark", String(watermark));

    if (mode === "reference") {
      for (const item of referenceImages) {
        formData.append("reference_images", item.file, item.file.name);
      }
    } else {
      if (firstFrame) {
        formData.set("first_frame", firstFrame, firstFrame.name);
      }
      if (lastFrame) {
        formData.set("last_frame", lastFrame, lastFrame.name);
      }
    }

    setStatus({ tone: "progress", message: "正在提交任务，稍后会返回视频。" });

    try {
      const response = await authFetch("/api/videos/seedance", {
        method: "POST",
        body: formData,
        signal: controller.signal
      });

      if (!response.ok) {
        const detail = await readApiErrorDetail(response, "视频生成失败，请稍后重试。");
        throw new Error(detail.message);
      }

      setStatus({ tone: "progress", message: "模型已经返回视频，正在保存到作品库。" });
      const body = (await response.json()) as unknown;
      if (!isGenerationResponse(body)) {
        throw new Error("视频生成服务返回了无法识别的结果。");
      }

      const asset = firstVideoAsset(body.record);
      if (!asset) {
        throw new Error("视频已生成，但返回结果中没有可播放的视频资源。");
      }

      setResult({
        asset,
        fileName: asset.fileName,
        url: assetVideoUrl(asset)
      });
      onGenerated?.(body.record);
      setStatus({ tone: "success", message: "视频已生成，已插入画布并保存到作品库。" });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setStatus({ tone: "warning", message: "已取消视频生成。" });
      } else if (error instanceof UnauthorizedError) {
        setStatus({ tone: "error", message: error.message });
      } else {
        setStatus({
          tone: "error",
          message: error instanceof Error && error.message ? error.message : "视频生成失败，请稍后重试。"
        });
      }
    } finally {
      abortRef.current = null;
    }
  }, [
    clearResult,
    duration,
    firstFrame,
    generateAudio,
    lastFrame,
    mode,
    prompt,
    ratio,
    resolution,
    referenceImages,
    sourceReady,
    validationMessage,
    onGenerated,
    watermark
  ]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  return (
    <>
      {status ? (
        <div className={`panel-status-strip panel-status--${status.tone}`} role={status.tone === "error" ? "alert" : "status"}>
          {status.tone === "progress" ? (
            <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" aria-hidden="true" />
          ) : status.tone === "success" ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          ) : status.tone === "warning" ? (
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          ) : (
            <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          )}
          <p className="min-w-0 flex-1">{status.message}</p>
          {status.tone === "progress" ? (
            <button className="secondary-action h-8 shrink-0 px-2 text-xs" type="button" onClick={cancelGeneration}>
              取消
            </button>
          ) : null}
        </div>
      ) : null}

      <section className="sidebar-section">
        <div className="sidebar-section__head">
          <div>
            <p className="sidebar-section__eyebrow">生成模式</p>
            <h3>{mode === "reference" ? "参考图驱动" : "首尾帧驱动"}</h3>
          </div>
          <Video className="size-4 text-amber-700" aria-hidden="true" />
        </div>
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="视频生成模式">
          <button
            aria-pressed={mode === "reference"}
            className={mode === "reference" ? "segmented-control is-active" : "segmented-control"}
            type="button"
            onClick={() => setMode("reference")}
          >
            参考图
          </button>
          <button
            aria-pressed={mode === "first-last"}
            className={mode === "first-last" ? "segmented-control is-active" : "segmented-control"}
            type="button"
            onClick={() => setMode("first-last")}
          >
            首尾帧
          </button>
        </div>
      </section>

      <section className="sidebar-section">
        <div className="sidebar-section__head">
          <div>
            <p className="sidebar-section__eyebrow">{mode === "reference" ? "参考素材" : "首尾素材"}</p>
            <h3>{mode === "reference" ? `${referenceImages.length} 张参考图` : "首帧与尾帧"}</h3>
          </div>
          <ImageIcon className="size-4 text-amber-700" aria-hidden="true" />
        </div>

        {mode === "reference" ? (
          <div className="seedance-reference-grid">
            {referenceImages.map((item) => (
              <ReferencePreviewCard
                key={item.id}
                file={item.file}
                onRemove={() => {
                  setReferenceImages((current) => current.filter((entry) => entry.id !== item.id));
                }}
              />
            ))}
            {referenceImages.length < MAX_REFERENCE_IMAGES ? (
              <label className="seedance-reference-card seedance-reference-card--add">
                <Upload className="size-5" aria-hidden="true" />
                <strong>添加参考图</strong>
                <small>PNG / JPG / WebP</small>
                <input
                  accept="image/png,image/jpeg,image/webp"
                  multiple
                  type="file"
                  onChange={(event) => {
                    handleReferenceSelection(event.target.files);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
            ) : null}
          </div>
        ) : (
          <div className="seedance-frame-grid">
            <SeedanceFrameSlot
              file={firstFrame}
              label="首帧"
              onChange={(file) => handleFrameSelection("first", file)}
              onClear={() => handleFrameSelection("first", null)}
            />
            <SeedanceFrameSlot
              file={lastFrame}
              label="尾帧"
              onChange={(file) => handleFrameSelection("last", file)}
              onClear={() => handleFrameSelection("last", null)}
            />
          </div>
        )}
      </section>

      <section className="sidebar-section">
        <div className="sidebar-section__head">
          <div>
            <p className="sidebar-section__eyebrow">提示词结构</p>
            <h3>总纲、场景、运镜、情节</h3>
          </div>
          <Sparkles className="size-4 text-amber-700" aria-hidden="true" />
        </div>

        <div className="space-y-3">
          <PromptField
            label="总纲"
            placeholder="一句话说明视频目标、产品或人物核心、整体风格"
            value={overview}
            onChange={setOverview}
          />
          <PromptField
            label="场景"
            placeholder="拍摄地点、时间、氛围、背景元素"
            value={scene}
            onChange={setScene}
          />
          <PromptField
            label="运镜"
            placeholder="推拉摇移、景别变化、镜头节奏和视角"
            value={camera}
            onChange={setCamera}
          />
          <PromptField
            label="情节"
            placeholder="开场、动作推进、转场、结尾的画面演进"
            value={plot}
            onChange={setPlot}
          />
          <PromptField
            label="补充"
            placeholder="补充角色设定、音色、节奏、风格禁忌等"
            value={extra}
            onChange={setExtra}
          />
        </div>

        <label className="mt-3 block">
          <span className="control-label">提示词预览</span>
          <textarea className="prompt-textarea mt-2 h-36 w-full resize-none" readOnly value={prompt} />
        </label>
      </section>

      <section className="sidebar-section">
        <div className="sidebar-section__head">
          <div>
            <p className="sidebar-section__eyebrow">输出设置</p>
            <h3>比例、清晰度与音频</h3>
          </div>
          <Download className="size-4 text-amber-700" aria-hidden="true" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className="control-label">比例</span>
            <select className="field-control" value={ratio} onChange={(event) => setRatio(event.target.value)}>
              {ratioOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="control-label">清晰度</span>
            <select className="field-control" value={resolution} onChange={(event) => setResolution(event.target.value)}>
              {resolutionOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="control-label">时长（秒）</span>
            <input
              className="field-control"
              min={1}
              max={60}
              step={1}
              type="number"
              value={duration}
              onChange={(event) => setDuration(Number.parseInt(event.target.value || "0", 10) || 11)}
            />
          </label>
        </div>

        <label className="ecommerce-switch-row mt-3">
          <span>
            <strong>生成音频</strong>
            <small>开启后由模型生成背景音或音效。</small>
          </span>
          <input checked={generateAudio} type="checkbox" onChange={(event) => setGenerateAudio(event.target.checked)} />
        </label>

        <label className="ecommerce-switch-row mt-2">
          <span>
            <strong>关闭水印</strong>
            <small>保持成片干净，不额外加水印。</small>
          </span>
          <input checked={!watermark} type="checkbox" onChange={(event) => setWatermark(!event.target.checked)} />
        </label>
      </section>

      {result ? (
        <section className="sidebar-section">
          <div className="sidebar-section__head">
            <div>
              <p className="sidebar-section__eyebrow">生成结果</p>
              <h3>视频已就绪</h3>
            </div>
            <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" />
          </div>

          <div className="seedance-result">
            <video
              className="seedance-result__video"
              controls
              playsInline
              preload="metadata"
              src={result.url}
              style={{ aspectRatio: ratioToAspectRatio(ratio) }}
            />
            <div className="seedance-result__meta">
              <span>{ratio}</span>
              <span>{resolutionToLabel(resolution)}</span>
              <span>{duration} 秒</span>
              <span>{result.asset.width} x {result.asset.height}</span>
            </div>
            <div className="seedance-result__actions">
              <a className="secondary-action" download={result.fileName} href={authenticatedAssetUrl(`/api/assets/${encodeURIComponent(result.asset.id)}/download`)}>
                <Download className="size-4" aria-hidden="true" />
                下载视频
              </a>
              <button className="secondary-action" type="button" onClick={clearResult}>
                <Trash2 className="size-4" aria-hidden="true" />
                清空结果
              </button>
            </div>
          </div>
        </section>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <button
          className="primary-action h-11"
          disabled={!sourceReady || isGenerating}
          title={validationMessage || undefined}
          type="button"
          onClick={() => void handleGenerate()}
        >
          {isGenerating ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Video className="size-4" aria-hidden="true" />}
          {isGenerating ? "生成中" : "生成视频"}
        </button>
        <button className="secondary-action h-11" disabled={!isGenerating} type="button" onClick={cancelGeneration}>
          <X className="size-4" aria-hidden="true" />
          取消
        </button>
      </div>
    </>
  );
}

function PromptField({
  label,
  placeholder,
  value,
  onChange
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="control-label">{label}</span>
      <textarea
        className="prompt-textarea mt-2 h-20 w-full resize-none"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function SeedanceFrameSlot({
  file,
  label,
  onChange,
  onClear
}: {
  file: File | null;
  label: string;
  onChange: (file: File | null) => void;
  onClear: () => void;
}) {
  const previewUrl = useObjectUrl(file);

  return (
    <div className="seedance-frame-card">
      <label className={file && previewUrl ? "seedance-frame-card__surface has-file" : "seedance-frame-card__surface"}>
        {file && previewUrl ? (
          <img alt={file.name} src={previewUrl} />
        ) : (
          <span className="seedance-frame-card__empty">
            <ImageIcon className="size-5" aria-hidden="true" />
            {label}
          </span>
        )}
        <input
          accept="image/png,image/jpeg,image/webp"
          type="file"
          onChange={(event) => {
            onChange(event.target.files?.[0] ?? null);
            event.currentTarget.value = "";
          }}
        />
        <span className="seedance-frame-card__label">{file ? file.name : `上传${label}`}</span>
      </label>
      {file ? (
        <button className="seedance-frame-card__remove" type="button" aria-label={`移除${label}`} onClick={onClear}>
          <X className="size-3.5" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

function ReferencePreviewCard({
  file,
  onRemove
}: {
  file: File;
  onRemove: () => void;
}) {
  const previewUrl = useObjectUrl(file);

  return (
    <article className="seedance-reference-card">
      {previewUrl ? <img alt={file.name} src={previewUrl} /> : null}
      <button className="seedance-reference-card__remove" type="button" aria-label={`移除参考图 ${file.name}`} onClick={onRemove}>
        <X className="size-3.5" aria-hidden="true" />
      </button>
      <div className="seedance-reference-card__meta">
        <strong>{file.name}</strong>
        <small>{formatBytes(file.size)}</small>
      </div>
    </article>
  );
}

function useObjectUrl(file: File | null): string | null {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setObjectUrl(null);
      return;
    }

    const nextUrl = URL.createObjectURL(file);
    setObjectUrl(nextUrl);
    return () => {
      URL.revokeObjectURL(nextUrl);
    };
  }, [file]);

  return objectUrl;
}

function fileSignature(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function makeId(): string {
  if (typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isGenerationResponse(value: unknown): value is GenerationResponse {
  return isRecord(value) && isRecord(value.record) && Array.isArray(value.record.outputs);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstVideoAsset(record: GenerationRecord): GeneratedAsset | undefined {
  return record.outputs.find((output) => output.status === "succeeded" && output.asset?.mimeType.toLowerCase().startsWith("video/"))?.asset;
}

function assetVideoUrl(asset: GeneratedAsset): string {
  return asset.cdnUrl || authenticatedAssetUrl(asset.url);
}

function authenticatedAssetUrl(url: string): string {
  if (/^https?:\/\//iu.test(url)) {
    return url;
  }

  const token = getStoredAuthToken();
  if (!token) {
    return url;
  }

  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}token=${encodeURIComponent(token)}`;
}

function ratioToAspectRatio(ratio: string): string {
  return ratio.replace(":", " / ");
}

function resolutionToLabel(resolution: string): string {
  return resolutionOptions.find((option) => option.value === resolution)?.label ?? resolution;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}
