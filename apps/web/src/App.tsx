import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Cloud,
  Download,
  ImageIcon,
  Loader2,
  MapPin,
  RotateCcw,
  Sparkles,
  Square,
  XCircle
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Tldraw,
  type Editor,
  type TLAsset,
  type TLAssetId,
  type TLEditorSnapshot,
  type TLImageShape,
  type TLShapeId,
  type TLStoreSnapshot
} from "tldraw";
import {
  CUSTOM_SIZE_PRESET_ID,
  GENERATION_COUNTS,
  IMAGE_QUALITIES,
  MAX_IMAGE_DIMENSION,
  MIN_IMAGE_DIMENSION,
  OUTPUT_FORMATS,
  SIZE_PRESETS,
  STYLE_PRESETS,
  validateImageSize,
  type GenerationCount,
  type GenerationRecord,
  type GenerationResponse,
  type GenerationStatus,
  type GeneratedAsset,
  type ImageQuality,
  type OutputFormat,
  type ProjectState,
  type ReferenceImageInput,
  type SizePreset,
  type StylePresetId
} from "@gpt-image-canvas/shared";

const AUTOSAVE_DEBOUNCE_MS = 1200;
const MAX_REFERENCE_IMAGE_BYTES = 20 * 1024 * 1024;

type PersistedSnapshot = TLEditorSnapshot | TLStoreSnapshot;
type SaveStatus = "loading" | "saved" | "pending" | "saving" | "error";

interface GenerationSubmitInput {
  prompt: string;
  presetId: StylePresetId;
  sizePresetId: string;
  size: {
    width: number;
    height: number;
  };
  quality: ImageQuality;
  outputFormat: OutputFormat;
  count: GenerationCount;
}

interface GenerationReferenceInput {
  referenceImage: ReferenceImageInput;
  referenceAssetId?: string;
}

type ReferenceSelection =
  | {
      status: "none" | "multiple" | "non-image" | "unreadable";
      hint: string;
    }
  | {
      status: "ready";
      assetId: TLAssetId | null;
      localAssetId?: string;
      name: string;
      sourceUrl: string;
      width: number;
      height: number;
      hint: string;
    };

const qualityLabels: Record<ImageQuality, string> = {
  auto: "自动",
  low: "快速草稿",
  medium: "标准",
  high: "高质量"
};

const formatLabels: Record<OutputFormat, string> = {
  png: "PNG",
  jpeg: "JPEG",
  webp: "WebP"
};

const stylePresetLabels: Record<StylePresetId, string> = {
  none: "无风格",
  photoreal: "真实摄影",
  product: "商业产品",
  illustration: "精致插画",
  poster: "海报视觉",
  avatar: "头像角色"
};

const sizePresetLabels: Record<string, string> = {
  "square-1k": "方形成图 1K",
  "poster-portrait": "竖版海报",
  "poster-landscape": "横版海报",
  "story-9-16": "竖屏故事",
  "video-16-9": "视频封面",
  "wide-2k": "宽屏展示 2K",
  "portrait-2k": "高清竖图 2K",
  "square-2k": "高清方图 2K",
  "wide-4k": "宽屏展示 4K"
};

const modeLabels: Record<GenerationRecord["mode"], string> = {
  generate: "文本生成",
  edit: "参考生成"
};

const statusLabels: Record<GenerationStatus, string> = {
  pending: "等待中",
  running: "生成中",
  succeeded: "已完成",
  partial: "部分完成",
  failed: "失败",
  cancelled: "已取消"
};

function sizePresetLabel(preset: SizePreset): string {
  return sizePresetLabels[preset.id] ?? preset.label;
}

function sizePresetOptionLabel(preset: SizePreset): string {
  return `${sizePresetLabel(preset)} - ${preset.width} x ${preset.height}`;
}

function normalizeDimension(value: string): number {
  return Number.parseInt(value, 10);
}

function sizeValidationMessage(width: number, height: number): string {
  const result = validateImageSize({ width, height });

  if (result.ok) {
    return "";
  }

  return result.message;
}

function generationValidationMessage(promptValue: string, widthValue: number, heightValue: number): string {
  return promptValue.trim() ? sizeValidationMessage(widthValue, heightValue) : "请输入提示词后再生成。";
}

