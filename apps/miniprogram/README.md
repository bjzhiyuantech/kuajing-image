# 商图AI小程序前端

这是独立的原生微信小程序目录，和现有 React Web 前端分开维护。后端沿用仓库里的 `apps/api`，包括登录、会员等级、额度扣费和电商批量出图任务。

## 本地调试

1. 在仓库根目录启动 API：

```sh
corepack pnpm api:dev
```

2. 打开微信开发者工具，导入目录：

```text
apps/miniprogram
```

3. 小程序默认请求 API：

```text
https://imagen.neimou.com
```

如需本地联调，可以临时在 `app.js` 中把 `apiBaseUrl` 改成 `http://127.0.0.1:8787`，并在微信开发者工具详情/本地设置中打开“不校验合法域名、web-view、TLS 版本以及 HTTPS 证书”。

## 已接入能力

- 首页：品牌首屏、功能金刚位、推荐工作流、最近任务和会员入口
- 邮箱密码登录、注册：`/api/auth/login`、`/api/auth/register`
- 会员资料和额度：`/api/auth/me`
- 上传 1-3 张产品图：小程序端选择 1-3 张图
- 按场景批量出图：`/api/ecommerce/images/batch-generate`
- 批量翻译：选择“文字翻译”场景和目标语言
- 批量去水印/Logo：默认开启 `removeWatermarkAndLogo`
- 分品类出图：先接入已有围巾/通用电商场景模板
- 任务列表和结果预览：`/api/ecommerce/jobs`、`/api/ecommerce/jobs/:jobId`

## 当前约束

当前后端一个任务只接收一张参考图，所以小程序会为每张上传图分别创建一个批量任务。后续如果要把 1-3 张图作为同一个商品的多参考图融合生成，需要扩展后端请求模型为 `referenceImages[]`。

小程序首页允许未登录用户浏览功能和进入出图配置页；真正创建任务、查看历史任务或同步会员额度时再引导登录。

生产环境发布前，需要把 API 部署到 HTTPS 域名，并在微信公众平台配置 request 合法域名。
