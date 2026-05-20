export {
  CUSTOM_SIZE_PRESET_ID,
  ECOMMERCE_AUTO_CATEGORY_KIT_SCENE_IDS,
  ECOMMERCE_DETAIL_CATEGORY_KIT_SCENE_IDS,
  ECOMMERCE_SCENE_TEMPLATES,
  ECOMMERCE_MARKETS,
  ECOMMERCE_PLATFORMS,
  ECOMMERCE_TEXT_LANGUAGES,
  GENERATION_COUNTS,
  IMAGE_MODEL,
  IMAGE_QUALITIES,
  MAX_IMAGE_DIMENSION,
  MIN_IMAGE_DIMENSION,
  OUTPUT_FORMATS,
  SIZE_PRESETS,
  STYLE_PRESETS,
  composeEcommercePrompt,
  composePrompt,
  sizeToApiValue,
  validateImageSize,
  validateSceneImageSize
} from "@gpt-image-canvas/shared";

export type InvoiceApplicationStatus = "pending" | "processing" | "issued" | "rejected";

export interface InvoiceApplicationProfile {
  headerType: "company" | "personal";
  title: string;
  taxNumber?: string;
  invoiceContent: string;
  amountCents: number;
  email: string;
  phone?: string;
  companyAddress?: string;
  bankName?: string;
  bankAccount?: string;
  remark?: string;
}

export interface InvoiceApplicationRecord extends InvoiceApplicationProfile {
  id: string;
  userId?: string;
  userEmail?: string;
  userDisplayName?: string;
  invoiceType: "electronic";
  status: InvoiceApplicationStatus;
  handledByUserId?: string;
  handledAt?: string;
  reviewNote?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceSummary {
  currency: string;
  paidAmountCents: number;
  issuedAmountCents: number;
  reservedAmountCents: number;
  availableAmountCents: number;
  requestableAmountCents: number;
}

export interface InvoiceApplicationsResponse {
  summary: InvoiceSummary;
  profile?: InvoiceApplicationRecord;
  applications: InvoiceApplicationRecord[];
}

export interface ApplyInvoiceRequest extends InvoiceApplicationProfile {}

export interface UpdateInvoiceApplicationRequest {
  status: InvoiceApplicationStatus;
  reviewNote?: string;
}

export type {
  AppConfig,
  AdminAssetItem,
  AdminAssetsResponse,
  AdminAlipayConfigResponse,
  AppReleaseConfig,
  AppReleaseTargetConfig,
  AppReleasePlatform,
  AdminBillingSettingsResponse,
  AdminHelpCenterResponse,
  AdminInviteRewardSettingsResponse,
  AdminCreateRedemptionCodesRequest,
  AdminRedemptionCode,
  AdminRedemptionCodesResponse,
  AdminAdjustBalanceRequest,
  AdminPlansResponse,
  AdminStatsResponse,
  AdminWechatMiniAppConfigResponse,
  AppNotification,
  AppNotificationListResponse,
  AppNotificationSeverity,
  AppNotificationType,
  AdminUserItem,
  AdminUsersResponse,
  BrandOverlayPlacement,
  AssetCloudUploadStatus,
  AuthMeResponse,
  AuthResponse,
  AuthUser,
  AuthWorkspace,
  BillingOrder,
  BillingOrdersResponse,
  BillingPlan,
  BillingSettings,
  BillingSummaryResponse,
  BillingTransaction,
  BillingTransactionsResponse,
  CategoryKitPlannerConfigEntry,
  CloudStorageProvider,
  CategoryKitPlannerConfigResponse,
  CategoryKitPlannerModule,
  CategoryKitPlannerModelRole,
  CategoryKitPlannerProvider,
  EcommerceBatchGenerateRequest,
  EcommerceBatchReferenceImage,
  EcommerceBatchGenerateResponse,
  EcommerceBatchJobStatus,
  EcommerceCategoryKitAssetInput,
  EcommerceCategoryKitImageRole,
  EcommerceCategoryKitMissingInput,
  EcommerceCategoryKitOutputScene,
  EcommerceCategoryKitPlanItem,
  EcommerceCategoryKitPlanRequest,
  EcommerceCategoryKitPlanResponse,
  EcommerceCategoryKitPreparationResponse,
  EcommerceCategoryKitStrategy,
  EcommerceCategoryKitStrategyField,
  EcommerceGenerationConcurrencyConfigResponse,
  EcommerceJobListResponse,
  EcommerceJobSummary,
  EcommerceMarket,
  EcommercePlatform,
  EcommerceProductBrief,
  EcommerceSceneTemplateId,
  EcommerceTextLanguage,
  EcommerceStatsResponse,
  EditImageRequest,
  DemoCanvasConfigResponse,
  DemoCanvasExample,
  DemoCanvasAssetUploadResponse,
  ExtensionReleaseConfig,
  ExtensionReleaseTargetConfig,
  GenerateImageRequest,
  GeneratedAsset,
  GeneratedAssetCloudInfo,
  GalleryImageItem,
  GalleryResponse,
  GenerationCount,
  GenerationOutput,
  GenerationRecord,
  GenerationResponse,
  GenerationStatus,
  HelpArticle,
  HelpArticleStatus,
  HelpAssetUploadResponse,
  HelpCategory,
  HelpCenterResponse,
  HelpContentBlock,
  ImageMode,
  ImageQuality,
  ImageSize,
  ImageSizePresetId,
  ImageSizeValidationResult,
  OutputFormat,
  OutputStatus,
  Plan,
  PromptOptimizeRequest,
  PromptOptimizeResponse,
  ProjectState,
  ReferenceImageInput,
  SeedanceVideoStoryboardFramePrompt,
  SeedanceVideoStoryboardPlanRequest,
  SeedanceVideoStoryboardPlanResponse,
  SeedanceVideoStoryboardScene,
  CreateAlipayRechargeRequest,
  CreatePaymentResponse,
  PurchasePlanRequest,
  VerifyAppleInAppPurchaseRequest,
  RedemptionCodeRedeemRequest,
  RedemptionCodeRedeemResponse,
  RedemptionCodeStatus,
  InviteSummaryResponse,
  InviteRewardSettings,
  NotificationChannel,
  NotificationClientConfig,
  NotificationDevicePlatform,
  NotificationDeviceRegisterRequest,
  NotificationPayload,
  SaveAlipayConfigRequest,
  SaveAppReleaseConfigRequest,
  SaveAppReleaseTargetConfig,
  SaveBillingSettingsRequest,
  SaveCategoryKitPlannerConfigEntry,
  SaveCategoryKitPlannerConfigRequest,
  SaveEcommerceGenerationConcurrencyConfigRequest,
  SaveDemoCanvasConfigRequest,
  SaveHelpArticleRequest,
  SaveHelpCategoryRequest,
  SaveInviteRewardSettingsRequest,
  SaveSeedanceVideoConfigRequest,
  SaveStorageConfigRequest,
  SaveWechatMiniAppConfigRequest,
  SeedanceVideoConfigResponse,
  SeedanceVideoConfigSource,
  SizePreset,
  StorageConfigResponse,
  StorageTestResult,
  StylePresetId,
  UserRole,
  UpdateAuthProfileRequest,
  ValidationResult,
  WechatMiniAppBindRequest,
  WechatMiniAppConfigResponse,
  WechatMiniAppLoginRequest,
  WechatMiniAppLoginResponse,
  WechatMiniAppRegisterRequest
} from "@gpt-image-canvas/shared";
