import { useEffect } from "react";
import serviceDomains from "../../../config/service-domains.json";
import { BRAND_NAME } from "./Brand";

const effectiveDate = "2026-05-16";
const SUPPORT_URL = `${serviceDomains.prodApiBaseUrl}/support`;

const summaryItems = [
  "我们仅为提供账号登录、图片生成、任务管理、额度/订单、开票和客服支持等服务处理必要信息。",
  "用户上传的图片、输入的文字、商品资料和生成结果属于用户内容，我们不会出售用户个人信息。",
  "你可以在 App 内查看、更正资料，也可以通过账号资料页申请注销账号；注销后半年内无法重新注册同一账号标识。"
] as const;

const policySections = [
  {
    title: "一、适用范围",
    paragraphs: [
      `本隐私政策适用于你访问和使用 ${BRAND_NAME} App、网页端、小程序、浏览器插件及相关服务时，我们对个人信息的收集、使用、保存、共享和保护。`,
      `${BRAND_NAME} 是面向电商和跨境运营的 AI 商品图生成工具，主要提供商品图上传、AI 图片生成、图片翻译、去水印、任务记录、作品管理、会员额度、订单开票和客服支持等功能。`
    ]
  },
  {
    title: "二、我们可能收集的信息",
    paragraphs: [
      "账号信息：手机号、邮箱、昵称、登录凭证、验证码校验结果、账号状态、注册时间、最近登录时间等。",
      "用户内容：你主动上传或输入的图片、文字、商品标题、商品描述、品类、平台、目标市场、生成参数、生成结果和任务记录。",
      "交易与权益信息：会员套餐、额度余额、额度消耗记录、订单记录、支付状态、开票抬头、税号、接收邮箱、联系电话等。",
      "设备与日志信息：设备类型、操作系统、网络状态、IP 地址、浏览器或 App 版本、错误日志、接口调用记录、功能使用记录等。"
    ]
  },
  {
    title: "三、信息使用目的",
    paragraphs: [
      "我们会将上述信息用于账号注册与登录、身份验证、图片生成与处理、任务进度展示、历史记录同步、会员额度扣减、订单与开票管理、安全风控、故障排查、客服沟通、产品优化和履行法律法规要求。",
      "当你使用 AI 生成、图片翻译、去水印、品类图包等功能时，我们会根据你提交的图片、文字和参数处理生成任务，并将结果保存到你的账号或任务记录中，便于你查看、下载和复用。"
    ]
  },
  {
    title: "四、系统权限与授权",
    paragraphs: [
      "相册/照片权限：用于选择商品参考图、读取待处理图片，以及在你主动操作时保存生成结果到系统相册。",
      "相机权限：用于你主动拍摄商品参考图。",
      "网络权限：用于登录、上传素材、提交生成任务、接收任务结果、同步账号额度和联系服务端。",
      "你可以拒绝或撤回相关权限授权，但对应功能可能无法正常使用。"
    ]
  },
  {
    title: "五、第三方服务与共享",
    paragraphs: [
      "为完成图片生成、图片处理、翻译、云存储、短信验证码、支付、消息通知、故障分析和安全风控等必要服务，我们可能向合作服务方提供实现功能所需的最少信息。",
      "我们会要求合作方按照约定、隐私政策和法律法规保护你的信息。未经你的同意，我们不会向无关第三方出售你的个人信息。"
    ]
  },
  {
    title: "六、存储与保护",
    paragraphs: [
      "我们会在实现处理目的所需的期限内保存你的个人信息。若法律法规、平台规则、争议处理、财务审计或安全风控要求更长保存期限，我们会按照必要范围继续保存。",
      "我们会采取传输加密、访问控制、权限隔离、日志审计、备份恢复和安全监控等合理措施保护数据安全。互联网环境并非绝对安全，我们会尽力降低信息泄露、损毁、丢失或被滥用的风险。"
    ]
  },
  {
    title: "七、账号注销与保留",
    paragraphs: [
      "你可以在 App 的“我的 - 账号资料 - 账号注销”中提交注销请求。注销后，账号将进入已注销状态，暂时无法登录。",
      "为防止恶意注册、重复领取试用权益、欺诈和安全风险，我们会保留必要的基础账号标识、注销时间、注销状态和风控记录；注销后半年内无法使用同一账号标识重新注册。超过保留期限后，我们会在满足法律法规和业务安全要求的前提下继续最小化处理相关信息。"
    ]
  },
  {
    title: "八、你的隐私选择与权利",
    id: "privacy-choices",
    paragraphs: [
      "你可以在 App 内查看或修改账号资料、管理相册/相机等系统权限、退出登录或申请注销账号。",
      "如需访问、更正、复制、删除个人信息，或撤回授权、限制处理、咨询隐私问题，可以通过 App 内“我的 - 联系我们”添加企业微信客服并提交请求。我们会在合理期限内处理你的请求。",
      "如果你认为我们的个人信息处理行为损害了你的合法权益，也可以通过上述联系方式与我们沟通。"
    ]
  },
  {
    title: "九、未成年人保护",
    paragraphs: [
      "本服务主要面向具备商品素材制作需求的成年用户。若你为未成年人，应在监护人同意和指导下使用本服务。",
      "我们不会主动面向未成年人收集非必要个人信息；如监护人发现未成年人信息被不当处理，可通过客服联系我们处理。"
    ]
  },
  {
    title: "十、政策更新与联系",
    paragraphs: [
      "我们可能根据服务变化、法律法规或平台规则更新本隐私政策，并在 App、网页端或相关页面展示更新后的版本。重大变更会以适当方式提示你。",
      `如你对本隐私政策或个人信息处理有疑问，可在 ${BRAND_NAME} App 内通过“我的 - 联系我们”添加企业微信客服，或访问 ${SUPPORT_URL} 获取支持入口。`
    ]
  }
] as const;

export function PrivacyPolicyPage() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${BRAND_NAME} 隐私政策`;
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
          <p className="legal-policy__eyebrow">Privacy Policy</p>
          <h1>隐私政策</h1>
          <p className="legal-policy__lead">
            我们重视你的个人信息和用户内容安全。本政策说明我们如何处理与 {BRAND_NAME} 服务相关的信息。
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

        <section className="legal-policy__summary" aria-label="隐私政策摘要">
          {summaryItems.map((item) => (
            <p key={item}>{item}</p>
          ))}
        </section>

        {policySections.map((section) => (
          <section className="legal-policy__section" id={"id" in section ? section.id : undefined} key={section.title}>
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
