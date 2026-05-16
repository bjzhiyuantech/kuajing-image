import { randomUUID } from "node:crypto";
import type { RequestTenant } from "./auth-context.js";
import type { GenerationResponse, OutputFormat } from "./contracts.js";
import { db } from "./database.js";
import { saveCanvasAsset } from "./image-generation.js";
import { resolveSeedanceVideoConfig } from "./seedance-config.js";
import { generationOutputs, generationRecords } from "./schema.js";

const DEFAULT_POLL_INTERVAL_MS = 15_000;
const DEFAULT_TIMEOUT_MS = 30 * 60_000;
const MAX_PROMPT_LENGTH = 8_000;
const MAX_REFERENCE_IMAGES = 4;

type SeedanceVideoMode = "reference" | "first-last";

interface SeedanceVideoInput {
  duration: number;
  firstFrame?: File;
  generateAudio: boolean;
  lastFrame?: File;
  mode: SeedanceVideoMode;
  model?: string;
  prompt: string;
  ratio: string;
  referenceAudioUrl?: string;
  referenceImages: File[];
  referenceVideoUrl?: string;
  resolution?: string;
  watermark: boolean;
}

export class SeedanceVideoError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "SeedanceVideoError";
    this.code = code;
    this.status = status;
  }
}

export async function createSeedanceVideoGeneration(
  tenant: RequestTenant,
  formData: FormData,
  signal?: AbortSignal
): Promise<GenerationResponse> {
  const input = parseSeedanceFormData(formData);
  const config = await resolveSeedanceVideoConfig();
  if (!config.apiKey) {
    throw new SeedanceVideoError(
      "seedance_api_key_missing",
      "后台未配置 Seedance API Key，请在管理后台的模型页保存火山方舟 ARK API Key。",
      500
    );
  }
  const payload = await buildSeedancePayload(input, config.model);
  const taskUrl = `${config.baseUrl}/contents/generations/tasks`;

  const createResponse = await requestSeedanceJson("POST", taskUrl, config.apiKey, payload, signal);
  const taskId = extractTaskId(createResponse);
  const taskResult = await pollSeedanceTask(`${taskUrl}/${encodeURIComponent(taskId)}`, config.apiKey, signal);
  const videoUrl = extractVideoUrl(taskResult);
  const videoResponse = await downloadSeedanceVideo(videoUrl, signal);
  const videoBytes = Buffer.from(await videoResponse.arrayBuffer());
  const videoSize = resolveVideoSize(input);
  const mimeType = normalizeVideoMimeType(videoResponse.headers.get("content-type"));
  const fileName = `seedance-${safeFileName(taskId)}.${extensionForVideoMimeType(mimeType)}`;
  const asset = await saveCanvasAsset(tenant, {
    bytes: videoBytes,
    fileName,
    mimeType,
    width: videoSize.width,
    height: videoSize.height
  });
  const createdAt = new Date().toISOString();
  const generationId = randomUUID();
  const outputId = randomUUID();
  const outputFormat: OutputFormat = "mp4";

  await db.insert(generationRecords).values({
    id: generationId,
    workspaceId: tenant.workspaceId,
    createdByUserId: tenant.userId,
    productId: null,
    mode: "edit",
    prompt: input.prompt,
    effectivePrompt: input.prompt,
    presetId: "video-seedance",
    width: videoSize.width,
    height: videoSize.height,
    quality: "auto",
    outputFormat,
    count: 1,
    status: "succeeded",
    error: null,
    model: input.model || config.model,
    modelConfigId: null,
    modelProvider: "seedance",
    modelDisplayName: "Seedance 2.0",
    referenceAssetId: null,
    referenceMaskDataUrl: null,
    createdAt
  });

  await db.insert(generationOutputs).values({
    id: outputId,
    workspaceId: tenant.workspaceId,
    generationId,
    status: "succeeded",
    assetId: asset.id,
    error: null,
    createdAt
  });

  return {
    record: {
      id: generationId,
      mode: "edit",
      prompt: input.prompt,
      effectivePrompt: input.prompt,
      presetId: "video-seedance",
      size: videoSize,
      quality: "auto",
      outputFormat,
      count: 1,
      status: "succeeded",
      model: input.model || config.model,
      modelProvider: "seedance",
      modelDisplayName: "Seedance 2.0",
      createdAt,
      outputs: [
        {
          id: outputId,
          status: "succeeded",
          asset
        }
      ]
    }
  };
}

