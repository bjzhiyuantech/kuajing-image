# 多交付形态任务拆解

## 总目标

最终交付三套可验证产物：

1. 单机版：用户可下载安装包，完成本地配置后使用 Web/Desktop、拆件、套图、生图、视频等核心能力。
2. 私有化部署版：客户可用 Docker/离线镜像快速部署，接入自己的域名、数据库、对象存储和模型服务。
3. SaaS 版：官方线上服务继续保持蓝绿发布、插件/App/小程序联动、计费、通知、运营配置。

## 当前分支

- 平台主仓：`codex/deployment-modes-refactor`
- App 仓库：`codex/deployment-modes-refactor`

## 任务流 A：平台 Profile 与 Capabilities

目标：所有客户端和部署脚本都能读取同一份非敏感能力清单。

- A1. 定义共享类型：`DeploymentProfileResponse`、`DeploymentCapabilities`。
- A2. API 根据 `DEPLOYMENT_PROFILE=local|private-cloud|saas` 派生默认能力。
- A3. API 提供 `GET /api/deployment-profile`，并把结果并入 `GET /api/config`。
- A4. 支持 `CAPABILITIES_OVERRIDES_JSON` 做灰度覆盖。
- A5. Web 读取 capabilities，先隐藏 App、小程序、计费、IAP、插件等入口。
- A6. App 读取 capabilities，先控制创建任务、品类套图、IAP/套餐入口。
- A7. 插件和小程序读取 capabilities，先做入口显隐和不可用提示。

验收：

- 三种 profile 下 `/api/deployment-profile` 输出不同能力。
- 不设置 `DEPLOYMENT_PROFILE` 时默认保持 SaaS 行为。
- capabilities 中不返回任何密钥、域名账号、数据库连接信息。

## 任务流 B：私有化部署版

目标：客户拿到部署包后，按文档配置 `.env` 即可启动。

- B1. 新增 `deploy/profiles/private-cloud.env.example`。
- B2. 新增 `docker-compose.private-cloud.yml`，明确 app、mysql、可选 minio/nginx。
- B3. 支持 S3/MinIO 存储适配器，兼容内网 endpoint。
- B4. 增加安装前检查脚本：端口、Docker、磁盘、数据库连接、对象存储连接。
- B5. 增加备份恢复脚本：数据库 dump、data/assets、配置快照。
- B6. 增加升级回滚脚本：镜像版本、数据库备份、健康检查。
- B7. 编写私有化交付文档：安装、升级、回滚、证书、域名、模型配置。
- B8. 可选：企业 SSO/OIDC、审计日志、授权 license。

验收：

- 一台干净服务器可按文档在 30 分钟内启动。
- `/api/health`、Web 首页、登录、配置模型、配置存储、生图任务可跑通。
- 离线镜像包可导入并启动。

## 任务流 C：SaaS 版

目标：把当前官方部署链路标准化为 `saas` profile。

- C1. 新增 `deploy/profiles/saas.env.example`。
- C2. 标准化现有 blue-green 脚本参数，去掉硬编码默认域名/目录。
- C3. 保留官方 OSS/COS、模型、计费、IAP、推送、插件发布能力。
- C4. 增加部署前检查：环境变量、secrets、MySQL、OSS/COS、APNs/Getui。
- C5. 增加发布后 smoke test：health、config、deployment-profile、登录页、插件 release、App release。
- C6. 补监控/备份清单：数据库备份、对象存储、日志、错误告警。

验收：

- `DEPLOYMENT_PROFILE=saas` 时当前线上能力默认不降级。
- 蓝绿发布能明确 dev/prod color、健康检查、promote、回滚。
- 插件和 App release 配置仍可通过后台或脚本更新。

## 任务流 D：单机版

目标：先实现可打包的本地 Web 单机版，再演进桌面安装包。

- D1. 新增 `deploy/profiles/local.env.example`。
- D2. 修正文档里的数据库描述，明确当前代码依赖 MySQL。
- D3. 做本地 Docker 单机包：app + mysql + data volume + local storage。
- D4. 增加本地配置向导页面或启动检查页面，提示配置模型 key、存储、本地数据目录。
- D5. 单机 profile 下隐藏 App、小程序、IAP、SaaS 支付、推送、公开图库等能力。
- D6. 评估并选择桌面壳：Tauri 或 Electron。
- D7. 桌面壳启动/停止本地服务，打开本地 Web，提供日志导出。
- D8. 打包 Windows exe、macOS dmg，并补签名/公证策略。
- D9. 增加单机 license 激活与离线授权。

验收：

- 第一阶段：本地 Docker 包可一键启动，浏览器访问本机服务。
- 第二阶段：安装包启动后无需命令行，完成配置即可使用。
- 卸载/升级不丢失用户数据。

## 任务流 E：配置与适配器收敛

目标：逐步把基础设施差异从业务代码中移走。

- E1. StorageProvider：local、OSS、COS、S3/MinIO。
- E2. ModelProvider：官方 OpenAI、OpenAI-compatible、私有模型、本地模型 endpoint。
- E3. NotificationProvider：web、APNs、Getui、微信模板消息。
- E4. BillingProvider：SaaS 支付、Apple IAP、余额、license。
- E5. AuthProvider：本地账号、SaaS 账号、SSO/OIDC。
- E6. QueueProvider：当前内存任务、Redis/worker、多实例任务恢复。

验收：

- 同一业务流程只依赖 provider 接口，不直接判断部署形态。
- 每个 provider 有最小 contract test。

## 推荐并行分工

- Agent/人 1：平台 profile/capabilities、Web 接入、共享类型。
- Agent/人 2：App capabilities 接入、IAP/套餐/创建任务 gating。
- Agent/人 3：Docker 私有化部署、`.env` 模板、安装/备份/升级脚本。
- Agent/人 4：单机版技术选型和 PoC，先 Docker 本地包，再桌面壳。
- Agent/人 5：SaaS 发布链路标准化、蓝绿 smoke test、监控备份清单。

## 第一周建议里程碑

1. 完成 A1-A4，打通 `/api/deployment-profile`。
2. 完成 B1-B2-C1-D1，三套 profile env 模板落库。
3. 完成 D2，修正当前 README 的 SQLite/MySQL 不一致。
4. 完成 Web 第一批 capabilities gating。
5. 完成私有化部署文档初稿和本地 Docker 启动验收。
