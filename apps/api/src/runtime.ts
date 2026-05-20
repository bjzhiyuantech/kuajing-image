import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotEnv } from "dotenv";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(moduleDir, "..");
const repoRoot = resolve(packageRoot, "../..");

for (const envPath of [resolve(repoRoot, ".env"), resolve(packageRoot, ".env"), resolve(process.cwd(), ".env")]) {
  loadDotEnv({ path: envPath, quiet: true });
}

function parsePort(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "8787", 10);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    return 8787;
  }
  return parsed;
}

function resolveFromRepo(value: string): string {
  return isAbsolute(value) ? value : resolve(repoRoot, value);
}

const dataDir = resolveFromRepo(process.env.DATA_DIR ?? "./data");

export const runtimePaths = {
  repoRoot,
  packageRoot,
  dataDir,
  assetsDir: resolve(dataDir, "assets"),
  assetPreviewsDir: resolve(dataDir, "asset-previews"),
  webDistDir: resolve(repoRoot, "apps/web/dist")
};

export const serverConfig = {
  host: process.env.HOST ?? "127.0.0.1",
  port: parsePort(process.env.PORT)
};

export const mysqlConfig = {
  databaseUrl: emptyToUndefined(process.env.DATABASE_URL),
  host: emptyToUndefined(process.env.MYSQL_HOST) ?? "127.0.0.1",
  port: parsePort(process.env.MYSQL_PORT ?? "3306"),
  user: emptyToUndefined(process.env.MYSQL_USER) ?? "gpt_image_canvas",
  password: process.env.MYSQL_PASSWORD ?? "gpt_image_canvas",
  database: emptyToUndefined(process.env.MYSQL_DATABASE) ?? "gpt_image_canvas"
};

export const authConfig = {
  jwtSecret: emptyToUndefined(process.env.JWT_SECRET),
  allowDemoAuth: process.env.ALLOW_DEMO_AUTH === "true",
  adminEmail: emptyToUndefined(process.env.ADMIN_EMAIL),
  adminPassword: emptyToUndefined(process.env.ADMIN_PASSWORD),
  adminDisplayName: emptyToUndefined(process.env.ADMIN_DISPLAY_NAME) ?? "Administrator"
};

export const modelConfig = {
  encryptionKey: emptyToUndefined(process.env.MODEL_CONFIG_ENCRYPTION_KEY)
};

export const smtpRuntimeConfig = {
  enabled: process.env.SMTP_ENABLED === "true",
  host: emptyToUndefined(process.env.SMTP_HOST),
  port: parsePort(process.env.SMTP_PORT ?? "465"),
  secure: process.env.SMTP_SECURE !== "false",
  username: emptyToUndefined(process.env.SMTP_USERNAME),
  password: emptyToUndefined(process.env.SMTP_PASSWORD),
  fromName: emptyToUndefined(process.env.SMTP_FROM_NAME) ?? "商图 AI 助手",
  fromEmail: emptyToUndefined(process.env.SMTP_FROM_EMAIL)
};

export const aliyunSmsRuntimeConfig = {
  enabled: process.env.ALIYUN_SMS_ENABLED === "true",
  accessKeyId: emptyToUndefined(process.env.ALIYUN_SMS_ACCESS_KEY_ID),
  accessKeySecret: emptyToUndefined(process.env.ALIYUN_SMS_ACCESS_KEY_SECRET),
  endpoint: emptyToUndefined(process.env.ALIYUN_SMS_ENDPOINT) ?? "dysmsapi.aliyuncs.com",
  signName: emptyToUndefined(process.env.ALIYUN_SMS_SIGN_NAME),
  registerTemplateCode: emptyToUndefined(process.env.ALIYUN_SMS_REGISTER_TEMPLATE_CODE),
  bindTemplateCode: emptyToUndefined(process.env.ALIYUN_SMS_BIND_TEMPLATE_CODE)
};

export const wechatMiniAppRuntimeConfig = {
  appId: emptyToUndefined(process.env.WECHAT_MINIAPP_APP_ID),
  appSecret: emptyToUndefined(process.env.WECHAT_MINIAPP_APP_SECRET),
  taskCompleteTemplateId: emptyToUndefined(process.env.WECHAT_MINIAPP_TASK_COMPLETE_TEMPLATE_ID),
  enabled: process.env.WECHAT_MINIAPP_ENABLED === "true"
};

export const appleIapRuntimeConfig = {
  bundleId: emptyToUndefined(process.env.APPLE_IAP_BUNDLE_ID) ?? "com.neimou.shangtuai",
  issuerId: emptyToUndefined(process.env.APPLE_IAP_ISSUER_ID),
  keyId: emptyToUndefined(process.env.APPLE_IAP_KEY_ID),
  privateKey: emptyToUndefined(process.env.APPLE_IAP_PRIVATE_KEY),
  productPrefix: emptyToUndefined(process.env.APPLE_IAP_PRODUCT_PREFIX) ?? "com.neimou.shangtuai.plan.",
  productIds: parseStringMap(process.env.APPLE_IAP_PRODUCT_IDS_JSON)
};

