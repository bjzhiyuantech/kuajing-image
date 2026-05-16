import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import type {
  EcommerceCategoryKitAssetInput,
  EcommerceCategoryKitImageRole,
  EcommerceCategoryKitMissingInput,
  EcommerceCategoryKitPlanRequest,
  EcommerceCategoryKitPreparationResponse,
  EcommerceCategoryKitStrategy,
  EcommerceCategoryKitStrategyField,
  EcommerceMarket,
  EcommercePlatform,
  EcommerceProductBrief,
  ReferenceImageInput
} from "./contracts.js";
import { classifyCategoryKitCategory, type CategoryKitCategoryCandidate } from "./category-kit-planner.js";
import { db } from "./database.js";
import { ecommerceCategoryKitStrategies } from "./schema.js";
import { builtInCategoryKitStrategies } from "./category-kit-strategy-seeds.js";

export interface CategoryKitStrategyRecord extends EcommerceCategoryKitStrategy {
  createdAt: string;
  updatedAt: string;
}

export interface CategoryKitStrategyQuery {
  q?: string;
  platform?: EcommercePlatform;
  market?: EcommerceMarket;
  enabled?: boolean;
  categoryPath?: string[];
  limit?: number;
}

export type SaveCategoryKitStrategyInput = Omit<EcommerceCategoryKitStrategy, "id"> & {
  id?: string;
};

export class CategoryKitStrategyError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number
  ) {
    super(message);
  }
}

export async function listCategoryKitStrategies(query: CategoryKitStrategyQuery = {}): Promise<{ strategies: CategoryKitStrategyRecord[] }> {
  const rows = await db
    .select()
    .from(ecommerceCategoryKitStrategies)
    .orderBy(asc(ecommerceCategoryKitStrategies.priority), asc(ecommerceCategoryKitStrategies.categoryName));
  const normalizedQuery = normalizeStrategyQuery(query);
  const strategies = rows.map(toStrategyRecord).filter((strategy) => matchesQuery(strategy, normalizedQuery));
  const limited = typeof normalizedQuery.limit === "number" ? strategies.slice(0, normalizedQuery.limit) : strategies;
  return { strategies: limited };
}

export async function getCategoryKitStrategy(id: string): Promise<{ strategy: CategoryKitStrategyRecord }> {
  return { strategy: await getStrategyOrThrow(id) };
}

export async function createCategoryKitStrategy(input: SaveCategoryKitStrategyInput): Promise<{ strategy: CategoryKitStrategyRecord }> {
  const strategy = normalizeStrategy(input);
  const now = new Date().toISOString();
  await db.insert(ecommerceCategoryKitStrategies).values({
    ...toStrategyRowValues(strategy),
    createdAt: now,
    updatedAt: now
  });
  return getCategoryKitStrategy(strategy.id);
}

export async function updateCategoryKitStrategy(
  id: string,
  input: SaveCategoryKitStrategyInput
): Promise<{ strategy: CategoryKitStrategyRecord }> {
  const existing = await getStrategyOrThrow(id);
  const strategy = normalizeStrategy(
    {
      ...input,
      id,
      source: input.source ?? existing.source,
      version: input.version ?? existing.version
    },
    existing
  );
  await db
    .update(ecommerceCategoryKitStrategies)
    .set({
      ...toStrategyRowValues(strategy),
      updatedAt: new Date().toISOString()
    })
    .where(eq(ecommerceCategoryKitStrategies.id, id));
  return getCategoryKitStrategy(id);
}

export async function deleteCategoryKitStrategy(id: string): Promise<{ ok: true }> {
  const existing = await getStrategyOrThrow(id);
  if (existing.source === "built-in") {
    throw new CategoryKitStrategyError("protected_strategy", "内置策略不能删除，可以通过禁用或调整优先级控制匹配。", 409);
  }
  await db.delete(ecommerceCategoryKitStrategies).where(eq(ecommerceCategoryKitStrategies.id, id));
  return { ok: true };
}

