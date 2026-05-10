const api = require("../../utils/api");

const HEADER_TYPE_OPTIONS = [
  { label: "企业抬头", value: "company" },
  { label: "个人/其他", value: "personal" }
];

const DEFAULT_INVOICE_CONTENT = "商品图生成服务";

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
    user: null,
    invoiceHeaderTypeIndex: 0,
    invoiceHeaderTypeLabels: HEADER_TYPE_OPTIONS.map((item) => item.label),
    invoiceTitle: "",
    invoiceTaxNumber: "",
    invoiceContent: DEFAULT_INVOICE_CONTENT,
    invoiceAmount: "",
    invoiceEmail: "",
    invoicePhone: "",
    invoiceCompanyAddress: "",
    invoiceBankName: "",
    invoiceBankAccount: "",
    invoiceRemark: "",
    invoiceSaving: false,
    invoiceSummary: null,
    invoiceStats: {
      paidAmount: "0.00",
      issuedAmount: "0.00",
      requestableAmount: "0.00",
      requestableAmountCents: 0
    },
    invoiceLatest: null,
    invoiceApplications: []
  },

  onShow() {
    if (!api.getToken()) {
      this.resetInvoiceState();
      this.setData({ user: null });
      return;
    }
    this.loadProfile();
    this.loadInvoiceApplications();
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

  async loadInvoiceApplications() {
    this.setData({ invoiceSaving: false });
    try {
      const data = await api.getInvoiceApplications();
      const applications = (data.applications || []).map(formatInvoiceRecord);
      this.setData({
        invoiceSummary: data,
        invoiceStats: formatInvoiceSummary(data.summary),
        invoiceLatest: data.profile ? formatInvoiceProfile(data.profile) : null,
        invoiceApplications: applications
      });
      if (data.profile) {
        this.fillInvoiceForm(data.profile);
      }
    } catch (error) {
      wx.showToast({ title: error.message, icon: "none" });
      this.resetInvoiceState();
    }
  },

  fillInvoiceForm(profile) {
    const headerTypeIndex = profile.headerType === "personal" ? 1 : 0;
    this.setData({
      invoiceHeaderTypeIndex: headerTypeIndex,
      invoiceTitle: profile.title || "",
      invoiceTaxNumber: profile.taxNumber || "",
      invoiceContent: profile.invoiceContent || DEFAULT_INVOICE_CONTENT,
      invoiceAmount: formatAmountYuan(profile.amountCents),
      invoiceEmail: profile.email || "",
      invoicePhone: profile.phone || "",
      invoiceCompanyAddress: profile.companyAddress || "",
      invoiceBankName: profile.bankName || "",
      invoiceBankAccount: profile.bankAccount || "",
      invoiceRemark: profile.remark || ""
    });
  },

  resetInvoiceState() {
    this.setData({
      invoiceSummary: null,
      invoiceStats: formatInvoiceSummary(null),
      invoiceLatest: null,
      invoiceApplications: [],
      invoiceHeaderTypeIndex: 0,
      invoiceTitle: "",
      invoiceTaxNumber: "",
      invoiceContent: DEFAULT_INVOICE_CONTENT,
      invoiceAmount: "",
      invoiceEmail: "",
      invoicePhone: "",
      invoiceCompanyAddress: "",
      invoiceBankName: "",
      invoiceBankAccount: "",
      invoiceRemark: ""
    });
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

  onInvoiceHeaderTypeChange(event) {
    this.setData({ invoiceHeaderTypeIndex: Number(event.detail.value) });
  },

  onInvoiceInput(event) {
    this.setData({ [event.currentTarget.dataset.field]: event.detail.value });
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

  async submitInvoiceApplication() {
    if (!api.getToken()) {
      wx.navigateTo({ url: "/pages/login/login" });
      return;
    }

    const payload = this.readInvoiceForm();
    if (!payload) {
      return;
    }

    this.setData({ invoiceSaving: true });
    try {
      const data = await api.applyInvoiceApplication(payload);
      const applications = (data.applications || []).map(formatInvoiceRecord);
      this.setData({
        invoiceSummary: data,
        invoiceStats: formatInvoiceSummary(data.summary),
        invoiceLatest: data.profile ? formatInvoiceProfile(data.profile) : null,
        invoiceApplications: applications
      });
      if (data.profile) {
        this.fillInvoiceForm(data.profile);
      }
      wx.showToast({ title: "开票信息已保存", icon: "success" });
    } catch (error) {
      wx.showToast({ title: error.message, icon: "none" });
    } finally {
      this.setData({ invoiceSaving: false });
    }
  },

  readInvoiceForm() {
    const headerType = HEADER_TYPE_OPTIONS[this.data.invoiceHeaderTypeIndex]?.value || "company";
    const title = this.data.invoiceTitle.trim();
    const taxNumber = this.data.invoiceTaxNumber.trim();
    const invoiceContent = this.data.invoiceContent.trim() || DEFAULT_INVOICE_CONTENT;
    const email = this.data.invoiceEmail.trim();
    const phone = this.data.invoicePhone.trim();
    const companyAddress = this.data.invoiceCompanyAddress.trim();
    const bankName = this.data.invoiceBankName.trim();
    const bankAccount = this.data.invoiceBankAccount.trim();
    const remark = this.data.invoiceRemark.trim();
    const amountCents = parseAmountYuanToCents(this.data.invoiceAmount);

    if (!title) {
      wx.showToast({ title: "请填写发票抬头", icon: "none" });
      return null;
    }
    if (headerType === "company" && !taxNumber) {
      wx.showToast({ title: "企业抬头请填写纳税人识别号", icon: "none" });
      return null;
    }
    if (!invoiceContent) {
      wx.showToast({ title: "请填写开票内容", icon: "none" });
      return null;
    }
    if (!amountCents) {
      wx.showToast({ title: "请填写开票金额", icon: "none" });
      return null;
    }
    if (amountCents > this.data.invoiceStats.requestableAmountCents) {
      wx.showToast({ title: `最多可申请 ${this.data.invoiceStats.requestableAmount} 元`, icon: "none" });
      return null;
    }
    if (!email || !email.includes("@")) {
      wx.showToast({ title: "请填写接收邮箱", icon: "none" });
      return null;
    }

    return {
      headerType,
      title,
      taxNumber: headerType === "company" ? taxNumber : taxNumber || undefined,
      invoiceContent,
      amountCents,
      email,
      phone: phone || undefined,
      companyAddress: companyAddress || undefined,
      bankName: bankName || undefined,
      bankAccount: bankAccount || undefined,
      remark: remark || undefined
    };
  },

  logout() {
    api.clearSession();
    this.resetInvoiceState();
    this.setData({ user: null });
    wx.showToast({ title: "已退出", icon: "success" });
  }
});

function formatAmountYuan(amountCents) {
  return ((Number(amountCents) || 0) / 100).toFixed(2);
}

function formatInvoiceSummary(summary) {
  return {
    paidAmount: formatAmountYuan(summary && summary.paidAmountCents),
    issuedAmount: formatAmountYuan(summary && summary.issuedAmountCents),
    requestableAmount: formatAmountYuan(summary && summary.requestableAmountCents),
    requestableAmountCents: Number((summary && summary.requestableAmountCents) || 0)
  };
}

function formatInvoiceProfile(profile) {
  return {
    title: profile.title,
    amountText: formatAmountYuan(profile.amountCents),
    headerTypeText: profile.headerType === "personal" ? "个人/其他" : "企业抬头",
    createdAtText: formatDateTime(profile.createdAt)
  };
}

function formatInvoiceRecord(record) {
  return {
    id: record.id,
    title: record.title,
    amountText: formatAmountYuan(record.amountCents),
    statusText: invoiceStatusText(record.status),
    createdAtText: formatDateTime(record.createdAt)
  };
}

function invoiceStatusText(status) {
  if (status === "processing") return "处理中";
  if (status === "issued") return "已开具";
  if (status === "rejected") return "已驳回";
  return "待处理";
}

function formatDateTime(value) {
  if (!value) return "";
  return String(value).replace("T", " ").slice(0, 16);
}

function parseAmountYuanToCents(value) {
  const amount = Number(String(value || "").replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) {
    return 0;
  }
  return Math.round(amount * 100);
}
