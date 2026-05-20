const api = require("../../utils/api");
const { fileToDataUrl } = require("../../utils/image");
const { LANGUAGES, MARKETS, PLATFORMS, SCENES } = require("../../utils/constants");

const MODES = [
  { id: "custom", title: "自由创作", desc: "只写提示词也能生成，可选上传参考图控制主体、风格或构图。", icon: "写" },
  { id: "enhance", title: "原图增强", desc: "保留商品原貌，生成卖点文字和电商排版。", icon: "✨" },
  { id: "creative", title: "场景创作", desc: "依据主图生成生活方式、模特穿戴和搭配场景。", icon: "🎬" },
  { id: "category-kit", title: "品类套图", desc: "上传参考图和描述，自动拆解整套 Listing Image Kit。", icon: "📦" },
  { id: "single-poster", title: "单品完整海报", desc: "依据产品图自动提炼卖点，生成一张高比例详情长海报。", icon: "长" },
  { id: "one-click-replace", title: "一键换装/换品", desc: "前面上传模特或场景，最后 1 张上传要换的衣服或商品。", icon: "换" },
  { id: "text-translation", title: "文字翻译", desc: "逐张翻译图片文字，可选择目标语言和是否二创。", icon: "译" }
];

const MODE_SCENES = {
  custom: ["lifestyle"],
  enhance: ["marketplace-main", "logo-benefit", "feature-benefit", "promo-poster"],
  creative: ["lifestyle", "model-wear", "accessory-match", "seasonal-campaign", "social-ad"],
  "category-kit": [
    "category-kit-auto-main",
    "category-kit-auto-hero",
    "category-kit-auto-overview",
    "category-kit-auto-benefits",
    "category-kit-auto-detail",
    "category-kit-auto-structure",
    "category-kit-auto-guide",
    "category-kit-auto-package",
    "category-kit-auto-usage",
    "category-kit-auto-lifestyle",
    "category-kit-auto-audience",
    "category-kit-auto-trust"
  ],
  "single-poster": ["single-product-long-poster"],
  "one-click-replace": ["one-click-replace"],
  "text-translation": ["text-translation"]
};

const PRESET_TO_MODE = {
  category: "category-kit",
  custom: "custom",
  freestyle: "custom",
  launch: "enhance",
  localize: "text-translation",
  replace: "one-click-replace",
  scene: "creative",
  translate: "text-translation",
  watermark: "enhance"
};

const SIZE_OPTIONS = [
  { id: "square-1k", label: "方图 1:1", width: 1024, height: 1024 },
  { id: "ozon-3-4", label: "Ozon 3:4", width: 1536, height: 2048 },
  { id: "poster-landscape", label: "横版 3:2", width: 1536, height: 1024 },
  { id: "poster-portrait", label: "竖版 2:3", width: 1024, height: 1536 },
  { id: "story-9-16", label: "短视频 9:16", width: 1088, height: 1920 },
  { id: "ecommerce-long-poster", label: "电商长海报", width: 1024, height: 3072 }
];

const TEMPLATE_KEY = "productInfoTemplate";
const CATEGORY_KEY = "selectedCategoryKitId";
const RECENT_CREATED_JOBS_KEY = "recentCreatedJobs";
const DEFAULT_PLATFORM_INDEX = PLATFORMS.findIndex((item) => item.id === "taobao");
const DEFAULT_MARKET_INDEX = MARKETS.findIndex((item) => item.id === "cn");
const RUSSIA_MARKET_INDEX = MARKETS.findIndex((item) => item.id === "ru");
const OZON_SIZE_INDEX = SIZE_OPTIONS.findIndex((item) => item.id === "ozon-3-4");
const CHINESE_PLATFORM_IDS = new Set(["1688", "taobao", "tmall", "jd", "douyin", "pinduoduo", "xiaohongshu", "kuaishou", "weidian", "dewu"]);

const CATEGORY_KITS = [
  {
    id: "auto-category-kit",
    title: "AI 自动品类套图",
    desc: "按参考图、描述、平台和市场自动拆解 Listing Image Kit",
    status: "已支持",
    sceneIds: MODE_SCENES["category-kit"]
  }
];