function parseSeedanceFormData(formData: FormData): SeedanceVideoInput {
  const mode = parseMode(formData.get("mode"));
  const prompt = parsePrompt(formData.get("prompt"));
  const firstFrame = imageFileValue(formData.get("first_frame"), "首帧图片");
  const lastFrame = imageFileValue(formData.get("last_frame"), "尾帧图片");
  const referenceImages = [
    ...imageFileValues(formData.getAll("reference_images"), "参考图"),
    ...imageFileValues(formData.getAll("reference_images[]"), "参考图")
  ];

  if (mode === "first-last" && (!firstFrame || !lastFrame)) {
    throw new SeedanceVideoError("invalid_seedance_frames", "请同时上传首帧和尾帧图片。");
  }

  if (mode === "reference" && referenceImages.length === 0) {
    throw new SeedanceVideoError("invalid_seedance_reference_images", "请至少上传一张参考图。");
  }

  if (referenceImages.length > MAX_REFERENCE_IMAGES) {
    throw new SeedanceVideoError("too_many_seedance_reference_images", `参考图最多支持 ${MAX_REFERENCE_IMAGES} 张。`);
  }

  const referenceVideoUrl = parseOptionalHttpUrl(formData.get("reference_video_url"), "参考视频 URL");
  const referenceAudioUrl = parseOptionalHttpUrl(formData.get("reference_audio_url"), "参考音频 URL");

  return {
    duration: parseDuration(formData.get("duration")),
    firstFrame,
    generateAudio: parseBooleanLike(formData.get("generate_audio"), true),
    lastFrame,
    mode,
    model: parseModel(formData.get("model")),
    prompt,
    ratio: parseRatio(formData.get("ratio")),
    referenceAudioUrl,
    referenceImages,
    referenceVideoUrl,
    resolution: parseResolution(formData.get("resolution")),
    watermark: parseBooleanLike(formData.get("watermark"), false)
  };
}

async function buildSeedancePayload(input: SeedanceVideoInput, defaultModel: string): Promise<Record<string, unknown>> {
  const content: Array<Record<string, unknown>> = [
    {
      type: "text",
      text: input.prompt
    }
  ];

  if (input.mode === "first-last") {
    content.push({
      type: "image_url",
      image_url: { url: await fileToDataUrl(input.firstFrame) },
      role: "first_frame"
    });
    content.push({
      type: "image_url",
      image_url: { url: await fileToDataUrl(input.lastFrame) },
      role: "last_frame"
    });
  } else {
    for (const referenceImage of input.referenceImages) {
      content.push({
        type: "image_url",
        image_url: { url: await fileToDataUrl(referenceImage) },
        role: "reference_image"
      });
    }
  }

  if (input.referenceVideoUrl) {
    content.push({
      type: "video_url",
      video_url: { url: input.referenceVideoUrl },
      role: "reference_video"
    });
  }

  if (input.referenceAudioUrl) {
    content.push({
      type: "audio_url",
      audio_url: { url: input.referenceAudioUrl },
      role: "reference_audio"
    });
  }

  const payload: Record<string, unknown> = {
    model: input.model || defaultModel,
    content,
    generate_audio: input.generateAudio,
    ratio: input.ratio,
    duration: input.duration,
    watermark: input.watermark
  };
  if (input.resolution) {
    payload.resolution = input.resolution;
  }
  return payload;
}

