# GPT Image Canvas

[English](README.md) | [简体中文](README.zh-CN.md)

基于 tldraw、Hono、MySQL 和 GPT Image 2 构建的专业 AI 画布。`v0.1.1` 支持阿里云 OSS / 腾讯云 COS 备份、PackyCode / `gpt-image` 返回格式兼容，并优化了生成资产相关体验。

## 效果图

![GPT Image Canvas 效果图](docs/assets/app-preview.png)

## 亮点

- 基于 tldraw 的 AI 画布，支持文生图和参考图生成。
- 项目快照默认本地优先保存；生成图可启用云端上传，成功后不保留本地原图。
- 可选阿里云 OSS / 腾讯云 COS 上传，新生成图支持云端备份。
- 生成历史支持定位、重跑、下载和云端上传状态提示。
- 支持 OpenAI 兼容图像端点，并兼容 PackyCode / `gpt-image` 风格响应。

## 环境要求

- Node.js 22 或更新版本。
- pnpm 9.14.2。包管理器版本已固定在 `package.json` 中；可以通过 `corepack prepare pnpm@9.14.2 --activate` 启用。
- Docker Desktop 或兼容的 Docker Engine，用于 Docker 工作流。
- 用于实时生成的 OpenAI API key，且需要具备 `gpt-image-2` 访问权限。没有凭证时应用仍可启动，但生成请求会返回运行时缺少 key 的错误。

## 快速开始

Windows PowerShell：

```powershell
pnpm install
Copy-Item .env.example .env
pnpm dev
```

macOS/Linux：

```sh
pnpm install
cp .env.example .env
pnpm dev
```

实时生成前，请在 `.env` 中设置 `OPENAI_API_KEY`。应用默认使用官方 OpenAI Image API 和 `gpt-image-2`。如需转发到 OpenAI 兼容端点，请在 `.env` 中设置 `OPENAI_BASE_URL`；如需使用不同的兼容图像模型，请设置 `OPENAI_IMAGE_MODEL`。

打开 `http://localhost:5173` 使用 Web 应用。

## 升级到 v0.1.0

升级前建议备份本地运行数据：

Windows PowerShell：

```powershell
Copy-Item -Recurse data data-backup-before-v0.1.0
docker compose up --build
```

macOS/Linux：

```sh
cp -R data data-backup-before-v0.1.0
docker compose up --build
```

请确保 Web 应用和 API 一起重新构建。如果使用 Docker，建议直接访问 `http://localhost:8787`，并避免同时运行 `pnpm dev` 和 Docker 共用同一个 `data/` 目录。

## Codex 用户

Codex 可以直接在这个仓库中工作。克隆后，让 Codex 读取 `AGENTS.md`，再让它使用固定的包管理器安装依赖并运行检查：

```sh
pnpm install
pnpm typecheck
pnpm build
```

请不要把凭证写进提示词或日志。OpenAI API key 只应放在由 `.env.example` 复制出来的本地 `.env` 文件里，不要粘贴到 Codex 对话中。如果需要让 Codex 验证实时生成，请要求它使用现有 `.env`，且不要打印环境变量值。

如果涉及 UI 修改，让 Codex 运行 `pnpm dev`，并在浏览器中验证 Vite 应用 `http://localhost:5173`。本地临时文件应放在 `.codex-temp/` 下，该目录已被 Git 忽略。

## 开发流程

`pnpm dev` 会同时启动两个服务：

- API：Hono，默认地址为 `http://127.0.0.1:8787`。
- Web：Vite，默认地址为 `http://localhost:5173`，并将 `/api` 代理到 API 服务。开发服务会严格占用该端口，避免 `5173` 上的旧应用掩盖本项目启动失败。

使用右侧 AI 面板输入提示词、选择画面尺寸并生成图像。当画布中选中一张图片形状时，生成按钮会切换为参考图生成。画布编辑后会自动保存到本地 API，最近生成历史提供定位、重跑和下载已存储输出的操作。

云存储由后台统一配置。管理员启用 OSS 或 COS 后，所有用户的新生成图都会使用同一套云端目标。

完成改动前请运行：

```sh
pnpm typecheck
pnpm build
```

## 脚本

