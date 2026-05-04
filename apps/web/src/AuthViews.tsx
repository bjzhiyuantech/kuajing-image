import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock,
  CreditCard,
  Database,
  ExternalLink,
  Layers3,
  HardDrive,
  ImageIcon,
  Loader2,
  Lock,
  Mail,
  Package,
  Pencil,
  Plus,
  Receipt,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
  Sparkles,
  User,
  UserPlus,
  Users,
  Wallet
} from "lucide-react";
import type React from "react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { authFetch, readApiError, type AuthSession, type AuthUser } from "./authClient";
import { BRAND_TAGLINE, BrandMark, BrandName } from "./Brand";
import type { AdminWechatMiniAppConfigResponse, MaskedSecret } from "@gpt-image-canvas/shared";

type AuthMode = "login" | "register";

const audienceCards = [
  {
    title: "1688 工厂主",
    subtitle: "不再等摄影棚和模特排期",
    description: "一张白底商品图就能生成模特图、场景图和详情页素材，把拍摄成本、排期等待和反复补拍降下来。",
    points: ["拍摄成本高", "模特不好请", "出图效率低"],
    tone: "factory"
  },
  {
    title: "跨境电商卖家",
    subtitle: "工厂图一键变海外市场素材",
    description: "把中文商品图、工厂实拍图改成更适合欧美、日韩、东南亚市场的场景图、卖点图和多语言海报。",
    points: ["图片质量差", "文字翻译难", "场景不符合海外审美"],
    tone: "global"
  },
  {
    title: "国内电商运营",
    subtitle: "文案、场景、尺寸快速重做到满意",
    description: "围绕主图、详情页、活动图持续调整，快速重做构图、文案和尺寸，减少美工沟通和返工。",
    points: ["文案效果不稳", "修图速度慢", "反复改到不满意"],
    tone: "domestic"
  }
] as const;

const sellingPoints = [
  {
    icon: Clock,
    title: "无需模特，7x24 小时出图",
    description: "服饰、箱包、美妆、家居都能生成真人使用和生活方式场景，不等排期，不受天气和场地限制。"
  },
  {
    icon: RefreshCw,
    title: "动态调整，直到满意为止",
    description: "换背景、换模特、换角度、换文案、换尺寸，围绕同一商品连续迭代，不满意就继续改。"
  },
  {
    icon: Package,
    title: "一张图生成全平台素材",
    description: "主图、场景图、详情图、海报图、社媒图一次性产出，适配店铺、独立站和内容渠道。"
  },
  {
    icon: Database,
    title: "批量采集，翻译去水印不改布局",
    description: "从国内电商平台批量获取图片，一键翻译、去水印并尽量保留原版布局，提高跨境铺货效率。"
  }
] as const;

const installSteps = [
  { title: "下载插件", description: "获取浏览器插件安装包" },
  { title: "安装插件", description: "一键安装到常用浏览器" },
  { title: "注册获得试用账号", description: "开通账号并完成授权" },
  { title: "上传一张产品图", description: "白底图、实拍图都可开始" },
  { title: "生成效果图", description: "主图、场景图、详情图同步产出" },
  { title: "下载使用图片", description: "保存到本地或继续二次调整" }
] as const;

const modelChips = [
  "GPT-Image",
  "GPT-4o",
  "Gemini",
  "Claude",
  "Flux",
  "Stable Diffusion",
  "Midjourney",
  "Qwen Image",
  "Seedream",
  "Kling",
  "Runway"
] as const;

