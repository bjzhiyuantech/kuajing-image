import { useEffect } from "react";
import { BRAND_NAME } from "./Brand";

const effectiveDate = "2026-05-16";

const summaryItems = [
  "你点击同意或继续使用服务，即表示你已阅读并接受本协议。",
  "你应确保上传、输入和生成的内容来源合法，不侵犯他人权益。",
  "平台功能、额度和规则可能随服务升级调整，以页面展示和实际规则为准。"
] as const;

const agreementSections = [
  {
    title: "一、协议范围",
    paragraphs: [
      `本协议适用于你访问和使用 ${BRAND_NAME} App、网页端、小程序、浏览器插件及相关服务。你点击同意或实际使用本服务，即表示你已阅读、理解并接受本协议。`
    ]
  },
  {
    title: "二、服务内容",
    paragraphs: [
      `${BRAND_NAME} 提供电商图片生成、图片处理、翻译、去水印、任务记录、会员额度和账户资料管理等功能。具体功能、可用范围和服务规则以页面展示及后台记录为准。`
    ]
  },
  {
    title: "三、账号与安全",
    paragraphs: [
      "你应使用真实、合法、有效的信息注册或登录，并妥善保管账号、密码、验证码和登录状态。因你主动泄露、共享账号或保管不当导致的损失，由你自行承担。"
    ]
  },
  {
    title: "四、素材与内容规范",
    paragraphs: [
      "你应确保上传、输入、生成、保存或发布的图片、文字、商品信息等内容来源合法，不侵犯他人的知识产权、肖像权、名誉权、隐私权及其他合法权益，不包含违法违规、侵权、虚假或误导性内容。"
    ]
  },
  {
    title: "五、生成结果与使用",
    paragraphs: [
      "你理解，AI 生成或处理结果可能存在偏差、不完整或不符合预期的情况。你在商业使用前应自行核验生成结果的准确性、合规性和适用性，并承担使用该结果产生的相应责任。"
    ]
  },
  {
    title: "六、会员、额度与费用",
    paragraphs: [
      "部分功能可能消耗会员额度、试用额度或账户余额。额度发放、消耗、有效期、退款及开票规则以页面说明、订单记录和实际服务规则为准。"
    ]
  },
  {
    title: "七、禁止行为",
    paragraphs: [
      "你不得利用本服务从事违法违规、侵害他人权益、破坏系统安全、干扰服务运行、恶意注册、批量滥用、倒卖账号或额度等行为。我们有权根据违规情况采取限制功能、暂停服务或终止账号等措施。"
    ]
  },
  {
    title: "八、协议变更与联系",
    paragraphs: [
      "我们可能根据业务调整、法律法规或平台规则变化更新本协议，并在 App、网页端或相关页面展示。若你对本协议或服务有疑问，可通过 App 内客服或官方联系方式与我们联系。"
    ]
  }
] as const;

export function AgreementPage() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${BRAND_NAME} 用户协议`;
    return () => {
      document.title = previousTitle;
    };
  }, []);

  return (
    <main className="legal-policy-page app-view">
      <article className="legal-policy">
        <header className="legal-policy__hero">
          <a className="legal-policy__brand" href="/" aria-label={`返回 ${BRAND_NAME} 首页`}>
            {BRAND_NAME}
          </a>
          <p className="legal-policy__eyebrow">Terms of Service</p>
          <h1>用户协议</h1>
          <p className="legal-policy__lead">
            这是 {BRAND_NAME} 的服务使用协议，说明账号、内容、生成和使用规则。
          </p>
          <dl className="legal-policy__meta">
            <div>
              <dt>生效日期</dt>
              <dd>{effectiveDate}</dd>
            </div>
            <div>
              <dt>适用产品</dt>
              <dd>{BRAND_NAME} App / 网页端 / 小程序 / 浏览器插件</dd>
            </div>
          </dl>
        </header>

        <section className="legal-policy__summary" aria-label="用户协议摘要">
          {summaryItems.map((item) => (
            <p key={item}>{item}</p>
          ))}
        </section>

        {agreementSections.map((section) => (
          <section className="legal-policy__section" key={section.title}>
            <h2>{section.title}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </section>
        ))}
      </article>
    </main>
  );
}