function initialScenes(mode) {
  const defaults = MODE_SCENES[mode] || MODE_SCENES.enhance;
  return SCENES.map((item) => ({ ...item, active: defaults.includes(item.id), visible: defaults.includes(item.id) }));
}

function categoryScenes(categoryId) {
  const category = CATEGORY_KITS.find((item) => item.id === categoryId) || CATEGORY_KITS[0];
  return SCENES.map((item) => ({ ...item, active: category.sceneIds.includes(item.id), visible: category.sceneIds.includes(item.id) }));
}

Page({
  data: {
    advancedOpen: false,
    activeSceneCount: 4,
    brandOverlayEnabled: false,
    color: "",
    countIndex: 0,
    countLabels: ["1 张", "2 张", "4 张"],
    countPerScene: 1,
    description: "",
    extraDirection: "",
    hasTemplate: false,
    images: [],
    imageLimit: 3,
    languageIndex: 2,
    languageLabels: LANGUAGES.map((item) => item.label),
    marketIndex: DEFAULT_MARKET_INDEX >= 0 ? DEFAULT_MARKET_INDEX : 0,
    marketLabels: MARKETS.map((item) => item.label),
    material: "",
    mode: "enhance",
    modeDesc: (MODES.find((item) => item.id === "enhance") || MODES[0]).desc,
    modes: MODES.map((item) => ({ ...item, active: item.id === "enhance" })),
    platformIndex: DEFAULT_PLATFORM_INDEX >= 0 ? DEFAULT_PLATFORM_INDEX : 0,
    platformLabels: PLATFORMS.map((item) => item.label),
    removeWatermarkAndLogo: true,
    scenes: initialScenes("enhance"),
    selectedCategoryId: CATEGORY_KITS[0].id,
    selectedCategoryTitle: CATEGORY_KITS[0].title,
    categoryKits: CATEGORY_KITS.map((item, index) => ({ ...item, active: index === 0 })),
    sizeIndex: 0,
    sizeLabels: SIZE_OPTIONS.map((item) => item.label),
    sku: "",
    submitting: false,
    targetCustomer: "",
    title: "",
    usageScene: ""
  },

  onLoad() {
    const selectedCategoryId = wx.getStorageSync(CATEGORY_KEY) || CATEGORY_KITS[0].id;
    this.applyCategory(selectedCategoryId, false);
    this.setData({ hasTemplate: Boolean(wx.getStorageSync(TEMPLATE_KEY)) });
  },

  onShow() {
    const preset = wx.getStorageSync("createPreset");
    if (preset) {
      wx.removeStorageSync("createPreset");
      this.applyPreset(preset);
    }
    const prompt = wx.getStorageSync("createPrompt");
    if (prompt) {
      wx.removeStorageSync("createPrompt");
      this.applyPrompt(prompt);
    }
  },

  applyPreset(preset) {
    this.changeMode(PRESET_TO_MODE[preset] || "enhance");
  },

  applyPrompt(prompt) {
    const nextPrompt = String(prompt || "").trim();
    if (!nextPrompt) return;
    this.setData({
      description: this.data.description || nextPrompt,
      extraDirection: this.data.extraDirection || nextPrompt
    });
  },

  selectMode(event) {
    this.changeMode(event.currentTarget.dataset.id);
  },

  changeMode(mode) {
    const modeMeta = MODES.find((item) => item.id === mode) || MODES[0];
    const languageIndex = mode === "text-translation" ? Math.max(1, this.data.languageIndex) : this.data.languageIndex;
    const scenes = mode === "category-kit" ? categoryScenes(this.data.selectedCategoryId) : initialScenes(mode);
    const patch = {
      activeSceneCount: scenes.filter((item) => item.active && item.visible).length,
      languageIndex,
      mode,
      modeDesc: modeMeta.desc,
      modes: MODES.map((item) => ({ ...item, active: item.id === mode })),
      scenes,
      imageLimit: mode === "one-click-replace" ? 9 : mode === "custom" ? 4 : 3,
      images: mode === "one-click-replace" ? this.data.images.slice(0, 9) : mode === "custom" ? this.data.images.slice(0, 4) : this.data.images.slice(0, 3)
    };
    if (mode === "single-poster" || mode === "category-kit" || mode === "one-click-replace") {
      const longPosterSizeIndex = SIZE_OPTIONS.findIndex((item) => item.id === "ecommerce-long-poster");
      patch.countIndex = 0;
      patch.countPerScene = 1;
      if (mode === "single-poster" && longPosterSizeIndex >= 0) {
        patch.sizeIndex = longPosterSizeIndex;
      }
    }
    this.setData(patch);
  },

  selectCategory(event) {
    this.applyCategory(event.currentTarget.dataset.id, true);
  },

  applyCategory(categoryId, shouldPersist) {
    const selected = CATEGORY_KITS.find((item) => item.id === categoryId) || CATEGORY_KITS[0];
    const scenes = categoryScenes(selected.id);
    if (shouldPersist) {
      wx.setStorageSync(CATEGORY_KEY, selected.id);
      wx.showToast({ title: `已选择${selected.title}`, icon: "none" });
    }
    const patch = {
      categoryKits: CATEGORY_KITS.map((item) => ({ ...item, active: item.id === selected.id })),
      selectedCategoryId: selected.id,
      selectedCategoryTitle: selected.title
    };
    if (this.data.mode === "category-kit") {
      patch.activeSceneCount = scenes.filter((item) => item.active && item.visible).length;
      patch.scenes = scenes;
    }
    this.setData(patch);
  },

  chooseImages() {
    const maxImageCount = this.data.imageLimit;
    wx.chooseMedia({
      count: maxImageCount - this.data.images.length,
      mediaType: ["image"],
      sourceType: ["album", "camera"],
      success: (res) => {
        const selected = res.tempFiles.map((file) => ({ path: file.tempFilePath, size: file.size }));
        this.setData({ images: this.data.images.concat(selected).slice(0, maxImageCount) });
      }
    });
  },

  removeImage(event) {
    const images = this.data.images.slice();
    images.splice(event.currentTarget.dataset.index, 1);
    this.setData({ images });
  },

  onInput(event) {
    this.setData({ [event.currentTarget.dataset.field]: event.detail.value });
  },

  onMarketChange(event) {
    this.setData({ marketIndex: Number(event.detail.value) });
  },

  onPlatformChange(event) {
    const platformIndex = Number(event.detail.value);
    const platform = PLATFORMS[platformIndex];
    const nextData = { platformIndex };
    if (platform && CHINESE_PLATFORM_IDS.has(platform.id) && DEFAULT_MARKET_INDEX >= 0) {
      nextData.marketIndex = DEFAULT_MARKET_INDEX;
    }
    if (platform && platform.id === "ozon" && RUSSIA_MARKET_INDEX >= 0) {
      nextData.marketIndex = RUSSIA_MARKET_INDEX;
      if (OZON_SIZE_INDEX >= 0) {
        nextData.sizeIndex = OZON_SIZE_INDEX;
      }
    }
    this.setData(nextData);
  },

  onLanguageChange(event) {
    this.setData({ languageIndex: Number(event.detail.value) });
  },

  onSizeChange(event) {
    this.setData({ sizeIndex: Number(event.detail.value) });
  },

  onCountChange(event) {
    const values = [1, 2, 4];
    const countIndex = Number(event.detail.value);
    this.setData({ countIndex, countPerScene: values[countIndex] });
  },

  toggleScene(event) {
    const id = event.currentTarget.dataset.id;
    const scenes = this.data.scenes.map((item) => (item.id === id ? { ...item, active: !item.active } : item));
    this.setData({
      activeSceneCount: scenes.filter((item) => item.active && item.visible).length,
      scenes
    });
  },

  toggleSwitch(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ [field]: !this.data[field] });
  },

  toggleAdvanced() {
    this.setData({ advancedOpen: !this.data.advancedOpen });
  },

  saveTemplate() {
    const template = this.readProductInfo();
    wx.setStorageSync(TEMPLATE_KEY, template);
    this.setData({ hasTemplate: true });
    wx.showToast({ title: "模板已保存", icon: "success" });
  },

  applyTemplate() {
    const template = wx.getStorageSync(TEMPLATE_KEY);
    if (!template) {
      wx.showToast({ title: "暂无模板", icon: "none" });
      return;
    }
    this.setData(template);
    wx.showToast({ title: "已套用模板", icon: "success" });
  },

  requestCategory() {
    wx.showToast({ title: "品类申请表单稍后上线", icon: "none" });
  },

  readProductInfo() {
    return {
      color: this.data.color,
      description: this.data.description,
      material: this.data.material,
      sku: this.data.sku,
      targetCustomer: this.data.targetCustomer,
      title: this.data.title,
      usageScene: this.data.usageScene
    };
  },

  async submitJobs() {
    if (!api.getToken()) {
      wx.navigateTo({ url: "/pages/login/login" });
      return;
    }

    const title = this.data.title.trim();
    const sceneTemplateIds = this.data.scenes.filter((item) => item.active && item.visible).map((item) => item.id);
    const isCustomMode = this.data.mode === "custom";
    const titleOptionalMode = isCustomMode || this.data.mode === "single-poster" || this.data.mode === "category-kit" || this.data.mode === "one-click-replace";
    if (!title && !titleOptionalMode) {
      wx.showToast({ title: "请输入商品标题", icon: "none" });
      return;
    }
    if (isCustomMode && !this.data.description.trim() && !this.data.extraDirection.trim()) {
      wx.showToast({ title: "请填写提示词", icon: "none" });
      return;
    }
    if (this.data.mode === "category-kit" && !title && !this.data.description.trim()) {
      wx.showToast({ title: "请填写商品描述", icon: "none" });
      return;
    }
    if (!isCustomMode && !this.data.images.length) {
      wx.showToast({ title: "请上传 1-3 张图片", icon: "none" });
      return;
    }
    if (this.data.mode === "one-click-replace" && this.data.images.length < 2) {
      wx.showToast({ title: "请上传目标图和最后一张换品图", icon: "none" });
      return;
    }
    if (!sceneTemplateIds.length) {
      wx.showToast({ title: "请选择生成场景", icon: "none" });
      return;
    }

    const size = SIZE_OPTIONS[this.data.sizeIndex];
    const isTextTranslationMode = this.data.mode === "text-translation";
    const isSinglePosterMode = this.data.mode === "single-poster";
    const isCategoryKitMode = this.data.mode === "category-kit";
    const isOneClickReplaceMode = this.data.mode === "one-click-replace";
    const countPerScene = isSinglePosterMode || isCategoryKitMode || isOneClickReplaceMode ? 1 : this.data.countPerScene;
    const stylePresetId = this.data.mode === "creative" || isOneClickReplaceMode ? "photoreal" : isSinglePosterMode ? "poster" : "product";
    const extraDirection = [
      this.data.extraDirection.trim(),
      isCategoryKitMode ? "自动识别商品品类、平台和市场，按当前商品拆解详情页级套图，覆盖整体、细节、卖点、规格、包装、用法、场景、人群和保障注意事项；不要套用固定围巾或丝巾模板。" : "",
      isCustomMode ? `自由创作提示词：${this.data.description.trim()}` : "",
      this.data.brandOverlayEnabled ? "需要预留品牌 Logo 或品牌文字叠加空间，不要生成虚假品牌标识。" : ""
    ].filter(Boolean).join("\n");

    this.setData({ submitting: true });
    wx.showLoading({ title: "创建任务中" });
    try {
      await this.requestTaskCompleteSubscription();
      const jobs = [];
      const targetImages = isOneClickReplaceMode ? this.data.images.slice(0, -1) : this.data.images;
      const replacementImage = isOneClickReplaceMode ? this.data.images[this.data.images.length - 1] : null;
      const replacementDataUrl = replacementImage ? await fileToDataUrl(replacementImage.path) : "";
      const buildPayloadBase = () => ({
        product: {
          title: title || (isCustomMode ? "自由创作" : isCategoryKitMode ? "AI 自拆品类套图" : isOneClickReplaceMode ? "一键换装/换品" : "单品完整电商海报"),
          description: this.data.description.trim(),
          targetCustomer: this.data.targetCustomer.trim(),
          usageScene: this.data.usageScene.trim(),
          material: this.data.material.trim(),
          color: [this.data.color.trim(), this.data.sku.trim()].filter(Boolean).join(" / ")
        },
        platform: isTextTranslationMode || isCustomMode ? "other" : PLATFORMS[this.data.platformIndex].id,
        market: isTextTranslationMode || isCustomMode ? "global" : MARKETS[this.data.marketIndex].id,
        textLanguage: isTextTranslationMode ? LANGUAGES[this.data.languageIndex].id : "none",
        allowTextRecreation: !isTextTranslationMode,
        removeWatermarkAndLogo: this.data.removeWatermarkAndLogo,
        sceneTemplateIds,
        size: { width: size.width, height: size.height },
        sizePresetId: size.id,
        stylePresetId: isCustomMode ? "photoreal" : stylePresetId,
        quality: "auto",
        outputFormat: "png",
        countPerScene,
        extraDirection
      });
      if (isOneClickReplaceMode) {
        const referenceImages = [];
        for (const [index, image] of targetImages.entries()) {
          const dataUrl = await fileToDataUrl(image.path);
          referenceImages.push({
            referenceImage: {
              dataUrl,
              fileName: `target-${index + 1}.png`
            },
            additionalReferenceImages: [
              {
                dataUrl: replacementDataUrl,
                fileName: "replacement-product.png"
              }
            ],
            title: title ? `${title} ${index + 1}` : undefined,
            extraDirection: `目标图 ${index + 1}`
          });
        }
        jobs.push(await api.createBatchJob({
          ...buildPayloadBase(),
          referenceImages
        }));
      } else if (isCustomMode && !this.data.images.length) {
        const payload = {
          ...buildPayloadBase(),
          referenceImage: {
            dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lQnZ6QAAAABJRU5ErkJggg==",
            fileName: "prompt-only-reference.png"
          }
        };
        jobs.push(await api.createBatchJob(payload));
      } else {
        const jobImages = targetImages;
        for (const [index, image] of jobImages.entries()) {
          const dataUrl = await fileToDataUrl(image.path);
          const payload = {
            ...buildPayloadBase(),
            referenceImage: {
              dataUrl,
              fileName: `reference-${index + 1}.png`
            }
          };
          jobs.push(await api.createBatchJob(payload));
        }
      }
      wx.setStorageSync(
        RECENT_CREATED_JOBS_KEY,
        jobs.map((job) => ({
          jobId: job.jobId,
          productTitle: title || (isCustomMode ? "自由创作" : "单品完整电商海报"),
          createdAt: job.createdAt || new Date().toISOString(),
          status: job.status || "pending",
          totalScenes: job.totalScenes || (isOneClickReplaceMode ? targetImages.length : sceneTemplateIds.length),
          completedScenes: job.completedScenes || 0
        }))
      );
      wx.hideLoading();
      wx.showToast({ title: isOneClickReplaceMode ? `已创建 ${targetImages.length} 张换装任务` : `已创建 ${jobs.length} 个任务`, icon: "success" });
      wx.switchTab({ url: "/pages/jobs/jobs" });
    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title: error.message, icon: "none" });
    } finally {
      this.setData({ submitting: false });
    }
  },

  async requestTaskCompleteSubscription() {
    if (!wx.requestSubscribeMessage) return;
    try {
      const config = await api.getConfig();
      const templateId = config && config.notifications && config.notifications.wechatMiniAppTaskCompleteTemplateId;
      if (!templateId) return;
      await wx.requestSubscribeMessage({ tmplIds: [templateId] });
    } catch {
      // 用户拒绝或当前环境不支持时继续创建任务。
    }
  }
});
