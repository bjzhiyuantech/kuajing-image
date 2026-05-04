const api = require("../../utils/api");

Page({
  data: {
    balance: "0.00",
    displayName: "",
    email: "",
    emailDraft: "",
    displayNameDraft: "",
    savingProfile: false,
    loading: false,
    remainingQuota: 0,
    user: null
  },

  onShow() {
    if (!api.getToken()) {
      this.setData({ user: null });
      return;
    }
    this.loadProfile();
  },

  async loadProfile() {
    this.setData({ loading: true });
    try {
      const data = await api.me();
      const user = data.user || data;
      const quotaTotal = user.quotaTotal || 0;
      const quotaUsed = user.quotaUsed || 0;
      this.setData({
        balance: ((user.balanceCents || 0) / 100).toFixed(2),
        remainingQuota: Math.max(0, quotaTotal - quotaUsed),
        user,
        email: user.email || "",
        emailDraft: user.email || "",
        displayName: user.displayName || "",
        displayNameDraft: user.displayName || ""
      });
    } catch (error) {
      wx.showToast({ title: error.message, icon: "none" });
      this.setData({ user: null });
    } finally {
      this.setData({ loading: false });
    }
  },

  goLogin() {
    wx.navigateTo({ url: "/pages/login/login" });
  },

  onEmailInput(event) {
    this.setData({ emailDraft: event.detail.value });
  },

  onDisplayNameInput(event) {
    this.setData({ displayNameDraft: event.detail.value });
  },

  async saveProfile() {
    if (!api.getToken()) {
      wx.navigateTo({ url: "/pages/login/login" });
      return;
    }
    this.setData({ savingProfile: true });
    try {
      await api.updateProfile({
        email: this.data.emailDraft.trim(),
        displayName: this.data.displayNameDraft.trim()
      });
      wx.showToast({ title: "资料已更新", icon: "success" });
      await this.loadProfile();
    } catch (error) {
      wx.showToast({ title: error.message, icon: "none" });
    } finally {
      this.setData({ savingProfile: false });
    }
  },

  logout() {
    api.clearSession();
    this.setData({ user: null });
    wx.showToast({ title: "已退出", icon: "success" });
  }
});
