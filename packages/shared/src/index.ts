export const IMAGE_MODEL = "gpt-image-2" as const;

export type ImageModel = string;
export type ImageMode = "generate" | "edit";
export type ImageQuality = "auto" | "low" | "medium" | "high";
export type OutputFormat = "png" | "jpeg" | "webp" | "mp4";
export type GenerationStatus = "pending" | "running" | "succeeded" | "partial" | "failed" | "cancelled";
export type OutputStatus = "succeeded" | "failed";
export type CloudStorageProvider = "cos" | "oss";
export type AssetCloudUploadStatus = "uploaded" | "failed";
export type EcommercePlatform =
  | "amazon"
  | "allegro"
  | "ozon"
  | "shopify"
  | "tiktok-shop"
  | "temu"
  | "shein"
  | "etsy"
  | "aliexpress"
  | "1688"
  | "taobao"
  | "tmall"
  | "jd"
  | "douyin"
  | "pinduoduo"
  | "xiaohongshu"
  | "kuaishou"
  | "weidian"
  | "dewu"
  | "other";
export type EcommerceMarket = "cn" | "us" | "uk" | "pl" | "ru" | "eu" | "ca" | "au" | "jp" | "kr" | "sg" | "mx" | "br" | "global";
export type EcommerceGenerationMode =
  | "enhance"
  | "creative"
  | "category-kit"
  | "marketing-main"
  | "single-poster"
  | "one-click-replace"
  | "text-translation";
export type BrandOverlayPlacement = "top-left" | "top-right" | "bottom-left" | "bottom-right";
export type EcommerceTextLanguage =
  | "none"
  | "zh-hans"
  | "zh-hant"
  | "ko"
  | "ja"
  | "en"
  | "de"
  | "pl"
  | "ru"
  | "fr"
  | "es"
  | "it"
  | "pt"
  | "nl"
  | "ar";

export interface SizePreset {
  id: string;
  label: string;
  width: number;
  height: number;
  description: string;
}

export const SIZE_PRESETS: SizePreset[] = [
  { id: "square-1k", label: "方图 1K", width: 1024, height: 1024, description: "头像和社交图片" },
  { id: "ozon-3-4", label: "Ozon 3:4", width: 1536, height: 2048, description: "Ozon 商品图推荐比例" },
  { id: "poster-portrait", label: "竖版海报", width: 1024, height: 1536, description: "海报、封面和移动端竖图" },
  { id: "poster-landscape", label: "横版海报", width: 1536, height: 1024, description: "横版封面和桌面图片" },
  { id: "story-9-16", label: "故事图 9:16", width: 1088, height: 1920, description: "短视频封面和故事图片" },
  { id: "ecommerce-long-poster", label: "电商长海报", width: 1024, height: 3072, description: "单品详情页和完整长海报" },
  { id: "video-16-9", label: "视频封面 16:9", width: 1920, height: 1088, description: "视频封面和演示图片" },
  { id: "wide-2k", label: "宽幅 2K", width: 2560, height: 1440, description: "展示页和宽幅构图" },
  { id: "portrait-2k", label: "竖图 2K", width: 1440, height: 2560, description: "高分辨率竖版图片" },
  { id: "square-2k", label: "方图 2K", width: 2048, height: 2048, description: "高分辨率方图" },
  { id: "wide-4k", label: "宽幅 4K", width: 3840, height: 2160, description: "大屏展示图片" }
];

export const STYLE_PRESETS = [
  {
    id: "none",
    label: "None",
    prompt: ""
  },
  {
    id: "photoreal",
    label: "Photoreal",
    prompt: "photorealistic, natural lighting, high detail, realistic materials"
  },
  {
    id: "product",
    label: "Product",
    prompt: "premium product photography, clean studio lighting, sharp focus, commercial composition"
  },
  {
    id: "illustration",
    label: "Illustration",
    prompt: "polished editorial illustration, clear shapes, rich but balanced colors, professional finish"
  },
  {
    id: "poster",
    label: "Poster",
    prompt: "bold poster composition, strong focal point, refined typography space, cinematic color grading"
  },
  {
    id: "avatar",
    label: "Avatar",
    prompt: "character portrait, expressive face, clean background, high quality avatar style"
  }
] as const;

export type StylePresetId = (typeof STYLE_PRESETS)[number]["id"];

export const IMAGE_QUALITIES: ImageQuality[] = ["auto", "low", "medium", "high"];
export const OUTPUT_FORMATS: OutputFormat[] = ["png", "jpeg", "webp"];
export const GENERATION_COUNTS = [1, 2, 4] as const;
export type GenerationCount = (typeof GENERATION_COUNTS)[number];

export const ECOMMERCE_PLATFORMS = [
  { id: "amazon", label: "Amazon" },
  { id: "allegro", label: "Allegro" },
  { id: "ozon", label: "Ozon" },
  { id: "shopify", label: "Shopify" },
  { id: "tiktok-shop", label: "TikTok Shop" },
  { id: "temu", label: "Temu" },
  { id: "shein", label: "SHEIN" },
  { id: "etsy", label: "Etsy" },
  { id: "aliexpress", label: "AliExpress" },
  { id: "1688", label: "1688" },
  { id: "taobao", label: "淘宝" },
  { id: "tmall", label: "天猫" },
  { id: "jd", label: "京东" },
  { id: "douyin", label: "抖音电商" },
  { id: "pinduoduo", label: "拼多多" },
  { id: "xiaohongshu", label: "小红书" },
  { id: "kuaishou", label: "快手小店" },
  { id: "weidian", label: "微店" },
  { id: "dewu", label: "得物" },
  { id: "other", label: "Other marketplace" }
] as const satisfies ReadonlyArray<{ id: EcommercePlatform; label: string }>;

export const ECOMMERCE_MARKETS = [
  { id: "cn", label: "中国大陆" },
  { id: "us", label: "United States" },
  { id: "uk", label: "United Kingdom" },
  { id: "pl", label: "Poland" },
  { id: "ru", label: "Russia" },
  { id: "eu", label: "European Union" },
  { id: "ca", label: "Canada" },
  { id: "au", label: "Australia" },
  { id: "jp", label: "Japan" },
  { id: "kr", label: "South Korea" },
  { id: "sg", label: "Singapore" },
  { id: "mx", label: "Mexico" },
  { id: "br", label: "Brazil" },
  { id: "global", label: "Global" }
] as const satisfies ReadonlyArray<{ id: EcommerceMarket; label: string }>;

export const ECOMMERCE_TEXT_LANGUAGES = [
  { id: "none", label: "不替换", promptLabel: "" },
  { id: "zh-hans", label: "简体中文", promptLabel: "Simplified Chinese" },
  { id: "zh-hant", label: "繁体中文", promptLabel: "Traditional Chinese" },
  { id: "ko", label: "韩文", promptLabel: "Korean" },
  { id: "ja", label: "日文", promptLabel: "Japanese" },
  { id: "en", label: "英文", promptLabel: "English" },
  { id: "de", label: "德文", promptLabel: "German" },
  { id: "pl", label: "波兰文", promptLabel: "Polish" },
  { id: "ru", label: "俄文", promptLabel: "Russian" },
  { id: "fr", label: "法文", promptLabel: "French" },
  { id: "es", label: "西班牙文", promptLabel: "Spanish" },
  { id: "it", label: "意大利文", promptLabel: "Italian" },
  { id: "pt", label: "葡萄牙文", promptLabel: "Portuguese" },
  { id: "nl", label: "荷兰文", promptLabel: "Dutch" },
  { id: "ar", label: "阿拉伯文", promptLabel: "Arabic" }
] as const satisfies ReadonlyArray<{ id: EcommerceTextLanguage; label: string; promptLabel: string }>;

export const ECOMMERCE_AUTO_CATEGORY_KIT_SCENE_IDS = [
  "category-kit-auto-main",
  "category-kit-auto-hero",
  "category-kit-auto-benefits",
  "category-kit-auto-detail",
  "category-kit-auto-guide",
  "category-kit-auto-lifestyle"
] as const;

export const ECOMMERCE_DETAIL_CATEGORY_KIT_SCENE_IDS = [
  "category-kit-auto-main",
  "category-kit-auto-hero",
  "category-kit-auto-overview",
  "category-kit-auto-benefits",
  "category-kit-auto-detail",
  "category-kit-auto-structure",
  "category-kit-auto-guide",
  "category-kit-auto-package",
  "category-kit-auto-usage",
  "category-kit-auto-lifestyle",
  "category-kit-auto-audience",
  "category-kit-auto-trust"
] as const;

const MARKET_TEXT_LOCALIZATION = {
  cn: {
    promptLabel: "Simplified Chinese",
    instruction: "Use concise Simplified Chinese copy suitable for mainland Chinese e-commerce."
  },
  us: {
    promptLabel: "English",
    instruction: "Use concise natural English copy suitable for the United States market."
  },
  uk: {
    promptLabel: "English",
    instruction: "Use concise natural English copy suitable for the United Kingdom market."
  },
  pl: {
    promptLabel: "Polish",
    instruction: "Use concise natural Polish copy suitable for the Poland market."
  },
  ru: {
    promptLabel: "Russian",
    instruction: "Use concise natural Russian copy suitable for Ozon and the Russia market."
  },
  eu: {
    promptLabel: "English",
    instruction: "Use concise natural English copy for EU-wide listings unless the product brief explicitly names a different EU country or language."
  },
  ca: {
    promptLabel: "English",
    instruction: "Use concise natural English copy suitable for Canada; use French only when the product brief explicitly targets Quebec or a French-language audience."
  },
  au: {
    promptLabel: "English",
    instruction: "Use concise natural English copy suitable for Australia."
  },
  jp: {
    promptLabel: "Japanese",
    instruction: "Use concise natural Japanese copy suitable for the Japan market."
  },
  kr: {
    promptLabel: "Korean",
    instruction: "Use concise natural Korean copy suitable for the South Korea market."
  },
  sg: {
    promptLabel: "English",
    instruction: "Use concise natural English copy suitable for Singapore."
  },
  mx: {
    promptLabel: "Spanish",
    instruction: "Use concise natural Spanish copy suitable for Mexico."
  },
  br: {
    promptLabel: "Portuguese",
    instruction: "Use concise natural Brazilian Portuguese copy suitable for Brazil."
  },
  global: {
    promptLabel: "English",
    instruction: "Use concise natural English copy for global marketplace use unless the user explicitly asks for another language."
  }
} as const satisfies Record<EcommerceMarket, { promptLabel: string; instruction: string }>;

const CHINESE_ECOMMERCE_PLATFORM_IDS = new Set<EcommercePlatform>([
  "1688",
  "taobao",
  "tmall",
  "jd",
  "douyin",
  "pinduoduo",
  "xiaohongshu",
  "kuaishou",
  "weidian",
  "dewu"
]);

