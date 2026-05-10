import { randomUUID } from "node:crypto";
import type {
  DemoCanvasConfigResponse,
  DemoCanvasExample,
  ImageQuality,
  OutputFormat,
  SaveDemoCanvasConfigRequest,
  StylePresetId
} from "./contracts.js";
import { DEMO_CANVAS_SETTINGS_KEY, getSystemSetting, saveSystemSetting } from "./system-settings.js";

const MAX_DEMO_CANVAS_EXAMPLES = 20;

const stylePresetIds = new Set<StylePresetId>(["none", "photoreal", "product", "illustration", "poster", "avatar"]);
const imageQualities = new Set<ImageQuality>(["auto", "low", "medium", "high"]);
const outputFormats = new Set<OutputFormat>(["png", "jpeg", "webp"]);

export async function getDemoCanvasConfig(): Promise<DemoCanvasConfigResponse> {
  const row = await getSystemSetting(DEMO_CANVAS_SETTINGS_KEY);
  const parsed = parseConfig(row?.valueJson);
  return {
    examples: parsed.examples.filter((example) => example.enabled !== false).sort(compareDemoExamples),
    updatedAt: row?.updatedAt
  };
}

export async function getAdminDemoCanvasConfig(): Promise<DemoCanvasConfigResponse> {
  const row = await getSystemSetting(DEMO_CANVAS_SETTINGS_KEY);
  const parsed = parseConfig(row?.valueJson);
  return {
    examples: parsed.examples.sort(compareDemoExamples),
    updatedAt: row?.updatedAt
  };
}

export async function saveDemoCanvasConfig(input: SaveDemoCanvasConfigRequest): Promise<DemoCanvasConfigResponse> {
  const examples = input.examples.slice(0, MAX_DEMO_CANVAS_EXAMPLES).map((example, index) => normalizeExample(example, index));
  await saveSystemSetting(DEMO_CANVAS_SETTINGS_KEY, { examples });
  return getAdminDemoCanvasConfig();
}

function parseConfig(valueJson: string | undefined): DemoCanvasConfigResponse {
  if (!valueJson) {
    return { examples: [] };
  }

  try {
    const parsed = JSON.parse(valueJson) as unknown;
    const examples = isRecord(parsed) && Array.isArray(parsed.examples) ? parsed.examples : Array.isArray(parsed) ? parsed : [];
    return {
      examples: examples.filter(isRecord).map((example, index) => normalizeExample(example as Partial<DemoCanvasExample>, index))
    };
  } catch {
    return { examples: [] };
  }
}

function normalizeExample(input: Partial<DemoCanvasExample>, index: number): DemoCanvasExample {
  const now = new Date().toISOString();
  return {
    id: normalizeString(input.id, 64) || randomUUID(),
    title: normalizeString(input.title, 80) || `画布案例 ${index + 1}`,
    category: normalizeString(input.category, 40) || "演示案例",
    beforeLabel: normalizeString(input.beforeLabel, 40) || "修改前",
    afterLabel: normalizeString(input.afterLabel, 40) || "修改后",
    brief: normalizeString(input.brief, 180) || "展示修改前后的效果对比。",
    prompt: normalizeString(input.prompt, 1000) || "根据参考图生成适合电商展示的图片。",
    presetId: normalizeStylePreset(input.presetId),
    size: normalizeSize(input.size),
    quality: normalizeQuality(input.quality),
    outputFormat: normalizeOutputFormat(input.outputFormat),
    createdAt: normalizeString(input.createdAt, 32) || now,
    beforeUrl: normalizeString(input.beforeUrl, 4000),
    afterUrl: normalizeString(input.afterUrl, 4000),
    enabled: input.enabled !== false,
    sortOrder: normalizeSortOrder(input.sortOrder, index)
  };
}

function compareDemoExamples(a: DemoCanvasExample, b: DemoCanvasExample): number {
  return (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.createdAt.localeCompare(b.createdAt);
}

function normalizeString(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizeStylePreset(value: unknown): StylePresetId {
  return typeof value === "string" && stylePresetIds.has(value as StylePresetId) ? (value as StylePresetId) : "product";
}

function normalizeQuality(value: unknown): ImageQuality {
  return typeof value === "string" && imageQualities.has(value as ImageQuality) ? (value as ImageQuality) : "auto";
}

function normalizeOutputFormat(value: unknown): OutputFormat {
  return typeof value === "string" && outputFormats.has(value as OutputFormat) ? (value as OutputFormat) : "png";
}

function normalizeSize(size: unknown): DemoCanvasExample["size"] {
  const record = isRecord(size) ? size : {};
  const width = normalizeDimension(record.width, 1024);
  const height = normalizeDimension(record.height, 1024);
  return { width, height };
}

function normalizeDimension(value: unknown, fallback: number): number {
  const numericValue = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isInteger(numericValue) && numericValue >= 256 && numericValue <= 4096 ? numericValue : fallback;
}

function normalizeSortOrder(value: unknown, index: number): number {
  const numericValue = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isInteger(numericValue) && numericValue >= 0 && numericValue <= 9999 ? numericValue : index * 10;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