async function requestSeedanceJson(
  method: "GET" | "POST",
  url: string,
  apiKey: string,
  payload?: Record<string, unknown>,
  signal?: AbortSignal
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(payload ? { "Content-Type": "application/json" } : {})
      },
      body: payload ? JSON.stringify(payload) : undefined,
      signal
    });
  } catch (error) {
    throw new SeedanceVideoError("seedance_request_failed", `Seedance 请求失败：${errorToMessage(error)}`, 502);
  }

  if (!response.ok) {
    const detail = await readResponseError(response, "Seedance 服务返回错误。");
    throw new SeedanceVideoError("seedance_api_error", `Seedance 服务返回错误：${detail}`, upstreamStatus(response.status));
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new SeedanceVideoError("seedance_invalid_json", "Seedance 服务返回了无法解析的 JSON。", 502);
  }

  if (!isRecord(body)) {
    throw new SeedanceVideoError("seedance_invalid_response", "Seedance 服务返回了非预期的数据结构。", 502);
  }

  return body;
}

async function pollSeedanceTask(taskUrl: string, apiKey: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
  const deadline = Date.now() + DEFAULT_TIMEOUT_MS;
  let lastResponse: Record<string, unknown> | undefined;

  while (Date.now() < deadline) {
    lastResponse = await requestSeedanceJson("GET", taskUrl, apiKey, undefined, signal);
    const status = extractStatus(lastResponse);
    if (status === "succeeded") {
      return lastResponse;
    }
    if (status === "failed") {
      throw new SeedanceVideoError("seedance_task_failed", `Seedance 任务失败：${extractError(lastResponse)}`, 502);
    }
    await sleep(DEFAULT_POLL_INTERVAL_MS, signal);
  }

  throw new SeedanceVideoError(
    "seedance_task_timeout",
    `Seedance 任务超时${lastResponse ? `，最后状态：${extractStatus(lastResponse)}` : "。"}。`,
    504
  );
}

async function downloadSeedanceVideo(videoUrl: string, signal?: AbortSignal): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(videoUrl, {
      headers: {
        "User-Agent": "kuajing-image-seedance-video/1.0"
      },
      signal
    });
  } catch (error) {
    throw new SeedanceVideoError("seedance_video_download_failed", `视频下载失败：${errorToMessage(error)}`, 502);
  }

  if (!response.ok) {
    const detail = await readResponseError(response, "视频下载失败。");
    throw new SeedanceVideoError("seedance_video_download_failed", `视频下载失败：${detail}`, upstreamStatus(response.status));
  }

  return response;
}

