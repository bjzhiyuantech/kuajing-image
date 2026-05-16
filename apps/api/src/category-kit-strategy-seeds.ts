import type { EcommerceCategoryKitOutputScene, EcommerceCategoryKitStrategy } from "./contracts.js";

const VERSION = "2026-05-12";

const commonFields = [
  {
    id: "description",
    label: "商品卖点描述",
    description: "来自商品标题、描述、bullet points 或用户补充说明的真实卖点。",
    aliases: ["description", "selling points", "卖点", "描述"]
  },
  {
    id: "material",
    label: "材质/成分",
    description: "商品真实材质、面料、成分或结构信息。",
    aliases: ["material", "fabric", "ingredient", "材质", "成分"]
  },
  {
    id: "size",
    label: "尺寸/规格",
    description: "商品真实尺寸、容量、尺码、重量或包装规格。",
    aliases: ["size", "dimension", "spec", "尺寸", "规格"]
  }
];

const defaultImageRoles = [
  {
    id: "main-product",
    label: "主商品图",
    description: "明确展示真实商品主体。",
    required: true,
    minCount: 1,
    acceptedAssetRoles: ["main-product"]
  },
  {
    id: "detail",
    label: "细节/材质图",
    description: "展示用户已提供的真实细节、材质、结构或局部特征。",
    recommended: true,
    acceptedAssetRoles: ["detail", "texture", "other"]
  },
  {
    id: "usage",
    label: "使用场景图",
    description: "基于真实商品使用方式生成合理场景。",
    recommended: true,
    acceptedAssetRoles: ["usage", "lifestyle", "other"]
  }
];

const defaultScenes: EcommerceCategoryKitOutputScene[] = [
  {
    id: "main",
    title: "主图",
    purpose: "让买家快速识别真实商品。",
    imageRoleId: "main-product",
    required: true,
    priority: 10,
    sizePresetId: "square-1k",
    compositionRules: ["商品主体清晰完整", "保留颜色、材质、比例和包装细节"],
    copyRules: ["主图少字或无字，平台允许时可放极短卖点"],
    safetyRules: ["不添加平台 Logo、排名徽章或虚假认证"]
  },
  {
    id: "benefits",
    title: "核心卖点图",
    purpose: "用真实信息解释购买理由。",
    recommended: true,
    priority: 20,
    sizePresetId: "poster-portrait",
    compositionRules: ["商品与卖点信息分区清楚", "文字不得遮挡商品关键细节"],
    copyRules: ["只使用已知卖点，不补写未提供参数"],
    safetyRules: ["避免绝对化功效、医疗效果和无法证实的承诺"]
  },
  {
    id: "detail",
    title: "细节/结构图",
    purpose: "放大用户已提供或图片中可见的真实细节。",
    imageRoleId: "detail",
    recommended: true,
    priority: 30,
    sizePresetId: "poster-portrait",
    compositionRules: ["近景细节要与参考图一致"],
    copyRules: ["参数缺失时只做视觉说明，不写数值"],
    safetyRules: ["不臆造材质、尺寸、检测报告"]
  },
  {
    id: "usage",
    title: "使用场景图",
    purpose: "展示合理使用情境和目标人群。",
    imageRoleId: "usage",
    recommended: true,
    priority: 40,
    sizePresetId: "poster-portrait",
    compositionRules: ["场景服务于商品，不喧宾夺主"],
    copyRules: ["文案短而具体"],
    safetyRules: ["不改变商品身份和核心外观"]
  }
];

function strategy(input: Omit<EcommerceCategoryKitStrategy, "enabled" | "source" | "version">): EcommerceCategoryKitStrategy {
  return {
    enabled: true,
    source: "built-in",
    version: VERSION,
    requiredFields: commonFields.slice(0, 1),
    recommendedFields: commonFields.slice(1),
    imageRoles: defaultImageRoles,
    outputScenes: defaultScenes,
    fallbackRules: [
      {
        id: "no-extra-data",
        when: "缺少尺寸、材质、成分、认证或包装信息时",
        use: "只描述参考图和商品 brief 中明确存在的信息",
        avoid: "不要补写参数、证书、功效、排名、官方标识或未提供的包装"
      }
    ],
    ...input
  };
}

