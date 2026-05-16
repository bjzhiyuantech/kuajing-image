const app = getApp();

function resolveDefaultBaseUrl() {
  try {
    const envVersion = wx.getAccountInfoSync().miniProgram.envVersion;
    return envVersion === "release" ? "https://ai.neimou.com" : "https://dev.neimou.com";
  } catch (error) {
    return "https://dev.neimou.com";
  }
}

function getBaseUrl() {
  return app.globalData.apiBaseUrl || resolveDefaultBaseUrl();
}

function setBaseUrl(value) {
  const cleanValue = String(value || "").trim().replace(/\/+$/, "");
  if (!cleanValue) return;
  app.globalData.apiBaseUrl = cleanValue;
  wx.setStorageSync("apiBaseUrl", cleanValue);
}

function getToken() {
  return app.globalData.token || wx.getStorageSync("authToken") || "";
}

function setSession(session) {
  app.globalData.token = session.token;
  app.globalData.user = session.user;
  wx.setStorageSync("authToken", session.token);
  wx.setStorageSync("authUser", session.user);
}

function clearSession() {
  app.globalData.token = "";
  app.globalData.user = null;
  wx.removeStorageSync("authToken");
  wx.removeStorageSync("authUser");
}

function request(path, options = {}) {
  const token = getToken();
  const headers = Object.assign({}, options.header || {});
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (options.data && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${getBaseUrl()}${path}`,
      method: options.method || "GET",
      data: options.data,
      header: headers,
      timeout: options.timeout || 60000,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
          return;
        }
        if (res.statusCode === 401) {
          clearSession();
        }
        reject(new Error(readErrorMessage(res.data, `请求失败（HTTP ${res.statusCode}）`)));
      },
      fail(error) {
        reject(new Error(error.errMsg || "网络请求失败"));
      }
    });
  });
}

function readErrorMessage(body, fallback) {
  if (body && body.error && body.error.message) return body.error.message;
  if (body && body.message) return body.message;
  return fallback;
}

function login(email, password) {
  return request("/api/auth/login", {
    method: "POST",
    data: { email, password }
  }).then((session) => {
    setSession(session);
    return session;
  });
}

function register(email, password, displayName) {
  return request("/api/auth/register", {
    method: "POST",
    data: { email, password, displayName }
  }).then((session) => {
    setSession(session);
    return session;
  });
}

function getWechatMiniAppConfig() {
  return request("/api/auth/wechat/miniapp/config");
}

function wechatMiniAppLogin(code) {
  return request("/api/auth/wechat/miniapp/login", {
    method: "POST",
    data: { code }
  }).then((result) => {
    if (result && result.status === "bound" && result.session) {
      setSession(result.session);
    }
    return result;
  });
}

function wechatMiniAppBind(bindToken) {
  return request("/api/auth/wechat/miniapp/bind", {
    method: "POST",
    data: { bindToken }
  }).then((session) => {
    setSession(session);
    return session;
  });
}

function wechatMiniAppRegister(bindToken, displayName, email) {
  return request("/api/auth/wechat/miniapp/register", {
    method: "POST",
    data: { bindToken, displayName, email }
  }).then((session) => {
    setSession(session);
    return session;
  });
}

function updateProfile(payload) {
  return request("/api/auth/me", {
    method: "PUT",
    data: payload
  }).then((data) => {
    if (data && data.user) {
      app.globalData.user = data.user;
      wx.setStorageSync("authUser", data.user);
    }
    return data;
  });
}

function me() {
  return request("/api/auth/me").then((data) => {
    const user = data.user || data;
    app.globalData.user = user;
    wx.setStorageSync("authUser", user);
    return data;
  });
}

function getConfig() {
  return request("/api/config");
}

function getJobs() {
  return request("/api/ecommerce/jobs?limit=30");
}

function getJob(jobId) {
  return request(`/api/ecommerce/jobs/${jobId}`);
}

function getStats() {
  return request("/api/ecommerce/stats");
}

function getNotifications(limit = 30) {
  return request(`/api/notifications?limit=${limit}`);
}

function markNotificationRead(notificationId) {
  return request(`/api/notifications/${encodeURIComponent(notificationId)}/read`, {
    method: "POST"
  });
}

function markAllNotificationsRead() {
  return request("/api/notifications/read-all", {
    method: "POST"
  });
}

function getGallery() {
  return request("/api/gallery");
}

function getInvoiceApplications() {
  return request("/api/billing/invoice/applications");
}

function createBatchJob(payload) {
  return request("/api/ecommerce/images/batch-generate", {
    method: "POST",
    data: payload,
    timeout: 120000
  });
}

function applyInvoiceApplication(payload) {
  return request("/api/billing/invoice/applications", {
    method: "POST",
    data: payload
  });
}

function redeemCode(code) {
  return request("/api/redemption-codes/redeem", {
    method: "POST",
    data: { code }
  });
}

module.exports = {
  clearSession,
  applyInvoiceApplication,
  createBatchJob,
  getBaseUrl,
  getConfig,
  getGallery,
  getJob,
  getJobs,
  getNotifications,
  getInvoiceApplications,
  getStats,
  getWechatMiniAppConfig,
  getToken,
  login,
  markAllNotificationsRead,
  markNotificationRead,
  me,
  redeemCode,
  register,
  updateProfile,
  wechatMiniAppBind,
  wechatMiniAppLogin,
  wechatMiniAppRegister,
  setBaseUrl
};
