const api = require("../../utils/api");
const { fileToDataUrl } = require("../../utils/image");
const galleryUtils = require("../../utils/gallery");

const STATUS_LABELS = {
  failed: "失败",
  partial: "部分完成",
  pending: "排队中",
  running: "生成中",
  succeeded: "已完成"
};

const FEATURES = [
  {
    key: "scene",
    icon: "图",
    title: "场景出图",
    desc: "主图、卖点图、生活方式图"
  },
  {
    key: "translate",
    icon: "译",
    title: "图片翻译",
    desc: "保留布局，多语言本地化"
  },
  {
    key: "watermark",
    icon: "净",
    title: "去水印",
    desc: "清理角标、平台标识和旧水印"
  },
  {
    key: "category",
    icon: "包",
    title: "品类图包",
    desc: "按品类生成完整商品图组"
  }
];

const WORKFLOWS = [
  {
    key: "launch",
    badge: "上新推荐",
    count: "5 张起",
    title: "爆款商品图组",
    desc: "适合亚马逊、Allegro、TikTok Shop 商品上新。",
    tags: ["白底主图", "卖点图", "社媒图"]
  },
  {
    key: "localize",
    badge: "本地化",
    count: "多语言",
    title: "图片文字翻译",
    desc: "保留原图构图，把营销文案翻译成目标市场语言。",
    tags: ["英文", "波兰文", "德文"]
  },
  {
    key: "category",
    badge: "批量铺货",
    count: "图包",
    title: "品类上新模板",
    desc: "围绕品类场景生成完整商品图素材。",
    tags: ["围巾", "服饰", "配饰"]
  }
];

const QUICK_CUSTOM_IMAGE_LIMIT = 3;
const QUICK_CUSTOM_SIZE = { id: "square-1k", width: 1024, height: 1024 };
const RECENT_CREATED_JOBS_KEY = "recentCreatedJobs";
const EMPTY_REFERENCE_IMAGE = {
  dataUrl:
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lQnZ6QAAAABJRU5ErkJggg==",
  fileName: "prompt-only-reference.png"
};

function featureEnabled(item, capabilities) {
  if (item.key === "category") {
    return api.capabilityEnabled(capabilities, "categoryKit");
  }
  return true;
}

function workflowEnabled(item, capabilities) {
  if (item.key === "category") {
    return api.capabilityEnabled(capabilities, "categoryKit");
  }
  return true;
}

