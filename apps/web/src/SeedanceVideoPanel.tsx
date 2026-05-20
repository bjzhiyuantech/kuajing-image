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
  WandSparkles,
  X,
  XCircle
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  EditImageRequest,
  GeneratedAsset,
  GenerationCount,
  GenerationRecord,
  GenerationResponse,
  ReferenceImageInput,
  SeedanceVideoStoryboardPlanResponse,
  SeedanceVideoStoryboardScene
} from "@gpt-image-canvas/shared";
import { authFetch, getStoredAuthToken, readApiErrorDetail, UnauthorizedError } from "./authClient";

const MAX_REFERENCE_IMAGES = 4;
const FRAME_IMAGE_SIZE_BY_RATIO: Record<string, { width: number; height: number; presetId: string }> = {
  "16:9": { width: 1920, height: 1088, presetId: "video-16-9" },
  "9:16": { width: 1088, height: 1920, presetId: "story-9-16" },
  "1:1": { width: 1024, height: 1024, presetId: "square-1k" },
  "4:3": { width: 1536, height: 2048, presetId: "ozon-3-4" }
};
const SEEDANCE_FACE_SAFE_PROMPT_NOTE =
  "Seedance 安全约束：画面不出现可识别真人脸、真实人物肖像或身份特征；如需人物互动，仅使用手部、背影、肩颈以下裁切、虚化远景人物、无脸模特或人体模特道具，产品始终是主体。";

type SeedanceStatusTone = "progress" | "success" | "warning" | "error";
type SeedanceBusyTask = "storyboard" | "frames" | "video" | null;

interface SeedanceStatus {
  tone: SeedanceStatusTone;
  message: string;
}

interface ReferenceImageItem {
  id: string;
  file: File;
  dataUrl: string;
}

interface VideoResult {
  asset: GeneratedAsset;
  fileName: string;
  url: string;
}

interface GeneratedFramePair {
  first?: GeneratedAsset;
  last?: GeneratedAsset;
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
  const [referenceImages, setReferenceImages] = useState<ReferenceImageItem[]>([]);
  const [firstFrame, setFirstFrame] = useState<File | null>(null);
  const [lastFrame, setLastFrame] = useState<File | null>(null);
  const [intent, setIntent] = useState("");
  const [storyboardSummary, setStoryboardSummary] = useState("");
  const [storyboardScenes, setStoryboardScenes] = useState<SeedanceVideoStoryboardScene[]>([]);
  const [selectedSceneIndex, setSelectedSceneIndex] = useState(0);
  const [storyboardRecommendations, setStoryboardRecommendations] = useState<SeedanceVideoStoryboardPlanResponse["recommendations"] | null>(null);
  const [generatedFrames, setGeneratedFrames] = useState<Record<string, GeneratedFramePair>>({});
  const [overview, setOverview] = useState("");
  const [scene, setScene] = useState("");
  const [camera, setCamera] = useState("");
  const [plot, setPlot] = useState("");
  const [extra, setExtra] = useState("");
  const [ratio, setRatio] = useState("16:9");
  const [resolution, setResolution] = useState("auto");
  const [duration, setDuration] = useState(4);
  const [generateAudio, setGenerateAudio] = useState(false);
  const [watermark, setWatermark] = useState(false);
  const [status, setStatus] = useState<SeedanceStatus | null>(null);
  const [result, setResult] = useState<VideoResult | null>(null);
  const [busyTask, setBusyTask] = useState<SeedanceBusyTask>(null);
  const abortRef = useRef<AbortController | null>(null);
  const selectedScene = storyboardScenes[selectedSceneIndex];
  const selectedGeneratedFrames = selectedScene ? generatedFrames[selectedScene.id] : undefined;