export const getuiRuntimeConfig = {
  enabled: process.env.GETUI_ENABLED === "true",
  appId: emptyToUndefined(process.env.GETUI_APP_ID),
  appKey: emptyToUndefined(process.env.GETUI_APP_KEY),
  masterSecret: emptyToUndefined(process.env.GETUI_MASTER_SECRET),
  baseUrl: (emptyToUndefined(process.env.GETUI_BASE_URL) ?? "https://restapi.getui.com/v2").replace(/\/+$/u, "")
};

export const apnsRuntimeConfig = {
  enabled: process.env.APNS_ENABLED === "true",
  bundleId: emptyToUndefined(process.env.APNS_BUNDLE_ID) ?? appleIapRuntimeConfig.bundleId,
  teamId: emptyToUndefined(process.env.APNS_TEAM_ID),
  keyId: emptyToUndefined(process.env.APNS_KEY_ID),
  privateKey: emptyToUndefined(process.env.APNS_PRIVATE_KEY),
  keyFile: emptyToUndefined(process.env.APNS_KEY_FILE),
  environment: process.env.APNS_ENVIRONMENT === "development" ? "development" : "production",
  baseUrl:
    process.env.APNS_ENVIRONMENT === "development"
      ? "https://api.sandbox.push.apple.com"
      : "https://api.push.apple.com"
};

export const extensionReleaseRuntimeConfig = {
  localApiBaseUrl: emptyToUndefined(process.env.EXTENSION_LOCAL_API_BASE_URL) ?? "http://127.0.0.1:8787",
  devApiBaseUrl: emptyToUndefined(process.env.EXTENSION_DEV_API_BASE_URL) ?? "https://dev.neimou.com",
  prodApiBaseUrl: emptyToUndefined(process.env.EXTENSION_PROD_API_BASE_URL) ?? "https://ai.neimou.com",
  localVersion: emptyToUndefined(process.env.EXTENSION_LOCAL_VERSION) ?? "",
  devVersion: emptyToUndefined(process.env.EXTENSION_DEV_VERSION) ?? "",
  prodVersion: emptyToUndefined(process.env.EXTENSION_PROD_VERSION) ?? "",
  localDownloadUrl: emptyToUndefined(process.env.EXTENSION_LOCAL_DOWNLOAD_URL),
  devDownloadUrl: emptyToUndefined(process.env.EXTENSION_DEV_DOWNLOAD_URL),
  prodDownloadUrl: emptyToUndefined(process.env.EXTENSION_PROD_DOWNLOAD_URL),
  localLatestDownloadUrl: emptyToUndefined(process.env.EXTENSION_LOCAL_LATEST_DOWNLOAD_URL),
  devLatestDownloadUrl: emptyToUndefined(process.env.EXTENSION_DEV_LATEST_DOWNLOAD_URL),
  prodLatestDownloadUrl: emptyToUndefined(process.env.EXTENSION_PROD_LATEST_DOWNLOAD_URL),
  localInstallHelpUrl: emptyToUndefined(process.env.EXTENSION_LOCAL_INSTALL_HELP_URL) ?? "/install-help.html",
  devInstallHelpUrl: emptyToUndefined(process.env.EXTENSION_DEV_INSTALL_HELP_URL) ?? "/install-help.html",
  prodInstallHelpUrl: emptyToUndefined(process.env.EXTENSION_PROD_INSTALL_HELP_URL) ?? "/install-help.html"
};

export const appReleaseRuntimeConfig = {
  iosVersion: emptyToUndefined(process.env.APP_RELEASE_IOS_VERSION) ?? "",
  iosBuildNumber: emptyToUndefined(process.env.APP_RELEASE_IOS_BUILD_NUMBER),
  iosDownloadUrl: emptyToUndefined(process.env.APP_RELEASE_IOS_DOWNLOAD_URL),
  androidVersion: emptyToUndefined(process.env.APP_RELEASE_ANDROID_VERSION) ?? "",
  androidBuildNumber: emptyToUndefined(process.env.APP_RELEASE_ANDROID_BUILD_NUMBER),
  androidDownloadUrl: emptyToUndefined(process.env.APP_RELEASE_ANDROID_DOWNLOAD_URL)
};

export function ensureRuntimeStorage(): void {
  mkdirSync(runtimePaths.dataDir, { recursive: true });
  mkdirSync(runtimePaths.assetsDir, { recursive: true });
  mkdirSync(runtimePaths.assetPreviewsDir, { recursive: true });
}

function emptyToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parseStringMap(value: string | undefined): Record<string, string> {
  if (!value?.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    const result: Record<string, string> = {};
    for (const [key, item] of Object.entries(parsed)) {
      if (typeof item === "string" && item.trim()) {
        result[key] = item.trim();
      }
    }
    return result;
  } catch {
    return {};
  }
}