export async function prepareCategoryKitPlanRequest(
  input: EcommerceCategoryKitPlanRequest
): Promise<EcommerceCategoryKitPreparationResponse> {
  const explicitStrategy = input.strategy ? normalizeStrategy(input.strategy) : undefined;
  const strategy = explicitStrategy ?? (await classifyAndMatchCategoryKitStrategy(input)) ?? (await matchCategoryKitStrategy(input));
  const categoryPath = normalizeCategoryPath(input.categoryPath).length
    ? normalizeCategoryPath(input.categoryPath)
    : strategy?.categoryPath ?? ["通用"];
  const categoryName = strategy?.categoryName ?? categoryPath.at(-1) ?? "通用";
  const assets = completeAssets(input.assets, input.referenceImage, input.product);
  const missingInputs = mergeMissingInputs(input.missingInputs, detectMissingInputs(strategy, input.product, assets));
  const warnings = strategy?.id === "category-kit-fallback" ? ["未从商品文本中匹配到明确类目，已使用兜底策略。"] : undefined;

  return {
    prepared: true,
    productSummary: productSummary(input.product, categoryName),
    categoryPath,
    categoryName,
    strategy,
    assets,
    missingInputs,
    imageRoles: strategy?.imageRoles,
    outputScenes: strategy?.outputScenes,
    warnings,
    notes: missingInputs.length
      ? "存在缺失素材或字段，后续规划只能使用已提供信息，不能补写未知参数。"
      : "已基于可用商品信息和参考图完成策略匹配。"
  };
}

async function matchCategoryKitStrategy(input: EcommerceCategoryKitPlanRequest): Promise<EcommerceCategoryKitStrategy | undefined> {
  const { strategies } = await listCategoryKitStrategies({
    platform: input.platform,
    market: input.market,
    enabled: true
  });
  if (strategies.length === 0) {
    return fallbackBuiltInStrategy();
  }

  const explicitPath = normalizeCategoryPath(input.categoryPath);
  const searchableText = productSearchText(input.product);
  let best: { strategy: EcommerceCategoryKitStrategy; score: number } | undefined;

  for (const strategy of strategies) {
    let score = compatibilityScore(strategy, input.platform, input.market);
    if (score < 0) {
      continue;
    }

    const matchScore =
      explicitPath.length > 0
        ? categoryPathScore(strategy.categoryPath, explicitPath)
        : keywordScore(strategy, searchableText);
    if (strategy.id === "category-kit-fallback") {
      continue;
    }
    if (matchScore <= 0) {
      continue;
    }
    score += matchScore;

    if (!best || score > best.score || (score === best.score && (strategy.priority ?? 0) < (best.strategy.priority ?? 0))) {
      best = { strategy, score };
    }
  }

  if (best && best.score > 0) {
    return best.strategy;
  }

  return strategies.find((strategy) => strategy.id === "category-kit-fallback") ?? fallbackBuiltInStrategy();
}

async function classifyAndMatchCategoryKitStrategy(input: EcommerceCategoryKitPlanRequest): Promise<EcommerceCategoryKitStrategy | undefined> {
  if (normalizeCategoryPath(input.categoryPath).length > 0 || input.strategyId || input.strategy) {
    return undefined;
  }
  const { strategies } = await listCategoryKitStrategies({
    platform: input.platform,
    market: input.market,
    enabled: true,
    limit: 80
  });
  const candidates: CategoryKitCategoryCandidate[] = strategies.map((strategy) => ({
    id: strategy.id,
    categoryPath: strategy.categoryPath,
    categoryName: strategy.categoryName,
    aliases: strategy.aliases
  }));
  const classified = await classifyCategoryKitCategory({
    product: input.product,
    platform: input.platform,
    market: input.market,
    textLanguage: input.textLanguage,
    referenceImage: input.referenceImage,
    candidates
  }).catch((error) => {
    console.warn(
      `[category-kit-strategy] category classification skipped ${JSON.stringify({
        message: error instanceof Error ? error.message : String(error)
      })}`
    );
    return undefined;
  });
  const strategyById = classified?.strategyId ? strategies.find((strategy) => strategy.id === classified.strategyId) : undefined;
  if (strategyById) {
    return strategyById;
  }
  const categoryPath = normalizeCategoryPath(classified?.categoryPath);
  if (categoryPath.length > 0) {
    return strategies.find((strategy) => categoryPathScore(strategy.categoryPath, categoryPath) > 0);
  }
  return undefined;
}