  const prompt = useMemo(() => {
    const sections = [
      overview.trim() ? `总纲：${overview.trim()}` : "",
      scene.trim() ? `场景：${scene.trim()}` : "",
      camera.trim() ? `运镜：${camera.trim()}` : "",
      plot.trim() ? `情节：${plot.trim()}` : "",
      extra.trim() ? `补充：${extra.trim()}` : ""
    ].filter(Boolean);
    const modeNote = `请严格遵循首帧与尾帧，保持第一张图的开场与最后一张图的收束，中段过渡自然。\n${SEEDANCE_FACE_SAFE_PROMPT_NOTE}`;

    return [sections.join("\n"), modeNote].filter(Boolean).join("\n\n");
  }, [camera, extra, overview, plot, scene]);

  const sourceReady = Boolean(firstFrame && lastFrame);
  const validationMessage = sourceReady ? "" : "请先为当前镜头生成或上传首尾帧。";
  const storyboardReady = referenceImages.length > 0 && intent.trim().length > 0;
  const frameGenerationReady = referenceImages.length > 0 && Boolean(selectedScene);
  const isGenerating = busyTask !== null;

  const clearResult = useCallback(() => {
    setResult(null);
    setStatus(null);
  }, []);

  const cancelGeneration = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleReferenceSelection = useCallback(async (files: FileList | null) => {
    if (!files?.length) {
      return;
    }

    const accepted = Array.from(files).filter((file) => file.type.startsWith("image/"));
    if (accepted.length === 0) {
      return;
    }

    const nextItems: ReferenceImageItem[] = [];
    for (const file of accepted) {
      nextItems.push({ id: makeId(), file, dataUrl: await fileToDataUrl(file) });
    }

    setReferenceImages((current) => {
      const next = [...current];
      const seen = new Set(current.map((item) => fileSignature(item.file)));

      for (const item of nextItems) {
        const signature = fileSignature(item.file);
        if (seen.has(signature)) {
          continue;
        }
        next.push(item);
        seen.add(signature);
        if (next.length >= MAX_REFERENCE_IMAGES) {
          break;
        }
      }

      return next.slice(0, MAX_REFERENCE_IMAGES);
    });
    setStoryboardScenes([]);
    setStoryboardSummary("");
    setStoryboardRecommendations(null);
    setGeneratedFrames({});
    setFirstFrame(null);
    setLastFrame(null);
  }, []);

  const handleFrameSelection = useCallback((target: "first" | "last", file: File | null) => {
    if (target === "first") {
      setFirstFrame(file);
    } else {
      setLastFrame(file);
    }
  }, []);

  const clearGeneratedFrameAsset = useCallback((target: "first" | "last") => {
    if (!selectedScene) {
      return;
    }
    setGeneratedFrames((current) => {
      const framePair = current[selectedScene.id];
      if (!framePair) {
        return current;
      }
      const nextPair = target === "first" ? { ...framePair, first: undefined } : { ...framePair, last: undefined };
      return {
        ...current,
        [selectedScene.id]: nextPair
      };
    });
  }, [selectedScene]);

  const applyScene = useCallback((nextScene: SeedanceVideoStoryboardScene, index: number) => {
    setSelectedSceneIndex(index);
    setOverview(nextScene.overview);
    setScene(nextScene.scene);
    setCamera(nextScene.camera);
    setPlot(nextScene.plot);
    setExtra(nextScene.extra);
    setDuration(clampDuration(nextScene.duration || 4));
    const frames = generatedFrames[nextScene.id];
    setFirstFrame(null);
    setLastFrame(null);
    if (frames?.first) {
      void assetToFile(frames.first).then(setFirstFrame).catch(() => undefined);
    }
    if (frames?.last) {
      void assetToFile(frames.last).then(setLastFrame).catch(() => undefined);
    }
  }, [generatedFrames]);