export function HomePage({
  onAuthNavigate
}: {
  onAuthNavigate: (mode: AuthMode) => void;
}) {
  return (
    <main className="home-page app-view">
      <header className="home-nav" aria-label="首页导航">
        <a className="brand-lockup home-nav__brand" href="/" aria-label="商图 AI 助手首页">
          <BrandMark />
          <div>
            <BrandName />
          </div>
        </a>
        <nav className="home-nav__links" aria-label="产品导航">
          <a href="#selling-points">产品卖点</a>
          <a href="#audience">适用人群</a>
          <a href="#models">模型能力</a>
          <a href="#install">安装插件</a>
          <a href="#pricing">价格</a>
          <button type="button" onClick={() => onAuthNavigate("login")}>
            登录
          </button>
          <button className="home-nav__primary" type="button" onClick={() => onAuthNavigate("register")}>
            免费注册
          </button>
        </nav>
      </header>

      {/* Hero Section */}
      <section className="home-hero" aria-labelledby="home-hero-title">
        <div className="home-hero__content">
          <p className="home-eyebrow">
            <Sparkles className="size-4" aria-hidden="true" />
            AI 驱动的电商图片生产工作台
          </p>
          <h1 id="home-hero-title">一张商品图，<br />生成全套电商场景素材</h1>
          <p className="home-hero__lead">
            不用请模特、不用反复找美工、不用高价买素材。<br />
            上传一张产品图，快速生成主图、场景图、详情图、海报图和多语言平台素材。
          </p>
          <div className="home-hero__actions">
            <button className="home-button home-button--primary" type="button" onClick={() => onAuthNavigate("register")}>
              免费开始试用
              <ArrowRight className="size-4" aria-hidden="true" />
            </button>
            <a className="home-button home-button--secondary" href="#install">
              安装浏览器插件
            </a>
          </div>
          <div className="home-hero__proof" aria-label="核心优势">
            <span>
              <CheckCircle2 className="size-4" aria-hidden="true" />
              无需模特
            </span>
            <span>
              <CheckCircle2 className="size-4" aria-hidden="true" />
              7x24 小时出图
            </span>
            <span>
              <CheckCircle2 className="size-4" aria-hidden="true" />
              动态调整到满意
            </span>
          </div>
        </div>

        <div className="home-hero__screenshot">
          <img
            src="/images/hero-screenshot.svg"
            alt="商图 AI 助手工作台界面预览"
            className="home-hero__img"
          />
        </div>
      </section>

      {/* Audience Section */}
      <section className="home-section" id="audience" aria-labelledby="home-audience-title">
        <div className="home-section__header home-section__header--center">
          <h2 id="home-audience-title">不同卖家，同一个问题：图片生产太慢、太贵、太不稳定</h2>
        </div>
        <div className="home-audience-grid">
          {audienceCards.map((item) => (
            <article className="home-audience-card" data-tone={item.tone} key={item.title}>
              <div className="home-audience-card__text">
                <h3>{item.title}</h3>
                <strong>{item.subtitle}</strong>
                <p>{item.description}</p>
                <ul>
                  {item.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </div>
              <div className="home-audience-card__visual">
                <img
                  src={`/images/audience-${item.tone}.svg`}
                  alt={`${item.title}场景示意`}
                  loading="lazy"
                />
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Selling Points Section */}
      <section className="home-section" id="selling-points" aria-labelledby="home-selling-title">
        <div className="home-section__header home-section__header--center">
          <h2 id="home-selling-title">把拍摄、翻译、修图和素材采购压缩成一次生成</h2>
        </div>
        <div className="home-selling-grid">
          {sellingPoints.map((item, index) => {
            const Icon = item.icon;
            const imgNames = ["selling-model", "selling-iterate", "selling-platform", "selling-batch"];
            return (
              <article className="home-selling-card" key={item.title}>
                <div className="home-selling-card__head">
                  <span className="home-selling-card__icon">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <h3>{item.title}</h3>
                </div>
                <p>{item.description}</p>
                <div className="home-selling-card__visual">
                  <img
                    src={`/images/${imgNames[index]}.svg`}
                    alt={item.title}
                    loading="lazy"
                  />
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* Install Steps Section */}
      <section className="home-section home-install" id="install" aria-labelledby="home-install-title">
        <div className="home-section__header home-section__header--center">
          <h2 id="home-install-title">从安装插件到下载图片，流程清清楚楚</h2>
        </div>
        <ol className="home-steps">
          {installSteps.map((step, index) => (
            <li key={step.title}>
              <div className="home-steps__number">
                <span>{index + 1}</span>
              </div>
              <strong>{step.title}</strong>
              <p>{step.description}</p>
            </li>
          ))}
        </ol>
        <div className="home-install__visual">
          <img src="/images/install-flow.svg" alt="安装流程示意图" loading="lazy" />
        </div>
      </section>

      {/* Models Section */}
      <section className="home-models" id="models" aria-labelledby="home-model-title">
        <div className="home-models__content">
          <p className="home-eyebrow home-eyebrow--dark">
            <ShieldCheck className="size-4" aria-hidden="true" />
            多模型能力底座 / 可接入模型生态
          </p>
          <h2 id="home-model-title">接入顶级视觉与语言模型能力</h2>
          <p>根据任务自动组合生成、翻译、去水印、扩图、改图和文案能力，兼顾效果、速度与成本。</p>
          <div className="home-models__chips" aria-label="模型列表">
            {modelChips.map((model) => (
              <span key={model}>{model}</span>
            ))}
          </div>
          <p className="home-models__note">不同任务会智能调用不同模型组合，兼顾效果、速度与成本。</p>
        </div>
        <div className="home-models__visual" aria-hidden="true">
          <img src="/images/models-cube.svg" alt="" />
        </div>
      </section>

      {/* CTA Section */}
      <section className="home-cta" id="pricing" aria-labelledby="home-cta-title">
        <div className="home-cta__text">
          <h2 id="home-cta-title">开始把下一批商品图<br />做得更快、更稳</h2>
          <ul className="home-cta__benefits">
            <li>
              <CheckCircle2 className="size-4" aria-hidden="true" />
              免费试用，无需信用卡
            </li>
            <li>
              <CheckCircle2 className="size-4" aria-hidden="true" />
              先用一张商品图跑通效果
            </li>
            <li>
              <CheckCircle2 className="size-4" aria-hidden="true" />
              再决定是否批量生成
            </li>
          </ul>
          <div className="home-cta__actions">
            <button className="home-button home-button--primary" type="button" onClick={() => onAuthNavigate("register")}>
              免费注册试用
            </button>
            <button className="home-button home-button--ghost" type="button" onClick={() => onAuthNavigate("login")}>
              已有账户登录
            </button>
          </div>
        </div>
        <div className="home-cta__preview">
          <img src="/images/cta-preview.svg" alt="产品预览" loading="lazy" />
        </div>
      </section>

      {/* Footer */}
      <footer className="home-footer">
        <div className="home-footer__inner">
          <div className="home-footer__brand">
            <BrandMark />
            <span>商图 AI 助手</span>
          </div>
          <p className="home-footer__copy">© 2024 商图AI助手. All rights reserved.</p>
        </div>
      </footer>
    </main>
  );
}

export function AuthScreen({
  mode,
  onModeChange,
  onAuthenticated,
  onLogin,
  onRegister,
  onSendEmailCode
}: {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  onAuthenticated: (session: AuthSession) => void;
  onLogin: (email: string, password: string) => Promise<AuthSession>;
  onRegister: (email: string, password: string, displayName: string, emailCode: string) => Promise<AuthSession>;
  onSendEmailCode: (email: string) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const isRegister = mode === "register";

  async function submitForm(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError("");

    if (!email.trim() || !password) {
      setError("请输入邮箱和密码。");
      return;
    }
    if (isRegister && !displayName.trim()) {
      setError("请输入显示名。");
      return;
    }
    if (isRegister && !emailCode.trim()) {
      setError("请输入邮箱验证码。");
      return;
    }

    setIsSubmitting(true);
    try {
      const session = isRegister ? await onRegister(email, password, displayName, emailCode) : await onLogin(email, password);
      onAuthenticated(session);
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : isRegister ? "注册失败。" : "登录失败。");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function sendEmailCode(): Promise<void> {
    setError("");
    setNotice("");
    if (!email.trim()) {
      setError("请先输入邮箱。");
      return;
    }

    setIsSendingCode(true);
    try {
      await onSendEmailCode(email);
      setNotice("验证码已发送，请查收邮箱。");
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "验证码发送失败。");
    } finally {
      setIsSendingCode(false);
    }
  }

  return (
    <main className="auth-workspace app-view">
      <section className="auth-panel" aria-labelledby="auth-title">
        <div className="auth-panel__intro">
          <div className="brand-lockup">
            <BrandMark />
            <div>
              <BrandName />
              <p className="brand-tagline">{BRAND_TAGLINE}</p>
            </div>
          </div>
          <div className="auth-panel__summary">
            <p className="auth-eyebrow">
              <Sparkles className="size-3.5" aria-hidden="true" />
              Workspace
            </p>
            <h1 id="auth-title">{isRegister ? "创建账户后进入工作台" : "登录后继续创作"}</h1>
            <p>画布、图库、生成记录和云存储设置会绑定到你的账户。</p>
          </div>
        </div>

        <form className="auth-form" onSubmit={(event) => void submitForm(event)}>
          <div className="auth-switch" role="tablist" aria-label="认证方式">
            <button
              aria-selected={!isRegister}
              className="auth-switch__tab"
              data-active={!isRegister}
              role="tab"
              type="button"
              onClick={() => {
                setError("");
                setNotice("");
                onModeChange("login");
              }}
            >
              登录
            </button>
            <button
              aria-selected={isRegister}
              className="auth-switch__tab"
              data-active={isRegister}
              role="tab"
              type="button"
              onClick={() => {
                setError("");
                setNotice("");
                onModeChange("register");
              }}
            >
              注册
            </button>
          </div>

          {isRegister ? (
            <label className="auth-field">
              <span>显示名</span>
              <div className="auth-input">
                <User className="size-4" aria-hidden="true" />
                <input
                  autoComplete="name"
                  name="displayName"
                  placeholder="例如：Mia Chen"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                />
              </div>
            </label>
          ) : null}

          <label className="auth-field">
            <span>邮箱</span>
            <div className="auth-input">
              <Mail className="size-4" aria-hidden="true" />
              <input
                autoComplete="email"
                name="email"
                placeholder="you@example.com"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
          </label>

          {isRegister ? (
            <label className="auth-field">
              <span>邮箱验证码</span>
              <div className="auth-input auth-input--with-action">
                <ShieldCheck className="size-4" aria-hidden="true" />
                <input
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  maxLength={6}
                  name="emailCode"
                  placeholder="6 位验证码"
                  value={emailCode}
                  onChange={(event) => setEmailCode(event.target.value)}
                />
                <button className="auth-input__action" disabled={isSendingCode} type="button" onClick={() => void sendEmailCode()}>
                  {isSendingCode ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
                  发送
                </button>
              </div>
            </label>
          ) : null}

          <label className="auth-field">
            <span>密码</span>
            <div className="auth-input">
              <Lock className="size-4" aria-hidden="true" />
              <input
                autoComplete={isRegister ? "new-password" : "current-password"}
                minLength={6}
                name="password"
                placeholder="至少 6 位"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
          </label>

          {error ? (
            <div className="auth-alert" role="alert">
              <AlertTriangle className="size-4" aria-hidden="true" />
              <p>{error}</p>
            </div>
          ) : null}
          {notice ? (
            <div className="admin-success" role="status">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              <p>{notice}</p>
            </div>
          ) : null}

          <button className="primary-action h-11" disabled={isSubmitting} type="submit">
            {isSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="size-4" aria-hidden="true" />}
            {isRegister ? "注册并进入" : "登录工作台"}
          </button>
        </form>
      </section>
    </main>
  );
}

export function AccountPage({ user }: { user: AuthUser }) {
  const [billing, setBilling] = useState<AccountBillingState>(() => createAccountBillingState(user));
  const [rechargeAmount, setRechargeAmount] = useState("50");
  const [billingLoading, setBillingLoading] = useState(true);
  const [billingAction, setBillingAction] = useState("");
  const [billingActionLoading, setBillingActionLoading] = useState("");
  const [billingError, setBillingError] = useState("");
  const quotaTotal = billing.summary.quotaTotal ?? user.quotaTotal ?? 0;
  const quotaUsed = billing.summary.quotaUsed ?? user.quotaUsed ?? 0;
  const quotaRemaining = billing.summary.packageRemaining ?? Math.max(0, quotaTotal - quotaUsed);
  const quotaPercent = quotaTotal > 0 ? Math.min(100, Math.round((quotaUsed / quotaTotal) * 100)) : 0;
  const storageQuota = billing.summary.storageQuotaBytes ?? user.storageQuotaBytes ?? 0;
  const storageUsed = billing.summary.storageUsedBytes ?? user.storageUsedBytes ?? 0;
  const storagePercent = storageQuota > 0 ? Math.min(100, Math.round((storageUsed / storageQuota) * 100)) : 0;
  const currentPlanId = billing.currentPlan?.id || user.planId;
  const currentPlanName = billing.currentPlan?.name || user.planName || user.planId || "未设置";
  const currentPlanExpiresAt = billing.currentPlanExpiresAt || user.planExpiresAt;
  const plans = billing.plans.length > 0 ? billing.plans : fallbackBillingPlans;
  const activePlanBlocksPurchase = Boolean(
    currentPlanId &&
      currentPlanId !== "free" &&
      currentPlanExpiresAt &&
      new Date(currentPlanExpiresAt).getTime() > Date.now() &&
      quotaRemaining > 0
  );

  async function loadBilling({ preserveNotice = false, signal }: { preserveNotice?: boolean; signal?: AbortSignal } = {}): Promise<void> {
    setBillingLoading(true);
    setBillingError("");
    if (!preserveNotice) {
      setBillingAction("");
    }
    try {
      const [summaryResult, ordersResult] = await Promise.allSettled([
        authFetch("/api/billing/summary"),
        authFetch("/api/billing/orders")
      ]);
      if (summaryResult.status !== "fulfilled") {
        throw summaryResult.reason instanceof Error ? summaryResult.reason : new Error("计费数据加载失败。");
      }
      const summaryResponse = summaryResult.value;
      if (!summaryResponse.ok) {
        throw new Error(await readApiError(summaryResponse, "计费数据加载失败。"));
      }
      const summaryBody = await summaryResponse.json();
      let ordersBody: unknown = {};
      if (ordersResult.status === "fulfilled" && ordersResult.value.ok) {
        ordersBody = await ordersResult.value.json();
      }
      if (signal?.aborted) {
        return;
      }
      const parsed = parseAccountBilling(summaryBody, user);
      const parsedOrders = parseBillingOrders(ordersBody);
      setBilling({
        ...parsed,
        orders: parsedOrders.length > 0 ? parsedOrders : parsed.orders
      });
    } catch (loadError) {
      if (!signal?.aborted) {
        setBilling(createAccountBillingState(user));
        setBillingError(loadError instanceof Error ? loadError.message : "计费数据加载失败。");
      }
    } finally {
      if (!signal?.aborted) {
        setBillingLoading(false);
      }
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    const returnedFromPayment = new URLSearchParams(window.location.search).has("billingReturn");
    if (returnedFromPayment) {
      setBillingAction("已从支付页面返回，正在刷新余额和订单状态。若订单仍显示待支付，请稍后再刷新。");
    }
    void loadBilling({ preserveNotice: returnedFromPayment, signal: controller.signal });
    return () => controller.abort();
  }, [user.id]);

  async function submitRecharge(): Promise<void> {
    const amountCents = moneyToCents(rechargeAmount);
    if (!amountCents || amountCents <= 0) {
      setBillingAction("请输入有效充值金额。");
      return;
    }
    setBillingActionLoading("recharge");
    setBillingError("");
    setBillingAction("");
    try {
      const response = await authFetch("/api/billing/recharge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCents, returnUrl: accountReturnUrl() })
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, "充值下单失败。"));
      }
      const body = await response.json();
      const paymentUrl = paymentUrlFrom(body);
      if (paymentUrl) {
        setBillingAction("充值订单已创建，正在打开支付宝支付。支付完成返回后会自动刷新。");
        window.location.assign(paymentUrl);
        return;
      }
      setBillingAction("充值订单已创建，请在订单列表查看状态。");
      await loadBilling({ preserveNotice: true });
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : "充值下单失败。");
    } finally {
      setBillingActionLoading("");
    }
  }

  async function purchasePlan(plan: BillingPlan, paymentMethod: "balance" | "alipay"): Promise<void> {
    if (activePlanBlocksPurchase) {
      setBillingAction("当前套餐未到期且仍有余量，新购无法叠加，只能取高。建议等套餐到期或额度用完后再购买。");
      return;
    }
    if (paymentMethod === "balance" && billing.summary.balanceCents < plan.priceCents) {
      setBillingAction(`余额不足，还差 ${formatMoney(plan.priceCents - billing.summary.balanceCents, plan.currency)}，可先充值或选择支付宝购买。`);
      return;
    }
    setBillingActionLoading(`${plan.id}:${paymentMethod}`);
    setBillingError("");
    setBillingAction("");
    try {
      const response = await authFetch(`/api/billing/plans/${encodeURIComponent(plan.id)}/purchase`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentMethod, returnUrl: accountReturnUrl() })
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, paymentMethod === "balance" ? "余额购买失败。" : "支付宝购买下单失败。"));
      }
      const body = await response.json();
      const paymentUrl = paymentUrlFrom(body);
      if (paymentMethod === "alipay" && paymentUrl) {
        setBillingAction("套餐订单已创建，正在打开支付宝支付。支付完成返回后会自动刷新。");
        window.location.assign(paymentUrl);
        return;
      }
      setBillingAction(paymentMethod === "balance" ? "套餐已使用余额购买成功，正在刷新权益。" : "套餐订单已创建，请完成支付后刷新。");
      await loadBilling({ preserveNotice: true });
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : "套餐购买失败。");
    } finally {
      setBillingActionLoading("");
    }
  }

  return (
    <main className="account-page app-view">
      <section className="settings-panel" aria-labelledby="account-title">
        <div className="settings-panel__header">
          <div>
            <p className="settings-eyebrow">Account</p>
            <h1 id="account-title">个人中心</h1>
          </div>
          <span className="role-badge">{roleLabel(user.role)}</span>
        </div>

        <div className="account-grid">
          <InfoTile label="邮箱" value={user.email} icon={<Mail className="size-4" aria-hidden="true" />} />
          <InfoTile label="显示名" value={user.displayName} icon={<User className="size-4" aria-hidden="true" />} />
          <InfoTile label="角色" value={roleLabel(user.role)} icon={<ShieldCheck className="size-4" aria-hidden="true" />} />
          <InfoTile label="当前套餐" value={currentPlanName} icon={<Package className="size-4" aria-hidden="true" />} />
          <InfoTile label="套餐到期" value={currentPlanExpiresAt ? formatDateTime(currentPlanExpiresAt) : "长期"} icon={<Clock className="size-4" aria-hidden="true" />} />
        </div>

        <section className="billing-panel billing-panel--account" aria-labelledby="billing-title">
          <div className="billing-panel__header">
            <div>
              <p className="settings-eyebrow">Billing</p>
              <h2 id="billing-title">套餐与余额</h2>
            </div>
            <button className="secondary-action h-10" disabled={billingLoading} type="button" onClick={() => void loadBilling()}>
              {billingLoading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="size-4" aria-hidden="true" />}
              刷新
            </button>
          </div>

          {billingError ? <p className="billing-alert billing-alert--warning" role="alert">{billingError}</p> : null}
          {billingAction ? <p className="billing-alert billing-alert--success" role="status">{billingAction}</p> : null}

          <div className="account-billing-overview">
            <div className="billing-stat-card billing-stat-card--balance">
              <span>账户余额</span>
              <strong>{formatMoney(billing.summary.balanceCents, billing.summary.currency)}</strong>
            </div>
            <div className="billing-stat-card">
              <span>单张费用</span>
              <strong>{formatMoney(billing.settings.imageUnitPriceCents, billing.summary.currency)}</strong>
            </div>
            <div className="billing-stat-card">
              <span>套餐余量</span>
              <strong>{quotaRemaining.toLocaleString("zh-CN")} 次</strong>
            </div>
          </div>

          <div className="recharge-form">
            <label>
              <span>充值金额</span>
              <input inputMode="decimal" value={rechargeAmount} onChange={(event) => setRechargeAmount(event.target.value)} />
            </label>
            <button className="primary-action h-10" disabled={Boolean(billingActionLoading)} type="button" onClick={() => void submitRecharge()}>
              {billingActionLoading === "recharge" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Wallet className="size-4" aria-hidden="true" />}
              支付宝充值
            </button>
          </div>

          <div className="plan-grid">
            {plans.map((plan) => (
              <article className="plan-card" data-current={plan.id === currentPlanId} key={plan.id}>
                <div>
                  <p className="plan-card__name">{plan.name}</p>
                  <p className="plan-card__price">{formatMoney(plan.priceCents, plan.currency)}</p>
                  {plan.description ? <p className="plan-card__desc">{plan.description}</p> : null}
                </div>
                <dl className="plan-card__quota">
                  <div><dt>图片次数</dt><dd>{plan.imageQuota.toLocaleString("zh-CN")}</dd></div>
                  <div><dt>存储空间</dt><dd>{formatBytes(plan.storageQuotaBytes)}</dd></div>
                </dl>
                {plan.benefits.length > 0 ? (
                  <ul className="plan-card__benefits">
                    {plan.benefits.slice(0, 3).map((benefit) => <li key={benefit}>{benefit}</li>)}
                  </ul>
                ) : null}
                <div className="plan-card__actions">
                  <button
                    className="secondary-action h-10"
                    disabled={Boolean(billingActionLoading) || plan.id === currentPlanId || !plan.enabled}
                    type="button"
                    onClick={() => void purchasePlan(plan, "balance")}
                  >
                    {billingActionLoading === `${plan.id}:balance` ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Wallet className="size-4" aria-hidden="true" />}
                    余额购买
                  </button>
                  <button
                    className="primary-action h-10"
                    disabled={Boolean(billingActionLoading) || plan.id === currentPlanId || !plan.enabled}
                    type="button"
                    onClick={() => void purchasePlan(plan, "alipay")}
                  >
                    {billingActionLoading === `${plan.id}:alipay` ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <ExternalLink className="size-4" aria-hidden="true" />}
                    支付宝
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="quota-panel" aria-labelledby="quota-title">
          <div>
            <p className="settings-eyebrow">Quota</p>
            <h2 id="quota-title">图片额度</h2>
          </div>
          <div className="quota-meter" aria-label={`已使用 ${quotaUsed}，总额度 ${quotaTotal}`}>
            <span style={{ width: `${quotaPercent}%` }} />
          </div>
          <div className="quota-row">
            <span>{quotaUsed.toLocaleString("zh-CN")} 已用</span>
            <span>{quotaRemaining.toLocaleString("zh-CN")} 剩余</span>
          </div>
        </section>

        <section className="quota-panel" aria-labelledby="storage-title">
          <div>
            <p className="settings-eyebrow">Storage</p>
            <h2 id="storage-title">存储空间</h2>
          </div>
          <div className="quota-meter" aria-label={`已使用 ${formatBytes(storageUsed)}，总空间 ${formatBytes(storageQuota)}`}>
            <span style={{ width: `${storagePercent}%` }} />
          </div>
          <div className="quota-row">
            <span>{storageUsed > 0 ? formatBytes(storageUsed) : "未设置"} 已用</span>
            <span>{storageQuota > 0 ? formatBytes(storageQuota) : "未设置"} 总空间</span>
          </div>
        </section>

        <section className="billing-panel" aria-labelledby="account-ledger-title">
          <div className="billing-panel__header">
            <div>
              <p className="settings-eyebrow">Ledger</p>
              <h2 id="account-ledger-title">订单与扣费明细</h2>
            </div>
          </div>
          <div className="account-ledger-grid">
            <CompactLedger
              emptyLabel="暂无订单"
              items={billing.orders.slice(0, 8).map((order) => ({
                id: order.id,
                title: order.title || billingTypeLabel(order.type),
                meta: `${orderStatusLabel(order.status)} · ${formatDateTime(order.createdAt)}`,
                amount: formatMoney(order.amountCents, order.currency)
              }))}
              title="订单"
            />
            <CompactLedger
              emptyLabel="暂无扣费明细"
              items={billing.transactions.slice(0, 8).map((item) => ({
                id: item.id,
                title: billingTypeLabel(item.type),
                meta: `${item.note || item.title} · ${formatDateTime(item.createdAt)}`,
                amount: formatMoney(item.amountCents, item.currency)
              }))}
              title="扣费明细"
            />
          </div>
        </section>
      </section>
    </main>
  );
}

export function AdminPage() {
  const [stats, setStats] = useState<AdminStats>({});
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [plans, setPlans] = useState<AdminPlanRow[]>([]);
  const [jobs, setJobs] = useState<AdminJobRow[]>([]);
  const [assets, setAssets] = useState<AdminAssetRow[]>([]);
  const [billingSettings, setBillingSettings] = useState<BillingSettingsFormState>(createBillingSettingsForm());
  const [imageModels, setImageModels] = useState<ImageModelFormState[]>([]);
  const [alipaySettings, setAlipaySettings] = useState<AlipayFormState>(createAlipayForm());
  const [wechatMiniAppSettings, setWechatMiniAppSettings] = useState<WechatMiniAppFormState>(createWechatMiniAppForm());
  const [smtpSettings, setSmtpSettings] = useState<SmtpFormState>(createSmtpForm());
  const [transactions, setTransactions] = useState<BillingTransactionRow[]>([]);
  const [planDrafts, setPlanDrafts] = useState<Record<string, PlanFormState>>({});
  const [newPlan, setNewPlan] = useState<PlanFormState>(createEmptyPlanForm());
  const [newAdmin, setNewAdmin] = useState<AdminUserFormState>(createEmptyAdminForm());
  const [expandedUserId, setExpandedUserId] = useState("");
  const [userDrafts, setUserDrafts] = useState<Record<string, UserQuotaFormState>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [savingPlanId, setSavingPlanId] = useState("");
  const [savingUserId, setSavingUserId] = useState("");
  const [savingAdmin, setSavingAdmin] = useState(false);
  const [savingBilling, setSavingBilling] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadAdminData({ preserveNotice = false, signal }: { preserveNotice?: boolean; signal?: AbortSignal } = {}): Promise<void> {
    setIsLoading(true);
    setError("");
    if (!preserveNotice) {
      setNotice("");
    }
    try {
      const [statsResponse, usersResponse, jobsResponse, assetsResponse, plansResponse, billingResponse, imageModelsResponse, alipayResponse, wechatResponse, smtpResponse, transactionsResponse] = await Promise.all([
        authFetch("/api/admin/stats"),
        authFetch("/api/admin/users"),
        authFetch("/api/admin/ecommerce/jobs"),
        authFetch("/api/admin/assets"),
        authFetch("/api/admin/plans"),
        authFetch("/api/admin/billing/settings"),
        authFetch("/api/admin/image-models"),
        authFetch("/api/admin/payment/alipay"),
        authFetch("/api/admin/auth/wechat/miniapp"),
        authFetch("/api/admin/email/smtp"),
        authFetch("/api/admin/billing/transactions?limit=50")
      ]);

      const responses = [statsResponse, usersResponse, jobsResponse, assetsResponse];
      const failedResponse = responses.find((response) => !response.ok);
      if (failedResponse) {
        throw new Error(await readApiError(failedResponse, "管理员数据加载失败。"));
      }

      const [statsBody, usersBody, jobsBody, assetsBody] = await Promise.all(responses.map((response) => response.json()));
      if (signal?.aborted) {
        return;
      }

      setStats(parseAdminStats(statsBody));
      const parsedUsers = parseUsers(usersBody);
      const parsedPlans = plansResponse.ok ? parsePlans(await plansResponse.json()) : [];
      if (billingResponse.ok) {
        setBillingSettings(parseBillingSettingsForm(await billingResponse.json()));
      }
      if (imageModelsResponse.ok) {
        const parsedModels = parseImageModelForms(await imageModelsResponse.json());
        setImageModels(parsedModels.length > 0 ? parsedModels : [createImageModelForm("gemini", 1)]);
      }
      if (alipayResponse.ok) {
        setAlipaySettings(parseAlipayForm(await alipayResponse.json()));
      }
      if (wechatResponse.ok) {
        setWechatMiniAppSettings(parseWechatMiniAppForm(await wechatResponse.json()));
      }
      if (smtpResponse.ok) {
        setSmtpSettings(parseSmtpForm(await smtpResponse.json()));
      }
      if (transactionsResponse.ok) {
        setTransactions(parseBillingTransactions(await transactionsResponse.json()));
      }
      setUsers(parsedUsers);
      setPlans(parsedPlans);
      setPlanDrafts(Object.fromEntries(parsedPlans.map((plan) => [plan.id, planToForm(plan)])));
      setUserDrafts(Object.fromEntries(parsedUsers.map((user) => [user.id, userToQuotaForm(user)])));
      setJobs(parseJobs(jobsBody));
      setAssets(parseAssets(assetsBody));
    } catch (loadError) {
      if (!signal?.aborted) {
        setError(loadError instanceof Error ? loadError.message : "管理员数据加载失败。");
      }
    } finally {
      if (!signal?.aborted) {
        setIsLoading(false);
      }
    }
  }

  useEffect(() => {
    const controller = new AbortController();

    void loadAdminData({ signal: controller.signal });

    return () => {
      controller.abort();
    };
  }, []);

  const statCards = useMemo(
    () => [
      { label: "用户", value: stats.totalUsers ?? users.length, icon: <Users className="size-4" aria-hidden="true" /> },
      { label: "任务", value: stats.totalJobs ?? jobs.length, icon: <BarChart3 className="size-4" aria-hidden="true" /> },
      { label: "资产", value: stats.totalAssets ?? assets.length, icon: <ImageIcon className="size-4" aria-hidden="true" /> },
      { label: "空间", value: formatBytes(stats.storageBytes ?? sumAssetBytes(assets)), icon: <HardDrive className="size-4" aria-hidden="true" /> }
    ],
    [assets, jobs.length, stats.storageBytes, stats.totalAssets, stats.totalJobs, stats.totalUsers, users.length]
  );

  async function savePlan(planId: string): Promise<void> {
    const draft = planId === NEW_PLAN_ID ? newPlan : planDrafts[planId];
    if (!draft) {
      return;
    }

    setSavingPlanId(planId);
    setError("");
    setNotice("");
    try {
      const isNewPlan = planId === NEW_PLAN_ID;
      const response = await authFetch(isNewPlan ? "/api/admin/plans" : `/api/admin/plans/${encodeURIComponent(planId)}`, {
        method: isNewPlan ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(planFormToPayload(draft))
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, "套餐保存失败。"));
      }
      setNotice("套餐已保存。");
      setNewPlan(createEmptyPlanForm());
      await loadAdminData({ preserveNotice: true });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "套餐保存失败。");
    } finally {
      setSavingPlanId("");
    }
  }

  async function saveUserQuota(user: AdminUserRow): Promise<void> {
    const draft = userDrafts[user.id] ?? userToQuotaForm(user);
    setSavingUserId(user.id);
    setError("");
    setNotice("");
    try {
      const selectedPlanId = draft.planId || null;
      const planChanged = selectedPlanId !== (user.planId || null);
      const shouldResetPlanQuotas = planChanged || !draft.quotaTotal.trim() || !draft.storageQuotaGb.trim();
      if (planChanged || shouldResetPlanQuotas) {
        const planResponse = await authFetch(`/api/admin/users/${encodeURIComponent(user.id)}/plan`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planId: selectedPlanId || "free", resetQuota: true })
        });
        if (!planResponse.ok) {
          throw new Error(await readApiError(planResponse, "用户套餐保存失败。"));
        }
      }

      const quotaResponse = await authFetch(`/api/admin/users/${encodeURIComponent(user.id)}/quota`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userQuotaFormToPayload(draft, shouldResetPlanQuotas))
      });
      if (!quotaResponse.ok) {
        throw new Error(await readApiError(quotaResponse, "用户额度保存失败。"));
      }

      const balanceCents = moneyToCents(draft.balance);
      if (balanceCents !== null && balanceCents !== (user.balanceCents ?? 0)) {
        const balanceResponse = await authFetch(`/api/admin/users/${encodeURIComponent(user.id)}/balance`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ balanceCents, note: "后台用户管理调整" })
        });
        if (!balanceResponse.ok) {
          throw new Error(await readApiError(balanceResponse, "用户余额保存失败。"));
        }
      }

      setNotice("用户额度已保存。");
      await loadAdminData({ preserveNotice: true });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "用户额度保存失败。");
    } finally {
      setSavingUserId("");
    }
  }

  async function saveAdminUser(): Promise<void> {
    setSavingAdmin(true);
    setError("");
    setNotice("");
    try {
      const response = await authFetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newAdmin.email,
          displayName: newAdmin.displayName,
          password: newAdmin.password
        })
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, "管理员保存失败。"));
      }
      const body = await response.json();
      setNotice(isRecord(body) && body.created === false ? "用户已提升为管理员。" : "管理员已添加。");
      setNewAdmin(createEmptyAdminForm());
      await loadAdminData({ preserveNotice: true });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "管理员保存失败。");
    } finally {
      setSavingAdmin(false);
    }
  }

  async function saveBillingSettings(): Promise<void> {
    setSavingBilling("settings");
    setError("");
    setNotice("");
    try {
      const response = await authFetch("/api/admin/billing/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUnitPriceCents: moneyToCents(billingSettings.imageUnitPrice) ?? 0,
          currency: billingSettings.currency || "CNY"
        })
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, "计费设置保存失败。"));
      }
      setNotice("计费设置已保存。");
      await loadAdminData({ preserveNotice: true });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "计费设置保存失败。");
    } finally {
      setSavingBilling("");
    }
  }

  async function saveImageModels(): Promise<void> {
    setSavingBilling("image-models");
    setError("");
    setNotice("");
    try {
      const response = await authFetch("/api/admin/image-models", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          models: imageModels.map((model, index) => ({
            id: model.id.startsWith("new-") ? undefined : model.id,
            name: model.name,
            provider: model.provider,
            enabled: model.enabled,
            role: model.role,
            priority: Number.parseInt(model.priority, 10) || index + 1,
            apiKey: model.apiKey,
            preserveApiKey: !model.apiKey.trim() && model.apiKeySaved,
            baseUrl: model.baseUrl,
            model: model.model,
            timeoutMs: Number.parseInt(model.timeoutSeconds, 10) > 0 ? Number.parseInt(model.timeoutSeconds, 10) * 1000 : undefined
          }))
        })
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, "模型配置保存失败。"));
      }
      setNotice("图像模型配置已保存。");
      setImageModels(parseImageModelForms(await response.json()));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "模型配置保存失败。");
    } finally {
      setSavingBilling("");
    }
  }

  function addImageModel(provider: ImageModelProvider = "gemini"): void {
    setImageModels((models) => [...models, createImageModelForm(provider, models.length + 1)]);
  }

  function updateImageModel(id: string, patch: Partial<ImageModelFormState>): void {
    setImageModels((models) => models.map((model) => (model.id === id ? { ...model, ...patch } : model)));
  }

  function removeImageModel(id: string): void {
    setImageModels((models) => models.filter((model) => model.id !== id));
  }

  async function saveAlipaySettings(): Promise<void> {
    setSavingBilling("alipay");
    setError("");
    setNotice("");
    try {
      const response = await authFetch("/api/admin/payment/alipay", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: alipaySettings.enabled,
          appId: alipaySettings.appId,
          privateKey: alipaySettings.privateKey,
          preservePrivateKey: !alipaySettings.privateKey.trim() && alipaySettings.privateKeySaved,
          publicKey: alipaySettings.publicKey,
          preservePublicKey: !alipaySettings.publicKey.trim() && alipaySettings.publicKeySaved,
          notifyUrl: alipaySettings.notifyUrl,
          returnUrl: alipaySettings.returnUrl,
          gateway: alipaySettings.gateway,
          signType: alipaySettings.signType
        })
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, "支付宝配置保存失败。"));
      }
      setNotice("支付宝配置已保存。");
      await loadAdminData({ preserveNotice: true });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "支付宝配置保存失败。");
    } finally {
      setSavingBilling("");
    }
  }

  async function saveWechatMiniAppSettings(): Promise<void> {
    setSavingBilling("wechat-miniapp");
    setError("");
    setNotice("");
    try {
      const response = await authFetch("/api/admin/auth/wechat/miniapp", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: wechatMiniAppSettings.enabled,
          appId: wechatMiniAppSettings.appId,
          appSecret: wechatMiniAppSettings.appSecret,
          preserveAppSecret: !wechatMiniAppSettings.appSecret.trim() && wechatMiniAppSettings.appSecretSaved,
          allowBindExistingAccount: wechatMiniAppSettings.allowBindExistingAccount,
          allowRegisterNewUser: wechatMiniAppSettings.allowRegisterNewUser
        })
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, "微信小程序配置保存失败。"));
      }
      setNotice("微信小程序配置已保存。");
      await loadAdminData({ preserveNotice: true });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "微信小程序配置保存失败。");
    } finally {
      setSavingBilling("");
    }
  }

  async function saveSmtpSettings(): Promise<void> {
    setSavingBilling("smtp");
    setError("");
    setNotice("");
    try {
      const response = await authFetch("/api/admin/email/smtp", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: smtpSettings.enabled,
          host: smtpSettings.host,
          port: Number.parseInt(smtpSettings.port, 10),
          secure: smtpSettings.secure,
          username: smtpSettings.username,
          password: smtpSettings.password,
          preservePassword: !smtpSettings.password.trim() && smtpSettings.passwordSaved,
          fromName: smtpSettings.fromName,
          fromEmail: smtpSettings.fromEmail
        })
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, "SMTP 配置保存失败。"));
      }
      setNotice("SMTP 配置已保存。");
      await loadAdminData({ preserveNotice: true });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "SMTP 配置保存失败。");
    } finally {
      setSavingBilling("");
    }
  }

  const draftRows = [
    ...plans.map((plan) => ({ id: plan.id, form: planDrafts[plan.id] ?? planToForm(plan), isNew: false })),
    { id: NEW_PLAN_ID, form: newPlan, isNew: true }
  ];

  return (
    <main className="admin-page app-view">
      <section className="admin-shell" aria-labelledby="admin-title">
        <div className="settings-panel__header">
          <div>
            <p className="settings-eyebrow">Admin</p>
            <h1 id="admin-title">后台概览</h1>
          </div>
          {isLoading ? (
            <span className="loading-pill">
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              正在同步
            </span>
          ) : null}
        </div>

        {error ? (
          <div className="auth-alert" role="alert">
            <AlertTriangle className="size-4" aria-hidden="true" />
            <p>{error}</p>
          </div>
        ) : null}
        {notice ? (
          <div className="admin-success" role="status">
            <CheckCircle2 className="size-4" aria-hidden="true" />
            <p>{notice}</p>
          </div>
        ) : null}

        <div className="admin-stats">
          {statCards.map((card) => (
            <div className="admin-stat-card" key={card.label}>
              <span>{card.icon}</span>
              <p>{card.label}</p>
              <strong>{card.value}</strong>
            </div>
          ))}
        </div>

        <section className="admin-table-card admin-billing-card" aria-labelledby="image-models-title">
          <div className="admin-table-card__title">
            <Layers3 className="size-4" aria-hidden="true" />
            <h2 id="image-models-title">图像模型管理</h2>
          </div>
          <div className="admin-model-list">
            {imageModels.map((model, index) => (
              <div className="admin-form-panel admin-model-panel" key={model.id}>
                <div className="admin-form-panel__title-row">
                  <div>
                    <p className="settings-eyebrow">{model.role === "primary" ? "Primary" : "Fallback"}</p>
                    <h3>{model.name || `图像模型 ${index + 1}`}</h3>
                  </div>
                  <label className="admin-switch">
                    <input checked={model.enabled} type="checkbox" onChange={(event) => updateImageModel(model.id, { enabled: event.target.checked })} />
                    <span>{model.enabled ? "启用" : "关闭"}</span>
                  </label>
                </div>
                <div className="admin-form-grid admin-form-grid--model">
                  <label><span>名称</span><input className="admin-input" value={model.name} onChange={(event) => updateImageModel(model.id, { name: event.target.value })} /></label>
                  <label>
                    <span>供应商</span>
                    <select className="admin-input" value={model.provider} onChange={(event) => updateImageModel(model.id, providerDefaults(event.target.value as ImageModelProvider))}>
                      <option value="gemini">Gemini</option>
                      <option value="openai-compatible">OpenAI 兼容</option>
                    </select>
                  </label>
                  <label>
                    <span>角色</span>
                    <select className="admin-input" value={model.role} onChange={(event) => updateImageModel(model.id, { role: event.target.value as ImageModelRole })}>
                      <option value="primary">主模型</option>
                      <option value="fallback">备用模型</option>
                    </select>
                  </label>
                  <label><span>优先级</span><input className="admin-input" inputMode="numeric" value={model.priority} onChange={(event) => updateImageModel(model.id, { priority: event.target.value })} /></label>
                  <label><span>模型 ID</span><input className="admin-input" value={model.model} onChange={(event) => updateImageModel(model.id, { model: event.target.value })} /></label>
                  <label><span>Base URL</span><input className="admin-input" value={model.baseUrl} onChange={(event) => updateImageModel(model.id, { baseUrl: event.target.value })} placeholder={model.provider === "gemini" ? "默认 Google Gemini API" : "可选 OpenAI 兼容端点"} /></label>
                  <label><span>超时秒数</span><input className="admin-input" inputMode="numeric" value={model.timeoutSeconds} onChange={(event) => updateImageModel(model.id, { timeoutSeconds: event.target.value })} /></label>
                  <label><span>API Key {model.apiKeySaved ? "（已保存，留空不覆盖）" : ""}</span><input className="admin-input" type="password" value={model.apiKey} onChange={(event) => updateImageModel(model.id, { apiKey: event.target.value })} /></label>
                </div>
                <button className="secondary-action h-10" type="button" onClick={() => removeImageModel(model.id)}>
                  移除模型
                </button>
              </div>
            ))}
          </div>
          <div className="admin-model-actions">
            <button className="secondary-action h-10" type="button" onClick={() => addImageModel("gemini")}>
              <Plus className="size-4" aria-hidden="true" />
              添加 Gemini
            </button>
            <button className="secondary-action h-10" type="button" onClick={() => addImageModel("openai-compatible")}>
              <Plus className="size-4" aria-hidden="true" />
              添加 OpenAI 兼容
            </button>
            <button className="primary-action h-10" disabled={savingBilling === "image-models"} type="button" onClick={() => void saveImageModels()}>
              {savingBilling === "image-models" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}
              保存模型
            </button>
          </div>
        </section>

        <section className="admin-table-card admin-billing-card" aria-labelledby="billing-config-title">
          <div className="admin-table-card__title">
            <CreditCard className="size-4" aria-hidden="true" />
            <h2 id="billing-config-title">计费与支付配置</h2>
          </div>
          <div className="admin-billing-grid">
            <div className="admin-form-panel">
              <div>
                <p className="settings-eyebrow">Price</p>
                <h3>单张生图费用</h3>
              </div>
              <label>
                <span>无套餐/额度不足时，每张从余额扣除</span>
                <input
                  className="admin-input"
                  inputMode="decimal"
                  value={billingSettings.imageUnitPrice}
                  onChange={(event) => setBillingSettings({ ...billingSettings, imageUnitPrice: event.target.value })}
                />
              </label>
              <label>
                <span>币种</span>
                <input
                  className="admin-input"
                  value={billingSettings.currency}
                  onChange={(event) => setBillingSettings({ ...billingSettings, currency: event.target.value.toUpperCase() })}
                />
              </label>
              <button className="primary-action h-10" disabled={savingBilling === "settings"} type="button" onClick={() => void saveBillingSettings()}>
                {savingBilling === "settings" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}
                保存计费
              </button>
            </div>

            <div className="admin-form-panel">
              <div className="admin-form-panel__title-row">
                <div>
                  <p className="settings-eyebrow">Alipay</p>
                  <h3>支付宝支付</h3>
                </div>
                <label className="admin-switch">
                  <input
                    checked={alipaySettings.enabled}
                    type="checkbox"
                    onChange={(event) => setAlipaySettings({ ...alipaySettings, enabled: event.target.checked })}
                  />
                  <span>{alipaySettings.enabled ? "启用" : "关闭"}</span>
                </label>
              </div>
              <div className="admin-form-grid admin-form-grid--two">
                <label><span>App ID</span><input className="admin-input" value={alipaySettings.appId} onChange={(event) => setAlipaySettings({ ...alipaySettings, appId: event.target.value })} /></label>
                <label><span>网关</span><input className="admin-input" value={alipaySettings.gateway} onChange={(event) => setAlipaySettings({ ...alipaySettings, gateway: event.target.value })} /></label>
                <label><span>异步通知 URL</span><input className="admin-input" value={alipaySettings.notifyUrl} onChange={(event) => setAlipaySettings({ ...alipaySettings, notifyUrl: event.target.value })} /></label>
                <label><span>返回 URL</span><input className="admin-input" value={alipaySettings.returnUrl} onChange={(event) => setAlipaySettings({ ...alipaySettings, returnUrl: event.target.value })} /></label>
              </div>
              <label>
                <span>应用私钥 {alipaySettings.privateKeySaved ? "（已保存，留空不覆盖）" : ""}</span>
                <textarea className="admin-textarea admin-secret-textarea" value={alipaySettings.privateKey} onChange={(event) => setAlipaySettings({ ...alipaySettings, privateKey: event.target.value })} />
              </label>
              <label>
                <span>支付宝公钥 {alipaySettings.publicKeySaved ? "（已保存，留空不覆盖）" : ""}</span>
                <textarea className="admin-textarea admin-secret-textarea" value={alipaySettings.publicKey} onChange={(event) => setAlipaySettings({ ...alipaySettings, publicKey: event.target.value })} />
              </label>
              <button className="secondary-action h-10" disabled={savingBilling === "alipay"} type="button" onClick={() => void saveAlipaySettings()}>
                {savingBilling === "alipay" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <CreditCard className="size-4" aria-hidden="true" />}
                保存支付宝
              </button>
            </div>

            <div className="admin-form-panel">
              <div className="admin-form-panel__title-row">
                <div>
                  <p className="settings-eyebrow">Email</p>
                  <h3>SMTP 邮箱验证码</h3>
                </div>
                <label className="admin-switch">
                  <input
                    checked={smtpSettings.enabled}
                    type="checkbox"
                    onChange={(event) => setSmtpSettings({ ...smtpSettings, enabled: event.target.checked })}
                  />
                  <span>{smtpSettings.enabled ? "启用" : "关闭"}</span>
                </label>
              </div>
              <div className="admin-form-grid admin-form-grid--two">
                <label><span>SMTP Host</span><input className="admin-input" value={smtpSettings.host} onChange={(event) => setSmtpSettings({ ...smtpSettings, host: event.target.value })} /></label>
                <label><span>端口</span><input className="admin-input" inputMode="numeric" value={smtpSettings.port} onChange={(event) => setSmtpSettings({ ...smtpSettings, port: event.target.value })} /></label>
                <label><span>账号</span><input className="admin-input" value={smtpSettings.username} onChange={(event) => setSmtpSettings({ ...smtpSettings, username: event.target.value })} /></label>
                <label><span>发件邮箱</span><input className="admin-input" inputMode="email" value={smtpSettings.fromEmail} onChange={(event) => setSmtpSettings({ ...smtpSettings, fromEmail: event.target.value })} /></label>
                <label><span>发件名称</span><input className="admin-input" value={smtpSettings.fromName} onChange={(event) => setSmtpSettings({ ...smtpSettings, fromName: event.target.value })} /></label>
                <label className="admin-switch admin-switch--inline">
                  <input checked={smtpSettings.secure} type="checkbox" onChange={(event) => setSmtpSettings({ ...smtpSettings, secure: event.target.checked })} />
                  <span>SSL/TLS</span>
                </label>
              </div>
              <label>
                <span>SMTP 密码 {smtpSettings.passwordSaved ? "（已保存，留空不覆盖）" : ""}</span>
                <input className="admin-input" type="password" value={smtpSettings.password} onChange={(event) => setSmtpSettings({ ...smtpSettings, password: event.target.value })} />
              </label>
              <button className="secondary-action h-10" disabled={savingBilling === "smtp"} type="button" onClick={() => void saveSmtpSettings()}>
                {savingBilling === "smtp" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Mail className="size-4" aria-hidden="true" />}
                保存 SMTP
              </button>
            </div>
          </div>
        </section>

        <section className="admin-table-card admin-billing-card" aria-labelledby="wechat-config-title">
          <div className="admin-table-card__title">
            <ShieldCheck className="size-4" aria-hidden="true" />
            <h2 id="wechat-config-title">微信小程序登录配置</h2>
          </div>
          <div className="admin-billing-grid">
            <div className="admin-form-panel">
              <div className="admin-form-panel__title-row">
                <div>
                  <p className="settings-eyebrow">Mini Program</p>
                  <h3>微信一键登录</h3>
                </div>
                <label className="admin-switch">
                  <input
                    checked={wechatMiniAppSettings.enabled}
                    type="checkbox"
                    onChange={(event) => setWechatMiniAppSettings({ ...wechatMiniAppSettings, enabled: event.target.checked })}
                  />
                  <span>{wechatMiniAppSettings.enabled ? "启用" : "关闭"}</span>
                </label>
              </div>
              <p className="admin-panel-note">启用后，小程序会通过这里配置的 App ID 和 Secret 做微信登录校验。</p>
              <div className="admin-form-grid admin-form-grid--two">
                <label>
                  <span>App ID</span>
                  <input className="admin-input" value={wechatMiniAppSettings.appId} onChange={(event) => setWechatMiniAppSettings({ ...wechatMiniAppSettings, appId: event.target.value })} />
                </label>
                <label>
                  <span>App Secret {wechatMiniAppSettings.appSecretSaved ? "（已保存，留空不覆盖）" : ""}</span>
                  <input
                    className="admin-input"
                    type="password"
                    value={wechatMiniAppSettings.appSecret}
                    onChange={(event) => setWechatMiniAppSettings({ ...wechatMiniAppSettings, appSecret: event.target.value })}
                  />
                </label>
                <label className="admin-switch admin-switch--inline">
                  <input
                    checked={wechatMiniAppSettings.allowBindExistingAccount}
                    type="checkbox"
                    onChange={(event) => setWechatMiniAppSettings({ ...wechatMiniAppSettings, allowBindExistingAccount: event.target.checked })}
                  />
                  <span>允许绑定已有账号</span>
                </label>
                <label className="admin-switch admin-switch--inline">
                  <input
                    checked={wechatMiniAppSettings.allowRegisterNewUser}
                    type="checkbox"
                    onChange={(event) => setWechatMiniAppSettings({ ...wechatMiniAppSettings, allowRegisterNewUser: event.target.checked })}
                  />
                  <span>允许新用户注册</span>
                </label>
              </div>
              <button className="secondary-action h-10" disabled={savingBilling === "wechat-miniapp"} type="button" onClick={() => void saveWechatMiniAppSettings()}>
                {savingBilling === "wechat-miniapp" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="size-4" aria-hidden="true" />}
                保存微信配置
              </button>
            </div>
          </div>
        </section>

        <section className="admin-table-card" aria-labelledby="plans-table-title">
          <div className="admin-table-card__title">
            <Package className="size-4" aria-hidden="true" />
            <h2 id="plans-table-title">套餐管理</h2>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table admin-edit-table">
              <thead>
                <tr>
                  <th>名称</th>
                  <th>生图额度</th>
                  <th>存图空间</th>
                  <th>价格</th>
                  <th>启用</th>
                  <th>排序</th>
                  <th>权益</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {draftRows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <input
                        className="admin-input"
                        placeholder="套餐名称"
                        value={row.form.name}
                        onChange={(event) =>
                          row.isNew
                            ? setNewPlan({ ...newPlan, name: event.target.value })
                            : setPlanDrafts((drafts) => ({ ...drafts, [row.id]: { ...row.form, name: event.target.value } }))
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="admin-input"
                        inputMode="numeric"
                        placeholder="未设置"
                        value={row.form.quotaTotal}
                        onChange={(event) =>
                          row.isNew
                            ? setNewPlan({ ...newPlan, quotaTotal: event.target.value })
                            : setPlanDrafts((drafts) => ({ ...drafts, [row.id]: { ...row.form, quotaTotal: event.target.value } }))
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="admin-input"
                        inputMode="decimal"
                        placeholder="GB"
                        value={row.form.storageQuotaGb}
                        onChange={(event) =>
                          row.isNew
                            ? setNewPlan({ ...newPlan, storageQuotaGb: event.target.value })
                            : setPlanDrafts((drafts) => ({ ...drafts, [row.id]: { ...row.form, storageQuotaGb: event.target.value } }))
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="admin-input"
                        inputMode="decimal"
                        placeholder="0"
                        value={row.form.price}
                        onChange={(event) =>
                          row.isNew
                            ? setNewPlan({ ...newPlan, price: event.target.value })
                            : setPlanDrafts((drafts) => ({ ...drafts, [row.id]: { ...row.form, price: event.target.value } }))
                        }
                      />
                    </td>
                    <td>
                      <label className="admin-checkbox">
                        <input
                          checked={row.form.enabled}
                          type="checkbox"
                          onChange={(event) =>
                            row.isNew
                              ? setNewPlan({ ...newPlan, enabled: event.target.checked })
                              : setPlanDrafts((drafts) => ({ ...drafts, [row.id]: { ...row.form, enabled: event.target.checked } }))
                          }
                        />
                      </label>
                    </td>
                    <td>
                      <input
                        className="admin-input admin-input--narrow"
                        inputMode="numeric"
                        value={row.form.sortOrder}
                        onChange={(event) =>
                          row.isNew
                            ? setNewPlan({ ...newPlan, sortOrder: event.target.value })
                            : setPlanDrafts((drafts) => ({ ...drafts, [row.id]: { ...row.form, sortOrder: event.target.value } }))
                        }
                      />
                    </td>
                    <td>
                      <textarea
                        className="admin-textarea"
                        placeholder="每行一个权益"
                        rows={2}
                        value={row.form.featuresText}
                        onChange={(event) =>
                          row.isNew
                            ? setNewPlan({ ...newPlan, featuresText: event.target.value })
                            : setPlanDrafts((drafts) => ({ ...drafts, [row.id]: { ...row.form, featuresText: event.target.value } }))
                        }
                      />
                    </td>
                    <td>
                      <button className="admin-icon-button" disabled={savingPlanId === row.id} type="button" onClick={() => void savePlan(row.id)}>
                        {savingPlanId === row.id ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : row.isNew ? <Plus className="size-4" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}
                        <span>{row.isNew ? "新增" : "保存"}</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="admin-table-card" aria-labelledby="users-table-title">
          <div className="admin-table-card__title">
            <Users className="size-4" aria-hidden="true" />
            <h2 id="users-table-title">用户额度管理</h2>
          </div>
          <div className="admin-form-panel admin-inline-admin-form">
            <div>
              <p className="settings-eyebrow">Admins</p>
              <h3>添加管理员</h3>
            </div>
            <div className="admin-form-grid admin-form-grid--four">
              <label>
                <span>邮箱</span>
                <input
                  className="admin-input"
                  inputMode="email"
                  placeholder="admin@example.com"
                  value={newAdmin.email}
                  onChange={(event) => setNewAdmin({ ...newAdmin, email: event.target.value })}
                />
              </label>
              <label>
                <span>显示名</span>
                <input
                  className="admin-input"
                  placeholder="管理员名称"
                  value={newAdmin.displayName}
                  onChange={(event) => setNewAdmin({ ...newAdmin, displayName: event.target.value })}
                />
              </label>
              <label>
                <span>密码</span>
                <input
                  className="admin-input"
                  placeholder="新用户必填，至少 8 位"
                  type="password"
                  value={newAdmin.password}
                  onChange={(event) => setNewAdmin({ ...newAdmin, password: event.target.value })}
                />
              </label>
              <button className="primary-action h-10" disabled={savingAdmin} type="button" onClick={() => void saveAdminUser()}>
                {savingAdmin ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <UserPlus className="size-4" aria-hidden="true" />}
                添加管理员
              </button>
            </div>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>邮箱</th>
                  <th>显示名</th>
                  <th>角色</th>
                  <th>套餐</th>
                  <th>余额</th>
                  <th>生图额度</th>
                  <th>存储空间</th>
                  <th>创建时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {users.length > 0 ? (
                  users.slice(0, 20).map((user) => {
                    const isExpanded = expandedUserId === user.id;
                    const draft = userDrafts[user.id] ?? userToQuotaForm(user);
                    return (
                      <Fragment key={user.id}>
                        <tr>
                          <td>{user.email || "-"}</td>
                          <td>{user.displayName || "-"}</td>
                          <td>{roleLabel(user.role)}</td>
                          <td>{user.planName || user.planId || "未设置"}{user.planExpiresAt ? ` · ${formatDateTime(user.planExpiresAt)}` : ""}</td>
                          <td>{formatMoney(user.balanceCents ?? 0, "CNY")}</td>
                          <td>{quotaLabel(user)}</td>
                          <td>{storageLabel(user)}</td>
                          <td>{formatDateTime(user.createdAt)}</td>
                          <td>
                            <button
                              className="admin-icon-button"
                              type="button"
                              onClick={() => {
                                setExpandedUserId(isExpanded ? "" : user.id);
                                setUserDrafts((drafts) => ({ ...drafts, [user.id]: drafts[user.id] ?? userToQuotaForm(user) }));
                              }}
                            >
                              <Pencil className="size-4" aria-hidden="true" />
                              <span>{isExpanded ? "收起" : "管理"}</span>
                            </button>
                          </td>
                        </tr>
                        {isExpanded ? (
                          <tr className="admin-expanded-row">
                            <td colSpan={9}>
                              <div className="admin-user-form">
                                <label>
                                  <span>套餐</span>
                                  <select
                                    className="admin-input"
                                    value={draft.planId}
                                    onChange={(event) =>
                                      setUserDrafts((drafts) => ({ ...drafts, [user.id]: { ...draft, planId: event.target.value } }))
                                    }
                                  >
                                    <option value="">未设置 / 重置</option>
                                    {plans.map((plan) => (
                                      <option key={plan.id} value={plan.id}>
                                        {plan.name}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label>
                                  <span>账户余额</span>
                                  <input
                                    className="admin-input"
                                    inputMode="decimal"
                                    value={draft.balance}
                                    onChange={(event) =>
                                      setUserDrafts((drafts) => ({ ...drafts, [user.id]: { ...draft, balance: event.target.value } }))
                                    }
                                  />
                                </label>
                                <label>
                                  <span>生图总额度</span>
                                  <input
                                    className="admin-input"
                                    inputMode="numeric"
                                    placeholder="留空按套餐"
                                    value={draft.quotaTotal}
                                    onChange={(event) =>
                                      setUserDrafts((drafts) => ({ ...drafts, [user.id]: { ...draft, quotaTotal: event.target.value } }))
                                    }
                                  />
                                </label>
                                <label>
                                  <span>生图已用</span>
                                  <input
                                    className="admin-input"
                                    inputMode="numeric"
                                    value={draft.quotaUsed}
                                    onChange={(event) =>
                                      setUserDrafts((drafts) => ({ ...drafts, [user.id]: { ...draft, quotaUsed: event.target.value } }))
                                    }
                                  />
                                </label>
                                <label>
                                  <span>存储额度 GB</span>
                                  <input
                                    className="admin-input"
                                    inputMode="decimal"
                                    placeholder="留空按套餐"
                                    value={draft.storageQuotaGb}
                                    onChange={(event) =>
                                      setUserDrafts((drafts) => ({ ...drafts, [user.id]: { ...draft, storageQuotaGb: event.target.value } }))
                                    }
                                  />
                                </label>
                                <label>
                                  <span>存储已用 GB</span>
                                  <input
                                    className="admin-input"
                                    inputMode="decimal"
                                    value={draft.storageUsedGb}
                                    onChange={(event) =>
                                      setUserDrafts((drafts) => ({ ...drafts, [user.id]: { ...draft, storageUsedGb: event.target.value } }))
                                    }
                                  />
                                </label>
                                <div className="admin-user-form__actions">
                                  <button
                                    className="secondary-action h-10"
                                    type="button"
                                    onClick={() => setUserDrafts((drafts) => ({ ...drafts, [user.id]: resetUserQuotaForm(draft) }))}
                                  >
                                    重置覆盖
                                  </button>
                                  <button className="primary-action h-10" disabled={savingUserId === user.id} type="button" onClick={() => void saveUserQuota(user)}>
                                    {savingUserId === user.id ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}
                                    保存
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={9}>暂无用户</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
        <DataTable
          columns={["时间", "用户", "类型", "图片", "金额", "余额", "说明"]}
          emptyLabel="暂无扣费明细"
          icon={<Receipt className="size-4" aria-hidden="true" />}
          rows={transactions.map((item) => [
            formatDateTime(item.createdAt),
            item.userEmail || item.userId || "-",
            billingTypeLabel(item.type),
            item.imageCount ? `${item.imageCount}` : "-",
            formatMoney(item.amountCents, item.currency),
            formatMoney(item.balanceAfterCents ?? 0, item.currency),
            item.note || item.title
          ])}
          title="生图 / 扣费明细"
        />
        <DataTable
          columns={["任务", "状态", "归属人", "商品", "进度", "更新时间"]}
          emptyLabel="暂无任务"
          rows={jobs.map((item) => [
            item.id,
            item.status,
            ownerLabel(item),
            item.productTitle,
            `${item.completedScenes}/${item.totalScenes}`,
            formatDateTime(item.updatedAt)
          ])}
          showAllRows
          title="作品 / 任务"
        />
        <DataTable
          columns={["资产", "文件", "大小", "所属用户", "创建时间"]}
          emptyLabel="暂无资产"
          rows={assets.map((item) => [item.id, item.fileName, formatBytes(item.sizeBytes), item.userEmail || item.userId, formatDateTime(item.createdAt)])}
          title="资产"
        />
      </section>
    </main>
  );
}

function InfoTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="info-tile">
      <span>{icon}</span>
      <p>{label}</p>
      <strong>{value}</strong>
    </div>
  );
}

function CompactLedger({
  emptyLabel,
  items,
  title
}: {
  emptyLabel: string;
  items: Array<{ id: string; title: string; meta: string; amount: string }>;
  title: string;
}) {
  return (
    <div className="compact-ledger">
      <h3>{title}</h3>
      {items.length > 0 ? (
        <div className="compact-ledger__list">
          {items.map((item) => (
            <article className="compact-ledger__item" key={item.id}>
              <div>
                <strong>{item.title}</strong>
                <span>{item.meta}</span>
              </div>
              <em>{item.amount}</em>
            </article>
          ))}
        </div>
      ) : (
        <p>{emptyLabel}</p>
      )}
    </div>
  );
}

function DataTable({
  columns,
  emptyLabel,
  icon,
  rows,
  showAllRows = false,
  title
}: {
  columns: string[];
  emptyLabel: string;
  icon?: React.ReactNode;
  rows: string[][];
  showAllRows?: boolean;
  title: string;
}) {
  const visibleRows = showAllRows ? rows : rows.slice(0, 20);

  return (
    <section className="admin-table-card" aria-labelledby={`${title}-table-title`}>
      <div className="admin-table-card__title">
        {icon ?? <Database className="size-4" aria-hidden="true" />}
        <h2 id={`${title}-table-title`}>{title}</h2>
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.length > 0 ? (
              visibleRows.map((row, rowIndex) => (
                <tr key={`${title}-${rowIndex}`}>
                  {row.map((cell, cellIndex) => (
                    <td key={`${title}-${rowIndex}-${cellIndex}`}>{cell || "-"}</td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length}>{emptyLabel}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

interface AdminStats {
  totalUsers?: number;
  totalJobs?: number;
  totalAssets?: number;
  storageBytes?: number;
}

interface BillingSummary {
  balanceCents: number;
  currency?: string;
  recordCount: number;
  packageRemaining: number;
  quotaTotal?: number;
  quotaUsed?: number;
  storageQuotaBytes?: number;
  storageUsedBytes?: number;
}

interface AccountBillingState {
  summary: BillingSummary;
  settings: BillingSettingsView;
  currentPlan?: BillingPlan;
  currentPlanExpiresAt?: string;
  plans: BillingPlan[];
  transactions: BillingTransactionRow[];
  orders: BillingOrderRow[];
}

interface BillingPlan {
  id: string;
  name: string;
  description?: string;
  imageQuota: number;
  storageQuotaBytes: number;
  priceCents: number;
  currency: string;
  enabled: boolean;
  benefits: string[];
}

interface BillingSettingsView {
  imageUnitPriceCents: number;
  currency: string;
}

interface AdminUserRow {
  id: string;
  email: string;
  displayName: string;
  role: string;
  planId?: string;
  planName?: string;
  planExpiresAt?: string;
  quotaTotal?: number;
  quotaUsed?: number;
  balanceCents?: number;
  storageQuotaBytes?: number;
  storageUsedBytes?: number;
  createdAt: string;
}

interface AdminPlanRow {
  id: string;
  name: string;
  quotaTotal?: number;
  storageQuotaBytes?: number;
  priceCents?: number;
  currency: string;
  enabled: boolean;
  sortOrder: number;
  features: string[];
}

interface PlanFormState {
  name: string;
  quotaTotal: string;
  storageQuotaGb: string;
  price: string;
  currency: string;
  enabled: boolean;
  sortOrder: string;
  featuresText: string;
}

interface UserQuotaFormState {
  planId: string;
  balance: string;
  quotaTotal: string;
  quotaUsed: string;
  storageQuotaGb: string;
  storageUsedGb: string;
}

interface AdminUserFormState {
  email: string;
  displayName: string;
  password: string;
}

interface BillingSettingsFormState {
  imageUnitPrice: string;
  currency: string;
}

type ImageModelProvider = "openai-compatible" | "gemini";
type ImageModelRole = "primary" | "fallback";

interface ImageModelFormState {
  id: string;
  name: string;
  provider: ImageModelProvider;
  enabled: boolean;
  role: ImageModelRole;
  priority: string;
  apiKey: string;
  apiKeySaved: boolean;
  baseUrl: string;
  model: string;
  timeoutSeconds: string;
}

interface AlipayFormState {
  enabled: boolean;
  appId: string;
  privateKey: string;
  privateKeySaved: boolean;
  publicKey: string;
  publicKeySaved: boolean;
  notifyUrl: string;
  returnUrl: string;
  gateway: string;
  signType: string;
}

interface WechatMiniAppFormState {
  enabled: boolean;
  appId: string;
  appSecret: string;
  appSecretSaved: boolean;
  allowBindExistingAccount: boolean;
  allowRegisterNewUser: boolean;
}

interface SmtpFormState {
  enabled: boolean;
  host: string;
  port: string;
  secure: boolean;
  username: string;
  password: string;
  passwordSaved: boolean;
  fromName: string;
  fromEmail: string;
}

interface BillingTransactionRow {
  id: string;
  userId?: string;
  userEmail?: string;
  type: string;
  title: string;
  amountCents: number;
  currency: string;
  balanceAfterCents?: number;
  imageCount?: number;
  note?: string;
  createdAt: string;
}

interface BillingOrderRow {
  id: string;
  outTradeNo?: string;
  type: string;
  status: string;
  title: string;
  amountCents: number;
  currency: string;
  planId?: string;
  paymentProvider?: string;
  paymentUrl?: string;
  createdAt: string;
  updatedAt: string;
}

interface AdminJobRow {
  id: string;
  userId?: string;
  userEmail?: string;
  userDisplayName?: string;
  workspaceId?: string;
  status: string;
  productTitle: string;
  totalScenes: number;
  completedScenes: number;
  updatedAt: string;
}

interface AdminAssetRow {
  id: string;
  fileName: string;
  sizeBytes: number;
  userId: string;
  userEmail: string;
  createdAt: string;
}

function parseAdminStats(value: unknown): AdminStats {
  const body = firstRecord(value, "stats") ?? {};
  return {
    totalUsers: numberFrom(body.totalUsers ?? body.users ?? body.userCount),
    totalJobs: numberFrom(body.totalJobs ?? body.jobs ?? body.jobCount),
    totalAssets: numberFrom(body.totalAssets ?? body.assets ?? body.assetCount),
    storageBytes: numberFrom(body.storageBytes ?? body.totalStorageBytes ?? body.usedBytes)
  };
}

function parseBillingSummary(value: unknown, fallback: BillingSummary): BillingSummary {
  const root = isRecord(value) ? value : {};
  const body = isRecord(root.summary) ? root.summary : isRecord(root.billing) ? root.billing : isRecord(root.data) ? root.data : root;
  const quota = isRecord(body.quota) ? body.quota : {};
  const balance = isRecord(body.balance) ? body.balance : {};
  const usage = isRecord(body.usage) ? body.usage : {};
  const storage = isRecord(body.storage) ? body.storage : {};
  return {
    balanceCents:
      numberFrom(
        body.balanceCents ??
          body.balance_cents ??
          body.amountCents ??
          balance.balanceCents ??
          balance.balance_cents ??
          balance.cents ??
          balance.amountCents
      ) ?? fallback.balanceCents,
    currency: stringFrom(body.currency ?? balance.currency) || fallback.currency,
    recordCount:
      numberFrom(
        body.recordCount ??
          body.record_count ??
          body.records ??
          body.usageCount ??
          body.quotaUsed ??
          usage.quotaUsed ??
          usage.quota_used ??
          quota.used
      ) ?? fallback.recordCount,
    packageRemaining:
      numberFrom(
        body.packageRemaining ??
          body.package_remaining ??
          body.quotaRemaining ??
          body.remainingQuota ??
          usage.packageRemaining ??
          usage.package_remaining ??
          quota.remaining
      ) ??
      fallback.packageRemaining,
    quotaTotal: numberFrom(body.quotaTotal ?? body.quota_total ?? usage.quotaTotal ?? usage.quota_total ?? usage.total),
    quotaUsed: numberFrom(body.quotaUsed ?? body.quota_used ?? usage.quotaUsed ?? usage.quota_used ?? usage.used),
    storageQuotaBytes: numberFrom(body.storageQuotaBytes ?? body.storage_quota_bytes ?? storage.quotaBytes ?? storage.quota_bytes),
    storageUsedBytes: numberFrom(body.storageUsedBytes ?? body.storage_used_bytes ?? storage.usedBytes ?? storage.used_bytes)
  };
}

function parseBillingPlans(value: unknown): BillingPlan[] {
  return parsePlans(value)
    .filter((plan) => plan.enabled)
    .map((plan) => ({
      id: plan.id,
      name: plan.name,
      description: "",
      imageQuota: plan.quotaTotal ?? 0,
      storageQuotaBytes: plan.storageQuotaBytes ?? 0,
      priceCents: plan.priceCents ?? 0,
      currency: plan.currency,
      enabled: plan.enabled,
      benefits: plan.features
    }));
}

function parseAccountBilling(value: unknown, user: AuthUser): AccountBillingState {
  const root = isRecord(value) ? value : {};
  const body = isRecord(root.summary) ? root.summary : isRecord(root.billing) ? root.billing : isRecord(root.data) ? root.data : root;
  const settings = isRecord(body.settings) ? body.settings : isRecord(root.settings) ? root.settings : {};
  const plans = parseBillingPlans(body);
  const currentPlan =
    parsePlanLike(body.currentPlan ?? body.current_plan ?? body.plan) ??
    plans.find((plan) => plan.id === user.planId);
  return {
    summary: parseBillingSummary(value, {
      balanceCents: user.balanceCents ?? 0,
      currency: "CNY",
      recordCount: user.recordCount ?? user.quotaUsed ?? 0,
      packageRemaining: user.packageRemaining ?? Math.max((user.quotaTotal ?? 0) - (user.quotaUsed ?? 0), 0)
    }),
    settings: {
      imageUnitPriceCents: numberFrom(settings.imageUnitPriceCents ?? settings.image_unit_price_cents ?? settings.singleImagePriceCents) ?? 0,
      currency: stringFrom(settings.currency) || "CNY"
    },
    currentPlan,
    currentPlanExpiresAt: stringFrom(body.currentPlanExpiresAt ?? body.current_plan_expires_at),
    plans,
    transactions: parseBillingTransactions(body),
    orders: parseBillingOrders(body)
  };
}

function createAccountBillingState(user: AuthUser): AccountBillingState {
  return {
    summary: {
      balanceCents: user.balanceCents ?? 0,
      currency: "CNY",
      recordCount: user.recordCount ?? user.quotaUsed ?? 0,
      packageRemaining: user.packageRemaining ?? Math.max((user.quotaTotal ?? 0) - (user.quotaUsed ?? 0), 0)
    },
    settings: {
      imageUnitPriceCents: 0,
      currency: "CNY"
    },
    plans: fallbackBillingPlans,
    transactions: [],
    orders: []
  };
}

function parsePlanLike(value: unknown): BillingPlan | undefined {
  const source = isRecord(value) ? value : undefined;
  if (!source) {
    return undefined;
  }
  const plan = parseBillingPlans([source])[0];
  return plan;
}

function paymentUrlFrom(value: unknown): string {
  const root = isRecord(value) ? value : {};
  const data = firstRecord(root, "data") ?? {};
  const order = firstRecord(root, "order") ?? firstRecord(data, "order") ?? {};
  const payment = firstRecord(root, "payment") ?? firstRecord(data, "payment") ?? {};
  return stringFrom(
    root.paymentUrl ??
      root.payment_url ??
      root.checkoutUrl ??
      root.checkout_url ??
      data.paymentUrl ??
      data.payment_url ??
      data.checkoutUrl ??
      data.checkout_url ??
      order.paymentUrl ??
      order.payment_url ??
      order.checkoutUrl ??
      order.checkout_url ??
      payment.paymentUrl ??
      payment.payment_url ??
      payment.checkoutUrl ??
      payment.checkout_url ??
      root.payUrl ??
      root.pay_url ??
      data.payUrl ??
      data.pay_url
  );
}

function parseUsers(value: unknown): AdminUserRow[] {
  return arrayFrom(value, ["users", "items"]).map((item, index) => ({
    id: stringFrom(item.id) || stringFrom(item.userId) || `user-${index}`,
    email: stringFrom(item.email),
    displayName: stringFrom(item.displayName) || stringFrom(item.name),
    role: stringFrom(item.role) || "user",
    planId: stringFrom(item.planId ?? item.plan_id),
    planName: stringFrom(item.planName ?? item.plan_name ?? (isRecord(item.plan) ? item.plan.name : undefined)),
    planExpiresAt: stringFrom(item.planExpiresAt ?? item.plan_expires_at),
    quotaTotal: numberFrom(item.quota_total ?? item.quotaTotal),
    quotaUsed: numberFrom(item.quota_used ?? item.quotaUsed),
    balanceCents: numberFrom(item.balance_cents ?? item.balanceCents ?? item.balance),
    storageQuotaBytes: numberFrom(item.storage_quota_bytes ?? item.storageQuotaBytes ?? (isRecord(item.storage) ? item.storage.quotaBytes : undefined)),
    storageUsedBytes: numberFrom(item.storage_used_bytes ?? item.storageUsedBytes ?? (isRecord(item.storage) ? item.storage.usedBytes : undefined)),
    createdAt: stringFrom(item.createdAt) || stringFrom(item.created_at)
  }));
}

function parsePlans(value: unknown): AdminPlanRow[] {
  return arrayFrom(value, ["plans", "items"]).map((item, index) => {
    const features = arrayFrom(item.features, []).map((feature) => stringFrom(feature.label ?? feature.name ?? feature.text)).filter(Boolean);
    return {
      id: stringFrom(item.id) || stringFrom(item.planId) || `plan-${index}`,
      name: stringFrom(item.name) || stringFrom(item.title) || "未命名套餐",
      quotaTotal: numberFrom(item.quota_total ?? item.quotaTotal ?? item.imageQuota ?? item.generationQuota),
      storageQuotaBytes: numberFrom(item.storage_quota_bytes ?? item.storageQuotaBytes ?? item.storageBytes),
      priceCents: numberFrom(item.price_cents ?? item.priceCents ?? item.amountCents),
      currency: stringFrom(item.currency) || "CNY",
      enabled: booleanFrom(item.enabled ?? item.isEnabled ?? item.active, true),
      sortOrder: numberFrom(item.sort_order ?? item.sortOrder ?? item.order) ?? index,
      features: features.length > 0 ? features : stringArrayFrom(item.features ?? item.benefits)
    };
  });
}

function parseJobs(value: unknown): AdminJobRow[] {
  return arrayFrom(value, ["jobs", "items"]).map((item, index) => ({
    id: stringFrom(item.jobId) || stringFrom(item.id) || `job-${index}`,
    userId: stringFrom(item.userId ?? item.createdByUserId ?? item.ownerId),
    userEmail: stringFrom(item.userEmail ?? item.user_email ?? item.email),
    userDisplayName: stringFrom(item.userDisplayName ?? item.user_display_name ?? item.displayName ?? item.ownerName),
    workspaceId: stringFrom(item.workspaceId ?? item.workspace_id),
    status: stringFrom(item.status) || "-",
    productTitle: stringFrom(item.productTitle) || stringFrom(item.title) || "-",
    totalScenes: numberFrom(item.totalScenes) ?? 0,
    completedScenes: numberFrom(item.completedScenes) ?? 0,
    updatedAt: stringFrom(item.updatedAt) || stringFrom(item.updated_at)
  }));
}

function parseAssets(value: unknown): AdminAssetRow[] {
  return arrayFrom(value, ["assets", "items"]).map((item, index) => ({
    id: stringFrom(item.id) || stringFrom(item.assetId) || `asset-${index}`,
    fileName: stringFrom(item.fileName) || stringFrom(item.filename) || stringFrom(item.name),
    sizeBytes: numberFrom(item.sizeBytes ?? item.bytes ?? item.size) ?? 0,
    userId: stringFrom(item.userId) || stringFrom(item.ownerId),
    userEmail: stringFrom(item.userEmail) || stringFrom(item.email),
    createdAt: stringFrom(item.createdAt) || stringFrom(item.created_at)
  }));
}

function parseBillingSettingsForm(value: unknown): BillingSettingsFormState {
  const settings = firstRecord(value, "settings") ?? (isRecord(value) ? value : {});
  return {
    imageUnitPrice: centsToMoneyInput(numberFrom(settings.imageUnitPriceCents ?? settings.singleImagePriceCents) ?? 0),
    currency: stringFrom(settings.currency) || "CNY"
  };
}

function parseImageModelForms(value: unknown): ImageModelFormState[] {
  return arrayFrom(value, ["models", "items"]).map((item, index) => {
    const provider = stringFrom(item.provider) === "openai-compatible" ? "openai-compatible" : "gemini";
    const role = stringFrom(item.role) === "fallback" ? "fallback" : "primary";
    return {
      id: stringFrom(item.id) || `new-${index}`,
      name: stringFrom(item.name) || (provider === "gemini" ? "Gemini Nano Banana Pro" : "OpenAI Image"),
      provider,
      enabled: booleanFrom(item.enabled, true),
      role,
      priority: String(numberFrom(item.priority) ?? index + 1),
      apiKey: "",
      apiKeySaved: booleanFrom(item.apiKeySaved, false),
      baseUrl: stringFrom(item.baseUrl ?? item.base_url),
      model: stringFrom(item.model) || (provider === "gemini" ? "gemini-3-pro-image-preview" : "gpt-image-2"),
      timeoutSeconds: String(Math.max(1, Math.round((numberFrom(item.timeoutMs ?? item.timeout_ms) ?? 1200000) / 1000)))
    };
  });
}

function providerDefaults(provider: ImageModelProvider): Partial<ImageModelFormState> {
  return provider === "gemini"
    ? { provider, name: "Gemini Nano Banana Pro", model: "gemini-3-pro-image-preview", baseUrl: "" }
    : { provider, name: "OpenAI Image", model: "gpt-image-2" };
}

function parseAlipayForm(value: unknown): AlipayFormState {
  const alipay = firstRecord(value, "alipay") ?? (isRecord(value) ? value : {});
  const privateKey = isRecord(alipay.privateKey) ? alipay.privateKey : {};
  const publicKey = isRecord(alipay.publicKey) ? alipay.publicKey : {};
  return {
    enabled: booleanFrom(alipay.enabled, false),
    appId: stringFrom(alipay.appId),
    privateKey: "",
    privateKeySaved: booleanFrom(privateKey.hasSecret, false),
    publicKey: "",
    publicKeySaved: booleanFrom(publicKey.hasSecret, false),
    notifyUrl: stringFrom(alipay.notifyUrl),
    returnUrl: stringFrom(alipay.returnUrl),
    gateway: stringFrom(alipay.gateway) || "https://openapi.alipay.com/gateway.do",
    signType: stringFrom(alipay.signType) || "RSA2"
  };
}

function parseWechatMiniAppForm(value: unknown): WechatMiniAppFormState {
  const wechat = firstRecord(value, "wechatMiniApp") ?? (isRecord(value) ? value : {});
  const appSecret = isRecord(wechat.appSecret) ? wechat.appSecret : {};
  return {
    enabled: booleanFrom(wechat.enabled, false),
    appId: stringFrom(wechat.appId),
    appSecret: "",
    appSecretSaved: booleanFrom(appSecret.hasSecret, false),
    allowBindExistingAccount: booleanFrom(wechat.allowBindExistingAccount, true),
    allowRegisterNewUser: booleanFrom(wechat.allowRegisterNewUser, true)
  };
}

function parseSmtpForm(value: unknown): SmtpFormState {
  const smtp = firstRecord(value, "smtp") ?? (isRecord(value) ? value : {});
  return {
    enabled: booleanFrom(smtp.enabled, false),
    host: stringFrom(smtp.host),
    port: String(numberFrom(smtp.port) ?? 465),
    secure: booleanFrom(smtp.secure, true),
    username: stringFrom(smtp.username),
    password: "",
    passwordSaved: booleanFrom(smtp.passwordSaved, false),
    fromName: stringFrom(smtp.fromName) || "商图 AI 助手",
    fromEmail: stringFrom(smtp.fromEmail)
  };
}

function parseBillingTransactions(value: unknown): BillingTransactionRow[] {
  return arrayFrom(value, ["transactions", "items"]).map((item, index) => ({
    id: stringFrom(item.id) || `transaction-${index}`,
    userId: stringFrom(item.userId ?? item.user_id),
    userEmail: stringFrom(item.userEmail ?? item.user_email),
    type: stringFrom(item.type) || "-",
    title: stringFrom(item.title) || "-",
    amountCents: numberFrom(item.amountCents ?? item.amount_cents) ?? 0,
    currency: stringFrom(item.currency) || "CNY",
    balanceAfterCents: numberFrom(item.balanceAfterCents ?? item.balance_after_cents),
    imageCount: numberFrom(item.imageCount ?? item.image_count),
    note: stringFrom(item.note),
    createdAt: stringFrom(item.createdAt) || stringFrom(item.created_at)
  }));
}

function parseBillingOrders(value: unknown): BillingOrderRow[] {
  return arrayFrom(value, ["orders", "items"]).map((item, index) => ({
    id: stringFrom(item.id) || stringFrom(item.orderId ?? item.order_id) || `order-${index}`,
    outTradeNo: stringFrom(item.outTradeNo ?? item.out_trade_no),
    type: stringFrom(item.type) || "-",
    status: stringFrom(item.status) || "-",
    title: stringFrom(item.title) || "-",
    amountCents: numberFrom(item.amountCents ?? item.amount_cents ?? item.priceCents) ?? 0,
    currency: stringFrom(item.currency) || "CNY",
    planId: stringFrom(item.planId ?? item.plan_id),
    paymentProvider: stringFrom(item.paymentProvider ?? item.payment_provider ?? item.provider),
    paymentUrl: stringFrom(item.paymentUrl ?? item.payment_url),
    createdAt: stringFrom(item.createdAt) || stringFrom(item.created_at),
    updatedAt: stringFrom(item.updatedAt) || stringFrom(item.updated_at)
  }));
}

function arrayFrom(value: unknown, keys: string[]): Record<string, unknown>[] {
  const source = Array.isArray(value)
    ? value
    : isRecord(value)
      ? keys.map((key) => value[key]).find(Array.isArray) ?? []
      : [];
  return source.filter(isRecord);
}

function firstRecord(value: unknown, key: string): Record<string, unknown> | undefined {
  if (isRecord(value) && isRecord(value[key])) {
    return value[key];
  }
  return isRecord(value) ? value : undefined;
}

function quotaLabel(user: Pick<AdminUserRow, "quotaTotal" | "quotaUsed">): string {
  const used = user.quotaUsed ?? 0;
  return user.quotaTotal ? `${used}/${user.quotaTotal}` : `${used}/未设置`;
}

function storageLabel(user: Pick<AdminUserRow, "storageQuotaBytes" | "storageUsedBytes">): string {
  const used = user.storageUsedBytes ?? 0;
  return user.storageQuotaBytes ? `${formatBytes(used)} / ${formatBytes(user.storageQuotaBytes)}` : `${used > 0 ? formatBytes(used) : "未设置"} / 未设置`;
}

function ownerLabel(item: Pick<AdminJobRow, "userDisplayName" | "userEmail" | "userId">): string {
  const displayName = item.userDisplayName?.trim();
  const email = item.userEmail?.trim();
  if (displayName && email && displayName !== email) {
    return `${displayName} · ${email}`;
  }
  return displayName || email || item.userId || "-";
}

const NEW_PLAN_ID = "__new_plan__";

function createBillingSettingsForm(): BillingSettingsFormState {
  return {
    imageUnitPrice: "0",
    currency: "CNY"
  };
}

function createImageModelForm(provider: ImageModelProvider, index: number): ImageModelFormState {
  const defaults = providerDefaults(provider);
  return {
    id: `new-${Date.now()}-${index}`,
    name: defaults.name ?? "",
    provider,
    enabled: true,
    role: index === 1 ? "primary" : "fallback",
    priority: String(index),
    apiKey: "",
    apiKeySaved: false,
    baseUrl: defaults.baseUrl ?? "",
    model: defaults.model ?? "",
    timeoutSeconds: "1200"
  };
}

function createAlipayForm(): AlipayFormState {
  return {
    enabled: false,
    appId: "",
    privateKey: "",
    privateKeySaved: false,
    publicKey: "",
    publicKeySaved: false,
    notifyUrl: "",
    returnUrl: "",
    gateway: "https://openapi.alipay.com/gateway.do",
    signType: "RSA2"
  };
}

function createWechatMiniAppForm(): WechatMiniAppFormState {
  return {
    enabled: false,
    appId: "",
    appSecret: "",
    appSecretSaved: false,
    allowBindExistingAccount: true,
    allowRegisterNewUser: true
  };
}

function createSmtpForm(): SmtpFormState {
  return {
    enabled: false,
    host: "",
    port: "465",
    secure: true,
    username: "",
    password: "",
    passwordSaved: false,
    fromName: "商图 AI 助手",
    fromEmail: ""
  };
}

const fallbackBillingPlans: BillingPlan[] = [
  {
    id: "starter",
    name: "入门套餐",
    description: "适合轻量试用和少量商品图制作。",
    imageQuota: 100,
    storageQuotaBytes: 5 * 1024 ** 3,
    priceCents: 9900,
    currency: "CNY",
    enabled: true,
    benefits: ["100 次图片生成", "5 GB 云端空间", "支付宝在线购买"]
  },
  {
    id: "pro",
    name: "专业套餐",
    description: "适合日常商品图批量生成。",
    imageQuota: 500,
    storageQuotaBytes: 30 * 1024 ** 3,
    priceCents: 39900,
    currency: "CNY",
    enabled: true,
    benefits: ["500 次图片生成", "30 GB 云端空间", "更高批量处理余量"]
  }
];

function createEmptyPlanForm(): PlanFormState {
  return {
    name: "",
    quotaTotal: "",
    storageQuotaGb: "",
    price: "",
    currency: "CNY",
    enabled: true,
    sortOrder: "0",
    featuresText: ""
  };
}

function createEmptyAdminForm(): AdminUserFormState {
  return {
    email: "",
    displayName: "",
    password: ""
  };
}

function planToForm(plan: AdminPlanRow): PlanFormState {
  return {
    name: plan.name,
    quotaTotal: stringFromNumber(plan.quotaTotal),
    storageQuotaGb: bytesToGbInput(plan.storageQuotaBytes),
    price: plan.priceCents === undefined ? "" : String(plan.priceCents / 100),
    currency: plan.currency || "CNY",
    enabled: plan.enabled,
    sortOrder: String(plan.sortOrder),
    featuresText: plan.features.join("\n")
  };
}

function planFormToPayload(form: PlanFormState): Record<string, unknown> {
  const features = splitLines(form.featuresText);
  return {
    name: form.name.trim(),
    imageQuota: nullableNumber(form.quotaTotal) ?? 0,
    storageQuotaBytes: gbToBytes(form.storageQuotaGb),
    priceCents: moneyToCents(form.price),
    currency: form.currency || "CNY",
    enabled: form.enabled,
    sortOrder: nullableNumber(form.sortOrder) ?? 0,
    features,
    benefits: features
  };
}

function userToQuotaForm(user: AdminUserRow): UserQuotaFormState {
  return {
    planId: user.planId ?? "",
    balance: centsToMoneyInput(user.balanceCents ?? 0),
    quotaTotal: stringFromNumber(user.quotaTotal),
    quotaUsed: stringFromNumber(user.quotaUsed ?? 0),
    storageQuotaGb: bytesToGbInput(user.storageQuotaBytes),
    storageUsedGb: bytesToGbInput(user.storageUsedBytes ?? 0)
  };
}

function resetUserQuotaForm(form: UserQuotaFormState): UserQuotaFormState {
  return {
    ...form,
    quotaTotal: "",
    storageQuotaGb: ""
  };
}

function userQuotaFormToPayload(form: UserQuotaFormState, preservePlanQuotas = false): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  const quotaTotal = nullableNumber(form.quotaTotal);
  const quotaUsed = nullableNumber(form.quotaUsed);
  const storageQuotaBytes = gbToBytes(form.storageQuotaGb);
  const storageUsedBytes = gbToBytes(form.storageUsedGb);
  if (!preservePlanQuotas && quotaTotal !== null) payload.quotaTotal = quotaTotal;
  if (quotaUsed !== null) payload.quotaUsed = quotaUsed;
  if (!preservePlanQuotas && storageQuotaBytes !== null) payload.storageQuotaBytes = storageQuotaBytes;
  if (storageUsedBytes !== null) payload.storageUsedBytes = storageUsedBytes;
  return Object.keys(payload).length > 0 ? payload : { quotaUsed: 0 };
}

function roleLabel(role: string): string {
  if (role === "admin" || role === "super_admin") {
    return "管理员";
  }
  return "成员";
}

function billingTypeLabel(type: string): string {
  if (type === "generation") return "生图扣费";
  if (type === "admin_adjustment") return "后台调整";
  if (type === "recharge") return "充值";
  if (type === "plan_purchase") return "套餐购买";
  return type || "-";
}

function orderStatusLabel(status: string): string {
  if (status === "pending") return "等待支付";
  if (status === "paid" || status === "succeeded") return "支付成功";
  if (status === "failed") return "支付失败";
  if (status === "cancelled" || status === "canceled") return "已取消";
  return status || "-";
}

function accountReturnUrl(): string {
  const url = new URL("/account", window.location.origin);
  url.searchParams.set("billingReturn", "1");
  return url.toString();
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) {
    return "-";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
  return `${(value / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatMoney(valueCents: number, currency = "CNY"): string {
  const amount = Number.isFinite(valueCents) ? valueCents / 100 : 0;
  try {
    return new Intl.NumberFormat("zh-CN", {
      style: "currency",
      currency,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2
    }).format(amount);
  } catch {
    return `¥${amount.toFixed(amount % 1 === 0 ? 0 : 2)}`;
  }
}

function sumAssetBytes(assets: AdminAssetRow[]): number {
  return assets.reduce((total, asset) => total + asset.sizeBytes, 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringFrom(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberFrom(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : undefined;
  }
  return undefined;
}

function booleanFrom(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalizedValue = value.trim().toLowerCase();
    if (["true", "1", "yes", "enabled", "active"].includes(normalizedValue)) {
      return true;
    }
    if (["false", "0", "no", "disabled", "inactive"].includes(normalizedValue)) {
      return false;
    }
  }
  return fallback;
}

function stringArrayFrom(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return typeof value === "string" ? splitLines(value) : [];
  }
  return value
    .map((item) => {
      if (typeof item === "string") {
        return item;
      }
      if (isRecord(item)) {
        return stringFrom(item.label ?? item.name ?? item.text);
      }
      return "";
    })
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function stringFromNumber(value: number | undefined): string {
  return value === undefined ? "" : String(value);
}

function nullableNumber(value: string): number | null {
  const normalizedValue = value.trim();
  if (!normalizedValue) {
    return null;
  }
  const numericValue = Number(normalizedValue);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function gbToBytes(value: string): number | null {
  const numericValue = nullableNumber(value);
  return numericValue === null ? null : Math.round(numericValue * 1024 ** 3);
}

function bytesToGbInput(value: number | undefined): string {
  if (value === undefined) {
    return "";
  }
  if (value === 0) {
    return "0";
  }
  return String(Number((value / 1024 ** 3).toFixed(2)));
}

function moneyToCents(value: string): number | null {
  const numericValue = nullableNumber(value);
  return numericValue === null ? null : Math.round(numericValue * 100);
}

function centsToMoneyInput(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }
  return String(Number((value / 100).toFixed(2)));
}
