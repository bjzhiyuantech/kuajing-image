const api = require("../../utils/api");

Page({
  data: {
    displayName: "",
    email: "",
    loading: false,
    loginMode: "wechat",
    mode: "login",
    password: "",
    wechatConfig: null,
    bindToken: "",
    needsBind: false,
    allowBindExistingAccount: true,
    allowRegisterNewUser: true,
    bindMethod: "existing",
    promptCompleteProfile: false
  },

  onLoad() {
    this.loadWechatConfig();
  },

  async loadWechatConfig() {
    try {
      const data = await api.getWechatMiniAppConfig();
      const wechatConfig = data.wechatMiniApp || null;
      this.setData({
        wechatConfig,
        loginMode: wechatConfig && wechatConfig.enabled === true ? this.data.loginMode : "account"
      });
    } catch (error) {
      this.setData({ wechatConfig: null, loginMode: "account" });
    }
  },

  onEmailInput(event) {
    this.setData({ email: event.detail.value });
  },

  onPasswordInput(event) {
    this.setData({ password: event.detail.value });
  },

  onDisplayNameInput(event) {
    this.setData({ displayName: event.detail.value });
  },

  toggleMode() {
    this.setData({ mode: this.data.mode === "login" ? "register" : "login" });
  },

  switchLoginMode(event) {
    const mode = event.currentTarget.dataset.mode;
    this.setData({ loginMode: mode });
  },

  async onSubmit() {
    if (this.data.loginMode === "wechat") {
      if (!this.data.wechatConfig || this.data.wechatConfig.enabled !== true) {
        wx.showToast({ title: "微信登录暂未启用", icon: "none" });
        return;
      }
      await this.loginWithWechat();
      return;
    }

    const email = this.data.email.trim();
    const password = this.data.password;
    const displayName = this.data.displayName.trim() || email.split("@")[0];
    if (!email || !password) {
      wx.showToast({ title: "请输入邮箱和密码", icon: "none" });
      return;
    }

    this.setData({ loading: true });
    try {
      if (this.data.mode === "login") {
        await api.login(email, password);
      } else {
        await api.register(email, password, displayName);
      }
      wx.switchTab({ url: "/pages/workbench/workbench" });
    } catch (error) {
      wx.showToast({ title: error.message, icon: "none" });
    } finally {
      this.setData({ loading: false });
    }
  },

  async loginWithWechat() {
    if (this.data.loading) return;
    this.setData({ loading: true });
    try {
      const loginResult = await new Promise((resolve, reject) => {
        wx.login({
          success(res) {
            if (!res.code) {
              reject(new Error("微信登录失败，请稍后重试"));
              return;
            }
            resolve(res.code);
          },
          fail() {
            reject(new Error("微信登录失败，请稍后重试"));
          }
        });
      });

      const result = await api.wechatMiniAppLogin(loginResult);
      if (result.status === "bound") {
        wx.switchTab({ url: "/pages/workbench/workbench" });
        return;
      }

      this.setData({
        needsBind: true,
        bindToken: result.bindToken,
        allowBindExistingAccount: result.allowBindExistingAccount !== false,
        allowRegisterNewUser: result.allowRegisterNewUser !== false,
        bindMethod: result.allowBindExistingAccount !== false ? "existing" : "register",
        mode: "login",
        loginMode: "wechat"
      });
    } catch (error) {
      wx.showToast({ title: error.message, icon: "none" });
    } finally {
      this.setData({ loading: false });
    }
  },

  async bindExistingAccount() {
    const email = this.data.email.trim();
    const password = this.data.password;
    if (!email || !password) {
      wx.showToast({ title: "请输入邮箱和密码后绑定", icon: "none" });
      return;
    }
    this.setData({ loading: true });
    try {
      await api.login(email, password);
      await api.wechatMiniAppBind(this.data.bindToken);
      wx.switchTab({ url: "/pages/workbench/workbench" });
    } catch (error) {
      wx.showToast({ title: error.message, icon: "none" });
    } finally {
      this.setData({ loading: false });
    }
  },

  async registerNewUser() {
    const displayName = this.data.displayName.trim() || "微信用户";
    const email = this.data.email.trim();
    this.setData({ loading: true });
    try {
      await api.wechatMiniAppRegister(this.data.bindToken, displayName, email || undefined);
      this.setData({ promptCompleteProfile: true });
      wx.showModal({
        title: "注册成功",
        content: "你的微信账号已创建，建议尽快补全邮箱和资料，方便找回账号与接收通知。",
        showCancel: false
      });
      wx.switchTab({ url: "/pages/workbench/workbench" });
    } catch (error) {
      wx.showToast({ title: error.message, icon: "none" });
    } finally {
      this.setData({ loading: false });
    }
  }
});