- `pnpm dev` 启动全部 workspace 开发流程。
- `pnpm api:dev` 启动 API 开发流程。
- `pnpm web:dev` 启动 Web 开发流程。
- `pnpm typecheck` 检查 shared、web 和 API 的 TypeScript。
- `pnpm build` 构建 shared、web 和 API 包。
- `pnpm start` 启动构建后的 API 包。

## 浏览器插件 Dev / Product 版本

插件支持按构建目标写入不同的 API 域名，方便同时安装测试版和正式版：

```sh
pnpm --filter @gpt-image-canvas/extension build:dev
pnpm --filter @gpt-image-canvas/extension build:prod
```

版本号的发布口径如下：

- 走 `./scripts/server-release.sh dev` 或 `./scripts/server-release.sh promote` 时，版本号以后台“插件发布配置”里对应通道的版本号为准。脚本会先读取远端后台配置，再写入插件 `manifest.json`、zip 文件名和 `latest.json`。
- 手动运行 `pnpm --filter @gpt-image-canvas/extension build:dev` / `build:prod` 时，不会自动读取后台；如需手动指定版本，可传 `EXTENSION_DEV_VERSION=1.1.7` 或 `EXTENSION_PROD_VERSION=1.1.7`。未传时回退到 `apps/extension/package.json`。

构建产物：

- `apps/extension/dist-dev`：插件名称为“商图AI助手 Dev”，默认 API 为 `https://dev.neimou.com`。
- `apps/extension/dist-prod`：插件名称为“商图AI助手”，默认 API 为 `https://imagen.neimou.com`。

Chrome/Edge 中打开扩展管理页，启用开发者模式后，分别“加载已解压的扩展程序”并选择对应目录即可。

服务器部署脚本会额外把两个插件目录打成 zip 包并复制到 `downloads/`：

- `downloads/kuajing-image-extension-dev-v<version>.zip`
- `downloads/kuajing-image-extension-prod-v<version>.zip`
- `downloads/kuajing-image-extension-dev-latest.zip`
- `downloads/kuajing-image-extension-prod-latest.zip`
- `downloads/kuajing-image-extension-dev-latest.json`
- `downloads/kuajing-image-extension-prod-latest.json`

插件内置版本管理能力，会定时读取对应通道的 `latest.json`，如果服务端版本高于当前安装版本，会在侧边栏“版本”工具里提示升级。由于 Chrome/Edge 不允许手动安装的扩展静默替换自身，点击升级会下载最新版 zip 并打开安装帮助页，用户解压后在扩展管理页重新加载目录即可完成升级。发布时可通过 `EXTENSION_RELEASE_NOTES` 写入更新说明，例如：

```bash
EXTENSION_RELEASE_NOTES=$'新增版本检测\n优化批量生成体验' node scripts/package-extensions.mjs downloads
```

## Docker

Docker Compose 会把共享契约、Web 应用和 API 构建到同一个镜像中。Hono API 会在同一个本地端口同时提供 `/api` 和构建后的 Web bundle，业务数据存储在 MySQL 中，生成资产会持久化到宿主机 `./data`。

Windows PowerShell：

```powershell
Copy-Item .env.example .env
docker compose config --quiet --no-env-resolution
docker compose up --build
```

macOS/Linux：

```sh
cp .env.example .env
docker compose config --quiet --no-env-resolution
docker compose up --build
```

默认在 `http://localhost:8787` 打开应用。如需使用其他本地端口，请在启动 Docker Compose 前设置 `.env` 中的 `PORT`。

应用使用 MySQL 存储业务数据。蓝绿部署不会启动本地 MySQL，请在 `.env` 中指向外部 MySQL（例如阿里云 RDS）。如果是宿主机已经运行的 MySQL，可以这样设置：

```env
MYSQL_HOST=host.docker.internal
MYSQL_PORT=3306
MYSQL_USER=你的用户
MYSQL_PASSWORD=你的密码
MYSQL_DATABASE=gpt_image_canvas
```

容器内不要使用 `127.0.0.1` 或 `localhost` 连接宿主机 MySQL；它们会指向 app 容器自身。Compose 已配置 `host.docker.internal` 到宿主机网关的解析。