async function getStrategyOrThrow(id: string): Promise<CategoryKitStrategyRecord> {
  const [row] = await db
    .select()
    .from(ecommerceCategoryKitStrategies)
    .where(eq(ecommerceCategoryKitStrategies.id, normalizeId(id)))
    .limit(1);
  if (!row) {
    throw new CategoryKitStrategyError("not_found", "品类套图策略不存在。", 404);
  }
  return toStrategyRecord(row);
}

function normalizeStrategy(input: SaveCategoryKitStrategyInput, existing?: EcommerceCategoryKitStrategy): EcommerceCategoryKitStrategy {
  const id = normalizeId(input.id) || existing?.id || randomUUID();
  const categoryPath = normalizeCategoryPath(input.categoryPath);
  if (categoryPath.length === 0) {
    throw new CategoryKitStrategyError("invalid_strategy", "categoryPath 至少需要一个类目层级。", 400);
  }
  const categoryName = normalizeText(input.categoryName) || categoryPath.at(-1);
  if (!categoryName) {
    throw new CategoryKitStrategyError("invalid_strategy", "categoryName 不能为空。", 400);
  }

  return {
    ...input,
    id,
    categoryPath,
    categoryName,
    aliases: normalizeStringArray(input.aliases),
    platform: normalizeText(input.platform) as EcommercePlatform | undefined,
    market: normalizeText(input.market) as EcommerceMarket | undefined,
    enabled: input.enabled !== false,
    priority: normalizeInteger(input.priority, existing?.priority ?? 1000),
    version: normalizeText(input.version) ?? existing?.version,
    source: normalizeText(input.source) ?? existing?.source ?? "manual",
    visualStyle: normalizeStringArray(input.visualStyle),
    copyStyle: normalizeStringArray(input.copyStyle),
    sellingPointLogic: normalizeStringArray(input.sellingPointLogic),
    compositionRules: normalizeStringArray(input.compositionRules),
    safetyRules: normalizeStringArray(input.safetyRules),
    requiredFields: normalizeFields(input.requiredFields),
    recommendedFields: normalizeFields(input.recommendedFields),
    imageRoles: normalizeImageRoles(input.imageRoles),
    outputScenes: Array.isArray(input.outputScenes) ? input.outputScenes : undefined,
    fallbackRules: Array.isArray(input.fallbackRules) ? input.fallbackRules : undefined,
    examples: Array.isArray(input.examples) ? input.examples : undefined
  };
}

function toStrategyRowValues(strategy: EcommerceCategoryKitStrategy): Omit<
  typeof ecommerceCategoryKitStrategies.$inferInsert,
  "createdAt" | "updatedAt"
> {
  return {
    id: strategy.id,
    categoryPathKey: categoryPathKey(strategy.categoryPath),
    categoryPathJson: JSON.stringify(strategy.categoryPath),
    categoryName: strategy.categoryName,
    platform: strategy.platform ?? null,
    market: strategy.market ?? null,
    enabled: strategy.enabled === false ? 0 : 1,
    priority: strategy.priority ?? 0,
    source: String(strategy.source ?? "manual").slice(0, 64),
    version: strategy.version ?? null,
    searchText: strategySearchText(strategy),
    strategyJson: JSON.stringify(strategy)
  };
}

