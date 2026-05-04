App({
  globalData: {
    apiBaseUrl: "https://imagen.neimou.com",
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