function isPersistedSnapshot(value: unknown): value is PersistedSnapshot {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isGenerationResponse(value: unknown): value is GenerationResponse {
  return typeof value === "object" && value !== null && "record" in value;
}

function coerceStylePresetId(value: string): StylePresetId {
  return STYLE_PRESETS.some((preset) => preset.id === value) ? (value as StylePresetId) : "none";
}

function coerceGenerationCount(value: number): GenerationCount {
  return GENERATION_COUNTS.includes(value as GenerationCount) ? (value as GenerationCount) : 1;
}

function sizePresetIdForSize(widthValue: number, heightValue: number): string {
  return (
    SIZE_PRESETS.find((preset) => preset.width === widthValue && preset.height === heightValue)?.id ?? CUSTOM_SIZE_PRESET_ID
  );
}

function firstDownloadableAsset(record: GenerationRecord): GeneratedAsset | undefined {
  return record.outputs.find((output) => output.status === "succeeded" && output.asset)?.asset;
}

function successfulOutputCount(record: GenerationRecord): number {
  return record.outputs.filter((output) => output.status === "succeeded" && output.asset).length;
}

function promptExcerpt(promptValue: string): string {
  const compact = promptValue.replace(/\s+/gu, " ").trim();
  return compact.length > 72 ? `${compact.slice(0, 72)}...` : compact;
}

function formatCreatedTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function createTldrawAssetId(assetId: string): TLAssetId {
  return `asset:${assetId}` as TLAssetId;
}

function createTldrawShapeId(): TLShapeId {
  return `shape:${crypto.randomUUID()}` as TLShapeId;
}

function displaySize(asset: GeneratedAsset): { width: number; height: number } {
  const scale = Math.min(1, 340 / asset.width, 300 / asset.height);
  return {
    width: Math.round(asset.width * scale),
    height: Math.round(asset.height * scale)
  };
}

function insertGeneratedImages(editor: Editor, record: GenerationRecord): number {
  const successfulAssets = record.outputs.flatMap((output) => (output.status === "succeeded" && output.asset ? [output.asset] : []));
  if (successfulAssets.length === 0) {
    return 0;
  }

  const placements = successfulAssets.map((asset) => ({
    asset,
    assetId: createTldrawAssetId(asset.id),
    shapeId: createTldrawShapeId(),
    size: displaySize(asset)
  }));
  const columns = placements.length === 1 ? 1 : 2;
  const rows = Math.ceil(placements.length / columns);
  const gap = 48;
  const cellWidth = Math.max(...placements.map((placement) => placement.size.width));
  const cellHeight = Math.max(...placements.map((placement) => placement.size.height));
  const gridWidth = columns * cellWidth + (columns - 1) * gap;
  const gridHeight = rows * cellHeight + (rows - 1) * gap;
  const viewport = editor.getViewportPageBounds();
  const originX = viewport.center.x - gridWidth / 2;
  const originY = viewport.center.y - gridHeight / 2;

  const assets = placements.map<TLAsset>((placement) => ({
    id: placement.assetId,
    typeName: "asset",
    type: "image",
    props: {
      src: placement.asset.url,
      w: placement.asset.width,
      h: placement.asset.height,
      name: placement.asset.fileName,
      mimeType: placement.asset.mimeType,
      isAnimated: false
    },
    meta: {
      localAssetId: placement.asset.id
    }
  }));
  const shapes = placements.map((placement, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = originX + column * (cellWidth + gap) + (cellWidth - placement.size.width) / 2;
    const y = originY + row * (cellHeight + gap) + (cellHeight - placement.size.height) / 2;

    return {
      id: placement.shapeId,
      type: "image",
      x,
      y,
      props: {
        assetId: placement.assetId,
        w: placement.size.width,
        h: placement.size.height,
        url: placement.asset.url,
        playing: true,
        crop: null,
        flipX: false,
        flipY: false,
        altText: record.prompt
      }
    } satisfies Partial<TLImageShape> & { id: TLShapeId; type: "image" };
  });

  editor.createAssets(assets);
  editor.createShapes(shapes);
  editor.select(...placements.map((placement) => placement.shapeId));

  return placements.length;
}

function resolveReferenceSelection(editor: Editor): ReferenceSelection {
  const selectedShapes = editor.getSelectedShapes();

  if (selectedShapes.length === 0) {
    return {
      status: "none",
      hint: "选择画布中的一张图片后，可用它作为参考生成新图。"
    };
  }

  if (selectedShapes.length > 1) {
    return {
      status: "multiple",
      hint: "当前选择了多个对象。只选择一张图片即可启用参考生成。"
    };
  }

  const shape = selectedShapes[0];
  if (shape.type !== "image") {
    return {
      status: "non-image",
      hint: "当前对象不是图片。请选择画布中的单张图片作为参考。"
    };
  }

  const imageShape = shape as TLImageShape;
  const asset = imageShape.props.assetId ? editor.getAsset(imageShape.props.assetId) : undefined;
  const sourceUrl = getImageSourceUrl(imageShape, asset);

  if (!sourceUrl) {
    return {
      status: "unreadable",
      hint: "这张图片缺少可读取的数据源，无法作为参考图。"
    };
  }

  return {
    status: "ready",
    assetId: imageShape.props.assetId,
    localAssetId: getLocalAssetId(asset, sourceUrl),
    name: getReferenceName(asset, sourceUrl),
    sourceUrl,
    width: asset?.type === "image" ? asset.props.w : imageShape.props.w,
    height: asset?.type === "image" ? asset.props.h : imageShape.props.h,
    hint: "已选中一张图片，将使用它作为本次参考图。"
  };
}

function getImageSourceUrl(shape: TLImageShape, asset: TLAsset | undefined): string | undefined {
  const assetSrc = asset?.type === "image" && typeof asset.props.src === "string" ? asset.props.src : undefined;
  return assetSrc || shape.props.url || undefined;
}

function getReferenceName(asset: TLAsset | undefined, sourceUrl: string): string {
  if (asset?.type === "image" && asset.props.name) {
    return asset.props.name;
  }

  try {
    const pathname = new URL(sourceUrl, window.location.origin).pathname;
    return pathname.split("/").filter(Boolean).at(-1) || "reference-image";
  } catch {
    return "reference-image";
  }
}

function getLocalAssetId(asset: TLAsset | undefined, sourceUrl?: string): string | undefined {
  const localAssetId = asset?.meta && typeof asset.meta.localAssetId === "string" ? asset.meta.localAssetId : undefined;
  if (localAssetId) {
    return localAssetId;
  }

  if (!sourceUrl) {
    return undefined;
  }

  try {
    const url = new URL(sourceUrl, window.location.origin);
    if (url.origin === window.location.origin) {
      const match = /^\/api\/assets\/([^/?#]+)(?:\/download)?$/u.exec(url.pathname);
      return match?.[1];
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function findCanvasImageShape(editor: Editor, record: GenerationRecord): TLShapeId | undefined {
  const assetIds = new Set(
    record.outputs.flatMap((output) => (output.status === "succeeded" && output.asset ? [output.asset.id] : []))
  );
  if (assetIds.size === 0) {
    return undefined;
  }

  for (const shape of editor.getCurrentPageShapes()) {
    if (shape.type !== "image") {
      continue;
    }

    const imageShape = shape as TLImageShape;
    const asset = imageShape.props.assetId ? editor.getAsset(imageShape.props.assetId) : undefined;
    const sourceUrl = getImageSourceUrl(imageShape, asset);
    const localAssetId = getLocalAssetId(asset, sourceUrl);

    if (localAssetId && assetIds.has(localAssetId)) {
      return imageShape.id;
    }
  }

  return undefined;
}

function fileNameWithImageExtension(name: string, mimeType: string): string {
  if (/\.(png|jpe?g|webp|gif)$/iu.test(name)) {
    return name;
  }

  const extension = mimeType.split("/")[1]?.replace("jpeg", "jpg") || "png";
  return `${name}.${extension}`;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("无法读取参考图片数据。"));
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("无法读取参考图片数据。"));
    };
    reader.readAsDataURL(blob);
  });
}

async function readReferenceImage(selection: Extract<ReferenceSelection, { status: "ready" }>, signal: AbortSignal): Promise<{
  dataUrl: string;
  fileName: string;
}> {
  let response: Response;

  try {
    response = await fetch(selection.sourceUrl, { signal });
  } catch {
    throw new Error("无法读取当前参考图。请确认图片来自本地生成结果或浏览器可访问的图片数据。");
  }

  if (!response.ok) {
    throw new Error("无法读取当前参考图。请确认图片文件仍然存在。");
  }

  const blob = await response.blob();
  if (!blob.type.startsWith("image/")) {
    throw new Error("当前参考资源不是可用的图片格式。");
  }
  if (blob.size > MAX_REFERENCE_IMAGE_BYTES) {
    throw new Error("参考图像不能超过 20MB。");
  }

  return {
    dataUrl: await blobToDataUrl(blob),
    fileName: fileNameWithImageExtension(selection.name, blob.type)
  };
}

async function readStoredReferenceImage(assetId: string, signal: AbortSignal): Promise<ReferenceImageInput> {
  const response = await fetch(`/api/assets/${encodeURIComponent(assetId)}`, { signal });
  if (!response.ok) {
    throw new Error("无法读取历史参考图。请确认原始资源仍然存在。");
  }

  const blob = await response.blob();
  if (!blob.type.startsWith("image/")) {
    throw new Error("历史参考资源不是可用的图片格式。");
  }
  if (blob.size > MAX_REFERENCE_IMAGE_BYTES) {
    throw new Error("历史参考图像不能超过 20MB。");
  }

  return {
    dataUrl: await blobToDataUrl(blob),
    fileName: fileNameWithImageExtension(assetId, blob.type)
  };
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message || `生成请求失败，状态 ${response.status}。`;
  } catch {
    return `生成请求失败，状态 ${response.status}。`;
  }
}

