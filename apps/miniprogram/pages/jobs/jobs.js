const api = require("../../utils/api");
const galleryUtils = require("../../utils/gallery");

const STATUS_LABELS = {
  failed: "失败",
  partial: "部分完成",
  pending: "排队中",
  running: "生成中",
  succeeded: "已完成"
};
const RECENT_CREATED_JOBS_KEY = "recentCreatedJobs";
const JOB_FILTERS = [
  { id: "all", label: "全部" },
  { id: "running", label: "生成中" },
  { id: "succeeded", label: "已完成" },
  { id: "partial", label: "部分完成" },
  { id: "failed", label: "失败" }
];

Page({
  data: {
    apiBaseUrl: "",
    currentJob: null,
    filteredJobs: [],
    filters: JOB_FILTERS.map((item, index) => ({ ...item, active: index === 0 })),
    finishedCount: 0,
    galleryPromptVisible: false,
    jobs: [],
    loading: false,
    runningCount: 0,
    saveProgressText: "",
    saving: false,
    selectedImage: null,
    selectedImageId: "",
    statusFilter: "all",
    token: ""
  },

  onShow() {
    if (!api.getToken()) {
      this.setData({ currentJob: null, jobs: [], token: "" });
      return;
    }
    this.loadJobs();
  },

  onPullDownRefresh() {
    this.loadJobs().finally(() => wx.stopPullDownRefresh());
  },

  async loadJobs() {
    if (!api.getToken()) {
      wx.navigateTo({ url: "/pages/login/login" });
      return;
    }

    this.setData({ loading: true, apiBaseUrl: api.getBaseUrl(), token: api.getToken() });
    try {
      const data = await api.getJobs();
      const recentJobs = this.readRecentCreatedJobs();
      const summaries = this.mergeRecentJobs((data.jobs || []).map((job) => this.decorateSummary(job)), recentJobs);
      this.setJobs(summaries);

      let galleryItems = [];
      try {
        const gallery = await api.getGallery();
        galleryItems = gallery.items || [];
      } catch {
        galleryItems = [];
      }

      const hydratedJobs = [];
      for (const job of summaries.slice(0, 12)) {
        try {
          const detail = await api.getJob(job.jobId);
          const hydratedJob = this.mergeDetail(job, detail, galleryItems);
          hydratedJobs.push(hydratedJob);
          this.setJobs(this.data.jobs.map((item) => (item.jobId === hydratedJob.jobId ? hydratedJob : item)));
        } catch {
          hydratedJobs.push(this.mergeGalleryFallback(job, galleryItems));
        }
      }
      this.setJobs(summaries.map((job) => hydratedJobs.find((item) => item.jobId === job.jobId) || job));
      this.pruneRecentCreatedJobs(this.data.jobs);
    } catch (error) {
      wx.showToast({ title: error.message, icon: "none" });
    } finally {
      this.setData({ loading: false });
    }
  },

  decorateSummary(job) {
    return {
      ...job,
      coverImages: [],
      imageCount: 0,
      progressPercent: this.progressPercent(job.completedScenes, job.totalScenes),
      statusLabel: STATUS_LABELS[job.status] || job.status
    };
  },

  setJobs(jobs) {
    const runningCount = jobs.filter((job) => job.status === "running" || job.status === "pending").length;
    const finishedCount = jobs.filter((job) => job.status === "succeeded" || job.status === "partial").length;
    const filteredJobs = this.filterJobs(jobs, this.data.statusFilter);
    this.setData({
      filteredJobs,
      finishedCount,
      jobs,
      runningCount
    });
  },

  filterJobs(jobs, statusFilter) {
    if (statusFilter === "all") return jobs;
    if (statusFilter === "running") {
      return jobs.filter((job) => job.status === "running" || job.status === "pending");
    }
    return jobs.filter((job) => job.status === statusFilter);
  },

  selectFilter(event) {
    const statusFilter = event.currentTarget.dataset.id || "all";
    this.setData({
      filteredJobs: this.filterJobs(this.data.jobs, statusFilter),
      filters: JOB_FILTERS.map((item) => ({ ...item, active: item.id === statusFilter })),
      statusFilter
    });
  },

  readRecentCreatedJobs() {
    const value = wx.getStorageSync(RECENT_CREATED_JOBS_KEY);
    return Array.isArray(value) ? value : [];
  },

  mergeRecentJobs(jobs, recentJobs) {
    const knownIds = new Set(jobs.map((job) => job.jobId));
    const recentSummaries = recentJobs
      .filter((job) => job.jobId && !knownIds.has(job.jobId))
      .map((job) =>
        this.decorateSummary({
          completedScenes: job.completedScenes || 0,
          createdAt: job.createdAt || new Date().toISOString(),
          failedScenes: 0,
          jobId: job.jobId,
          market: job.market || "cn",
          message: "任务已创建，正在同步任务列表。",
          platform: job.platform || "taobao",
          productTitle: job.productTitle || "新建任务",
          status: job.status || "pending",
          succeededScenes: 0,
          totalScenes: job.totalScenes || 0,
          updatedAt: job.createdAt || new Date().toISOString()
        })
      );
    return recentSummaries.concat(jobs);
  },

  pruneRecentCreatedJobs(jobs) {
    const pendingRecentIds = new Set(this.readRecentCreatedJobs().map((job) => job.jobId));
    const stillPending = jobs
      .filter((job) => pendingRecentIds.has(job.jobId) && (job.status === "pending" || job.status === "running"))
      .map((job) => ({
        jobId: job.jobId,
        productTitle: job.productTitle,
        createdAt: job.createdAt,
        status: job.status,
        totalScenes: job.totalScenes,
        completedScenes: job.completedScenes
      }));
    wx.setStorageSync(RECENT_CREATED_JOBS_KEY, stillPending);
  },

  mergeDetail(summary, detail, galleryItems = []) {
    let coverImages = this.extractImages(detail).slice(0, 12);
    if (!coverImages.length) {
      coverImages = this.galleryImagesForJob(summary, galleryItems).slice(0, 12);
    }
    return {
      ...summary,
      ...detail,
      coverImages,
      imageCount: coverImages.length,
      progressPercent: this.progressPercent(detail.completedScenes, detail.totalScenes),
      statusLabel: STATUS_LABELS[detail.status] || detail.status
    };
  },

  mergeGalleryFallback(summary, galleryItems) {
    const coverImages = this.galleryImagesForJob(summary, galleryItems).slice(0, 12);
    return {
      ...summary,
      coverImages,
      imageCount: coverImages.length
    };
  },

  extractImages(job) {
    const baseUrl = api.getBaseUrl();
    const token = api.getToken();
    return (job.records || []).flatMap((record) =>
      (record.outputs || []).flatMap((output) => {
        const asset = output.asset || {};
        const assetId = asset.id || output.assetId || output.asset_id;
        const assetUrl = asset.url || (assetId ? `/api/assets/${assetId}` : "");
        const displayUrl = this.assetDisplayUrl(asset, assetUrl, 512);
        if (!displayUrl) return [];
        return [
          {
            id: output.id || assetId || assetUrl,
            url: this.imageDisplayUrl(displayUrl, baseUrl, token),
            prompt: this.promptForPreview(job, record.presetId),
            scene: record.presetId,
            sceneLabel: this.sceneLabel(record.presetId),
            status: output.status
          }
        ];
      })
    );
  },

  progressPercent(completed, total) {
    if (!total) return 0;
    return Math.max(0, Math.min(100, Math.round((completed / total) * 100)));
  },

  galleryImagesForJob(job, galleryItems) {
    const createdAt = Date.parse(job.createdAt || "");
    const completedAt = Date.parse(job.completedAt || job.updatedAt || "");
    const title = (job.productTitle || "").trim();
    return (galleryItems || []).flatMap((item) => {
      if (!item.asset || !item.asset.url) return [];
      const displayUrl = this.assetDisplayUrl(item.asset, item.asset.url, 512);
      const itemTime = Date.parse(item.createdAt || "");
      const titleMatches = title && (item.prompt || item.effectivePrompt || "").includes(title);
      const timeMatches =
        Number.isFinite(createdAt) &&
        Number.isFinite(itemTime) &&
        itemTime >= createdAt - 60 * 1000 &&
        (!Number.isFinite(completedAt) || itemTime <= completedAt + 5 * 60 * 1000);
      if (!titleMatches && !timeMatches) return [];
      return [
        {
          id: item.outputId || item.asset.id,
          url: this.imageDisplayUrl(displayUrl, api.getBaseUrl(), api.getToken()),
          prompt: galleryUtils.workPrompt(item),
          scene: item.presetId,
          sceneLabel: galleryUtils.workTag(item),
          status: "succeeded"
        }
      ];
    });
  },

  imageDisplayUrl(url, baseUrl, token) {
    if (/^https?:\/\//i.test(url)) {
      return url;
    }

    return `${baseUrl}${url}${url.includes("?") ? "&" : "?"}token=${token}`;
  },

  assetDisplayUrl(asset, fallbackUrl, preferredWidth) {
    const previewUrls = asset.cdnPreviewUrls || asset.cdn_preview_urls || {};
    const previewUrl = this.previewUrlForWidth(previewUrls, preferredWidth);
    return previewUrl || asset.cdnUrl || asset.cdn_url || fallbackUrl;
  },

  previewUrlForWidth(previewUrls, preferredWidth) {
    const widths = Object.keys(previewUrls || {})
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value))
      .sort((a, b) => a - b);
    const selectedWidth = widths.find((width) => width >= preferredWidth) || widths[widths.length - 1];
    return selectedWidth ? previewUrls[String(selectedWidth)] : "";
  },

  async openJob(event) {
    const jobId = event.currentTarget.dataset.id;
    wx.showLoading({ title: "加载相册" });
    try {
      const detail = await api.getJob(jobId);
      let galleryItems = [];
      try {
        const gallery = await api.getGallery();
        galleryItems = gallery.items || [];
      } catch {
        galleryItems = [];
      }
      const listSummary = this.data.jobs.find((job) => job.jobId === jobId) || this.decorateSummary(detail);
      const currentJob = this.mergeDetail(listSummary, detail, galleryItems);
      await this.markJobNotificationRead(jobId);
      this.setData({
        currentJob,
        galleryPromptVisible: false,
        selectedImage: (currentJob.coverImages || [])[0] || null,
        selectedImageId: ((currentJob.coverImages || [])[0] || {}).id || ""
      });
      this.setJobs(this.data.jobs.map((job) => (job.jobId === jobId ? currentJob : job)));
    } catch (error) {
      wx.showToast({ title: error.message, icon: "none" });
    } finally {
      wx.hideLoading();
    }
  },

  closeGallery() {
    this.setData({ currentJob: null, galleryPromptVisible: false, selectedImage: null, selectedImageId: "" });
  },

  async markJobNotificationRead(jobId) {
    try {
      const data = await api.getNotifications(30);
      const notification = (data.notifications || []).find((item) => item.payload && item.payload.jobId === jobId && !item.readAt);
      if (notification) {
        await api.markNotificationRead(notification.id);
      }
    } catch {
      // 打开相册不应被消息已读状态阻塞。
    }
  },

  noop() {},

  previewImage(event) {
    const url = event.currentTarget.dataset.url;
    const urls = this.data.currentJob ? this.data.currentJob.coverImages.map((item) => item.url) : this.findGalleryUrls(url);
    wx.previewImage({
      current: url,
      urls
    });
  },

  selectGalleryImage(event) {
    const imageId = event.currentTarget.dataset.id;
    const selectedImage = (this.data.currentJob.coverImages || []).find((item) => item.id === imageId) || null;
    this.setData({ galleryPromptVisible: false, selectedImage, selectedImageId: selectedImage ? selectedImage.id : "" });
  },

  toggleGalleryPrompt() {
    this.setData({ galleryPromptVisible: !this.data.galleryPromptVisible });
  },

  async saveSelectedImage() {
    if (!this.data.selectedImage || this.data.saving) return;
    this.setData({ saving: true, saveProgressText: "保存中" });
    try {
      await galleryUtils.saveImageUrlToAlbum(this.data.selectedImage.url);
      wx.showToast({ title: "已保存到相册", icon: "success" });
    } catch (error) {
      wx.showToast({ title: error.message || "保存失败", icon: "none" });
    } finally {
      this.setData({ saving: false, saveProgressText: "" });
    }
  },

  async saveAllImages() {
    const images = (this.data.currentJob && this.data.currentJob.coverImages) || [];
    if (!images.length || this.data.saving) return;
    this.setData({ saving: true });
    let savedCount = 0;
    try {
      for (const [index, image] of images.entries()) {
        this.setData({ saveProgressText: `保存中 ${index + 1}/${images.length}` });
        try {
          await galleryUtils.saveImageUrlToAlbum(image.url);
          savedCount += 1;
        } catch {
          // 单张失败后继续尝试保存后续图片，最后统一提示。
        }
      }
      wx.showToast({
        title: savedCount === images.length ? `已保存 ${savedCount} 张` : `已保存 ${savedCount}/${images.length} 张`,
        icon: savedCount ? "success" : "none"
      });
    } finally {
      this.setData({ saving: false, saveProgressText: "" });
    }
  },

  reuseSelectedImage() {
    const selectedImage = this.data.selectedImage;
    if (!selectedImage) return;
    wx.setStorageSync("createPreset", "scene");
    wx.setStorageSync("createPrompt", this.promptForImage(selectedImage));
    this.closeGallery();
    wx.switchTab({ url: "/pages/workbench/workbench" });
  },

  promptForImage(image) {
    return image.prompt || (this.data.currentJob && this.data.currentJob.message) || "";
  },

  promptForPreview(job, sceneId) {
    const pieces = [
      job.productTitle ? `商品：${job.productTitle}` : "",
      this.sceneLabel(sceneId) ? `场景：${this.sceneLabel(sceneId)}` : "",
      job.message || ""
    ].filter(Boolean);
    return pieces.join("\n");
  },

  sceneLabel(sceneId) {
    return galleryUtils.workTag({ presetId: sceneId });
  },

  findGalleryUrls(url) {
    for (const job of this.data.jobs) {
      if ((job.coverImages || []).some((item) => item.url === url)) {
        return job.coverImages.map((item) => item.url);
      }
    }
    return [url];
  }
});
