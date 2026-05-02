import type {
  EcommerceBatchGenerateRequest,
  EcommerceBatchJobStatus,
  EcommerceGenerationMode,
  EcommerceMarket,
  EcommercePlatform,
  EcommerceProductBrief,
  EcommerceSceneTemplateId,
  EcommerceTextLanguage,
  GenerationRecord,
  ImageQuality,
  ImageSize,
  OutputFormat,
  StylePresetId
} from "@gpt-image-canvas/shared";

export interface AuthUser {
  id?: string;
  email: string;
  displayName?: string;
  role?: string;
  planId?: string;
  planName?: string;
  planExpiresAt?: string;
  quotaTotal?: number;
  quotaUsed?: number;
  balanceCents?: number;
  currency?: string;
  packageTotal?: number;
  packageUsed?: number;
  packageRemaining?: number;
}

export interface ExtensionAuthState {
  token: string;
  user: AuthUser | null;
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
  textLanguage: EcommerceTextLanguage;
  allowTextRecreation: boolean;
  removeWatermarkAndLogo: boolean;
  sceneTemplateIds: EcommerceSceneTemplateId[];
  sizeMode: "preset" | "source";
  size: ImageSize;
  stylePresetId: StylePresetId;
  quality: ImageQuality;
  outputFormat: OutputFormat;
  countPerScene: 1 | 2 | 4;
  referenceImageUrl: string;
  referenceImageUrls: string[];
  extraDirection: string;
  categoryKit: {
    categoryId: "accessory-scarf";
    kitVersion: "compliance" | "conversion" | "ads";
    scarfSize: string;
    skuCount: string;
    hasPackaging: boolean;
    targetStyle: "commute" | "french" | "luxury" | "travel" | "gift";
    allowModelImages: boolean;
    polishCopy: boolean;
  };
  brandOverlay: {
    enabled: boolean;
    logoDataUrl: string;
    logoFileName: string;
    text: string;
    placement: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  };
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