const PLATFORM_TEXT_LOCALIZATION: Partial<Record<EcommercePlatform, { promptLabel: string; instruction: string }>> = {
  ozon: {
    promptLabel: "Russian",
    instruction: "Use concise natural Russian copy suitable for Ozon listings by default."
  }
} as const;

const PLATFORM_COMPLIANCE_RULES: Partial<Record<EcommercePlatform, string>> = {
  ozon: [
    "Ozon image compliance:",
    "For Ozon, prefer Russian listing text by default and keep the first/main listing image clean, truthful, and easy to inspect.",
    "Ozon product images should use JPEG/JPG, PNG, HEIC, or WEBP and stay within 10 MB; design generated outputs so they can be exported within that limit.",
    "Resolution guidance: for Clothing, Footwear, and Accessories, use at least 900 x 1200 px; for other categories, stay within 200 x 200 to 4320 x 7680 px unless the user provides a newer category-specific requirement.",
    "Use an Ozon-friendly vertical 3:4 composition by default, with the product occupying most of the frame without being cropped.",
    "Keep the product complete, sharp, well lit, and visually dominant. For a main image, use a white or light neutral background and avoid promotional text, logos, watermarks, frames, collages, unrelated props, contact details, QR codes, external links, fake platform badges, or unsupported certification marks.",
    "Secondary images may use concise Russian callouts, dimensions, usage scenes, set contents, or detail highlights only when supported by the product brief or visible reference."
  ].join(" ")
} as const;

