const api = require("../../utils/api");
const { fileToDataUrl } = require("../../utils/image");
const { LANGUAGES, MARKETS, PLATFORMS, SCENES } = require("../../utils/constants");

const MODES = [
  { id: "enhance", title: "原图增强", desc: "保留商品原貌，生成卖点文字和电商排版。", icon: "✨" },
  { id: "creative", title: "场景创作", desc: "依据主图生成生活方式、模特穿戴和搭配场景。", icon: "🎬" },
  { id: "category-kit", title: "品类套图", desc: "按平台和类目生成整套 Listing Image Kit。", icon: "📦" },
  { id: "text-translation", title: "文字翻译", desc: "逐张翻译图片文字，可选择目标语言和是否二创。", icon: "译" }
];

const MODE_SCENES = {
  enhance: ["marketplace-main", "logo-benefit", "feature-benefit", "promo-poster"],
  creative: ["lifestyle", "model-wear", "accessory-match", "seasonal-campaign", "social-ad"],
  "category-kit": [
    "allegro-scarf-main-flat",
    "allegro-scarf-main-styled",
    "allegro-scarf-drape-product",
    "allegro-scarf-fabric-detail",
    "allegro-scarf-edge-detail",
    "allegro-scarf-size-guide",
    "allegro-scarf-wear-grid",
    "allegro-scarf-neck-model",
    "allegro-scarf-bag-styling",
    "allegro-scarf-lifestyle"
  ],
  "text-translation": ["text-translation"]
};

const PRESET_TO_MODE = {
  category: "category-kit",
  launch: "enhance",
  localize: "text-translation",
  scene: "creative",
  translate: "text-translation",
  watermark: "enhance"
};

const SIZE_OPTIONS = [
  { id: "square-1k", label: "方图 1:1", width: 1024, height: 1024 },
  { id: "poster-landscape", label: "横版 3:2", width: 1536, height: 1024 },
  { id: "poster-portrait", label: "竖版 2:3", width: 1024, height: 1536 },
  { id: "story-9-16", label: "短视频 9:16", width: 1088, height: 1920 }
];

const TEMPLATE_KEY = "productInfoTemplate";
const CATEGORY_KEY = "selectedCategoryKitId";
const RECENT_CREATED_JOBS_KEY = "recentCreatedJobs";
const DEFAULT_PLATFORM_INDEX = PLATFORMS.findIndex((item) => item.id === "taobao");
const DEFAULT_MARKET_INDEX = MARKETS.findIndex((item) => item.id === "cn");
const CHINESE_PLATFORM_IDS = new Set(["1688", "taobao", "tmall", "jd", "douyin", "pinduoduo", "xiaohongshu", "kuaishou", "weidian", "dewu"]);

const CATEGORY_KITS = [
  {
    id: "accessory-scarf",
    title: "配饰-围巾",
    desc: "围巾、丝巾、方巾 Listing Image Kit",
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
    languageIndex: 2,
    languageLabels: LANGUAGES.map((item) => item.label),
    marketIndex: DEFAULT_MARKET_INDEX >= 0 ? DEFAULT_MARKET_INDEX : 0,
    marketLabels: MARKETS.map((item) => item.label),
    material: "",
    mode: "enhance",
    modeDesc: MODES[0].desc,
    modes: MODES.map((item, index) => ({ ...item, active: index === 0 })),
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
  },

  applyPreset(preset) {
    this.changeMode(PRESET_TO_MODE[preset] || "enhance");
  },

  selectMode(event) {
    this.changeMode(event.currentTarget.dataset.id);
  },

  changeMode(mode) {
    const modeMeta = MODES.find((item) => item.id === mode) || MODES[0];
    const languageIndex = mode === "text-translation" ? Math.max(1, this.data.languageIndex) : this.data.languageIndex;
    const scenes = mode === "category-kit" ? categoryScenes(this.data.selectedCategoryId) : initialScenes(mode);
    this.setData({
      activeSceneCount: scenes.filter((item) => item.active && item.visible).length,
      languageIndex,
      mode,
      modeDesc: modeMeta.desc,
      modes: MODES.map((item) => ({ ...item, active: item.id === mode })),
      scenes
    });
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
    wx.chooseMedia({
      count: 3 - this.data.images.length,
      mediaType: ["image"],
      sourceType: ["album", "camera"],
      success: (res) => {
        const selected = res.tempFiles.map((file) => ({ path: file.tempFilePath, size: file.size }));
        this.setData({ images: this.data.images.concat(selected).slice(0, 3) });
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
    if (!title) {
      wx.showToast({ title: "请输入商品标题", icon: "none" });
      return;
    }
    if (!this.data.images.length) {
      wx.showToast({ title: "请上传 1-3 张图片", icon: "none" });
      return;
    }
    if (!sceneTemplateIds.length) {
      wx.showToast({ title: "请选择生成场景", icon: "none" });
      return;
    }

    const size = SIZE_OPTIONS[this.data.sizeIndex];
    const extraDirection = [
      this.data.extraDirection.trim(),
      this.data.brandOverlayEnabled ? "需要预留品牌 Logo 或品牌文字叠加空间，不要生成虚假品牌标识。" : ""
    ].filter(Boolean).join("\n");

    this.setData({ submitting: true });
    wx.showLoading({ title: "创建任务中" });
    try {
      const jobs = [];
      for (const [index, image] of this.data.images.entries()) {
        const dataUrl = await fileToDataUrl(image.path);
        const payload = {
          product: {
            title,
            description: this.data.description.trim(),
            targetCustomer: this.data.targetCustomer.trim(),
            usageScene: this.data.usageScene.trim(),
            material: this.data.material.trim(),
            color: [this.data.color.trim(), this.data.sku.trim()].filter(Boolean).join(" / ")
          },
          platform: PLATFORMS[this.data.platformIndex].id,
          market: MARKETS[this.data.marketIndex].id,
          textLanguage: this.data.mode === "text-translation" ? LANGUAGES[this.data.languageIndex].id : "none",
          allowTextRecreation: this.data.mode !== "text-translation",
          removeWatermarkAndLogo: this.data.removeWatermarkAndLogo,
          sceneTemplateIds,
          size: { width: size.width, height: size.height },
          sizePresetId: size.id,
          stylePresetId: this.data.mode === "creative" ? "photoreal" : "product",
          quality: "auto",
          outputFormat: "png",
          countPerScene: this.data.countPerScene,
          referenceImage: {
            dataUrl,
            fileName: `reference-${index + 1}.png`
          },
          extraDirection
        };
        jobs.push(await api.createBatchJob(payload));
      }
      wx.setStorageSync(
        RECENT_CREATED_JOBS_KEY,
        jobs.map((job) => ({
          jobId: job.jobId,
          productTitle: title,
          createdAt: job.createdAt || new Date().toISOString(),
          status: job.status || "pending",
          totalScenes: job.totalScenes || sceneTemplateIds.length,
          completedScenes: job.completedScenes || 0
        }))
      );
      wx.hideLoading();
      wx.showToast({ title: `已创建 ${jobs.length} 个任务`, icon: "success" });
      wx.switchTab({ url: "/pages/jobs/jobs" });
    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title: error.message, icon: "none" });
    } finally {
      this.setData({ submitting: false });
    }
  }
});
