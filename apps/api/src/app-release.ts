import type { AppReleaseConfig, AppReleasePlatform, AppReleaseTargetConfig, SaveAppReleaseConfigRequest } from "./contracts.js";
import { appReleaseRuntimeConfig } from "./runtime.js";
import { APP_RELEASE_SETTINGS_KEY, getSystemSetting, saveSystemSetting } from "./system-settings.js";

interface StoredAppReleaseConfig {
  version: 1;
  ios: AppReleaseTargetConfig;
  android: AppReleaseTargetConfig;
  updatedAt?: string;
}

export async function getAppReleaseConfig(): Promise<AppReleaseConfig> {
  const row = await getSystemSetting(APP_RELEASE_SETTINGS_KEY);
  const stored = parseStoredConfig(row?.valueJson);
  return {
    ios: resolveTargetConfig("ios", stored.ios),
    android: resolveTargetConfig("android", stored.android),
    updatedAt: row?.updatedAt
  };
}

export async function saveAppReleaseConfig(input: SaveAppReleaseConfigRequest): Promise<AppReleaseConfig> {
  const existing = await getAppReleaseConfig();
  const now = new Date().toISOString();
  const stored: StoredAppReleaseConfig = {
    version: 1,
    ios: normalizeStoredTarget("ios", input.ios, existing.ios),
    android: normalizeStoredTarget("android", input.android, existing.android),
    updatedAt: now
  };

  await saveSystemSetting(APP_RELEASE_SETTINGS_KEY, stored);
  return getAppReleaseConfig();
}

function parseStoredConfig(valueJson: string | undefined): Partial<Record<AppReleasePlatform, AppReleaseTargetConfig>> {
  if (!valueJson) {
    return {};
  }

  try {
    const body = JSON.parse(valueJson) as Partial<StoredAppReleaseConfig>;
    return {
      ios: normalizeStoredTarget("ios", body.ios),
      android: normalizeStoredTarget("android", body.android)
    };
  } catch {
    return {};
  }
}

function normalizeStoredTarget(
  platform: AppReleasePlatform,
  input: Partial<AppReleaseTargetConfig> | undefined,
  fallback?: AppReleaseTargetConfig
): AppReleaseTargetConfig {
  const resolved = resolveTargetConfig(platform, fallback);
  return {
    enabled: typeof input?.enabled === "boolean" ? input.enabled : resolved.enabled,
    version: input?.version?.trim() || resolved.version,
    buildNumber: input?.buildNumber?.trim() || resolved.buildNumber,
    downloadUrl: input?.downloadUrl?.trim() || resolved.downloadUrl,
    releaseNotes: Array.isArray(input?.releaseNotes)
      ? input.releaseNotes.map((line) => line.trim()).filter(Boolean).slice(0, 20)
      : resolved.releaseNotes,
    forceUpdate: typeof input?.forceUpdate === "boolean" ? input.forceUpdate : resolved.forceUpdate,
    publishedAt: input?.publishedAt?.trim() || resolved.publishedAt
  };
}

function resolveTargetConfig(platform: AppReleasePlatform, stored?: Partial<AppReleaseTargetConfig>): AppReleaseTargetConfig {
  const version = stored?.version?.trim() || (platform === "ios" ? appReleaseRuntimeConfig.iosVersion : appReleaseRuntimeConfig.androidVersion);
  const buildNumber =
    stored?.buildNumber?.trim() || (platform === "ios" ? appReleaseRuntimeConfig.iosBuildNumber : appReleaseRuntimeConfig.androidBuildNumber);
  const downloadUrl =
    stored?.downloadUrl?.trim() || (platform === "ios" ? appReleaseRuntimeConfig.iosDownloadUrl : appReleaseRuntimeConfig.androidDownloadUrl) || "";

  return {
    enabled: typeof stored?.enabled === "boolean" ? stored.enabled : false,
    version,
    buildNumber,
    downloadUrl,
    releaseNotes: Array.isArray(stored?.releaseNotes) ? stored.releaseNotes.filter((line): line is string => typeof line === "string" && Boolean(line.trim())) : [],
    forceUpdate: typeof stored?.forceUpdate === "boolean" ? stored.forceUpdate : false,
    publishedAt: stored?.publishedAt?.trim() || undefined
  };
}