export const ECOMMERCE_SCENE_TEMPLATES = [
  {
    id: "marketplace-main",
    mode: "enhance",
    label: "白底主图优化",
    defaultSizePresetId: "square-1k",
    prompt:
      "Enhance the source product image into a clean marketplace main image. Keep the exact product identity, structure, color, material, proportions, and visible details from the reference image. Use a pure white background, product centered, realistic commercial lighting, no redesign, no added props, no watermark."
  },
  {
    id: "logo-benefit",
    mode: "enhance",
    label: "卖点图",
    defaultSizePresetId: "poster-landscape",
    prompt:
      "Create an e-commerce benefit image based on the source product image. Keep the product unchanged and build a clean concise selling-point text layout. Do not invent product features. Text must be large, readable, and placed outside the product. Leave clear empty space for a brand mark to be added later, but do not generate any logo, brand wordmark, fake trademark, or placeholder logo."
  },
  {
    id: "feature-benefit",
    mode: "enhance",
    label: "功能说明图",
    defaultSizePresetId: "poster-landscape",
    prompt:
      "Create a feature explanation image from the source product image. Preserve the product exactly, then add neat callout lines, icon-like markers, and short readable feature text around the product. Do not change the product design, material, color, or proportions."
  },
  {
    id: "promo-poster",
    mode: "enhance",
    label: "促销海报",
    defaultSizePresetId: "poster-portrait",
    prompt:
      "Create a promotional marketplace poster from the source product image. Keep the product exact and build a clean commercial layout with room for discount text, brand area, and short selling points. Do not redesign the product or add misleading claims."
  },
  {
    id: "marketing-main-hero",
    mode: "marketing-main",
    label: "点击主图",
    defaultSizePresetId: "square-1k",
    prompt:
      "Create a high-click e-commerce marketing main image for the selected target market from 1 to 3 product reference images. Preserve the real product identity, color, material, shape, and key details. Build a search-result thumbnail composition with the product as the clearest hero, one strong reason to click, concise target-market copy, and a clean commercial layout. Choose whether the product should be shown alone, worn, in use, brewed, plated, held, opened, or placed in a scene according to category and target customer. Avoid unsupported claims, fake certificates, fake official badges, fake platform badges, and unreadable text."
  },
  {
    id: "marketing-main-people-scene",
    mode: "marketing-main",
    label: "人群场景主图",
    defaultSizePresetId: "square-1k",
    prompt:
      "Create a target-market marketplace main image that combines the product with a credible target-customer and usage-scene expression when it improves click appeal. Apparel and shoes should usually be worn on a suitable model or body detail; tea, drinks, and food should usually show the prepared or consumed state plus the product package; gifts should show a clear gifting moment or recipient context. Keep the product truthful and visually dominant. Use short readable localized selling copy only when supported by the brief."
  },
  {
    id: "marketing-main-benefit-hook",
    mode: "marketing-main",
    label: "卖点钩子主图",
    defaultSizePresetId: "square-1k",
    prompt:
      "Create a high-converting e-commerce main image for the selected target market centered on the strongest purchase reason. Use one main hook, 2 to 3 short supporting points, and visual evidence such as material texture, before/after context, size comparison, usage result, comfort, freshness, gift value, convenience, or service promise only when supported by the product brief or visible reference. Keep copy concise, large, localized, and readable in a small thumbnail."
  },
  {
    id: "marketing-main-trust-promo",
    mode: "marketing-main",
    label: "信任促销主图",
    defaultSizePresetId: "square-1k",
    prompt:
      "Create a target-market e-commerce marketing main image that adds credible trust and conversion elements around the product: service badges, delivery promises, return policy notes, authenticity notes, or official-store wording only if the user explicitly provides them. Use one small corner badge or benefit chip when useful, never fake platform certification or official status. Product remains the hero, layout is clean, no clutter, no watermark."
  },
  {
    id: "text-translation",
    mode: "text-translation",
    label: "文字翻译",
    defaultSizePresetId: "square-1k",
    prompt:
      "Translate the readable product or marketing text in the source image into the requested target language. Preserve the original image composition, crop, product, background, spacing, visual hierarchy, and text placement as closely as possible. Do not create a new scene, do not add new claims, and do not redesign the product. Keep brand names, model numbers, legal marks, and non-translation marks unchanged unless they are clearly generic marketing copy."
  },
  {
    id: "single-product-long-poster",
    mode: "single-poster",
    label: "单品完整长海报",
    defaultSizePresetId: "ecommerce-long-poster",
    prompt:
      "Create one complete tall e-commerce product poster from 1 to 3 source product reference images. If multiple references are provided, treat the first as the main product identity and use the others only as detail, texture, packaging, angle, scale, or usage evidence. First internally analyze the visible product and the provided product brief, then summarize the strongest credible selling points before composing the image. Do not show the analysis, raw prompt, or planning text. Build a polished vertical poster with a strong hero product area, concise headline, 3 to 5 readable benefit sections, feature/detail callouts, usage or lifestyle context when credible, and a clean closing purchase-value area. Keep all claims supported by the reference images or user-provided brief. Preserve the real product identity, shape, color, material, proportions, packaging, and labels. Use a high vertical e-commerce detail-page layout, clear typography hierarchy, generous spacing, and mobile-readable copy. No fake certifications, fake platform badges, fake brand logos, unsupported promises, watermark, clutter, or unreadable text."
  },
  {
    id: "one-click-replace",
    mode: "one-click-replace",
    label: "一键换装/换品",
    defaultSizePresetId: "square-1k",
    prompt:
      "Create one realistic commercial edit by placing the replacement garment or product from the additional reference image(s) into the target model or scene from the first reference image. The first reference image is the target person, model, room, tabletop, shelf, package scene, or lifestyle scene. Preserve the target image's camera angle, pose, body proportions, background, lighting, shadows, crop, and overall composition. Use the replacement reference only for the exact garment or product identity: color, material, pattern, silhouette, logo-free visible details, proportions, and packaging if present. If the target is a model and the replacement is clothing, make the garment naturally worn on the body with realistic drape, fit, folds, occlusion, and contact shadows; preserve face, hands, hair, skin tone, body shape, and pose. If the target is a scene, place the product naturally into the scene at credible scale with matching perspective, lighting, reflections, and shadows. Remove the original garment or object being replaced only where necessary. Do not create side-by-side comparisons, floating product cutouts, collages, extra duplicate products, fake labels, watermarks, or unsupported text. The output must look like a single finished product photo."
  },
  {
    id: "category-kit-auto-main",
    mode: "category-kit",
    label: "1 平台合规主图",
    defaultSizePresetId: "square-1k",
    prompt:
      "Create the first marketplace listing image for the product after internally identifying the product category, sellable SKU, platform, and market from the reference images and brief. Preserve the real product identity, color, material, shape, labels, package, and proportions. Choose a platform-safe main image expression for this category: usually one clean product on white or very light neutral background, centered, complete, sharp, with no text, no logo, no watermark, no props, no collage, and no unsupported extra items. Do not assume the product is a scarf or accessory."
  },
  {
    id: "category-kit-auto-hero",
    mode: "category-kit",
    label: "2 点击主图候选",
    defaultSizePresetId: "square-1k",
    prompt:
      "Create a click-oriented secondary main-image candidate for the same product. First infer the category and decide the best truthful product expression: worn, held, opened, prepared, installed, in use, styled, scale-focused, or product-only. Keep the product as the clear hero and preserve its real appearance. Add only concise localized copy when the selected platform and image role allow text; otherwise keep it clean. Do not use fixed scarf, apparel, food, or electronics assumptions unless the product is actually that category."
  },
  {
    id: "category-kit-auto-overview",
    mode: "category-kit",
    label: "3 整体展示图",
    defaultSizePresetId: "square-1k",
    prompt:
      "Create a complete product overview image for the detail page. Internally identify what the buyer needs to understand first for this category: full product body, front and back, opened and closed states, package plus product, set components, assembled state, worn state, prepared state, or installed state. Show the overall product clearly without clutter. If several angles or states are necessary, use a tidy 2 to 4 panel composition; otherwise use one strong overview composition. Preserve all real product details and do not invent variants or included items."
  },
  {
    id: "category-kit-auto-benefits",
    mode: "category-kit",
    label: "4 核心卖点图",
    defaultSizePresetId: "square-1k",
    prompt:
      "Create a category-specific selling-point image for the detail page. Select 3 to 5 credible benefits from the reference images and product brief, such as material, size, capacity, compatibility, comfort, craftsmanship, package contents, portability, freshness, use scenario, gift value, design, storage, durability, convenience, or service points. Prioritize the points that matter most for this exact category and target customer. Use short localized copy with clear hierarchy and enough empty space around the product. Do not invent certifications, rankings, medical effects, performance numbers, official badges, or unsupported claims."
  },
  {
    id: "category-kit-auto-detail",
    mode: "category-kit",
    label: "5 细节/材质图",
    defaultSizePresetId: "square-1k",
    prompt:
      "Create a detail image that best supports conversion for this product category. Choose the most relevant detail from the references and brief: texture, fabric, stitching, edge, connector, button, ingredient, finish, package label, structure, accessory, craftsmanship, surface, or before-use detail. The detail should remain truthful to the product and visually close enough to inspect. Use minimal callouts only when helpful and supported."
  },
  {
    id: "category-kit-auto-structure",
    mode: "category-kit",
    label: "6 结构/工艺图",
    defaultSizePresetId: "square-1k",
    prompt:
      "Create a structure, craftsmanship, or component explanation image that adapts to the product category. For apparel or shoes, show construction, lining, sole, closure, fabric layers, or fit-related details. For electronics or tools, show controls, ports, parts, assembly, or functional structure. For food, cosmetics, or household goods, show ingredients, texture, container, applicator, seal, or usage mechanism. For sets, show included components. Use callouts only for visible or user-provided facts. If structure is not relevant, replace this with the next most useful category-specific detail image."
  },
  {
    id: "category-kit-auto-guide",
    mode: "category-kit",
    label: "7 规格/尺寸图",
    defaultSizePresetId: "square-1k",
    prompt:
      "Create the most relevant specification, size, capacity, scale, fit, compatibility, or parameter image for this category. Use exact measurements, quantity, variants, model compatibility, capacity, care limits, or specs only when provided in the product brief or clearly visible. If exact numbers are absent, use qualitative scale, comparison, or labeled areas without guessing. For apparel and shoes, prioritize size/fit guidance; for devices, prioritize parameters and compatibility; for home goods, prioritize dimensions and capacity; for food or beauty, prioritize net content, texture, or package size. Keep labels concise, localized, and readable."
  },
  {
    id: "category-kit-auto-package",
    mode: "category-kit",
    label: "8 包装/清单/SKU图",
    defaultSizePresetId: "square-1k",
    prompt:
      "Create a package, contents, set, color/SKU, or bundle explanation image only using information from the references and brief. Show what the buyer receives clearly: product, accessories, packaging, variants, quantity, gift box, refills, or included parts when provided. If real packaging is not visible or described, do not invent branded boxes, tags, bags, certifications, or extra accessories. If package contents are not relevant, adapt this role to a variant, color, or set overview that is truthful for the product."
  },
  {
    id: "category-kit-auto-usage",
    mode: "category-kit",
    label: "9 用法/步骤图",
    defaultSizePresetId: "square-1k",
    prompt:
      "Create a usage, installation, wearing, preparation, cleaning, care, or operation image for this product category. Choose the workflow that buyers most need to understand: how to wear, how to use, how to install, how to open, how to prepare, how to apply, how to clean, or how to store. Use 2 to 4 simple steps only when the product naturally has steps; otherwise show one clear in-use state. Do not invent difficult instructions, safety claims, or unsupported effects."
  },
  {
    id: "category-kit-auto-lifestyle",
    mode: "category-kit",
    label: "10 场景转化图",
    defaultSizePresetId: "square-1k",
    prompt:
      "Create a realistic conversion-oriented lifestyle or usage image for the product. Infer the strongest target customer and use scenario from the brief, platform, market, and product category. Add only credible scene props or people when they make sense for the category, and keep the product recognizable, accurate, and visually dominant. No fake brands, fake logos, fake platform marks, unsupported claims, clutter, watermark, or distorted anatomy."
  },
  {
    id: "category-kit-auto-audience",
    mode: "category-kit",
    label: "11 人群/场景图",
    defaultSizePresetId: "square-1k",
    prompt:
      "Create a target-customer or scenario-specific detail-page image that explains who this product is for and when it is used. Adapt the expression by category: model/body detail for wearable goods, family/home context for household products, desk/work/travel context for gadgets, gift recipient context for gifts, cooking/serving context for food, routine/application context for beauty, or installation context for tools. Keep people and props credible, avoid identifiable faces unless requested, and make the product the clear proof point."
  },
  {
    id: "category-kit-auto-trust",
    mode: "category-kit",
    label: "12 保障/注意事项图",
    defaultSizePresetId: "square-1k",
    prompt:
      "Create a closing detail-page image for trust, care, after-sales, precautions, service, maintenance, or purchase reassurance. Use only claims explicitly provided by the user, such as warranty, returns, shipping, authenticity, care method, storage notes, materials, package note, or customer service. If no trust or service facts are provided, create a neutral care, maintenance, usage note, or purchase reminder image that does not invent promises. Never add fake platform badges, official certifications, awards, guarantees, medical claims, or legal marks."
  },
  {
    id: "lifestyle",
    mode: "creative",
    label: "生活方式图",
    defaultSizePresetId: "poster-landscape",
    prompt:
      "Create a realistic lifestyle image using the reference product as the hero item. Preserve the product's key shape, color, material, and recognizable details while rebuilding the environment, lighting, props, and composition. Premium e-commerce photography, authentic setting, clear product visibility, no watermark."
  },
  {
    id: "model-wear",
    mode: "creative",
    label: "国外模特穿戴图",
    defaultSizePresetId: "poster-portrait",
    prompt:
      "Create a realistic overseas model usage image with the reference product worn, held, or used naturally when appropriate for the product category. Keep the product recognizable and commercially accurate. Use tasteful international e-commerce styling, natural pose, realistic lighting, no extra hands, no distorted anatomy."
  },
  {
    id: "accessory-match",
    mode: "creative",
    label: "配饰搭配图",
    defaultSizePresetId: "poster-landscape",
    prompt:
      "Create a curated accessory-matching scene around the reference product. Keep the product as the main subject and preserve its key visual features. Add complementary props, styling elements, and a premium marketplace composition without changing the product itself."
  },
  {
    id: "seasonal-campaign",
    mode: "creative",
    label: "节日促销图",
    defaultSizePresetId: "poster-portrait",
    prompt:
      "Create a seasonal promotional product scene using the reference product as the main subject. Festive but not cluttered, premium marketplace ad style, clean space for later promotional text, no fake text, no watermark."
  },
  {
    id: "social-ad",
    mode: "creative",
    label: "社媒广告图",
    defaultSizePresetId: "story-9-16",
    prompt:
      "Create a high-converting social commerce ad creative using the reference product. Strong visual hook, mobile-first composition, realistic lighting, clear product benefit, no watermark, no unreadable text."
  },
  {
    id: "allegro-scarf-main-flat",
    mode: "category-kit",
    label: "1 白底完整主图",
    defaultSizePresetId: "square-2k",
    prompt:
      "Create an Allegro-compliant main listing image for a scarf or silk scarf. Pure white or very light gray background, square composition, one single scarf fully visible and neatly flat-laid. Preserve the source scarf pattern, color, edge shape, proportions, weave, and material truthfully. No text, icons, borders, logo, watermark, props, packaging, collage, extra products, or human model. The image must work as a search result thumbnail."
  },
  {
    id: "allegro-scarf-main-styled",
    mode: "category-kit",
    label: "2 白底造型主图候选",
    defaultSizePresetId: "square-2k",
    prompt:
      "Create a second Allegro-compliant main-image candidate for a scarf or silk scarf. White or very light gray background, one single scarf arranged in an elegant folded or naturally draped shape with more volume, clean studio lighting, square crop. Preserve exact pattern, colors, edges, and material from the source. No text, icons, borders, logo, watermark, props, packaging, collage, or model."
  },
  {
    id: "allegro-scarf-drape-product",
    mode: "category-kit",
    label: "3 折叠/垂落产品图",
    defaultSizePresetId: "square-2k",
    prompt:
      "Create a clean product-page image of the scarf folded and softly draped to show volume, sheen, and fabric flow. Minimal white or pale neutral studio background, no text, no logo, no border. Keep the scarf design, color, edge finishing, and material faithful to the reference."
  },
  {
    id: "allegro-scarf-fabric-detail",
    mode: "category-kit",
    label: "4 面料纹理细节图",
    defaultSizePresetId: "square-2k",
    prompt:
      "Create a macro detail image of the scarf fabric, showing fibers, soft sheen, weave texture, and lightweight smooth feel. Keep the source pattern and color accurate. Include only a small clean Polish text callout if text is requested: 'Miękka i lekka tkanina'. Do not use this as the main image; no logo or watermark."
  },
  {
    id: "allegro-scarf-edge-detail",
    mode: "category-kit",
    label: "5 边缘工艺图",
    defaultSizePresetId: "square-2k",
    prompt:
      "Create a close-up detail image of the scarf edge finishing: rolled hem, stitching, seam, and corner craftsmanship. Accurate material and pattern continuation from the reference scarf. Clean studio lighting, no logo, no watermark. Polish text is optional only when requested and must be short and readable."
  },
  {
    id: "allegro-scarf-size-guide",
    mode: "category-kit",
    label: "6 尺寸说明图",
    defaultSizePresetId: "square-2k",
    prompt:
      "Create a scarf size guide image for Allegro product pages. Show the scarf flat-laid with clean measurement lines and a clear size label using the dimensions provided by the user, for example 70 x 70 cm, 90 x 90 cm, or 180 x 65 cm. A hand, hanger, or subtle human outline may be used only as scale reference. Keep the scarf pattern accurate. This is not a main image, so concise Polish labels are allowed."
  },
  {
    id: "allegro-scarf-wear-grid",
    mode: "category-kit",
    label: "7 多佩戴方式图",
    defaultSizePresetId: "square-2k",
    prompt:
      "Create a 4-panel or 5-panel usage grid for a scarf: neck scarf, hair accessory, tied on a handbag, gift styling, and optionally wrist or belt styling. Keep the same scarf design recognizable in every panel. Use clean European daily styling. Polish short labels may be used when requested: 'Na szyję', 'Do włosów', 'Do torebki', 'Na prezent'. Not for the first listing image."
  },
  {
    id: "allegro-scarf-neck-model",
    mode: "category-kit",
    label: "8 颈部模特图",
    defaultSizePresetId: "poster-portrait",
    prompt:
      "Create a realistic European daily outfit image showing the scarf worn around the neck. Use a faceless or neck-down crop, or an unclear side profile with no identifiable face. Style: simple commute, French minimal, clean background, authentic product-page photography. Keep scarf pattern, color, and fabric faithful. No logo or watermark."
  },
  {
    id: "allegro-scarf-bag-styling",
    mode: "category-kit",
    label: "9 包包装饰图",
    defaultSizePresetId: "square-2k",
    prompt:
      "Create a realistic product usage scene where the scarf is tied elegantly on a handbag or tote bag. European, simple, daily, commercially credible styling. The scarf remains the visual hero and keeps the exact pattern, colors, and fabric feel from the reference. No logo, no watermark, no misleading extra items."
  },
  {
    id: "allegro-scarf-lifestyle",
    mode: "category-kit",
    label: "10 生活方式图",
    defaultSizePresetId: "poster-landscape",
    prompt:
      "Create a realistic lifestyle image for a scarf: spring/summer lightweight outfit, autumn trench or knitwear pairing, travel, office, cafe, or gift scene according to the user's chosen style. Polish or European aesthetics, clean and natural, not overly advertising-like. Preserve scarf identity and do not add fake brand marks."
  },
  {
    id: "allegro-scarf-sku-colors",
    mode: "category-kit",
    label: "11 颜色/SKU 图",
    defaultSizePresetId: "square-2k",
    prompt:
      "Create a color or SKU overview image for the scarf only if multiple colors or SKUs are provided. Show each variant clearly in a tidy matrix and avoid implying the customer receives multiple pieces unless the listing says so. This image is not suitable as the first main image. Keep labels minimal and accurate, no logo or watermark."
  },
  {
    id: "allegro-scarf-care-gift",
    mode: "category-kit",
    label: "12 洗护/礼品图",
    defaultSizePresetId: "square-2k",
    prompt:
      "Create a clean care and gift-support image for the scarf. Include simple care icons or concise Polish labels when requested: 'Pranie ręczne', 'Nie wybielać', 'Prasować w niskiej temperaturze'. If real packaging is provided, show gift box, tag, or bag accurately; if packaging is not provided, only create a gift mood image and do not invent a box. Optional Polish gift phrase: 'Pomysł na prezent'."
  },
  {
    id: "allegro-scarf-ads-social",
    mode: "category-kit",
    label: "广告/社媒扩展图",
    defaultSizePresetId: "story-9-16",
    prompt:
      "Create an advertising or social media creative for the scarf for Allegro Ads, Facebook, Instagram, or TikTok Shop. More atmospheric and scroll-stopping than listing images, but keep product identity accurate. This must be clearly separate from the Allegro main image set. Polish short copy is allowed only if requested; no fake brand marks or unsupported claims."
  }
] as const satisfies ReadonlyArray<{
  id: string;
  mode: EcommerceGenerationMode;
  label: string;
  defaultSizePresetId: ImageSizePresetId;
  prompt: string;
}>;

