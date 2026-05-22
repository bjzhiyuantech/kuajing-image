import {
  CreditCard,
  ExternalLink,
  FileText,
  HelpCircle,
  Mail,
  MessageCircle,
  RefreshCcw,
  ShieldCheck,
  UserX
} from "lucide-react";
import { useEffect } from "react";
import { BRAND_NAME } from "./Brand";

const supportEmail = "support@neimou.com";
const effectiveDate = "2026-05-20";

const contactChannels = [
  {
    title: "App 内客服",
    description: "打开 App 后进入“我的 - 联系我们”，添加企业微信客服并提交你的账号、订单号或任务截图。",
    actionLabel: "打开网页端",
    actionHref: "/",
    icon: MessageCircle
  },
  {
    title: "支持邮箱",
    description: "适合退款、隐私、注销、订单核对等需要补充材料的问题。邮件里请写明注册手机号或邮箱。",
    actionLabel: supportEmail,
    actionHref: `mailto:${supportEmail}`,
    icon: Mail
  },
  {
    title: "协议与政策",
    description: "查看服务协议、隐私政策和个人信息选择说明，了解账号、内容和数据处理规则。",
    actionLabel: "查看隐私政策",
    actionHref: "/privacy",
    icon: FileText
  }
] as const;

const quickGuides = [
  {
    title: "退款说明",
    icon: RefreshCcw,
    paragraphs: [
      "如遇重复支付、支付成功但权益未到账、服务异常导致无法使用等情况，请通过 App 内客服或支持邮箱提交退款申请。",
      "提交时建议附上订单号、支付时间、支付渠道截图和问题说明。我们会核对订单、额度消耗、服务记录和平台规则后处理。",
      "已实际消耗的生成额度、已经完成交付的服务，以及平台或支付渠道明确不支持退款的订单，可能无法全额退款。"
    ]
  },
  {
    title: "订阅与会员",
    icon: CreditCard,
    paragraphs: [
      "会员、套餐、余额和额度以账号内页面展示及订单记录为准。部分功能会消耗会员额度、试用额度或账户余额。",
      "如需查询权益到账、套餐有效期、额度扣减或发票，请提供账号信息和订单号，客服会协助核对。",
      "如果你通过 App Store、第三方支付或平台内购开通服务，取消自动续费或退款可能需要在对应平台完成。"
    ]
  },
  {
    title: "隐私与数据",
    icon: ShieldCheck,
    paragraphs: [
      "我们仅为提供账号登录、图片生成、任务管理、额度订单、开票和客服支持等服务处理必要信息。",
      "你可以在 App 内查看或修改资料、管理系统权限，或通过客服提出访问、更正、复制、删除个人信息、撤回授权等请求。",
      "完整规则请阅读隐私政策；涉及身份核验或账号安全的请求，客服可能需要你补充必要证明材料。"
    ]
  },
  {
    title: "账号注销",
    icon: UserX,
    paragraphs: [
      "你可以在 App 的“我的 - 账号资料 - 账号注销”中提交注销请求。注销后账号将进入已注销状态，暂时无法登录。",
      "为防止恶意注册、重复领取试用权益、欺诈和安全风险，我们会保留必要的基础账号标识、注销时间、注销状态和风控记录。",
      "注销后半年内无法使用同一账号标识重新注册；超过保留期限后，我们会在满足法律法规和业务安全要求的前提下继续最小化处理相关信息。"
    ]
  }
] as const;