Page({
  data: {
    canUseCategoryKit: true,
    canUsePublicGallery: true,
    features: FEATURES,
    memberCopy: "登录后同步任务记录和会员额度",
    memberTitle: "未登录",
    publicWorks: [],
    publicWorksError: "",
    publicWorksLoading: false,
    quickCustomImages: [],
    quickCustomImageLimit: QUICK_CUSTOM_IMAGE_LIMIT,
    quickCustomOptimizing: false,
    quickCustomPrompt: "",
    quickCustomSubmitting: false,
    quickCustomVisible: false,
    recentJobs: [],
    userInitial: "我",
    workflows: WORKFLOWS
  },

  onShow() {
    this.loadHomeData();
  },

  onPullDownRefresh() {
    this.loadHomeData().finally(() => wx.stopPullDownRefresh());
  },

  async loadHomeData() {
    const capabilities = await api.getCapabilities();
    const canUsePublicGallery = api.capabilityEnabled(capabilities, "publicGallery");
    this.setData({
      canUseCategoryKit: api.capabilityEnabled(capabilities, "categoryKit"),
      canUsePublicGallery,
      features: FEATURES.filter((item) => featureEnabled(item, capabilities)),
      workflows: WORKFLOWS.filter((item) => workflowEnabled(item, capabilities))
    });
    const publicWorksRequest = canUsePublicGallery ? this.loadPublicWorks() : Promise.resolve(this.setData({
      publicWorks: [],
      publicWorksError: "",
      publicWorksLoading: false
    }));

    if (!api.getToken()) {
      this.setData({
        memberCopy: "登录后同步任务记录和会员额度",
        memberTitle: "未登录",
        recentJobs: [],
        userInitial: "我"
      });
      await publicWorksRequest;
      return;
    }

    try {
      const [meData, jobsData] = await Promise.all([api.me(), api.getJobs()]);
      const user = meData.user || meData;
      const quotaTotal = user.quotaTotal || 0;
      const quotaUsed = user.quotaUsed || 0;
      const remainingQuota = Math.max(0, quotaTotal - quotaUsed);
      const recentJobs = this.mergeRecentJobs((jobsData.jobs || []).slice(0, 3));
      this.setData({
        memberCopy: `剩余额度 ${remainingQuota} 张 · 已用 ${quotaUsed} 张`,
        memberTitle: user.planName || user.planId || "会员账户",
        recentJobs,
        userInitial: (user.displayName || user.email || "我").slice(0, 1)
      });
    } catch (error) {
      this.setData({
        memberCopy: "登录状态已过期，点击重新登录",
        memberTitle: "未登录",
        recentJobs: [],
        userInitial: "我"
      });
    } finally {
      await publicWorksRequest;
    }
  },

  async loadPublicWorks() {
    if (!this.data.canUsePublicGallery) {
      this.setData({ publicWorks: [], publicWorksError: "", publicWorksLoading: false });
      return;
    }
    this.setData({ publicWorksLoading: true, publicWorksError: "" });
    try {
      const data = await api.getPublicGallery();
      const works = (data.items || [])
        .map((item) => this.decoratePublicWork(item))
        .filter(Boolean)
        .slice(0, 12);
      this.setData({ publicWorks: works });
    } catch (error) {
      this.setData({
        publicWorksError: error.message || "公开作品加载失败",
        publicWorks: []
      });
    } finally {
      this.setData({ publicWorksLoading: false });
    }
  },

  decoratePublicWork(item) {
    const image = galleryUtils.galleryDisplayImage(item, { appendToken: false, preferredWidth: 512 });
    if (!image) return null;
    return {
      ...item,
      createdAtText: galleryUtils.formatCompactTime(item.createdAt),
      imageId: image.id,
      imageUrl: image.url,
      promptText: image.prompt,
      tagText: image.tag
    };
  },

  goCreate() {
    wx.switchTab({ url: "/pages/workbench/workbench" });
  },

  goCustomCreate() {
    this.openQuickCustom();
  },

  goJobs() {
    wx.switchTab({ url: "/pages/jobs/jobs" });
  },

  goPublicGallery() {
    if (!this.data.canUsePublicGallery) {
      wx.showToast({ title: "当前版本未开启公开作品", icon: "none" });
      return;
    }
    wx.navigateTo({ url: "/pages/public-gallery/public-gallery" });
  },

  goProfile() {
    wx.switchTab({ url: "/pages/profile/profile" });
  },

  readRecentCreatedJobs() {
    const value = wx.getStorageSync(RECENT_CREATED_JOBS_KEY);
    return Array.isArray(value) ? value : [];
  },

  mergeRecentJobs(jobs) {
    const recentJobs = this.readRecentCreatedJobs();
    const knownIds = new Set(jobs.map((job) => job.jobId));
    const recentSummaries = recentJobs
      .filter((job) => job.jobId && !knownIds.has(job.jobId))
      .map((job) => ({
        ...job,
        statusLabel: STATUS_LABELS[job.status] || job.status
      }));
    return recentSummaries.concat(
      jobs.map((job) => ({
        ...job,
        statusLabel: STATUS_LABELS[job.status] || job.status
      }))
    ).slice(0, 3);
  },

  openPublicWork(event) {
    if (!this.data.canUsePublicGallery) {
      wx.showToast({ title: "当前版本未开启公开作品", icon: "none" });
      return;
    }
    wx.navigateTo({
      url: `/pages/public-gallery/public-gallery?work=${encodeURIComponent(event.currentTarget.dataset.id || "")}`
    });
  },

  openFeature(event) {
    const key = event.currentTarget.dataset.key;
    if (key === "category" && !this.data.canUseCategoryKit) {
      wx.showToast({ title: "当前版本未开启品类套图", icon: "none" });
      return;
    }
    wx.setStorageSync("createPreset", key);
    this.goCreate();
  },

  openWorkflow(event) {
    const key = event.currentTarget.dataset.key;
    if (key === "category" && !this.data.canUseCategoryKit) {
      wx.showToast({ title: "当前版本未开启品类套图", icon: "none" });
      return;
    }
    wx.setStorageSync("createPreset", key);
    this.goCreate();
  },

  openQuickCustom() {
    this.setData({ quickCustomVisible: true });
  },

  closeQuickCustom() {
    if (this.data.quickCustomSubmitting || this.data.quickCustomOptimizing) return;
    this.setData({ quickCustomVisible: false });
  },

  noop() {},

  chooseQuickCustomImages() {
    const remainCount = QUICK_CUSTOM_IMAGE_LIMIT - this.data.quickCustomImages.length;
    if (remainCount <= 0) return;
    wx.chooseMedia({
      count: remainCount,
      mediaType: ["image"],
      sourceType: ["album", "camera"],
      success: (res) => {
        const selected = res.tempFiles.map((file) => ({
          path: file.tempFilePath,
          size: file.size
        }));
        this.setData({
          quickCustomImages: this.data.quickCustomImages.concat(selected).slice(0, QUICK_CUSTOM_IMAGE_LIMIT)
        });
      }
    });
  },

  removeQuickCustomImage(event) {
    const images = this.data.quickCustomImages.slice();
    images.splice(Number(event.currentTarget.dataset.index), 1);
    this.setData({ quickCustomImages: images });
  },

  onQuickCustomPromptInput(event) {
    this.setData({ quickCustomPrompt: event.detail.value });
  },

  requireQuickCustomLogin(actionName) {
    if (api.getToken()) return true;
    wx.showModal({
      title: "需要登录",
      content: `登录后才能${actionName}。`,
      confirmText: "去登录",
      cancelText: "取消",
      success: (res) => {
        if (res.confirm) {
          this.setData({ quickCustomVisible: false });
          wx.navigateTo({ url: "/pages/login/login" });
        }
      }
    });
    return false;
  },

  async optimizeQuickCustomPrompt() {
    const prompt = this.data.quickCustomPrompt.trim();
    if (!prompt) {
      wx.showToast({ title: "先写一句提示词", icon: "none" });
      return;
    }
    if (!this.requireQuickCustomLogin("优化提示词")) return;

    this.setData({ quickCustomOptimizing: true });
    try {
      const data = await api.optimizePrompt({
        prompt,
        mode: this.data.quickCustomImages.length ? "reference" : "text",
        stylePresetId: "photoreal",
        sizePresetId: QUICK_CUSTOM_SIZE.id,
        size: { width: QUICK_CUSTOM_SIZE.width, height: QUICK_CUSTOM_SIZE.height },
        hasReferenceImage: this.data.quickCustomImages.length > 0
      });
      const optimizedPrompt = (data.optimizedPrompt || "").trim();
      if (!optimizedPrompt) {
        throw new Error("提示词优化没有返回可用结果。");
      }
      this.setData({ quickCustomPrompt: optimizedPrompt });
    } catch (error) {
      wx.showToast({ title: error.message || "优化失败", icon: "none" });
    } finally {
      this.setData({ quickCustomOptimizing: false });
    }
  },

  async submitQuickCustom() {
    const prompt = this.data.quickCustomPrompt.trim();
    if (!prompt) {
      wx.showToast({ title: "请先写一段提示词", icon: "none" });
      return;
    }
    if (!this.requireQuickCustomLogin("生成图片")) return;

    this.setData({ quickCustomSubmitting: true });
    wx.showLoading({ title: "创建任务中" });
    try {
      const referenceImage = this.data.quickCustomImages[0]
        ? await this.quickCustomReferenceImage(this.data.quickCustomImages[0], "quick-reference-1.png")
        : EMPTY_REFERENCE_IMAGE;
      const additionalReferenceImages = [];
      for (const [index, image] of this.data.quickCustomImages.slice(1).entries()) {
        additionalReferenceImages.push(await this.quickCustomReferenceImage(image, `quick-reference-${index + 2}.png`));
      }
      const job = await api.createBatchJob({
        product: {
          title: "自由创作",
          description: prompt
        },
        platform: "other",
        market: "global",
        textLanguage: "none",
        allowTextRecreation: true,
        removeWatermarkAndLogo: true,
        sceneTemplateIds: ["lifestyle"],
        size: { width: QUICK_CUSTOM_SIZE.width, height: QUICK_CUSTOM_SIZE.height },
        sizePresetId: QUICK_CUSTOM_SIZE.id,
        stylePresetId: "photoreal",
        quality: "auto",
        outputFormat: "png",
        countPerScene: 1,
        extraDirection: `自由创作提示词：${prompt}`,
        referenceImage: additionalReferenceImages.length ? { ...referenceImage, additionalReferenceImages } : referenceImage
      });
      this.rememberRecentQuickCustomJob(job);
      this.setData({
        quickCustomImages: [],
        quickCustomPrompt: "",
        quickCustomVisible: false
      });
      wx.hideLoading();
      wx.showModal({
        title: "任务提交成功",
        content: "已进入生成队列，可以到任务列表查看进度和结果。",
        confirmText: "进入任务",
        cancelText: "留在首页",
        success: (res) => {
          if (res.confirm) {
            wx.switchTab({ url: "/pages/jobs/jobs" });
          } else {
            this.loadHomeData();
          }
        }
      });
    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title: error.message || "创建失败", icon: "none" });
    } finally {
      this.setData({ quickCustomSubmitting: false });
    }
  },

  async quickCustomReferenceImage(image, fallbackFileName) {
    return {
      dataUrl: await fileToDataUrl(image.path),
      fileName: fallbackFileName
    };
  },

  rememberRecentQuickCustomJob(job) {
    const current = wx.getStorageSync(RECENT_CREATED_JOBS_KEY);
    const jobs = Array.isArray(current) ? current : [];
    const nextJob = {
      jobId: job.jobId,
      productTitle: "自由创作",
      createdAt: job.createdAt || new Date().toISOString(),
      status: job.status || "pending",
      totalScenes: job.totalScenes || 1,
      completedScenes: job.completedScenes || 0,
      platform: "other",
      market: "global"
    };
    wx.setStorageSync(RECENT_CREATED_JOBS_KEY, [nextJob].concat(jobs.filter((item) => item.jobId !== nextJob.jobId)).slice(0, 12));
  }
});