function saveStatusLabel(status: SaveStatus): string {
  switch (status) {
    case "loading":
      return "正在载入";
    case "pending":
      return "待保存";
    case "saving":
      return "保存中";
    case "error":
      return "保存失败";
    case "saved":
    default:
      return "已保存";
  }
}

function SaveStatusIcon({ status }: { status: SaveStatus }) {
  if (status === "saving" || status === "loading") {
    return <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />;
  }

  if (status === "error") {
    return <AlertTriangle className="size-3.5" aria-hidden="true" />;
  }

  if (status === "saved") {
    return <CheckCircle2 className="size-3.5" aria-hidden="true" />;
  }

  return <Cloud className="size-3.5" aria-hidden="true" />;
}

export function App() {
  const [prompt, setPrompt] = useState("");
  const [stylePreset, setStylePreset] = useState<StylePresetId>("none");
  const [sizePresetId, setSizePresetId] = useState(SIZE_PRESETS[0].id);
  const [width, setWidth] = useState(SIZE_PRESETS[0].width);
  const [height, setHeight] = useState(SIZE_PRESETS[0].height);
  const [count, setCount] = useState<GenerationCount>(1);
  const [quality, setQuality] = useState<ImageQuality>("auto");
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("png");
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [isProjectLoaded, setIsProjectLoaded] = useState(false);
  const [projectSnapshot, setProjectSnapshot] = useState<PersistedSnapshot | undefined>();
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("loading");
  const [saveError, setSaveError] = useState("");
  const [generationError, setGenerationError] = useState("");
  const [generationMessage, setGenerationMessage] = useState("");
  const [generationHistory, setGenerationHistory] = useState<GenerationRecord[]>([]);
  const [referenceSelection, setReferenceSelection] = useState<ReferenceSelection>({
    status: "none",
    hint: "选择画布中的一张图片后，可用它作为参考生成新图。"
  });
  const editorRef = useRef<Editor | null>(null);
  const generationAbortRef = useRef<AbortController | null>(null);
  const generationRequestRef = useRef(0);
  const saveTimerRef = useRef<number | undefined>();
  const saveRequestRef = useRef(0);

  const trimmedPrompt = prompt.trim();
  const promptValidationMessage = prompt.trim() ? "" : "请输入提示词后再生成。";
  const dimensionValidationMessage = sizeValidationMessage(width, height);
  const validationMessage = promptValidationMessage || dimensionValidationMessage;
  const canGenerate = !validationMessage && !isGenerating;
  const isReferenceReady = referenceSelection.status === "ready";

  const activePreset = useMemo(
    () => SIZE_PRESETS.find((preset) => preset.id === sizePresetId) ?? SIZE_PRESETS[0],
    [sizePresetId]
  );
  const activeSizeLabel = sizePresetId === CUSTOM_SIZE_PRESET_ID ? "自定义尺寸" : sizePresetLabel(activePreset);

  useEffect(() => {
    const controller = new AbortController();

    async function loadProject(): Promise<void> {
      setSaveStatus("loading");
      setSaveError("");

      try {
        const response = await fetch("/api/project", {
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error(`Project load failed with ${response.status}`);
        }

        const project = (await response.json()) as ProjectState;
        if (isPersistedSnapshot(project.snapshot)) {
          setProjectSnapshot(project.snapshot);
        }
        setGenerationHistory(project.history);
        setSaveStatus("saved");
      } catch {
        if (controller.signal.aborted) {
          return;
        }

        setSaveStatus("error");
        setSaveError("无法载入已保存项目，将使用空白画布。");
      } finally {
        if (!controller.signal.aborted) {
          setIsProjectLoaded(true);
        }
      }
    }

    void loadProject();

    return () => {
      controller.abort();
    };
  }, []);

  const handleEditorMount = useCallback((editor: Editor) => {
    editorRef.current = editor;
    const updateReferenceSelection = (): void => {
      setReferenceSelection(resolveReferenceSelection(editor));
    };

    async function saveProject(): Promise<void> {
      const requestId = saveRequestRef.current + 1;
      saveRequestRef.current = requestId;
      setSaveStatus("saving");
      setSaveError("");

      try {
        const response = await fetch("/api/project", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            snapshot: editor.getSnapshot()
          })
        });

        if (!response.ok) {
          throw new Error(`Project save failed with ${response.status}`);
        }

        if (saveRequestRef.current === requestId) {
          setSaveStatus("saved");
        }
      } catch {
        if (saveRequestRef.current === requestId) {
          setSaveStatus("error");
          setSaveError("自动保存失败，当前画布已保留，请稍后继续编辑。");
        }
      }
    }

    const removeListener = editor.store.listen(
      () => {
        window.clearTimeout(saveTimerRef.current);
        setSaveStatus("pending");
        setSaveError("");
        saveTimerRef.current = window.setTimeout(() => {
          void saveProject();
        }, AUTOSAVE_DEBOUNCE_MS);
      },
      {
        source: "user",
        scope: "document"
      }
    );
    const removeReferenceStoreListener = editor.store.listen(updateReferenceSelection, {
      source: "all",
      scope: "all"
    });
    editor.on("change", updateReferenceSelection);
    updateReferenceSelection();

    return () => {
      window.clearTimeout(saveTimerRef.current);
      if (editorRef.current === editor) {
        editorRef.current = null;
      }
      editor.off("change", updateReferenceSelection);
      removeReferenceStoreListener();
      removeListener();
    };
  }, []);

  function selectScenePreset(nextPresetId: string): void {
    if (nextPresetId === CUSTOM_SIZE_PRESET_ID) {
      setSizePresetId(CUSTOM_SIZE_PRESET_ID);
      return;
    }

    const preset = SIZE_PRESETS.find((item) => item.id === nextPresetId);
    if (!preset) {
      return;
    }

    setSizePresetId(preset.id);
    setWidth(preset.width);
    setHeight(preset.height);
  }

  function updateWidth(value: string): void {
    setWidth(normalizeDimension(value));
    setSizePresetId(CUSTOM_SIZE_PRESET_ID);
  }

  function updateHeight(value: string): void {
    setHeight(normalizeDimension(value));
    setSizePresetId(CUSTOM_SIZE_PRESET_ID);
  }

  async function executeGeneration(
    input: GenerationSubmitInput,
    resolveReference?: (signal: AbortSignal) => Promise<GenerationReferenceInput | undefined>
  ): Promise<void> {
    setHasSubmitted(true);
    setGenerationError("");
    setGenerationMessage("");

    const inputValidationMessage = generationValidationMessage(input.prompt, input.size.width, input.size.height);
    if (inputValidationMessage) {
      setGenerationError(inputValidationMessage);
      return;
    }

    const editor = editorRef.current;
    if (!editor) {
      setGenerationError("画布尚未就绪，请稍后再试。");
      return;
    }

    generationAbortRef.current?.abort();
    const controller = new AbortController();
    const requestId = generationRequestRef.current + 1;
    generationRequestRef.current = requestId;
    generationAbortRef.current = controller;
    setIsGenerating(true);

    try {
      const referenceForRequest = await resolveReference?.(controller.signal);
      const requestBody: Record<string, unknown> = {
        prompt: input.prompt.trim(),
        presetId: input.presetId,
        sizePresetId: input.sizePresetId,
        size: input.size,
        quality: input.quality,
        outputFormat: input.outputFormat,
        count: input.count
      };

      if (referenceForRequest) {
        requestBody.referenceImage = referenceForRequest.referenceImage;
        if (referenceForRequest.referenceAssetId) {
          requestBody.referenceAssetId = referenceForRequest.referenceAssetId;
        }
      }

      const response = await fetch(referenceForRequest ? "/api/images/edit" : "/api/images/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const body = (await response.json()) as unknown;
      if (!isGenerationResponse(body)) {
        throw new Error("生成服务返回了无法识别的结果。");
      }

      if (controller.signal.aborted || generationRequestRef.current !== requestId) {
        return;
      }

      setGenerationHistory((history) => [body.record, ...history.filter((record) => record.id !== body.record.id)].slice(0, 20));
      const insertedCount = insertGeneratedImages(editor, body.record);
      const failedCount = body.record.outputs.filter((output) => output.status === "failed").length;
      if (insertedCount > 0) {
        const actionLabel = body.record.mode === "edit" ? "参考生成" : "生成";
        setGenerationMessage(
          failedCount > 0
            ? `${actionLabel}已插入 ${insertedCount} 张图像，${failedCount} 张失败。`
            : `${actionLabel}已插入 ${insertedCount} 张图像。`
        );
      } else {
        setGenerationError(body.record.error || "没有可插入的成功图像。");
      }
    } catch (error) {
      if (controller.signal.aborted || generationRequestRef.current !== requestId) {
        return;
      }

      setGenerationError(error instanceof Error ? error.message : "生成失败，请稍后重试。");
    } finally {
      if (generationRequestRef.current === requestId) {
        setIsGenerating(false);
        generationAbortRef.current = null;
      }
    }
  }

  async function submitGeneration(): Promise<void> {
    const input: GenerationSubmitInput = {
      prompt: trimmedPrompt,
      presetId: stylePreset,
      sizePresetId,
      size: {
        width,
        height
      },
      quality,
      outputFormat,
      count
    };

    await executeGeneration(input, async (signal) => {
      if (referenceSelection.status !== "ready") {
        return undefined;
      }

      return {
        referenceImage: await readReferenceImage(referenceSelection, signal),
        referenceAssetId: referenceSelection.localAssetId
      };
    });
  }

  function locateHistoryRecord(record: GenerationRecord): void {
    setGenerationError("");
    setGenerationMessage("");

    const editor = editorRef.current;
    if (!editor) {
      setGenerationError("画布尚未就绪，请稍后再试。");
      return;
    }

    const shapeId = findCanvasImageShape(editor, record);
    if (!shapeId) {
      setGenerationError("画布上找不到这张历史图片，可能已被删除。");
      return;
    }

    const bounds = editor.getShapePageBounds(shapeId);
    editor.select(shapeId);
    if (bounds) {
      editor.zoomToBounds(bounds, {
        animation: { duration: 220 },
        inset: 96
      });
    } else {
      editor.zoomToSelection({ animation: { duration: 220 } });
    }
    setGenerationMessage("已定位到历史图像。");
  }

  async function rerunHistoryRecord(record: GenerationRecord): Promise<void> {
    const nextPresetId = coerceStylePresetId(record.presetId);
    const nextSizePresetId = sizePresetIdForSize(record.size.width, record.size.height);
    const nextCount = coerceGenerationCount(record.count);

    setPrompt(record.prompt);
    setStylePreset(nextPresetId);
    setSizePresetId(nextSizePresetId);
    setWidth(record.size.width);
    setHeight(record.size.height);
    setQuality(record.quality);
    setOutputFormat(record.outputFormat);
    setCount(nextCount);

    await executeGeneration(
      {
        prompt: record.prompt,
        presetId: nextPresetId,
        sizePresetId: nextSizePresetId,
        size: record.size,
        quality: record.quality,
        outputFormat: record.outputFormat,
        count: nextCount
      },
      record.referenceAssetId
        ? async (signal) => ({
            referenceImage: await readStoredReferenceImage(record.referenceAssetId!, signal),
            referenceAssetId: record.referenceAssetId
          })
        : undefined
    );
  }

  function downloadHistoryRecord(record: GenerationRecord): void {
    const asset = firstDownloadableAsset(record);
    if (!asset) {
      setGenerationError("这条历史记录没有可下载的本地资源。");
      return;
    }

    window.open(`/api/assets/${encodeURIComponent(asset.id)}/download`, "_blank", "noopener,noreferrer");
    setGenerationMessage("已打开原始资源下载。");
  }

  function cancelGeneration(): void {
    generationAbortRef.current?.abort();
    generationRequestRef.current += 1;
    setIsGenerating(false);
    setGenerationMessage("已取消本次生成。");
  }

  const shouldShowValidation = hasSubmitted || !trimmedPrompt || Boolean(dimensionValidationMessage);

  return (
    <main className="relative flex h-dvh min-h-[640px] overflow-hidden bg-neutral-950 pr-[380px] text-neutral-900">
      <section
        className="relative min-w-0 flex-1 bg-neutral-100"
        aria-label="tldraw 创作画布"
        data-testid="canvas-shell"
      >
        {isProjectLoaded ? (
          <Tldraw snapshot={projectSnapshot} onMount={handleEditorMount} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-neutral-500">正在载入画布...</div>
        )}
      </section>

      <aside
        className="fixed inset-y-0 right-0 z-20 flex w-[380px] flex-col border-l border-neutral-200 bg-white shadow-2xl shadow-neutral-950/15"
        data-testid="ai-panel"
      >
        <div className="border-b border-neutral-200 px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-medium text-neutral-500">
              <Sparkles className="size-4 text-blue-600" aria-hidden="true" />
              AI 图像工作台
            </div>
            <div
              className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium ${
                saveStatus === "error" ? "bg-red-50 text-red-700" : "bg-neutral-100 text-neutral-600"
              }`}
              data-testid="save-status"
              role="status"
            >
              <SaveStatusIcon status={saveStatus} />
              {saveStatusLabel(saveStatus)}
            </div>
          </div>
          <h1 className="mt-1 text-xl font-semibold text-neutral-950">专业画布生成</h1>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {saveError ? (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" data-testid="save-error">
              {saveError}
            </p>
          ) : null}

          <label className="block">
            <span className="control-label">提示词</span>
            <textarea
              className="mt-2 h-32 w-full resize-none rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm leading-6 text-neutral-950 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              placeholder="描述画面主体、场景、光线、构图和关键细节"
              value={prompt}
              data-testid="prompt-input"
              onChange={(event) => setPrompt(event.target.value)}
            />
          </label>

          {shouldShowValidation && validationMessage ? (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700" data-testid="validation-message">
              {validationMessage}
            </p>
          ) : null}

          {generationError ? (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" data-testid="generation-error">
              {generationError}
            </p>
          ) : null}

          {generationMessage ? (
            <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700" data-testid="generation-message">
              {generationMessage}
            </p>
          ) : null}

          <section
            className={`rounded-md border px-3 py-3 ${
              isReferenceReady ? "border-blue-200 bg-blue-50 text-blue-800" : "border-neutral-200 bg-neutral-50 text-neutral-600"
            }`}
            data-reference-state={referenceSelection.status}
            data-testid="reference-state"
          >
            <div className="flex items-start gap-2">
              <ImageIcon className={`mt-0.5 size-4 ${isReferenceReady ? "text-blue-600" : "text-neutral-400"}`} aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-sm font-semibold">{isReferenceReady ? "参考生成已启用" : "参考生成未启用"}</p>
                <p className="mt-1 text-xs leading-5" data-testid="reference-hint">
                  {referenceSelection.hint}
                </p>
                {referenceSelection.status === "ready" ? (
                  <p className="mt-2 truncate text-xs font-medium" data-testid="reference-name">
                    {referenceSelection.name} · {Math.round(referenceSelection.width)} x {Math.round(referenceSelection.height)}
                  </p>
                ) : null}
              </div>
            </div>
          </section>

          <label className="block">
            <span className="control-label">风格预设</span>
            <select
              className="field-control"
              value={stylePreset}
              data-testid="style-preset"
              onChange={(event) => setStylePreset(event.target.value as StylePresetId)}
            >
              {STYLE_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {stylePresetLabels[preset.id]}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="control-label">场景尺寸</span>
            <select
              className="field-control"
              value={sizePresetId}
              data-testid="scene-preset"
              onChange={(event) => selectScenePreset(event.target.value)}
            >
              {SIZE_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {sizePresetOptionLabel(preset)}
                </option>
              ))}
              <option value={CUSTOM_SIZE_PRESET_ID}>自定义尺寸</option>
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className="control-label">宽度</span>
              <input
                className="field-control"
                min={MIN_IMAGE_DIMENSION}
                max={MAX_IMAGE_DIMENSION}
                step={1}
                type="number"
                value={Number.isNaN(width) ? "" : width}
                data-testid="custom-width"
                onChange={(event) => updateWidth(event.target.value)}
              />
            </label>
            <label>
              <span className="control-label">高度</span>
              <input
                className="field-control"
                min={MIN_IMAGE_DIMENSION}
                max={MAX_IMAGE_DIMENSION}
                step={1}
                type="number"
                value={Number.isNaN(height) ? "" : height}
                data-testid="custom-height"
                onChange={(event) => updateHeight(event.target.value)}
              />
            </label>
          </div>

          <div>
            <span className="control-label">数量</span>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {GENERATION_COUNTS.map((item) => (
                <button
                  className={item === count ? "segmented-control is-active" : "segmented-control"}
                  key={item}
                  type="button"
                  onClick={() => setCount(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <details className="rounded-md border border-neutral-200 bg-neutral-50">
            <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-3 text-sm font-medium text-neutral-800">
              高级设置
              <ChevronDown className="size-4 text-neutral-500" aria-hidden="true" />
            </summary>
            <div className="space-y-4 border-t border-neutral-200 px-3 py-4">
              <label className="block">
                <span className="control-label">质量</span>
                <select
                  className="field-control"
                  value={quality}
                  data-testid="quality-select"
                  onChange={(event) => setQuality(event.target.value as ImageQuality)}
                >
                  {IMAGE_QUALITIES.map((item) => (
                    <option key={item} value={item}>
                      {qualityLabels[item]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="control-label">输出格式</span>
                <select
                  className="field-control"
                  value={outputFormat}
                  data-testid="format-select"
                  onChange={(event) => setOutputFormat(event.target.value as OutputFormat)}
                >
                  {OUTPUT_FORMATS.map((item) => (
                    <option key={item} value={item}>
                      {formatLabels[item]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </details>

          <div className="rounded-md bg-neutral-100 px-3 py-3 text-xs leading-5 text-neutral-600">
            当前尺寸：{activeSizeLabel}，画布输出 {Number.isNaN(width) ? "-" : width} x{" "}
            {Number.isNaN(height) ? "-" : height}px
          </div>

          <section className="space-y-3" data-testid="generation-history">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-neutral-950">生成历史</h2>
              <span className="text-xs text-neutral-500">{generationHistory.length} 条</span>
            </div>

            {generationHistory.length === 0 ? (
              <p className="rounded-md border border-dashed border-neutral-300 px-3 py-4 text-sm text-neutral-500">
                还没有生成记录。
              </p>
            ) : (
              <div className="space-y-2">
                {generationHistory.map((record) => {
                  const downloadableAsset = firstDownloadableAsset(record);
                  const totalOutputs = record.outputs.length || record.count;

                  return (
                    <article
                      className="rounded-md border border-neutral-200 bg-white px-3 py-3 shadow-sm"
                      data-testid="history-record"
                      key={record.id}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="min-w-0 flex-1 text-sm font-medium leading-5 text-neutral-950">
                          {promptExcerpt(record.prompt)}
                        </p>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                            record.status === "failed" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
                          }`}
                        >
                          {statusLabels[record.status]}
                        </span>
                      </div>

                      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs leading-5 text-neutral-600">
                        <div>
                          <dt className="sr-only">模式</dt>
                          <dd>{modeLabels[record.mode]}</dd>
                        </div>
                        <div>
                          <dt className="sr-only">尺寸</dt>
                          <dd>
                            {record.size.width} x {record.size.height}
                          </dd>
                        </div>
                        <div>
                          <dt className="sr-only">输出数量</dt>
                          <dd>
                            输出 {successfulOutputCount(record)} / {totalOutputs}
                          </dd>
                        </div>
                        <div>
                          <dt className="sr-only">创建时间</dt>
                          <dd>{formatCreatedTime(record.createdAt)}</dd>
                        </div>
                      </dl>

                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <button
                          className="secondary-action h-9 px-2 text-xs"
                          type="button"
                          data-testid="history-locate"
                          onClick={() => locateHistoryRecord(record)}
                        >
                          <MapPin className="size-3.5" aria-hidden="true" />
                          定位
                        </button>
                        <button
                          className="secondary-action h-9 px-2 text-xs"
                          type="button"
                          data-testid="history-rerun"
                          disabled={isGenerating}
                          onClick={() => void rerunHistoryRecord(record)}
                        >
                          <RotateCcw className="size-3.5" aria-hidden="true" />
                          重跑
                        </button>
                        <button
                          className="secondary-action h-9 px-2 text-xs"
                          type="button"
                          data-testid="history-download"
                          disabled={!downloadableAsset}
                          onClick={() => downloadHistoryRecord(record)}
                        >
                          <Download className="size-3.5" aria-hidden="true" />
                          下载
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <div className="grid grid-cols-[1fr_auto] gap-3 border-t border-neutral-200 bg-white px-5 py-4">
          <button
            className="primary-action"
            disabled={!canGenerate}
            type="button"
            data-reference-mode={isReferenceReady ? "edit" : "generate"}
            data-testid="generate-button"
            onClick={submitGeneration}
          >
            {isGenerating ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : isReferenceReady ? (
              <ImageIcon className="size-4" aria-hidden="true" />
            ) : (
              <Square className="size-4" aria-hidden="true" />
            )}
            {isReferenceReady ? "参考生成" : "生成"}
          </button>
          <button className="secondary-action" disabled={!isGenerating} type="button" onClick={cancelGeneration}>
            <XCircle className="size-4" aria-hidden="true" />
            取消
          </button>
        </div>
      </aside>
    </main>
  );
}
