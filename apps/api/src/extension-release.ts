import { randomUUID } from "node:crypto";
import type { ExtensionReleaseConfig, ExtensionReleaseTargetConfig } from "@gpt-image-canvas/shared";
import { extensionReleaseRuntimeConfig } from "./runtime.js";
import { EXTENSION_RELEASE_SETTINGS_KEY, getSystemSetting, saveSystemSetting } from "./system-settings.js";

interface StoredExtensionReleaseConfig {
  version: 1;
  dev: StoredExtensionReleaseTargetConfig;
  prod: StoredExtensionReleaseTargetConfig;
  updatedAt?: string;
}

interface StoredExtensionReleaseTargetConfig extends ExtensionReleaseTargetConfig {
  sha256?: string;
}

export interface SaveExtensionReleaseTargetConfig {
  apiBaseUrl?: string;
  version?: string;
  downloadUrl?: string;
  latestDownloadUrl?: string;
  installHelpUrl?: string;
  fileName?: string;
  sizeBytes?: number;
  sha256?: string;
  publishedAt?: string;
  releaseNotes?: string[];
}

export interface SaveExtensionReleaseConfig {
  dev: SaveExtensionReleaseTargetConfig;
  prod: SaveExtensionReleaseTargetConfig;
}

export async function getExtensionReleaseConfig(): Promise<ExtensionReleaseConfig> {
  const row = await getSystemSetting(EXTENSION_RELEASE_SETTINGS_KEY);
  const stored = parseStoredConfig(row?.valueJson);
  return {
    dev: resolveTargetConfig("dev", stored.dev),
    prod: resolveTargetConfig("prod", stored.prod),
    updatedAt: row?.updatedAt
  };
}

export async function saveExtensionReleaseConfig(input: SaveExtensionReleaseConfig): Promise<ExtensionReleaseConfig> {
  const existing = await getExtensionReleaseConfig();
  const now = new Date().toISOString();
  const stored: StoredExtensionReleaseConfig = {
    version: 1,
    dev: normalizeStoredTarget("dev", input.dev, existing.dev),
    prod: normalizeStoredTarget("prod", input.prod, existing.prod),
    updatedAt: now
  };

  await saveSystemSetting(EXTENSION_RELEASE_SETTINGS_KEY, stored);
  return getExtensionReleaseConfig();
}

function parseStoredConfig(valueJson: string | undefined): Partial<Record<"dev" | "prod", StoredExtensionReleaseTargetConfig>> {
  if (!valueJson) {
    return {};
  }

  try {
    const body = JSON.parse(valueJson) as Partial<StoredExtensionReleaseConfig>;
    return {
      dev: normalizeStoredTarget("dev", body.dev),
      prod: normalizeStoredTarget("prod", body.prod)
    };
  } catch {
    return {};
  }
}

function normalizeStoredTarget(
  target: "dev" | "prod",
  input: SaveExtensionReleaseTargetConfig | undefined,
  fallback?: ExtensionReleaseTargetConfig
): StoredExtensionReleaseTargetConfig {
  const resolved = resolveTargetConfig(target, fallback);
  return {
    apiBaseUrl: input?.apiBaseUrl?.trim() || resolved.apiBaseUrl,
    version: input?.version?.trim() || resolved.version || randomUUID(),
    downloadUrl: input?.downloadUrl?.trim() || resolved.downloadUrl,
    latestDownloadUrl: input?.latestDownloadUrl?.trim() || resolved.latestDownloadUrl,
    installHelpUrl: input?.installHelpUrl?.trim() || resolved.installHelpUrl,
    fileName: input?.fileName?.trim() || resolved.fileName,
    sizeBytes: typeof input?.sizeBytes === "number" && Number.isFinite(input.sizeBytes) && input.sizeBytes >= 0 ? input.sizeBytes : resolved.sizeBytes,
    sha256: input?.sha256?.trim() || resolved.sha256,
    publishedAt: input?.publishedAt?.trim() || resolved.publishedAt,
    releaseNotes: Array.isArray(input?.releaseNotes)
      ? input.releaseNotes.map((line) => line.trim()).filter(Boolean).slice(0, 20)
      : resolved.releaseNotes
  };
}

function resolveTargetConfig(target: "dev" | "prod", stored?: Partial<ExtensionReleaseTargetConfig>): ExtensionReleaseTargetConfig {
  const runtime = target === "dev" ? extensionReleaseRuntimeConfig : extensionReleaseRuntimeConfig;
  const fallbackBaseUrl = target === "dev" ? runtime.devApiBaseUrl : runtime.prodApiBaseUrl;
  const fallbackVersion = target === "dev" ? runtime.devVersion : runtime.prodVersion;
  const fallbackDownloadUrl = target === "dev" ? runtime.devDownloadUrl : runtime.prodDownloadUrl;
  const fallbackLatestDownloadUrl = target === "dev" ? runtime.devLatestDownloadUrl : runtime.prodLatestDownloadUrl;
  const fallbackInstallHelpUrl = target === "dev" ? runtime.devInstallHelpUrl : runtime.prodInstallHelpUrl;
  const apiBaseUrl = stored?.apiBaseUrl?.trim() || fallbackBaseUrl;
  const defaultFileName = `kuajing-image-extension-${target}-latest.zip`;
  const downloadUrl = normalizeUrlAgainstBase(stored?.downloadUrl || fallbackDownloadUrl || `/downloads/${defaultFileName}`, apiBaseUrl);
  const latestDownloadUrl = normalizeUrlAgainstBase(stored?.latestDownloadUrl || fallbackLatestDownloadUrl || downloadUrl, apiBaseUrl);
  return {
    apiBaseUrl,
    version: stored?.version?.trim() || fallbackVersion || "",
    downloadUrl,
    latestDownloadUrl,
    installHelpUrl: normalizeUrlAgainstBase(stored?.installHelpUrl || fallbackInstallHelpUrl || "/install-help.html", apiBaseUrl),
    fileName: stored?.fileName?.trim() || defaultFileName,
    sizeBytes: typeof stored?.sizeBytes === "number" ? stored.sizeBytes : undefined,
    sha256: stored?.sha256?.trim() || undefined,
    publishedAt: stored?.publishedAt?.trim() || undefined,
    releaseNotes: Array.isArray(stored?.releaseNotes) ? stored.releaseNotes.filter((line): line is string => typeof line === "string" && Boolean(line.trim())) : []
  };
}

function normalizeUrlAgainstBase(value: string, baseUrl: string): string {
  try {
    const base = new URL(`${baseUrl.replace(/\/$/u, "")}/`);
    const parsed = new URL(value, base);
    if (parsed.origin !== base.origin) {
      return new URL(`${parsed.pathname}${parsed.search}${parsed.hash}`, base).toString();
    }
    return parsed.toString();
  } catch {
    return value;
  }
}