Compose 构建支持与参考项目 `open-managed-flow` 相同的网络相关 build args：`NODE_IMAGE`、`NPM_CONFIG_REGISTRY`、`APT_MIRROR` 和 `APT_SECURITY_MIRROR`。Compose 中默认的 `NODE_IMAGE` 是 `public.ecr.aws/docker/library/node:22-bookworm-slim`，与 Dockerfile 默认值一致，也能避开 Docker Hub。若要显式覆盖它，可以运行：

Windows PowerShell：

```powershell
$env:NODE_IMAGE = 'public.ecr.aws/docker/library/node:22-bookworm-slim'
docker compose up --build
```

macOS/Linux：

```sh
NODE_IMAGE=public.ecr.aws/docker/library/node:22-bookworm-slim docker compose up --build
```

`OPENAI_API_KEY` 可以在本地启动检查时留空。应用仍会启动，生成端点会返回缺少 key 的 JSON 错误，直到配置凭证为止。

## 交付包、离线镜像与升级

三种交付形态共用一套部署脚本：

- `local`：单机版，默认本机 Docker Compose。
- `private-cloud`：客户私有化部署版，默认 app + MySQL Compose。
- `saas`：官方 SaaS 版，默认保留现有蓝绿发布脚本，也可用通用脚本做单节点演练。

生成交付包骨架：

```sh
corepack pnpm deployment:bundle -- --profile local --clean --archive
corepack pnpm deployment:bundle -- --profile private-cloud --clean --archive
corepack pnpm deployment:bundle -- --profile saas --clean --archive
```

生成离线镜像包：

```sh
corepack pnpm deployment:images -- save --profile local
corepack pnpm deployment:images -- save --profile private-cloud
corepack pnpm deployment:images -- save --profile saas
```

在离线机器上先加载镜像，再执行安装：

```sh
node scripts/deployment-images.mjs load --archive dist/deployment-images/local-images.tar
node scripts/deployment-rollout.mjs install --profile local --env-file .env --offline
```

联网安装或升级可直接运行：

```sh
node scripts/deployment-rollout.mjs install --profile private-cloud --env-file .env
node scripts/deployment-rollout.mjs upgrade --profile private-cloud --env-file .env
```

`upgrade` 会先执行 `deployment-backup`，复制 `.env` 快照、`data/`、`downloads/`，并在检测到 Compose 中的 `mysql` 服务时导出 `mysql.sql`。如需回滚：

```sh
node scripts/deployment-rollout.mjs rollback --profile private-cloud --env-file .env --backup-dir backups/20260520-120000
```

安装前检查和发布后检查可单独运行：

```sh
corepack pnpm deployment:preflight -- --profile private-cloud --env-file .env
corepack pnpm deployment:smoke -- --profile private-cloud --base-url http://127.0.0.1:8787
```

任务完成通知支持站内消息、App 个推离线推送和小程序订阅消息。生产环境建议在 API 服务 `.env` 中配置：

```env
GETUI_ENABLED=true
GETUI_APP_ID=你的个推 AppID
GETUI_APP_KEY=你的个推 AppKey
GETUI_MASTER_SECRET=你的个推 MasterSecret
APNS_ENABLED=true
APNS_BUNDLE_ID=com.neimou.shangtuai
APNS_TEAM_ID=你的 Apple Team ID
APNS_KEY_ID=你的 APNs Key ID
APNS_PRIVATE_KEY=你的 APNs Auth Key 私钥
APNS_KEY_FILE=或填写服务器上的 .p8 私钥文件路径
APNS_ENVIRONMENT=production
WECHAT_MINIAPP_TASK_COMPLETE_TEMPLATE_ID=小程序任务完成订阅消息模板 ID
```

注意不要把 `GETUI_APP_KEY` 或 `GETUI_MASTER_SECRET` 放到移动端包里；Android 客户端只需要 AppID 来初始化 SDK，CID 会登录后上报给后端。
APNs 私钥也只放在服务端，iOS 客户端只负责申请系统通知权限和上报 device token。

## 蓝绿部署

如果希望升级时生产入口不断线，可以使用仓库内置的蓝绿部署 Compose 文件。它会同时运行两套应用服务：

- `app-blue`：蓝色环境。
- `app-green`：绿色环境。
- `nginx`：对外暴露统一入口，默认 `http://localhost:8787`，只把流量转发到当前上线环境。

