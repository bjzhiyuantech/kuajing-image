# 商图 AI 多交付形态改造方案

## 背景

当前系统已经形成一套完整产品能力：Web 工作台、API 服务、浏览器插件、小程序、移动 App、拆件与电商套图生成、视频生成、通知、计费、版本更新等。下一阶段目标不是拆成三套产品，而是把这些能力整理成一套可复用的平台内核，再通过不同运行配置交付为单机版、私有化云端版和 SaaS 版。

## 改造目标

1. 一套核心业务能力支撑三种交付形态：单机版、私有化云端版、SaaS 版。
2. Web、插件、小程序、App 尽量共用同一套 API 合约和业务语义，减少重复实现。
3. 存储、模型、队列、鉴权、支付、通知、授权等基础设施通过适配器切换。
4. 不同版本通过能力清单控制功能显隐，不在业务代码中散落大量版本判断。
5. 每种部署形态都有独立配置、部署脚本、验收命令和回滚方式。

## 三种交付形态

| 形态 | 交付对象 | 包含能力 | 关键边界 |
| --- | --- | --- | --- |
| 单机版 | 小团队、本地部署客户 | Desktop/Web、本地 API、本地 Worker、拆件、生图、素材管理 | 不包含 App；默认本地数据库和本地文件，可配置 OSS/模型服务 |
| 私有化云端版 | 企业客户、数据敏感客户 | Web、Desktop、插件、App、小程序可选、API、Worker、模型网关 | 与 SaaS 同构部署，但连接客户自己的存储、模型、账号体系和域名 |
| SaaS 版 | 标准线上客户 | 全功能官方托管 | 官方账号、计费、存储、模型、通知、监控和灰度发布 |

## 目标架构

```text
clients/
  web / desktop / extension / miniprogram / mobile-app
        |
        v
api-contracts + sdk
        |
        v
api gateway / bff
        |
        v
core domain
  project / asset / category-kit / generation / video / billing / notification
        |
        v
adapters
  storage / model / queue / auth / billing / notification / license
        |
        v
deployment profiles
  local / private-cloud / saas
```

## 代码边界

### 核心业务层

保留项目、素材、拆件、套图规划、生图任务、视频分镜、计费权益、通知状态等业务规则。核心业务层不能直接依赖某个部署形态，也不能直接读写具体云厂商 SDK。

### API 合约层

以 `packages/shared` 作为 Web、API、插件、小程序、App 对齐的类型来源。后续需要补一个面向移动端和插件的轻量 SDK，统一 token、错误码、分页、上传、任务轮询和版本更新逻辑。

### 适配器层

建议优先抽出这些接口：

- `StorageProvider`：local、OSS、COS、S3、MinIO。
- `ModelProvider`：官方 OpenAI、OpenAI-compatible、DeepSeek、私有模型服务、本地模型服务。
- `QueueProvider`：local queue、Redis queue、server worker queue。
- `AuthProvider`：本地账号、SaaS JWT、企业 SSO。
- `BillingProvider`：SaaS 支付、Apple IAP、私有化授权、单机 license。
- `NotificationProvider`：站内通知、APNs、个推、微信模板消息。

### 能力清单

新增 `capabilities` 配置，而不是到处写版本判断：

```ts
{
  edition: "local" | "private-cloud" | "saas",
  app: boolean,
  miniprogram: boolean,
  plugin: boolean,
  billing: boolean,
  appleIap: boolean,
  privateModel: boolean,
  localStorage: boolean,
  cloudStorage: boolean,
  license: boolean
}
```

UI 和 API 都基于能力清单显隐或拒绝不可用能力。

## 仓库与目录策略

当前工作区实际是多仓库组合：

- `kuajing-image`：平台主仓，包含 API、Web、插件、小程序、共享类型、部署脚本。
- `shangtu-mobile-app`：移动端 App 仓库，包含 Expo/React Native 代码和原生 iOS/Android 工程。

短期保持两个仓库，使用同名分支联动开发。中期再评估是否迁入 monorepo。现在不建议贸然合并仓库，因为 App 原生构建产物、签名、CI、发布节奏与平台服务明显不同。

## 分阶段落地

### Phase 0：基线固化

- 将当前平台主仓和 App 仓库分别提交并推送到 `main`。
- 从基线创建 `codex/deployment-modes-refactor` 分支。
- 确认 `.env`、密钥、安装包、Pods、Gradle 缓存、build/dist 不进 Git。

### Phase 1：配置与能力清单

- 新增统一 edition/profile 配置 schema。
- 在 API 启动时加载 `local`、`private-cloud`、`saas` profile。
- Web/插件/小程序/App 获取服务端 capabilities，并据此显示入口。
- 把 App、小程序、插件相关能力从硬编码判断迁到 capabilities。

### Phase 2：基础设施适配器

- 先抽 storage、model、notification 三类适配器。
- 存储从当前配置扩展为 local/OSS/COS/S3/MinIO。
- 模型从当前 OpenAI-compatible 配置扩展为 official/private/local endpoint。
- 通知统一站内、APNs、个推、微信模板消息的投递状态。

### Phase 3：私有化云端版

- 整理 Docker Compose 和 blue-green 部署变量。
- 明确 MySQL/PostgreSQL、Redis、对象存储、模型网关、域名证书配置。
- 提供私有化安装清单、升级脚本和健康检查。

### Phase 4：单机版

- 设计 Desktop shell：本地前端 + 本地 API + 本地 Worker。
- 默认 SQLite/local file storage，可选 OSS/MinIO/private model。
- 隐藏 App、小程序、SaaS 支付、云端多租户相关能力。
- 增加本地 license、日志导出、配置向导和一键诊断。

### Phase 5：验收与 CI

- 为三种 profile 增加 typecheck/build/contract test。
- 补 adapter contract test，保证同一业务流程在不同 provider 下行为一致。
- 补关键 e2e：登录、生图、套图规划、任务列表、通知、版本更新。

## 当前风险

1. Web/API 变更面很大，后续架构拆分前需要避免继续在 `App.tsx` 和 `index.ts` 里堆大文件。
2. App 已进入原生工程阶段，签名文件和本地构建目录必须持续保持忽略。
3. 小程序 `project.private.config.json` 属于开发者私有配置，后续可考虑从仓库移除或模板化。
4. 计费、IAP、私有化授权和单机 license 需要统一权益模型，否则版本差异会越堆越多。

## 下一步建议

第一批正式改造从 Phase 1 开始：新增 capabilities/profile 模块，先只读配置并透出 API，不立即重构所有业务。等 Web、App、插件能统一读取能力清单后，再逐步把存储、模型、通知拆成适配器。