function toStrategyRecord(row: typeof ecommerceCategoryKitStrategies.$inferSelect): CategoryKitStrategyRecord {
  const parsed = parseStrategyJson(row.strategyJson);
  return {
    ...parsed,
    id: row.id,
    categoryPath: normalizeCategoryPath(parsed.categoryPath).length
      ? normalizeCategoryPath(parsed.categoryPath)
      : parseJsonArray(row.categoryPathJson),
    categoryName: row.categoryName || parsed.categoryName || row.id,
    platform: (row.platform ?? parsed.platform) as EcommercePlatform | undefined,
    market: (row.market ?? parsed.market) as EcommerceMarket | undefined,
    enabled: row.enabled === 1,
    priority: Number(row.priority ?? parsed.priority ?? 0),
    source: row.source || parsed.source || "manual",
    version: row.version ?? parsed.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function parseStrategyJson(value: string): EcommerceCategoryKitStrategy {
  try {
    const parsed = JSON.parse(value) as Partial<EcommerceCategoryKitStrategy>;
    return normalizeStrategy({
      ...parsed,
      id: parsed.id,
      categoryPath: Array.isArray(parsed.categoryPath) ? parsed.categoryPath : ["通用"],
      categoryName: typeof parsed.categoryName === "string" ? parsed.categoryName : "通用"
    });
  } catch {
    return normalizeStrategy({
      categoryPath: ["通用"],
      categoryName: "通用"
    });
  }
}

function matchesQuery(strategy: CategoryKitStrategyRecord, query: Required<Pick<CategoryKitStrategyQuery, "categoryPath">> & CategoryKitStrategyQuery): boolean {
  if (typeof query.enabled === "boolean" && strategy.enabled !== query.enabled) {
    return false;
  }
  if (query.platform && strategy.platform && strategy.platform !== query.platform) {
    return false;
  }
  if (query.market && strategy.market && strategy.market !== query.market) {
    return false;
  }
  if (query.categoryPath.length > 0 && categoryPathScore(strategy.categoryPath, query.categoryPath) <= 0) {
    return false;
  }
  if (query.q) {
    const needle = normalizeSearchText(query.q);
    return strategySearchText(strategy).includes(needle);
  }
  return true;
}

function normalizeStrategyQuery(query: CategoryKitStrategyQuery): Required<Pick<CategoryKitStrategyQuery, "categoryPath">> & CategoryKitStrategyQuery {
  return {
    ...query,
    q: normalizeText(query.q),
    categoryPath: normalizeCategoryPath(query.categoryPath),
    limit: typeof query.limit === "number" ? Math.max(1, Math.min(query.limit, 500)) : undefined
  };
}

function completeAssets(
  assets: EcommerceCategoryKitAssetInput[] | undefined,
  referenceImage: ReferenceImageInput,
  product: EcommerceProductBrief
): EcommerceCategoryKitAssetInput[] {
  const existing = Array.isArray(assets) ? assets.filter((asset) => normalizeText(asset.role)) : [];
  const hasMainReference = existing.some((asset) => asset.role === "main-product" && (asset.referenceImage || asset.referenceAssetId || asset.url));
  if (hasMainReference) {
    return existing;
  }
  return [
    {
      id: "reference-main-product",
      role: "main-product",
      referenceImage,
      fileName: referenceImage.fileName,
      title: meaningfulTitle(product.title),
      description: normalizeText(product.description),
      required: true
    },
    ...existing
  ];
}

function detectMissingInputs(
  strategy: EcommerceCategoryKitStrategy | undefined,
  product: EcommerceProductBrief,
  assets: EcommerceCategoryKitAssetInput[]
): EcommerceCategoryKitMissingInput[] {
  if (!strategy) {
    return [];
  }
  const missing: EcommerceCategoryKitMissingInput[] = [];
  for (const field of strategy.requiredFields ?? []) {
    if (!hasProductField(product, field.id)) {
      missing.push(fieldMissingInput(field, true));
    }
  }
  for (const field of strategy.recommendedFields ?? []) {
    if (!hasProductField(product, field.id)) {
      missing.push(fieldMissingInput(field, false));
    }
  }
  for (const role of strategy.imageRoles ?? []) {
    if (!role.required && !role.recommended) {
      continue;
    }
    const minCount = Math.max(role.required ? 1 : 0, role.minCount ?? 0);
    if (minCount <= 0 && !role.recommended) {
      continue;
    }
    if (assetRoleCount(assets, role) < Math.max(1, minCount)) {
      missing.push(roleMissingInput(role));
    }
  }
  return dedupeMissingInputs(missing);
}

function fieldMissingInput(field: EcommerceCategoryKitStrategyField, required: boolean): EcommerceCategoryKitMissingInput {
  return {
    id: `field:${field.id}`,
    label: field.label ?? field.id,
    description: field.description,
    required,
    recommended: !required,
    examples: field.examples
  };
}

function roleMissingInput(role: EcommerceCategoryKitImageRole): EcommerceCategoryKitMissingInput {
  return {
    id: `asset:${role.id}`,
    label: role.label ?? role.id,
    description: role.description,
    role: role.acceptedAssetRoles?.[0] ?? role.id,
    required: role.required === true,
    recommended: role.required !== true,
    examples: role.examples
  };
}

function mergeMissingInputs(
  provided: EcommerceCategoryKitMissingInput[] | undefined,
  detected: EcommerceCategoryKitMissingInput[]
): EcommerceCategoryKitMissingInput[] {
  return dedupeMissingInputs([...(Array.isArray(provided) ? provided : []), ...detected]);
}

function dedupeMissingInputs(items: EcommerceCategoryKitMissingInput[]): EcommerceCategoryKitMissingInput[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const id = normalizeText(item.id) ?? normalizeText(item.label) ?? randomUUID();
    if (seen.has(id)) {
      return false;
    }
    seen.add(id);
    return Boolean(normalizeText(item.id));
  });
}

