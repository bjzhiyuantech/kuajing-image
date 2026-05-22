const api = require("../../utils/api");
const galleryUtils = require("../../utils/gallery");

Page({
  data: {
    error: "",
    initialWorkId: "",
    loading: false,
    promptVisible: false,
    publicWorks: [],
    selectedIndex: -1,
    selectedWork: null,
    saving: false
  },

  async onLoad(options) {
    this.setData({ initialWorkId: options && options.work ? decodeURIComponent(options.work) : "" });
    const capabilities = await api.getCapabilities();
    if (!api.capabilityEnabled(capabilities, "publicGallery")) {
      this.setData({ error: "当前版本未开启公开作品", publicWorks: [] });
      return;
    }
    this.loadGallery();
  },

  onPullDownRefresh() {
    this.loadGallery().finally(() => wx.stopPullDownRefresh());
  },

  async loadGallery() {
    const capabilities = await api.getCapabilities();
    if (!api.capabilityEnabled(capabilities, "publicGallery")) {
      this.setData({ error: "当前版本未开启公开作品", publicWorks: [], loading: false });
      return;
    }
    this.setData({ loading: true, error: "" });
    try {
      const data = await api.getPublicGallery();
      const publicWorks = (data.items || [])
        .map((item) => this.decorateWork(item))
        .filter(Boolean);
      const selectedIndex = this.data.initialWorkId
        ? publicWorks.findIndex((item) => item.imageId === this.data.initialWorkId)
        : -1;
      this.setData({
        publicWorks,
        selectedIndex,
        selectedWork: selectedIndex >= 0 ? publicWorks[selectedIndex] : null,
        promptVisible: false
      });
    } catch (error) {
      this.setData({ error: error.message || "公开作品加载失败", publicWorks: [] });
    } finally {
      this.setData({ loading: false });
    }
  },

  decorateWork(item) {
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

  openWork(event) {
    const imageId = event.currentTarget.dataset.id;
    const selectedIndex = this.data.publicWorks.findIndex((item) => item.imageId === imageId);
    this.setData({
      promptVisible: false,
      selectedIndex,
      selectedWork: selectedIndex >= 0 ? this.data.publicWorks[selectedIndex] : null
    });
  },

  closePreview() {
    this.setData({ promptVisible: false, selectedIndex: -1, selectedWork: null });
  },

  showPrev() {
    this.switchPreview(-1);
  },

  showNext() {
    this.switchPreview(1);
  },

  switchPreview(delta) {
    if (!this.data.publicWorks.length) return;
    const nextIndex = Math.max(0, Math.min(this.data.publicWorks.length - 1, this.data.selectedIndex + delta));
    this.setData({
      promptVisible: false,
      selectedIndex: nextIndex,
      selectedWork: this.data.publicWorks[nextIndex]
    });
  },

  togglePrompt() {
    this.setData({ promptVisible: !this.data.promptVisible });
  },

  async saveSelectedWork() {
    if (!this.data.selectedWork || this.data.saving) return;
    this.setData({ saving: true });
    try {
      await galleryUtils.saveImageUrlToAlbum(this.data.selectedWork.imageUrl);
      wx.showToast({ title: "已保存到相册", icon: "success" });
    } catch (error) {
      wx.showToast({ title: error.message || "保存失败", icon: "none" });
    } finally {
      this.setData({ saving: false });
    }
  },

  reuseSelectedWork() {
    if (!this.data.selectedWork) return;
    wx.setStorageSync("createPreset", "scene");
    wx.setStorageSync("createPrompt", this.data.selectedWork.promptText);
    wx.switchTab({ url: "/pages/workbench/workbench" });
  },

  retry() {
    this.loadGallery();
  },

  noop() {}
});
