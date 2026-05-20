const app = getApp();

const DEFAULT_DEPLOYMENT_CAPABILITIES = {
  web: true,
  desktop: true,
  extension: true,
  miniprogram: true,
  mobileApp: true,
  publicGallery: true,
  categoryKit: true,
  photoshopPackage: true,
  seedanceVideo: true,
  billing: true,
  appleIap: true,
  license: false,
  multiTenant: true,
  adminConsole: true,
  cloudSync: true,
  storageProviders: ["oss", "cos"],
  modelProviders: ["official", "openai-compatible"],
  authProviders: ["saas-account"],
  billingProviders: ["alipay", "apple-iap", "balance"],
  notificationProviders: ["web", "apns", "getui", "wechat-miniapp"]
};

const DEFAULT_DEPLOYMENT_PROFILE = {
  edition: "saas",
  target: "managed-cloud",
  name: "商图 AI SaaS 版",
  capabilities: DEFAULT_DEPLOYMENT_CAPABILITIES
};

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
  app.globalData.deploymentProfile = null;
  app.globalData.deploymentProfilePromise = null;
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

function getDeploymentProfile(options = {}) {
  if (!options.force && app.globalData.deploymentProfile) {
    return Promise.resolve(app.globalData.deploymentProfile);
  }
  if (!options.force && app.globalData.deploymentProfilePromise) {
    return app.globalData.deploymentProfilePromise;
  }

  app.globalData.deploymentProfilePromise = request("/api/deployment-profile")
    .then((profile) => {
      const normalized = normalizeDeploymentProfile(profile);
      app.globalData.deploymentProfile = normalized;
      return normalized;
    })
    .catch(() => {
      const fallback = normalizeDeploymentProfile(null);
      app.globalData.deploymentProfile = fallback;
      return fallback;
    })
    .finally(() => {
      app.globalData.deploymentProfilePromise = null;
    });

  return app.globalData.deploymentProfilePromise;
}

function getCapabilities(options = {}) {
  return getDeploymentProfile(options).then((profile) => profile.capabilities);
}

function capabilityEnabled(capabilities, key) {
  if (!capabilities) return DEFAULT_DEPLOYMENT_CAPABILITIES[key] !== false;
  return capabilities[key] !== false;
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

function getPublicGallery() {
  return request("/api/public/gallery");
}

function optimizePrompt(payload) {
  return request("/api/images/prompt/optimize", {
    method: "POST",
    data: payload,
    timeout: 120000
  });
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
  getCapabilities,
  getConfig,
  getDeploymentProfile,
  getGallery,
  getPublicGallery,
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
  optimizePrompt,
  redeemCode,
  register,
  updateProfile,
  wechatMiniAppBind,
  wechatMiniAppLogin,
  wechatMiniAppRegister,
  capabilityEnabled,
  setBaseUrl
};

function normalizeDeploymentProfile(value) {
  const profile = value && typeof value === "object" ? value : {};
  const rawCapabilities = profile.capabilities && typeof profile.capabilities === "object" ? profile.capabilities : {};
  const capabilities = { ...DEFAULT_DEPLOYMENT_CAPABILITIES };
  Object.keys(DEFAULT_DEPLOYMENT_CAPABILITIES).forEach((key) => {
    const fallbackValue = DEFAULT_DEPLOYMENT_CAPABILITIES[key];
    const nextValue = rawCapabilities[key];
    if (typeof fallbackValue === "boolean" && typeof nextValue === "boolean") {
      capabilities[key] = nextValue;
    } else if (Array.isArray(fallbackValue) && Array.isArray(nextValue)) {
      capabilities[key] = nextValue.filter((item) => typeof item === "string");
    }
  });

  return {
    edition: typeof profile.edition === "string" ? profile.edition : DEFAULT_DEPLOYMENT_PROFILE.edition,
    target: typeof profile.target === "string" ? profile.target : DEFAULT_DEPLOYMENT_PROFILE.target,
    name: typeof profile.name === "string" && profile.name.trim() ? profile.name : DEFAULT_DEPLOYMENT_PROFILE.name,
    capabilities
  };
}