function assetRoleCount(assets: EcommerceCategoryKitAssetInput[], imageRole: EcommerceCategoryKitImageRole): number {
  const accepted = new Set([imageRole.id, ...(imageRole.acceptedAssetRoles ?? [])].map((role) => role.toLowerCase()));
  return assets.filter((asset) => accepted.has(String(asset.role).toLowerCase())).length;
}

function hasProductField(product: EcommerceProductBrief, fieldId: string): boolean {
  const field = fieldId.toLowerCase();
  if (field === "description" || field === "selling_points" || field === "selling-points") {
    return Boolean(normalizeText(product.description) || product.bulletPoints?.some((item) => normalizeText(item)));
  }
  if (field === "material" || field === "fabric" || field === "ingredient" || field === "ingredients") {
    return Boolean(normalizeText(product.material));
  }
  if (field === "color" || field === "sku") {
    return Boolean(normalizeText(product.color));
  }
  if (field === "target_customer" || field === "target-customer" || field === "audience") {
    return Boolean(normalizeText(product.targetCustomer));
  }
  if (field === "usage_scene" || field === "usage-scene" || field === "usage") {
    return Boolean(normalizeText(product.usageScene));
  }
  if (field === "brand_tone" || field === "brand-tone") {
    return Boolean(normalizeText(product.brandTone));
  }
  if (field === "size" || field === "dimension" || field === "spec") {
    return sizeLikeText(productText(product));
  }
  return productText(product).includes(fieldId);
}

function compatibilityScore(strategy: EcommerceCategoryKitStrategy, platform: EcommercePlatform, market: EcommerceMarket): number {
  if (strategy.platform && strategy.platform !== platform) {
    return -1;
  }
  if (strategy.market && strategy.market !== market) {
    return -1;
  }
  return (strategy.platform ? 20 : 2) + (strategy.market ? 20 : 2);
}

function categoryPathScore(strategyPath: string[], queryPath: string[]): number {
  const left = normalizeCategoryPath(strategyPath);
  const right = normalizeCategoryPath(queryPath);
  if (left.length === 0 || right.length === 0) {
    return 0;
  }
  const matches = right.every((part, index) => normalizeSearchText(left[index] ?? "") === normalizeSearchText(part));
  if (matches) {
    return 1000 + left.length * 10;
  }
  const reverseMatches = left.every((part, index) => normalizeSearchText(right[index] ?? "") === normalizeSearchText(part));
  return reverseMatches ? 500 + left.length * 10 : 0;
}

function keywordScore(strategy: EcommerceCategoryKitStrategy, searchableText: string): number {
  if (!searchableText) {
    return 0;
  }
  let score = 0;
  for (const term of [strategy.categoryName, ...strategy.categoryPath, ...(strategy.aliases ?? [])]) {
    const normalized = normalizeSearchText(term);
    if (normalized && searchableText.includes(normalized)) {
      score += normalized === normalizeSearchText(strategy.categoryName) ? 80 : 30;
    }
  }
  return score + Math.max(0, 1000 - (strategy.priority ?? 1000)) / 1000;
}