数据库由 `.env` 中的 `DATABASE_URL` 或 `MYSQL_*` 指向外部 MySQL；蓝绿 Compose 不会启动本地 `mysql` 容器。

默认端口：

- 生产入口：`http://localhost:8787`。
- dev 入口：`http://localhost:8790`。
- blue 直连入口：`http://localhost:8788`。
- green 直连入口：`http://localhost:8789`。

首次启动：

```sh
cp .env.example .env
# 编辑 .env，把 MYSQL_HOST/MYSQL_PORT/MYSQL_USER/MYSQL_PASSWORD/MYSQL_DATABASE 指向外部 MySQL
docker compose -f docker-compose.bluegreen.yml up -d --build
```

默认生产流量指向 `app-blue`。你可以把未接流量的一侧作为开发/预发布环境，完成升级后切换生产流量。脚本会读取远端 dev 入口当前指向的颜色，并将它提升为生产，不需要手动记住当前是蓝还是绿：

```sh
./scripts/bluegreen-switch.sh
```

如果确实要强制指定颜色，也可以传 `blue` 或 `green`：

```sh
./scripts/bluegreen-switch.sh blue
```

`bluegreen-switch.sh` 是远端发布切换入口，等价于 `server-release.sh promote`；它会 SSH 到 `SERVER` 指向的机器，在 `REMOTE_DIR` 下检查目标服务的 `/api/health`，再重写 Nginx upstream 并重建 Nginx。切换完成后，它会从后台“插件发布配置”读取 prod 版本号，打包正式插件并上传到远端 `downloads/`。旧环境仍保持运行，可以作为下一轮开发/升级环境，也可以用于快速回滚：

```sh
./scripts/bluegreen-switch.sh
```

线上入口端口可通过 `.env` 中的 `PUBLIC_PORT` 修改，例如：

```env
PUBLIC_PORT=80
```

两套环境的直连测试端口可通过 `BLUE_PORT` 和 `GREEN_PORT` 修改。

如果外部 Nginx 配了两个域名，推荐这样代理：

```text
imagen.neimou.com -> 127.0.0.1:8787
dev.neimou.com    -> 127.0.0.1:8790
```

Docker 内部 Nginx 会自动维护两条线路：生产入口指向当前上线颜色，dev 入口指向另一种颜色。例如生产在 `blue` 时，dev 指向 `green`；生产切到 `green` 后，dev 会指向 `blue`。

推荐使用统一发布脚本；直接运行时会出现交互菜单，选择 `1` 发布 dev，选择 `2` 切换蓝绿并打包/上传正式插件：

```sh
./scripts/server-release.sh
```

也可以用非交互命令同步本地代码到服务器、启动 inactive 颜色作为 dev 环境，并打包/上传 Dev 插件：

```sh
./scripts/server-release.sh dev
```

也可以明确指定本次要启动哪一侧作为 dev 环境：

```sh
./scripts/server-release.sh dev green
```

脚本完成后先访问 `https://dev.neimou.com`，并安装 `downloads/` 里的 Dev 插件包验证。确认没问题后，用切换入口自动把当前 dev 颜色提升为生产，并打包/上传正式插件：

```sh
./scripts/bluegreen-switch.sh
```

`./scripts/bluegreen-switch.sh` 等价于 `./scripts/server-release.sh promote`，会在切换后继续打包/上传正式插件并更新发布配置。下一轮发布时，再运行 `./scripts/server-release.sh dev` 会自动选择新的 inactive 颜色作为 dev 环境。

注意：蓝绿部署可以避免应用容器重启导致的断链，但数据库结构变更仍需要向前兼容。发布前请避免“新代码必须依赖刚删除的旧字段”或“旧代码无法读取新结构”这类一次性破坏性迁移；更稳妥的做法是先加字段/表，确认新旧版本都能运行，再在后续版本清理旧结构。

## 云存储备份

在后台启用阿里云 OSS 或腾讯云 COS，或者在 `.env` 里直接配置对应凭据后，新生成图会上传到云端；上传成功后不会保留本地原图或预览缓存：

```text
<key-prefix>/YYYY/MM/<assetId>.<ext>
```

OSS 表单默认值来自 `.env`：

- `OSS_DEFAULT_BUCKET`
- `OSS_DEFAULT_REGION`
- `OSS_DEFAULT_KEY_PREFIX`

