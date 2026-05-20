import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  CreditCard,
  Database,
  Download,
  ExternalLink,
  Gift,
  Layers3,
  HardDrive,
  ImageIcon,
  Loader2,
  Lock,
  Mail,
  Package,
  Pencil,
  Phone,
  Plus,
  Receipt,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
  Sparkles,
  Ticket,
  User,
  UserPlus,
  Users,
  Video,
  Wallet,
  Upload,
  X
} from "lucide-react";
import type React from "react";
import { Fragment, useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { PHONE_VERIFICATION_REQUIRED_CODE, PHONE_VERIFICATION_REQUIRED_MESSAGE, authFetch, getStoredAuthToken, readApiError, readApiErrorDetail, type AuthSession, type AuthUser } from "./authClient";
import { BRAND_TAGLINE, BrandMark, BrandName } from "./Brand";
import { AdminHelpPanel } from "./HelpCenter";
import type {
  AdminWechatMiniAppConfigResponse,
  CategoryKitPlannerModule,
  CategoryKitPlannerModelRole,
  CategoryKitPlannerProvider,
  EcommerceGenerationConcurrencyConfigResponse,
  CloudStorageProvider,
  DemoCanvasAssetUploadResponse,
  DemoCanvasConfigResponse,
  DemoCanvasExample,
  GalleryImageItem,
  ImageQuality,
  MaskedSecret,
  OutputFormat,
  SaveCategoryKitPlannerConfigRequest,
  SaveEcommerceGenerationConcurrencyConfigRequest,
  SaveAppReleaseConfigRequest,
  SaveDemoCanvasConfigRequest,
  SaveSeedanceVideoConfigRequest,
  SaveStorageConfigRequest,
  SeedanceVideoConfigResponse,
  StorageConfigResponse,
  StorageTestResult,
  StylePresetId
} from "@gpt-image-canvas/shared";

type AuthMode = "login" | "register";
type AdminTab = "overview" | "models" | "categoryStrategies" | "storage" | "billing" | "redemption" | "extension" | "appRelease" | "auth" | "help" | "plans" | "users" | "referral" | "demoCanvas" | "gallery" | "ledger";

const adminTabs: Array<{ id: AdminTab; label: string }> = [
  { id: "overview", label: "概览" },
  { id: "models", label: "模型" },
  { id: "categoryStrategies", label: "类目策略" },
  { id: "storage", label: "云存储" },
  { id: "billing", label: "计费支付" },
  { id: "redemption", label: "兑换码" },
  { id: "extension", label: "插件发布" },
  { id: "appRelease", label: "App 版本" },
  { id: "auth", label: "登录" },
  { id: "help", label: "帮助中心" },
  { id: "plans", label: "套餐" },
  { id: "users", label: "用户" },
  { id: "referral", label: "邀请激励" },
  { id: "demoCanvas", label: "画布案例" },
  { id: "gallery", label: "公开案例" },
  { id: "ledger", label: "流水" }
];

const DEFAULT_ARK_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";
const DEFAULT_SEEDANCE_MODEL = "doubao-seedance-2-0-fast-260128";
const textModelModuleOptions: Array<{ id: CategoryKitPlannerModule; label: string }> = [
  { id: "prompt-optimizer", label: "提示词优化" },
  { id: "category-kit-planner", label: "品类套图规划" },
  { id: "category-classifier", label: "类目识别" },
  { id: "video-storyboard-planner", label: "视频分镜规划" }
];

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

const authCarouselImages = [
  {
    src: "/images/auth-carousel-clothes.png",
    alt: "服装商品图一键生成模特上身照和营销海报图"
  },
  {
    src: "/images/auth-carousel-product.png",
    alt: "商品原图一键生成电商主图和营销海报图"
  }
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
  onSendSmsCode
}: {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  onAuthenticated: (session: AuthSession) => void;
  onLogin: (account: string, password: string) => Promise<AuthSession>;
  onRegister: (phone: string, password: string, displayName: string, smsCode: string, inviteCode?: string) => Promise<AuthSession>;
  onSendSmsCode: (phone: string) => Promise<void>;
}) {
  const [account, setAccount] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [smsCode, setSmsCode] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const isRegister = mode === "register";

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("inviteCode") || params.get("invite") || params.get("ref") || "";
    if (code) {
      setInviteCode(code);
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCarouselIndex((current) => (current + 1) % authCarouselImages.length);
    }, 4200);
    return () => window.clearInterval(timer);
  }, []);

  async function submitForm(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError("");

    if (isRegister && !phone.trim()) {
      setError("请输入手机号。");
      return;
    }
    if (!isRegister && !account.trim()) {
      setError("请输入手机号或邮箱。");
      return;
    }
    if (!password) {
      setError("请输入密码。");
      return;
    }
    if (isRegister && !displayName.trim()) {
      setError("请输入显示名。");
      return;
    }
    if (isRegister && !smsCode.trim()) {
      setError("请输入短信验证码。");
      return;
    }

    setIsSubmitting(true);
    try {
      const session = isRegister ? await onRegister(phone, password, displayName, smsCode, inviteCode) : await onLogin(account, password);
      onAuthenticated(session);
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : isRegister ? "注册失败。" : "登录失败。");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function sendSmsCode(): Promise<void> {
    setError("");
    setNotice("");
    if (!phone.trim()) {
      setError("请先输入手机号。");
      return;
    }

    setIsSendingCode(true);
    try {
      await onSendSmsCode(phone);
      setNotice("验证码已发送，请查收短信。");
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
          <figure className="auth-panel__visual" aria-label="电商商品图生成示意轮播">
            {authCarouselImages.map((image, index) => (
              <img
                aria-hidden={index !== carouselIndex}
                className="auth-panel__visual-image"
                data-active={index === carouselIndex}
                key={image.src}
                src={image.src}
                alt={image.alt}
                loading={index === 0 ? "eager" : "lazy"}
              />
            ))}
          </figure>
          <div className="auth-panel__summary">
            <p className="auth-eyebrow">
              <Sparkles className="size-3.5" aria-hidden="true" />
              Workspace
            </p>
            <h1 id="auth-title">{isRegister ? "创建账户后进入工作台" : "登录后继续创作"}</h1>
            <p>画布、图库和生成记录会绑定到你的账户，云存储由后台统一配置。</p>
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

          {isRegister ? (
            <label className="auth-field">
              <span>手机号</span>
              <div className="auth-input">
                <Phone className="size-4" aria-hidden="true" />
                <input
                  autoComplete="tel"
                  inputMode="tel"
                  name="phone"
                  placeholder="请输入 11 位手机号"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                />
              </div>
            </label>
          ) : (
            <label className="auth-field">
              <span>手机号/邮箱</span>
              <div className="auth-input">
                <User className="size-4" aria-hidden="true" />
                <input
                  autoComplete="username"
                  name="account"
                  placeholder="手机号或邮箱"
                  value={account}
                  onChange={(event) => setAccount(event.target.value)}
                />
              </div>
            </label>
          )}

          {isRegister ? (
            <label className="auth-field">
              <span>短信验证码</span>
              <div className="auth-input auth-input--with-action">
                <ShieldCheck className="size-4" aria-hidden="true" />
                <input
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  maxLength={6}
                  name="smsCode"
                  placeholder="6 位验证码"
                  value={smsCode}
                  onChange={(event) => setSmsCode(event.target.value)}
                />
                <button className="auth-input__action" disabled={isSendingCode} type="button" onClick={() => void sendSmsCode()}>
                  {isSendingCode ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
                  发送
                </button>
              </div>
            </label>
          ) : null}

          {isRegister ? (
            <label className="auth-field">
              <span>邀请码</span>
              <div className="auth-input">
                <UserPlus className="size-4" aria-hidden="true" />
                <input
                  autoComplete="off"
                  name="inviteCode"
                  placeholder="可选，来自邀请链接会自动带入"
                  value={inviteCode}
                  onChange={(event) => setInviteCode(event.target.value)}
                />
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

export function AccountPage({
  billingEnabled = true,
  user,
  mobile = false,
  onLogout,
  onNavigate,
  onUserUpdated,
  onSendPhoneCode,
  onBindPhone
}: {
  billingEnabled?: boolean;
  user: AuthUser;
  mobile?: boolean;
  onLogout?: () => void;
  onNavigate?: (route: "canvas" | "gallery" | "account" | "help" | "admin") => void;
  onUserUpdated?: (user: AuthUser) => void;
  onSendPhoneCode?: (phone: string) => Promise<void>;
  onBindPhone?: (phone: string, smsCode: string) => Promise<AuthSession>;
}) {
  const [billing, setBilling] = useState<AccountBillingState>(() => createAccountBillingState(user));
  const [referral, setReferral] = useState<InviteSummaryState>(() => createInviteSummaryState(user));
  const [bindPhone, setBindPhone] = useState(user.phone ?? "");
  const [bindSmsCode, setBindSmsCode] = useState("");
  const [bindPhoneError, setBindPhoneError] = useState("");
  const [bindPhoneNotice, setBindPhoneNotice] = useState("");
  const [isPhoneDialogOpen, setIsPhoneDialogOpen] = useState(!user.phone);
  const [isSendingBindCode, setIsSendingBindCode] = useState(false);
  const [isBindingPhone, setIsBindingPhone] = useState(false);
  const [referralLoading, setReferralLoading] = useState(true);
  const [referralAction, setReferralAction] = useState("");
  const [referralError, setReferralError] = useState("");
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [inviteQrDataUrl, setInviteQrDataUrl] = useState("");
  const [rechargeAmount, setRechargeAmount] = useState("50");
  const [billingLoading, setBillingLoading] = useState(true);
  const [billingAction, setBillingAction] = useState("");
  const [billingActionLoading, setBillingActionLoading] = useState("");
  const [billingError, setBillingError] = useState("");
  const [redemptionCode, setRedemptionCode] = useState("");
  const [invoice, setInvoice] = useState<InvoiceApplicationsState>(createInvoiceApplicationsState());
  const [invoiceForm, setInvoiceForm] = useState<InvoiceFormState>(createInvoiceFormState(user));
  const [invoiceLoading, setInvoiceLoading] = useState(true);
  const [invoiceSaving, setInvoiceSaving] = useState(false);
  const [invoiceNotice, setInvoiceNotice] = useState("");
  const [invoiceError, setInvoiceError] = useState("");
  const invoiceRequestableAmount = invoice.summary.requestableAmountCents;
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
  const inviteUrl = referral.inviteUrl || (referral.inviteCode ? `${window.location.origin}/register?inviteCode=${encodeURIComponent(referral.inviteCode)}` : "");
  const inviteeRegisterCredits = referral.settings.inviteeRegisterCredits;
  const inviterRegisterCredits = referral.settings.inviterRegisterCredits;
  const rechargeCashbackRate = typeof referral.settings.rechargeCashbackRateBps === "number" ? referral.settings.rechargeCashbackRateBps / 100 : undefined;
  const planCashbackRate = typeof referral.settings.planPurchaseCashbackRateBps === "number" ? referral.settings.planPurchaseCashbackRateBps / 100 : undefined;
  const activePlanBlocksPurchase = Boolean(
    currentPlanId &&
      currentPlanId !== "free" &&
      currentPlanExpiresAt &&
      new Date(currentPlanExpiresAt).getTime() > Date.now() &&
      quotaRemaining > 0
  );

  useEffect(() => {
    setIsPhoneDialogOpen(!user.phone);
  }, [user.phone]);

  async function loadBilling({ preserveNotice = false, signal }: { preserveNotice?: boolean; signal?: AbortSignal } = {}): Promise<void> {
    if (!billingEnabled) {
      setBilling(createAccountBillingState(user));
      setBillingLoading(false);
      setBillingError("");
      setBillingAction("");
      return;
    }
    if (!user.phone) {
      setBilling(createAccountBillingState(user));
      setBillingLoading(false);
      setBillingError("");
      setIsPhoneDialogOpen(true);
      return;
    }
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
        const detail = await readApiErrorDetail(summaryResponse, "计费数据加载失败。");
        if (detail.code === PHONE_VERIFICATION_REQUIRED_CODE) {
          setIsPhoneDialogOpen(true);
          return;
        }
        throw new Error(detail.message);
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

  async function loadInvoiceApplications({ signal }: { signal?: AbortSignal } = {}): Promise<void> {
    if (!billingEnabled) {
      setInvoice(createInvoiceApplicationsState());
      setInvoiceLoading(false);
      setInvoiceError("");
      return;
    }
    setInvoiceLoading(true);
    setInvoiceError("");
    try {
      const response = await authFetch("/api/billing/invoice/applications", { signal });
      if (!response.ok) {
        throw new Error(await readApiError(response, "开票信息加载失败。"));
      }
      const parsed = parseInvoiceApplications(await response.json());
      if (signal?.aborted) {
        return;
      }
      setInvoice(parsed);
      if (parsed.profile) {
        setInvoiceForm(invoiceRecordToForm(parsed.profile));
      } else {
        setInvoiceForm((current) => ({
          ...current,
          email: current.email || user.email || ""
        }));
      }
    } catch (error) {
      if (!signal?.aborted) {
        setInvoice(createInvoiceApplicationsState());
        setInvoiceError(error instanceof Error ? error.message : "开票信息加载失败。");
      }
    } finally {
      if (!signal?.aborted) {
        setInvoiceLoading(false);
      }
    }
  }

  async function submitInvoiceApplication(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const amountCents = moneyToCents(invoiceForm.amount);
    if (!invoiceForm.title.trim()) {
      setInvoiceError("请填写发票抬头。");
      return;
    }
    if (invoiceForm.headerType === "company" && !invoiceForm.taxNumber.trim()) {
      setInvoiceError("企业抬头需要填写纳税人识别号。");
      return;
    }
    if (!amountCents || amountCents <= 0) {
      setInvoiceError("请填写有效的开票金额。");
      return;
    }
    if (amountCents > invoiceRequestableAmount) {
      setInvoiceError(`开票金额不能超过可申请金额 ${formatMoney(invoiceRequestableAmount, invoice.summary.currency)}。`);
      return;
    }
    if (!invoiceForm.email.trim()) {
      setInvoiceError("请填写接收邮箱。");
      return;
    }

    setInvoiceSaving(true);
    setInvoiceNotice("");
    setInvoiceError("");
    try {
      const response = await authFetch("/api/billing/invoice/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          headerType: invoiceForm.headerType,
          title: invoiceForm.title.trim(),
          taxNumber: invoiceForm.taxNumber.trim() || undefined,
          invoiceContent: invoiceForm.invoiceContent.trim() || "商品图生成服务",
          amountCents,
          email: invoiceForm.email.trim(),
          phone: invoiceForm.phone.trim() || undefined,
          companyAddress: invoiceForm.companyAddress.trim() || undefined,
          bankName: invoiceForm.bankName.trim() || undefined,
          bankAccount: invoiceForm.bankAccount.trim() || undefined,
          remark: invoiceForm.remark.trim() || undefined
        })
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, "开票申请提交失败。"));
      }
      const parsed = parseInvoiceApplications(await response.json());
      setInvoice(parsed);
      if (parsed.profile) {
        setInvoiceForm(invoiceRecordToForm(parsed.profile));
      }
      setInvoiceNotice("开票申请已提交，信息已保存备用。");
    } catch (error) {
      setInvoiceError(error instanceof Error ? error.message : "开票申请提交失败。");
    } finally {
      setInvoiceSaving(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    const returnedFromPayment = new URLSearchParams(window.location.search).has("billingReturn");
    if (returnedFromPayment) {
      setBillingAction("已从支付页面返回，正在刷新余额和订单状态。若订单仍显示待支付，请稍后再刷新。");
    }
    if (billingEnabled) {
      void loadBilling({ preserveNotice: returnedFromPayment, signal: controller.signal });
      void loadInvoiceApplications({ signal: controller.signal });
    } else {
      setBilling(createAccountBillingState(user));
      setInvoice(createInvoiceApplicationsState());
      setBillingLoading(false);
      setInvoiceLoading(false);
      setBillingAction("");
      setBillingError("");
      setInvoiceError("");
    }
    return () => controller.abort();
  }, [billingEnabled, user.id]);

  useEffect(() => {
    const controller = new AbortController();
    void loadReferral({ signal: controller.signal });
    return () => controller.abort();
  }, [user.id]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const dismissedKey = `referral-campaign-dismissed:${user.id}`;
    const shouldForceOpen = params.get("inviteCampaign") === "1" || params.get("source") === "extension";
    if (shouldForceOpen || !window.localStorage.getItem(dismissedKey)) {
      setIsInviteDialogOpen(true);
    }
  }, [user.id]);

  useEffect(() => {
    let active = true;
    if (!inviteUrl) {
      setInviteQrDataUrl("");
      return;
    }
    void QRCode.toDataURL(inviteUrl, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 320,
      color: {
        dark: "#0f172a",
        light: "#ffffff"
      }
    }).then((dataUrl) => {
      if (active) {
        setInviteQrDataUrl(dataUrl);
      }
    });
    return () => {
      active = false;
    };
  }, [inviteUrl]);

  async function loadReferral({ signal }: { signal?: AbortSignal } = {}): Promise<void> {
    if (!user.phone) {
      setReferral(createInviteSummaryState(user));
      setReferralLoading(false);
      setReferralError("");
      setIsPhoneDialogOpen(true);
      return;
    }
    setReferralLoading(true);
    setReferralError("");
    try {
      const response = await authFetch("/api/referral/summary", { signal });
      if (!response.ok) {
        const detail = await readApiErrorDetail(response, "邀请信息加载失败。");
        if (detail.code === PHONE_VERIFICATION_REQUIRED_CODE) {
          setIsPhoneDialogOpen(true);
          return;
        }
        throw new Error(detail.message);
      }
      const body = await response.json();
      if (signal?.aborted) {
        return;
      }
      setReferral(parseInviteSummary(body, user));
    } catch (error) {
      if (!signal?.aborted) {
        setReferralError(error instanceof Error ? error.message : "邀请信息加载失败。");
      }
    } finally {
      if (!signal?.aborted) {
        setReferralLoading(false);
      }
    }
  }

  async function copyInviteUrl(): Promise<void> {
    if (!inviteUrl) {
      setReferralAction("邀请链接还没准备好，请刷新后再试。");
      return;
    }
    await window.navigator.clipboard.writeText(inviteUrl);
    setReferralAction("邀请链接已复制，可以直接发给好友注册。");
  }

  async function downloadInvitePoster(): Promise<void> {
    if (!inviteUrl || !inviteQrDataUrl) {
      setReferralAction("海报还没准备好，请稍后重试。");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1440;
    const context = canvas.getContext("2d");
    if (!context) {
      setReferralAction("海报生成失败。");
      return;
    }

    const loadImage = (src: string) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.crossOrigin = "anonymous";
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("图片加载失败"));
        image.src = src;
      });

    try {
      const poster = await loadImage("/images/referral-campaign-poster.png");
      context.drawImage(poster, 0, 0, canvas.width, canvas.height);
      context.fillStyle = "rgba(255,255,255,0.95)";
      context.fillRect(72, 844, 936, 482);
      context.fillStyle = "#0f766e";
      context.font = "900 28px sans-serif";
      context.fillText("商图 AI 助手", 110, 928);
      context.fillStyle = "#0f172a";
      context.font = "900 44px sans-serif";
      context.fillText("3 分钟出全套电商图", 110, 984);
      context.font = "700 26px sans-serif";
      context.fillStyle = "#334155";
      context.fillText("无需请模特，主图 / 场景图 / 详情图一次生成", 110, 1040);
      context.fillText("跨境翻译图片一键解决，全球电商平台适配", 110, 1084);
      context.fillText("自动整理卖点，商品图到上架素材全流程覆盖", 110, 1128);
      context.fillStyle = "#0f766e";
      context.font = "900 26px sans-serif";
      context.fillText(`注册额外送 ${formatCreditReward(inviteeRegisterCredits)}`, 110, 1178);
      context.fillStyle = "#334155";
      context.font = "700 24px sans-serif";
      context.fillText(`邀请码：${referral.inviteCode}`, 110, 1222);
      const qr = await loadImage(inviteQrDataUrl);
      context.drawImage(qr, 794, 914, 196, 196);
      context.fillStyle = "#0f766e";
      context.font = "900 28px sans-serif";
      context.fillText("扫码免费试用", 810, 1152);
      context.fillStyle = "#475569";
      context.font = "600 22px sans-serif";
      context.fillText(inviteUrl.replace(/^https?:\/\//u, ""), 110, 1280);
      const link = document.createElement("a");
      link.download = `invite-poster-${referral.inviteCode || "campaign"}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      setReferralAction("邀请海报已下载。");
    } catch {
      setReferralAction("邀请海报生成失败，请重试。");
    }
  }

  function closeInviteDialog(): void {
    window.localStorage.setItem(`referral-campaign-dismissed:${user.id}`, "1");
    setIsInviteDialogOpen(false);
  }

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
        const detail = await readApiErrorDetail(response, "充值下单失败。");
        if (detail.code === PHONE_VERIFICATION_REQUIRED_CODE) {
          setIsPhoneDialogOpen(true);
          return;
        }
        throw new Error(detail.message);
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

  async function submitRedemptionCode(): Promise<void> {
    const code = redemptionCode.trim();
    if (!code) {
      setBillingAction("请输入兑换码。");
      return;
    }
    setBillingActionLoading("redemption");
    setBillingError("");
    setBillingAction("");
    try {
      const response = await authFetch("/api/redemption-codes/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code })
      });
      if (!response.ok) {
        const detail = await readApiErrorDetail(response, "兑换码兑换失败。");
        if (detail.code === PHONE_VERIFICATION_REQUIRED_CODE) {
          setIsPhoneDialogOpen(true);
          return;
        }
        throw new Error(detail.message);
      }
      const body = await response.json();
      const redemption = firstRecord(body, "redemption");
      const userPatch = firstRecord(body, "user");
      const quotaGranted = numberFrom(redemption?.quotaGranted ?? redemption?.quota_granted) ?? 0;
      const expiresAt = stringFrom(redemption?.expiresAt ?? redemption?.expires_at);
      const quotaTotalPatch = numberFrom(userPatch?.quotaTotal ?? userPatch?.quota_total);
      const quotaUsedPatch = numberFrom(userPatch?.quotaUsed ?? userPatch?.quota_used);
      const packageRemainingPatch = numberFrom(userPatch?.packageRemaining ?? userPatch?.package_remaining);
      const planExpiresAtPatch = stringFrom(userPatch?.planExpiresAt ?? userPatch?.plan_expires_at);
      if (quotaTotalPatch !== undefined || quotaUsedPatch !== undefined || packageRemainingPatch !== undefined) {
        onUserUpdated?.({
          ...user,
          quotaTotal: quotaTotalPatch ?? user.quotaTotal,
          quotaUsed: quotaUsedPatch ?? user.quotaUsed,
          packageRemaining: packageRemainingPatch ?? user.packageRemaining,
          planExpiresAt: planExpiresAtPatch || user.planExpiresAt
        });
      }
      setRedemptionCode("");
      setBillingAction(`兑换成功，已增加 ${quotaGranted.toLocaleString("zh-CN")} 张额度${expiresAt ? `，有效期至 ${formatDate(expiresAt)}` : ""}。`);
      await loadBilling({ preserveNotice: true });
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : "兑换码兑换失败。");
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
        const detail = await readApiErrorDetail(response, paymentMethod === "balance" ? "余额购买失败。" : "支付宝购买下单失败。");
        if (detail.code === PHONE_VERIFICATION_REQUIRED_CODE) {
          setIsPhoneDialogOpen(true);
          return;
        }
        throw new Error(detail.message);
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

  async function sendBindCode(): Promise<void> {
    if (!onSendPhoneCode) return;
    setBindPhoneError("");
    setBindPhoneNotice("");
    if (!bindPhone.trim()) {
      setBindPhoneError("请先输入手机号。");
      return;
    }
    setIsSendingBindCode(true);
    try {
      await onSendPhoneCode(bindPhone);
      setBindPhoneNotice("验证码已发送，请查收短信。");
    } catch (error) {
      setBindPhoneError(error instanceof Error ? error.message : "验证码发送失败。");
    } finally {
      setIsSendingBindCode(false);
    }
  }

  async function submitBindPhone(): Promise<void> {
    if (!onBindPhone) return;
    setBindPhoneError("");
    setBindPhoneNotice("");
    if (!bindPhone.trim() || !bindSmsCode.trim()) {
      setBindPhoneError("请输入手机号和短信验证码。");
      return;
    }
    setIsBindingPhone(true);
    try {
      const session = await onBindPhone(bindPhone, bindSmsCode);
      onUserUpdated?.(session.user);
      setBindPhoneNotice("手机号已验证。");
      setBindSmsCode("");
      setIsPhoneDialogOpen(false);
    } catch (error) {
      setBindPhoneError(error instanceof Error ? error.message : "手机号验证失败。");
    } finally {
      setIsBindingPhone(false);
    }
  }

  if (mobile) {
    return (
      <main className="mobile-account app-view">
        <header className="mobile-app-header">
          <div className="mobile-app-header__side">
            <button aria-label="返回首页" type="button" onClick={() => onNavigate?.("canvas")}>
              <ChevronLeft className="size-5" aria-hidden="true" />
            </button>
            <button aria-label="首页" type="button" onClick={() => onNavigate?.("canvas")}>
              <HomeIconFallback />
            </button>
          </div>
          <div className="mobile-app-header__title">
            <strong>我的</strong>
            <span>个人中心</span>
          </div>
          <button className="mobile-app-header__icon" aria-label="账户设置" type="button">
            <Pencil className="size-5" aria-hidden="true" />
          </button>
        </header>

        <div className="mobile-account__content">
          <section className="mobile-account-hero">
            <div className="mobile-account-hero__profile">
              <div className="mobile-account-avatar" aria-hidden="true">
                <User className="size-10" />
              </div>
              <div>
                <h1>{user.displayName || "创作者"}</h1>
                <span>{roleLabel(user.role)}</span>
                <p>欢迎使用 商图 AI 助手</p>
              </div>
            </div>
            <div className="mobile-account-hero__contact">
              <span><Phone className="size-4" aria-hidden="true" />{maskPhone(user.phone)}</span>
              <span><Mail className="size-4" aria-hidden="true" />{user.email || "-"}</span>
            </div>
            <div className="mobile-account-wallet">
              <div>
                <span>剩余额度</span>
                <strong>{quotaRemaining.toLocaleString("zh-CN")}<small> 张</small></strong>
                {billingEnabled ? <button type="button" onClick={() => setRechargeAmount(rechargeAmount || "50")}>充值额度</button> : null}
              </div>
              <div>
                <span>当前套餐</span>
                <strong>{currentPlanName}</strong>
                <em>{currentPlanExpiresAt ? `有效期至 ${formatDate(currentPlanExpiresAt)}` : "长期有效"}</em>
                <p>已使用 {quotaUsed.toLocaleString("zh-CN")} / {quotaTotal.toLocaleString("zh-CN")} 张</p>
                <div className="mobile-account-meter"><span style={{ width: `${quotaPercent}%` }} /></div>
              </div>
            </div>
            {billingEnabled ? (
            <div className="mobile-redeem-card">
              <label>
                <span>兑换码</span>
                <input value={redemptionCode} onChange={(event) => setRedemptionCode(event.target.value.toUpperCase())} placeholder="输入后台发放的兑换码" />
              </label>
              <button disabled={billingActionLoading === "redemption"} type="button" onClick={() => void submitRedemptionCode()}>
                {billingActionLoading === "redemption" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Ticket className="size-4" aria-hidden="true" />}
                兑换
              </button>
            </div>
            ) : null}
            {billingError ? <p className="billing-alert billing-alert--warning" role="alert">{billingError}</p> : null}
            {billingAction ? <p className="billing-alert billing-alert--success" role="status">{billingAction}</p> : null}
          </section>

          <section className="mobile-account-actions" aria-label="快捷入口">
            {billingEnabled ? <button type="button"><Wallet className="size-7" aria-hidden="true" /><strong>充值额度</strong><span>快速到账</span></button> : null}
            {billingEnabled ? <button type="button"><Receipt className="size-7" aria-hidden="true" /><strong>订单记录</strong><span>消费明细</span></button> : null}
            <button type="button" onClick={() => onNavigate?.("help")}><HelpIconFallback /><strong>帮助中心</strong><span>使用指南</span></button>
            <button type="button" onClick={() => setIsInviteDialogOpen(true)}><Gift className="size-7" aria-hidden="true" /><strong>邀请奖励</strong><span>得免费额度</span></button>
          </section>

          <section className="mobile-account-list" aria-label="账户信息">
            <MobileAccountRow icon={<Phone className="size-5" aria-hidden="true" />} label="手机号" value={maskPhone(user.phone)} />
            <MobileAccountRow icon={<Mail className="size-5" aria-hidden="true" />} label="邮箱" value={user.email || "-"} />
            <MobileAccountRow icon={<User className="size-5" aria-hidden="true" />} label="显示名" value={user.displayName || "-"} />
            <MobileAccountRow icon={<ShieldCheck className="size-5" aria-hidden="true" />} label="角色" value={roleLabel(user.role)} />
            <MobileAccountRow icon={<Package className="size-5" aria-hidden="true" />} label="当前套餐" value={currentPlanName} />
          </section>

          {user.role === "admin" ? (
            <button className="mobile-account-admin" type="button" onClick={() => onNavigate?.("admin")}>
              <Database className="size-5" aria-hidden="true" />
              <span><strong>管理后台</strong><small>仅管理员可访问</small></span>
              <ChevronRight className="size-5" aria-hidden="true" />
            </button>
          ) : null}

          <button className="mobile-account-logout" type="button" onClick={onLogout}>
            <LogOutIconFallback />
            退出登录
          </button>
        </div>

        <nav className="mobile-bottom-nav" aria-label="手机底部导航">
          <button className="mobile-workbench__tab" type="button" onClick={() => onNavigate?.("canvas")}>
            <HomeIconFallback />
            <span>首页</span>
          </button>
          <button className="mobile-workbench__tab" type="button" onClick={() => onNavigate?.("canvas")}>
            <Sparkles className="size-5" aria-hidden="true" />
            <span>生图</span>
          </button>
          <button className="mobile-workbench__tab" type="button" onClick={() => onNavigate?.("gallery")}>
            <ImageIcon className="size-5" aria-hidden="true" />
            <span>图库</span>
          </button>
          <button className="mobile-workbench__tab" data-active="true" type="button">
            <User className="size-5" aria-hidden="true" />
            <span>我的</span>
          </button>
        </nav>

        {isInviteDialogOpen ? (
          <InviteCampaignDialog
            inviteCode={referral.inviteCode}
            inviteUrl={inviteUrl}
            inviteeRegisterCredits={inviteeRegisterCredits}
            invitedUserCount={referral.invitedUserCount}
            inviterRegisterCredits={inviterRegisterCredits}
            loading={referralLoading}
            planCashbackRate={planCashbackRate}
            rechargeCashbackRate={rechargeCashbackRate}
            inviteQrDataUrl={inviteQrDataUrl}
            error={referralError}
            notice={referralAction}
            onClose={closeInviteDialog}
            onCopy={() => void copyInviteUrl()}
            onDownload={() => void downloadInvitePoster()}
            onRefresh={() => void loadReferral()}
          />
        ) : null}
      </main>
    );
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
          <InfoTile label="手机号" value={user.phone || "未验证"} icon={<Phone className="size-4" aria-hidden="true" />} />
          <InfoTile label="邮箱" value={user.email || "-"} icon={<Mail className="size-4" aria-hidden="true" />} />
          <InfoTile label="显示名" value={user.displayName} icon={<User className="size-4" aria-hidden="true" />} />
          <InfoTile label="角色" value={roleLabel(user.role)} icon={<ShieldCheck className="size-4" aria-hidden="true" />} />
          <InfoTile label="当前套餐" value={currentPlanName} icon={<Package className="size-4" aria-hidden="true" />} />
          <InfoTile label="套餐到期" value={currentPlanExpiresAt ? formatDateTime(currentPlanExpiresAt) : "长期"} icon={<Clock className="size-4" aria-hidden="true" />} />
        </div>

        <section className="referral-campaign-panel" aria-labelledby="referral-campaign-title">
          <div className="referral-campaign-panel__copy">
            <p className="settings-eyebrow">
              <Gift className="size-4" aria-hidden="true" />
              Invite Campaign
            </p>
            <h2 id="referral-campaign-title">邀请好友注册，赚生图张数和现金返现</h2>
            <p>好友通过你的邀请链接注册，双方都能获得生图额度；好友后续充值或购买套餐，你还可以获得现金激励。</p>
            <div className="referral-campaign-panel__rules">
              <span>你得 {formatCreditReward(inviterRegisterCredits)}</span>
              <span>好友多得 {formatCreditReward(inviteeRegisterCredits)}</span>
              <span>充值返现 {formatOptionalPercent(rechargeCashbackRate)}</span>
            </div>
          </div>
          <div className="referral-campaign-panel__actions">
            <button className="primary-action h-10" type="button" onClick={() => setIsInviteDialogOpen(true)}>
              <Sparkles className="size-4" aria-hidden="true" />
              生成邀请海报
            </button>
            <button className="secondary-action h-10" disabled={!inviteUrl} type="button" onClick={() => void copyInviteUrl()}>
              <Copy className="size-4" aria-hidden="true" />
              复制邀请链接
            </button>
          </div>
        </section>

        {billingEnabled ? (
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

          <div className="redeem-form">
            <label>
              <span>兑换码</span>
              <input value={redemptionCode} onChange={(event) => setRedemptionCode(event.target.value.toUpperCase())} placeholder="输入兑换码领取额度" />
            </label>
            <button className="secondary-action h-10" disabled={Boolean(billingActionLoading)} type="button" onClick={() => void submitRedemptionCode()}>
              {billingActionLoading === "redemption" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Ticket className="size-4" aria-hidden="true" />}
              兑换额度
            </button>
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
        ) : null}

        {billingEnabled ? (
        <section className="billing-panel invoice-panel" aria-labelledby="invoice-title">
          <div className="billing-panel__header">
            <div>
              <p className="settings-eyebrow">Invoice</p>
              <h2 id="invoice-title">开票申请</h2>
            </div>
            <button className="secondary-action h-10" disabled={invoiceLoading} type="button" onClick={() => void loadInvoiceApplications()}>
              {invoiceLoading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="size-4" aria-hidden="true" />}
              刷新
            </button>
          </div>

          {invoiceError ? <p className="billing-alert billing-alert--warning" role="alert">{invoiceError}</p> : null}
          {invoiceNotice ? <p className="billing-alert billing-alert--success" role="status">{invoiceNotice}</p> : null}
          <div className="account-billing-overview">
            <div className="billing-stat-card">
              <span>实际支付</span>
              <strong>{formatMoney(invoice.summary.paidAmountCents, invoice.summary.currency)}</strong>
            </div>
            <div className="billing-stat-card">
              <span>已开票</span>
              <strong>{formatMoney(invoice.summary.issuedAmountCents, invoice.summary.currency)}</strong>
            </div>
            <div className="billing-stat-card">
              <span>可申请金额</span>
              <strong>{formatMoney(invoiceRequestableAmount, invoice.summary.currency)}</strong>
            </div>
          </div>
          {invoice.profile ? (
            <div className="invoice-latest-card">
              <div>
                <span>最近保存</span>
                <strong>{invoice.profile.title}</strong>
                <p>{invoice.profile.headerType === "personal" ? "个人/其他" : "企业抬头"} · {formatDateTime(invoice.profile.createdAt)}</p>
              </div>
              <em>{formatMoney(invoice.profile.amountCents, "CNY")}</em>
            </div>
          ) : null}

          <form className="invoice-form" onSubmit={(event) => void submitInvoiceApplication(event)}>
            <label>
              <span>抬头类型</span>
              <select value={invoiceForm.headerType} onChange={(event) => setInvoiceForm((current) => ({ ...current, headerType: event.target.value as InvoiceHeaderType }))}>
                <option value="company">企业抬头</option>
                <option value="personal">个人/其他</option>
              </select>
            </label>
            <label>
              <span>发票抬头</span>
              <input value={invoiceForm.title} onChange={(event) => setInvoiceForm((current) => ({ ...current, title: event.target.value }))} />
            </label>
            <label>
              <span>纳税人识别号</span>
              <input disabled={invoiceForm.headerType === "personal"} value={invoiceForm.taxNumber} onChange={(event) => setInvoiceForm((current) => ({ ...current, taxNumber: event.target.value }))} />
            </label>
            <label>
              <span>开票内容</span>
              <input value={invoiceForm.invoiceContent} onChange={(event) => setInvoiceForm((current) => ({ ...current, invoiceContent: event.target.value }))} />
            </label>
            <label>
              <span>开票金额</span>
              <input inputMode="decimal" value={invoiceForm.amount} onChange={(event) => setInvoiceForm((current) => ({ ...current, amount: event.target.value }))} />
            </label>
            <label>
              <span>接收邮箱</span>
              <input value={invoiceForm.email} onChange={(event) => setInvoiceForm((current) => ({ ...current, email: event.target.value }))} />
            </label>
            <label>
              <span>联系电话</span>
              <input value={invoiceForm.phone} onChange={(event) => setInvoiceForm((current) => ({ ...current, phone: event.target.value }))} />
            </label>
            <label>
              <span>公司地址</span>
              <input value={invoiceForm.companyAddress} onChange={(event) => setInvoiceForm((current) => ({ ...current, companyAddress: event.target.value }))} />
            </label>
            <label>
              <span>开户行</span>
              <input value={invoiceForm.bankName} onChange={(event) => setInvoiceForm((current) => ({ ...current, bankName: event.target.value }))} />
            </label>
            <label>
              <span>银行账号</span>
              <input value={invoiceForm.bankAccount} onChange={(event) => setInvoiceForm((current) => ({ ...current, bankAccount: event.target.value }))} />
            </label>
            <label className="invoice-form__wide">
              <span>备注</span>
              <textarea value={invoiceForm.remark} onChange={(event) => setInvoiceForm((current) => ({ ...current, remark: event.target.value }))} />
            </label>
            <button className="primary-action h-10" disabled={invoiceSaving || invoiceRequestableAmount <= 0} type="submit">
              {invoiceSaving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Receipt className="size-4" aria-hidden="true" />}
              保存并申请开票
            </button>
          </form>

          {invoice.applications.length > 0 ? (
            <CompactLedger
              emptyLabel="暂无开票申请"
              items={invoice.applications.slice(0, 6).map((item) => ({
                id: item.id,
                title: item.title,
                meta: `${invoiceStatusLabel(item.status)} · ${formatDateTime(item.createdAt)}`,
                amount: formatMoney(item.amountCents, "CNY")
              }))}
              title="最近申请"
            />
          ) : null}
        </section>
        ) : null}

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
          {billingEnabled ? (
          <div className="quota-panel__redeem">
            <Ticket className="size-4" aria-hidden="true" />
            <span>有兑换码可在上方“套餐与余额”中兑换，额度会立即计入这里。</span>
          </div>
          ) : null}
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

        {billingEnabled ? (
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
        ) : null}
      </section>
      {isInviteDialogOpen ? (
        <InviteCampaignDialog
          inviteCode={referral.inviteCode}
          inviteUrl={inviteUrl}
          inviteeRegisterCredits={inviteeRegisterCredits}
          invitedUserCount={referral.invitedUserCount}
          inviterRegisterCredits={inviterRegisterCredits}
          loading={referralLoading}
          planCashbackRate={planCashbackRate}
          rechargeCashbackRate={rechargeCashbackRate}
          inviteQrDataUrl={inviteQrDataUrl}
          error={referralError}
          notice={referralAction}
          onClose={closeInviteDialog}
          onCopy={() => void copyInviteUrl()}
          onDownload={() => void downloadInvitePoster()}
          onRefresh={() => void loadReferral()}
        />
      ) : null}
      {!user.phone && isPhoneDialogOpen ? (
        <PhoneVerificationDialog
          error={bindPhoneError}
          isBinding={isBindingPhone}
          isSendingCode={isSendingBindCode}
          notice={bindPhoneNotice}
          phone={bindPhone}
          smsCode={bindSmsCode}
          onPhoneChange={setBindPhone}
          onSendCode={sendBindCode}
          onSmsCodeChange={setBindSmsCode}
          onSubmit={submitBindPhone}
          onClose={() => setIsPhoneDialogOpen(false)}
        />
      ) : null}
    </main>
  );
}

export function AdminPage() {
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [stats, setStats] = useState<AdminStats>({});
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [plans, setPlans] = useState<AdminPlanRow[]>([]);
  const [jobs, setJobs] = useState<AdminJobRow[]>([]);
  const [assets, setAssets] = useState<AdminAssetRow[]>([]);
  const [galleryItems, setGalleryItems] = useState<GalleryImageItem[]>([]);
  const [demoCanvasExamples, setDemoCanvasExamples] = useState<DemoCanvasExampleForm[]>([]);
  const [billingSettings, setBillingSettings] = useState<BillingSettingsFormState>(createBillingSettingsForm());
  const [redemptionCodes, setRedemptionCodes] = useState<RedemptionCodeRow[]>([]);
  const [redemptionForm, setRedemptionForm] = useState<RedemptionCodeFormState>(createRedemptionCodeForm());
  const [storageSettings, setStorageSettings] = useState<StorageConfigFormState>(createStorageConfigForm());
  const [referralSettings, setReferralSettings] = useState<ReferralSettingsFormState>(createReferralSettingsForm());
  const [imageModels, setImageModels] = useState<ImageModelFormState[]>([]);
  const [categoryKitPlannerModels, setCategoryKitPlannerModels] = useState<CategoryKitPlannerModelFormState[]>([createCategoryKitPlannerForm("primary", 1)]);
  const [categoryStrategies, setCategoryStrategies] = useState<CategoryStrategyFormState[]>([]);
  const [categoryStrategyQuery, setCategoryStrategyQuery] = useState("");
  const [selectedCategoryStrategyId, setSelectedCategoryStrategyId] = useState("");
  const [seedanceVideoConfig, setSeedanceVideoConfig] = useState<SeedanceVideoConfigFormState>(createSeedanceVideoConfigForm());
  const [ecommerceGenerationConcurrency, setEcommerceGenerationConcurrency] = useState<EcommerceGenerationConcurrencyFormState>(
    createEcommerceGenerationConcurrencyForm()
  );
  const [extensionRelease, setExtensionRelease] = useState<ExtensionReleaseFormState>(createExtensionReleaseForm());
  const [appRelease, setAppRelease] = useState<AppReleaseFormState>(createAppReleaseForm());
  const [alipaySettings, setAlipaySettings] = useState<AlipayFormState>(createAlipayForm());
  const [wechatMiniAppSettings, setWechatMiniAppSettings] = useState<WechatMiniAppFormState>(createWechatMiniAppForm());
  const [smtpSettings, setSmtpSettings] = useState<SmtpFormState>(createSmtpForm());
  const [aliyunSmsSettings, setAliyunSmsSettings] = useState<AliyunSmsFormState>(createAliyunSmsForm());
  const [transactions, setTransactions] = useState<BillingTransactionRow[]>([]);
  const [referralTransactions, setReferralTransactions] = useState<BillingTransactionRow[]>([]);
  const [invoiceApplications, setInvoiceApplications] = useState<InvoiceRecord[]>([]);
  const [invoiceAdminSummary, setInvoiceAdminSummary] = useState<InvoiceSummaryState>(createInvoiceSummaryState());
  const [savingInvoiceId, setSavingInvoiceId] = useState("");
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
  const [savingGalleryOutputId, setSavingGalleryOutputId] = useState("");
  const [savingDemoCanvas, setSavingDemoCanvas] = useState(false);
  const [uploadingDemoCanvasField, setUploadingDemoCanvasField] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadAdminData({ preserveNotice = false, signal }: { preserveNotice?: boolean; signal?: AbortSignal } = {}): Promise<void> {
    setIsLoading(true);
    setError("");
    if (!preserveNotice) {
      setNotice("");
    }
    try {
      const [
        statsResponse,
        usersResponse,
        jobsResponse,
        assetsResponse,
        galleryResponse,
        demoCanvasResponse,
        plansResponse,
        billingResponse,
        redemptionCodesResponse,
        storageResponse,
        referralSettingsResponse,
        imageModelsResponse,
        categoryKitPlannerResponse,
        categoryStrategiesResponse,
        seedanceVideoResponse,
        ecommerceConcurrencyResponse,
        extensionReleaseResponse,
        appReleaseResponse,
        alipayResponse,
        wechatResponse,
        smtpResponse,
        smsResponse,
        transactionsResponse,
        referralTransactionsResponse,
        invoiceApplicationsResponse
      ] = await Promise.all([
        authFetch("/api/admin/stats"),
        authFetch("/api/admin/users"),
        authFetch("/api/admin/ecommerce/jobs"),
        authFetch("/api/admin/assets"),
        authFetch("/api/gallery"),
        authFetch("/api/admin/demo-canvas"),
        authFetch("/api/admin/plans"),
        authFetch("/api/admin/billing/settings"),
        authFetch("/api/admin/redemption-codes?limit=100"),
        authFetch("/api/admin/storage/config"),
        authFetch("/api/admin/referral/settings"),
        authFetch("/api/admin/image-models"),
        authFetch("/api/admin/ecommerce/category-kit-planner"),
        authFetch("/api/admin/ecommerce/category-strategies"),
        authFetch("/api/admin/video/seedance"),
        authFetch("/api/admin/image-generation/concurrency"),
        authFetch("/api/admin/extension-release"),
        authFetch("/api/admin/app-release"),
        authFetch("/api/admin/payment/alipay"),
        authFetch("/api/admin/auth/wechat/miniapp"),
        authFetch("/api/admin/email/smtp"),
        authFetch("/api/admin/sms/aliyun"),
        authFetch("/api/admin/billing/transactions?limit=50"),
        authFetch("/api/admin/referral/transactions?limit=100"),
        authFetch("/api/admin/billing/invoice/applications?limit=100")
      ]);

      const responses = [statsResponse, usersResponse, jobsResponse, assetsResponse, galleryResponse, demoCanvasResponse];
      const failedResponse = responses.find((response) => !response.ok);
      if (failedResponse) {
        throw new Error(await readApiError(failedResponse, "管理员数据加载失败。"));
      }

      const [statsBody, usersBody, jobsBody, assetsBody, galleryBody, demoCanvasBody] = await Promise.all(responses.map((response) => response.json()));
      if (signal?.aborted) {
        return;
      }

      setStats(parseAdminStats(statsBody));
      const parsedUsers = parseUsers(usersBody);
      const parsedPlans = plansResponse.ok ? parsePlans(await plansResponse.json()) : [];
      if (billingResponse.ok) {
        setBillingSettings(parseBillingSettingsForm(await billingResponse.json()));
      }
      if (redemptionCodesResponse.ok) {
        setRedemptionCodes(parseRedemptionCodes(await redemptionCodesResponse.json()));
      }
      if (storageResponse.ok) {
        setStorageSettings(parseStorageConfigForm(await storageResponse.json()));
      }
      if (referralSettingsResponse.ok) {
        setReferralSettings(parseReferralSettingsForm(await referralSettingsResponse.json()));
      }
      if (imageModelsResponse.ok) {
        const parsedModels = parseImageModelForms(await imageModelsResponse.json());
        setImageModels(parsedModels.length > 0 ? parsedModels : [createImageModelForm("gemini", 1)]);
      }
      if (categoryKitPlannerResponse.ok) {
        const parsedCategoryKitPlannerModels = parseCategoryKitPlannerForms(await categoryKitPlannerResponse.json());
        setCategoryKitPlannerModels(parsedCategoryKitPlannerModels);
      }
      if (categoryStrategiesResponse.ok) {
        const parsedStrategies = parseCategoryStrategyForms(await categoryStrategiesResponse.json());
        setCategoryStrategies(parsedStrategies);
        setSelectedCategoryStrategyId((current) =>
          current && parsedStrategies.some((strategy) => strategy.id === current) ? current : parsedStrategies[0]?.id ?? ""
        );
      }
      if (seedanceVideoResponse.ok) {
        setSeedanceVideoConfig(parseSeedanceVideoConfigForm(await seedanceVideoResponse.json()));
      }
      if (ecommerceConcurrencyResponse.ok) {
        setEcommerceGenerationConcurrency(parseEcommerceGenerationConcurrencyForm(await ecommerceConcurrencyResponse.json()));
      }
      if (extensionReleaseResponse.ok) {
        setExtensionRelease(parseExtensionReleaseForm(await extensionReleaseResponse.json()));
      }
      if (appReleaseResponse.ok) {
        setAppRelease(parseAppReleaseForm(await appReleaseResponse.json()));
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
      if (smsResponse.ok) {
        setAliyunSmsSettings(parseAliyunSmsForm(await smsResponse.json()));
      }
      if (transactionsResponse.ok) {
        setTransactions(parseBillingTransactions(await transactionsResponse.json()));
      }
      if (referralTransactionsResponse.ok) {
        setReferralTransactions(parseBillingTransactions(await referralTransactionsResponse.json()));
      }
      if (invoiceApplicationsResponse.ok) {
        const parsedInvoices = parseInvoiceApplications(await invoiceApplicationsResponse.json());
        setInvoiceApplications(parsedInvoices.applications);
        setInvoiceAdminSummary(parsedInvoices.summary);
      }
      setUsers(parsedUsers);
      setPlans(parsedPlans);
      setPlanDrafts(Object.fromEntries(parsedPlans.map((plan) => [plan.id, planToForm(plan)])));
      setUserDrafts(Object.fromEntries(parsedUsers.map((user) => [user.id, userToQuotaForm(user)])));
      setJobs(parseJobs(jobsBody));
      setAssets(parseAssets(assetsBody));
      setGalleryItems(parseGalleryItems(galleryBody));
      setDemoCanvasExamples(parseDemoCanvasExampleForms(demoCanvasBody));
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
  const filteredCategoryStrategies = useMemo(() => {
    const query = categoryStrategyQuery.trim().toLowerCase();
    if (!query) {
      return categoryStrategies;
    }
    return categoryStrategies.filter((strategy) =>
      [strategy.categoryPath, strategy.categoryName, strategy.platform, strategy.market, strategy.aliasesText]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [categoryStrategies, categoryStrategyQuery]);
  const selectedCategoryStrategy = categoryStrategies.find((strategy) => strategy.id === selectedCategoryStrategyId) ?? categoryStrategies[0];

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
          phone: newAdmin.phone,
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

  async function updateInvoiceStatus(application: InvoiceRecord, status: InvoiceStatus): Promise<void> {
    setSavingInvoiceId(application.id);
    setError("");
    setNotice("");
    try {
      const response = await authFetch(`/api/admin/billing/invoice/applications/${encodeURIComponent(application.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, "开票状态更新失败。"));
      }
      setNotice(status === "issued" ? "已标记为开票完成，并扣减可开票金额。" : status === "rejected" ? "已驳回申请，释放占用金额。" : "开票状态已更新。");
      await loadAdminData({ preserveNotice: true });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "开票状态更新失败。");
    } finally {
      setSavingInvoiceId("");
    }
  }

  async function saveGalleryPublicStatus(item: GalleryImageItem, enabled: boolean): Promise<void> {
    setSavingGalleryOutputId(item.outputId);
    setError("");
    setNotice("");
    try {
      const response = await authFetch(`/api/admin/gallery/${encodeURIComponent(item.outputId)}/public`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          sortOrder: item.publicGallerySortOrder ?? 0
        })
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, "公开案例设置保存失败。"));
      }

      const updatedItem = parseGalleryItemFromValue(firstRecord(await response.json(), "item"));
      setGalleryItems((current) =>
        current.map((galleryItem) =>
          galleryItem.outputId === item.outputId
            ? updatedItem ?? {
                ...galleryItem,
                publicGalleryEnabled: enabled,
                publicGalleryUpdatedAt: enabled ? new Date().toISOString() : undefined
              }
            : galleryItem
        )
      );
      setNotice(enabled ? "已加入游客公开案例库。" : "已取消游客公开展示。");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "公开案例设置保存失败。");
    } finally {
      setSavingGalleryOutputId("");
    }
  }

  async function saveDemoCanvasExamples(): Promise<void> {
    setSavingDemoCanvas(true);
    setError("");
    setNotice("");
    try {
      const response = await authFetch("/api/admin/demo-canvas", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(demoCanvasExamplesToPayload(demoCanvasExamples))
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, "画布案例保存失败。"));
      }
      setDemoCanvasExamples(parseDemoCanvasExampleForms(await response.json()));
      setNotice("游客画布案例已保存。");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "画布案例保存失败。");
    } finally {
      setSavingDemoCanvas(false);
    }
  }

  async function uploadDemoCanvasImage(exampleId: string, field: "beforeUrl" | "afterUrl", file: File): Promise<void> {
    const uploadKey = `${exampleId}:${field}`;
    setUploadingDemoCanvasField(uploadKey);
    setError("");
    setNotice("");
    try {
      const formData = new FormData();
      formData.append("file", file, file.name || "demo-canvas-image.png");
      const response = await authFetch("/api/admin/demo-canvas/assets", {
        method: "POST",
        body: formData
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, "游客画布图片上传失败。"));
      }
      const upload = (await response.json()) as DemoCanvasAssetUploadResponse;
      setDemoCanvasExamples((current) =>
        current.map((example) => (example.id === exampleId ? { ...example, [field]: upload.url } : example))
      );
      setNotice(`图片已上传到 ${upload.objectKey}。`);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "游客画布图片上传失败。");
    } finally {
      setUploadingDemoCanvasField("");
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

  async function generateRedemptionCodes(): Promise<void> {
    const payload = redemptionCodeFormToPayload(redemptionForm);
    if (!payload) {
      setError("请填写有效的兑换码生成规则。");
      return;
    }
    setSavingBilling("redemption-codes");
    setError("");
    setNotice("");
    try {
      const response = await authFetch("/api/admin/redemption-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, "兑换码生成失败。"));
      }
      const parsedCodes = parseRedemptionCodes(await response.json());
      setRedemptionCodes((current) => [...parsedCodes, ...current]);
      setNotice(`已生成 ${parsedCodes.length} 个兑换码。`);
      setRedemptionForm(createRedemptionCodeForm());
      await loadAdminData({ preserveNotice: true });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "兑换码生成失败。");
    } finally {
      setSavingBilling("");
    }
  }

  async function testStorageSettings(): Promise<void> {
    setSavingBilling("storage-test");
    setError("");
    setNotice("");
    try {
      const response = await authFetch("/api/admin/storage/config/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(storageSettingsToPayload(storageSettings, { forceEnabled: true }))
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, "云存储测试失败。"));
      }
      const result = (await response.json()) as StorageTestResult;
      if (!result.ok) {
        throw new Error(result.message || "云存储测试失败。");
      }
      setNotice(result.message || "云存储测试通过。");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "云存储测试失败。");
    } finally {
      setSavingBilling("");
    }
  }

  async function saveStorageSettings(): Promise<void> {
    setSavingBilling("storage");
    setError("");
    setNotice("");
    try {
      const response = await authFetch("/api/admin/storage/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(storageSettingsToPayload(storageSettings))
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, "云存储配置保存失败。"));
      }
      setStorageSettings(parseStorageConfigForm(await response.json()));
      setNotice(storageSettings.enabled ? "云存储配置已保存，所有用户将统一使用这套配置。" : "云存储已关闭。");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "云存储配置保存失败。");
    } finally {
      setSavingBilling("");
    }
  }

  async function saveReferralSettings(): Promise<void> {
    setSavingBilling("referral");
    setError("");
    setNotice("");
    try {
      const response = await authFetch("/api/admin/referral/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(referralSettingsToPayload(referralSettings))
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, "邀请激励设置保存失败。"));
      }
      setNotice("邀请激励设置已保存。");
      setReferralSettings(parseReferralSettingsForm(await response.json()));
      await loadAdminData({ preserveNotice: true });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "邀请激励设置保存失败。");
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

  async function saveCategoryKitPlanner(): Promise<void> {
    setSavingBilling("category-kit-planner");
    setError("");
    setNotice("");
    try {
      const response = await authFetch("/api/admin/ecommerce/category-kit-planner", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(categoryKitPlannerToPayload(categoryKitPlannerModels))
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, "品类套图文本模型配置保存失败。"));
      }
      setNotice("品类套图文本模型配置已保存，主模型失败时会自动尝试备用模型。");
      setCategoryKitPlannerModels(parseCategoryKitPlannerForms(await response.json()));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "品类套图文本模型配置保存失败。");
    } finally {
      setSavingBilling("");
    }
  }

  async function saveCategoryStrategy(strategy: CategoryStrategyFormState): Promise<void> {
    const isNewStrategy = strategy.id.startsWith("new-");
    setSavingBilling(`category-strategy:${strategy.id}`);
    setError("");
    setNotice("");
    try {
      const response = await authFetch(
        isNewStrategy
          ? "/api/admin/ecommerce/category-strategies"
          : `/api/admin/ecommerce/category-strategies/${encodeURIComponent(strategy.id)}`,
        {
          method: isNewStrategy ? "POST" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(categoryStrategyToPayload(strategy))
        }
      );
      if (!response.ok) {
        throw new Error(await readApiError(response, "类目策略保存失败。"));
      }
      const parsed = parseCategoryStrategyForms(await response.json());
      if (parsed.length > 0) {
        setCategoryStrategies((current) => {
          const withoutSaved = current.filter((item) => item.id !== strategy.id && !parsed.some((saved) => saved.id === item.id));
          return [...parsed, ...withoutSaved].sort((a, b) => Number(a.priority || 0) - Number(b.priority || 0));
        });
        setSelectedCategoryStrategyId(parsed[0].id);
      } else {
        await loadAdminData({ preserveNotice: true });
      }
      setNotice("类目策略已保存。");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "类目策略保存失败。");
    } finally {
      setSavingBilling("");
    }
  }

  async function deleteCategoryStrategy(strategy: CategoryStrategyFormState): Promise<void> {
    if (strategy.id.startsWith("new-")) {
      removeCategoryStrategyDraft(strategy.id);
      return;
    }
    setSavingBilling(`category-strategy-delete:${strategy.id}`);
    setError("");
    setNotice("");
    try {
      const response = await authFetch(`/api/admin/ecommerce/category-strategies/${encodeURIComponent(strategy.id)}`, {
        method: "DELETE"
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, "类目策略删除失败。"));
      }
      setCategoryStrategies((current) => current.filter((item) => item.id !== strategy.id));
      setSelectedCategoryStrategyId((current) => (current === strategy.id ? "" : current));
      setNotice("类目策略已删除。");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "类目策略删除失败。");
    } finally {
      setSavingBilling("");
    }
  }

  async function saveSeedanceVideoConfig(): Promise<void> {
    setSavingBilling("seedance-video");
    setError("");
    setNotice("");
    try {
      const response = await authFetch("/api/admin/video/seedance", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(seedanceVideoConfigToPayload(seedanceVideoConfig))
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, "Seedance 视频配置保存失败。"));
      }
      setSeedanceVideoConfig(parseSeedanceVideoConfigForm(await response.json()));
      setNotice("Seedance 视频配置已保存，后续生成会立即使用。");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Seedance 视频配置保存失败。");
    } finally {
      setSavingBilling("");
    }
  }

  async function saveEcommerceGenerationConcurrency(): Promise<void> {
    setSavingBilling("ecommerce-concurrency");
    setError("");
    setNotice("");
    try {
      const response = await authFetch("/api/admin/image-generation/concurrency", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ecommerceGenerationConcurrencyToPayload(ecommerceGenerationConcurrency))
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, "图片生成并发配置保存失败。"));
      }
      setNotice("图片生成并发配置已保存，满载时会自动排队，不会丢单。");
      setEcommerceGenerationConcurrency(parseEcommerceGenerationConcurrencyForm(await response.json()));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "图片生成并发配置保存失败。");
    } finally {
      setSavingBilling("");
    }
  }

  async function saveExtensionRelease(): Promise<void> {
    setSavingBilling("extension-release");
    setError("");
    setNotice("");
    try {
      const response = await authFetch("/api/admin/extension-release", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(extensionReleaseToPayload(extensionRelease))
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, "插件发布配置保存失败。"));
      }
      setNotice("插件发布配置已保存。");
      setExtensionRelease(parseExtensionReleaseForm(await response.json()));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "插件发布配置保存失败。");
    } finally {
      setSavingBilling("");
    }
  }

  async function saveAppRelease(): Promise<void> {
    setSavingBilling("app-release");
    setError("");
    setNotice("");
    try {
      const response = await authFetch("/api/admin/app-release", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(appReleaseToPayload(appRelease))
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, "App 版本配置保存失败。"));
      }
      setNotice("App 版本配置已保存。");
      setAppRelease(parseAppReleaseForm(await response.json()));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "App 版本配置保存失败。");
    } finally {
      setSavingBilling("");
    }
  }

  function updateExtensionReleaseTarget(target: keyof ExtensionReleaseFormState, patch: Partial<ExtensionReleaseTargetFormState>): void {
    setExtensionRelease((current) => ({
      ...current,
      [target]: {
        ...current[target],
        ...patch
      }
    }));
  }

  function updateAppReleaseTarget(target: keyof AppReleaseFormState, patch: Partial<AppReleaseTargetFormState>): void {
    setAppRelease((current) => ({
      ...current,
      [target]: {
        ...current[target],
        ...patch
      }
    }));
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

  function addCategoryKitPlannerModel(role: CategoryKitPlannerModelRole = "fallback"): void {
    setCategoryKitPlannerModels((models) => [...models, createCategoryKitPlannerForm(role, models.length + 1)]);
  }

  function addDeepSeekTextModel(): void {
    setCategoryKitPlannerModels((models) => [
      ...models,
      {
        ...createCategoryKitPlannerForm(models.some((model) => model.role === "primary") ? "fallback" : "primary", models.length + 1),
        ...categoryKitPlannerProviderPatch("deepseek"),
        modules: ["prompt-optimizer", "category-kit-planner"]
      }
    ]);
  }

  function updateCategoryKitPlannerModel(id: string, patch: Partial<CategoryKitPlannerModelFormState>): void {
    setCategoryKitPlannerModels((models) => models.map((model) => (model.id === id ? { ...model, ...patch } : model)));
  }

  function removeCategoryKitPlannerModel(id: string): void {
    setCategoryKitPlannerModels((models) => {
      const next = models.filter((model) => model.id !== id);
      if (next.length === 0) {
        return [createCategoryKitPlannerForm("primary", 1)];
      }
      if (!next.some((model) => model.role === "primary")) {
        next[0] = { ...next[0], role: "primary", name: "品类套图共享文本模型" };
      }
      return next.map((model, index) => ({
        ...model,
        priority: String(index + 1)
      }));
    });
  }

  function createCategoryStrategyDraft(): void {
    const draft = createCategoryStrategyForm(categoryStrategies.length);
    setCategoryStrategies((current) => [draft, ...current]);
    setSelectedCategoryStrategyId(draft.id);
    setActiveTab("categoryStrategies");
  }

  function updateCategoryStrategy(id: string, patch: Partial<CategoryStrategyFormState>): void {
    setCategoryStrategies((strategies) => strategies.map((strategy) => (strategy.id === id ? { ...strategy, ...patch } : strategy)));
  }

  function removeCategoryStrategyDraft(id: string): void {
    setCategoryStrategies((strategies) => strategies.filter((strategy) => strategy.id !== id));
    setSelectedCategoryStrategyId((current) => (current === id ? "" : current));
  }

  function updateEcommerceGenerationConcurrency(patch: Partial<EcommerceGenerationConcurrencyFormState>): void {
    setEcommerceGenerationConcurrency((current) => ({
      ...current,
      ...patch
    }));
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
          taskCompleteTemplateId: wechatMiniAppSettings.taskCompleteTemplateId,
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

  async function saveAliyunSmsSettings(): Promise<void> {
    setSavingBilling("aliyun-sms");
    setError("");
    setNotice("");
    try {
      const response = await authFetch("/api/admin/sms/aliyun", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: aliyunSmsSettings.enabled,
          accessKeyId: aliyunSmsSettings.accessKeyId,
          accessKeySecret: aliyunSmsSettings.accessKeySecret,
          preserveAccessKeySecret: !aliyunSmsSettings.accessKeySecret.trim() && aliyunSmsSettings.accessKeySecretSaved,
          endpoint: aliyunSmsSettings.endpoint,
          signName: aliyunSmsSettings.signName,
          registerTemplateCode: aliyunSmsSettings.registerTemplateCode,
          bindTemplateCode: aliyunSmsSettings.bindTemplateCode
        })
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, "阿里云短信配置保存失败。"));
      }
      setNotice("阿里云短信配置已保存。");
      await loadAdminData({ preserveNotice: true });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "阿里云短信配置保存失败。");
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

        <div className="admin-tabs" role="tablist" aria-label="后台功能">
          {adminTabs.map((tab) => (
            <button
              aria-selected={activeTab === tab.id}
              className="admin-tab"
              data-active={activeTab === tab.id}
              key={tab.id}
              role="tab"
              type="button"
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "models" ? (
          <>
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
        <section className="admin-table-card admin-billing-card" aria-labelledby="category-kit-planner-title">
          <div className="admin-table-card__title">
            <Sparkles className="size-4" aria-hidden="true" />
            <h2 id="category-kit-planner-title">品类套图文本模型</h2>
          </div>
          <p className="admin-panel-note">这里配置服务端共用的文本模型。可按提示词优化、品类套图规划、类目识别分别勾选模型；DeepSeek 适合纯文本提示词优化，涉及参考图识别的模块建议保留一个支持视觉输入的 OpenAI/GPT 备用模型。</p>
          <div className="admin-model-list">
            {categoryKitPlannerModels.map((model, index) => (
              <div className="admin-form-panel admin-model-panel" key={model.id}>
                <div className="admin-form-panel__title-row">
                  <div>
                    <p className="settings-eyebrow">{model.role === "primary" ? "Primary" : "Fallback"}</p>
                    <h3>{model.name || `文本模型 ${index + 1}`}</h3>
                  </div>
                  <label className="admin-switch">
                    <input checked={model.enabled} type="checkbox" onChange={(event) => updateCategoryKitPlannerModel(model.id, { enabled: event.target.checked })} />
                    <span>{model.enabled ? "启用" : "关闭"}</span>
                  </label>
                </div>
                <div className="admin-form-grid admin-form-grid--model">
                  <label><span>名称</span><input className="admin-input" value={model.name} onChange={(event) => updateCategoryKitPlannerModel(model.id, { name: event.target.value })} /></label>
                  <label>
                    <span>接口模式</span>
                    <select
                      className="admin-input"
                      value={model.provider}
                      onChange={(event) => updateCategoryKitPlannerModel(model.id, categoryKitPlannerProviderPatch(event.target.value as CategoryKitPlannerProvider))}
                    >
                      <option value="openai-responses">OpenAI Responses</option>
                      <option value="openai-compatible-chat">OpenAI 兼容 Chat</option>
                      <option value="deepseek">DeepSeek Chat</option>
                    </select>
                  </label>
                  <label>
                    <span>角色</span>
                    <select className="admin-input" value={model.role} onChange={(event) => updateCategoryKitPlannerModel(model.id, { role: event.target.value as CategoryKitPlannerModelRole })}>
                      <option value="primary">主模型</option>
                      <option value="fallback">备用模型</option>
                    </select>
                  </label>
                  <label><span>优先级</span><input className="admin-input" inputMode="numeric" value={model.priority} onChange={(event) => updateCategoryKitPlannerModel(model.id, { priority: event.target.value })} /></label>
                  <label><span>Base URL</span><input className="admin-input" value={model.baseUrl} onChange={(event) => updateCategoryKitPlannerModel(model.id, { baseUrl: event.target.value })} placeholder={defaultCategoryKitPlannerBaseUrl(model.provider)} /></label>
                  <label><span>模型 ID</span><input className="admin-input" value={model.model} onChange={(event) => updateCategoryKitPlannerModel(model.id, { model: event.target.value })} /></label>
                  <label><span>超时秒数</span><input className="admin-input" inputMode="numeric" value={model.timeoutSeconds} onChange={(event) => updateCategoryKitPlannerModel(model.id, { timeoutSeconds: event.target.value })} /></label>
                  <fieldset className="admin-input-group" style={{ gridColumn: "1 / -1" }}>
                    <legend>使用模块</legend>
                    <div className="admin-check-grid">
                      {textModelModuleOptions.map((option) => (
                        <label className="admin-inline-check" key={option.id}>
                          <input
                            checked={model.modules.includes(option.id)}
                            type="checkbox"
                            onChange={(event) =>
                              updateCategoryKitPlannerModel(model.id, {
                                modules: toggleCategoryKitPlannerModule(model.modules, option.id, event.target.checked)
                              })
                            }
                          />
                          <span>{option.label}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <label style={{ gridColumn: "1 / -1" }}>
                    <span>API Key {model.apiKeySaved ? "（已保存，留空不覆盖）" : ""}</span>
                    <input className="admin-input" type="password" value={model.apiKey} onChange={(event) => updateCategoryKitPlannerModel(model.id, { apiKey: event.target.value })} />
                  </label>
                </div>
                <button className="secondary-action h-10" type="button" onClick={() => removeCategoryKitPlannerModel(model.id)}>
                  移除模型
                </button>
              </div>
            ))}
          </div>
          <div className="admin-model-actions">
            <button className="secondary-action h-10" type="button" onClick={() => addCategoryKitPlannerModel("fallback")}>
              <Plus className="size-4" aria-hidden="true" />
              添加备用模型
            </button>
            <button className="secondary-action h-10" type="button" onClick={addDeepSeekTextModel}>
              <Plus className="size-4" aria-hidden="true" />
              添加 DeepSeek
            </button>
            <button className="primary-action h-10" disabled={savingBilling === "category-kit-planner"} type="button" onClick={() => void saveCategoryKitPlanner()}>
              {savingBilling === "category-kit-planner" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}
              保存共享文本模型
            </button>
          </div>
        </section>
        <section className="admin-table-card admin-billing-card" aria-labelledby="seedance-video-config-title">
          <div className="admin-table-card__title">
            <Video className="size-4" aria-hidden="true" />
            <h2 id="seedance-video-config-title">Seedance 视频生成</h2>
          </div>
          <p className="admin-panel-note">这里保存火山方舟 Seedance 的服务端密钥。保存后新的视频生成请求会直接读取最新配置，无需重启 API。</p>
          <div className="admin-form-panel">
            <div className="admin-form-panel__title-row">
              <div>
                <p className="settings-eyebrow">Video Model</p>
                <h3>{seedanceVideoConfig.model || DEFAULT_SEEDANCE_MODEL}</h3>
              </div>
              <span className="loading-pill">{seedanceConfigSourceLabel(seedanceVideoConfig.source)}</span>
            </div>
            <div className="admin-form-grid admin-form-grid--model">
              <label>
                <span>模型 ID</span>
                <input
                  className="admin-input"
                  value={seedanceVideoConfig.model}
                  onChange={(event) => setSeedanceVideoConfig({ ...seedanceVideoConfig, model: event.target.value })}
                />
              </label>
              <label>
                <span>Base URL</span>
                <input
                  className="admin-input"
                  value={seedanceVideoConfig.baseUrl}
                  onChange={(event) => setSeedanceVideoConfig({ ...seedanceVideoConfig, baseUrl: event.target.value })}
                  placeholder={DEFAULT_ARK_BASE_URL}
                />
              </label>
              <label style={{ gridColumn: "1 / -1" }}>
                <span>ARK API Key {seedanceVideoConfig.apiKeySaved ? "（已保存，留空不覆盖）" : ""}</span>
                <input
                  className="admin-input"
                  type="password"
                  value={seedanceVideoConfig.apiKey}
                  onChange={(event) => setSeedanceVideoConfig({ ...seedanceVideoConfig, apiKey: event.target.value, apiKeySaved: false })}
                />
              </label>
            </div>
            <div className="admin-model-actions">
              <button className="primary-action h-10" disabled={savingBilling === "seedance-video"} type="button" onClick={() => void saveSeedanceVideoConfig()}>
                {savingBilling === "seedance-video" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}
                保存视频配置
              </button>
            </div>
          </div>
        </section>
        <section className="admin-table-card admin-billing-card" aria-labelledby="ecommerce-concurrency-title">
          <div className="admin-table-card__title">
            <Clock className="size-4" aria-hidden="true" />
            <h2 id="ecommerce-concurrency-title">图片生成并发队列</h2>
          </div>
          <div className="admin-form-panel">
            <div className="admin-form-panel__title-row">
              <div>
                <p className="settings-eyebrow">Queue Control</p>
                <h3>所有生图任务统一排队</h3>
              </div>
            </div>
            <p className="admin-panel-note">全局并发控制整个系统同时跑的图片线程数，单任务并发控制单个生图任务同时跑的图片张数。达到上限后会自动排队等待，不会直接丢任务。</p>
            <div className="admin-form-grid admin-form-grid--two">
              <label>
                <span>全局并发线程</span>
                <input
                  className="admin-input"
                  inputMode="numeric"
                  value={ecommerceGenerationConcurrency.globalConcurrency}
                  onChange={(event) => updateEcommerceGenerationConcurrency({ globalConcurrency: event.target.value })}
                />
              </label>
              <label>
                <span>单任务并发线程</span>
                <input
                  className="admin-input"
                  inputMode="numeric"
                  value={ecommerceGenerationConcurrency.jobConcurrency}
                  onChange={(event) => updateEcommerceGenerationConcurrency({ jobConcurrency: event.target.value })}
                />
              </label>
            </div>
            <div className="admin-model-actions">
              <button
                className="primary-action h-10"
                disabled={savingBilling === "ecommerce-concurrency"}
                type="button"
                onClick={() => void saveEcommerceGenerationConcurrency()}
              >
                {savingBilling === "ecommerce-concurrency" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}
                保存队列配置
              </button>
            </div>
          </div>
        </section>
          </>
        ) : null}

        {activeTab === "categoryStrategies" ? (
          <section className="admin-table-card admin-billing-card" aria-labelledby="category-strategies-title">
            <div className="admin-table-card__title">
              <Database className="size-4" aria-hidden="true" />
              <h2 id="category-strategies-title">类目策略库</h2>
            </div>
            <div className="admin-category-strategy-toolbar">
              <label>
                <span>查询</span>
                <input
                  className="admin-input"
                  placeholder="类目、别名、平台或市场"
                  value={categoryStrategyQuery}
                  onChange={(event) => setCategoryStrategyQuery(event.target.value)}
                />
              </label>
              <button className="secondary-action h-10" type="button" onClick={createCategoryStrategyDraft}>
                <Plus className="size-4" aria-hidden="true" />
                新建策略
              </button>
            </div>
            <div className="admin-category-strategy-layout">
              <div className="admin-category-strategy-list" aria-label="类目策略列表">
                {filteredCategoryStrategies.length > 0 ? (
                  filteredCategoryStrategies.map((strategy) => (
                    <button
                      className="admin-category-strategy-item"
                      data-active={selectedCategoryStrategy?.id === strategy.id}
                      key={strategy.id}
                      type="button"
                      onClick={() => setSelectedCategoryStrategyId(strategy.id)}
                    >
                      <strong>{strategy.categoryPath || strategy.categoryName || "未命名类目"}</strong>
                      <span>{strategy.platform || "all"} / {strategy.market || "global"}</span>
                      <small>{strategy.enabled ? "启用" : "关闭"} · P{strategy.priority || "0"}</small>
                    </button>
                  ))
                ) : (
                  <div className="admin-empty-state">暂无匹配策略</div>
                )}
              </div>

              {selectedCategoryStrategy ? (
                <div className="admin-form-panel admin-category-strategy-editor">
                  <div className="admin-form-panel__title-row">
                    <div>
                      <p className="settings-eyebrow">Category Strategy</p>
                      <h3>{selectedCategoryStrategy.categoryPath || selectedCategoryStrategy.categoryName || "新类目策略"}</h3>
                    </div>
                    <label className="admin-switch">
                      <input
                        checked={selectedCategoryStrategy.enabled}
                        type="checkbox"
                        onChange={(event) => updateCategoryStrategy(selectedCategoryStrategy.id, { enabled: event.target.checked })}
                      />
                      <span>{selectedCategoryStrategy.enabled ? "启用" : "关闭"}</span>
                    </label>
                  </div>
                  <div className="admin-form-grid admin-form-grid--model">
                    <label>
                      <span>标准类目路径</span>
                      <input
                        className="admin-input"
                        placeholder="服饰 > 女装 > 连衣裙"
                        value={selectedCategoryStrategy.categoryPath}
                        onChange={(event) => updateCategoryStrategy(selectedCategoryStrategy.id, { categoryPath: event.target.value })}
                      />
                    </label>
                    <label>
                      <span>类目名称</span>
                      <input
                        className="admin-input"
                        placeholder="连衣裙"
                        value={selectedCategoryStrategy.categoryName}
                        onChange={(event) => updateCategoryStrategy(selectedCategoryStrategy.id, { categoryName: event.target.value })}
                      />
                    </label>
                    <label>
                      <span>平台</span>
                      <input
                        className="admin-input"
                        placeholder="amazon / taobao / all"
                        value={selectedCategoryStrategy.platform}
                        onChange={(event) => updateCategoryStrategy(selectedCategoryStrategy.id, { platform: event.target.value })}
                      />
                    </label>
                    <label>
                      <span>市场</span>
                      <input
                        className="admin-input"
                        placeholder="us / cn / global"
                        value={selectedCategoryStrategy.market}
                        onChange={(event) => updateCategoryStrategy(selectedCategoryStrategy.id, { market: event.target.value })}
                      />
                    </label>
                    <label>
                      <span>优先级</span>
                      <input
                        className="admin-input"
                        inputMode="numeric"
                        value={selectedCategoryStrategy.priority}
                        onChange={(event) => updateCategoryStrategy(selectedCategoryStrategy.id, { priority: event.target.value })}
                      />
                    </label>
                    <label>
                      <span>别名</span>
                      <input
                        className="admin-input"
                        placeholder="一行一个，逗号也可"
                        value={selectedCategoryStrategy.aliasesText}
                        onChange={(event) => updateCategoryStrategy(selectedCategoryStrategy.id, { aliasesText: event.target.value })}
                      />
                    </label>
                    <label style={{ gridColumn: "1 / -1" }}>
                      <span>必需素材角色</span>
                      <textarea
                        className="admin-input admin-textarea"
                        placeholder="main&#10;detail&#10;package"
                        value={selectedCategoryStrategy.requiredAssetsText}
                        onChange={(event) => updateCategoryStrategy(selectedCategoryStrategy.id, { requiredAssetsText: event.target.value })}
                      />
                    </label>
                    <label style={{ gridColumn: "1 / -1" }}>
                      <span>缺失检查项</span>
                      <textarea
                        className="admin-input admin-textarea"
                        placeholder="尺寸图&#10;包装图&#10;材质细节"
                        value={selectedCategoryStrategy.missingChecklistText}
                        onChange={(event) => updateCategoryStrategy(selectedCategoryStrategy.id, { missingChecklistText: event.target.value })}
                      />
                    </label>
                    <label style={{ gridColumn: "1 / -1" }}>
                      <span>策略内容 JSON / 多行文本</span>
                      <textarea
                        className="admin-input admin-textarea admin-textarea--tall"
                        value={selectedCategoryStrategy.strategyText}
                        onChange={(event) => updateCategoryStrategy(selectedCategoryStrategy.id, { strategyText: event.target.value })}
                      />
                    </label>
                    <label style={{ gridColumn: "1 / -1" }}>
                      <span>备注</span>
                      <textarea
                        className="admin-input admin-textarea"
                        value={selectedCategoryStrategy.notes}
                        onChange={(event) => updateCategoryStrategy(selectedCategoryStrategy.id, { notes: event.target.value })}
                      />
                    </label>
                  </div>
                  <div className="admin-model-actions">
                    <button
                      className="secondary-action h-10"
                      disabled={savingBilling === `category-strategy-delete:${selectedCategoryStrategy.id}`}
                      type="button"
                      onClick={() => void deleteCategoryStrategy(selectedCategoryStrategy)}
                    >
                      {savingBilling === `category-strategy-delete:${selectedCategoryStrategy.id}` ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <X className="size-4" aria-hidden="true" />}
                      删除
                    </button>
                    <button
                      className="primary-action h-10"
                      disabled={savingBilling === `category-strategy:${selectedCategoryStrategy.id}`}
                      type="button"
                      onClick={() => void saveCategoryStrategy(selectedCategoryStrategy)}
                    >
                      {savingBilling === `category-strategy:${selectedCategoryStrategy.id}` ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}
                      保存策略
                    </button>
                  </div>
                </div>
              ) : (
                <div className="admin-empty-state admin-empty-state--panel">选择或新建一个类目策略</div>
              )}
            </div>
          </section>
        ) : null}

        {activeTab === "storage" ? (
        <section className="admin-table-card admin-billing-card" aria-labelledby="storage-config-title">
          <div className="admin-table-card__title">
            <HardDrive className="size-4" aria-hidden="true" />
            <h2 id="storage-config-title">统一云存储配置</h2>
          </div>
          <div className="admin-form-panel">
            <div className="admin-form-panel__title-row">
              <div>
                <p className="settings-eyebrow">Global Storage</p>
                <h3>所有用户共用同一套 OSS / COS</h3>
              </div>
              <label className="admin-switch">
                <input
                  checked={storageSettings.enabled}
                  type="checkbox"
                  onChange={(event) => setStorageSettings({ ...storageSettings, enabled: event.target.checked })}
                />
                <span>{storageSettings.enabled ? "启用" : "关闭"}</span>
              </label>
            </div>
            <p className="admin-panel-note">开启后，新生成图片会优先上传到这里配置的云存储。上传成功后不保留本地原图或预览缓存；上传失败才回落本地副本。</p>
            <div className="admin-form-grid admin-form-grid--two">
              <label>
                <span>存储服务</span>
                <select
                  className="admin-input"
                  value={storageSettings.provider}
                  onChange={(event) => {
                    const provider = event.target.value === "cos" ? "cos" : "oss";
                    const defaults = createStorageConfigForm(provider);
                    setStorageSettings({ ...defaults, enabled: storageSettings.enabled });
                  }}
                >
                  <option value="oss">阿里云 OSS</option>
                  <option value="cos">腾讯云 COS</option>
                </select>
              </label>
              <label><span>{storageSettings.provider === "oss" ? "AccessKey ID" : "SecretId"}</span><input className="admin-input" value={storageSettings.secretId} onChange={(event) => setStorageSettings({ ...storageSettings, secretId: event.target.value })} /></label>
              <label>
                <span>{storageSettings.provider === "oss" ? "AccessKey Secret" : "SecretKey"} {storageSettings.secretSaved ? "（已保存，留空不覆盖）" : ""}</span>
                <input className="admin-input" type="password" value={storageSettings.secretKey} onChange={(event) => setStorageSettings({ ...storageSettings, secretKey: event.target.value, secretSaved: false })} />
              </label>
              <label><span>Bucket</span><input className="admin-input" value={storageSettings.bucket} onChange={(event) => setStorageSettings({ ...storageSettings, bucket: event.target.value })} /></label>
              <label><span>Region</span><input className="admin-input" value={storageSettings.region} onChange={(event) => setStorageSettings({ ...storageSettings, region: event.target.value })} /></label>
              <label><span>Key Prefix</span><input className="admin-input" value={storageSettings.keyPrefix} onChange={(event) => setStorageSettings({ ...storageSettings, keyPrefix: event.target.value })} /></label>
            </div>
            <div className="admin-model-actions">
              <button className="secondary-action h-10" disabled={savingBilling === "storage-test" || savingBilling === "storage"} type="button" onClick={() => void testStorageSettings()}>
                {savingBilling === "storage-test" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <HardDrive className="size-4" aria-hidden="true" />}
                测试连接
              </button>
              <button className="primary-action h-10" disabled={savingBilling === "storage" || savingBilling === "storage-test"} type="button" onClick={() => void saveStorageSettings()}>
                {savingBilling === "storage" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}
                保存云存储
              </button>
            </div>
          </div>
        </section>
        ) : null}

        {activeTab === "billing" ? (
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
                  <p className="settings-eyebrow">SMS</p>
                  <h3>阿里云短信验证码</h3>
                </div>
                <label className="admin-switch">
                  <input
                    checked={aliyunSmsSettings.enabled}
                    type="checkbox"
                    onChange={(event) => setAliyunSmsSettings({ ...aliyunSmsSettings, enabled: event.target.checked })}
                  />
                  <span>{aliyunSmsSettings.enabled ? "启用" : "关闭"}</span>
                </label>
              </div>
              <div className="admin-form-grid admin-form-grid--two">
                <label><span>AccessKey ID</span><input className="admin-input" value={aliyunSmsSettings.accessKeyId} onChange={(event) => setAliyunSmsSettings({ ...aliyunSmsSettings, accessKeyId: event.target.value })} /></label>
                <label><span>Endpoint</span><input className="admin-input" value={aliyunSmsSettings.endpoint} onChange={(event) => setAliyunSmsSettings({ ...aliyunSmsSettings, endpoint: event.target.value })} /></label>
                <label><span>短信签名</span><input className="admin-input" value={aliyunSmsSettings.signName} onChange={(event) => setAliyunSmsSettings({ ...aliyunSmsSettings, signName: event.target.value })} /></label>
                <label><span>注册模板 Code</span><input className="admin-input" value={aliyunSmsSettings.registerTemplateCode} onChange={(event) => setAliyunSmsSettings({ ...aliyunSmsSettings, registerTemplateCode: event.target.value })} /></label>
                <label><span>补绑模板 Code</span><input className="admin-input" value={aliyunSmsSettings.bindTemplateCode} onChange={(event) => setAliyunSmsSettings({ ...aliyunSmsSettings, bindTemplateCode: event.target.value })} /></label>
              </div>
              <label>
                <span>AccessKey Secret {aliyunSmsSettings.accessKeySecretSaved ? "（已保存，留空不覆盖）" : ""}</span>
                <input className="admin-input" type="password" value={aliyunSmsSettings.accessKeySecret} onChange={(event) => setAliyunSmsSettings({ ...aliyunSmsSettings, accessKeySecret: event.target.value })} />
              </label>
              <button className="secondary-action h-10" disabled={savingBilling === "aliyun-sms"} type="button" onClick={() => void saveAliyunSmsSettings()}>
                {savingBilling === "aliyun-sms" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Phone className="size-4" aria-hidden="true" />}
                保存短信
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
        ) : null}

        {activeTab === "redemption" ? (
          <section className="admin-table-card admin-billing-card" aria-labelledby="redemption-code-title">
            <div className="admin-table-card__title">
              <Ticket className="size-4" aria-hidden="true" />
              <h2 id="redemption-code-title">兑换码管理</h2>
            </div>
            <div className="admin-form-panel">
              <div className="admin-form-panel__title-row">
                <div>
                  <p className="settings-eyebrow">Batch Generate</p>
                  <h3>批量生成额度兑换码</h3>
                </div>
              </div>
              <div className="admin-form-grid admin-form-grid--six">
                <label><span>生成数量</span><input className="admin-input" inputMode="numeric" value={redemptionForm.count} onChange={(event) => setRedemptionForm({ ...redemptionForm, count: event.target.value })} /></label>
                <label><span>总可兑换次数</span><input className="admin-input" inputMode="numeric" value={redemptionForm.maxRedemptions} onChange={(event) => setRedemptionForm({ ...redemptionForm, maxRedemptions: event.target.value })} /></label>
                <label><span>兑换额度</span><input className="admin-input" inputMode="numeric" value={redemptionForm.quota} onChange={(event) => setRedemptionForm({ ...redemptionForm, quota: event.target.value })} /></label>
                <label><span>兑换后有效天数</span><input className="admin-input" inputMode="numeric" value={redemptionForm.validDays} onChange={(event) => setRedemptionForm({ ...redemptionForm, validDays: event.target.value })} /></label>
                <label><span>前缀</span><input className="admin-input" placeholder="可选，如 MAY" value={redemptionForm.codePrefix} onChange={(event) => setRedemptionForm({ ...redemptionForm, codePrefix: event.target.value.toUpperCase() })} /></label>
                <button className="primary-action h-10" disabled={savingBilling === "redemption-codes"} type="button" onClick={() => void generateRedemptionCodes()}>
                  {savingBilling === "redemption-codes" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Plus className="size-4" aria-hidden="true" />}
                  生成
                </button>
              </div>
              <label>
                <span>指定兑换码</span>
                <textarea className="admin-textarea redemption-code-input" placeholder={"888888\n666666"} value={redemptionForm.customCodes} onChange={(event) => setRedemptionForm({ ...redemptionForm, customCodes: event.target.value.toUpperCase() })} />
              </label>
              <label>
                <span>备注</span>
                <input className="admin-input" placeholder="活动、渠道或发放对象" value={redemptionForm.note} onChange={(event) => setRedemptionForm({ ...redemptionForm, note: event.target.value })} />
              </label>
            </div>
            <div className="admin-table-wrap">
              <table className="admin-table redemption-code-table">
                <thead>
                  <tr>
                    <th>兑换码</th>
                    <th>额度</th>
                    <th>使用人数 / 总次数</th>
                    <th>有效天数</th>
                    <th>状态</th>
                    <th>备注</th>
                    <th>创建时间</th>
                  </tr>
                </thead>
                <tbody>
                  {redemptionCodes.length > 0 ? (
                    redemptionCodes.map((code) => (
                      <tr key={code.id}>
                        <td><code className="redemption-code-text">{code.code}</code></td>
                        <td>{code.quota.toLocaleString("zh-CN")} 张</td>
                        <td>{code.redeemedUserCount.toLocaleString("zh-CN")} / {code.maxRedemptions.toLocaleString("zh-CN")}</td>
                        <td>{code.validDays.toLocaleString("zh-CN")} 天</td>
                        <td>{code.status === "active" ? "启用" : "停用"}</td>
                        <td>{code.note || "-"}</td>
                        <td>{formatDateTime(code.createdAt)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7}>暂无兑换码</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {activeTab === "extension" ? (
        <section className="admin-table-card admin-billing-card" aria-labelledby="extension-release-title">
          <div className="admin-table-card__title">
            <Package className="size-4" aria-hidden="true" />
            <h2 id="extension-release-title">插件发布配置</h2>
          </div>
          <div className="admin-billing-grid">
            {(["dev", "prod"] as const).map((target) => {
              const form = extensionRelease[target];
              return (
                <div className="admin-form-panel" key={target}>
                  <div>
                    <p className="settings-eyebrow">{target === "dev" ? "Dev" : "Prod"}</p>
                    <h3>{target === "dev" ? "开发版插件" : "生产版插件"}</h3>
                  </div>
                  <div className="admin-form-grid admin-form-grid--two">
                    <label><span>API 地址</span><input className="admin-input" value={form.apiBaseUrl} onChange={(event) => updateExtensionReleaseTarget(target, { apiBaseUrl: event.target.value })} /></label>
                    <label><span>版本号</span><input className="admin-input" value={form.version} onChange={(event) => updateExtensionReleaseTarget(target, { version: event.target.value })} /></label>
                    <label><span>下载地址</span><input className="admin-input" value={form.downloadUrl} onChange={(event) => updateExtensionReleaseTarget(target, { downloadUrl: event.target.value })} /></label>
                    <label><span>Latest 下载地址</span><input className="admin-input" value={form.latestDownloadUrl} onChange={(event) => updateExtensionReleaseTarget(target, { latestDownloadUrl: event.target.value })} /></label>
                    <label><span>安装帮助 URL</span><input className="admin-input" value={form.installHelpUrl} onChange={(event) => updateExtensionReleaseTarget(target, { installHelpUrl: event.target.value })} /></label>
                    <label><span>文件名</span><input className="admin-input" value={form.fileName} onChange={(event) => updateExtensionReleaseTarget(target, { fileName: event.target.value })} /></label>
                    <label><span>文件大小 Bytes</span><input className="admin-input" inputMode="numeric" value={form.sizeBytes} onChange={(event) => updateExtensionReleaseTarget(target, { sizeBytes: event.target.value })} /></label>
                    <label><span>SHA256</span><input className="admin-input" value={form.sha256} onChange={(event) => updateExtensionReleaseTarget(target, { sha256: event.target.value })} /></label>
                  </div>
                  <label>
                    <span>发布说明</span>
                    <textarea className="admin-textarea" rows={4} value={form.releaseNotesText} onChange={(event) => updateExtensionReleaseTarget(target, { releaseNotesText: event.target.value })} />
                  </label>
                </div>
              );
            })}
          </div>
          <div className="admin-model-actions">
            <button className="primary-action h-10" disabled={savingBilling === "extension-release"} type="button" onClick={() => void saveExtensionRelease()}>
              {savingBilling === "extension-release" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}
              保存插件发布配置
            </button>
          </div>
        </section>
        ) : null}

        {activeTab === "appRelease" ? (
        <section className="admin-table-card admin-billing-card" aria-labelledby="app-release-title">
          <div className="admin-table-card__title">
            <Phone className="size-4" aria-hidden="true" />
            <h2 id="app-release-title">App 版本管理</h2>
          </div>
          <p className="admin-panel-note">这里配置移动端启动时读取的版本信息。客户端当前版本低于这里的版本号时，会弹出更新提示并引导用户打开下载地址。</p>
          <div className="admin-billing-grid">
            {(["ios", "android"] as const).map((target) => {
              const form = appRelease[target];
              return (
                <div className="admin-form-panel" key={target}>
                  <div className="admin-form-panel__title-row">
                    <div>
                      <p className="settings-eyebrow">{target === "ios" ? "iOS" : "Android"}</p>
                      <h3>{target === "ios" ? "iOS 版本" : "Android 版本"}</h3>
                    </div>
                    <label className="admin-switch">
                      <input checked={form.enabled} type="checkbox" onChange={(event) => updateAppReleaseTarget(target, { enabled: event.target.checked })} />
                      <span>{form.enabled ? "启用提示" : "关闭提示"}</span>
                    </label>
                  </div>
                  <div className="admin-form-grid admin-form-grid--two">
                    <label><span>版本号</span><input className="admin-input" placeholder="例如 1.1.0" value={form.version} onChange={(event) => updateAppReleaseTarget(target, { version: event.target.value })} /></label>
                    <label><span>构建号</span><input className="admin-input" placeholder={target === "android" ? "例如 12" : "例如 1"} value={form.buildNumber} onChange={(event) => updateAppReleaseTarget(target, { buildNumber: event.target.value })} /></label>
                    <label className="admin-form-grid__wide"><span>下载地址</span><input className="admin-input" placeholder={target === "ios" ? "App Store 或 TestFlight 地址" : "Android APK 下载地址"} value={form.downloadUrl} onChange={(event) => updateAppReleaseTarget(target, { downloadUrl: event.target.value })} /></label>
                    <label className="admin-switch admin-switch--inline">
                      <input checked={form.forceUpdate} type="checkbox" onChange={(event) => updateAppReleaseTarget(target, { forceUpdate: event.target.checked })} />
                      <span>强制更新</span>
                    </label>
                  </div>
                  <label>
                    <span>更新详情</span>
                    <textarea className="admin-textarea" rows={5} value={form.releaseNotesText} onChange={(event) => updateAppReleaseTarget(target, { releaseNotesText: event.target.value })} />
                  </label>
                </div>
              );
            })}
          </div>
          <div className="admin-model-actions">
            <button className="primary-action h-10" disabled={savingBilling === "app-release"} type="button" onClick={() => void saveAppRelease()}>
              {savingBilling === "app-release" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}
              保存 App 版本配置
            </button>
          </div>
        </section>
        ) : null}

        {activeTab === "auth" ? (
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
                <label>
                  <span>任务完成订阅模板 ID</span>
                  <input
                    className="admin-input"
                    value={wechatMiniAppSettings.taskCompleteTemplateId}
                    placeholder="用于任务完成提醒"
                    onChange={(event) => setWechatMiniAppSettings({ ...wechatMiniAppSettings, taskCompleteTemplateId: event.target.value })}
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
        ) : null}

        {activeTab === "help" ? <AdminHelpPanel /> : null}

        {activeTab === "plans" ? (
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
        ) : null}

        {activeTab === "users" ? (
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
                <span>手机号</span>
                <input
                  className="admin-input"
                  inputMode="tel"
                  placeholder="13800000000"
                  value={newAdmin.phone}
                  onChange={(event) => setNewAdmin({ ...newAdmin, phone: event.target.value })}
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
                  <th>手机号</th>
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
                  [...users]
                    .sort((left, right) => {
                      const leftNumericId = left.numericId ?? 0;
                      const rightNumericId = right.numericId ?? 0;
                      if (rightNumericId !== leftNumericId) {
                        return rightNumericId - leftNumericId;
                      }
                      return right.createdAt.localeCompare(left.createdAt);
                    })
                    .slice(0, 20)
                    .map((user) => {
                      const isExpanded = expandedUserId === user.id;
                      const draft = userDrafts[user.id] ?? userToQuotaForm(user);
                      return (
                        <Fragment key={user.id}>
                          <tr>
                            <td>{user.phone || "-"}</td>
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
        ) : null}

        {activeTab === "referral" ? (
          <section className="admin-table-card admin-billing-card" aria-labelledby="referral-config-title">
            <div className="admin-table-card__title">
              <UserPlus className="size-4" aria-hidden="true" />
              <h2 id="referral-config-title">邀请激励配置</h2>
            </div>
            <div className="admin-billing-grid">
              <div className="admin-form-panel">
                <div className="admin-form-panel__title-row">
                  <div>
                    <p className="settings-eyebrow">Registration</p>
                    <h3>注册生图奖励</h3>
                  </div>
                  <label className="admin-switch">
                    <input
                      checked={referralSettings.enabled}
                      type="checkbox"
                      onChange={(event) => setReferralSettings({ ...referralSettings, enabled: event.target.checked })}
                    />
                    <span>{referralSettings.enabled ? "启用" : "关闭"}</span>
                  </label>
                </div>
                <div className="admin-form-grid admin-form-grid--two">
                  <label>
                    <span>自然注册基础张数</span>
                    <input className="admin-input" inputMode="numeric" value={referralSettings.baseRegisterCredits} onChange={(event) => setReferralSettings({ ...referralSettings, baseRegisterCredits: event.target.value })} />
                  </label>
                  <label>
                    <span>邀请者注册奖励张数</span>
                    <input className="admin-input" inputMode="numeric" value={referralSettings.inviterRegisterCredits} onChange={(event) => setReferralSettings({ ...referralSettings, inviterRegisterCredits: event.target.value })} />
                  </label>
                  <label>
                    <span>被邀请者注册加赠张数</span>
                    <input className="admin-input" inputMode="numeric" value={referralSettings.inviteeRegisterCredits} onChange={(event) => setReferralSettings({ ...referralSettings, inviteeRegisterCredits: event.target.value })} />
                  </label>
                  <label>
                    <span>币种</span>
                    <input className="admin-input" value={referralSettings.currency} onChange={(event) => setReferralSettings({ ...referralSettings, currency: event.target.value.toUpperCase() })} />
                  </label>
                </div>
              </div>

              <div className="admin-form-panel">
                <div>
                  <p className="settings-eyebrow">Cashback</p>
                  <h3>充值/套餐返现</h3>
                </div>
                <div className="admin-form-grid admin-form-grid--two">
                  <label>
                    <span>充值返现比例 %</span>
                    <input className="admin-input" inputMode="decimal" value={referralSettings.rechargeCashbackRate} onChange={(event) => setReferralSettings({ ...referralSettings, rechargeCashbackRate: event.target.value })} />
                  </label>
                  <label>
                    <span>套餐返现比例 %</span>
                    <input className="admin-input" inputMode="decimal" value={referralSettings.planPurchaseCashbackRate} onChange={(event) => setReferralSettings({ ...referralSettings, planPurchaseCashbackRate: event.target.value })} />
                  </label>
                  <label>
                    <span>最低返现订单金额</span>
                    <input className="admin-input" inputMode="decimal" value={referralSettings.minCashbackOrderAmount} onChange={(event) => setReferralSettings({ ...referralSettings, minCashbackOrderAmount: event.target.value })} />
                  </label>
                </div>
                <button className="primary-action h-10" disabled={savingBilling === "referral"} type="button" onClick={() => void saveReferralSettings()}>
                  {savingBilling === "referral" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}
                  保存邀请规则
                </button>
              </div>
            </div>
            <DataTable
              columns={["时间", "邀请者", "类型", "金额", "张数", "余额/额度后", "说明"]}
              emptyLabel="暂无邀请奖励流水"
              icon={<Receipt className="size-4" aria-hidden="true" />}
              rows={referralTransactions.map((item) => [
                formatDateTime(item.createdAt),
                item.userEmail || item.userId || "-",
                billingTypeLabel(item.type),
                item.amountCents ? formatMoney(item.amountCents, item.currency) : "-",
                rewardQuotaCount(item),
                rewardBalanceOrQuotaAfter(item),
                item.note || item.title
              ])}
              title="邀请奖励流水"
            />
          </section>
        ) : null}

        {activeTab === "demoCanvas" ? (
          <AdminDemoCanvasPanel
            examples={demoCanvasExamples}
            saving={savingDemoCanvas}
            uploadingField={uploadingDemoCanvasField}
            onAdd={() => setDemoCanvasExamples((current) => [...current, createDemoCanvasExampleForm(current.length)])}
            onChange={(exampleId, patch) =>
              setDemoCanvasExamples((current) => current.map((example) => (example.id === exampleId ? { ...example, ...patch } : example)))
            }
            onRemove={(exampleId) => setDemoCanvasExamples((current) => current.filter((example) => example.id !== exampleId))}
            onSave={() => void saveDemoCanvasExamples()}
            onUpload={(exampleId, field, file) => void uploadDemoCanvasImage(exampleId, field, file)}
          />
        ) : null}

        {activeTab === "gallery" ? (
          <AdminPublicGalleryPanel
            items={galleryItems}
            savingOutputId={savingGalleryOutputId}
            onToggle={(item, enabled) => void saveGalleryPublicStatus(item, enabled)}
          />
        ) : null}

        {activeTab === "ledger" ? (
          <>
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
        <section className="admin-table-card" aria-labelledby="invoice-admin-title">
          <div className="admin-table-card__title">
            <Receipt className="size-4" aria-hidden="true" />
            <h2 id="invoice-admin-title">开票申请</h2>
          </div>
          <div className="account-billing-overview">
            <div className="billing-stat-card"><span>实际支付</span><strong>{formatMoney(invoiceAdminSummary.paidAmountCents, invoiceAdminSummary.currency)}</strong></div>
            <div className="billing-stat-card"><span>已开票</span><strong>{formatMoney(invoiceAdminSummary.issuedAmountCents, invoiceAdminSummary.currency)}</strong></div>
            <div className="billing-stat-card"><span>待处理占用</span><strong>{formatMoney(invoiceAdminSummary.reservedAmountCents, invoiceAdminSummary.currency)}</strong></div>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>提交时间</th>
                  <th>用户</th>
                  <th>抬头</th>
                  <th>金额</th>
                  <th>状态</th>
                  <th>接收邮箱</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {invoiceApplications.length > 0 ? (
                  invoiceApplications.map((item) => (
                    <tr key={item.id}>
                      <td>{formatDateTime(item.createdAt)}</td>
                      <td>{item.userEmail || item.userDisplayName || item.userId || "-"}</td>
                      <td>{item.title}</td>
                      <td>{formatMoney(item.amountCents, invoiceAdminSummary.currency)}</td>
                      <td>{invoiceStatusLabel(item.status)}</td>
                      <td>{item.email || "-"}</td>
                      <td>
                        <div className="admin-row-actions">
                          <button className="secondary-action h-9" disabled={savingInvoiceId === item.id || item.status === "issued" || item.status === "rejected"} type="button" onClick={() => void updateInvoiceStatus(item, "processing")}>处理中</button>
                          <button className="primary-action h-9" disabled={savingInvoiceId === item.id || item.status === "issued" || item.status === "rejected"} type="button" onClick={() => void updateInvoiceStatus(item, "issued")}>已开票</button>
                          <button className="secondary-action h-9" disabled={savingInvoiceId === item.id || item.status === "issued" || item.status === "rejected"} type="button" onClick={() => void updateInvoiceStatus(item, "rejected")}>驳回</button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7}>暂无开票申请</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
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
          </>
        ) : null}
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

function MobileAccountRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="mobile-account-row">
      <span>{icon}</span>
      <strong>{label}</strong>
      <em>{value}</em>
      <ChevronRight className="size-5" aria-hidden="true" />
    </div>
  );
}

function HomeIconFallback() {
  return <Package className="size-5" aria-hidden="true" />;
}

function HelpIconFallback() {
  return <ShieldCheck className="size-7" aria-hidden="true" />;
}

function LogOutIconFallback() {
  return <ArrowRight className="size-5" aria-hidden="true" />;
}

function maskPhone(value: string | undefined): string {
  const phone = value?.trim();
  if (!phone) {
    return "未验证";
  }
  return phone.length >= 7 ? `${phone.slice(0, 3)}****${phone.slice(-4)}` : phone;
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

function AdminDemoCanvasPanel({
  examples,
  saving,
  uploadingField,
  onAdd,
  onChange,
  onRemove,
  onSave,
  onUpload
}: {
  examples: DemoCanvasExampleForm[];
  saving: boolean;
  uploadingField: string;
  onAdd: () => void;
  onChange: (exampleId: string, patch: Partial<DemoCanvasExampleForm>) => void;
  onRemove: (exampleId: string) => void;
  onSave: () => void;
  onUpload: (exampleId: string, field: "beforeUrl" | "afterUrl", file: File) => void;
}) {
  return (
    <section className="admin-table-card admin-demo-canvas-panel" aria-labelledby="demo-canvas-title">
      <div className="admin-table-card__title admin-demo-canvas-panel__title">
        <div>
          <ImageIcon className="size-4" aria-hidden="true" />
          <h2 id="demo-canvas-title">游客画布案例</h2>
        </div>
        <div className="admin-demo-canvas-panel__actions">
          <button className="secondary-action h-10" type="button" onClick={onAdd}>
            <Plus className="size-4" aria-hidden="true" />
            新增一组
          </button>
          <button className="primary-action h-10" disabled={saving} type="button" onClick={onSave}>
            {saving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}
            保存画布案例
          </button>
        </div>
      </div>

      {examples.length > 0 ? (
        <div className="admin-demo-canvas-list">
          {examples.map((example, index) => (
            <article className="admin-demo-canvas-item" key={example.id}>
              <div className="admin-demo-canvas-item__head">
                <div>
                  <p className="settings-eyebrow">Canvas Group {index + 1}</p>
                  <h3>{example.title || `画布案例 ${index + 1}`}</h3>
                </div>
                <div className="admin-demo-canvas-item__tools">
                  <label className="admin-switch">
                    <input checked={example.enabled} type="checkbox" onChange={(event) => onChange(example.id, { enabled: event.target.checked })} />
                    <span>{example.enabled ? "展示" : "隐藏"}</span>
                  </label>
                  <button className="secondary-action h-10" type="button" onClick={() => onRemove(example.id)}>
                    <X className="size-4" aria-hidden="true" />
                    删除
                  </button>
                </div>
              </div>

              <div className="admin-demo-canvas-preview">
                <DemoCanvasUploadPreview
                  exampleId={example.id}
                  field="beforeUrl"
                  label={example.beforeLabel || "修改前"}
                  uploading={uploadingField === `${example.id}:beforeUrl`}
                  url={example.beforeUrl}
                  onUpload={onUpload}
                />
                <DemoCanvasUploadPreview
                  exampleId={example.id}
                  field="afterUrl"
                  label={example.afterLabel || "修改后"}
                  uploading={uploadingField === `${example.id}:afterUrl`}
                  url={example.afterUrl}
                  onUpload={onUpload}
                />
              </div>

              <div className="admin-form-grid admin-form-grid--two">
                <label><span>标题</span><input className="admin-input" value={example.title} onChange={(event) => onChange(example.id, { title: event.target.value })} /></label>
                <label><span>分类</span><input className="admin-input" value={example.category} onChange={(event) => onChange(example.id, { category: event.target.value })} /></label>
                <label><span>修改前标签</span><input className="admin-input" value={example.beforeLabel} onChange={(event) => onChange(example.id, { beforeLabel: event.target.value })} /></label>
                <label><span>修改后标签</span><input className="admin-input" value={example.afterLabel} onChange={(event) => onChange(example.id, { afterLabel: event.target.value })} /></label>
                <label><span>修改前图片 URL</span><input className="admin-input" value={example.beforeUrl} onChange={(event) => onChange(example.id, { beforeUrl: event.target.value })} /></label>
                <label><span>修改后图片 URL</span><input className="admin-input" value={example.afterUrl} onChange={(event) => onChange(example.id, { afterUrl: event.target.value })} /></label>
                <label><span>宽度</span><input className="admin-input" inputMode="numeric" value={example.width} onChange={(event) => onChange(example.id, { width: event.target.value })} /></label>
                <label><span>高度</span><input className="admin-input" inputMode="numeric" value={example.height} onChange={(event) => onChange(example.id, { height: event.target.value })} /></label>
                <label><span>风格</span><select className="admin-input" value={example.presetId} onChange={(event) => onChange(example.id, { presetId: event.target.value as StylePresetId })}>{demoStylePresetOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                <label><span>质量</span><select className="admin-input" value={example.quality} onChange={(event) => onChange(example.id, { quality: event.target.value as ImageQuality })}>{demoQualityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                <label><span>格式</span><select className="admin-input" value={example.outputFormat} onChange={(event) => onChange(example.id, { outputFormat: event.target.value as OutputFormat })}>{demoOutputFormatOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                <label><span>排序</span><input className="admin-input" inputMode="numeric" value={example.sortOrder} onChange={(event) => onChange(example.id, { sortOrder: event.target.value })} /></label>
              </div>
              <label className="admin-demo-canvas-wide">
                <span>说明</span>
                <textarea className="admin-textarea" value={example.brief} onChange={(event) => onChange(example.id, { brief: event.target.value })} />
              </label>
              <label className="admin-demo-canvas-wide">
                <span>演示提示词</span>
                <textarea className="admin-textarea" value={example.prompt} onChange={(event) => onChange(example.id, { prompt: event.target.value })} />
              </label>
            </article>
          ))}
        </div>
      ) : (
        <div className="gallery-empty-state">
          <ImageIcon className="size-7" aria-hidden="true" />
          <p>暂无画布案例</p>
          <button className="primary-action h-10" type="button" onClick={onAdd}>
            <Plus className="size-4" aria-hidden="true" />
            新增第一组
          </button>
        </div>
      )}
    </section>
  );
}

function DemoCanvasUploadPreview({
  exampleId,
  field,
  label,
  uploading,
  url,
  onUpload
}: {
  exampleId: string;
  field: "beforeUrl" | "afterUrl";
  label: string;
  uploading: boolean;
  url: string;
  onUpload: (exampleId: string, field: "beforeUrl" | "afterUrl", file: File) => void;
}) {
  const inputId = `demo-canvas-upload-${exampleId}-${field}`;
  const handleFile = (file: File | undefined): void => {
    if (file && file.type.startsWith("image/")) {
      onUpload(exampleId, field, file);
    }
  };
  const handlePaste = (event: React.ClipboardEvent<HTMLLabelElement>): void => {
    const fileFromItems = Array.from(event.clipboardData.items)
      .find((item) => item.kind === "file" && item.type.startsWith("image/"))
      ?.getAsFile();
    const fileFromList = Array.from(event.clipboardData.files).find((file) => file.type.startsWith("image/"));
    const pastedFile = fileFromItems ?? fileFromList;
    if (!pastedFile) {
      return;
    }

    event.preventDefault();
    handleFile(pastedFile);
  };

  return (
    <figure>
      <label
        aria-label={`${label}图片，点击上传或粘贴图片`}
        className="admin-demo-canvas-preview__media"
        data-has-image={url ? "true" : "false"}
        data-uploading={uploading}
        htmlFor={inputId}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") {
            return;
          }
          event.preventDefault();
          document.getElementById(inputId)?.click();
        }}
        onPaste={handlePaste}
      >
        {url ? <img alt="" src={adminPreviewImageUrl(url)} /> : <span className="admin-demo-canvas-placeholder">{label}图片</span>}
        {url && !uploading ? null : (
          <span className="admin-demo-canvas-upload">
            {uploading ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Upload className="size-3.5" aria-hidden="true" />}
            {uploading ? "上传中" : "上传"}
          </span>
        )}
        {url ? null : <span className="admin-demo-canvas-paste-hint">点击上传 / 粘贴图片</span>}
        <input
          accept="image/png,image/jpeg,image/webp,image/gif"
          disabled={uploading}
          id={inputId}
          type="file"
          onChange={(event) => {
            handleFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </label>
      <figcaption>
        <span>{label}</span>
      </figcaption>
    </figure>
  );
}

function AdminPublicGalleryPanel({
  items,
  savingOutputId,
  onToggle
}: {
  items: GalleryImageItem[];
  savingOutputId: string;
  onToggle: (item: GalleryImageItem, enabled: boolean) => void;
}) {
  const publicCount = items.filter((item) => item.publicGalleryEnabled).length;

  return (
    <section className="admin-table-card admin-public-gallery-panel" aria-labelledby="public-gallery-title">
      <div className="admin-table-card__title admin-public-gallery-panel__title">
        <div>
          <ImageIcon className="size-4" aria-hidden="true" />
          <h2 id="public-gallery-title">游客公开案例库</h2>
        </div>
        <div className="admin-public-gallery-panel__actions">
          <span>{publicCount.toLocaleString("zh-CN")} / {items.length.toLocaleString("zh-CN")} 已公开</span>
          <a className="secondary-action h-10" href="/gallery" target="_blank" rel="noreferrer">
            <ExternalLink className="size-4" aria-hidden="true" />
            预览游客图库
          </a>
        </div>
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table admin-public-gallery-table">
          <thead>
            <tr>
              <th>作品</th>
              <th>游客展示</th>
              <th>创建时间</th>
              <th>公开时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {items.length > 0 ? (
              items.map((item) => {
                const isPublic = Boolean(item.publicGalleryEnabled);
                const isSaving = savingOutputId === item.outputId;

                return (
                  <tr key={item.outputId}>
                    <td>
                      <div className="admin-public-gallery-work">
                        {isGalleryVideoItem(item) ? (
                          <video aria-label={galleryPromptExcerpt(item.prompt)} muted playsInline preload="metadata" src={galleryAssetPreviewUrl(item)} />
                        ) : (
                          <img alt="" src={galleryAssetPreviewUrl(item)} />
                        )}
                        <div>
                          <strong>{galleryPromptExcerpt(item.prompt)}</strong>
                          <span>{galleryOwnerLabel(item)}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="admin-public-gallery-status" data-enabled={isPublic}>
                        {isPublic ? "已展示" : "未展示"}
                      </span>
                    </td>
                    <td>{formatDateTime(item.createdAt)}</td>
                    <td>{item.publicGalleryUpdatedAt ? formatDateTime(item.publicGalleryUpdatedAt) : "-"}</td>
                    <td>
                      <button
                        className={`${isPublic ? "secondary-action" : "primary-action"} h-10 admin-public-gallery-toggle`}
                        disabled={isSaving}
                        type="button"
                        onClick={() => onToggle(item, !isPublic)}
                      >
                        {isSaving ? (
                          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                        ) : isPublic ? (
                          <X className="size-4" aria-hidden="true" />
                        ) : (
                          <CheckCircle2 className="size-4" aria-hidden="true" />
                        )}
                        {isPublic ? "取消展示" : "展示给游客"}
                      </button>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={5}>暂无可筛选作品，生成成功的图片会出现在这里。</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function InviteCampaignDialog({
  error,
  inviteCode,
  inviteUrl,
  inviteeRegisterCredits,
  invitedUserCount,
  inviterRegisterCredits,
  loading,
  notice,
  inviteQrDataUrl,
  planCashbackRate,
  rechargeCashbackRate,
  onClose,
  onCopy,
  onDownload,
  onRefresh
}: {
  error: string;
  inviteCode: string;
  inviteUrl: string;
  inviteeRegisterCredits?: number;
  invitedUserCount: number;
  inviterRegisterCredits?: number;
  loading: boolean;
  notice: string;
  inviteQrDataUrl: string;
  planCashbackRate?: number;
  rechargeCashbackRate?: number;
  onClose: () => void;
  onCopy: () => void;
  onDownload: () => void;
  onRefresh: () => void;
}) {
  return (
    <div className="invite-dialog-backdrop" role="presentation">
      <section aria-labelledby="invite-dialog-title" aria-modal="true" className="invite-dialog" role="dialog">
        <button aria-label="关闭邀请活动弹窗" className="invite-dialog__close" type="button" onClick={onClose}>
          ×
        </button>
        <div className="invite-dialog__poster" style={{ backgroundImage: "url('/images/referral-campaign-poster.png')" }}>
          <div className="invite-dialog__poster-copy">
            <span>好友注册，多赚额度</span>
            <strong>邀请好友一起做商品图</strong>
          </div>
        </div>
        <div className="invite-dialog__body">
          <p className="settings-eyebrow">
            <Gift className="size-4" aria-hidden="true" />
            Referral Campaign
          </p>
          <h2 id="invite-dialog-title">邀请好友注册，赚生图张数和现金激励</h2>
          <p className="invite-dialog__lead">
            好友通过你的邀请链接完成注册，你和好友都会获得生图额度。好友后续充值或购买套餐，你还可以获得现金激励账户返现。
          </p>
          <div className="invite-rule-grid">
            <div><span>你获得</span><strong>{formatCreditReward(inviterRegisterCredits)}</strong></div>
            <div><span>好友额外获得</span><strong>{formatCreditReward(inviteeRegisterCredits)}</strong></div>
            <div><span>充值返现</span><strong>{formatOptionalPercent(rechargeCashbackRate)}</strong></div>
            <div><span>套餐返现</span><strong>{formatOptionalPercent(planCashbackRate)}</strong></div>
          </div>
          <InviteShareCard inviteCode={inviteCode} inviteUrl={inviteUrl} invitedUserCount={invitedUserCount} inviteQrDataUrl={inviteQrDataUrl} />
          {notice ? <p className="billing-alert billing-alert--success">{notice}</p> : null}
          {error ? <p className="billing-alert billing-alert--warning">{error}</p> : null}
          <div className="invite-dialog__actions">
            <button className="primary-action h-10" disabled={!inviteUrl} type="button" onClick={onCopy}>
              <Copy className="size-4" aria-hidden="true" />
              复制邀请链接
            </button>
            <button className="secondary-action h-10" disabled={!inviteUrl} type="button" onClick={onDownload}>
              <Download className="size-4" aria-hidden="true" />
              下载分享海报
            </button>
            <button className="secondary-action h-10" disabled={loading} type="button" onClick={onRefresh}>
              {loading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="size-4" aria-hidden="true" />}
              刷新邀请信息
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function InviteShareCard({
  inviteCode,
  inviteUrl,
  invitedUserCount,
  inviteQrDataUrl
}: {
  inviteCode: string;
  inviteUrl: string;
  invitedUserCount: number;
  inviteQrDataUrl: string;
}) {
  return (
    <div className="invite-share-card">
      <div className="invite-share-card__text">
        <span>专属邀请海报</span>
        <strong>扫码或打开链接注册</strong>
        <p>{inviteUrl || "邀请链接生成中"}</p>
        <em>已邀请 {invitedUserCount.toLocaleString("zh-CN")} 位好友</em>
      </div>
      <div className="invite-share-card__qr" aria-label="邀请二维码">
        {inviteQrDataUrl ? <img alt="邀请二维码" src={inviteQrDataUrl} /> : <span>生成中</span>}
      </div>
      <div className="invite-share-card__code">
        <span>邀请码</span>
        <strong>{inviteCode || "生成中"}</strong>
      </div>
    </div>
  );
}

function PhoneVerificationDialog({
  error,
  isBinding,
  isSendingCode,
  notice,
  phone,
  smsCode,
  onPhoneChange,
  onSendCode,
  onSmsCodeChange,
  onSubmit,
  onClose
}: {
  error: string;
  isBinding: boolean;
  isSendingCode: boolean;
  notice: string;
  phone: string;
  smsCode: string;
  onPhoneChange: (value: string) => void;
  onSendCode: () => void;
  onSmsCodeChange: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  return (
    <div className="invite-dialog-backdrop phone-verification-backdrop" role="presentation">
      <section aria-labelledby="phone-verification-title" aria-modal="true" className="phone-verification-dialog" role="dialog">
        <button aria-label="关闭完善手机号弹窗" className="phone-verification-dialog__close" type="button" onClick={onClose}>
          <X className="size-5" aria-hidden="true" />
        </button>
        <div className="phone-verification-dialog__icon">
          <Phone className="size-5" aria-hidden="true" />
        </div>
        <div className="phone-verification-dialog__copy">
          <p className="settings-eyebrow">Phone Verification</p>
          <h2 id="phone-verification-title">完善手机号</h2>
          <p>{PHONE_VERIFICATION_REQUIRED_MESSAGE}</p>
        </div>
        <div className="phone-verification-dialog__form">
          <label>
            <span>手机号</span>
            <input className="admin-input" inputMode="tel" value={phone} onChange={(event) => onPhoneChange(event.target.value)} />
          </label>
          <label>
            <span>短信验证码</span>
            <div className="auth-input auth-input--with-action">
              <ShieldCheck className="size-4" aria-hidden="true" />
              <input inputMode="numeric" maxLength={6} value={smsCode} onChange={(event) => onSmsCodeChange(event.target.value)} />
              <button className="auth-input__action" disabled={isSendingCode} type="button" onClick={onSendCode}>
                {isSendingCode ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
                发送
              </button>
            </div>
          </label>
        </div>
        {error ? <div className="auth-alert" role="alert"><AlertTriangle className="size-4" aria-hidden="true" /><p>{error}</p></div> : null}
        {notice ? <div className="admin-success" role="status"><CheckCircle2 className="size-4" aria-hidden="true" /><p>{notice}</p></div> : null}
        <button className="primary-action h-11" disabled={isBinding} type="button" onClick={onSubmit}>
          {isBinding ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="size-4" aria-hidden="true" />}
          完成验证
        </button>
      </section>
    </div>
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

type InvoiceHeaderType = "company" | "personal";
type InvoiceStatus = "pending" | "processing" | "issued" | "rejected";

interface InvoiceRecord {
  id: string;
  userId?: string;
  userEmail?: string;
  userDisplayName?: string;
  headerType: InvoiceHeaderType;
  title: string;
  taxNumber?: string;
  invoiceContent: string;
  amountCents: number;
  email: string;
  phone?: string;
  companyAddress?: string;
  bankName?: string;
  bankAccount?: string;
  remark?: string;
  status: InvoiceStatus;
  createdAt: string;
  updatedAt: string;
}

interface InvoiceApplicationsState {
  summary: InvoiceSummaryState;
  profile?: InvoiceRecord;
  applications: InvoiceRecord[];
}

interface InvoiceSummaryState {
  currency: string;
  paidAmountCents: number;
  issuedAmountCents: number;
  reservedAmountCents: number;
  availableAmountCents: number;
  requestableAmountCents: number;
}

interface InvoiceFormState {
  headerType: InvoiceHeaderType;
  title: string;
  taxNumber: string;
  invoiceContent: string;
  amount: string;
  email: string;
  phone: string;
  companyAddress: string;
  bankName: string;
  bankAccount: string;
  remark: string;
}

interface InviteSummaryState {
  inviteCode: string;
  inviteUrl?: string;
  invitedUserCount: number;
  successfulInviteCount: number;
  referralBalanceCents: number;
  currency: string;
  settings: {
    enabled?: boolean;
    baseRegisterCredits?: number;
    inviterRegisterCredits?: number;
    inviteeRegisterCredits?: number;
    rechargeCashbackRateBps?: number;
    planPurchaseCashbackRateBps?: number;
    minCashbackOrderAmountCents?: number;
    currency: string;
  };
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
  numericId?: number;
  email: string;
  phone?: string;
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
  phone: string;
  displayName: string;
  password: string;
}

interface BillingSettingsFormState {
  imageUnitPrice: string;
  currency: string;
}

interface RedemptionCodeRow {
  id: string;
  code: string;
  batchId?: string;
  quota: number;
  maxRedemptions: number;
  usedCount: number;
  redeemedUserCount: number;
  remainingCount: number;
  validDays: number;
  status: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

interface RedemptionCodeFormState {
  count: string;
  maxRedemptions: string;
  quota: string;
  validDays: string;
  customCodes: string;
  codePrefix: string;
  note: string;
}

interface StorageConfigFormState {
  enabled: boolean;
  provider: CloudStorageProvider;
  secretId: string;
  secretKey: string;
  secretSaved: boolean;
  bucket: string;
  region: string;
  keyPrefix: string;
}

interface ReferralSettingsFormState {
  enabled: boolean;
  baseRegisterCredits: string;
  inviterRegisterCredits: string;
  inviteeRegisterCredits: string;
  rechargeCashbackRate: string;
  planPurchaseCashbackRate: string;
  minCashbackOrderAmount: string;
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

interface CategoryKitPlannerModelFormState {
  id: string;
  enabled: boolean;
  name: string;
  provider: CategoryKitPlannerProvider;
  modules: CategoryKitPlannerModule[];
  role: CategoryKitPlannerModelRole;
  priority: string;
  apiKey: string;
  apiKeySaved: boolean;
  baseUrl: string;
  model: string;
  timeoutSeconds: string;
}

interface CategoryStrategyFormState {
  id: string;
  enabled: boolean;
  categoryPath: string;
  categoryName: string;
  platform: string;
  market: string;
  priority: string;
  aliasesText: string;
  requiredAssetsText: string;
  missingChecklistText: string;
  strategyText: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

interface SeedanceVideoConfigFormState {
  apiKey: string;
  apiKeySaved: boolean;
  baseUrl: string;
  model: string;
  source: SeedanceVideoConfigResponse["source"];
}

interface EcommerceGenerationConcurrencyFormState {
  globalConcurrency: string;
  jobConcurrency: string;
}

interface ExtensionReleaseTargetFormState {
  apiBaseUrl: string;
  version: string;
  downloadUrl: string;
  latestDownloadUrl: string;
  installHelpUrl: string;
  fileName: string;
  sizeBytes: string;
  sha256: string;
  releaseNotesText: string;
}

interface ExtensionReleaseFormState {
  dev: ExtensionReleaseTargetFormState;
  prod: ExtensionReleaseTargetFormState;
}

interface AppReleaseTargetFormState {
  enabled: boolean;
  version: string;
  buildNumber: string;
  downloadUrl: string;
  forceUpdate: boolean;
  releaseNotesText: string;
}

interface AppReleaseFormState {
  ios: AppReleaseTargetFormState;
  android: AppReleaseTargetFormState;
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
  taskCompleteTemplateId: string;
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

interface AliyunSmsFormState {
  enabled: boolean;
  accessKeyId: string;
  accessKeySecret: string;
  accessKeySecretSaved: boolean;
  endpoint: string;
  signName: string;
  registerTemplateCode: string;
  bindTemplateCode: string;
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
  quotaAfter?: number;
  quotaCount?: number;
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

interface DemoCanvasExampleForm {
  id: string;
  title: string;
  category: string;
  beforeLabel: string;
  afterLabel: string;
  brief: string;
  prompt: string;
  presetId: StylePresetId;
  width: string;
  height: string;
  quality: ImageQuality;
  outputFormat: OutputFormat;
  beforeUrl: string;
  afterUrl: string;
  enabled: boolean;
  sortOrder: string;
  createdAt: string;
}

const demoStylePresetOptions: Array<{ value: StylePresetId; label: string }> = [
  { value: "none", label: "无风格" },
  { value: "photoreal", label: "真实摄影" },
  { value: "product", label: "商业产品" },
  { value: "illustration", label: "精致插画" },
  { value: "poster", label: "海报视觉" },
  { value: "avatar", label: "头像角色" }
];

const demoQualityOptions: Array<{ value: ImageQuality; label: string }> = [
  { value: "auto", label: "自动" },
  { value: "low", label: "快速草稿" },
  { value: "medium", label: "标准" },
  { value: "high", label: "高质量" }
];

const demoOutputFormatOptions: Array<{ value: OutputFormat; label: string }> = [
  { value: "png", label: "PNG" },
  { value: "jpeg", label: "JPEG" },
  { value: "webp", label: "WEBP" }
];

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

function createInvoiceApplicationsState(): InvoiceApplicationsState {
  return {
    summary: createInvoiceSummaryState(),
    applications: []
  };
}

function createInvoiceSummaryState(): InvoiceSummaryState {
  return {
    currency: "CNY",
    paidAmountCents: 0,
    issuedAmountCents: 0,
    reservedAmountCents: 0,
    availableAmountCents: 0,
    requestableAmountCents: 0
  };
}

function createInvoiceFormState(user?: AuthUser): InvoiceFormState {
  return {
    headerType: "company",
    title: "",
    taxNumber: "",
    invoiceContent: "商品图生成服务",
    amount: "",
    email: user?.email || "",
    phone: user?.phone || "",
    companyAddress: "",
    bankName: "",
    bankAccount: "",
    remark: ""
  };
}

function invoiceRecordToForm(record: InvoiceRecord): InvoiceFormState {
  return {
    headerType: record.headerType,
    title: record.title,
    taxNumber: record.taxNumber || "",
    invoiceContent: record.invoiceContent || "商品图生成服务",
    amount: centsToMoneyInput(record.amountCents),
    email: record.email || "",
    phone: record.phone || "",
    companyAddress: record.companyAddress || "",
    bankName: record.bankName || "",
    bankAccount: record.bankAccount || "",
    remark: record.remark || ""
  };
}

function parseInvoiceApplications(value: unknown): InvoiceApplicationsState {
  const root = isRecord(value) ? value : {};
  const applications = Array.isArray(root.applications) ? root.applications.map(parseInvoiceRecord).filter((item): item is InvoiceRecord => Boolean(item)) : [];
  const profile = parseInvoiceRecord(root.profile) ?? applications[0];
  return {
    summary: parseInvoiceSummary(root.summary),
    profile,
    applications
  };
}

function parseInvoiceSummary(value: unknown): InvoiceSummaryState {
  const source = isRecord(value) ? value : {};
  return {
    currency: stringFrom(source.currency) || "CNY",
    paidAmountCents: numberFrom(source.paidAmountCents) ?? 0,
    issuedAmountCents: numberFrom(source.issuedAmountCents) ?? 0,
    reservedAmountCents: numberFrom(source.reservedAmountCents) ?? 0,
    availableAmountCents: numberFrom(source.availableAmountCents) ?? 0,
    requestableAmountCents: numberFrom(source.requestableAmountCents) ?? 0
  };
}

function parseInvoiceRecord(value: unknown): InvoiceRecord | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const id = stringFrom(value.id);
  const title = stringFrom(value.title);
  if (!id || !title) {
    return undefined;
  }
  const headerType: InvoiceHeaderType = value.headerType === "personal" ? "personal" : "company";
  return {
    id,
    userId: stringFrom(value.userId),
    userEmail: stringFrom(value.userEmail),
    userDisplayName: stringFrom(value.userDisplayName),
    headerType,
    title,
    taxNumber: stringFrom(value.taxNumber),
    invoiceContent: stringFrom(value.invoiceContent) || "商品图生成服务",
    amountCents: numberFrom(value.amountCents) ?? 0,
    email: stringFrom(value.email),
    phone: stringFrom(value.phone),
    companyAddress: stringFrom(value.companyAddress),
    bankName: stringFrom(value.bankName),
    bankAccount: stringFrom(value.bankAccount),
    remark: stringFrom(value.remark),
    status: invoiceStatus(value.status),
    createdAt: stringFrom(value.createdAt) || "",
    updatedAt: stringFrom(value.updatedAt) || ""
  };
}

function invoiceStatus(value: unknown): InvoiceStatus {
  return value === "processing" || value === "issued" || value === "rejected" ? value : "pending";
}

function invoiceStatusLabel(value: InvoiceStatus): string {
  if (value === "processing") return "处理中";
  if (value === "issued") return "已开具";
  if (value === "rejected") return "已驳回";
  return "待处理";
}

function parseInviteSummary(value: unknown, user: AuthUser): InviteSummaryState {
  const root = isRecord(value) ? value : {};
  const invite = isRecord(root.invite) ? root.invite : isRecord(root.data) ? root.data : root;
  const settings = isRecord(invite.settings) ? invite.settings : {};
  return {
    inviteCode: stringFrom(invite.inviteCode ?? invite.invite_code ?? user.inviteCode),
    inviteUrl: stringFrom(invite.inviteUrl ?? invite.invite_url),
    invitedUserCount: numberFrom(invite.invitedUserCount ?? invite.invited_user_count) ?? 0,
    successfulInviteCount: numberFrom(invite.successfulInviteCount ?? invite.successful_invite_count) ?? 0,
    referralBalanceCents: numberFrom(invite.referralBalanceCents ?? invite.referral_balance_cents ?? user.referralBalanceCents) ?? 0,
    currency: stringFrom(invite.currency ?? settings.currency ?? user.currency) || "CNY",
    settings: {
      enabled: typeof settings.enabled === "boolean" ? settings.enabled : undefined,
      baseRegisterCredits: numberFrom(settings.baseRegisterCredits ?? settings.base_register_credits),
      inviterRegisterCredits: numberFrom(settings.inviterRegisterCredits ?? settings.inviter_register_credits),
      inviteeRegisterCredits: numberFrom(settings.inviteeRegisterCredits ?? settings.invitee_register_credits),
      rechargeCashbackRateBps: numberFrom(settings.rechargeCashbackRateBps ?? settings.recharge_cashback_rate_bps),
      planPurchaseCashbackRateBps: numberFrom(settings.planPurchaseCashbackRateBps ?? settings.plan_purchase_cashback_rate_bps),
      minCashbackOrderAmountCents: numberFrom(settings.minCashbackOrderAmountCents ?? settings.min_cashback_order_amount_cents),
      currency: stringFrom(settings.currency) || "CNY"
    }
  };
}

function createInviteSummaryState(user: AuthUser): InviteSummaryState {
  return {
    inviteCode: user.inviteCode ?? "",
    invitedUserCount: 0,
    successfulInviteCount: 0,
    referralBalanceCents: user.referralBalanceCents ?? 0,
    currency: user.currency ?? "CNY",
    settings: {
      currency: user.currency ?? "CNY"
    }
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
    numericId: numberFrom(item.numericId ?? item.numeric_id),
    email: stringFrom(item.email),
    phone: stringFrom(item.phone ?? item.mobile),
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

function parseRedemptionCodes(value: unknown): RedemptionCodeRow[] {
  return arrayFrom(value, ["codes", "items"]).map((item, index) => {
    const maxRedemptions = numberFrom(item.maxRedemptions ?? item.max_redemptions) ?? 0;
    const usedCount = numberFrom(item.usedCount ?? item.used_count) ?? 0;
    return {
      id: stringFrom(item.id) || stringFrom(item.code) || `redemption-code-${index}`,
      code: stringFrom(item.code),
      batchId: stringFrom(item.batchId ?? item.batch_id),
      quota: numberFrom(item.quota ?? item.quotaGranted ?? item.quota_granted) ?? 0,
      maxRedemptions,
      usedCount,
      redeemedUserCount: numberFrom(item.redeemedUserCount ?? item.redeemed_user_count) ?? usedCount,
      remainingCount: numberFrom(item.remainingCount ?? item.remaining_count) ?? Math.max(0, maxRedemptions - usedCount),
      validDays: numberFrom(item.validDays ?? item.valid_days) ?? 0,
      status: stringFrom(item.status) || "active",
      note: stringFrom(item.note),
      createdAt: stringFrom(item.createdAt ?? item.created_at),
      updatedAt: stringFrom(item.updatedAt ?? item.updated_at)
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

function parseGalleryItems(value: unknown): GalleryImageItem[] {
  return arrayFrom(value, ["items"]).flatMap((item) => {
    const parsed = parseGalleryItemFromValue(item);
    return parsed ? [parsed] : [];
  });
}

function parseDemoCanvasExampleForms(value: unknown): DemoCanvasExampleForm[] {
  const body = isRecord(value) ? value : {};
  return arrayFrom(body, ["examples"]).map((item, index) => demoCanvasExampleToForm(parseDemoCanvasExample(item, index), index));
}

function parseDemoCanvasExample(value: Record<string, unknown>, index: number): DemoCanvasExample {
  const size = isRecord(value.size) ? value.size : {};
  return {
    id: stringFrom(value.id) || crypto.randomUUID(),
    title: stringFrom(value.title) || `画布案例 ${index + 1}`,
    category: stringFrom(value.category) || "演示案例",
    beforeLabel: stringFrom(value.beforeLabel) || "修改前",
    afterLabel: stringFrom(value.afterLabel) || "修改后",
    brief: stringFrom(value.brief) || "展示修改前后的效果对比。",
    prompt: stringFrom(value.prompt) || "根据参考图生成适合电商展示的图片。",
    presetId: demoStylePresetValue(value.presetId),
    size: {
      width: numberFrom(size.width) ?? 1024,
      height: numberFrom(size.height) ?? 1024
    },
    quality: demoQualityValue(value.quality),
    outputFormat: demoOutputFormatValue(value.outputFormat),
    createdAt: stringFrom(value.createdAt) || new Date().toISOString(),
    beforeUrl: stringFrom(value.beforeUrl),
    afterUrl: stringFrom(value.afterUrl),
    enabled: booleanFrom(value.enabled, true),
    sortOrder: numberFrom(value.sortOrder) ?? index * 10
  };
}

function demoCanvasExampleToForm(example: DemoCanvasExample, index: number): DemoCanvasExampleForm {
  return {
    id: example.id || crypto.randomUUID(),
    title: example.title,
    category: example.category,
    beforeLabel: example.beforeLabel,
    afterLabel: example.afterLabel,
    brief: example.brief,
    prompt: example.prompt,
    presetId: example.presetId,
    width: stringFromNumber(example.size.width),
    height: stringFromNumber(example.size.height),
    quality: example.quality,
    outputFormat: example.outputFormat,
    beforeUrl: example.beforeUrl,
    afterUrl: example.afterUrl,
    enabled: example.enabled !== false,
    sortOrder: stringFromNumber(example.sortOrder ?? index * 10),
    createdAt: example.createdAt
  };
}

function createDemoCanvasExampleForm(index: number): DemoCanvasExampleForm {
  return {
    id: crypto.randomUUID(),
    title: `画布案例 ${index + 1}`,
    category: "演示案例",
    beforeLabel: "修改前",
    afterLabel: "修改后",
    brief: "展示修改前后的效果对比。",
    prompt: "根据参考图生成适合电商展示的图片。",
    presetId: "product",
    width: "1024",
    height: "1024",
    quality: "auto",
    outputFormat: "png",
    beforeUrl: "",
    afterUrl: "",
    enabled: true,
    sortOrder: String(index * 10),
    createdAt: new Date().toISOString()
  };
}

function demoCanvasExamplesToPayload(forms: DemoCanvasExampleForm[]): SaveDemoCanvasConfigRequest {
  return {
    examples: forms.map((form, index) => ({
      id: form.id,
      title: form.title,
      category: form.category,
      beforeLabel: form.beforeLabel,
      afterLabel: form.afterLabel,
      brief: form.brief,
      prompt: form.prompt,
      presetId: form.presetId,
      size: {
        width: nullableNumber(form.width) ?? 1024,
        height: nullableNumber(form.height) ?? 1024
      },
      quality: form.quality,
      outputFormat: form.outputFormat,
      createdAt: form.createdAt,
      beforeUrl: form.beforeUrl,
      afterUrl: form.afterUrl,
      enabled: form.enabled,
      sortOrder: nullableNumber(form.sortOrder) ?? index * 10
    }))
  };
}

function parseGalleryItemFromValue(value: unknown): GalleryImageItem | undefined {
  if (!isRecord(value) || !isRecord(value.asset)) {
    return undefined;
  }

  const asset = value.asset;
  const outputId = stringFrom(value.outputId ?? value.output_id);
  const generationId = stringFrom(value.generationId ?? value.generation_id);
  const assetId = stringFrom(asset.id ?? asset.assetId ?? asset.asset_id);
  if (!outputId || !generationId || !assetId) {
    return undefined;
  }

  const size = isRecord(value.size) ? value.size : {};

  return {
    outputId,
    generationId,
    userId: stringFrom(value.userId ?? value.user_id) || undefined,
    userEmail: stringFrom(value.userEmail ?? value.user_email) || undefined,
    userDisplayName: stringFrom(value.userDisplayName ?? value.user_display_name) || undefined,
    workspaceId: stringFrom(value.workspaceId ?? value.workspace_id) || undefined,
    publicGalleryEnabled: booleanFrom(value.publicGalleryEnabled ?? value.public_gallery_enabled, false),
    publicGallerySortOrder: numberFrom(value.publicGallerySortOrder ?? value.public_gallery_sort_order),
    publicGalleryUpdatedAt: stringFrom(value.publicGalleryUpdatedAt ?? value.public_gallery_updated_at) || undefined,
    mode: stringFrom(value.mode) === "edit" ? "edit" : "generate",
    prompt: stringFrom(value.prompt),
    effectivePrompt: stringFrom(value.effectivePrompt ?? value.effective_prompt) || stringFrom(value.prompt),
    presetId: stringFrom(value.presetId ?? value.preset_id) || "none",
    size: {
      width: numberFrom(size.width) ?? numberFrom(value.width) ?? numberFrom(asset.width) ?? 1024,
      height: numberFrom(size.height) ?? numberFrom(value.height) ?? numberFrom(asset.height) ?? 1024
    },
    quality: galleryQualityFrom(value.quality),
    outputFormat: galleryOutputFormatFrom(value.outputFormat ?? value.output_format),
    model: stringFrom(value.model) || undefined,
    modelConfigId: stringFrom(value.modelConfigId ?? value.model_config_id) || undefined,
    modelProvider: stringFrom(value.modelProvider ?? value.model_provider) || undefined,
    modelDisplayName: stringFrom(value.modelDisplayName ?? value.model_display_name) || undefined,
    createdAt: stringFrom(value.createdAt ?? value.created_at),
    asset: {
      id: assetId,
      url: stringFrom(asset.url) || `/api/assets/${encodeURIComponent(assetId)}`,
      cdnUrl: stringFrom(asset.cdnUrl ?? asset.cdn_url) || undefined,
      cdnPreviewUrls: stringRecordFrom(asset.cdnPreviewUrls ?? asset.cdn_preview_urls),
      fileName: stringFrom(asset.fileName ?? asset.file_name) || assetId,
      mimeType: stringFrom(asset.mimeType ?? asset.mime_type) || "image/png",
      width: numberFrom(asset.width) ?? 1024,
      height: numberFrom(asset.height) ?? 1024
    }
  };
}

function parseBillingSettingsForm(value: unknown): BillingSettingsFormState {
  const settings = firstRecord(value, "settings") ?? (isRecord(value) ? value : {});
  return {
    imageUnitPrice: centsToMoneyInput(numberFrom(settings.imageUnitPriceCents ?? settings.singleImagePriceCents) ?? 0),
    currency: stringFrom(settings.currency) || "CNY"
  };
}

function parseStorageConfigForm(value: unknown): StorageConfigFormState {
  const config = isRecord(value) ? value : {};
  const provider: CloudStorageProvider = config.provider === "cos" ? "cos" : "oss";
  if (provider === "cos") {
    const cos = isRecord(config.cos) ? config.cos : {};
    const secret = isRecord(cos.secretKey) ? cos.secretKey : {};
    const hasSecret = booleanFrom(secret.hasSecret, false);
    return {
      enabled: booleanFrom(config.enabled, false),
      provider,
      secretId: stringFrom(cos.secretId),
      secretKey: "",
      secretSaved: hasSecret,
      bucket: stringFrom(cos.bucket) || "source-1253253332",
      region: stringFrom(cos.region) || "ap-nanjing",
      keyPrefix: stringFrom(cos.keyPrefix) || "gpt-image-canvas/assets"
    };
  }

  const oss = isRecord(config.oss) ? config.oss : {};
  const secret = isRecord(oss.accessKeySecret) ? oss.accessKeySecret : {};
  const hasSecret = booleanFrom(secret.hasSecret, false);
  return {
    enabled: booleanFrom(config.enabled, false),
    provider,
    secretId: stringFrom(oss.accessKeyId),
    secretKey: "",
    secretSaved: hasSecret,
    bucket: stringFrom(oss.bucket),
    region: stringFrom(oss.region) || "oss-cn-hangzhou",
    keyPrefix: stringFrom(oss.keyPrefix) || "gpt-image-canvas/assets"
  };
}

function storageSettingsToPayload(form: StorageConfigFormState, options: { forceEnabled?: boolean } = {}): SaveStorageConfigRequest {
  const preserveSecret = form.secretSaved && !form.secretKey.trim();
  if (form.provider === "cos") {
    return {
      enabled: options.forceEnabled ?? form.enabled,
      provider: "cos",
      cos: {
        secretId: form.secretId.trim(),
        secretKey: preserveSecret ? undefined : form.secretKey,
        preserveSecret,
        bucket: form.bucket.trim(),
        region: form.region.trim(),
        keyPrefix: form.keyPrefix.trim()
      }
    };
  }

  return {
    enabled: options.forceEnabled ?? form.enabled,
    provider: "oss",
    oss: {
      accessKeyId: form.secretId.trim(),
      accessKeySecret: preserveSecret ? undefined : form.secretKey,
      preserveSecret,
      bucket: form.bucket.trim(),
      region: form.region.trim(),
      keyPrefix: form.keyPrefix.trim()
    }
  };
}

function parseReferralSettingsForm(value: unknown): ReferralSettingsFormState {
  const settings = firstRecord(value, "settings") ?? (isRecord(value) ? value : {});
  return {
    enabled: booleanFrom(settings.enabled, true),
    baseRegisterCredits: stringFromNumber(numberFrom(settings.baseRegisterCredits) ?? 2),
    inviterRegisterCredits: stringFromNumber(numberFrom(settings.inviterRegisterCredits) ?? 4),
    inviteeRegisterCredits: stringFromNumber(numberFrom(settings.inviteeRegisterCredits) ?? 6),
    rechargeCashbackRate: bpsToPercentInput(numberFrom(settings.rechargeCashbackRateBps) ?? 500),
    planPurchaseCashbackRate: bpsToPercentInput(numberFrom(settings.planPurchaseCashbackRateBps) ?? 500),
    minCashbackOrderAmount: centsToMoneyInput(numberFrom(settings.minCashbackOrderAmountCents) ?? 100),
    currency: stringFrom(settings.currency) || "CNY"
  };
}

function referralSettingsToPayload(form: ReferralSettingsFormState): Record<string, unknown> {
  return {
    enabled: form.enabled,
    baseRegisterCredits: nullableNumber(form.baseRegisterCredits) ?? 0,
    inviterRegisterCredits: nullableNumber(form.inviterRegisterCredits) ?? 0,
    inviteeRegisterCredits: nullableNumber(form.inviteeRegisterCredits) ?? 0,
    rechargeCashbackRateBps: percentInputToBps(form.rechargeCashbackRate),
    planPurchaseCashbackRateBps: percentInputToBps(form.planPurchaseCashbackRate),
    minCashbackOrderAmountCents: moneyToCents(form.minCashbackOrderAmount) ?? 0,
    currency: form.currency || "CNY"
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

function parseCategoryKitPlannerForms(value: unknown): CategoryKitPlannerModelFormState[] {
  const root = isRecord(value) ? value : {};
  const rawModels = Array.isArray(root.models)
    ? root.models
    : root.config
      ? [root.config]
      : [root];

  const models = rawModels
    .map((item, index) => parseCategoryKitPlannerFormItem(item, index))
    .filter((item): item is CategoryKitPlannerModelFormState => Boolean(item));

  return models.length > 0 ? models : [createCategoryKitPlannerForm("primary", 1)];
}

function parseCategoryKitPlannerFormItem(value: unknown, index: number): CategoryKitPlannerModelFormState | undefined {
  const planner = isRecord(value) ? value : {};
  const enabled = booleanFrom(planner.enabled, true);
  const name = stringFrom(planner.name) || (index === 0 ? "品类套图共享文本模型" : "品类套图备用文本模型");
  const provider = categoryKitPlannerProviderValue(planner.provider, planner.baseUrl);
  const role = stringFrom(planner.role) === "fallback" ? "fallback" : "primary";
  const priority = String(Math.max(1, Math.round(numberFrom(planner.priority) ?? index + 1)));
  const model = stringFrom(planner.model) || defaultCategoryKitPlannerModel(provider);
  if (!name || !model) {
    return undefined;
  }

  return {
    id: stringFrom(planner.id) || `category-kit-planner-${index + 1}`,
    enabled,
    name,
    provider,
    modules: categoryKitPlannerModulesValue(planner.modules),
    role,
    priority,
    apiKey: "",
    apiKeySaved: booleanFrom(planner.apiKeySaved, false),
    baseUrl: stringFrom(planner.baseUrl) || defaultCategoryKitPlannerBaseUrl(provider),
    model,
    timeoutSeconds: String(Math.max(1, Math.round((numberFrom(planner.timeoutMs) ?? 1200000) / 1000)))
  };
}

function categoryKitPlannerToPayload(forms: CategoryKitPlannerModelFormState[]): SaveCategoryKitPlannerConfigRequest {
  return {
    models: forms.map((form, index) => {
      const timeoutSeconds = nullableNumber(form.timeoutSeconds);
      return {
        id: form.id.startsWith("new-") ? undefined : form.id,
        enabled: form.enabled,
        name: form.name,
        provider: form.provider,
        modules: form.modules,
        role: form.role,
        priority: nullableNumber(form.priority) ?? index + 1,
        apiKey: form.apiKey,
        preserveApiKey: !form.apiKey.trim() && form.apiKeySaved,
        baseUrl: form.baseUrl,
        model: form.model,
        timeoutMs: timeoutSeconds !== null && timeoutSeconds > 0 ? Math.round(timeoutSeconds * 1000) : undefined
      };
    })
  };
}

function categoryKitPlannerProviderValue(value: unknown, baseUrl?: unknown): CategoryKitPlannerProvider {
  const provider = stringFrom(value);
  if (provider === "deepseek" || provider === "openai-compatible-chat" || provider === "openai-responses") {
    return provider;
  }
  return stringFrom(baseUrl).toLowerCase().includes("deepseek") ? "deepseek" : "openai-responses";
}

function categoryKitPlannerModulesValue(value: unknown): CategoryKitPlannerModule[] {
  const modules = Array.isArray(value)
    ? value.filter((item): item is CategoryKitPlannerModule => textModelModuleOptions.some((option) => option.id === item))
    : [];
  return modules.length > 0 ? Array.from(new Set(modules)) : textModelModuleOptions.map((option) => option.id);
}

function defaultCategoryKitPlannerBaseUrl(provider: CategoryKitPlannerProvider): string {
  return provider === "deepseek" ? "https://api.deepseek.com" : "https://api.openai.com/v1";
}

function defaultCategoryKitPlannerModel(provider: CategoryKitPlannerProvider): string {
  if (provider === "deepseek") {
    return "deepseek-v4-flash";
  }
  return "gpt-5.5";
}

function categoryKitPlannerProviderPatch(provider: CategoryKitPlannerProvider): Partial<CategoryKitPlannerModelFormState> {
  return {
    provider,
    name: provider === "deepseek" ? "DeepSeek 文本模型" : provider === "openai-compatible-chat" ? "OpenAI 兼容 Chat 文本模型" : "OpenAI Responses 文本模型",
    baseUrl: defaultCategoryKitPlannerBaseUrl(provider),
    model: defaultCategoryKitPlannerModel(provider)
  };
}

function toggleCategoryKitPlannerModule(
  modules: CategoryKitPlannerModule[],
  module: CategoryKitPlannerModule,
  checked: boolean
): CategoryKitPlannerModule[] {
  const next = checked ? [...modules, module] : modules.filter((item) => item !== module);
  return Array.from(new Set(next));
}

function parseCategoryStrategyForms(value: unknown): CategoryStrategyFormState[] {
  const items = arrayFrom(value, ["strategies", "items"]);
  const source = items.length > 0 ? items : isRecord(value) ? [firstRecord(value, "strategy") ?? firstRecord(value, "item") ?? value] : [];
  return source.map(parseCategoryStrategyForm).filter((item): item is CategoryStrategyFormState => Boolean(item));
}

function parseCategoryStrategyForm(value: unknown, index: number): CategoryStrategyFormState | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const strategyValue = value.strategy ?? value.policy ?? value.content ?? value.rules;
  const imageRoles = Array.isArray(value.imageRoles ?? value.image_roles) ? value.imageRoles ?? value.image_roles : undefined;
  const recommendedFields = Array.isArray(value.recommendedFields ?? value.recommended_fields) ? value.recommendedFields ?? value.recommended_fields : undefined;
  const strategyContent =
    strategyValue === undefined
      ? {
          visualStyle: value.visualStyle ?? value.visual_style,
          copyStyle: value.copyStyle ?? value.copy_style,
          sellingPointLogic: value.sellingPointLogic ?? value.selling_point_logic,
          compositionRules: value.compositionRules ?? value.composition_rules,
          safetyRules: value.safetyRules ?? value.safety_rules,
          outputScenes: value.outputScenes ?? value.output_scenes,
          fallbackRules: value.fallbackRules ?? value.fallback_rules
        }
      : strategyValue;
  const id = stringFrom(value.id ?? value.strategyId ?? value.strategy_id) || `strategy-${index}`;
  return {
    id,
    enabled: booleanFrom(value.enabled ?? value.active, true),
    categoryPath: categoryPathTextFrom(value.categoryPath ?? value.category_path ?? value.path),
    categoryName: stringFrom(value.categoryName ?? value.category_name ?? value.name),
    platform: stringFrom(value.platform) || "all",
    market: stringFrom(value.market) || "global",
    priority: String(numberFrom(value.priority ?? value.sortOrder ?? value.sort_order) ?? index + 1),
    aliasesText: textFromListLike(value.aliases),
    requiredAssetsText: imageRoles ? roleLabelsText(imageRoles) : textFromListLike(value.requiredAssets ?? value.required_assets ?? value.assetRoles ?? value.asset_roles),
    missingChecklistText: recommendedFields ? roleLabelsText(recommendedFields) : textFromListLike(value.missingChecklist ?? value.missing_checklist ?? value.checklist),
    strategyText: stringifyStrategyText(strategyContent),
    notes: stringFrom(value.notes ?? value.note ?? value.description),
    createdAt: stringFrom(value.createdAt ?? value.created_at),
    updatedAt: stringFrom(value.updatedAt ?? value.updated_at)
  };
}

function createCategoryStrategyForm(index: number): CategoryStrategyFormState {
  return {
    id: `new-category-strategy-${crypto.randomUUID()}`,
    enabled: true,
    categoryPath: "",
    categoryName: "",
    platform: "all",
    market: "global",
    priority: String(index + 1),
    aliasesText: "",
    requiredAssetsText: "main\ndetail\npackage",
    missingChecklistText: "尺寸图\n包装图\n材质细节",
    strategyText: "{\n  \"scenePlan\": [],\n  \"promptRules\": []\n}",
    notes: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function categoryStrategyToPayload(form: CategoryStrategyFormState): Record<string, unknown> {
  const strategy = parseStrategyText(form.strategyText);
  return {
    enabled: form.enabled,
    categoryPath: form.categoryPath.trim(),
    categoryName: form.categoryName.trim(),
    platform: form.platform.trim() || "all",
    market: form.market.trim() || "global",
    priority: nullableNumber(form.priority) ?? 0,
    aliases: linesFromText(form.aliasesText),
    requiredAssets: linesFromText(form.requiredAssetsText),
    missingChecklist: linesFromText(form.missingChecklistText),
    strategy,
    notes: form.notes.trim()
  };
}

function stringifyStrategyText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "";
  }
}

function parseStrategyText(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) {
    return {};
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

function textFromListLike(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((item) => stringFrom(item)).filter(Boolean).join("\n");
  }
  return stringFrom(value);
}

function categoryPathTextFrom(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((item) => stringFrom(item)).filter(Boolean).join(" > ");
  }
  return stringFrom(value);
}

function roleLabelsText(value: unknown): string {
  if (!Array.isArray(value)) {
    return "";
  }
  return value
    .map((item) => {
      if (isRecord(item)) {
        return stringFrom(item.label ?? item.title ?? item.name ?? item.id);
      }
      return stringFrom(item);
    })
    .filter(Boolean)
    .join("\n");
}

function linesFromText(value: string): string[] {
  return value
    .split(/[\n,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseSeedanceVideoConfigForm(value: unknown): SeedanceVideoConfigFormState {
  const root = (firstRecord(value, "config") ?? (isRecord(value) ? value : {})) as Partial<SeedanceVideoConfigResponse>;
  const source = stringFrom(root.source);
  return {
    apiKey: "",
    apiKeySaved: booleanFrom(root.apiKeySaved, false),
    baseUrl: stringFrom(root.baseUrl) || DEFAULT_ARK_BASE_URL,
    model: stringFrom(root.model) || DEFAULT_SEEDANCE_MODEL,
    source: source === "saved" || source === "env" ? source : "default"
  };
}

function seedanceVideoConfigToPayload(form: SeedanceVideoConfigFormState): SaveSeedanceVideoConfigRequest {
  return {
    apiKey: form.apiKey,
    preserveApiKey: !form.apiKey.trim() && form.apiKeySaved,
    baseUrl: form.baseUrl,
    model: form.model
  };
}

function parseEcommerceGenerationConcurrencyForm(value: unknown): EcommerceGenerationConcurrencyFormState {
  const root = (firstRecord(value, "config") ?? (isRecord(value) ? value : {})) as Partial<EcommerceGenerationConcurrencyConfigResponse>;
  return {
    globalConcurrency: stringFromNumber(numberFrom(root.globalConcurrency) ?? 6),
    jobConcurrency: stringFromNumber(numberFrom(root.jobConcurrency) ?? 3)
  };
}

function ecommerceGenerationConcurrencyToPayload(
  form: EcommerceGenerationConcurrencyFormState
): SaveEcommerceGenerationConcurrencyConfigRequest {
  return {
    globalConcurrency: Math.max(1, Math.round(nullableNumber(form.globalConcurrency) ?? 6)),
    jobConcurrency: Math.max(1, Math.round(nullableNumber(form.jobConcurrency) ?? 3))
  };
}

function parseExtensionReleaseForm(value: unknown): ExtensionReleaseFormState {
  const root = isRecord(value) ? value : {};
  return {
    dev: parseExtensionReleaseTargetForm(root.dev, "dev"),
    prod: parseExtensionReleaseTargetForm(root.prod, "prod")
  };
}

function parseExtensionReleaseTargetForm(value: unknown, target: "dev" | "prod"): ExtensionReleaseTargetFormState {
  const release = isRecord(value) ? value : {};
  const releaseNotes = Array.isArray(release.releaseNotes) ? release.releaseNotes.filter((item): item is string => typeof item === "string") : [];
  return {
    apiBaseUrl: stringFrom(release.apiBaseUrl) || (target === "dev" ? "https://dev.neimou.com" : "https://ai.neimou.com"),
    version: stringFrom(release.version),
    downloadUrl: stringFrom(release.downloadUrl),
    latestDownloadUrl: stringFrom(release.latestDownloadUrl),
    installHelpUrl: stringFrom(release.installHelpUrl) || "/install-help.html",
    fileName: stringFrom(release.fileName),
    sizeBytes: stringFromNumber(numberFrom(release.sizeBytes)),
    sha256: stringFrom(release.sha256),
    releaseNotesText: releaseNotes.join("\n")
  };
}

function extensionReleaseToPayload(form: ExtensionReleaseFormState): Record<string, unknown> {
  return {
    dev: extensionReleaseTargetToPayload(form.dev),
    prod: extensionReleaseTargetToPayload(form.prod)
  };
}

function extensionReleaseTargetToPayload(form: ExtensionReleaseTargetFormState): Record<string, unknown> {
  return {
    apiBaseUrl: form.apiBaseUrl,
    version: form.version,
    downloadUrl: form.downloadUrl,
    latestDownloadUrl: form.latestDownloadUrl,
    installHelpUrl: form.installHelpUrl,
    fileName: form.fileName,
    sizeBytes: nullableNumber(form.sizeBytes) ?? undefined,
    sha256: form.sha256,
    releaseNotes: splitLines(form.releaseNotesText)
  };
}

function parseAppReleaseForm(value: unknown): AppReleaseFormState {
  const root = isRecord(value) ? value : {};
  return {
    ios: parseAppReleaseTargetForm(root.ios),
    android: parseAppReleaseTargetForm(root.android)
  };
}

function parseAppReleaseTargetForm(value: unknown): AppReleaseTargetFormState {
  const release = isRecord(value) ? value : {};
  const releaseNotes = Array.isArray(release.releaseNotes) ? release.releaseNotes.filter((item): item is string => typeof item === "string") : [];
  return {
    enabled: booleanFrom(release.enabled, false),
    version: stringFrom(release.version),
    buildNumber: stringFrom(release.buildNumber),
    downloadUrl: stringFrom(release.downloadUrl),
    forceUpdate: booleanFrom(release.forceUpdate, false),
    releaseNotesText: releaseNotes.join("\n")
  };
}

function appReleaseToPayload(form: AppReleaseFormState): SaveAppReleaseConfigRequest {
  return {
    ios: appReleaseTargetToPayload(form.ios),
    android: appReleaseTargetToPayload(form.android)
  };
}

function appReleaseTargetToPayload(form: AppReleaseTargetFormState): SaveAppReleaseConfigRequest["ios"] {
  return {
    enabled: form.enabled,
    version: form.version,
    buildNumber: form.buildNumber,
    downloadUrl: form.downloadUrl,
    forceUpdate: form.forceUpdate,
    releaseNotes: splitLines(form.releaseNotesText)
  };
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
    taskCompleteTemplateId: stringFrom(wechat.taskCompleteTemplateId),
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

function parseAliyunSmsForm(value: unknown): AliyunSmsFormState {
  const sms = firstRecord(value, "sms") ?? (isRecord(value) ? value : {});
  return {
    enabled: booleanFrom(sms.enabled, false),
    accessKeyId: stringFrom(sms.accessKeyId),
    accessKeySecret: "",
    accessKeySecretSaved: booleanFrom(sms.accessKeySecretSaved, false),
    endpoint: stringFrom(sms.endpoint) || "dysmsapi.aliyuncs.com",
    signName: stringFrom(sms.signName),
    registerTemplateCode: stringFrom(sms.registerTemplateCode),
    bindTemplateCode: stringFrom(sms.bindTemplateCode)
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
    quotaAfter: numberFrom(item.quotaAfter ?? item.quota_after),
    quotaCount: numberFrom(item.quotaCount ?? item.quota_count),
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

function seedanceConfigSourceLabel(source: SeedanceVideoConfigResponse["source"]): string {
  if (source === "saved") return "后台配置";
  if (source === "env") return "环境变量";
  return "默认配置";
}

function ownerLabel(item: Pick<AdminJobRow, "userDisplayName" | "userEmail" | "userId">): string {
  const displayName = item.userDisplayName?.trim();
  const email = item.userEmail?.trim();
  if (displayName && email && displayName !== email) {
    return `${displayName} · ${email}`;
  }
  return displayName || email || item.userId || "-";
}

function galleryOwnerLabel(item: Pick<GalleryImageItem, "userDisplayName" | "userEmail" | "userId">): string {
  const displayName = item.userDisplayName?.trim();
  const email = item.userEmail?.trim();
  if (displayName && email && displayName !== email) {
    return `${displayName} · ${email}`;
  }
  return displayName || email || item.userId || "-";
}

function galleryPromptExcerpt(prompt: string): string {
  const compact = prompt.replace(/\s+/gu, " ").trim();
  return compact.length > 96 ? `${compact.slice(0, 96)}...` : compact || "-";
}

function galleryAssetPreviewUrl(item: GalleryImageItem): string {
  if (isGalleryVideoItem(item)) {
    return item.asset.cdnUrl || (/^data:|^https?:\/\//iu.test(item.asset.url) || item.asset.url.startsWith("/api/public/") ? item.asset.url : authenticatedAssetUrl(`/api/assets/${encodeURIComponent(item.asset.id)}`));
  }

  return (
    previewUrlForWidth(item.asset.cdnPreviewUrls, 256) ||
    item.asset.cdnUrl ||
    (/^data:|^https?:\/\//iu.test(item.asset.url) || item.asset.url.startsWith("/api/public/")
      ? item.asset.url
      : authenticatedAssetUrl(`/api/assets/${encodeURIComponent(item.asset.id)}/preview?width=256`))
  );
}

function isGalleryVideoItem(item: GalleryImageItem): boolean {
  return item.asset.mimeType.toLowerCase().startsWith("video/");
}

function adminPreviewImageUrl(url: string): string {
  return url.startsWith("/api/assets/") ? authenticatedAssetUrl(url) : url;
}

function authenticatedAssetUrl(url: string): string {
  if (/^data:|^https?:\/\//iu.test(url)) {
    return url;
  }

  const token = getStoredAuthToken();
  if (!token) {
    return url;
  }

  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}token=${encodeURIComponent(token)}`;
}

function previewUrlForWidth(previewUrls: Record<string, string> | undefined, preferredWidth: number): string | undefined {
  if (!previewUrls) {
    return undefined;
  }

  const widths = Object.keys(previewUrls)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  const selectedWidth = widths.find((width) => width >= preferredWidth) ?? widths[widths.length - 1];
  return selectedWidth ? previewUrls[String(selectedWidth)] : undefined;
}

function stringRecordFrom(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const entries = Object.entries(value)
    .map(([key, item]) => [key, stringFrom(item)] as const)
    .filter(([, item]) => Boolean(item));
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function galleryQualityFrom(value: unknown): GalleryImageItem["quality"] {
  const quality = stringFrom(value);
  return quality === "low" || quality === "medium" || quality === "high" || quality === "auto" ? quality : "auto";
}

function galleryOutputFormatFrom(value: unknown): GalleryImageItem["outputFormat"] {
  const outputFormat = stringFrom(value);
  return outputFormat === "jpeg" || outputFormat === "png" || outputFormat === "webp" || outputFormat === "mp4" ? outputFormat : "png";
}

function demoStylePresetValue(value: unknown): StylePresetId {
  const presetId = stringFrom(value);
  return demoStylePresetOptions.some((option) => option.value === presetId) ? (presetId as StylePresetId) : "product";
}

function demoQualityValue(value: unknown): ImageQuality {
  const quality = stringFrom(value);
  return demoQualityOptions.some((option) => option.value === quality) ? (quality as ImageQuality) : "auto";
}

function demoOutputFormatValue(value: unknown): OutputFormat {
  const outputFormat = stringFrom(value);
  return demoOutputFormatOptions.some((option) => option.value === outputFormat) ? (outputFormat as OutputFormat) : "png";
}

const NEW_PLAN_ID = "__new_plan__";

function createBillingSettingsForm(): BillingSettingsFormState {
  return {
    imageUnitPrice: "0",
    currency: "CNY"
  };
}

function createRedemptionCodeForm(): RedemptionCodeFormState {
  return {
    count: "10",
    maxRedemptions: "1",
    quota: "20",
    validDays: "30",
    customCodes: "",
    codePrefix: "",
    note: ""
  };
}

function createStorageConfigForm(provider: CloudStorageProvider = "oss"): StorageConfigFormState {
  return provider === "cos"
    ? {
        enabled: false,
        provider: "cos",
        secretId: "",
        secretKey: "",
        secretSaved: false,
        bucket: "source-1253253332",
        region: "ap-nanjing",
        keyPrefix: "gpt-image-canvas/assets"
      }
    : {
        enabled: false,
        provider: "oss",
        secretId: "",
        secretKey: "",
        secretSaved: false,
        bucket: "",
        region: "oss-cn-hangzhou",
        keyPrefix: "gpt-image-canvas/assets"
      };
}

function createReferralSettingsForm(): ReferralSettingsFormState {
  return {
    enabled: true,
    baseRegisterCredits: "2",
    inviterRegisterCredits: "4",
    inviteeRegisterCredits: "6",
    rechargeCashbackRate: "5",
    planPurchaseCashbackRate: "5",
    minCashbackOrderAmount: "1",
    currency: "CNY"
  };
}

function createEcommerceGenerationConcurrencyForm(): EcommerceGenerationConcurrencyFormState {
  return {
    globalConcurrency: "6",
    jobConcurrency: "3"
  };
}

function createSeedanceVideoConfigForm(): SeedanceVideoConfigFormState {
  return {
    apiKey: "",
    apiKeySaved: false,
    baseUrl: DEFAULT_ARK_BASE_URL,
    model: DEFAULT_SEEDANCE_MODEL,
    source: "default"
  };
}

function createCategoryKitPlannerForm(role: CategoryKitPlannerModelRole, index: number): CategoryKitPlannerModelFormState {
  return {
    id: `new-${Date.now()}-${index}`,
    enabled: true,
    name: role === "fallback" ? "品类套图备用文本模型" : "品类套图共享文本模型",
    provider: "openai-responses",
    modules: textModelModuleOptions.map((option) => option.id),
    role,
    priority: String(index),
    apiKey: "",
    apiKeySaved: false,
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-5.5",
    timeoutSeconds: "1200"
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

function createExtensionReleaseForm(): ExtensionReleaseFormState {
  return {
    dev: {
      apiBaseUrl: "https://dev.neimou.com",
      version: "",
      downloadUrl: "",
      latestDownloadUrl: "",
      installHelpUrl: "/install-help.html",
      fileName: "kuajing-image-extension-dev-latest.zip",
      sizeBytes: "",
      sha256: "",
      releaseNotesText: "优化插件体验并修复已知问题。"
    },
    prod: {
      apiBaseUrl: "https://ai.neimou.com",
      version: "",
      downloadUrl: "",
      latestDownloadUrl: "",
      installHelpUrl: "/install-help.html",
      fileName: "kuajing-image-extension-prod-latest.zip",
      sizeBytes: "",
      sha256: "",
      releaseNotesText: "优化插件体验并修复已知问题。"
    }
  };
}

function createAppReleaseForm(): AppReleaseFormState {
  return {
    ios: {
      enabled: false,
      version: "",
      buildNumber: "",
      downloadUrl: "",
      forceUpdate: false,
      releaseNotesText: "优化 App 体验并修复已知问题。"
    },
    android: {
      enabled: false,
      version: "",
      buildNumber: "",
      downloadUrl: "",
      forceUpdate: false,
      releaseNotesText: "优化 App 体验并修复已知问题。"
    }
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
    taskCompleteTemplateId: "",
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

function createAliyunSmsForm(): AliyunSmsFormState {
  return {
    enabled: false,
    accessKeyId: "",
    accessKeySecret: "",
    accessKeySecretSaved: false,
    endpoint: "dysmsapi.aliyuncs.com",
    signName: "",
    registerTemplateCode: "",
    bindTemplateCode: ""
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
    phone: "",
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

function redemptionCodeFormToPayload(form: RedemptionCodeFormState): Record<string, unknown> | null {
  const codes = redemptionCodesFromText(form.customCodes);
  const count = codes.length > 0 ? codes.length : nullableNumber(form.count);
  const maxRedemptions = nullableNumber(form.maxRedemptions);
  const quota = nullableNumber(form.quota);
  const validDays = nullableNumber(form.validDays);
  if (!count || !maxRedemptions || !quota || !validDays) {
    return null;
  }
  return {
    count,
    maxRedemptions,
    quota,
    validDays,
    codes: codes.length > 0 ? codes : undefined,
    codePrefix: codes.length > 0 ? undefined : form.codePrefix.trim() || undefined,
    note: form.note.trim() || undefined
  };
}

function redemptionCodesFromText(value: string): string[] {
  return value.split(/[\s,，;；]+/u).map((code) => code.trim().toUpperCase()).filter(Boolean);
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
  if (type === "redemption_code") return "兑换码";
  if (type === "redemption_code_expiration") return "兑换码到期";
  if (type === "referral_register_quota") return "邀请注册奖励";
  if (type === "referral_cashback") return "邀请订单返现";
  return type || "-";
}

function rewardQuotaCount(item: BillingTransactionRow): string {
  const count = item.quotaCount ?? item.imageCount ?? 0;
  return count > 0 ? `${count} 张` : "-";
}

function rewardBalanceOrQuotaAfter(item: BillingTransactionRow): string {
  if (item.type === "referral_register_quota" && typeof item.quotaAfter === "number") {
    return `${item.quotaAfter.toLocaleString("zh-CN")} 张`;
  }
  if (item.amountCents) {
    return formatMoney(item.balanceAfterCents ?? 0, item.currency);
  }
  return "-";
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

function formatDate(value: string): string {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) {
    return "-";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
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

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) {
    return "0%";
  }
  return `${Number(value.toFixed(2))}%`;
}

function formatOptionalPercent(value: number | undefined): string {
  return typeof value === "number" ? formatPercent(value) : "读取中";
}

function formatCreditReward(value: number | undefined): string {
  return typeof value === "number" ? `${value.toLocaleString("zh-CN")} 张` : "读取中";
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

function bpsToPercentInput(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }
  return String(Number((value / 100).toFixed(2)));
}

function percentInputToBps(value: string): number {
  const numericValue = nullableNumber(value);
  return numericValue === null ? 0 : Math.round(numericValue * 100);
}