function productSummary(product: EcommerceProductBrief, categoryName: string): string {
  const title = meaningfulTitle(product.title);
  const parts = [categoryName, title, normalizeText(product.description)].filter(Boolean);
  return parts.length ? parts.join(" / ") : categoryName;
}

function productSearchText(product: EcommerceProductBrief): string {
  return normalizeSearchText(
    [
      meaningfulTitle(product.title),
      product.description,
      ...(product.bulletPoints ?? []),
      product.targetCustomer,
      product.usageScene,
      product.material,
      product.color,
      product.brandTone
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function productText(product: EcommerceProductBrief): string {
  return [
    meaningfulTitle(product.title),
    product.description,
    ...(product.bulletPoints ?? []),
    product.targetCustomer,
    product.usageScene,
    product.material,
    product.color,
    product.brandTone
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function meaningfulTitle(title: string | undefined): string | undefined {
  const text = normalizeText(title);
  if (!text) {
    return undefined;
  }
  if (/^(ai\s*)?自拆品类套图$/iu.test(text) || /^商品$/u.test(text) || /^产品$/u.test(text)) {
    return undefined;
  }
  return text;
}

function sizeLikeText(text: string): boolean {
  return /(\d+(\.\d+)?\s?(cm|mm|m|in|inch|英寸|厘米|毫米|ml|l|g|kg|oz|lb|码|号)|\b(xs|s|m|l|xl|xxl|xxxl)\b)/iu.test(text);
}

function normalizeFields(fields: EcommerceCategoryKitStrategyField[] | undefined): EcommerceCategoryKitStrategyField[] | undefined {
  if (!Array.isArray(fields)) {
    return undefined;
  }
  return fields.flatMap((field) => {
    const id = normalizeId(field.id);
    return id
      ? [
          {
            ...field,
            id,
            label: normalizeText(field.label),
            description: normalizeText(field.description),
            aliases: normalizeStringArray(field.aliases),
            examples: normalizeStringArray(field.examples)
          }
        ]
      : [];
  });
}

function normalizeImageRoles(roles: EcommerceCategoryKitImageRole[] | undefined): EcommerceCategoryKitImageRole[] | undefined {
  if (!Array.isArray(roles)) {
    return undefined;
  }
  return roles.flatMap((role) => {
    const id = normalizeId(role.id);
    return id
      ? [
          {
            ...role,
            id,
            label: normalizeText(role.label),
            description: normalizeText(role.description),
            minCount: normalizeOptionalInteger(role.minCount),
            maxCount: normalizeOptionalInteger(role.maxCount)
          }
        ]
      : [];
  });
}

function strategySearchText(strategy: EcommerceCategoryKitStrategy): string {
  return normalizeSearchText(
    [
      strategy.id,
      strategy.categoryName,
      ...strategy.categoryPath,
      ...(strategy.aliases ?? []),
      ...(strategy.visualStyle ?? []),
      ...(strategy.copyStyle ?? []),
      ...(strategy.sellingPointLogic ?? []),
      ...(strategy.compositionRules ?? []),
      ...(strategy.safetyRules ?? [])
    ].join(" ")
  );
}

function fallbackBuiltInStrategy(): EcommerceCategoryKitStrategy {
  return builtInCategoryKitStrategies.find((strategy) => strategy.id === "category-kit-fallback") ?? builtInCategoryKitStrategies[0]!;
}

function parseJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return normalizeCategoryPath(Array.isArray(parsed) ? parsed : []);
  } catch {
    return [];
  }
}

function categoryPathKey(categoryPath: string[]): string {
  return normalizeCategoryPath(categoryPath).join("/");
}

function normalizeCategoryPath(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const text = normalizeText(item);
    return text ? [text.slice(0, 80)] : [];
  }).slice(0, 8);
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items = value.flatMap((item) => {
    const text = normalizeText(item);
    return text ? [text] : [];
  });
  return items.length ? items : undefined;
}

function normalizeText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeId(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 64) : "";
}

function normalizeInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) ? value : fallback;
}

function normalizeOptionalInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}
