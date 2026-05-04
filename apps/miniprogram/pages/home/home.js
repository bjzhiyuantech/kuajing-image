const api = require("../../utils/api");

const STATUS_LABELS = {
  failed: "失败",
  partial: "部分完成",
  pending: "排队中",
  running: "生成中",
  succeeded: "已完成"
};

const FEATURES = [
  {
    key: "scene",
    icon: "图",
    title: "场景出图",
    desc: "主图、卖点图、生活方式图"
  },
  {
    key: "translate",
    icon: "译",
    title: "图片翻译",
    desc: "保留布局，多语言本地化"
  },
  {
    key: "watermark",
    icon: "净",
    title: "去水印",
    desc: "清理角标、平台标识和旧水印"
  },
  {
    key: "category",
    icon: "包",
    title: "品类图包",
    desc: "按品类生成完整商品图组"
  }
];

const WORKFLOWS = [
  {
    key: "launch",
    badge: "上新推荐",
    count: "5 张起",
    title: "爆款商品图组",
    desc: "适合亚马逊、Allegro、TikTok Shop 商品上新。",
    tags: ["白底主图", "卖点图", "社媒图"]
  },
  {
    key: "localize",
    badge: "本地化",
    count: "多语言",
    title: "图片文字翻译",
    desc: "保留原图构图，把营销文案翻译成目标市场语言。",
    tags: ["英文", "波兰文", "德文"]
  },
  {
    key: "category",
    badge: "批量铺货",
    count: "图包",
    title: "品类上新模板",
    desc: "围绕品类场景生成完整商品图素材。",
    tags: ["围巾", "服饰", "配饰"]
  }
];

Page({
  data: {
    features: FEATURES,
    memberCopy: "登录后同步任务记录和会员额度",
    memberTitle: "未登录",
    recentJobs: [],
    userInitial: "我",
    workflows: WORKFLOWS
  },

  onShow() {
    this.loadHomeData();
  },

  onPullDownRefresh() {
    this.loadHomeData().finally(() => wx.stopPullDownRefresh());
  },

  async loadHomeData() {
    if (!api.getToken()) {
      this.setData({
        memberCopy: "登录后同步任务记录和会员额度",
        memberTitle: "未登录",
        recentJobs: [],
        userInitial: "我"
      });
      return;
    }

    try {
      const [meData, jobsData] = await Promise.all([api.me(), api.getJobs()]);
      const user = meData.user || meData;
      const quotaTotal = user.quotaTotal || 0;
      const quotaUsed = user.quotaUsed || 0;
      const remainingQuota = Math.max(0, quotaTotal - quotaUsed);
      this.setData({
        memberCopy: `剩余额度 ${remainingQuota} 张 · 已用 ${quotaUsed} 张`,
        memberTitle: user.planName || user.planId || "会员账户",
        recentJobs: (jobsData.jobs || []).slice(0, 3).map((job) => ({
          ...job,
          statusLabel: STATUS_LABELS[job.status] || job.status
        })),
        userInitial: (user.displayName || user.email || "我").slice(0, 1)
      });
    } catch (error) {
      this.setData({
        memberCopy: "登录状态已过期，点击重新登录",
        memberTitle: "未登录",
        recentJobs: [],
        userInitial: "我"
      });
    }
  },

  goCreate() {
    wx.switchTab({ url: "/pages/workbench/workbench" });
  },

  goJobs() {
    wx.switchTab({ url: "/pages/jobs/jobs" });
  },

  goProfile() {
    wx.switchTab({ url: "/pages/profile/profile" });
  },

  openFeature(event) {
    wx.setStorageSync("createPreset", event.currentTarget.dataset.key);
    this.goCreate();
  },

  openWorkflow(event) {
    wx.setStorageSync("createPreset", event.currentTarget.dataset.key);
    this.goCreate();
  }
});
