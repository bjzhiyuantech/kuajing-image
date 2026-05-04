const SCENES = [
  { id: "marketplace-main", label: "白底主图" },
  { id: "logo-benefit", label: "卖点图" },
  { id: "feature-benefit", label: "功能说明" },
  { id: "promo-poster", label: "促销海报" },
  { id: "text-translation", label: "文字翻译" },
  { id: "lifestyle", label: "生活方式" },
  { id: "model-wear", label: "模特穿戴" },
  { id: "accessory-match", label: "配饰搭配" },
  { id: "seasonal-campaign", label: "节日促销" },
  { id: "social-ad", label: "社媒广告" },
  { id: "allegro-scarf-main-flat", label: "围巾白底" },
  { id: "allegro-scarf-main-styled", label: "围巾造型" },
  { id: "allegro-scarf-drape-product", label: "折叠垂落" },
  { id: "allegro-scarf-fabric-detail", label: "面料细节" },
  { id: "allegro-scarf-edge-detail", label: "边缘工艺" },
  { id: "allegro-scarf-size-guide", label: "尺寸说明" },
  { id: "allegro-scarf-wear-grid", label: "围巾戴法" },
  { id: "allegro-scarf-neck-model", label: "颈部模特" },
  { id: "allegro-scarf-bag-styling", label: "包包装饰" },
  { id: "allegro-scarf-lifestyle", label: "围巾生活图" }
];

const LANGUAGES = [
  { id: "none", label: "不翻译" },
  { id: "zh-hans", label: "简体中文" },
  { id: "zh-hant", label: "繁体中文" },
  { id: "en", label: "英文" },
  { id: "pl", label: "波兰文" },
  { id: "de", label: "德文" },
  { id: "fr", label: "法文" },
  { id: "es", label: "西班牙文" },
  { id: "ja", label: "日文" },
  { id: "ko", label: "韩文" }
];

const PLATFORMS = [
  { id: "amazon", label: "Amazon" },
  { id: "allegro", label: "Allegro" },
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
  { id: "other", label: "其他平台" }
];

const MARKETS = [
  { id: "cn", label: "中国大陆" },
  { id: "us", label: "美国" },
  { id: "uk", label: "英国" },
  { id: "eu", label: "欧盟" },
  { id: "pl", label: "波兰" },
  { id: "ca", label: "加拿大" },
  { id: "au", label: "澳大利亚" },
  { id: "jp", label: "日本" },
  { id: "kr", label: "韩国" },
  { id: "sg", label: "新加坡" },
  { id: "mx", label: "墨西哥" },
  { id: "br", label: "巴西" },
  { id: "global", label: "全球" }
];

module.exports = {
  LANGUAGES,
  MARKETS,
  PLATFORMS,
  SCENES
};