export type EcommerceSceneTemplateId = (typeof ECOMMERCE_SCENE_TEMPLATES)[number]["id"];

export interface EcommerceProductBrief {
  title: string;
  description?: string;
  bulletPoints?: string[];
  targetCustomer?: string;
  usageScene?: string;
  material?: string;
  color?: string;
  brandTone?: string;
}

export interface EcommercePromptContext {
  product: EcommerceProductBrief;
  platform: EcommercePlatform;
  market: EcommerceMarket;
  textLanguage?: EcommerceTextLanguage;
  allowTextRecreation?: boolean;
  removeWatermarkAndLogo?: boolean;
  brandOverlayPlacement?: BrandOverlayPlacement;
  sceneTemplateId: EcommerceSceneTemplateId;
  extraDirection?: string;
}

export interface ImageSize {
  width: number;
  height: number;
}

export const CUSTOM_SIZE_PRESET_ID = "custom" as const;
export type ImageSizePresetId = (typeof SIZE_PRESETS)[number]["id"] | typeof CUSTOM_SIZE_PRESET_ID;

export type ValidationResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      code: string;
      message: string;
    };

export type ImageSizeValidationResult =
  | {
      ok: true;
      size: ImageSize;
      apiValue: string;
      source: "preset" | "custom";
      presetId?: ImageSizePresetId;
      requestedSize?: ImageSize;
      normalized: boolean;
    }
  | {
      ok: false;
      code: "invalid_size" | "invalid_size_preset";
      message: string;
    };

export const MIN_IMAGE_DIMENSION = 512;
export const MAX_IMAGE_DIMENSION = 3840;
export const IMAGE_SIZE_MULTIPLE = 16;
export const MIN_TOTAL_PIXELS = 655_360;
export const MAX_TOTAL_PIXELS = 8_294_400;
export const MAX_IMAGE_ASPECT_RATIO = 3;

export function validateImageSize(size: ImageSize): ValidationResult {
  if (!Number.isInteger(size.width) || !Number.isInteger(size.height)) {
    return { ok: false, code: "invalid_size", message: "宽度和高度必须是整数。" };
  }
  if (size.width < MIN_IMAGE_DIMENSION || size.height < MIN_IMAGE_DIMENSION) {
    return { ok: false, code: "invalid_size", message: `宽度和高度不能小于 ${MIN_IMAGE_DIMENSION}px。` };
  }
  if (size.width > MAX_IMAGE_DIMENSION || size.height > MAX_IMAGE_DIMENSION) {
    return { ok: false, code: "invalid_size", message: `宽度和高度不能大于 ${MAX_IMAGE_DIMENSION}px。` };
  }
  if (size.width % IMAGE_SIZE_MULTIPLE !== 0 || size.height % IMAGE_SIZE_MULTIPLE !== 0) {
    return { ok: false, code: "invalid_size", message: `宽度和高度必须是 ${IMAGE_SIZE_MULTIPLE}px 的倍数。` };
  }
  if (Math.max(size.width, size.height) / Math.min(size.width, size.height) > MAX_IMAGE_ASPECT_RATIO) {
    return { ok: false, code: "invalid_size", message: `长边和短边比例不能超过 ${MAX_IMAGE_ASPECT_RATIO}:1。` };
  }
  if (size.width * size.height < MIN_TOTAL_PIXELS) {
    return { ok: false, code: "invalid_size", message: `总像素不能小于 ${MIN_TOTAL_PIXELS.toLocaleString()}。` };
  }
  if (size.width * size.height > MAX_TOTAL_PIXELS) {
    return { ok: false, code: "invalid_size", message: `总像素不能超过 ${MAX_TOTAL_PIXELS.toLocaleString()}。` };
  }
  return { ok: true };
}

function validateImageSizeWithoutMultiple(size: ImageSize): ValidationResult {
  if (!Number.isInteger(size.width) || !Number.isInteger(size.height)) {
    return { ok: false, code: "invalid_size", message: "宽度和高度必须是整数。" };
  }
  if (size.width < MIN_IMAGE_DIMENSION || size.height < MIN_IMAGE_DIMENSION) {
    return { ok: false, code: "invalid_size", message: `宽度和高度不能小于 ${MIN_IMAGE_DIMENSION}px。` };
  }
  if (size.width > MAX_IMAGE_DIMENSION || size.height > MAX_IMAGE_DIMENSION) {
    return { ok: false, code: "invalid_size", message: `宽度和高度不能大于 ${MAX_IMAGE_DIMENSION}px。` };
  }
  if (Math.max(size.width, size.height) / Math.min(size.width, size.height) > MAX_IMAGE_ASPECT_RATIO) {
    return { ok: false, code: "invalid_size", message: `长边和短边比例不能超过 ${MAX_IMAGE_ASPECT_RATIO}:1。` };
  }
  return { ok: true };
}

export function nearestImageSizeMultiple(value: number): number {
  return Math.round(value / IMAGE_SIZE_MULTIPLE) * IMAGE_SIZE_MULTIPLE;
}

export function normalizeImageSizeToMultiple(size: ImageSize): ImageSize {
  return {
    width: nearestImageSizeMultiple(size.width),
    height: nearestImageSizeMultiple(size.height)
  };
}

const VALID_IMAGE_SIZE_MULTIPLES = Array.from(
  { length: Math.floor((MAX_IMAGE_DIMENSION - MIN_IMAGE_DIMENSION) / IMAGE_SIZE_MULTIPLE) + 1 },
  (_, index) => MIN_IMAGE_DIMENSION + index * IMAGE_SIZE_MULTIPLE
);

function imageSizeMultipleCandidates(value: number): number[] {
  return [...VALID_IMAGE_SIZE_MULTIPLES].sort((left, right) => Math.abs(left - value) - Math.abs(right - value) || right - left);
}

export function resolveNearestValidImageSize(size: ImageSize): ImageSize | undefined {
  if (validateImageSizeWithoutMultiple(size).ok === false) {
    return undefined;
  }

  const candidates = imageSizeMultipleCandidates(size.width).flatMap((width) =>
    imageSizeMultipleCandidates(size.height).map((height) => ({ width, height }))
  );
  const validCandidates = candidates.filter((candidate) => validateImageSize(candidate).ok);
  const requestedArea = size.width * size.height;

  return validCandidates.sort((left, right) => {
    const leftDistance = (left.width - size.width) ** 2 + (left.height - size.height) ** 2;
    const rightDistance = (right.width - size.width) ** 2 + (right.height - size.height) ** 2;
    if (leftDistance !== rightDistance) {
      return leftDistance - rightDistance;
    }

    const leftAreaDelta = Math.abs(left.width * left.height - requestedArea);
    const rightAreaDelta = Math.abs(right.width * right.height - requestedArea);
    if (leftAreaDelta !== rightAreaDelta) {
      return leftAreaDelta - rightAreaDelta;
    }

    return right.width * right.height - left.width * left.height;
  })[0];
}

export function sizeToApiValue(size: ImageSize): string {
  return `${size.width}x${size.height}`;
}

export function validateSceneImageSize(input: {
  size: ImageSize;
  sizePresetId?: string | null;
}): ImageSizeValidationResult {
  const requestedPresetId = input.sizePresetId?.trim();
  const requestedPreset =
    requestedPresetId && requestedPresetId !== CUSTOM_SIZE_PRESET_ID
      ? SIZE_PRESETS.find((preset) => preset.id === requestedPresetId)
      : undefined;

  if (requestedPresetId && requestedPresetId !== CUSTOM_SIZE_PRESET_ID && !requestedPreset) {
    return {
      ok: false,
      code: "invalid_size_preset",
      message: "不支持的场景尺寸预设。"
    };
  }

  const normalizedSize = resolveNearestValidImageSize(input.size);
  const shouldUseNormalizedSize =
    Number.isInteger(input.size.width) &&
    Number.isInteger(input.size.height) &&
    (input.size.width % IMAGE_SIZE_MULTIPLE !== 0 || input.size.height % IMAGE_SIZE_MULTIPLE !== 0) &&
    normalizedSize !== undefined;
  const resolvedInputSize = shouldUseNormalizedSize && normalizedSize ? normalizedSize : input.size;
  const sizeValidation = validateImageSize(resolvedInputSize);
  if (!sizeValidation.ok) {
    return {
      ok: false,
      code: "invalid_size",
      message: "message" in sizeValidation ? sizeValidation.message : "尺寸不符合要求。"
    };
  }

  const matchingPreset = SIZE_PRESETS.find(
    (preset) => preset.width === resolvedInputSize.width && preset.height === resolvedInputSize.height
  );

  return {
    ok: true,
    size: resolvedInputSize,
    apiValue: sizeToApiValue(resolvedInputSize),
    source: matchingPreset ? "preset" : "custom",
    presetId: matchingPreset?.id ?? CUSTOM_SIZE_PRESET_ID,
    requestedSize: shouldUseNormalizedSize ? input.size : undefined,
    normalized: shouldUseNormalizedSize
  };
}

export interface ReferenceImageInput {
  dataUrl: string;
  fileName?: string;
  maskDataUrl?: string;
  maskedDataUrl?: string;
  annotatedDataUrl?: string;
  additionalReferenceImages?: ReferenceImageInput[];
}

