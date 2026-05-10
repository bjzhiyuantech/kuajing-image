function resolveDefaultApiBaseUrl() {
  try {
    const envVersion = wx.getAccountInfoSync().miniProgram.envVersion;
    return envVersion === "release" ? "https://ai.neimou.com" : "https://dev.neimou.com";
  } catch (error) {
    return "https://dev.neimou.com";
  }
}

App({
  globalData: {
    apiBaseUrl: resolveDefaultApiBaseUrl(),
    token: "",
    user: null
  },

  onLaunch() {
    const token = wx.getStorageSync("authToken");
    if (token) {
      this.globalData.token = token;
    }
  }
});