  const handlePlanStoryboard = useCallback(async () => {
    if (!storyboardReady) {
      setStatus({ tone: "warning", message: referenceImages.length === 0 ? "请先上传产品参考图。" : "请先输入一句话视频意图。" });
      return;
    }

    clearResult();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusyTask("storyboard");
    setStatus({ tone: "progress", message: "正在看参考图并规划分镜、首尾帧提示词。" });

    try {
      const response = await authFetch("/api/videos/seedance/storyboard-plan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          intent: intent.trim(),
          referenceImages: referenceImages.map(referenceImageInput),
          ratio,
          resolution,
          duration,
          generateAudio
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const detail = await readApiErrorDetail(response, "分镜规划失败，请稍后重试。");
        throw new Error(seedanceVideoErrorMessage(detail.message));
      }

      const body = (await response.json()) as unknown;
      if (!isStoryboardPlanResponse(body)) {
        throw new Error("分镜规划服务返回了无法识别的结果。");
      }

      setStoryboardSummary(body.summary);
      setStoryboardScenes(body.scenes);
      setStoryboardRecommendations(body.recommendations);
      setRatio(body.recommendations.ratio || ratio);
      setResolution(body.recommendations.resolution || resolution);
      setGenerateAudio(body.recommendations.generateAudio);
      setGeneratedFrames({});
      setFirstFrame(null);
      setLastFrame(null);
      if (body.scenes[0]) {
        setSelectedSceneIndex(0);
        setOverview(body.scenes[0].overview);
        setScene(body.scenes[0].scene);
        setCamera(body.scenes[0].camera);
        setPlot(body.scenes[0].plot);
        setExtra(body.scenes[0].extra);
        setDuration(clampDuration(body.scenes[0].duration || body.recommendations.duration || 4));
      } else {
        setDuration(clampDuration(body.recommendations.duration || 4));
      }
      setStatus({ tone: "success", message: `已生成 ${body.scenes.length} 个分镜，下面可微调后生成首尾帧。` });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setStatus({ tone: "warning", message: "已取消分镜规划。" });
      } else if (error instanceof UnauthorizedError) {
        setStatus({ tone: "error", message: error.message });
      } else {
        setStatus({
          tone: "error",
          message: error instanceof Error && error.message ? error.message : "分镜规划失败，请稍后重试。"
        });
      }
    } finally {
      abortRef.current = null;
      setBusyTask(null);
    }
  }, [clearResult, duration, generateAudio, intent, ratio, referenceImages, resolution, storyboardReady]);

  const handleGenerateFrames = useCallback(async () => {
    if (!selectedScene || !frameGenerationReady) {
      setStatus({ tone: "warning", message: "请先生成并选择一个分镜。" });
      return;
    }

    const firstFramePrompt = selectedScene.firstFrame.prompt.trim();
    const lastFramePrompt = selectedScene.lastFrame.prompt.trim();
    if (!firstFramePrompt || !lastFramePrompt) {
      setStatus({ tone: "warning", message: "当前分镜缺少首尾帧提示词。" });
      return;
    }

    clearResult();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusyTask("frames");
    setStatus({ tone: "progress", message: "正在用后端生图模型生成当前镜头首尾帧。" });

    try {
      const firstResponse = await generateFrameImage(firstFramePrompt, referenceImages, ratio, controller.signal);
      const lastResponse = await generateFrameImage(lastFramePrompt, referenceImages, ratio, controller.signal);
      const firstAsset = firstImageAsset(firstResponse.record);
      const lastAsset = firstImageAsset(lastResponse.record);
      if (!firstAsset || !lastAsset) {
        throw new Error("首尾帧生成完成，但没有返回可用图片。");
      }

      setGeneratedFrames((current) => ({
        ...current,
        [selectedScene.id]: {
          first: firstAsset,
          last: lastAsset
        }
      }));
      const [firstFile, lastFile] = await Promise.all([assetToFile(firstAsset), assetToFile(lastAsset)]);
      setFirstFrame(firstFile);
      setLastFrame(lastFile);
      setStatus({ tone: "success", message: "首尾帧已生成并填入当前镜头，可以继续修改或生成视频。" });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setStatus({ tone: "warning", message: "已取消首尾帧生成。" });
      } else if (error instanceof UnauthorizedError) {
        setStatus({ tone: "error", message: error.message });
      } else {
        setStatus({
          tone: "error",
          message: error instanceof Error && error.message ? error.message : "首尾帧生成失败，请稍后重试。"
        });
      }
    } finally {
      abortRef.current = null;
      setBusyTask(null);
    }
  }, [clearResult, frameGenerationReady, ratio, referenceImages, selectedScene]);

  const handleGenerate = useCallback(async () => {
    if (!sourceReady) {
      setStatus({ tone: "warning", message: validationMessage });
      return;
    }

    clearResult();
    const controller = new AbortController();
    abortRef.current = controller;

    const formData = new FormData();
    formData.set("mode", "first-last");
    formData.set("prompt", appendSeedanceFaceSafeNote(prompt));
    formData.set("ratio", ratio);
    formData.set("resolution", resolution);
    formData.set("duration", String(duration));
    formData.set("generate_audio", String(generateAudio));
    formData.set("watermark", String(watermark));

    if (firstFrame) {
      formData.set("first_frame", firstFrame, firstFrame.name);
    }
    if (lastFrame) {
      formData.set("last_frame", lastFrame, lastFrame.name);
    }

    setBusyTask("video");
    setStatus({ tone: "progress", message: "正在提交当前镜头视频任务，稍后会返回成片。" });

    try {
      const response = await authFetch("/api/videos/seedance", {
        method: "POST",
        body: formData,
        signal: controller.signal
      });

      if (!response.ok) {
        const detail = await readApiErrorDetail(response, "视频生成失败，请稍后重试。");
        throw new Error(seedanceVideoErrorMessage(detail.message));
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
      setStatus({ tone: "success", message: "当前镜头视频已生成，已插入画布并保存到作品库。" });
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
      setBusyTask(null);
    }
  }, [
    clearResult,
    duration,
    firstFrame,
    generateAudio,
    lastFrame,
    prompt,
    ratio,
    resolution,
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
            <p className="sidebar-section__eyebrow">第一步</p>
            <h3>{referenceImages.length > 0 ? `${referenceImages.length} 张产品参考图` : "上传产品参考图"}</h3>
          </div>
          <ImageIcon className="size-4 text-amber-700" aria-hidden="true" />
        </div>

        <div className="seedance-reference-grid">
          {referenceImages.map((item) => (
            <ReferencePreviewCard
              key={item.id}
              file={item.file}
              onRemove={() => {
                setReferenceImages((current) => current.filter((entry) => entry.id !== item.id));
                setStoryboardScenes([]);
                setStoryboardSummary("");
                setStoryboardRecommendations(null);
                setGeneratedFrames({});
                setFirstFrame(null);
                setLastFrame(null);
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
                  void handleReferenceSelection(event.target.files);
                  event.currentTarget.value = "";
                }}
              />
            </label>
          ) : null}
        </div>
      </section>

      <section className="sidebar-section">
        <div className="sidebar-section__head">
          <div>
            <p className="sidebar-section__eyebrow">第二步</p>
            <h3>一句话描述意图</h3>
          </div>
          <WandSparkles className="size-4 text-amber-700" aria-hidden="true" />
        </div>
        <label className="block">
          <span className="control-label">视频意图</span>
          <textarea
            className="prompt-textarea mt-2 h-24 w-full resize-none"
            placeholder="例如：做一条高端精华油短视频，突出金色质感、滴管细节和护肤仪式感"
            value={intent}
            onChange={(event) => setIntent(event.target.value)}
          />
        </label>
        <button
          className="primary-action mt-3 h-11 w-full"
          disabled={!storyboardReady || isGenerating}
          type="button"
          onClick={() => void handlePlanStoryboard()}
        >
          {busyTask === "storyboard" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Sparkles className="size-4" aria-hidden="true" />}
          {busyTask === "storyboard" ? "生成分镜中" : "生成分镜提示词"}
        </button>
      </section>

      {storyboardScenes.length > 0 ? (
        <section className="sidebar-section">
          <div className="sidebar-section__head">
            <div>
              <p className="sidebar-section__eyebrow">分镜列表</p>
              <h3>{storyboardScenes.length} 个镜头</h3>
            </div>
            <Video className="size-4 text-amber-700" aria-hidden="true" />
          </div>
          {storyboardSummary ? <p className="seedance-storyboard-summary">{storyboardSummary}</p> : null}
          <div className="seedance-scene-list" role="list">
            {storyboardScenes.map((item, index) => (
              <button
                aria-pressed={selectedSceneIndex === index}
                className={selectedSceneIndex === index ? "seedance-scene-item is-active" : "seedance-scene-item"}
                key={item.id}
                type="button"
                onClick={() => applyScene(item, index)}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{item.title}</strong>
                <small>{item.duration || 4}s</small>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="sidebar-section">
        <div className="sidebar-section__head">
          <div>
            <p className="sidebar-section__eyebrow">当前镜头首尾帧</p>
            <h3>{selectedScene ? selectedScene.title : "先生成分镜"}</h3>
          </div>
          <ImageIcon className="size-4 text-amber-700" aria-hidden="true" />
        </div>
        <div className="seedance-frame-grid">
          <SeedanceFrameSlot
            asset={selectedGeneratedFrames?.first}
            file={firstFrame}
            label="首帧"
            onChange={(file) => {
              handleFrameSelection("first", file);
              clearGeneratedFrameAsset("first");
            }}
            onClear={() => {
              handleFrameSelection("first", null);
              clearGeneratedFrameAsset("first");
            }}
          />
          <SeedanceFrameSlot
            asset={selectedGeneratedFrames?.last}
            file={lastFrame}
            label="尾帧"
            onChange={(file) => {
              handleFrameSelection("last", file);
              clearGeneratedFrameAsset("last");
            }}
            onClear={() => {
              handleFrameSelection("last", null);
              clearGeneratedFrameAsset("last");
            }}
          />
        </div>
        <button
          className="secondary-action mt-3 h-10 w-full"
          disabled={!frameGenerationReady || isGenerating}
          type="button"
          onClick={() => void handleGenerateFrames()}
        >
          {busyTask === "frames" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <ImageIcon className="size-4" aria-hidden="true" />}
          {busyTask === "frames" ? "生成首尾帧中" : "生成当前镜头首尾帧"}
        </button>
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
            onChange={(value) => {
              setOverview(value);
              updateSelectedSceneField(setStoryboardScenes, selectedSceneIndex, "overview", value);
            }}
          />
          <PromptField
            label="场景"
            placeholder="拍摄地点、时间、氛围、背景元素"
            value={scene}
            onChange={(value) => {
              setScene(value);
              updateSelectedSceneField(setStoryboardScenes, selectedSceneIndex, "scene", value);
            }}
          />
          <PromptField
            label="运镜"
            placeholder="推拉摇移、景别变化、镜头节奏和视角"
            value={camera}
            onChange={(value) => {
              setCamera(value);
              updateSelectedSceneField(setStoryboardScenes, selectedSceneIndex, "camera", value);
            }}
          />
          <PromptField
            label="情节"
            placeholder="开场、动作推进、转场、结尾的画面演进"
            value={plot}
            onChange={(value) => {
              setPlot(value);
              updateSelectedSceneField(setStoryboardScenes, selectedSceneIndex, "plot", value);
            }}
          />
          <PromptField
            label="补充"
            placeholder="补充角色设定、音色、节奏、风格禁忌等"
            value={extra}
            onChange={(value) => {
              setExtra(value);
              updateSelectedSceneField(setStoryboardScenes, selectedSceneIndex, "extra", value);
            }}
          />
        </div>

        <label className="mt-3 block">
          <span className="control-label">当前镜头视频提示词</span>
          <textarea className="prompt-textarea mt-2 h-36 w-full resize-none" readOnly value={prompt} />
        </label>
        {selectedScene ? (
          <div className="seedance-frame-prompts">
            <PromptField
              label="首帧提示词"
              placeholder="当前镜头开场关键帧"
              value={selectedScene.firstFrame.prompt}
              onChange={(value) => updateSelectedSceneField(setStoryboardScenes, selectedSceneIndex, "firstFrame", { ...selectedScene.firstFrame, prompt: value })}
            />
            <PromptField
              label="尾帧提示词"
              placeholder="当前镜头结束关键帧"
              value={selectedScene.lastFrame.prompt}
              onChange={(value) => updateSelectedSceneField(setStoryboardScenes, selectedSceneIndex, "lastFrame", { ...selectedScene.lastFrame, prompt: value })}
            />
          </div>
        ) : null}
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
              max={6}
              step={1}
              type="number"
              value={duration}
              onChange={(event) => {
                const nextDuration = clampDuration(Number.parseInt(event.target.value || "0", 10) || 4);
                setDuration(nextDuration);
                updateSelectedSceneField(setStoryboardScenes, selectedSceneIndex, "duration", nextDuration);
              }}
            />
          </label>
        </div>

        {storyboardRecommendations ? (
          <div className="seedance-recommendations">
            <strong>建议：{storyboardRecommendations.ratio} / {resolutionToLabel(storyboardRecommendations.resolution)} / {storyboardRecommendations.duration}s</strong>
            {storyboardRecommendations.notes.slice(0, 3).map((note) => (
              <span key={note}>{note}</span>
            ))}
          </div>
        ) : (
          <p className="seedance-recommendations">
            <strong>建议：默认 4s / 720p / 9:16</strong>
            <span>单镜头不宜过长，超过 6s 容易影响主体稳定和画面一致性。</span>
          </p>
        )}

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
          {busyTask === "video" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Video className="size-4" aria-hidden="true" />}
          {busyTask === "video" ? "生成中" : "生成当前镜头视频"}
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
  asset,
  file,
  label,
  onChange,
  onClear
}: {
  asset?: GeneratedAsset;
  file: File | null;
  label: string;
  onChange: (file: File | null) => void;
  onClear: () => void;
}) {
  const previewUrl = useObjectUrl(file);
  const assetPreview = asset ? assetDisplayUrl(asset, 512) : null;
  const displayUrl = previewUrl || assetPreview;

  return (
    <div className="seedance-frame-card">
      <label className={displayUrl ? "seedance-frame-card__surface has-file" : "seedance-frame-card__surface"}>
        {displayUrl ? (
          <img alt={file?.name || asset?.fileName || label} src={displayUrl} />
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
        <span className="seedance-frame-card__label">{file?.name || asset?.fileName || `上传${label}`}</span>
      </label>
      {file || asset ? (
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

function referenceImageInput(item: ReferenceImageItem): ReferenceImageInput {
  return {
    dataUrl: item.dataUrl,
    fileName: item.file.name
  };
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("无法读取图片内容。"));
    });
    reader.addEventListener("error", () => reject(reader.error ?? new Error("无法读取图片内容。")));
    reader.readAsDataURL(file);
  });
}

async function assetToFile(asset: GeneratedAsset): Promise<File> {
  const response = await fetch(authenticatedAssetUrl(`/api/assets/${encodeURIComponent(asset.id)}/download`));
  if (!response.ok) {
    throw new Error("无法读取生成的图片。");
  }
  const blob = await response.blob();
  return new File([blob], asset.fileName || `${asset.id}.png`, {
    type: asset.mimeType || blob.type || "image/png"
  });
}

async function generateFrameImage(
  prompt: string,
  referenceImages: ReferenceImageItem[],
  ratio: string,
  signal: AbortSignal
): Promise<GenerationResponse> {
  const size = FRAME_IMAGE_SIZE_BY_RATIO[ratio] ?? FRAME_IMAGE_SIZE_BY_RATIO["16:9"];
  const referenceImage = referenceImages[0];
  if (!referenceImage) {
    throw new Error("请先上传产品参考图。");
  }

  const requestBody: EditImageRequest & { sizePresetId?: string } = {
    prompt: appendSeedanceFaceSafeNote(prompt),
    presetId: "none",
    size: {
      width: size.width,
      height: size.height
    },
    quality: "auto",
    outputFormat: "png",
    count: 1 as GenerationCount,
    referenceImage: {
      ...referenceImageInput(referenceImage),
      additionalReferenceImages: referenceImages.slice(1).map(referenceImageInput)
    },
    sizePresetId: size.presetId
  };

  const response = await authFetch("/api/images/edit", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody),
    signal
  });
  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, "首尾帧生成失败。"));
  }
  const body = (await response.json()) as unknown;
  if (!isGenerationResponse(body)) {
    throw new Error("生图服务返回了无法识别的首尾帧结果。");
  }
  return body;
}

function firstImageAsset(record: GenerationRecord): GeneratedAsset | undefined {
  return record.outputs.find((output) => output.status === "succeeded" && output.asset?.mimeType.toLowerCase().startsWith("image/"))?.asset;
}

function isStoryboardPlanResponse(value: unknown): value is SeedanceVideoStoryboardPlanResponse {
  if (!isRecord(value) || typeof value.summary !== "string" || !Array.isArray(value.scenes) || !isRecord(value.recommendations)) {
    return false;
  }
  return value.scenes.every(isStoryboardScene);
}

function isStoryboardScene(value: unknown): value is SeedanceVideoStoryboardScene {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.overview === "string" &&
    typeof value.scene === "string" &&
    typeof value.camera === "string" &&
    typeof value.plot === "string" &&
    typeof value.extra === "string" &&
    typeof value.videoPrompt === "string" &&
    typeof value.duration === "number" &&
    isRecord(value.firstFrame) &&
    typeof value.firstFrame.prompt === "string" &&
    isRecord(value.lastFrame) &&
    typeof value.lastFrame.prompt === "string"
  );
}

async function readApiErrorMessage(response: Response, fallback: string): Promise<string> {
  const detail = await readApiErrorDetail(response, fallback);
  return detail.message;
}

function appendSeedanceFaceSafeNote(prompt: string): string {
  const trimmed = prompt.trim();
  if (!trimmed) {
    return SEEDANCE_FACE_SAFE_PROMPT_NOTE;
  }
  if (trimmed.includes("可识别真人脸") || trimmed.includes("无脸模特") || trimmed.includes("hands only") || trimmed.includes("below-neck")) {
    return trimmed;
  }
  return `${trimmed}\n${SEEDANCE_FACE_SAFE_PROMPT_NOTE}`;
}

function seedanceVideoErrorMessage(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("real person") || lower.includes("real people") || lower.includes("真人") || lower.includes("人脸")) {
    return "Seedance 拒绝了包含真实人物/可识别脸部的首尾帧。请重新生成无脸版首尾帧：使用手部、背影、肩颈以下裁切、虚化远景人物、无脸模特或产品单独陈列。";
  }
  return message;
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

function assetDisplayUrl(asset: GeneratedAsset, preferredWidth?: number): string {
  return previewUrlForWidth(asset.cdnPreviewUrls, preferredWidth) || asset.cdnUrl || authenticatedAssetUrl(asset.url);
}

function previewUrlForWidth(previews: Record<string, string> | undefined, preferredWidth: number | undefined): string | undefined {
  if (!previews || !preferredWidth) {
    return undefined;
  }
  const entries = Object.entries(previews)
    .map(([key, value]) => ({ width: Number.parseInt(key, 10), value }))
    .filter((entry) => Number.isFinite(entry.width) && entry.value)
    .sort((left, right) => left.width - right.width);
  const selected = entries.find((entry) => entry.width >= preferredWidth) ?? entries[entries.length - 1];
  return selected?.value;
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

function clampDuration(value: number): number {
  if (!Number.isFinite(value)) {
    return 4;
  }
  return Math.min(Math.max(Math.round(value), 1), 6);
}

function updateSelectedSceneField<K extends keyof SeedanceVideoStoryboardScene>(
  setScenes: (updater: (current: SeedanceVideoStoryboardScene[]) => SeedanceVideoStoryboardScene[]) => void,
  index: number,
  key: K,
  value: SeedanceVideoStoryboardScene[K]
): void {
  setScenes((current) => current.map((scene, sceneIndex) => (sceneIndex === index ? { ...scene, [key]: value } : scene)));
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