export interface GenerateImageRequest {
  prompt: string;
  presetId: StylePresetId;
  size: ImageSize;
  quality: ImageQuality;
  outputFormat: OutputFormat;
  outputCompression?: number;
  count: GenerationCount;
  modelConfigId?: string;
}

export interface EditImageRequest extends GenerateImageRequest {
  referenceImage: ReferenceImageInput;
  referenceAssetId?: string;
}

export type PromptOptimizeMode = "text" | "reference";

export interface PromptOptimizeRequest {
  prompt: string;
  mode?: PromptOptimizeMode;
  stylePresetId?: StylePresetId;
  size?: ImageSize;
  sizePresetId?: string;
  hasReferenceImage?: boolean;
}

export interface PromptOptimizeResponse {
  originalPrompt: string;
  optimizedPrompt: string;
  changes?: string[];
  model?: string;
}

export interface GeneratedAsset {
  id: string;
  url: string;
  cdnUrl?: string;
  cdnPreviewUrls?: Record<string, string>;
  fileName: string;
  mimeType: string;
  width: number;
  height: number;
  cloud?: GeneratedAssetCloudInfo;
}

export interface GeneratedAssetCloudInfo {
  provider: CloudStorageProvider;
  status: AssetCloudUploadStatus;
  lastError?: string;
  uploadedAt?: string;
}

export interface GenerationOutput {
  id: string;
  status: OutputStatus;
  asset?: GeneratedAsset;
  error?: string;
}

export interface GenerationRecord {
  id: string;
  mode: ImageMode;
  prompt: string;
  effectivePrompt: string;
  presetId: string;
  size: ImageSize;
  quality: ImageQuality;
  outputFormat: OutputFormat;
  count: number;
  status: GenerationStatus;
  error?: string;
  model?: string;
  modelConfigId?: string;
  modelProvider?: string;
  modelDisplayName?: string;
  referenceAssetId?: string;
  referenceMaskDataUrl?: string;
  createdAt: string;
  outputs: GenerationOutput[];
}

export interface GenerationResponse {
  record: GenerationRecord;
}

export interface GalleryImageItem {
  outputId: string;
  generationId: string;
  userId?: string;
  userEmail?: string;
  userDisplayName?: string;
  workspaceId?: string;
  publicGalleryEnabled?: boolean;
  publicGallerySortOrder?: number;
  publicGalleryUpdatedAt?: string;
  mode: ImageMode;
  prompt: string;
  effectivePrompt: string;
  presetId: string;
  size: ImageSize;
  quality: ImageQuality;
  outputFormat: OutputFormat;
  model?: string;
  modelConfigId?: string;
  modelProvider?: string;
  modelDisplayName?: string;
  createdAt: string;
  asset: GeneratedAsset;
  referenceAssetId?: string;
  referenceAsset?: GeneratedAsset;
}

export interface GalleryResponse {
  items: GalleryImageItem[];
}

export interface DemoCanvasExample {
  id: string;
  title: string;
  category: string;
  beforeLabel: string;
  afterLabel: string;
  brief: string;
  prompt: string;
  presetId: StylePresetId;
  size: ImageSize;
  quality: ImageQuality;
  outputFormat: OutputFormat;
  createdAt: string;
  beforeUrl: string;
  afterUrl: string;
  enabled?: boolean;
  sortOrder?: number;
}

export interface DemoCanvasConfigResponse {
  examples: DemoCanvasExample[];
  updatedAt?: string;
}

export interface SaveDemoCanvasConfigRequest {
  examples: DemoCanvasExample[];
}

export interface ProjectState {
  id: string;
  name: string;
  snapshot: unknown | null;
  history: GenerationRecord[];
  updatedAt: string;
}

export interface AppConfig {
  model: ImageModel;
  models: ImageModel[];
  sizePresets: SizePreset[];
  stylePresets: typeof STYLE_PRESETS;
  qualities: ImageQuality[];
  outputFormats: OutputFormat[];
  counts: readonly GenerationCount[];
  notifications?: NotificationClientConfig;
  deployment?: DeploymentProfileResponse;
}

export type DeploymentEdition = "local" | "private-cloud" | "saas";
export type DeploymentTarget = "desktop" | "server" | "managed-cloud";
export type StorageCapability = "local" | "oss" | "cos" | "s3" | "minio";
export type ModelCapability = "official" | "openai-compatible" | "private" | "local";
export type AuthCapability = "local-account" | "saas-account" | "sso";
export type BillingCapability = "none" | "alipay" | "apple-iap" | "license" | "balance";
export type NotificationCapability = "web" | "apns" | "getui" | "wechat-miniapp";

export interface DeploymentCapabilities {
  web: boolean;
  desktop: boolean;
  extension: boolean;
  miniprogram: boolean;
  mobileApp: boolean;
  publicGallery: boolean;
  categoryKit: boolean;
  photoshopPackage: boolean;
  seedanceVideo: boolean;
  billing: boolean;
  appleIap: boolean;
  license: boolean;
  multiTenant: boolean;
  adminConsole: boolean;
  cloudSync: boolean;
  storageProviders: StorageCapability[];
  modelProviders: ModelCapability[];
  authProviders: AuthCapability[];
  billingProviders: BillingCapability[];
  notificationProviders: NotificationCapability[];
}

export interface DeploymentProfileResponse {
  edition: DeploymentEdition;
  target: DeploymentTarget;
  name: string;
  capabilities: DeploymentCapabilities;
}

export type AppNotificationType = "ecommerce_job_finished" | "system";
export type AppNotificationSeverity = "info" | "success" | "warning" | "error";
export type NotificationChannel = "web" | "native" | "wechat_miniapp";
export type NotificationDevicePlatform = "web" | "ios" | "android" | "wechat_miniapp" | "unknown";

export interface NotificationClientConfig {
  pollingIntervalMs: number;
  wechatMiniAppTaskCompleteTemplateId?: string;
}

export interface NotificationPayload {
  jobId?: string;
  status?: EcommerceBatchJobStatus;
  productTitle?: string;
  totalScenes?: number;
  completedScenes?: number;
  succeededScenes?: number;
  failedScenes?: number;
  [key: string]: unknown;
}

export interface AppNotification {
  id: string;
  type: AppNotificationType;
  severity: AppNotificationSeverity;
  title: string;
  body: string;
  actionUrl?: string;
  relatedType?: string;
  relatedId?: string;
  payload?: NotificationPayload;
  createdAt: string;
  readAt?: string;
  deliveredAt?: string;
  dismissedAt?: string;
}

export interface AppNotificationListResponse {
  notifications: AppNotification[];
  unreadCount: number;
}

export interface AppNotificationUnreadCountResponse {
  unreadCount: number;
}

export interface NotificationDeviceRegisterRequest {
  deviceId?: string;
  channel: NotificationChannel;
  platform?: NotificationDevicePlatform;
  provider?: string;
  pushToken?: string;
  userAgent?: string;
}

export interface ExtensionReleaseTargetConfig {
  apiBaseUrl: string;
  version: string;
  downloadUrl: string;
  latestDownloadUrl: string;
  installHelpUrl: string;
  fileName: string;
  sizeBytes?: number;
  sha256?: string;
  publishedAt?: string;
  releaseNotes: string[];
}

export interface ExtensionReleaseConfig {
  dev: ExtensionReleaseTargetConfig;
  prod: ExtensionReleaseTargetConfig;
  updatedAt?: string;
}

export type AppReleasePlatform = "ios" | "android";

export interface AppReleaseTargetConfig {
  enabled: boolean;
  version: string;
  buildNumber?: string;
  downloadUrl: string;
  releaseNotes: string[];
  forceUpdate?: boolean;
  publishedAt?: string;
}

export interface AppReleaseConfig {
  ios: AppReleaseTargetConfig;
  android: AppReleaseTargetConfig;
  updatedAt?: string;
}

export interface SaveAppReleaseTargetConfig {
  enabled?: boolean;
  version?: string;
  buildNumber?: string;
  downloadUrl?: string;
  releaseNotes?: string[];
  forceUpdate?: boolean;
  publishedAt?: string;
}

export interface SaveAppReleaseConfigRequest {
  ios: SaveAppReleaseTargetConfig;
  android: SaveAppReleaseTargetConfig;
}

export type HelpArticleStatus = "draft" | "published";
export type HelpContentBlockType = "heading" | "paragraph" | "list" | "steps" | "image" | "video" | "callout";

export interface HelpContentBlock {
  type: HelpContentBlockType;
  title?: string;
  text?: string;
  items?: string[];
  url?: string;
  alt?: string;
  tone?: "info" | "warning" | "success";
}