const faqs = [
  {
    question: "生成任务一直没有结果怎么办？",
    answer: "请先刷新任务记录或重新登录查看。如果仍然异常，请把任务时间、提示词、参考图数量和页面截图发给客服，我们会核对任务状态和额度扣减情况。"
  },
  {
    question: "支付成功但会员或额度没有到账怎么办？",
    answer: "请保留支付截图和订单号，通过 App 内客服或支持邮箱联系我们。客服会核对支付渠道回调、账号归属和订单状态。"
  },
  {
    question: "生成结果不符合预期可以退款吗？",
    answer: "AI 生成结果可能存在偏差。若属于服务异常、重复扣费或权益未到账，我们会按订单记录协助处理；若任务已正常完成并消耗额度，通常不支持仅因主观效果不满意而退款。"
  },
  {
    question: "如何开票？",
    answer: "在账号或订单相关页面提交开票信息；如页面暂未覆盖你的订单场景，请联系支持邮箱并提供订单号、发票抬头、税号和接收邮箱。"
  },
  {
    question: "如何修改或删除个人信息？",
    answer: "你可以先在 App 内修改账号资料。需要访问、更正、复制、删除个人信息或撤回授权时，请通过 App 内“我的 - 联系我们”或支持邮箱提交请求。"
  },
  {
    question: "账号注销后还能恢复吗？",
    answer: "账号完成注销后将无法登录，且半年内无法使用同一账号标识重新注册。提交注销前，请确认已处理订单、余额、发票、生成记录和需要保存的素材。"
  }
] as const;

export function SupportPage() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${BRAND_NAME} 支持中心`;
    return () => {
      document.title = previousTitle;
    };
  }, []);

  return (
    <main className="support-page app-view">
      <section className="support-hero">
        <div className="support-hero__copy">
          <a className="support-hero__brand" href="/" aria-label={`返回 ${BRAND_NAME} 首页`}>
            {BRAND_NAME}
          </a>
          <p className="support-eyebrow">Support</p>
          <h1>需要帮助时，从这里开始</h1>
          <p>
            这里汇总了联系方式、常见问题，以及退款、订阅、隐私和账号注销说明。提交问题时带上账号、订单号或截图，能更快定位。
          </p>
        </div>
        <dl className="support-hero__meta" aria-label="支持信息">
          <div>
            <dt>服务范围</dt>
            <dd>App / 网页端 / 小程序 / 浏览器插件</dd>
          </div>
          <div>
            <dt>页面更新</dt>
            <dd>{effectiveDate}</dd>
          </div>
        </dl>
      </section>

      <section className="support-section" aria-labelledby="support-contact-title">
        <div className="support-section__heading">
          <p className="support-eyebrow">Contact</p>
          <h2 id="support-contact-title">联系方式</h2>
        </div>
        <div className="support-contact-grid">
          {contactChannels.map((channel) => {
            const Icon = channel.icon;
            return (
              <article className="support-contact-card" key={channel.title}>
                <span className="support-contact-card__icon" aria-hidden="true">
                  <Icon className="size-5" />
                </span>
                <h3>{channel.title}</h3>
                <p>{channel.description}</p>
                <a href={channel.actionHref}>
                  {channel.actionLabel}
                  <ExternalLink className="size-4" aria-hidden="true" />
                </a>
              </article>
            );
          })}
        </div>
      </section>

      <section className="support-section" aria-labelledby="support-guide-title">
        <div className="support-section__heading">
          <p className="support-eyebrow">Guides</p>
          <h2 id="support-guide-title">退款、订阅、隐私与注销说明</h2>
        </div>
        <div className="support-guide-list">
          {quickGuides.map((guide) => {
            const Icon = guide.icon;
            return (
              <article className="support-guide" key={guide.title}>
                <div className="support-guide__title">
                  <span aria-hidden="true">
                    <Icon className="size-5" />
                  </span>
                  <h3>{guide.title}</h3>
                </div>
                {guide.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </article>
            );
          })}
        </div>
      </section>

      <section className="support-section" aria-labelledby="support-faq-title">
        <div className="support-section__heading">
          <p className="support-eyebrow">FAQ</p>
          <h2 id="support-faq-title">常见问题</h2>
        </div>
        <div className="support-faq-list">
          {faqs.map((faq) => (
            <details className="support-faq" key={faq.question}>
              <summary>
                <HelpCircle className="size-5" aria-hidden="true" />
                <span>{faq.question}</span>
              </summary>
              <p>{faq.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="support-final" aria-label="提交问题前准备">
        <h2>提交问题前，建议准备这些信息</h2>
        <p>注册手机号或邮箱、订单号、支付截图、任务时间、问题截图、你期望客服协助处理的结果。</p>
        <a href={`mailto:${supportEmail}`}>
          联系支持邮箱
          <Mail className="size-4" aria-hidden="true" />
        </a>
      </section>
    </main>
  );
}
