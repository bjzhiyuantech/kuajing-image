import { app } from "../index.js";

interface GateCase {
  capability: string;
  path: string;
  method?: string;
  body?: unknown;
  demoTenant?: boolean;
}

const gateCases: GateCase[] = [
  { capability: "extension", path: "/api/extension-release" },
  { capability: "mobileApp", path: "/api/app-release" },
  { capability: "publicGallery", path: "/api/public/gallery" },
  { capability: "photoshopPackage", path: "/api/photoshop/packages", method: "POST", body: {} },
  { capability: "seedanceVideo", path: "/api/videos/seedance/storyboard-plan", method: "POST", body: {} },
  {
    capability: "categoryKit",
    path: "/api/ecommerce/images/batch-generate",
    method: "POST",
    body: {
      product: { title: "Demo" },
      platform: "amazon",
      market: "us",
      textLanguage: "en",
      sceneTemplateIds: ["single-product-long-poster"],
      size: { width: 1024, height: 1536 },
      quality: "auto",
      outputFormat: "png",
      countPerScene: 1
    },
    demoTenant: true
  },
  { capability: "categoryKit", path: "/api/ecommerce/images/category-kit-prepare", method: "POST", body: {} },
  { capability: "billing", path: "/api/billing/summary" },
  { capability: "appleIap", path: "/api/billing/apple-iap/verify", method: "POST", body: {} }
];

const previousOverrides = process.env.CAPABILITIES_OVERRIDES_JSON;
const previousDemoAuth = process.env.ALLOW_DEMO_AUTH;
process.env.CAPABILITIES_OVERRIDES_JSON = JSON.stringify(
  Object.fromEntries(gateCases.map((item) => [item.capability, false]))
);
process.env.ALLOW_DEMO_AUTH = "true";

try {
  for (const item of gateCases) {
    const response = await app.request(item.path, {
      method: item.method || "GET",
      headers: {
        ...(item.method ? { "Content-Type": "application/json" } : {}),
        ...(item.demoTenant ? { "x-user-id": "deployment-gate-test", "x-workspace-id": "deployment-gate-test" } : {})
      },
      body: item.method ? JSON.stringify(item.body ?? {}) : undefined
    });
    if (response.status !== 403) {
      throw new Error(`${item.method || "GET"} ${item.path} expected 403, got ${response.status}`);
    }
    const payload = (await response.json()) as { error?: { code?: string } };
    if (payload.error?.code !== "feature_disabled") {
      throw new Error(`${item.method || "GET"} ${item.path} expected feature_disabled, got ${JSON.stringify(payload)}`);
    }
    console.log(`OK ${item.capability}: ${item.method || "GET"} ${item.path}`);
  }
} finally {
  if (previousOverrides === undefined) {
    delete process.env.CAPABILITIES_OVERRIDES_JSON;
  } else {
    process.env.CAPABILITIES_OVERRIDES_JSON = previousOverrides;
  }
  if (previousDemoAuth === undefined) {
    delete process.env.ALLOW_DEMO_AUTH;
  } else {
    process.env.ALLOW_DEMO_AUTH = previousDemoAuth;
  }
}
