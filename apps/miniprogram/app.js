function resolveDefaultApiBaseUrl() {
  try {
    const envVersion = wx.getAccountInfoSync().miniProgram.envVersion;
    return envVersion === "release" ? "https://ai.neimou.com" : "https://dev.neimou.com";
  } catch (error) {
    return "https://dev.neimou.com";
  }
}

const NOTIFICATION_POLLING_INTERVAL_MS = 20000;
const SEEN_NOTIFICATION_IDS_KEY = "seenNotificationIds";

function notificationApi() {
  return require("./utils/api");
}

App({
  globalData: {
    apiBaseUrl: resolveDefaultApiBaseUrl(),
    deploymentProfile: null,
    deploymentProfilePromise: null,
    notificationTimer: null,
    seenNotificationIds: [],
    token: "",
    user: null
  },

  onLaunch() {
    const token = wx.getStorageSync("authToken");
    if (token) {
      this.globalData.token = token;
    }
    const seenIds = wx.getStorageSync(SEEN_NOTIFICATION_IDS_KEY);
    this.globalData.seenNotificationIds = Array.isArray(seenIds) ? seenIds : [];
    this.startNotificationPolling();
  },

  onShow() {
    this.startNotificationPolling();
    this.pollNotifications();
  },

  onHide() {
    this.stopNotificationPolling();
  },

  startNotificationPolling() {
    if (this.globalData.notificationTimer) return;
    this.globalData.notificationTimer = setInterval(() => {
      this.pollNotifications();
    }, NOTIFICATION_POLLING_INTERVAL_MS);
  },

  stopNotificationPolling() {
    if (!this.globalData.notificationTimer) return;
    clearInterval(this.globalData.notificationTimer);
    this.globalData.notificationTimer = null;
  },

  async pollNotifications() {
    const api = notificationApi();
    if (!api.getToken()) return;
    try {
      const data = await api.getNotifications(20);
      const notifications = data.notifications || [];
      const unreadCount = data.unreadCount || 0;
      this.updateNotificationBadge(unreadCount);
      const seen = new Set(this.globalData.seenNotificationIds || []);
      const next = notifications.find((item) => item.type === "ecommerce_job_finished" && !item.readAt && !seen.has(item.id));
      this.globalData.seenNotificationIds = notifications
        .map((item) => item.id)
        .concat(Array.from(seen))
        .filter((id, index, ids) => id && ids.indexOf(id) === index)
        .slice(0, 80);
      wx.setStorageSync(SEEN_NOTIFICATION_IDS_KEY, this.globalData.seenNotificationIds);
      if (next) {
        this.showTaskNotification(next);
      }
    } catch {
      // Polling should stay quiet while the user is using the mini program.
    }
  },

  updateNotificationBadge(unreadCount) {
    if (unreadCount > 0) {
      wx.setTabBarBadge({ index: 2, text: unreadCount > 99 ? "99+" : String(unreadCount) }).catch(() => undefined);
    } else {
      wx.removeTabBarBadge({ index: 2 }).catch(() => undefined);
    }
  },

  showTaskNotification(notification) {
    const api = notificationApi();
    wx.showModal({
      title: notification.title || "任务已完成",
      content: notification.body || "你的任务已完成，快去查看结果。",
      confirmText: "查看",
      cancelText: "关闭",
      success: (res) => {
        if (res.confirm) {
          api.markNotificationRead(notification.id).catch(() => undefined);
          wx.switchTab({ url: "/pages/jobs/jobs" });
        }
      }
    });
  }
});