async function fileToDataUrl(file: File | undefined): Promise<string> {
  if (!file) {
    throw new SeedanceVideoError("missing_seedance_image", "缺少生成视频所需的图片。");
  }

  const mimeType = file.type && file.type.startsWith("image/") ? file.type : "image/png";
  const buffer = Buffer.from(await file.arrayBuffer());
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

function parseMode(value: FormDataEntryValue | null): SeedanceVideoMode {
  const normalized = stringEntry(value)?.replace(/_/gu, "-") || "reference";
  if (normalized === "reference" || normalized === "first-last") {
    return normalized;
  }
  throw new SeedanceVideoError("invalid_seedance_mode", "视频生成模式必须是参考图或首尾帧。");
}

function parsePrompt(value: FormDataEntryValue | null): string {
  const prompt = stringEntry(value);
  if (!prompt) {
    throw new SeedanceVideoError("invalid_seedance_prompt", "请输入视频提示词。");
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    throw new SeedanceVideoError("invalid_seedance_prompt", `视频提示词不能超过 ${MAX_PROMPT_LENGTH} 个字符。`);
  }
  return prompt;
}

function parseModel(value: FormDataEntryValue | null): string | undefined {
  const model = stringEntry(value);
  if (!model) {
    return undefined;
  }
  if (model.length > 160) {
    throw new SeedanceVideoError("invalid_seedance_model", "Seedance 模型名称过长。");
  }
  return model;
}

function parseRatio(value: FormDataEntryValue | null): string {
  const ratio = stringEntry(value) || "16:9";
  if (!/^\d{1,2}:\d{1,2}$/u.test(ratio)) {
    throw new SeedanceVideoError("invalid_seedance_ratio", "视频比例格式必须类似 16:9 或 9:16。");
  }
  return ratio;
}

function parseDuration(value: FormDataEntryValue | null): number {
  const rawValue = stringEntry(value);
  if (!rawValue) {
    return 11;
  }
  const duration = Number.parseInt(rawValue, 10);
  if (!Number.isSafeInteger(duration) || duration <= 0 || duration > 60) {
    throw new SeedanceVideoError("invalid_seedance_duration", "视频时长必须是 1 到 60 秒之间的整数。");
  }
  return duration;
}

function parseResolution(value: FormDataEntryValue | null): string | undefined {
  const resolution = stringEntry(value);
  if (!resolution || resolution === "auto") {
    return undefined;
  }
  const normalized = resolution.toLowerCase();
  if (/^(?:480p|720p|1080p|2k|4k)$/u.test(normalized)) {
    return normalized;
  }
  throw new SeedanceVideoError("invalid_seedance_resolution", "视频清晰度必须是自动、480p、720p、1080p、2k 或 4k。");
}

function parseBooleanLike(value: FormDataEntryValue | null, defaultValue: boolean): boolean {
  const normalized = stringEntry(value)?.toLowerCase();
  if (!normalized) {
    return defaultValue;
  }
  if (["1", "true", "yes", "y", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "n", "off"].includes(normalized)) {
    return false;
  }
  return defaultValue;
}

function resolveVideoSize(input: SeedanceVideoInput): { width: number; height: number } {
  const [ratioWidth = 16, ratioHeight = 9] = input.ratio.split(":").map((value) => Number.parseInt(value, 10));
  const safeRatioWidth = Number.isFinite(ratioWidth) && ratioWidth > 0 ? ratioWidth : 16;
  const safeRatioHeight = Number.isFinite(ratioHeight) && ratioHeight > 0 ? ratioHeight : 9;
  const longEdge = resolutionToLongEdge(input.resolution);
  const landscape = safeRatioWidth >= safeRatioHeight;
  const aspect = safeRatioWidth / safeRatioHeight;

  if (landscape) {
    return {
      width: evenDimension(longEdge),
      height: evenDimension(longEdge / aspect)
    };
  }

  return {
    width: evenDimension(longEdge * aspect),
    height: evenDimension(longEdge)
  };
}

function resolutionToLongEdge(resolution: string | undefined): number {
  switch (resolution) {
    case "480p":
      return 854;
    case "720p":
      return 1280;
    case "1080p":
      return 1920;
    case "2k":
      return 2560;
    case "4k":
      return 3840;
    default:
      return 1280;
  }
}

function evenDimension(value: number): number {
  const rounded = Math.max(2, Math.round(value));
  return rounded % 2 === 0 ? rounded : rounded + 1;
}

function normalizeVideoMimeType(value: string | null): string {
  const mimeType = value?.split(";")[0]?.trim().toLowerCase();
  return mimeType && mimeType.startsWith("video/") ? mimeType : "video/mp4";
}

function extensionForVideoMimeType(mimeType: string): string {
  switch (mimeType) {
    case "video/webm":
      return "webm";
    case "video/quicktime":
      return "mov";
    case "video/mp4":
    default:
      return "mp4";
  }
}

function imageFileValue(value: FormDataEntryValue | null, label: string): File | undefined {
  if (value === null) {
    return undefined;
  }
  if (!(value instanceof File)) {
    throw new SeedanceVideoError("invalid_seedance_image", `${label}必须是图片文件。`);
  }
  if (!value.type.startsWith("image/")) {
    throw new SeedanceVideoError("invalid_seedance_image", `${label}必须是 PNG、JPG 或 WebP 图片。`);
  }
  return value;
}

function imageFileValues(values: FormDataEntryValue[], label: string): File[] {
  return values.map((value, index) => imageFileValue(value, `${label}${index + 1}`)).filter((file): file is File => Boolean(file));
}

function parseOptionalHttpUrl(value: FormDataEntryValue | null, label: string): string | undefined {
  const url = stringEntry(value);
  if (!url) {
    return undefined;
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
  } catch {
    // Fall through to the user-facing error below.
  }
  throw new SeedanceVideoError("invalid_seedance_media_url", `${label}必须是 HTTP(S) URL。`);
}

function stringEntry(value: FormDataEntryValue | null): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function extractTaskId(response: Record<string, unknown>): string {
  const taskId = firstValueForKeys(response, new Set(["id", "task_id", "taskId"]));
  if (typeof taskId === "string" && taskId.trim()) {
    return taskId.trim();
  }
  throw new SeedanceVideoError("seedance_task_id_missing", "Seedance 创建任务响应中没有 task id。", 502);
}

function extractStatus(response: Record<string, unknown>): string {
  const status = firstValueForKeys(response, new Set(["status", "task_status", "taskStatus"]));
  return typeof status === "string" && status.trim() ? status.trim().toLowerCase() : "unknown";
}

function extractError(response: Record<string, unknown>): string {
  const error = firstValueForKeys(response, new Set(["error", "message", "msg"]));
  if (isRecord(error) || Array.isArray(error)) {
    return JSON.stringify(error).slice(0, 800);
  }
  return error ? String(error).slice(0, 800) : JSON.stringify(response).slice(0, 800);
}

function extractVideoUrl(response: Record<string, unknown>): string {
  const content = response.content;
  if (isRecord(content)) {
    const videoUrl = content.video_url;
    if (typeof videoUrl === "string" && videoUrl.trim()) {
      return videoUrl.trim();
    }
    if (isRecord(videoUrl) && typeof videoUrl.url === "string" && videoUrl.url.trim()) {
      return videoUrl.url.trim();
    }
  }

  const videoUrl = firstValueForKeys(response, new Set(["video_url", "file_url"]));
  if (typeof videoUrl === "string" && videoUrl.trim()) {
    return videoUrl.trim();
  }
  if (isRecord(videoUrl) && typeof videoUrl.url === "string" && videoUrl.url.trim()) {
    return videoUrl.url.trim();
  }
  throw new SeedanceVideoError("seedance_video_url_missing", "Seedance 任务成功，但响应中没有视频 URL。", 502);
}

function firstValueForKeys(value: unknown, keys: Set<string>): unknown {
  if (isRecord(value)) {
    for (const key of keys) {
      const found = value[key];
      if (found) {
        return found;
      }
    }
    for (const child of Object.values(value)) {
      const found = firstValueForKeys(child, keys);
      if (found) {
        return found;
      }
    }
  } else if (Array.isArray(value)) {
    for (const child of value) {
      const found = firstValueForKeys(child, keys);
      if (found) {
        return found;
      }
    }
  }
  return undefined;
}

async function readResponseError(response: Response, fallback: string): Promise<string> {
  const body = (await response.text()).trim();
  if (!body) {
    return `${fallback}（HTTP ${response.status}）`;
  }
  try {
    const parsed = JSON.parse(body) as unknown;
    if (isRecord(parsed)) {
      const error = parsed.error;
      if (isRecord(error) && typeof error.message === "string") {
        return `${error.message}（HTTP ${response.status}）`;
      }
      if (typeof parsed.message === "string") {
        return `${parsed.message}（HTTP ${response.status}）`;
      }
    }
  } catch {
    // Keep the raw response body below.
  }
  return `${body.slice(0, 800)}（HTTP ${response.status}）`;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(new DOMException("Seedance generation was aborted.", "AbortError"));
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    const abort = (): void => {
      clearTimeout(timer);
      reject(new DOMException("Seedance generation was aborted.", "AbortError"));
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

function safeFileName(value: string): string {
  const safe = value.replace(/[^a-zA-Z0-9._-]/gu, "_");
  return safe || "video";
}

function upstreamStatus(status: number): number {
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : 502;
}

function errorToMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "请求失败";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