COS 表单默认值来自 `.env`：

- `COS_DEFAULT_BUCKET`
- `COS_DEFAULT_REGION`
- `COS_DEFAULT_KEY_PREFIX`

后台保存 OSS / COS 配置前会执行一次测试上传和删除。AccessKey Secret / SecretKey 会保存在系统设置中，但读取配置接口只返回掩码状态，不会回显明文。

云端上传失败不会导致生成失败。图片会回落为本地副本，生成历史中会显示云备份失败标记。

## 本地数据

运行时状态存储在 `DATA_DIR` 下，本地默认是 `./data`，Docker 中默认是 `/app/data`。该目录包含：

- MySQL：保存项目、生成历史、资产元数据、用户、计费和系统设置。
- `assets/`：未启用云存储时保存生成图像和本地预览。

Docker Compose 会将宿主机 `./data` 绑定挂载到 `/app/data`，因此项目和生成资产会在容器重建后保留。不要提交 `.env`、`data/`、生成图像、数据库备份或构建输出。

## 安全与隐私说明

- 密钥只从 `.env` 或运行时环境变量读取。不要提交 `.env`、展开后的 Docker Compose 配置输出、包含 key 的 shell 历史或包含密钥值的日志。
- 从 UI 保存的 OSS AccessKey Secret / COS SecretKey 会存储在本地数据库中，并由设置接口掩码返回。配置云存储后，请将运行数据也视为敏感文件。
- 提示词、项目状态、生成资产和数据库记录都是运行时数据；生成文件存放在 `DATA_DIR` 下。除非你有意导出特定资产，否则应将 `data/` 视为私有数据。
- 发布分支前，请检查 `git status --short`，确认只暂存了源代码、文档和预期 metadata。`.env`、`.ralph/`、`.codex-temp/`、`data/`、生成图像和构建输出都应保持未跟踪。
- 如果真实 API key 曾被提交过，请先轮换该 key。Git ignore 规则只能防止之后泄露，不能从已有 Git 历史中移除密钥。

## 故障排查

- 缺少或空的 `OPENAI_API_KEY`：应用仍会启动；文生图和参考图请求会返回缺少 key 的 JSON 错误。将有效 key 添加到 `.env` 后，重启 API 或 Docker 容器。
- 自定义 provider 地址：在 `.env` 中设置 `OPENAI_BASE_URL`，例如 `https://api.example.com/v1`，然后重启 API 或 Docker 容器。该端点必须兼容 OpenAI API，并支持当前配置的图像模型。
- 缺少模型访问权限：确认 `OPENAI_API_KEY` 所属的 OpenAI organization 和 project 可以访问当前配置的图像模型。如果兼容端点需要不同模型名，请设置 `OPENAI_IMAGE_MODEL`。
- 高分辨率生成超时：默认上游请求超时为 20 分钟，可在 `.env` 中调大 `OPENAI_IMAGE_TIMEOUT_MS`。
- 端口已被占用：为 API/Docker 运行时设置 `.env` 中的 `PORT`；如果 Web 的 `5173` 被占用，请先关闭占用进程，或显式运行 `pnpm web:dev -- --port 5174` 并打开打印出来的地址。
- Docker 构建无法拉取 Node 基础镜像：在 macOS/Linux 可用 `NODE_IMAGE=public.ecr.aws/docker/library/node:22-bookworm-slim docker compose up --build` 使用镜像源；在 Windows PowerShell 可先运行 `$env:NODE_IMAGE = 'public.ecr.aws/docker/library/node:22-bookworm-slim'`，再运行 `docker compose up --build`；也可以恢复 Docker Hub 访问后重新运行 `docker compose up --build`。
- Docker config 默认会输出 `.env` 值。真实凭证存在时，请使用 `docker compose config --quiet --no-env-resolution` 做验证，不要分享展开后的 config 输出。
- `/api/project` 自动保存返回 400：查看 Docker 日志中的 `Project save rejected`。大画布快照支持到 100 MB；导入的 data URL 图片仍可能让快照变得很大。
- 本地状态过期或不需要：停止应用并删除 `data/` 下的文件。这会删除本地项目状态、历史记录和生成资产。

## 许可证

MIT

## 友情链接

- [LINUX DO - 新的理想型社区](https://linux.do/)
