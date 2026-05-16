const api = require("../../utils/api");

Page({
  data: {
    loading: false,
    notifications: [],
    unreadCount: 0
  },

  onShow() {
    this.loadNotifications();
  },

  onPullDownRefresh() {
    this.loadNotifications().finally(() => wx.stopPullDownRefresh());
  },

  async loadNotifications() {
    if (!api.getToken()) {
      wx.navigateTo({ url: "/pages/login/login" });
      return;
    }
    this.setData({ loading: true });
    try {
      const data = await api.getNotifications(50);
      this.setData({
        notifications: (data.notifications || []).map(formatNotification),
        unreadCount: data.unreadCount || 0
      });
    } catch (error) {
      wx.showToast({ title: error.message, icon: "none" });
    } finally {
      this.setData({ loading: false });
    }
  },

  async openNotification(event) {
    const id = event.currentTarget.dataset.id;
    const notification = this.data.notifications.find((item) => item.id === id);
    if (!notification) return;
    try {
      if (!notification.readAt) {
        const data = await api.markNotificationRead(id);
        this.setData({
          notifications: (data.notifications || []).map(formatNotification),
          unreadCount: data.unreadCount || 0
        });
      }
      if (notification.type === "ecommerce_job_finished") {
        wx.switchTab({ url: "/pages/jobs/jobs" });
      }
    } catch (error) {
      wx.showToast({ title: error.message, icon: "none" });
    }
  },

  async markAllRead() {
    try {
      const data = await api.markAllNotificationsRead();
      this.setData({
        notifications: (data.notifications || []).map(formatNotification),
        unreadCount: data.unreadCount || 0
      });
    } catch (error) {
      wx.showToast({ title: error.message, icon: "none" });
    }
  }
});

function formatNotification(notification) {
  return {
    ...notification,
    timeText: formatTime(notification.createdAt),
    unread: !notification.readAt,
    severityClass: notification.severity || "info"
  };
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (number) => String(number).padStart(2, "0");
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
