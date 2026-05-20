import type {
  DeploymentCapabilities,
  DeploymentEdition,
  DeploymentProfileResponse,
  DeploymentTarget
} from "./contracts.js";

const DEFAULT_PROFILE_NAMES: Record<DeploymentEdition, string> = {
  local: "商图 AI 单机版",
  "private-cloud": "商图 AI 私有化部署版",
  saas: "商图 AI SaaS 版"
};

const DEFAULT_TARGETS: Record<DeploymentEdition, DeploymentTarget> = {
  local: "desktop",
  "private-cloud": "server",
  saas: "managed-cloud"
};

const DEFAULT_CAPABILITIES: Record<DeploymentEdition, DeploymentCapabilities> = {
  local: {
    web: true,
    desktop: true,
    extension: true,
    miniprogram: false,
    mobileApp: false,
    publicGallery: false,
    categoryKit: false,
    photoshopPackage: false,
    seedanceVideo: false,
    billing: false,
    appleIap: false,
    license: false,
    multiTenant: false,
    adminConsole: false,
    cloudSync: false,
    storageProviders: ["local"],
    modelProviders: ["official", "openai-compatible"],
    authProviders: [],
    billingProviders: ["none"],
    notificationProviders: []
  },
  "private-cloud": {
    web: true,
    desktop: true,
    extension: true,
    miniprogram: true,
    mobileApp: true,
    publicGallery: true,
    categoryKit: true,
    photoshopPackage: true,
    seedanceVideo: true,
    billing: false,
    appleIap: false,
    license: true,
    multiTenant: true,
    adminConsole: true,
    cloudSync: true,
    storageProviders: ["local", "oss", "cos", "s3", "minio"],
    modelProviders: ["official", "openai-compatible", "private"],
    authProviders: ["local-account", "sso"],
    billingProviders: ["license", "balance"],
    notificationProviders: ["web", "apns", "getui", "wechat-miniapp"]
  },
  saas: {
    web: true,
    desktop: true,
    extension: true,
    miniprogram: true,
    mobileApp: true,
    publicGallery: true,
    categoryKit: true,
    photoshopPackage: true,
    seedanceVideo: true,
    billing: true,
    appleIap: true,
    license: false,
    multiTenant: true,
    adminConsole: true,
    cloudSync: true,
    storageProviders: ["oss", "cos"],
    modelProviders: ["official", "openai-compatible"],
    authProviders: ["saas-account"],
    billingProviders: ["alipay", "apple-iap", "balance"],
    notificationProviders: ["web", "apns", "getui", "wechat-miniapp"]
  }
};

export function getDeploymentProfile(): DeploymentProfileResponse {
  const edition = parseDeploymentEdition(process.env.DEPLOYMENT_PROFILE);
  const baseProfile: DeploymentProfileResponse = {
    edition,
    target: parseDeploymentTarget(process.env.DEPLOYMENT_TARGET) ?? DEFAULT_TARGETS[edition],
    name: process.env.DEPLOYMENT_PROFILE_NAME?.trim() || DEFAULT_PROFILE_NAMES[edition],
    capabilities: cloneCapabilities(DEFAULT_CAPABILITIES[edition])
  };

  if (edition === "local" || baseProfile.target === "desktop") {
    return baseProfile;
  }

  return applyCapabilityOverrides(baseProfile, process.env.CAPABILITIES_OVERRIDES_JSON);
}

function parseDeploymentEdition(value: string | undefined): DeploymentEdition {
  switch (value?.trim()) {
    case "local":
      return "local";
    case "private-cloud":
      return "private-cloud";
    case "saas":
      return "saas";
    default:
      return "saas";
  }
}

function parseDeploymentTarget(value: string | undefined): DeploymentTarget | undefined {
  switch (value?.trim()) {
    case "desktop":
      return "desktop";
    case "server":
      return "server";
    case "managed-cloud":
      return "managed-cloud";
    default:
      return undefined;
  }
}

function applyCapabilityOverrides(profile: DeploymentProfileResponse, rawOverrides: string | undefined): DeploymentProfileResponse {
  if (!rawOverrides?.trim()) {
    return profile;
  }

  try {
    const overrides = JSON.parse(rawOverrides) as unknown;
    if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) {
      return profile;
    }

    return {
      ...profile,
      capabilities: {
        ...profile.capabilities,
        ...filterCapabilityOverrides(overrides)
      }
    };
  } catch {
    return profile;
  }
}

function filterCapabilityOverrides(overrides: object): Partial<DeploymentCapabilities> {
  const filtered: Partial<DeploymentCapabilities> = {};
  for (const key of Object.keys(DEFAULT_CAPABILITIES.saas) as Array<keyof DeploymentCapabilities>) {
    const value = (overrides as Record<string, unknown>)[key];
    if (typeof DEFAULT_CAPABILITIES.saas[key] === "boolean" && typeof value === "boolean") {
      (filtered as Record<string, unknown>)[key] = value;
    } else if (Array.isArray(DEFAULT_CAPABILITIES.saas[key]) && Array.isArray(value)) {
      (filtered as Record<string, unknown>)[key] = value.filter((item): item is string => typeof item === "string");
    }
  }
  return filtered;
}

function cloneCapabilities(capabilities: DeploymentCapabilities): DeploymentCapabilities {
  return {
    ...capabilities,
    storageProviders: [...capabilities.storageProviders],
    modelProviders: [...capabilities.modelProviders],
    authProviders: [...capabilities.authProviders],
    billingProviders: [...capabilities.billingProviders],
    notificationProviders: [...capabilities.notificationProviders]
  };
}
