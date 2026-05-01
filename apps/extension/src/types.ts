import type {
  EcommerceBatchGenerateRequest,
  EcommerceBatchJobStatus,
  EcommerceGenerationMode,
  EcommerceMarket,
  EcommercePlatform,
  EcommerceProductBrief,
  EcommerceSceneTemplateId,
  GenerationRecord,
  ImageQuality,
  ImageSize,
  OutputFormat,
  StylePresetId
} from "@gpt-image-canvas/shared";

export interface ExtensionSettings {
  apiBaseUrl: string;
  userId: string;
  workspaceId: string;
}

export interface PageContext {
  title: string;
  description: string;
  url: string;
  imageUrls: string[];
}

export interface BatchFormState {
  product: EcommerceProductBrief;
  generationMode: EcommerceGenerationMode;
  platform: EcommercePlatform;
  market: EcommerceMarket;
  sceneTemplateIds: EcommerceSceneTemplateId[];
  size: ImageSize;
  stylePresetId: StylePresetId;
  quality: ImageQuality;
  outputFormat: OutputFormat;
  countPerScene: 1 | 2 | 4;
  referenceImageUrl: string;
  extraDirection: string;
}

export interface BatchTask {
  id: string;
  status: "idle" | EcommerceBatchJobStatus;
  message: string;
  records: GenerationRecord[];
  totalScenes?: number;
  completedScenes?: number;
}

export type BatchRequest = EcommerceBatchGenerateRequest;