export const builtInCategoryKitStrategies: EcommerceCategoryKitStrategy[] = [
  strategy({
    id: "category-kit-fallback",
    categoryPath: ["通用"],
    categoryName: "通用兜底",
    aliases: ["general", "default", "fallback", "other", "unknown", "通用", "其他", "未知"],
    priority: 9999,
    visualStyle: ["干净真实", "主体优先", "避免过度场景化"],
    copyStyle: ["少量短文案", "不写未提供参数"],
    sellingPointLogic: ["先说明可见外观和用途", "再使用用户提供的描述补充卖点"],
    compositionRules: ["参考图是唯一可信视觉依据", "生成前保留商品身份、颜色、比例和关键细节"],
    safetyRules: ["不臆造认证、功效、品牌授权、销量排名或平台徽章"]
  }),
  strategy({
    id: "category-kit-general",
    categoryPath: ["通用"],
    categoryName: "通用商品",
    aliases: ["product", "item", "商品", "产品", "单品"],
    priority: 9000,
    visualStyle: ["清晰商品摄影", "中性背景", "适度生活化"],
    copyStyle: ["真实卖点优先", "信息层级清楚"],
    sellingPointLogic: ["主图识别", "卖点解释", "细节证明", "使用场景"]
  }),
  strategy({
    id: "category-kit-apparel",
    categoryPath: ["服饰"],
    categoryName: "服饰",
    aliases: ["apparel", "clothing", "fashion", "garment", "服装", "衣服", "穿搭"],
    priority: 200,
    visualStyle: ["自然穿搭", "面料质感", "尺码友好"],
    copyStyle: ["面料、版型、季节、场景分开表达"],
    sellingPointLogic: ["版型上身效果", "面料触感", "细节工艺", "穿搭场景"],
    imageRoles: [
      ...defaultImageRoles,
      {
        id: "model",
        label: "模特/上身图",
        description: "用于展示真实版型和穿着效果。",
        recommended: true,
        acceptedAssetRoles: ["model", "lifestyle"]
      }
    ]
  }),
  strategy({
    id: "category-kit-socks",
    categoryPath: ["服饰", "袜子"],
    categoryName: "袜子",
    aliases: ["socks", "sock", "stocking", "hosiery", "袜子", "长袜", "船袜", "丝袜"],
    priority: 120,
    visualStyle: ["脚部穿着效果", "织物纹理", "弹力与舒适感"],
    copyStyle: ["材质、厚薄、弹力、场景明确"],
    sellingPointLogic: ["穿着效果", "面料/厚薄", "防滑/透气等真实卖点", "多双/包装规格"]
  }),
  strategy({
    id: "category-kit-shoes",
    categoryPath: ["服饰", "鞋子"],
    categoryName: "鞋子",
    aliases: ["shoes", "sneakers", "boots", "sandals", "footwear", "鞋", "靴", "运动鞋", "凉鞋"],
    priority: 110,
    visualStyle: ["鞋型完整", "鞋底细节", "上脚/场景"],
    copyStyle: ["舒适、支撑、鞋面、鞋底信息按已知事实表达"],
    sellingPointLogic: ["外观主图", "鞋底/鞋面细节", "上脚比例", "使用场景"]
  }),
  strategy({
    id: "category-kit-tops",
    categoryPath: ["服饰", "上衣"],
    categoryName: "上衣",
    aliases: ["top", "shirt", "t-shirt", "hoodie", "sweater", "jacket", "上衣", "T恤", "衬衫", "卫衣", "外套"],
    priority: 130,
    visualStyle: ["正背面结构", "领口袖口细节", "上身版型"],
    copyStyle: ["版型、面料、适合季节和搭配场景"],
    sellingPointLogic: ["版型轮廓", "面料舒适", "工艺细节", "穿搭建议"]
  }),
  strategy({
    id: "category-kit-pants",
    categoryPath: ["服饰", "裤子"],
    categoryName: "裤子",
    aliases: ["pants", "trousers", "jeans", "leggings", "shorts", "裤子", "牛仔裤", "短裤", "打底裤"],
    priority: 130,
    visualStyle: ["腰部/裤脚细节", "腿型修饰", "穿着比例"],
    copyStyle: ["版型、弹力、腰型和真实尺码信息"],
    sellingPointLogic: ["整体版型", "腰部/口袋/裤脚细节", "弹力与面料", "场景搭配"]
  }),
  strategy({
    id: "category-kit-dress",
    categoryPath: ["服饰", "连衣裙"],
    categoryName: "连衣裙",
    aliases: ["dress", "gown", "one piece", "连衣裙", "裙子", "长裙", "短裙"],
    priority: 125,
    visualStyle: ["裙摆线条", "上身轮廓", "场景氛围但不失真"],
    copyStyle: ["版型、面料、场合、细节装饰"],
    sellingPointLogic: ["整体廓形", "领口/腰线/裙摆", "面料质感", "穿着场合"]
  }),
  strategy({
    id: "category-kit-bags",
    categoryPath: ["包袋"],
    categoryName: "包袋",
    aliases: ["bag", "handbag", "backpack", "tote", "wallet", "purse", "包", "包袋", "手提包", "双肩包", "钱包"],
    priority: 150,
    visualStyle: ["容量展示", "五金细节", "肩背/手提场景"],
    copyStyle: ["容量、材质、隔层、使用场景按真实信息表达"],
    sellingPointLogic: ["外观主图", "容量/隔层", "材质与五金", "通勤/旅行/搭配场景"],
    imageRoles: [
      ...defaultImageRoles,
      {
        id: "scale",
        label: "容量/比例图",
        description: "展示包袋大小、容量或上身比例。",
        recommended: true,
        acceptedAssetRoles: ["scale", "usage", "lifestyle"]
      }
    ]
  }),
  strategy({
    id: "category-kit-home",
    categoryPath: ["家居"],
    categoryName: "家居",
    aliases: ["home", "household", "furniture", "decor", "bedding", "kitchen", "家居", "家具", "收纳", "床品", "厨具"],
    priority: 300,
    visualStyle: ["真实居家环境", "尺寸关系", "材质细节"],
    copyStyle: ["功能、尺寸、材质、适用空间"],
    sellingPointLogic: ["空间搭配", "功能说明", "材质/结构", "尺寸和收纳能力"]
  }),
  strategy({
    id: "category-kit-small-appliances",
    categoryPath: ["家电", "小家电"],
    categoryName: "小家电",
    aliases: ["appliance", "small appliance", "electronics", "blender", "vacuum", "小家电", "电器", "榨汁机", "吸尘器", "空气炸锅"],
    priority: 310,
    visualStyle: ["功能演示", "结构/配件清楚", "厨房或居家场景"],
    copyStyle: ["功能、容量、档位、功率等必须来自已知信息"],
    sellingPointLogic: ["产品外观", "核心功能", "结构配件", "使用步骤/场景"],
    safetyRules: ["不写未提供的功率、容量、认证、安全等级或保修承诺"]
  }),
  strategy({
    id: "category-kit-food",
    categoryPath: ["食品"],
    categoryName: "食品",
    aliases: ["food", "snack", "drink", "beverage", "tea", "coffee", "食品", "零食", "饮料", "茶", "咖啡"],
    priority: 320,
    visualStyle: ["包装真实", "食欲感", "规格和口味清楚"],
    copyStyle: ["口味、规格、食用场景来自真实信息"],
    sellingPointLogic: ["包装/口味", "食用场景", "配料或规格", "礼盒/组合"],
    safetyRules: ["不夸大健康功效", "不臆造配料、产地、保质期、认证或营养数据"]
  })
];