export interface HelpCategory {
  id: string;
  slug: string;
  name: string;
  description?: string;
  audience?: string;
  sortOrder: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface HelpArticle {
  id: string;
  categoryId: string;
  categorySlug?: string;
  slug: string;
  title: string;
  summary?: string;
  contentMarkdown: string;
  coverImageUrl?: string;
  videoUrl?: string;
  status: HelpArticleStatus;
  featured: boolean;
  sortOrder: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface HelpCenterResponse {
  categories: Array<HelpCategory & { articles: HelpArticle[] }>;
  featuredArticles: HelpArticle[];
}

export interface AdminHelpCenterResponse extends HelpCenterResponse {
  drafts: HelpArticle[];
}

export interface HelpAssetUploadResponse {
  provider: CloudStorageProvider;
  bucket: string;
  region: string;
  objectKey: string;
  url: string;
  etag?: string;
  requestId?: string;
}

export interface DemoCanvasAssetUploadResponse extends HelpAssetUploadResponse {}

export interface SaveHelpCategoryRequest {
  slug?: string;
  name: string;
  description?: string;
  audience?: string;
  sortOrder?: number;
  enabled?: boolean;
}

export interface SaveHelpArticleRequest {
  categoryId: string;
  slug?: string;
  title: string;
  summary?: string;
  contentMarkdown: string;
  coverImageUrl?: string;
  videoUrl?: string;
  status?: HelpArticleStatus;
  featured?: boolean;
  sortOrder?: number;
  tags?: string[];
}

export type UserRole = "user" | "admin";

export interface Plan {
  id: string;
  name: string;
  description?: string;
  imageQuota: number;
  storageQuotaBytes: number;
  priceCents: number;
  currency: string;
  appleProductId?: string;
  enabled: boolean;
  sortOrder: number;
  benefits?: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface AuthUser {
  id: string;
  numericId?: number;
  email: string;
  phone?: string;
  phoneVerifiedAt?: string;
  displayName: string;
  role: UserRole;
  accountStatus?: "active" | "deleted" | string;
  deletedAt?: string;
  deletionLockUntil?: string;
  planId?: string;
  planName?: string;
  planExpiresAt?: string;
  quotaTotal: number;
  quotaUsed: number;
  balanceCents: number;
  referralBalanceCents?: number;
  currency?: string;
  inviteCode?: string;
  inviterUserId?: string;
  storageQuotaBytes: number;
  storageUsedBytes: number;
  createdAt: string;
  updatedAt: string;
}

export interface AuthWorkspace {
  id: string;
  name: string;
  role: string;
}

export interface AuthResponse {
  user: AuthUser;
  workspace: AuthWorkspace;
  token: string;
}

export interface AuthMeResponse {
  user: AuthUser;
  workspace: AuthWorkspace;
}

export interface UpdateAuthProfileRequest {
  displayName?: string;
  email?: string;
  password?: string;
}

export interface BindPhoneRequest {
  phone: string;
  smsCode: string;
}

export interface InviteRewardSettings {
  enabled: boolean;
  baseRegisterCredits: number;
  inviterRegisterCredits: number;
  inviteeRegisterCredits: number;
  rechargeCashbackRateBps: number;
  planPurchaseCashbackRateBps: number;
  minCashbackOrderAmountCents: number;
  currency: string;
  updatedAt?: string;
}

export interface InviteSummary {
  inviteCode: string;
  inviteUrl?: string;
  invitedUserCount: number;
  successfulInviteCount: number;
  invitees?: Array<{
    userId: string;
    email?: string;
    displayName?: string;
    createdAt: string;
  }>;
  referralBalanceCents: number;
  currency: string;
  settings: InviteRewardSettings;
}

export interface InviteSummaryResponse {
  invite: InviteSummary;
}

export interface SaveInviteRewardSettingsRequest {
  enabled: boolean;
  baseRegisterCredits: number;
  inviterRegisterCredits: number;
  inviteeRegisterCredits: number;
  rechargeCashbackRateBps: number;
  planPurchaseCashbackRateBps: number;
  minCashbackOrderAmountCents: number;
  currency?: string;
}

export interface AdminInviteRewardSettingsResponse {
  settings: InviteRewardSettings;
}

export interface WechatMiniAppPublicConfig {
  enabled: boolean;
  allowBindExistingAccount: boolean;
  allowRegisterNewUser: boolean;
  taskCompleteTemplateId?: string;
  updatedAt?: string;
}

export interface WechatMiniAppConfigView extends WechatMiniAppPublicConfig {
  appId: string;
  appSecret: MaskedSecret;
}

export interface AdminWechatMiniAppConfigResponse {
  wechatMiniApp: WechatMiniAppConfigView;
}

export interface SaveWechatMiniAppConfigRequest {
  enabled: boolean;
  appId?: string;
  appSecret?: string;
  taskCompleteTemplateId?: string;
  preserveAppSecret?: boolean;
  allowBindExistingAccount?: boolean;
  allowRegisterNewUser?: boolean;
}

export interface WechatMiniAppConfigViewForm {
  enabled: boolean;
  appId: string;
  appSecret: MaskedSecret;
  appSecretSaved?: boolean;
  taskCompleteTemplateId?: string;
  allowBindExistingAccount: boolean;
  allowRegisterNewUser: boolean;
  updatedAt?: string;
}

export interface WechatMiniAppConfigResponse {
  wechatMiniApp: WechatMiniAppPublicConfig;
}

export interface WechatMiniAppLoginRequest {
  code: string;
}

export type WechatMiniAppLoginResponse =
  | {
      status: "bound";
      session: AuthResponse;
    }
  | {
      status: "needs_bind";
      bindToken: string;
      allowBindExistingAccount: boolean;
      allowRegisterNewUser: boolean;
    };

export interface WechatMiniAppBindRequest {
  bindToken: string;
}

export interface WechatMiniAppRegisterRequest {
  bindToken: string;
  displayName?: string;
  email?: string;
  inviteCode?: string;
}

export interface AdminStatsResponse {
  userCount: number;
  assetCount: number;
  estimatedStorageBytes: number;
  totalStorageQuotaBytes: number;
  totalStorageUsedBytes: number;
  ecommerceJobStatus: Record<EcommerceBatchJobStatus, number>;
  recentJobs: EcommerceJobSummary[];
}

export interface AdminUserItem extends AuthUser {
  workspaceCount: number;
}

export interface AdminUsersResponse {
  users: AdminUserItem[];
}

export interface AdminPlansResponse {
  plans: Plan[];
}

export interface BillingSettings {
  imageUnitPriceCents: number;
  currency: string;
  updatedAt?: string;
}

export interface AdminBillingSettingsResponse {
  settings: BillingSettings;
}

export interface SaveBillingSettingsRequest {
  imageUnitPriceCents: number;
  currency?: string;
}

export interface AlipayConfigView {
  enabled: boolean;
  appId: string;
  privateKey: MaskedSecret;
  publicKey: MaskedSecret;
  notifyUrl: string;
  returnUrl: string;
  gateway: string;
  signType: "RSA2" | "RSA" | string;
  updatedAt?: string;
}

export interface AdminAlipayConfigResponse {
  alipay: AlipayConfigView;
}

export interface SaveAlipayConfigRequest {
  enabled: boolean;
  appId?: string;
  privateKey?: string;
  preservePrivateKey?: boolean;
  publicKey?: string;
  preservePublicKey?: boolean;
  notifyUrl?: string;
  returnUrl?: string;
  gateway?: string;
  signType?: "RSA2" | "RSA" | string;
}

export interface AdminAdjustBalanceRequest {
  balanceCents?: number;
  deltaCents?: number;
  note?: string;
}

export interface BillingPlan extends Plan {
  recommended?: boolean;
  purchaseUrl?: string;
}

export interface BillingBalance {
  balanceCents: number;
  currency: string;
  updatedAt?: string;
}

export interface BillingUsage {
  quotaTotal: number;
  quotaUsed: number;
  packageTotal?: number;
  packageUsed?: number;
  packageRemaining?: number;
}

export interface BillingStorageUsage {
  quotaBytes: number;
  usedBytes: number;
}

export interface BillingTransaction {
  id: string;
  userId?: string;
  userEmail?: string;
  workspaceId?: string;
  generationId?: string;
  type: "plan_purchase" | "recharge" | "generation" | "admin_adjustment" | string;
  title: string;
  amountCents: number;
  currency: string;
  balanceBeforeCents?: number;
  balanceAfterCents?: number;
  quotaBefore?: number;
  quotaAfter?: number;
  quotaConsumed?: number;
  quotaCount?: number;
  imageCount?: number;
  unitPriceCents?: number;
  note?: string;
  status: "pending" | "succeeded" | "failed" | "cancelled" | "paid" | string;
  createdByUserId?: string;
  createdAt: string;
}

export interface BillingTransactionsResponse {
  transactions: BillingTransaction[];
}

export interface BillingOrder {
  id: string;
  outTradeNo: string;
  userId?: string;
  userEmail?: string;
  workspaceId?: string;
  type: "recharge" | "plan_purchase" | string;
  status: "pending" | "paid" | "failed" | "cancelled" | string;
  title: string;
  amountCents: number;
  currency: string;
  planId?: string;
  imageQuota?: number;
  storageQuotaBytes?: number;
  paymentProvider: "alipay" | "apple_iap" | "balance" | string;
  paymentUrl?: string;
  providerTradeNo?: string;
  paidAt?: string;
  closedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BillingOrdersResponse {
  orders: BillingOrder[];
}

export interface BillingSummaryResponse {
  balance: BillingBalance;
  currentPlan?: BillingPlan;
  currentPlanExpiresAt?: string;
  plans?: BillingPlan[];
  usage?: BillingUsage;
  storage?: BillingStorageUsage;
  transactions?: BillingTransaction[];
  orders?: BillingOrder[];
  settings?: BillingSettings;
}

export type PaymentChannel = "alipay";

export interface CreateAlipayRechargeRequest {
  amountCents: number;
  currency?: string;
  returnUrl?: string;
  channel?: PaymentChannel;
}

export interface CreatePaymentResponse {
  order?: BillingOrder;
  orderId?: string;
  outTradeNo?: string;
  status?: "pending" | "paid" | "failed";
  paymentUrl?: string;
  checkoutUrl?: string;
  qrCodeUrl?: string;
  message?: string;
}

export interface PurchasePlanRequest {
  planId: string;
  paymentMethod: "balance" | "alipay";
  returnUrl?: string;
}

export interface VerifyAppleInAppPurchaseRequest {
  appAccountToken?: string;
  environment?: string;
  originalTransactionId?: string;
  planId: string;
  productId: string;
  purchaseToken?: string;
  transactionId: string;
}

export type RedemptionCodeStatus = "active" | "disabled";

export interface AdminRedemptionCode {
  id: string;
  code: string;
  batchId?: string;
  quota: number;
  maxRedemptions: number;
  usedCount: number;
  redeemedUserCount: number;
  remainingCount: number;
  validDays: number;
  status: RedemptionCodeStatus | string;
  note?: string;
  createdByUserId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminRedemptionCodesResponse {
  batchId?: string;
  codes: AdminRedemptionCode[];
}

export interface AdminCreateRedemptionCodesRequest {
  count?: number;
  maxRedemptions: number;
  quota: number;
  validDays: number;
  codes?: string[];
  codePrefix?: string;
  note?: string;
}

export interface RedemptionCodeRedeemRequest {
  code: string;
}

export interface RedemptionCodeRedeemResponse {
  redemption: {
    code: string;
    quotaGranted: number;
    expiresAt: string;
  };
  user: {
    quotaTotal: number;
    quotaUsed: number;
    packageRemaining: number;
    planExpiresAt?: string;
  };
}

export interface AdminAssetItem {
  id: string;
  userId: string;
  userEmail?: string;
  workspaceId: string;
  fileName: string;
  mimeType: string;
  width: number;
  height: number;
  estimatedBytes: number;
  cloudProvider?: CloudStorageProvider;
  cloudStatus?: AssetCloudUploadStatus;
  createdAt: string;
}

export interface AdminAssetsResponse {
  assets: AdminAssetItem[];
}

export interface MaskedSecret {
  hasSecret: boolean;
  value?: string;
}

export interface CosStorageConfigView {
  secretId: string;
  secretKey: MaskedSecret;
  bucket: string;
  region: string;
  keyPrefix: string;
}

export interface OssStorageConfigView {
  accessKeyId: string;
  accessKeySecret: MaskedSecret;
  bucket: string;
  region: string;
  keyPrefix: string;
}

export interface StorageConfigResponse {
  enabled: boolean;
  provider: CloudStorageProvider;
  cos: CosStorageConfigView;
  oss: OssStorageConfigView;
}

export interface SaveCosStorageConfig {
  secretId: string;
  secretKey?: string;
  preserveSecret?: boolean;
  bucket: string;
  region: string;
  keyPrefix: string;
}

export interface SaveOssStorageConfig {
  accessKeyId: string;
  accessKeySecret?: string;
  preserveSecret?: boolean;
  bucket: string;
  region: string;
  keyPrefix: string;
}

export interface SaveStorageConfigRequest {
  enabled: boolean;
  provider: CloudStorageProvider;
  cos?: SaveCosStorageConfig;
  oss?: SaveOssStorageConfig;
}

export interface StorageTestResult {
  ok: boolean;
  message: string;
}

export interface EcommerceBatchGenerateRequest {
  product: EcommerceProductBrief;
  platform: EcommercePlatform;
  market: EcommerceMarket;
  textLanguage?: EcommerceTextLanguage;
  categoryPath?: string[];
  categoryName?: string;
  strategyId?: string;
  strategy?: EcommerceCategoryKitStrategy;
  assets?: EcommerceCategoryKitAssetInput[];
  missingInputs?: EcommerceCategoryKitMissingInput[];
  plannedImages?: EcommerceCategoryKitPlanItem[];
  allowTextRecreation?: boolean;
  removeWatermarkAndLogo?: boolean;
  brandOverlayPlacement?: BrandOverlayPlacement;
  sceneTemplateIds: EcommerceSceneTemplateId[];
  sourcePageUrl?: string;
  sizePresetId?: ImageSizePresetId;
  size?: ImageSize;
  stylePresetId?: StylePresetId;
  quality?: ImageQuality;
  outputFormat?: OutputFormat;
  countPerScene?: GenerationCount;
  referenceImage?: ReferenceImageInput;
  referenceImages?: EcommerceBatchReferenceImage[];
  additionalReferenceImages?: ReferenceImageInput[];
  createComparisonCollage?: boolean;
  extraDirection?: string;
}

export interface EcommerceBatchReferenceImage {
  referenceImage: ReferenceImageInput;
  size?: ImageSize;
  role?: EcommerceCategoryKitAssetRole;
  referenceAssetId?: string;
  additionalReferenceImages?: ReferenceImageInput[];
  title?: string;
  description?: string;
  extraDirection?: string;
  required?: boolean;
  tags?: string[];
}

export type EcommerceCategoryKitStrategySource = "built-in" | "workspace" | "user" | "remote" | "manual" | string;

export type EcommerceCategoryKitAssetRole =
  | "main-product"
  | "detail"
  | "texture"
  | "scale"
  | "package"
  | "certificate"
  | "usage"
  | "lifestyle"
  | "model"
  | "variant"
  | "brand"
  | "other"
  | string;

export interface EcommerceCategoryKitStrategyField {
  id: string;
  label?: string;
  description?: string;
  aliases?: string[];
  examples?: string[];
}

export interface EcommerceCategoryKitImageRole {
  id: string;
  label?: string;
  description?: string;
  required?: boolean;
  recommended?: boolean;
  minCount?: number;
  maxCount?: number;
  acceptedAssetRoles?: EcommerceCategoryKitAssetRole[];
  examples?: string[];
}

export interface EcommerceCategoryKitOutputScene {
  id: string;
  title: string;
  purpose?: string;
  imageRoleId?: string;
  required?: boolean;
  recommended?: boolean;
  priority?: number;
  sizePresetId?: ImageSizePresetId;
  compositionRules?: string[];
  copyRules?: string[];
  safetyRules?: string[];
  examples?: string[];
}

export interface EcommerceCategoryKitFallbackRule {
  id?: string;
  when: string;
  use?: string;
  avoid?: string;
  notes?: string;
}

export interface EcommerceCategoryKitExample {
  title?: string;
  categoryPath?: string[];
  productBrief?: Partial<EcommerceProductBrief>;
  assetRoles?: EcommerceCategoryKitAssetRole[];
  outputScenes?: string[];
  notes?: string;
}

export interface EcommerceCategoryKitStrategy {
  id: string;
  categoryPath: string[];
  categoryName: string;
  aliases?: string[];
  platform?: EcommercePlatform;
  market?: EcommerceMarket;
  enabled?: boolean;
  priority?: number;
  version?: string;
  source?: EcommerceCategoryKitStrategySource;
  visualStyle?: string[];
  copyStyle?: string[];
  sellingPointLogic?: string[];
  compositionRules?: string[];
  safetyRules?: string[];
  requiredFields?: EcommerceCategoryKitStrategyField[];
  recommendedFields?: EcommerceCategoryKitStrategyField[];
  imageRoles?: EcommerceCategoryKitImageRole[];
  outputScenes?: EcommerceCategoryKitOutputScene[];
  fallbackRules?: EcommerceCategoryKitFallbackRule[];
  examples?: EcommerceCategoryKitExample[];
}

export interface EcommerceCategoryKitStrategyListResponse {
  strategies: EcommerceCategoryKitStrategy[];
  total: number;
}

export interface EcommerceCategoryKitStrategyMutationResponse {
  strategy: EcommerceCategoryKitStrategy;
}

export interface SaveEcommerceCategoryKitStrategyRequest {
  strategy: EcommerceCategoryKitStrategy;
}

export interface EcommerceCategoryKitAssetInput {
  id?: string;
  role: EcommerceCategoryKitAssetRole;
  referenceImage?: ReferenceImageInput;
  referenceAssetId?: string;
  url?: string;
  fileName?: string;
  title?: string;
  description?: string;
  required?: boolean;
  tags?: string[];
}

export interface EcommerceCategoryKitMissingInput {
  id: string;
  label?: string;
  description?: string;
  role?: EcommerceCategoryKitAssetRole;
  required?: boolean;
  recommended?: boolean;
  examples?: string[];
}

export interface EcommerceCategoryKitPreparationRequest {
  product: EcommerceProductBrief;
  platform: EcommercePlatform;
  market: EcommerceMarket;
  textLanguage?: EcommerceTextLanguage;
  categoryPath?: string[];
  categoryName?: string;
  strategyId?: string;
  strategy?: EcommerceCategoryKitStrategy;
  assets?: EcommerceCategoryKitAssetInput[];
  missingInputs?: EcommerceCategoryKitMissingInput[];
  extraDirection?: string;
}

export interface EcommerceCategoryKitPreparationResponse {
  prepared: boolean;
  productSummary?: string;
  categoryPath?: string[];
  categoryName?: string;
  strategy?: EcommerceCategoryKitStrategy;
  assets?: EcommerceCategoryKitAssetInput[];
  missingInputs?: EcommerceCategoryKitMissingInput[];
  imageRoles?: EcommerceCategoryKitImageRole[];
  outputScenes?: EcommerceCategoryKitOutputScene[];
  warnings?: string[];
  notes?: string;
}

export interface EcommerceCategoryKitPlanItem {
  title: string;
  purpose: string;
  prompt: string;
  notes?: string;
  sourceImageRoles?: EcommerceCategoryKitAssetRole[];
}

export interface EcommerceCategoryKitPlanRequest {
  product: EcommerceProductBrief;
  platform: EcommercePlatform;
  market: EcommerceMarket;
  textLanguage?: EcommerceTextLanguage;
  requestedImageCount?: number;
  requestedSceneTemplateIds?: EcommerceSceneTemplateId[];
  categoryPath?: string[];
  categoryName?: string;
  strategyId?: string;
  strategy?: EcommerceCategoryKitStrategy;
  assets?: EcommerceCategoryKitAssetInput[];
  missingInputs?: EcommerceCategoryKitMissingInput[];
  referenceImage: ReferenceImageInput;
  extraDirection?: string;
}

export interface EcommerceCategoryKitPlanResponse {
  productSummary: string;
  categoryPath?: string[];
  categoryName?: string;
  strategy?: EcommerceCategoryKitStrategy;
  assets?: EcommerceCategoryKitAssetInput[];
  missingInputs?: EcommerceCategoryKitMissingInput[];
  warnings?: string[];
  notes?: string;
  imagePlan: EcommerceCategoryKitPlanItem[];
  model?: string;
}

export type CategoryKitPlannerModelRole = "primary" | "fallback";
export type CategoryKitPlannerProvider = "openai-responses" | "openai-compatible-chat" | "deepseek";
export type CategoryKitPlannerModule =
  | "prompt-optimizer"
  | "category-kit-planner"
  | "category-classifier"
  | "video-storyboard-planner";

export interface CategoryKitPlannerConfigEntry {
  id: string;
  name: string;
  provider: CategoryKitPlannerProvider;
  modules: CategoryKitPlannerModule[];
  enabled: boolean;
  role: CategoryKitPlannerModelRole;
  priority: number;
  baseUrl?: string;
  model: string;
  timeoutMs: number;
  apiKeySaved: boolean;
}

export interface CategoryKitPlannerConfigResponse {
  models: CategoryKitPlannerConfigEntry[];
  source: "saved" | "default";
}

export interface SaveCategoryKitPlannerConfigEntry {
  id?: string;
  name: string;
  provider?: CategoryKitPlannerProvider;
  modules?: CategoryKitPlannerModule[];
  enabled: boolean;
  role: CategoryKitPlannerModelRole;
  priority?: number;
  apiKey?: string;
  preserveApiKey?: boolean;
  baseUrl?: string;
  model: string;
  timeoutMs?: number;
}

export interface SaveCategoryKitPlannerConfigRequest {
  models: SaveCategoryKitPlannerConfigEntry[];
}

export type SeedanceVideoConfigSource = "saved" | "env" | "default";

export interface SeedanceVideoConfigResponse {
  apiKeySaved: boolean;
  baseUrl: string;
  model: string;
  source: SeedanceVideoConfigSource;
}

export interface SaveSeedanceVideoConfigRequest {
  apiKey?: string;
  preserveApiKey?: boolean;
  baseUrl?: string;
  model?: string;
}

export interface SeedanceVideoStoryboardFramePrompt {
  prompt: string;
  notes?: string;
}

export interface SeedanceVideoStoryboardScene {
  id: string;
  title: string;
  overview: string;
  scene: string;
  camera: string;
  plot: string;
  extra: string;
  videoPrompt: string;
  firstFrame: SeedanceVideoStoryboardFramePrompt;
  lastFrame: SeedanceVideoStoryboardFramePrompt;
  duration: number;
}

export interface SeedanceVideoStoryboardPlanRequest {
  intent: string;
  referenceImages: ReferenceImageInput[];
  ratio?: string;
  duration?: number;
  resolution?: string;
  generateAudio?: boolean;
}

export interface SeedanceVideoStoryboardPlanResponse {
  summary: string;
  scenes: SeedanceVideoStoryboardScene[];
  recommendations: {
    ratio: string;
    resolution: string;
    duration: number;
    generateAudio: boolean;
    notes: string[];
  };
  model?: string;
}

export interface EcommerceGenerationConcurrencyConfigResponse {
  globalConcurrency: number;
  jobConcurrency: number;
  source: "saved" | "default";
}

export interface SaveEcommerceGenerationConcurrencyConfigRequest {
  globalConcurrency: number;
  jobConcurrency: number;
}

export type EcommerceBatchJobStatus = "pending" | "running" | "succeeded" | "partial" | "failed";

export interface EcommerceBatchGenerateResponse {
  jobId: string;
  status: EcommerceBatchJobStatus;
  message: string;
  totalScenes: number;
  completedScenes: number;
  categoryKitPreparation?: EcommerceCategoryKitPreparationResponse;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  records: GenerationRecord[];
}

export interface EcommerceJobSummary {
  jobId: string;
  userId?: string;
  userEmail?: string;
  userDisplayName?: string;
  workspaceId?: string;
  status: EcommerceBatchJobStatus;
  message: string;
  productTitle: string;
  platform: EcommercePlatform;
  market: EcommerceMarket;
  totalScenes: number;
  completedScenes: number;
  succeededScenes: number;
  failedScenes: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  sourcePageUrl?: string;
}

export interface EcommerceJobListResponse {
  jobs: EcommerceJobSummary[];
}

export interface EcommerceStatsResponse {
  totalJobs: number;
  pendingJobs: number;
  runningJobs: number;
  succeededJobs: number;
  partialJobs: number;
  failedJobs: number;
  totalScenes: number;
  completedScenes: number;
  succeededScenes: number;
  failedScenes: number;
  generatedImages: number;
}

export function composePrompt(prompt: string, presetId: string): string {
  const trimmedPrompt = prompt.trim();
  const preset = STYLE_PRESETS.find((item) => item.id === presetId);
  if (!preset || preset.id === "none" || !preset.prompt) {
    return trimmedPrompt;
  }
  return `${trimmedPrompt}\n\nStyle direction: ${preset.prompt}`;
}

export function composeEcommercePrompt(context: EcommercePromptContext): string {
  const template = ECOMMERCE_SCENE_TEMPLATES.find((item) => item.id === context.sceneTemplateId);
  const isTextTranslationMode = template?.mode === "text-translation";
  const platform = ECOMMERCE_PLATFORMS.find((item) => item.id === context.platform)?.label ?? context.platform;
  const market = ECOMMERCE_MARKETS.find((item) => item.id === context.market)?.label ?? context.market;
  const textLanguage = ECOMMERCE_TEXT_LANGUAGES.find((item) => item.id === context.textLanguage);
  const marketTextLocalization = PLATFORM_TEXT_LOCALIZATION[context.platform] ?? MARKET_TEXT_LOCALIZATION[context.market];
  const explicitTextLanguage = textLanguage && textLanguage.id !== "none" ? textLanguage : undefined;
  const shouldUseExplicitTextLanguage = isTextTranslationMode && explicitTextLanguage;
  const imageTextPromptLabel = shouldUseExplicitTextLanguage
    ? explicitTextLanguage.promptLabel
    : marketTextLocalization.promptLabel;
  const brandOverlayGuard = context.brandOverlayPlacement
    ? [
        "Brand overlay placement:",
        context.brandOverlayPlacement === "top-left"
          ? "top-left"
          : context.brandOverlayPlacement === "top-right"
            ? "top-right"
            : context.brandOverlayPlacement === "bottom-left"
              ? "bottom-left"
              : "bottom-right",
        "Leave that corner clean, uncluttered, and clearly reserved for a later logo or brand wordmark.",
        "Keep the main subject, face, product label, and other important details away from that corner."
      ].join(" ")
    : "";
  const isChineseEcommerceTarget = CHINESE_ECOMMERCE_PLATFORM_IDS.has(context.platform) || context.market === "cn";
  const product = context.product;
  const extraDirection = context.extraDirection?.trim();
  const priorityDirectionGuard = extraDirection
    ? [
        "Highest-priority user direction:",
        extraDirection,
        "Treat these user-supplied requirements as hard visual constraints. If they mention product dimensions, body scale, garment length, physical proportions, placement, or forbidden positions, obey them over style, composition, and template preferences. The final image must make those constraints visibly true."
      ].join(" ")
    : "";
  const details = [
    `Product title: ${product.title.trim()}`,
    product.description ? `Description: ${product.description.trim()}` : "",
    product.bulletPoints?.length ? `Selling points: ${product.bulletPoints.map((point) => point.trim()).filter(Boolean).join("; ")}` : "",
    product.targetCustomer ? `Target customer: ${product.targetCustomer.trim()}` : "",
    product.usageScene ? `Usage scene: ${product.usageScene.trim()}` : "",
    product.material ? `Material: ${product.material.trim()}` : "",
    product.color ? `Color: ${product.color.trim()}` : "",
    product.brandTone ? `Brand tone: ${product.brandTone.trim()}` : ""
  ].filter(Boolean);

  const modeGuard =
    template?.mode === "text-translation"
      ? "Reference image rule: treat the source image as the single source of truth. Preserve the product, background, crop, composition, and layout. Only translate eligible visible marketing or product text into the target language; do not add new visual elements, callouts, logos, claims, props, people, or decorative text."
      : template?.mode === "enhance"
        ? "Reference image rule: treat the source product image as the single source of truth. Preserve the original product exactly. Only improve lighting, background, layout, selling-point text, callouts, and marketplace composition. Do not generate logos or fake brand marks; brand marks are added later as a separate overlay. Do not redesign the product."
        : template?.mode === "single-poster"
          ? "Reference image rule: treat the source product image as the single source of truth for product appearance and visible evidence. You may infer only safe, visually supported selling points from the image and product brief; when uncertain, use generic visual benefits such as material, design, use scenario, color, portability, texture, package contents, or styling without making objective performance claims."
          : template?.mode === "one-click-replace"
            ? "Reference image rule: the first reference image is the target model or scene; any additional reference image is the user's own garment or product to place into that target. Preserve the target photo's identity, pose, perspective, lighting, background, crop, and composition. Preserve the replacement item's real appearance, color, material, pattern, silhouette, package, and scale. For clothing, make it naturally worn on the model; for objects, integrate it naturally into the scene. Do not generate a collage, before/after layout, floating cutout, duplicate product, unrelated props, new brand marks, or unsupported text."
          : template?.mode === "category-kit"
            ? "Reference image rule: treat the first source image as the main product identity and use any additional source images only as detail, texture, packaging, angle, scale, variant, or usage evidence. Internally identify the product category before composing this specific listing image role. Preserve the real product across the kit and do not reuse fixed assumptions from another category."
        : "Reference image rule: use the source product image to preserve the product's key identity, shape, color, material, and recognizable details while creating a new commercial scene.";

  const textLanguageGuard =
    shouldUseExplicitTextLanguage
      ? `Image text translation target: ${explicitTextLanguage.promptLabel}. This selected target language overrides the selected platform and market for every translated text element. Replace only the remaining marketing text with natural ${explicitTextLanguage.promptLabel}. Keep brand names, model numbers, and required trademarks unchanged. Do not mix languages except for preserved brand/model text. Text must be short, readable, native-sounding, and placed cleanly without covering the product. Do not translate or recreate watermark text, logo text, source marks, corner captions, or any overlay that has already been identified as cleanup content.`
      : [
          "Image text localization:",
          marketTextLocalization.instruction,
          `If this image includes selling-point text, feature callouts, promo copy, scene labels, explanatory captions, or other newly generated readable text, write it in natural ${imageTextPromptLabel}.`,
          "Do not use Chinese copy for a non-China market unless the user explicitly asks for Chinese or the text is a preserved brand/model/legal mark.",
          "Keep brand names, model numbers, and required trademarks unchanged. Do not mix languages except for preserved brand/model text. Text must be short, readable, native-sounding, and placed cleanly without covering the product. Do not translate or recreate watermark text, logo text, source marks, corner captions, or any overlay that has already been identified as cleanup content."
        ].join(" ");
  const chineseMarketplaceGuard = isChineseEcommerceTarget && !isTextTranslationMode
    ? [
        "Chinese marketplace copy rule:",
        "When the image template uses selling-point text, feature callouts, promo copy, scene labels, or explanatory captions, create concise Simplified Chinese copy by default.",
        "Use natural domestic e-commerce phrasing suitable for the selected platform, with readable Chinese characters, clear hierarchy, and short phrases such as material, size, function, comfort, value, usage scenario, discount, or service points only when supported by the product brief or visible reference.",
        "For Taobao, Tmall, JD, 1688, Douyin, Pinduoduo, Xiaohongshu, Kuaishou, Weidian, and Dewu, avoid English selling-point copy unless the user explicitly requests it or it is a preserved brand/model name.",
        "Do not invent unsupported claims, certificates, rankings, fake scarcity, medical claims, absolute claims, or platform badges."
      ].join(" ")
    : "";
  const sourcePreservationGuard =
    context.allowTextRecreation === false
      ? [
          "Strict source-preservation mode:",
          "Keep the original composition, crop, camera angle, product position, background, spacing, typography hierarchy, text block positions, line breaks, alignment, and approximate font weight/style as close to the source image as possible.",
          shouldUseExplicitTextLanguage
            ? `Translate each original text phrase literally and faithfully into ${explicitTextLanguage.promptLabel}; preserve the original meaning and claims without rewriting, summarizing, expanding, replacing, or inventing new copy.`
            : "Do not translate, rewrite, summarize, expand, replace, or invent selling-point copy.",
          "Do not add new slogans, brand words, frames, decorative text, selling points, paragraphs, or layout elements. Do not move text into new positions.",
          context.removeWatermarkAndLogo !== false
            ? "Only remove watermarks, logos, unrelated text, and unrelated image elements that are cleanup targets; keep useful original selling-point copy in place."
            : "Keep all original text and non-text visual content unchanged."
        ].join(" ")
      : "";
  const cleanupGuard =
    context.removeWatermarkAndLogo !== false
      ? "Cleanup rule: first identify and remove watermarks, logos, brand marks, source marks, repeated watermark textures, platform/store marks, corner captions, footer tags, unrelated icons, stickers, badges, decorative image overlays, and any short text that belongs to the source image branding or provenance rather than the product's selling points. If a text element is ambiguous, treat it as cleanup content before translation. Keep the product itself and only the true selling-point copy clear and readable."
      : "";

  return [
    template?.prompt ?? "Create a professional cross-border e-commerce product image.",
    priorityDirectionGuard,
    isTextTranslationMode
      ? "Translation-only task: ignore platform and market language preferences. The selected target language is the only language rule for translated image text."
      : `Optimize for ${platform} in the ${market} market.`,
    ...details,
    modeGuard,
    PLATFORM_COMPLIANCE_RULES[context.platform],
    cleanupGuard,
    brandOverlayGuard,
    chineseMarketplaceGuard,
    textLanguageGuard,
    sourcePreservationGuard,
    extraDirection
      ? "Final constraint check before rendering: verify the user direction is visibly satisfied, especially any numeric size, scale relationship, garment endpoint, product placement, or explicit negative constraint."
      : "",
    "Keep the result accurate and commercially usable. Avoid watermarks, unreadable text, misleading claims, and extra hands or people unless explicitly requested."
  ].filter(Boolean).join("\n");
}
